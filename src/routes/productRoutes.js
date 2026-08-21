const express = require("express");
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/productController');

// Apply authentication middleware to all routes
router.use(protect);

// Product CRUD operations
router.get('/', ctrl.getProducts);
router.post('/', ctrl.createProduct);
router.get('/categories', ctrl.getCategories);
router.get('/low-stock', ctrl.getLowStockProducts);
router.get('/valuation', ctrl.getInventoryValuation);
router.get('/:id', ctrl.getProduct);
router.put('/:id', ctrl.updateProduct);
router.delete('/:id', ctrl.deleteProduct);

// Stock management
router.post('/:id/adjust-stock', ctrl.adjustStock);
router.post('/test-stock-deduction', ctrl.testStockDeduction);

module.exports = router;