// controllers/employeeController.js
const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const Organization = require("../models/Organization");
const emailService = require("../services/emailService");
const { generateToken } = require("../utils/generateToken");

// Step 1: Join organization using join code
async function joinOrganization(req, res) {
  try {
    const { fullName, email, password, phone, joinCode, department, position } = req.body;

    if (!joinCode) {
      return res.status(400).json({
        success: false,
        message: "Join code is required",
      });
    }

    // Find organization by join code
    const organization = await Organization.findOne({ joinCode: joinCode.toUpperCase(), isActive: true });
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Invalid or inactive join code",
      });
    }

    // Check if employee already exists in same organization
    const existingEmployee = await Employee.findOne({ email, organization: organization._id });
    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        message: "Employee with this email already exists in the organization",
      });
    }

    // Generate OTP for email verification
    const emailVerificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailVerificationOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create employee
    const employee = new Employee({
      fullName,
      email,
      password,
      phone,
      organization: organization._id,
      role: "employee",
      department,
      position,
      joinedVia: "code",
      isEmailVerified: false,
      emailVerificationOtp,
      emailVerificationOtpExpires,
    });

    await employee.save();

    // Send OTP to email
    try {
      await emailService.sendVerificationOtp(email, emailVerificationOtp);
    } catch (err) {
      console.error("Email service error:", err.message);
    }

    res.status(201).json({
      success: true,
      message: "Employee registered successfully. Please verify your email using the OTP sent.",
      data: {
        employeeId: employee._id,
        email: employee.email,
        organization: {
          id: organization._id,
          name: organization.name,
          joinCode: organization.joinCode,
        },
        needsEmailVerification: true,
        otpExpiresIn: "10 minutes",
        nextStep: "verifyOtp",
      },
    });
  } catch (error) {
    console.error("Join organization error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Step 2: Verify employee OTP
async function verifyEmployeeOtp(req, res) {
  try {
    const { email, otp } = req.body;

    const employee = await Employee.findOne({
      email,
      emailVerificationOtp: otp,
      emailVerificationOtpExpires: { $gt: Date.now() },
    }).populate("organization");

    if (!employee) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Mark employee as verified
    employee.isEmailVerified = true;
    employee.emailVerificationOtp = undefined;
    employee.emailVerificationOtpExpires = undefined;
    await employee.save();

    // Generate token
    const token = generateToken(employee._id);

    res.status(200).json({
      success: true,
      message: "Email verified successfully! You can now access the portal.",
      data: {
        token,
        employee: {
          id: employee._id,
          fullName: employee.fullName,
          email: employee.email,
          role: employee.role,
          isEmailVerified: employee.isEmailVerified,
        },
        organization: {
          id: employee.organization._id,
          name: employee.organization.name,
          joinCode: employee.organization.joinCode,
        },
      },
    });
  } catch (error) {
    console.error("Verify employee OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}

// Step 3: Resend OTP
async function resendEmployeeOtp(req, res) {
  try {
    const { email } = req.body;

    const employee = await Employee.findOne({ email, isEmailVerified: false });
    if (!employee) {
      return res.status(400).json({
        success: false,
        message: "Employee not found or already verified",
      });
    }

    // Generate new OTP
    const emailVerificationOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailVerificationOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

    employee.emailVerificationOtp = emailVerificationOtp;
    employee.emailVerificationOtpExpires = emailVerificationOtpExpires;
    await employee.save();

    // Send new OTP
    try {
      await emailService.sendVerificationOtp(email, emailVerificationOtp);
    } catch (err) {
      console.error("Email service error:", err.message);
    }

    res.status(200).json({
      success: true,
      message: "New OTP sent to your email",
      data: {
        otpExpiresIn: "10 minutes",
      },
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
}

async function getEmployees(req, res) {
  try {
    const { page = 1, limit = 10, search = '', department = '', role = '' } = req.query;
    
    // Handle both populated and non-populated organization field
    const organizationId = req.user.organization?._id || req.user.organization;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: 'No organization associated with user'
      });
    }

    // Build query filters
    const filter = { organization: organizationId };
    
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (department) filter.department = department;
    if (role) filter.role = role;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const employees = await Employee.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('organization', 'name');

    const total = await Employee.countDocuments(filter);

    res.json({
      success: true,
      data: {
        employees,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

// Get employee by ID
async function getEmployee(req, res) {
  try {
    const { id } = req.params;
    const organizationId = req.user.organization;

    const employee = await Employee.findOne({ 
      _id: id, 
      organization: organizationId 
    })
      .select('-password')
      .populate('organization', 'name')
      .populate('invitedBy', 'fullName email');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      data: { employee }
    });

  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}


// Update employee module permissions (Admin only)
async function updateModulePermissions(req, res) {
  try {
    const { id } = req.params;
    let { modulePermissions } = req.body;

    // Validate caller is admin
    if (req.user.userType !== 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update module permissions',
      });
    }

    const organizationId = req.user.organization?._id || req.user.organization;

    // Valid modules list
    const VALID_MODULES = ['dashboard', 'analytics', 'invoices', 'clients', 'products', 'transactions', 'complaints'];

    // Validate provided modules
    if (!Array.isArray(modulePermissions)) {
      return res.status(400).json({ success: false, message: 'modulePermissions must be an array' });
    }
    const invalid = modulePermissions.filter(m => !VALID_MODULES.includes(m));
    if (invalid.length > 0) {
      return res.status(400).json({ success: false, message: `Invalid modules: ${invalid.join(', ')}` });
    }

    // Always include 'dashboard'
    if (!modulePermissions.includes('dashboard')) {
      modulePermissions = ['dashboard', ...modulePermissions];
    }

    const employee = await Employee.findOneAndUpdate(
      { _id: id, organization: organizationId },
      { modulePermissions },
      { new: true, runValidators: true }
    ).select('-password');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.json({
      success: true,
      message: 'Module permissions updated successfully',
      data: { employee },
    });
  } catch (error) {
    console.error('updateModulePermissions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
}

// Get employee module permissions
async function getEmployeePermissions(req, res) {
  try {
    const { id } = req.params;
    const organizationId = req.user.organization?._id || req.user.organization;

    const employee = await Employee.findOne({ _id: id, organization: organizationId })
      .select('fullName email role modulePermissions');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.json({
      success: true,
      data: {
        employeeId: employee._id,
        fullName: employee.fullName,
        email: employee.email,
        role: employee.role,
        modulePermissions: employee.modulePermissions || ['dashboard'],
      },
    });
  } catch (error) {
    console.error('getEmployeePermissions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
}

module.exports = {
  joinOrganization,
  verifyEmployeeOtp,
  resendEmployeeOtp,
  getEmployees,
  getEmployee,
  updateModulePermissions,
  getEmployeePermissions,
};
