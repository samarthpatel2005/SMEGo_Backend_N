// middlewares/validateRequest.js
const { validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    console.log('🔍 Validation failed for request:', req.originalUrl);
    console.log('📤 Request body:', JSON.stringify(req.body, null, 2));
    console.log('❌ Validation errors:', errors.array());
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

module.exports = { validateRequest };