// Plan Controller
const Plan = require('../models/Plan');

// Get all active plans
const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ price: 1 });
    
    res.json({
      success: true,
      plans: plans.map(plan => ({
        id: plan._id,
        name: plan.name,
        displayName: plan.displayName,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        limits: plan.limits,
        features: plan.features,
        isActive: plan.isActive
      }))
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plans'
    });
  }
};

// Get single plan by ID
const getPlanById = async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await Plan.findById(planId);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    res.json({
      success: true,
      plan: {
        id: plan._id,
        name: plan.name,
        displayName: plan.displayName,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        limits: plan.limits,
        features: plan.features,
        isActive: plan.isActive
      }
    });
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plan'
    });
  }
};

module.exports = {
  getPlans,
  getPlanById
};
