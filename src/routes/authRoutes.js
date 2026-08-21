// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { debugUserOrganization, debugListOrganizations } = require('../controllers/debugController');

const {
  createAdminAccount,
  verifyEmail,
  verifyEmailOtp,
  resendOtp,
  completeOrganizationProfile,
  selectPlan,
  login,
  getUserProfile
} = authController;
const { protect } = require('../middlewares/authMiddleware');
const { validateRequest } = require('../middlewares/validateRequest');
const { body, param } = require('express-validator');

// Validation schemas
const createAdminValidation = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('Full name must be between 2-80 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least 8 characters with 1 uppercase, 1 lowercase, and 1 digit'),
  body('phone')
    .optional()
    .matches(/^\+[1-9]\d{1,14}$/)
    .withMessage('Phone must be in E.164 format'),
  body('acceptedTerms')
    .equals('true')
    .withMessage('You must accept terms and conditions')
];

const organizationProfileValidation = [
  body('organizationName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Organization name must be between 2-100 characters'),
  body('country')
    .notEmpty()
    .withMessage('Country is required'),
  body('timezone')
    .notEmpty()
    .withMessage('Timezone is required'),
  body('currency')
    .isIn(['USD', 'INR', 'EUR', 'GBP'])
    .withMessage('Invalid currency')
];

const planSelectionValidation = [
  body('planName')
    .isIn(['basic', 'pro'])
    .withMessage('Invalid plan selected')
];


const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Authentication Routes

// Step 1: Create admin account
router.post('/create-admin', 
  createAdminValidation, 
  validateRequest, 
  createAdminAccount
);

// Email verification
router.get('/verify-email/:token', 
  param('token').isLength({ min: 32, max: 64 }),
  validateRequest,
  verifyEmail
);

// OTP verification
router.post('/verify-otp', 
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
  ],
  validateRequest,
  verifyEmailOtp
);

// Resend OTP
router.post('/resend-otp', 
  [
    body('email').isEmail().withMessage('Valid email is required')
  ],
  validateRequest,
  resendOtp
);

// Step 2: Complete organization profile
router.post('/complete-organization', 
  protect,
  organizationProfileValidation,
  validateRequest, 
  completeOrganizationProfile
);

// Debug endpoints (temporary)
router.get('/debug-user-org', protect, debugUserOrganization);
router.get('/debug-list-orgs', debugListOrganizations);

// Get user profile with complete data
router.get('/profile', protect, getUserProfile);

// Step 3: Select plan


// Step 3: Select plan
router.post('/select-plan', 
  protect,
  planSelectionValidation, 
  validateRequest, 
  selectPlan
);

// Login
router.post('/login', 
  loginValidation, 
  validateRequest, 
  login
);

// Logout (optional - mainly for clearing tokens client-side)
router.post('/logout', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;