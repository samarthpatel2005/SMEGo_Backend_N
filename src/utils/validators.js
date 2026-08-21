/ utils/validators.js
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+[1-9]\d{1,14}$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const joinCodeRegex = /^[A-Z0-9]{6,8}$/;

const validateEmail = (email) => {
  return emailRegex.test(email);
};

const validatePhone = (phone) => {
  if (!phone) return true; // Phone is optional
  return phoneRegex.test(phone);
};

const validatePassword = (password) => {
  return passwordRegex.test(password);
};

const validateJoinCode = (code) => {
  return joinCodeRegex.test(code);
};

const validateGSTNumber = (gstNumber, country) => {
  if (!gstNumber) return true; // GST is optional
  
  if (country === 'IN') {
    // Indian GST validation
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstRegex.test(gstNumber);
  }
  
  return true; // Add other country validations as needed
};

const sanitizeString = (str, maxLength = 255) => {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLength);
};

const generateJoinCode = (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

module.exports = {
  validateEmail,
  validatePhone,
  validatePassword,
  validateJoinCode,
  validateGSTNumber,
  sanitizeString,
  generateJoinCode
};
