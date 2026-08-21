// Subscription Controller
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Organization = require('../models/Organization');

// Get current subscription for an organization
const getCurrentSubscription = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user || !user.organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    // Find active or trial subscription for the organization (sorted by most recent)
    const subscription = await Subscription.findOne({
      organization: user.organization._id,
      status: { $in: ['active', 'trial'] }
    })
    .sort({ updatedAt: -1 }) // Get the most recently updated subscription
    .populate('planId');

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found',
        organization: {
          id: user.organization._id,
          name: user.organization.name,
          hasActiveSubscription: false
        }
      });
    }

    res.json({
      success: true,
      subscription: {
        id: subscription._id,
        planName: subscription.planId.name,
        planDisplayName: subscription.planId.displayName,
        price: subscription.planId.price,
        currency: subscription.planId.currency,
        interval: subscription.planId.interval,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        nextBillingDate: subscription.nextBillingDate,
        features: subscription.planId.features,
        limits: subscription.planId.limits,
        organization: {
          id: user.organization._id,
          name: user.organization.name
        }
      }
    });

  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription details'
    });
  }
};

// Get payment history for an organization
const getPaymentHistory = async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, limit = 10 } = req.query;
    
    if (!user || !user.organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    // Get payment history with pagination
    const payments = await Payment.find({
      organization: user.organization._id
    })
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate({
      path: 'subscription',
      populate: {
        path: 'planId',
        model: 'Plan'
      }
    });

    const totalPayments = await Payment.countDocuments({
      organization: user.organization._id
    });

    const paymentHistory = payments.map(payment => ({
      id: payment._id,
      amount: payment.amount / 100, // Convert paise to rupees for display
      currency: payment.currency,
      status: payment.status,
      date: payment.createdAt,
      paymentMethod: payment.paymentMethod || 'card',
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      planName: payment.subscription?.planId?.displayName || 'Unknown Plan'
    }));

    res.json({
      success: true,
      payments: paymentHistory,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPayments / limit),
        totalPayments,
        hasNext: page * limit < totalPayments,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
};

// Cancel subscription
const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find user and their organization
    const user = await User.findById(userId).populate('organization');
    if (!user || !user.organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    // Find and update active subscription
    const subscription = await Subscription.findOneAndUpdate(
      {
        organization: user.organization._id,
        status: 'active'
      },
      {
        status: 'cancelled',
        cancelledAt: new Date()
      },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found to cancel'
      });
    }

    // TODO: Cancel subscription in Razorpay if it's a recurring subscription
    // await razorpay.subscriptions.cancel(subscription.razorpaySubscriptionId);

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      subscription: {
        id: subscription._id,
        status: subscription.status,
        cancelledAt: subscription.cancelledAt
      }
    });

  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
};

// Get subscription usage/analytics
const getSubscriptionUsage = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user || !user.organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    const orgId = user.organization._id;

    // Get current counts
    const Employee = require('../models/Employee');
    const Invoice = require('../models/Invoice');

    const [employeeCount, invoiceCount] = await Promise.all([
      Employee.countDocuments({ organization: orgId }),
      Invoice.countDocuments({ organization: orgId })
    ]);

    // Get subscription limits
    const subscription = await Subscription.findOne({
      organization: orgId,
      status: 'active'
    }).populate('planId');

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const usage = {
      employees: {
        used: employeeCount,
        limit: subscription.planId.limits.employees,
        percentage: subscription.planId.limits.employees > 0 
          ? Math.round((employeeCount / subscription.planId.limits.employees) * 100) 
          : 0
      },
      invoices: {
        used: invoiceCount,
        limit: subscription.planId.limits.invoices,
        percentage: subscription.planId.limits.invoices > 0 
          ? Math.round((invoiceCount / subscription.planId.limits.invoices) * 100) 
          : 0
      }
    };

    res.json({
      success: true,
      usage
    });

  } catch (error) {
    console.error('Error fetching subscription usage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription usage'
    });
  }
};

// Debug: Get all subscriptions for an organization
const getAllSubscriptions = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user || !user.organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    const subscriptions = await Subscription.find({
      organization: user.organization._id
    })
    .populate('planId')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: subscriptions.length,
      subscriptions: subscriptions.map(sub => ({
        id: sub._id,
        status: sub.status,
        planName: sub.planId?.displayName || 'Unknown',
        amount: sub.amount,
        currency: sub.currency,
        startDate: sub.startDate,
        endDate: sub.endDate,
        paymentId: sub.paymentId,
        orderId: sub.orderId,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt
      }))
    });

  } catch (error) {
    console.error('Error fetching all subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscriptions'
    });
  }
};

module.exports = {
  getCurrentSubscription,
  getPaymentHistory,
  cancelSubscription,
  getSubscriptionUsage,
  getAllSubscriptions
};
