// controllers/authController.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');
const Organization = require('../models/Organization');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const paymentService = require('../services/paymentService');
const { generateToken } = require('../utils/generateToken');
// Step 1: Create admin account
async function createAdminAccount(req, res) {
  try {
    const { 
      fullName, 
      email, 
      password, 
      phone, 
      acceptedTerms,
      // Organization details
      organizationName,
      legalName,
      industry,
      country,
      timezone,
      currency,
      address,
      taxId,
      invoiceNumberPrefix,
      // Optional plan selection
      planId,
      couponCode
    } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    // Validation
    if (!acceptedTerms) {
      return res.status(400).json({ 
        success: false, 
        message: 'You must accept terms and privacy policy' 
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

    // Generate OTP for email verification (6-digit number)
    const emailVerificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailVerificationOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Use MongoDB session for transaction to ensure data consistency
    const session = await mongoose.startSession();
    let user, organization, subscription = null;
    
    console.log('📝 Creating admin account for:', email);
    
    try {
      await session.withTransaction(async () => {
        console.log('🔄 Starting transaction...');
        
        // For admin/owner users, create organization with actual details first
        const orgName = organizationName || `Organization ${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
        console.log('🏢 Creating organization:', orgName);
        
        const organizationData = {
          name: orgName,
          legalName: legalName || orgName,
          industry: industry || 'Other',
          country: country || 'IN',
          timezone: timezone || 'Asia/Kolkata',
          currency: currency || 'INR',
          // We'll set the owner after creating the user
        };

        // Add optional fields if provided
        if (address) {
          organizationData.address = address;
        }
        if (taxId) {
          organizationData.taxId = taxId;
        }
        if (invoiceNumberPrefix) {
          organizationData.invoiceNumberPrefix = invoiceNumberPrefix;
        }
        
        // Create organization first
        const newOrg = new Organization(organizationData);
        const savedOrg = await newOrg.save({ session });
        console.log('✅ Organization created:', { 
          id: savedOrg._id.toString(), 
          name: savedOrg.name,
          industry: savedOrg.industry,
          country: savedOrg.country 
        });
        
        // Create admin with organization reference
        const adminData = {
          fullName,
          email: normalizedEmail,
          password,
          phone,
          role: 'owner',
          isEmailVerified: false,
          emailVerificationOtp,
          emailVerificationOtpExpires,
          acceptedTerms,
          acceptedTermsAt: new Date(),
          organization: savedOrg._id
        };

        const newAdmin = new Admin(adminData);
        const savedAdmin = await newAdmin.save({ session });
        console.log('✅ Admin created:', { 
          id: savedAdmin._id.toString(), 
          email: savedAdmin.email,
          organizationId: savedAdmin.organization.toString()
        });

        // Update organization with the admin as owner
        savedOrg.owner = savedAdmin._id;
        const finalOrg = await savedOrg.save({ session });
        console.log('✅ Organization updated with owner:', { 
          id: finalOrg._id.toString(), 
          name: finalOrg.name,
          owner: finalOrg.owner.toString()
        });

        // Create subscription if plan is selected
        if (planId) {
          try {
            console.log('💳 Creating subscription for plan:', planId);
            
            // Find the plan (search by name first, then by ID)
            let plan = await Plan.findOne({ name: planId }).session(session);
            if (!plan) {
              plan = await Plan.findById(planId).session(session);
            }
            
            if (plan) {
              const subscriptionData = {
                userId: savedAdmin._id, // Required field
                userModel: 'Admin', // Specify this is an Admin reference
                organization: savedOrg._id,
                plan: plan._id,
                status: 'trialing', // Start with trial
                startDate: new Date(),
                endDate: new Date(Date.now() + (plan.trialDays || 14) * 24 * 60 * 60 * 1000), // Default 14 day trial
                nextBillingDate: new Date(Date.now() + (plan.trialDays || 14) * 24 * 60 * 60 * 1000),
                createdBy: savedAdmin._id
              };

              if (couponCode) {
                subscriptionData.couponCode = couponCode;
                // TODO: Apply coupon logic here
              }

              const newSubscription = new Subscription(subscriptionData);
              subscription = await newSubscription.save({ session });
              console.log('✅ Subscription created:', { 
                id: subscription._id.toString(), 
                plan: plan.name,
                status: subscription.status,
                organizationId: subscription.organization.toString()
              });
            } else {
              console.log('⚠️ Plan not found:', planId);
            }
          } catch (subscriptionError) {
            console.log('⚠️ Subscription creation failed (continuing without subscription):', subscriptionError.message);
            // Continue without subscription - user can select plan later
          }
        }

        // Set variables in outer scope
        user = savedAdmin;
        organization = finalOrg;
        
        console.log('🔄 Transaction entities prepared:', {
          adminId: user._id.toString(),
          organizationId: organization._id.toString(),
          subscriptionId: subscription?._id.toString() || 'none'
        });
      });

      console.log('🎉 Transaction completed successfully!');

      // Double-check that all entities were created properly
      if (!user || !organization) {
        console.log('❌ Transaction issue - missing data:', { 
          hasAdmin: !!user, 
          hasOrganization: !!organization 
        });
        throw new Error('Transaction completed but admin or organization is missing');
      }

      // Verify organization exists in database
      const orgCheck = await Organization.findById(organization._id);
      if (!orgCheck) {
        console.log('❌ Organization verification failed - not found in database');
        throw new Error('Organization was not properly saved to database');
      }

      console.log('✅ Final verification - All entities created successfully:', {
        adminId: user._id.toString(),
        adminEmail: user.email,
        adminOrgId: user.organization.toString(),
        orgId: organization._id.toString(),
        orgName: organization.name,
        orgOwner: organization.owner.toString(),
        orgInDb: !!orgCheck,
        subscriptionId: subscription?._id.toString() || 'none'
      });
      
      // Send OTP email
      try {
        await emailService.sendVerificationOtp(normalizedEmail, emailVerificationOtp);
      } catch (emailError) {
        console.log('Email service error (continuing anyway):', emailError.message);
        // Continue even if email fails
      }

      res.status(201).json({
        success: true,
        message: 'Account created successfully. Please check your email for the 6-digit verification code.',
        data: {
          adminId: user._id,
          email: user.email,
          organizationId: organization._id,
          organizationName: organization.name,
          subscriptionId: subscription?._id,
          subscriptionStatus: subscription?.status,
          needsEmailVerification: true,
          otpExpiresIn: '10 minutes'
        }
      });

    } catch (error) {
      // Don't call abortTransaction here - withTransaction handles it automatically
      console.log('❌ Transaction failed:', error.message);
      console.log('❌ Full error:', error);
      throw error;
    } finally {
      console.log('🔚 Ending database session');
      await session.endSession();
    }

  } catch (error) {
    console.error('Create admin account error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

// Verify email with OTP
async function verifyEmailOtp(req, res) {
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

    // Generate JWT token for the admin
    const token = generateToken(admin._id, 'admin');

    // Get organization details
    const organization = await Organization.findById(admin.organization._id).populate('owner');

    // Get subscription details if exists
    let subscription = null;
    try {
      const Subscription = require('../models/Subscription');
      subscription = await Subscription.findOne({
        organization: admin.organization._id,
        status: { $in: ['active', 'trialing'] }
      }).populate('plan');
    } catch (error) {
      console.log('No subscription found or subscription model not available');
    }

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. Registration completed!',
      data: {
        token,
        admin: {
          id: admin._id,
          fullName: admin.fullName,
          email: admin.email,
          phone: admin.phone,
          role: admin.role,
          isEmailVerified: admin.isEmailVerified
        },
        organization: {
          id: organization._id,
          name: organization.name,
          legalName: organization.legalName,
          industry: organization.industry,
          country: organization.country,
          timezone: organization.timezone,
          currency: organization.currency,
          address: organization.address,
          taxId: organization.taxId,
          invoiceNumberPrefix: organization.invoiceNumberPrefix,
          owner: organization.owner
        },
        subscription: subscription ? {
          id: subscription._id,
          status: subscription.status,
          plan: subscription.plan ? {
            id: subscription.plan._id,
            name: subscription.plan.name,
            displayName: subscription.plan.displayName,
            price: subscription.plan.price,
            currency: subscription.plan.currency,
            interval: subscription.plan.interval,
            features: subscription.plan.features,
            limits: subscription.plan.limits
          } : null,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          nextBillingDate: subscription.nextBillingDate
        } : null,
        redirectTo: '/dashboard' // Indicate where to redirect after successful verification
      }
    });

  } catch (error) {
    console.error('Verify email OTP error:', error);
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
    const emailVerificationOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

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

// Verify email (old token-based method - keep for backward compatibility)
async function verifyEmail(req, res) {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

// Step 2: Complete organization profile
async function completeOrganizationProfile(req, res) {
  try {
    const user = req.user; // From auth middleware
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

    console.log('🏢 Complete organization profile request:', {
      userId: user?._id,
      userRole: user?.role,
      userOrganization: user?.organization?._id,
      organizationName
    });

    if (!user || user.role !== 'owner') {
      console.log('❌ Access denied - not owner:', { userId: user?._id, role: user?.role });
      return res.status(403).json({
        success: false,
        message: 'Only organization owners can complete this step'
      });
    }

    let organization = await Organization.findById(user.organization);
    if (!organization) {
      console.log('❌ Organization not found by ID:', user.organization);
      
      // Try to find by owner as fallback
      organization = await Organization.findOne({ owner: user._id });
      if (organization) {
        console.log('✅ Found organization by owner ID:', organization._id);
      } else {
        console.log('❌ Organization not found by owner either');
        return res.status(404).json({
          success: false,
          message: 'Organization not found'
        });
      }
    }

    // Update organization details
    organization.name = organizationName;
    organization.legalName = legalName;
    organization.industry = industry;
    organization.country = country;
    organization.timezone = timezone;
    organization.currency = currency;
    organization.address = address;
    organization.taxId = taxId;
    organization.invoiceNumberPrefix = invoiceNumberPrefix || 'INV';

    // Generate new join code if not exists
    if (!organization.joinCode) {
      organization.joinCode = organization.generateJoinCode();
    }

    const savedOrganization = await organization.save();
    console.log('✅ Organization updated successfully:', {
      id: savedOrganization._id,
      name: savedOrganization.name,
      owner: savedOrganization.owner
    });

    // Also update the user's organization reference if it's not set
    if (user.organization.toString() !== organization._id.toString()) {
      console.log('🔄 Updating user organization reference');
      await User.findByIdAndUpdate(user._id, { organization: organization._id });
    }

    res.json({
      success: true,
      message: 'Organization profile completed successfully',
      data: {
        organization: {
          id: savedOrganization._id,
          name: savedOrganization.name,
          joinCode: savedOrganization.joinCode
        }
      }
    });

  } catch (error) {
    console.error('Complete organization profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

// Step 3: Plan selection and subscription
async function selectPlan(req, res) {
  try {
    const user = req.user; // req.user is already the complete user object
    const { planName, couponCode } = req.body;

    if (!user || user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Only organization owners can select plans'
      });
    }

    const plan = await Plan.findOne({ name: planName, isActive: true });
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    const organization = await Organization.findById(user.organization);

    // Create subscription record with trial period
    // Payment will be handled separately through the payment controller
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days trial
    const isAdmin = user.userType === 'admin' || user.role === 'owner';
    const subscriptionData = new Subscription({
      organization: organization._id,
      planId: plan._id,
      userId: user._id,
      userModel: isAdmin ? 'Admin' : 'User', // Specify which model the userId references
      status: 'trial',
      amount: plan.price,
      currency: 'INR',
      startDate: new Date(),
      endDate: trialEnd,
      usage: {
        employees: 1, // Owner counts as 1 employee
        invoicesThisMonth: 0
      }
    });

    await subscriptionData.save();

    // Update organization with subscription
    organization.subscription = subscriptionData._id;
    await organization.save();

    res.json({
      success: true,
      message: 'Plan selected successfully',
      data: {
        subscription: {
          id: subscriptionData._id,
          plan: plan.displayName,
          status: subscriptionData.status,
          trialEnd: subscriptionData.trialEnd,
          limits: plan.limits
        }
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

// Login
async function login(req, res) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // First try to find an Admin
    let user = await Admin.findOne({ email, isActive: true }).populate('organization');
    let userType = 'admin';

    // If no admin found, try to find a User
    if (!user) {
      user = await User.findOne({ email, isActive: true }).populate('organization');
      userType = 'user';
    }

    // If no user found, try to find an Employee
    if (!user) {
      user = await Employee.findOne({ email, isActive: true }).populate('organization');
      userType = 'employee';
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token with appropriate type
    const token = generateToken(user._id, userType);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          organization: user.organization?.name,
          organizationId: user.organization?._id,
          userType,
          // Include module permissions for employees (admins get all modules)
          modulePermissions: userType === 'employee' 
            ? (user.modulePermissions || ['dashboard']) 
            : null
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

// Get user profile with complete organization and subscription data
async function getUserProfile(req, res) {
  try {
    const userId = req.user.id;

    // Try to find as Admin first, then as User
    let user = await Admin.findById(userId).populate('organization');
    let isAdmin = true;
    
    if (!user) {
      user = await User.findById(userId).populate('organization');
      isAdmin = false;
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get organization details
    const organization = await Organization.findById(user.organization._id).populate('owner');

    // Get subscription details if exists
    let subscription = null;
    try {
      subscription = await Subscription.findOne({
        organization: user.organization._id,
        status: { $in: ['active', 'trialing'] }
      }).populate('plan');
    } catch (error) {
      console.log('No subscription found or subscription model not available');
    }

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        },
        organization: {
          id: organization._id,
          name: organization.name,
          legalName: organization.legalName,
          industry: organization.industry,
          country: organization.country,
          timezone: organization.timezone,
          currency: organization.currency,
          address: organization.address,
          taxId: organization.taxId,
          invoiceNumberPrefix: organization.invoiceNumberPrefix,
          owner: {
            id: organization.owner._id,
            fullName: organization.owner.fullName,
            email: organization.owner.email
          },
          createdAt: organization.createdAt
        },
        subscription: subscription ? {
          id: subscription._id,
          status: subscription.status,
          plan: subscription.plan ? {
            id: subscription.plan._id,
            name: subscription.plan.name,
            displayName: subscription.plan.displayName,
            price: subscription.plan.price,
            currency: subscription.plan.currency,
            interval: subscription.plan.interval,
            features: subscription.plan.features,
            limits: subscription.plan.limits,
            trialDays: subscription.plan.trialDays
          } : null,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          nextBillingDate: subscription.nextBillingDate,
          isTrialing: subscription.status === 'trialing'
        } : null
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

module.exports = {
  createAdminAccount,
  verifyEmail,
  verifyEmailOtp,
  resendOtp,
  completeOrganizationProfile,
  selectPlan,
  login,
  getUserProfile
};