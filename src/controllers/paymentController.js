// Payment Controller with Razorpay integration
const razorpay = require('../config/razorpay');
const crypto = require('crypto');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Organization = require('../models/Organization');
const Payment = require('../models/Payment');

// Create Razorpay order for subscription
const createOrder = async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id; // The protect middleware sets req.user for all user types

    // Fetch plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Create Razorpay order
    const orderOptions = {
      amount: plan.price, // Amount in paise (your seed data is already in paise)
      currency: plan.currency || 'INR',
      receipt: `rcpt_${Date.now().toString().slice(-10)}`, // Keep within 40 chars limit
      payment_capture: 1,
      notes: {
        planId: planId,
        userId: userId,
        planName: plan.displayName
      }
    };

    const order = await razorpay.orders.create(orderOptions);

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        planName: plan.displayName,
        planPrice: plan.price
      },
      key: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order'
    });
  }
};

// Verify payment and create subscription
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      planId
    } = req.body;

    const userId = req.user.id; // The protect middleware sets req.user for all user types

    console.log('💳 Verifying payment:', {
      razorpay_payment_id,
      razorpay_order_id,
      planId,
      userId
    });

    // Verify payment signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      console.log('❌ Payment signature verification failed');
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
    console.log('✅ Payment signature verified');

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    console.log('📄 Payment details from Razorpay:', {
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method
    });
    
    if (payment.status !== 'captured') {
      console.log('❌ Payment not captured, status:', payment.status);
      return res.status(400).json({
        success: false,
        message: 'Payment not captured'
      });
    }

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    // Get user/admin and organization
    let userOrAdmin;
    
    // Check if the user is an admin by looking at userType or trying Admin model first
    if (req.user.userType === 'admin' || req.user.role === 'owner') {
      userOrAdmin = await Admin.findById(userId).populate('organization');
    }
    
    // If not found as admin, try as regular user
    if (!userOrAdmin) {
      userOrAdmin = await User.findById(userId).populate('organization');
    }
    
    if (!userOrAdmin || !userOrAdmin.organization) {
      return res.status(404).json({
        success: false,
        message: 'User or organization not found'
      });
    }

    const isAdmin = req.user.userType === 'admin' || req.user.role === 'owner';
    
    // Check if there's an existing trial or pending subscription
    let subscription = await Subscription.findOne({
      userId: userId,
      planId: planId,
      status: { $in: ['trial', 'pending'] }
    }).sort({ createdAt: -1 });

    if (subscription) {
      // Update existing subscription to active with payment info
      console.log('📝 Updating existing subscription to active:', subscription._id);
      subscription.paymentId = razorpay_payment_id;
      subscription.orderId = razorpay_order_id;
      subscription.amount = payment.amount / 100; // Convert paise to rupees
      subscription.currency = payment.currency;
      subscription.status = 'active';
      subscription.startDate = new Date();
      subscription.endDate = new Date(Date.now() + (plan.interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000);
      await subscription.save();
    } else {
      // Create new subscription if no trial exists
      console.log('📝 Creating new active subscription');
      subscription = new Subscription({
        userId: userId,
        userModel: isAdmin ? 'Admin' : 'User',
        organization: userOrAdmin.organization._id,
        planId: planId,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + (plan.interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000)
      });
      await subscription.save();
    }

    // Create payment record
    console.log('💰 Creating payment record');
    const paymentRecord = new Payment({
      organization: userOrAdmin.organization._id,
      subscription: subscription._id,
      amount: payment.amount, // Store in paise
      currency: payment.currency,
      status: 'success',
      paymentMethod: payment.method || 'card',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });

    await paymentRecord.save();
    console.log('✅ Payment record created:', paymentRecord._id);

    // Update organization's subscription
    await Organization.findByIdAndUpdate(userOrAdmin.organization._id, {
      subscription: subscription._id
    });
    console.log('✅ Organization subscription updated');

    res.json({
      success: true,
      message: 'Payment verified and subscription activated',
      subscription: {
        id: subscription._id,
        planName: plan.displayName,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate
      },
      payment: {
        id: paymentRecord._id,
        amount: paymentRecord.amount,
        currency: paymentRecord.currency,
        status: paymentRecord.status
      }
    });

  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      razorpay_payment_id,
      razorpay_order_id,
      planId
    });
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

// Get subscription status
const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id; // The protect middleware sets req.user for all user types

    const subscription = await Subscription.findOne({ 
      userId: userId, 
      status: 'active' 
    }).populate('planId');

    if (!subscription) {
      return res.json({
        success: true,
        subscription: null,
        message: 'No active subscription found'
      });
    }

    res.json({
      success: true,
      subscription: {
        id: subscription._id,
        plan: subscription.planId,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        amount: subscription.amount,
        currency: subscription.currency
      }
    });

  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription status'
    });
  }
};

