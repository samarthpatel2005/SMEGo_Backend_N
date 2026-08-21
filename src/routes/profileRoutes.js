const express = require('express');
const router = express.Router();
const {
  getAdminProfile,
  getEmployeeProfile,
  getCurrentUserProfile,
  updateAdminProfile,
  updateEmployeeProfile
} = require('../controllers/profileController');

// Import middleware
const { protect, protectAdmin } = require('../middlewares/authMiddleware');

// Routes for admin profile (requires admin authentication)
router.get('/admin', protectAdmin, getAdminProfile);
router.put('/admin', protectAdmin, updateAdminProfile);

// Routes for employee profile (requires authentication)
router.get('/employee', protect, getEmployeeProfile);
router.put('/employee', protect, updateEmployeeProfile);

// Generic route that works for both admin and employee
// This route will automatically detect user type and return appropriate profile
router.get('/me', protect, getCurrentUserProfile);

module.exports = router;
