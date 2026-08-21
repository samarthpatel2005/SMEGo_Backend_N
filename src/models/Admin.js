// models/Admin.js
const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const adminSchema = new mongoose.Schema(
  {
    adminId: {
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
      unique: true,
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
      enum: ['owner', 'admin'],
      default: 'owner',
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
    acceptedTerms: {
      type: Boolean,
      required: true,
    },
    acceptedTermsAt: {
      type: Date,
    },
    lastLogin: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
adminSchema.pre('save', async function (next) {
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
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
adminSchema.methods.toJSON = function () {
  const adminObject = this.toObject();
  delete adminObject.password;
  delete adminObject.emailVerificationOtp;
  return adminObject;
};

module.exports = mongoose.model('Admin', adminSchema);