// Cancel subscription
const cancelSubscription = async (req, res) => {
  try {
    const userId = req.admin?.id || req.user?.id; // Support both admin and user auth

    const subscription = await Subscription.findOne({
      userId: userId,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Update subscription status
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    await subscription.save();

    // Update user's subscription status
    await User.findByIdAndUpdate(userId, {
      subscriptionStatus: 'cancelled'
    });

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
};

// Webhook handler for Razorpay events
const handleWebhook = async (req, res) => {
  try {
    console.log('Payment webhook received:', JSON.stringify(req.body, null, 2))
    
    const webhookSignature = req.get('X-Razorpay-Signature');
    const webhookBody = JSON.stringify(req.body);

    // Skip signature verification if webhook secret is not set (for testing)
    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(webhookBody)
        .digest('hex');

      if (webhookSignature !== expectedSignature) {
        console.log('Webhook signature verification failed')
        return res.status(400).json({
          success: false,
          message: 'Webhook signature verification failed'
        });
      }
    }

    const event = req.body.event;
    console.log('Processing payment webhook event:', event)

    // Handle payment link events for invoices
    if (event === 'payment_link.paid') {
      const paymentLinkEntity = req.body.payload.payment_link.entity;
      const referenceId = paymentLinkEntity.reference_id;
      
      console.log('Payment link paid, reference ID:', referenceId)
      
      if (referenceId) {
        // Extract invoice ID from reference_id
        let invoiceId = referenceId
        
        // If reference_id contains underscore, extract the invoice ID part
        if (referenceId.includes('_')) {
          const parts = referenceId.split('_')
          if (parts[0] === 'inv' && parts.length >= 2) {
            invoiceId = parts[1] // Extract from "inv_<invoiceId>_<random>"
          } else if (parts.length >= 2) {
            invoiceId = parts[0] // Extract from "<invoiceId>_<timestamp>"
          }
        }

        console.log('Extracted invoice ID:', invoiceId)

        // Import Invoice model dynamically to avoid circular dependency
        const Invoice = require('../models/Invoice')
        const { generateInvoicePdfBuffer } = require('../utils/pdf')
        const { sendInvoiceEmail } = require('../utils/mailer')
        const inventoryService = require('../services/inventoryService')

        const invoice = await Invoice.findById(invoiceId)
          .populate('organization', 'name legalName address street city state zipCode postalCode country phone email')
          .populate({
            path: 'organization',
            populate: {
              path: 'owner',
              select: 'fullName'
            }
          })
        if (invoice && invoice.status !== 'paid') {
          console.log(`Updating invoice ${invoice.invoiceNumber} to paid status`)
          
          invoice.status = 'paid'
          invoice.paidAt = new Date()
          invoice.paymentDate = new Date()
          invoice.paymentMethod = 'razorpay'
          invoice.paymentReference = paymentLinkEntity.id
          await invoice.save()

          // Send payment confirmation email with PDF
          try {
            const pdfBuffer = await generateInvoicePdfBuffer(invoice)
            await sendInvoiceEmail({
              to: invoice.client.email,
              invoice: invoice,
              pdfBuffer: pdfBuffer
            })
            console.log(`Payment confirmation email sent for invoice ${invoice.invoiceNumber}`)
          } catch (emailError) {
            console.warn('Failed to send payment confirmation email:', emailError.message)
          }

          // Fulfill stock for products
          try {
            await inventoryService.fulfillStockForInvoice(invoice._id, invoice.createdBy)
            invoice.stockFulfilled = true
            invoice.stockFulfilledAt = new Date()
            await invoice.save()
          } catch (stockError) {
            console.warn('Stock fulfillment failed:', stockError.message)
          }

          console.log(`Invoice ${invoice.invoiceNumber} successfully marked as paid`)
        } else if (invoice) {
          console.log(`Invoice ${invoice.invoiceNumber} already marked as paid`)
        } else {
          console.log(`Invoice not found for ID: ${invoiceId}`)
        }
      }
    }

    // Handle other payment events
    const paymentEntity = req.body.payload?.payment?.entity;
    if (paymentEntity) {
      switch (event) {
        case 'payment.captured':
          console.log('Payment captured:', paymentEntity.id);
          // Handle successful payment
          break;

        case 'payment.failed':
          console.log('Payment failed:', paymentEntity.id);
          // Handle failed payment
          break;

        default:
          console.log('Unhandled payment event:', event);
      }
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getSubscriptionStatus,
  cancelSubscription,
  handleWebhook,
  // Test endpoint to manually trigger webhook (for testing)
  testWebhook: async (req, res) => {
    try {
      const { invoiceId } = req.body;
      if (!invoiceId) {
        return res.status(400).json({ success: false, message: 'Invoice ID required' });
      }

      // Create a mock webhook payload
      const mockWebhookPayload = {
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: `test_${Date.now()}`,
              reference_id: invoiceId,
              status: 'paid'
            }
          }
        }
      };

      // Create a mock request object
      const mockReq = {
        body: mockWebhookPayload,
        get: () => null // Skip signature verification
      };

      const mockRes = {
        json: (data) => res.json({ ...data, message: 'Test webhook processed successfully' }),
        status: (code) => ({ json: (data) => res.status(code).json(data) })
      };

      await handleWebhook(mockReq, mockRes);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};