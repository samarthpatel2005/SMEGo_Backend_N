// controllers/registrationController.js
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
const Organization = require('../models/Organization');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const { generateToken } = require('../utils/generateToken');

// Step 1: Validate organization data (doesn't create yet)
async function createOrganization(req, res) {
  try {
    const { 
      organizationName,
      legalName,
      industry,
      country,
      timezone,
      currency,
      address,
      taxId,
      invoiceNumberPrefix
    } = req.body;

    // Check if organization already exists
    const existingOrg = await Organization.findOne({ name: organizationName });
    if (existingOrg) {
      return res.status(400).json({ 
        success: false, 
        message: 'Organization already exists with this name' 
      });
    }

    console.log('🔍 Validating organization name:', organizationName);
    
    // Store organization data temporarily for next step
    res.status(200).json({
      success: true,
      message: 'Organization name is available. Now add admin details.',
      data: {
        organizationData: {
          organizationName,
          legalName: legalName || organizationName,
          industry: industry || 'Other',
          country: country || 'IN',
          timezone: timezone || 'Asia/Kolkata',
          currency: currency || 'INR',
          address,
          taxId,
          invoiceNumberPrefix
        },
        nextStep: 'createAdmin'
      }
    });

  } catch (error) {
    console.error('Validate organization error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

// Step 2: Create both organization and admin together
async function createAdmin(req, res) {
  try {
    console.log('📥 Received admin creation request:', JSON.stringify(req.body, null, 2));
    
    const { 
      organizationData,
      fullName, 
      email, 
      password, 
      phone, 
      acceptedTerms
    } = req.body;

    // Detailed validation with logging
    console.log('🔍 Validating admin creation data...');
    console.log('organizationData:', organizationData);
    console.log('fullName:', fullName);
    console.log('email:', email);
    console.log('password:', password ? '[PROVIDED]' : '[MISSING]');
    console.log('phone:', phone);
    console.log('acceptedTerms:', acceptedTerms);

    if (!acceptedTerms) {
      console.log('❌ Terms not accepted');
      return res.status(400).json({ 
        success: false, 
        message: 'You must accept terms and privacy policy' 
      });
    }

    if (!organizationData || !organizationData.organizationName) {
      console.log('❌ Organization data missing or invalid');
      return res.status(400).json({ 
        success: false, 
        message: 'Organization data is required' 
      });
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!fullName || !normalizedEmail || !password) {
      console.log('❌ Required admin fields missing');
      return res.status(400).json({ 
        success: false, 
        message: 'Full name, email, and password are required' 
      });
    }

    // Check if organization already exists
    const existingOrg = await Organization.findOne({ name: organizationData.organizationName });
    if (existingOrg) {
      return res.status(400).json({ 
        success: false, 
        message: 'Organization already exists with this name' 
      });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: normalizedEmail });
    if (existingAdmin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Admin already exists with this email' 
      });
    }

    // Generate OTP for email verification
    const emailVerificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailVerificationOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log('🏢 Creating organization and admin:', organizationData.organizationName);
    
    const session = await mongoose.startSession();
    let admin, organization;
    
    try {
      await session.withTransaction(async () => {
        // First create organization
        const orgData = {
          name: organizationData.organizationName,
          legalName: organizationData.legalName,
          industry: organizationData.industry,
          country: organizationData.country,
          timezone: organizationData.timezone,
          currency: organizationData.currency
        };

        // Add optional fields
        if (organizationData.address) orgData.address = organizationData.address;
        if (organizationData.taxId) orgData.taxId = organizationData.taxId;
        if (organizationData.invoiceNumberPrefix) orgData.invoiceNumberPrefix = organizationData.invoiceNumberPrefix;
        
        const newOrganization = new Organization(orgData);
        organization = await newOrganization.save({ session });
        
        // Now create admin with organization reference
        const adminData = {
          fullName,
          email: normalizedEmail,
          password,
          phone,
          role: 'owner',
          organization: organization._id, // Add organization reference
          isEmailVerified: false,
          emailVerificationOtp,
          emailVerificationOtpExpires,
          acceptedTerms,
          acceptedTermsAt: new Date()
        };

        const newAdmin = new Admin(adminData);
        admin = await newAdmin.save({ session });
        
        // Update organization with admin as owner
        organization.owner = admin._id;
        await organization.save({ session });
        
        console.log('✅ Organization and admin created:', {
          adminId: admin._id.toString(),
          organizationId: organization._id.toString(),
          organizationName: organization.name,
          joinCode: organization.joinCode
        });
      });
    } catch (error) {
      throw error;
    } finally {
      await session.endSession();
    }
      
    // Send OTP email
    try {
      await emailService.sendVerificationOtp(normalizedEmail, emailVerificationOtp);
    } catch (emailError) {
      console.log('Email service error (continuing anyway):', emailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Organization and admin account created successfully. Please check your email for the 6-digit verification code.',
      data: {
        adminId: admin._id,
        email: admin.email,
        organizationId: organization._id,
        organizationName: organization.name,
        joinCode: organization.joinCode,
        needsEmailVerification: true,
        otpExpiresIn: '10 minutes',
        nextStep: 'verifyOtp'
      }
    });

  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

// Step 3: Verify admin OTP
async function verifyAdminOtp(req, res) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { otp } = req.body;

    const admin = await Admin.findOne({
      email,
      emailVerificationOtp: otp,
      emailVerificationOtpExpires: { $gt: Date.now() }
    }).populate('organization');

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Update admin as verified
    admin.isEmailVerified = true;
    admin.emailVerificationOtp = undefined;
    admin.emailVerificationOtpExpires = undefined;
    await admin.save();

    // Generate JWT token for the admin with userType 'admin'
    const token = generateToken(admin._id, 'admin');

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! Now select your plan.',
      data: {
        token,
        admin: {
          id: admin._id,
          fullName: admin.fullName,
          email: admin.email,
          role: admin.role,
          isEmailVerified: admin.isEmailVerified
        },
        organization: {
          id: admin.organization._id,
          name: admin.organization.name,
          legalName: admin.organization.legalName,
          joinCode: admin.organization.joinCode
        },
        nextStep: 'selectPlan'
      }
    });

  } catch (error) {
    console.error('Verify admin OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

// Step 4: Select plan and create subscription
async function selectPlan(req, res) {
  try {
    const { planId, couponCode } = req.body;
    const adminId = req.user.id; // From auth middleware (protectAdmin sets req.user)
    
    const admin = await Admin.findById(adminId).populate('organization');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Find the plan
    let plan = await Plan.findOne({ name: planId });
    if (!plan) {
      plan = await Plan.findById(planId);
    }
    
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: 'Plan not found'
      });
    }

    console.log('💳 Creating subscription for plan:', plan.name);
    
    // Create subscription with correct field names matching the model
    const subscriptionData = {
      userId: admin._id, // Required field
      userModel: 'Admin', // Specify this is an Admin reference
      organization: admin.organization._id,
      planId: plan._id, // Required field
      amount: plan.price, // Required field
      currency: plan.currency || 'INR',
      status: 'trial', // Valid enum value
      startDate: new Date(),
      endDate: new Date(Date.now() + (plan.trialDays || 14) * 24 * 60 * 60 * 1000),
      usage: {
        employees: 1, // Owner counts as 1 employee
        invoicesThisMonth: 0
      }
    };

    if (couponCode) {
      // TODO: Apply coupon logic here if needed
    }

    const subscription = new Subscription(subscriptionData);
    const savedSubscription = await subscription.save();

    // Update organization with subscription
    admin.organization.subscription = savedSubscription._id;
    await admin.organization.save();

    console.log('✅ Subscription created:', {
      id: savedSubscription._id.toString(),
      plan: plan.name,
      status: savedSubscription.status
    });

    res.status(200).json({
      success: true,
      message: 'Plan selected successfully! Registration completed.',
      data: {
        subscription: {
          id: savedSubscription._id,
          plan: {
            id: plan._id,
            name: plan.name,
            displayName: plan.displayName,
            price: plan.price,
            currency: plan.currency,
            interval: plan.interval,
            features: plan.features,
            limits: plan.limits
          },
          status: savedSubscription.status,
          trialEndDate: savedSubscription.endDate
        },
        redirectTo: '/dashboard'
      }
    });

  } catch (error) {
    console.error('Select plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

// Resend OTP
async function resendOtp(req, res) {
  try {
    const { email } = req.body;

    const admin = await Admin.findOne({ email, isEmailVerified: false });

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: 'Admin not found or already verified'
      });
    }

    // Generate new OTP
    const emailVerificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailVerificationOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

    admin.emailVerificationOtp = emailVerificationOtp;
    admin.emailVerificationOtpExpires = emailVerificationOtpExpires;
    await admin.save();

    // Send new OTP
    await emailService.sendVerificationOtp(email, emailVerificationOtp);

    res.status(200).json({
      success: true,
      message: 'New OTP sent to your email',
      data: {
        otpExpiresIn: '10 minutes'
      }
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

module.exports = {
  createOrganization,
  createAdmin,
  verifyAdminOtp,
  selectPlan,
  resendOtp
};
