// routes/registrationRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');
const { protect, protectAdmin } = require('../middlewares/authMiddleware');

const {
  createOrganization,
  createAdmin,
  verifyAdminOtp,
  selectPlan,
  resendOtp
} = require('../controllers/registrationController');

// Validation schemas
const organizationValidation = [
  body('organizationName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Organization name must be between 2-100 characters'),
  body('country')
    .isLength({ min: 2, max: 3 })
    .withMessage('Country code is required'),
  body('timezone')
    .notEmpty()
    .withMessage('Timezone is required'),
  body('currency')
    .isIn(['USD', 'INR', 'EUR', 'GBP'])
    .withMessage('Invalid currency')
];

const adminValidation = [
  body('organizationData.organizationName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Organization name must be between 2-100 characters'),
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
  body('acceptedTerms')
    .isBoolean()
    .custom((value) => {
      if (value !== true) {
        throw new Error('You must accept terms and conditions');
      }
      return true;
    })
];

const otpValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 6 digits')
];

const planValidation = [
  body('planId')
    .notEmpty()
    .withMessage('Plan ID is required')
];

// Registration routes
router.post('/create-organization', 
  organizationValidation,
  validateRequest,
  createOrganization
);

router.post('/create-admin', 
  adminValidation,
  validateRequest,
  createAdmin
);

router.post('/verify-admin-otp',
  otpValidation,
  validateRequest,
  verifyAdminOtp
);

router.post('/select-plan',
  protectAdmin, // Use admin auth middleware
  planValidation,
  validateRequest,
  selectPlan
);

router.post('/resend-otp',
  body('email').isEmail().normalizeEmail(),
  validateRequest,
  resendOtp
);

module.exports = router;
