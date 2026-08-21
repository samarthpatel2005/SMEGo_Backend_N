const mongoose = require('mongoose');
// models/Subscription.js
const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // Dynamic reference - can point to either User or Admin
    refPath: 'userModel'
  },
  userModel: {
    type: String,
    required: true,
    enum: ['User', 'Admin']
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true
  },
  status: {
    type: String,
    enum: ['trial', 'active', 'past_due', 'cancelled', 'unpaid', 'expired'],
    default: 'trial'
  },
  // Razorpay specific fields
  paymentId: String, // Razorpay payment ID
  orderId: String,   // Razorpay order ID
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: Date,
  cancelledAt: Date,
  // Legacy Stripe fields (keeping for backward compatibility if needed)
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  trialEnd: Date,
  canceledAt: Date,
  usage: {
    employees: { type: Number, default: 0 },
    clients: { type: Number, default: 0 },
    invoicesThisMonth: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Subscription', subscriptionSchema);