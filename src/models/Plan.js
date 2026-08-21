const mongoose = require('mongoose');
// models/Plan.js
const planSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['basic', 'pro']
  },
  displayName: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  interval: {
    type: String,
    enum: ['month', 'year'],
    default: 'month'
  },
  limits: {
    employees: {
      type: Number,
      required: true
    },
    clients: {
      type: Number,
      required: true
    },
    invoices: {
      type: Number,
      default: -1 // -1 means unlimited
    }
  },
  features: [String],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Plan', planSchema);