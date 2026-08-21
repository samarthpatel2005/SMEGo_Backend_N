// Payment Routes
const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middlewares/authMiddleware');
const {
  createOrder,
  verifyPayment,
  getSubscriptionStatus,
  cancelSubscription,
  handleWebhook,
  testWebhook
} = require('../controllers/paymentController');

// Protected routes (require admin authentication for registration flow)
router.post('/create-order', protectAdmin, createOrder);
router.post('/registration/create-order', protect, createOrder); // For registration flow
router.post('/verify-payment', protectAdmin, verifyPayment);
router.post('/registration/verify-payment', protect, verifyPayment); // For registration flow
router.get('/subscription-status', protectAdmin, getSubscriptionStatus);
router.post('/cancel-subscription', protectAdmin, cancelSubscription);

// Webhook route (no authentication required)
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Test webhook route (for testing purposes)
router.post('/test-webhook', testWebhook);

module.exports = router;