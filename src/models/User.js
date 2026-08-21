// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 80,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: {
      validator: function(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Invalid email format'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    validate: {
      validator: function(password) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
      },
      message: 'Password must contain at least 1 uppercase, 1 lowercase, and 1 digit'
    }
  },
  phone: {
    type: String,
    validate: {
      validator: function(phone) {
        if (!phone) return true;
        return /^\+[1-9]\d{1,14}$/.test(phone);
      },
      message: 'Invalid E.164 phone format'
    }
  },
  role: {
    type: String,
    enum: ['owner', 'employee', 'client'],
    required: true
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  emailVerificationOtp: String,
  emailVerificationOtpExpires: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  acceptedTerms: {
    type: Boolean,
    required: true
  },
  acceptedTermsAt: Date
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);