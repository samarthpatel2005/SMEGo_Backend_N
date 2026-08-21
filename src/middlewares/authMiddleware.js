const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
const Client = require('../models/Client');

const protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Fallback to cookies if no Authorization header (and cookies exist)
  else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Not authorized, no token provided' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let user = null;
    
    // Try to find user in different models based on userType or by searching all
    if (decoded.userType === 'admin') {
      user = await Admin.findById(decoded.userId).select('-password').populate('organization');
      if (user) {
        user.userType = 'admin';
      }
    } else if (decoded.userType === 'employee') {
      user = await Employee.findById(decoded.userId).select('-password').populate('organization');
      if (user) {
        user.userType = 'employee';
      }
    } else if (decoded.userType === 'client') {
      user = await Client.findById(decoded.userId).select('-password').populate('organization');
      if (user) {
        user.userType = 'client';
      }
    } else {
      // Legacy support - try different models
      user = await User.findById(decoded.userId).select('-password').populate('organization');
      if (!user) {
        user = await Admin.findById(decoded.userId).select('-password').populate('organization');
        if (user) user.userType = 'admin';
      }
      if (!user) {
        user = await Employee.findById(decoded.userId).select('-password').populate('organization');
        if (user) user.userType = 'employee';
      }
      if (!user) {
        user = await Client.findById(decoded.userId).select('-password').populate('organization');
        if (user) user.userType = 'client';
      }
    }
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Not authorized, user not found' 
      });
    }

    // Ensure the user object has the correct role for role middleware
    if (user.userType === 'admin') {
      user.role = 'admin';
    } else if (user.userType === 'employee' && user.role) {
      // Keep the employee's specific role (manager, employee, hr, accountant)
      // user.role is already set from the Employee model
    } else if (user.userType === 'client') {
      user.role = 'client';
    } else if (!user.role) {
      user.role = user.userType || 'employee'; // fallback
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Not authorized, token failed' 
    });
  }
};

// Admin authentication middleware  
const protectAdmin = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Fallback to cookies if no Authorization header (and cookies exist)
  else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    console.log('❌ No token provided. Headers:', req.headers.authorization, 'Cookies:', req.cookies?.jwt);
    return res.status(401).json({ 
      success: false,
      message: 'Not authorized, no token provided' 
    });
  }

  // Debug log
  console.log('🔑 Token received (first 50 chars):', token?.substring(0, 50) + '...');
  console.log('🔑 Token type:', typeof token, 'Length:', token?.length);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let user = null;
    
    // For admin routes, check userType and find admin
    if (decoded.userType === 'admin') {
      user = await Admin.findById(decoded.userId).select('-password').populate('organization');
      if (user) {
        user.userType = 'admin';
      }
    } else {
      // Also allow regular users and employees to access admin routes if they have admin role
      user = await User.findById(decoded.userId).select('-password').populate('organization');
      if (!user) {
        user = await Employee.findById(decoded.userId).select('-password').populate('organization');
        if (user) user.userType = 'employee';
      }
      
      if (!user || (user.role !== 'owner' && user.role !== 'admin' && user.role !== 'manager')) {
        return res.status(401).json({ 
          success: false,
          message: 'Not authorized, admin access required' 
        });
      }
    }
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Not authorized, user not found' 
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin token verification error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Not authorized, token failed' 
    });
  }
};

module.exports = { protect, protectAdmin };