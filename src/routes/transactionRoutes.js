const express = require("express");
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/transactionController');

// Apply authentication middleware to all routes
router.use(protect);

// Invoice-based transactions (new endpoint)
router.get('/invoice-transactions', ctrl.getInvoiceTransactions);

// Transaction CRUD operations
router.get('/', ctrl.getTransactions);
router.post('/', ctrl.createTransaction);
router.post('/bulk-import', ctrl.bulkImportTransactions);
router.get('/analytics', ctrl.getTransactionAnalytics);
router.get('/:id', ctrl.getTransaction);

module.exports = router;