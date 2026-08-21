// routes/clientRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const clientController = require('../controllers/clientController');
const { protect } = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Validation middleware
const clientValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be between 2 and 100 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('phone')
    .trim()
    .isLength({ min: 10, max: 15 })
    .withMessage('Phone number must be between 10 and 15 characters'),
  
  body('companyName')
    .optional()
    .trim()
    .isLength({ max: 150 })
    .withMessage('Company name cannot exceed 150 characters'),
  
  body('jobTitle')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Job title cannot exceed 100 characters'),
  
  body('website')
    .optional()
    .isURL()
    .withMessage('Please provide a valid website URL'),
  
  body('alternateEmail')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid alternate email address'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'suspended', 'archived'])
    .withMessage('Status must be one of: active, inactive, suspended, archived'),
  
  body('clientType')
    .optional()
    .isIn(['individual', 'business', 'enterprise', 'government', 'nonprofit'])
    .withMessage('Client type must be one of: individual, business, enterprise, government, nonprofit'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Priority must be one of: low, medium, high, critical'),
  
  body('creditLimit')
    .optional()
    .isNumeric()
    .withMessage('Credit limit must be a number'),
  
  body('paymentTerms')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment terms must be between 0 and 365 days'),
  
  body('currency')
    .optional()
    .isIn(['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'])
    .withMessage('Currency must be one of: INR, USD, EUR, GBP, JPY, AUD, CAD'),
  
  body('preferredContactMethod')
    .optional()
    .isIn(['email', 'phone', 'whatsapp', 'sms'])
    .withMessage('Preferred contact method must be one of: email, phone, whatsapp, sms'),
  
  body('gstNumber')
    .optional()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Please provide a valid GST number'),
  
  body('address.street')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Street address cannot exceed 200 characters'),
  
  body('address.city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City cannot exceed 100 characters'),
  
  body('address.state')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('State cannot exceed 100 characters'),
  
  body('address.postalCode')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Postal code cannot exceed 20 characters'),
  
  body('address.country')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country cannot exceed 100 characters'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  
  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Each tag cannot exceed 50 characters')
];

const updateClientValidation = [
  ...clientValidation.map(validation => validation.optional())
];

// Routes

// @route   GET /api/clients
// @desc    Get all clients for organization
// @access  Private (Admin, Employee)
router.get('/', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'employee', 'manager', 'hr', 'accountant']),
  clientController.getClients
);

// @route   GET /api/clients/active
// @desc    Get active clients for dropdown/selection
// @access  Private (Admin, Employee)
router.get('/active', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'employee', 'manager', 'hr', 'accountant']),
  clientController.getActiveClients
);

// @route   GET /api/clients/search
// @desc    Search clients
// @access  Private (Admin, Employee)
router.get('/search', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'employee', 'manager', 'hr', 'accountant']),
  query('q')
    .isLength({ min: 2 })
    .withMessage('Search term must be at least 2 characters long'),
  clientController.searchClients
);

// @route   GET /api/clients/stats
// @desc    Get client statistics
// @access  Private (Admin, Manager, HR, Accountant)
router.get('/stats', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'manager', 'hr', 'accountant']),
  clientController.getClientStats
);

// @route   GET /api/clients/:id
// @desc    Get client by ID
// @access  Private (Admin, Employee)
router.get('/:id', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'employee', 'manager', 'hr', 'accountant']),
  param('id')
    .isMongoId()
    .withMessage('Invalid client ID'),
  clientController.getClientById
);

// @route   POST /api/clients
// @desc    Create new client
// @access  Private (Admin, Manager, HR, Accountant)
router.post('/', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'manager', 'hr', 'accountant']),
  clientValidation,
  clientController.createClient
);

// @route   PUT /api/clients/:id
// @desc    Update client
// @access  Private (Admin, Manager, HR, Accountant)
router.put('/:id', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'manager', 'hr', 'accountant']),
  param('id')
    .isMongoId()
    .withMessage('Invalid client ID'),
  updateClientValidation,
  clientController.updateClient
);

// @route   DELETE /api/clients/:id
// @desc    Soft delete client
// @access  Private (Admin, Manager)
router.delete('/:id', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'manager']),
  param('id')
    .isMongoId()
    .withMessage('Invalid client ID'),
  clientController.deleteClient
);

// @route   POST /api/clients/:id/restore
// @desc    Restore deleted client
// @access  Private (Admin, Manager)
router.post('/:id/restore', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'manager']),
  param('id')
    .isMongoId()
    .withMessage('Invalid client ID'),
  clientController.restoreClient
);

// @route   POST /api/clients/:id/update-stats
// @desc    Update client statistics
// @access  Private (Admin, Manager, HR, Accountant)
router.post('/:id/update-stats', 
  protect, 
  roleMiddleware.requireAnyRole(['admin', 'manager', 'hr', 'accountant']),
  param('id')
    .isMongoId()
    .withMessage('Invalid client ID'),
  clientController.updateClientStats
);

module.exports = router;
