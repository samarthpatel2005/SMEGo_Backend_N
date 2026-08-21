// routes/payrollRoutes.js
const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { protect } = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Apply authentication middleware to all routes
router.use(protect);

// New payroll management routes
router.get('/employees', payrollController.getEmployeesForPayroll);
router.post('/generate-for-employees', roleMiddleware(['admin', 'manager']), payrollController.generatePayrollForEmployees);
router.post('/create-payment', roleMiddleware(['admin', 'manager']), payrollController.createPayrollPayment);
router.post('/webhook/payment', payrollController.handlePayrollPaymentWebhook);
router.delete('/bulk-delete', roleMiddleware(['admin', 'manager']), payrollController.deletePayrolls);
router.post('/reset-status', roleMiddleware(['admin', 'manager']), payrollController.resetPayrollStatus);

// Viewing routes (accessible to all authenticated users)
router.get('/', payrollController.getPayrolls);

module.exports = router;
