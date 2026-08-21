const express = require("express");
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getProductAnalytics,
  getTransactionAnalytics,
  getInventoryAnalytics,
  getDashboardAnalytics,
  getRevenueAnalytics
} = require('../controllers/analyticsController');

// Apply authentication middleware to all routes
router.use(protect);

// Analytics routes
router.get('/products', getProductAnalytics);
router.get('/transactions', getTransactionAnalytics);
router.get('/inventory', getInventoryAnalytics);
router.get('/dashboard', getDashboardAnalytics);
router.get('/revenue', getRevenueAnalytics);

module.exports = router;
