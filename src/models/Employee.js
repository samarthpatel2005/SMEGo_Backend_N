// models/Employee.js
const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      default: () => crypto.randomUUID(),
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    phone: {
      type: String,
      trim: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    role: {
      type: String,
      enum: ['manager', 'employee', 'hr', 'accountant'],
      default: 'employee',
    },
    department: {
      type: String,
      trim: true,
    },
    position: {
      type: String,
      trim: true,
    },
    salary: {
      type: Number,
    },
    salaryType: {
      type: String,
      enum: ['monthly', 'hourly'],
      default: 'monthly',
    },
    hourlyRate: {
      type: Number,
    },
    hireDate: {
      type: Date,
      default: Date.now,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationOtp: {
      type: String,
    },
    emailVerificationOtpExpires: {
      type: Date,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    joinedVia: {
      type: String,
      enum: ['invite', 'code'],
      required: true,
    },
    lastLogin: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    modulePermissions: {
      type: [String],
      enum: ['dashboard', 'analytics', 'invoices', 'clients', 'products', 'transactions', 'complaints'],
      default: ['dashboard'],
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for email + organization
employeeSchema.index({ email: 1, organization: 1 }, { unique: true });

// Hash password before saving
employeeSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
employeeSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
employeeSchema.methods.toJSON = function () {
  const employeeObject = this.toObject();
  delete employeeObject.password;
  delete employeeObject.emailVerificationOtp;
  return employeeObject;
};

module.exports = mongoose.model('Employee', employeeSchema);
