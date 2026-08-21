// Plan Routes
const express = require('express');
const router = express.Router();
const {
  getPlans,
  getPlanById
} = require('../controllers/planController');

// Public routes (no authentication required)
router.get('/', getPlans);
router.get('/:planId', getPlanById);

module.exports = router;
