const express = require('express');
const billingRouter = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getPlans, createSubscription } = require('../controllers/billingController');

// Protect all routes in this file
billingRouter.use(protect);

// Step 3 of "Create Organization" flow
billingRouter.get('/plans', getPlans);
billingRouter.post('/subscribe', createSubscription);

module.exports = billingRouter;