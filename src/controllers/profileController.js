const User = require('../models/User');
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');

/**
 * Get current logged-in admin profile
 * GET /api/profile/admin
 */
exports.getAdminProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find admin user (role: 'owner' or 'admin')
    let admin = null;
    
    // Check if user is from Admin model
    if (req.user.userType === 'admin') {
      admin = await Admin.findById(userId)
        .select('fullName email phone role organization createdAt')
        .populate('organization', 'name');
    } else {
      // Check User model for owner role
      admin = await User.findById(userId)
        .select('fullName email phone role organization createdAt')
        .populate('organization', 'name');
    }

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin profile not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Admin profile retrieved successfully',
      data: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        phone: admin.phone || null,
        role: admin.role,
        organization: admin.organization,
        userType: req.user.userType || 'admin',
        createdAt: admin.createdAt
      }
    });

  } catch (error) {
    console.error('Error getting admin profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving admin profile',
      error: error.message
    });
  }
};

/**
 * Get current logged-in employee profile
 * GET /api/profile/employee
 */
exports.getEmployeeProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    
    let profile = null;

    // Check if user is from Employee model
    if (req.user.userType === 'employee') {
      profile = await Employee.findById(userId)
        .select('fullName email phone role department position organization employeeId modulePermissions createdAt')
        .populate('organization', 'name');
    } else {
      // Check User model for employee role
      profile = await User.findById(userId)
        .select('fullName email phone role organization createdAt')
        .populate('organization', 'name');
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Employee profile retrieved successfully',
      data: {
        id: profile._id,
        employeeId: profile.employeeId || null,
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone || null,
        role: profile.role,
        department: profile.department || null,
        position: profile.position || null,
        organization: profile.organization,
        userType: req.user.userType || 'employee',
        modulePermissions: profile.modulePermissions || ['dashboard'],
        createdAt: profile.createdAt
      }
    });

  } catch (error) {
    console.error('Error getting employee profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving employee profile',
      error: error.message
    });
  }
};

/**
 * Get profile based on user type (admin or employee)
 * GET /api/profile/me
 */
exports.getCurrentUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const userType = req.user.userType;
    
    let profile = null;

    // Get profile based on user type
    if (userType === 'admin') {
      profile = await Admin.findById(userId)
        .select('fullName email phone role organization createdAt')
        .populate('organization', 'name');
    } else if (userType === 'employee') {
      profile = await Employee.findById(userId)
        .select('fullName email phone role department position organization employeeId modulePermissions createdAt')
        .populate('organization', 'name');
    } else {
      // Fallback to User model
      profile = await User.findById(userId)
        .select('fullName email phone role organization createdAt')
        .populate('organization', 'name');
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const responseData = {
      id: profile._id,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone || null,
      role: profile.role,
      organization: profile.organization,
      userType: userType || 'user',
      modulePermissions: profile.modulePermissions || ['dashboard'],
      createdAt: profile.createdAt
    };

    // Add employee-specific fields if applicable
    if ((userType === 'employee' || profile.employeeId) && profile.employeeId) {
      responseData.employeeId = profile.employeeId;
      responseData.department = profile.department || null;
      responseData.position = profile.position || null;
    }

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving profile',
      error: error.message
    });
  }
};

/**
 * Update admin profile
 * PUT /api/profile/admin
 */
exports.updateAdminProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fullName, phone } = req.body;

    let admin = null;

    // Find and update based on user type
    if (req.user.userType === 'admin') {
      admin = await Admin.findById(userId);
    } else {
      admin = await User.findById(userId);
    }

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin profile not found'
      });
    }

    // Update allowed fields
    if (fullName) admin.fullName = fullName;
    if (phone !== undefined) admin.phone = phone;

    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Admin profile updated successfully',
      data: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        phone: admin.phone,
        role: admin.role
      }
    });

  } catch (error) {
    console.error('Error updating admin profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating admin profile',
      error: error.message
    });
  }
};

/**
 * Update employee profile
 * PUT /api/profile/employee
 */
exports.updateEmployeeProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fullName, phone } = req.body;

    let employee = null;

    // Find and update based on user type
    if (req.user.userType === 'employee') {
      employee = await Employee.findById(userId);
    } else {
      employee = await User.findById(userId);
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found'
      });
    }

    // Update allowed fields
    if (fullName) employee.fullName = fullName;
    if (phone !== undefined) employee.phone = phone;

    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Employee profile updated successfully',
      data: {
        id: employee._id,
        fullName: employee.fullName,
        email: employee.email,
        phone: employee.phone,
        role: employee.role
      }
    });

  } catch (error) {
    console.error('Error updating employee profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating employee profile',
      error: error.message
    });
  }
};