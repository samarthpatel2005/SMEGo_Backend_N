// Subscription Routes
const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getCurrentSubscription,
  getPaymentHistory,
  cancelSubscription,
  getSubscriptionUsage,
  getAllSubscriptions
} = require('../controllers/subscriptionController');

// Apply authentication middleware to all routes
router.use(protect);

// Get current subscription details
router.get('/current', getCurrentSubscription);

// Get all subscriptions (debug)
router.get('/all', getAllSubscriptions);

// Get payment history
router.get('/payments', getPaymentHistory);

// Get subscription usage analytics
router.get('/usage', getSubscriptionUsage);

// Cancel current subscription
router.post('/cancel', cancelSubscription);

module.exports = router;
