const mongoose = require('mongoose')

const complaintSchema = new mongoose.Schema({
  // Client Information
  clientName: {
    type: String,
    required: true,
    trim: true
  },
  clientEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  clientPhone: {
    type: String,
    trim: true
  },
  
  // Complaint Details
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['billing', 'service', 'technical', 'product', 'other'],
    default: 'other'
  },
  
  // Related Invoice (if complaint is about an invoice)
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null
  },
  invoiceNumber: {
    type: String,
    default: null
  },
  
  // Organization
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  
  // Status and Resolution
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open'
  },
  resolution: {
    type: String,
    trim: true,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Internal Notes
  internalNotes: [{
    note: {
      type: String,
      required: true
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// Index for better query performance
complaintSchema.index({ organization: 1, status: 1 })
complaintSchema.index({ clientEmail: 1 })
complaintSchema.index({ invoiceNumber: 1 })
complaintSchema.index({ createdAt: -1 })

// Virtual for complaint age in days
complaintSchema.virtual('ageInDays').get(function() {
  const now = new Date()
  const created = new Date(this.createdAt)
  return Math.floor((now - created) / (1000 * 60 * 60 * 24))
})

// Pre-save middleware to update updatedAt
complaintSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

module.exports = mongoose.model('Complaint', complaintSchema)
