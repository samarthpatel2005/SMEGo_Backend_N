// models/Client.js
const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const crypto = require("crypto");

const clientSchema = new mongoose.Schema(
  {
    clientId: {
      type: String,
      default: () => crypto.randomUUID(),
      unique: true,
      index: true,
    },
    
    // Basic Information (Required)
    name: {
      type: String,
      required: [true, "Client name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Client email is required"],
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email'],
      index: true,
    },
    phone: {
      type: String,
      required: [true, "Client phone is required"],
      trim: true,
      minlength: 10,
      maxlength: 15,
    },
    
    // Organization Reference (Required)
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, "Organization is required"],
      index: true,
    },
    
    // Additional Contact Information
    alternateEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid alternate email'],
    },
    alternatePhone: {
      type: String,
      trim: true,
    },
    
    // Business Information
    companyName: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    jobTitle: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    department: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, 'Please enter a valid website URL'],
    },
    
    // Address Information
    address: {
      street: {
        type: String,
        trim: true,
        maxlength: 200,
      },
      city: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      state: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      postalCode: {
        type: String,
        trim: true,
        maxlength: 20,
      },
      country: {
        type: String,
        trim: true,
        maxlength: 100,
        default: 'India',
      },
    },
    
    // Billing Information
    billingAddress: {
      street: {
        type: String,
        trim: true,
        maxlength: 200,
      },
      city: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      state: {
        type: String,
        trim: true,
        maxlength: 100,
      },
      postalCode: {
        type: String,
        trim: true,
        maxlength: 20,
      },
      country: {
        type: String,
        trim: true,
        maxlength: 100,
        default: 'India',
      },
    },
    
    // Tax Information
    taxId: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    gstNumber: {
      type: String,
      trim: true,
      maxlength: 15,
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GST number'],
    },
    
    // Client Status and Type
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'archived'],
      default: 'active',
      index: true,
    },
    clientType: {
      type: String,
      enum: ['individual', 'business', 'enterprise', 'government', 'nonprofit'],
      default: 'individual',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    
    // Financial Information
    creditLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentTerms: {
      type: Number, // in days
      default: 30,
      min: 0,
      max: 365,
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'],
    },
    
    // Client Preferences
    preferredContactMethod: {
      type: String,
      enum: ['email', 'phone', 'whatsapp', 'sms'],
      default: 'email',
    },
    emailNotifications: {
      invoices: { type: Boolean, default: true },
      payments: { type: Boolean, default: true },
      statements: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
    },
    
    // Notes and Tags
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: 50,
    }],
    
    // Client Statistics
    totalInvoices: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastInvoiceDate: {
      type: Date,
    },
    lastPaymentDate: {
      type: Date,
    },
    
    // Tracking Information
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'createdByModel',
      required: true,
    },
    createdByModel: {
      type: String,
      required: true,
      enum: ['User', 'Employee', 'Admin'],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'updatedByModel',
    },
    updatedByModel: {
      type: String,
      enum: ['User', 'Employee', 'Admin'],
    },
    
    // Soft Delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'deletedByModel',
    },
    deletedByModel: {
      type: String,
      enum: ['User', 'Employee', 'Admin'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
clientSchema.index({ organization: 1, email: 1 }, { unique: true });
clientSchema.index({ organization: 1, status: 1 });
clientSchema.index({ organization: 1, clientType: 1 });
clientSchema.index({ organization: 1, createdAt: -1 });
clientSchema.index({ organization: 1, isDeleted: 1 });

// Virtual for full address
clientSchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  if (!addr.street) return '';
  
  const parts = [
    addr.street,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.country
  ].filter(Boolean);
  
  return parts.join(', ');
});

// Virtual for full billing address
clientSchema.virtual('fullBillingAddress').get(function() {
  const addr = this.billingAddress;
  if (!addr.street) return this.fullAddress; // Use primary address if billing not provided
  
  const parts = [
    addr.street,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.country
  ].filter(Boolean);
  
  return parts.join(', ');
});

// Virtual for display name
clientSchema.virtual('displayName').get(function() {
  return this.companyName || this.name;
});

// Pre-save middleware
clientSchema.pre('save', function(next) {
  // If billing address is not provided, use primary address
  if (!this.billingAddress.street && this.address.street) {
    this.billingAddress = { ...this.address };
  }
  
  // Update updatedBy when document is modified
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this._updatedBy;
    this.updatedByModel = this._updatedByModel;
  }
  
  next();
});

// Static methods
clientSchema.statics.findByOrganization = function(orgId, options = {}) {
  const query = { organization: orgId, isDeleted: false };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.clientType) {
    query.clientType = options.clientType;
  }
  
  return this.find(query)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 0);
};

clientSchema.statics.findActiveByOrganization = function(orgId) {
  return this.find({
    organization: orgId,
    status: 'active',
    isDeleted: false
  }).sort({ name: 1 });
};

clientSchema.statics.searchClients = function(orgId, searchTerm) {
  const regex = new RegExp(searchTerm, 'i');
  
  return this.find({
    organization: orgId,
    isDeleted: false,
    $or: [
      { name: regex },
      { email: regex },
      { phone: regex },
      { companyName: regex },
      { tags: { $in: [regex] } }
    ]
  }).sort({ name: 1 });
};

// Instance methods
clientSchema.methods.softDelete = function(deletedBy, deletedByModel) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.deletedByModel = deletedByModel;
  this.status = 'archived';
  return this.save();
};

clientSchema.methods.restore = function() {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  this.deletedByModel = undefined;
  this.status = 'active';
  return this.save();
};

clientSchema.methods.updateStats = async function() {
  const Invoice = mongoose.model('Invoice');
  
  const stats = await Invoice.aggregate([
    {
      $match: {
        'client.id': this._id,
        organization: this.organization
      }
    },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalRevenue: { $sum: '$totalAmount' },
        lastInvoiceDate: { $max: '$issueDate' },
        lastPaymentDate: { $max: '$paidAt' }
      }
    }
  ]);
  
  if (stats.length > 0) {
    this.totalInvoices = stats[0].totalInvoices || 0;
    this.totalRevenue = stats[0].totalRevenue || 0;
    this.lastInvoiceDate = stats[0].lastInvoiceDate;
    this.lastPaymentDate = stats[0].lastPaymentDate;
  }
  
  return this.save();
};

// Query helpers
clientSchema.query.active = function() {
  return this.where({ status: 'active', isDeleted: false });
};

clientSchema.query.byOrganization = function(orgId) {
  return this.where({ organization: orgId, isDeleted: false });
};

// Add pagination plugin
clientSchema.plugin(mongoosePaginate);

const Client = mongoose.model('Client', clientSchema);

module.exports = Client;