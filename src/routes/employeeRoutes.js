// routes/employeeRoutes.js
const express = require("express");
const router = express.Router();
const {
  joinOrganization,
  verifyEmployeeOtp,
  resendEmployeeOtp,
  getEmployees,
  getEmployee,
  updateModulePermissions,
  getEmployeePermissions,
} = require("../controllers/employeeController");

const { body, param, query } = require('express-validator');
const { validateRequest } = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// @route   POST /api/employees/join
// @desc    Join organization using join code
// @access  Public
router.post("/join", joinOrganization);

// @route   POST /api/employees/verify-otp
// @desc    Verify employee email OTP
// @access  Public
router.post("/verify-otp", verifyEmployeeOtp);

// @route   POST /api/employees/resend-otp
// @desc    Resend email OTP for employee verification
// @access  Public
router.post("/resend-otp", resendEmployeeOtp);

router.get('/',
  protect,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 10000 }),
  query('search').optional().trim(),
  query('department').optional().trim(),
  query('role').optional().isIn(['employee', 'manager', 'hr', 'accountant']),
  validateRequest,
  getEmployees
);

// Get specific employee by ID
router.get('/:id',
  protect,
  param('id').isMongoId(),
  validateRequest,
  getEmployee
);

// Get employee module permissions (Admin only)
router.get('/:id/permissions',
  protect,
  param('id').isMongoId(),
  validateRequest,
  getEmployeePermissions
);

// Update employee module permissions (Admin only)
router.put('/:id/permissions',
  protect,
  param('id').isMongoId(),
  validateRequest,
  updateModulePermissions
);

module.exports = router;
