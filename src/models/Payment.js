// Payment Model
const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  subscription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true
  },
  amount: {
    type: Number,
    required: true // Amount in paise
  },
  currency: {
    type: String,
    required: true,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'upi', 'netbanking', 'wallet'],
    default: 'card'
  },
  razorpayOrderId: {
    type: String,
    required: true
  },
  razorpayPaymentId: {
    type: String
  },
  razorpaySignature: {
    type: String
  },
  failureReason: {
    type: String
  },
  refundId: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
PaymentSchema.index({ organization: 1, createdAt: -1 });
PaymentSchema.index({ razorpayOrderId: 1 });
PaymentSchema.index({ razorpayPaymentId: 1 });
PaymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', PaymentSchema);
