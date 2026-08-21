// services/paymentService.js
const razorpay = require('../config/razorpay');
const crypto = require('crypto');

class PaymentService {
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    try {
      const orderOptions = {
        amount: amount * 100, // Amount in paise
        currency,
        receipt,
        payment_capture: 1,
        notes
      };

      const order = await razorpay.orders.create(orderOptions);
      return order;
    } catch (error) {
      throw new Error(`Failed to create Razorpay order: ${error.message}`);
    }
  }

  async verifyPaymentSignature({ paymentId, orderId, signature }) {
    try {
      const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
      hmac.update(`${orderId}|${paymentId}`);
      const generated_signature = hmac.digest('hex');

      return generated_signature === signature;
    } catch (error) {
      throw new Error(`Failed to verify payment signature: ${error.message}`);
    }
  }

  async getPayment(paymentId) {
    try {
      const payment = await razorpay.payments.fetch(paymentId);
      return payment;
    } catch (error) {
      throw new Error(`Failed to retrieve payment: ${error.message}`);
    }
  }

  async getOrder(orderId) {
    try {
      const order = await razorpay.orders.fetch(orderId);
      return order;
    } catch (error) {
      throw new Error(`Failed to retrieve order: ${error.message}`);
    }
  }

  async createRefund({ paymentId, amount, reason = 'Refund requested' }) {
    try {
      const refundOptions = {
        payment_id: paymentId,
        amount: amount * 100, // Amount in paise
        reason
      };

      const refund = await razorpay.payments.refund(paymentId, refundOptions);
      return refund;
    } catch (error) {
      throw new Error(`Failed to create refund: ${error.message}`);
    }
  }

  async validateWebhookSignature(body, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      throw new Error(`Failed to validate webhook signature: ${error.message}`);
    }
  }

  // Helper method to format amount for display
  formatAmount(amount, currency = 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0
    }).format(amount);
  }

  // Helper method to convert amount to paise
  toPaise(amount) {
    return Math.round(amount * 100);
  }

  // Helper method to convert paise to rupees
  toRupees(paise) {
    return paise / 100;
  }
}

module.exports = new PaymentService();