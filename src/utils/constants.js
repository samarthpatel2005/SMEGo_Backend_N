// utils/constants.js
const USER_ROLES = {
  OWNER: 'owner',
  EMPLOYEE: 'employee',
  CLIENT: 'client'
};

const SUBSCRIPTION_STATUS = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid'
};

const PLAN_NAMES = {
  BASIC: 'basic',
  PRO: 'pro'
};

const CURRENCIES = {
  USD: 'USD',
  INR: 'INR',
  EUR: 'EUR',
  GBP: 'GBP'
};

const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Manufacturing',
  'Retail',
  'Construction',
  'Consulting',
  'Marketing',
  'Other'
];

const COUNTRIES = [
  { code: 'IN', name: 'India', timezone: 'Asia/Kolkata', currency: 'INR' },
  { code: 'US', name: 'United States', timezone: 'America/New_York', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', timezone: 'Europe/London', currency: 'GBP' },
  { code: 'CA', name: 'Canada', timezone: 'America/Toronto', currency: 'USD' }
];

const ERROR_MESSAGES = {
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Insufficient permissions',
  NOT_FOUND: 'Resource not found',
  INTERNAL_ERROR: 'Internal server error',
  EMAIL_EXISTS: 'Email already exists',
  INVALID_CREDENTIALS: 'Invalid credentials',
  TOKEN_EXPIRED: 'Token expired',
  INVITE_EXPIRED: 'Invitation expired or invalid',
  PLAN_LIMIT_EXCEEDED: 'Plan limit exceeded'
};

const SUCCESS_MESSAGES = {
  ACCOUNT_CREATED: 'Account created successfully',
  EMAIL_VERIFIED: 'Email verified successfully',
  PROFILE_COMPLETED: 'Profile completed successfully',
  PLAN_SELECTED: 'Plan selected successfully',
  INVITES_SENT: 'Invitations sent successfully',
  JOIN_SUCCESSFUL: 'Successfully joined organization',
  LOGIN_SUCCESSFUL: 'Login successful'
};

module.exports = {
  USER_ROLES,
  SUBSCRIPTION_STATUS,
  PLAN_NAMES,
  CURRENCIES,
  INDUSTRIES,
  COUNTRIES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};