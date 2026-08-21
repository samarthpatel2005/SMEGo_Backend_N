const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Organization = require('../models/Organization');

exports.getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true });
    res.status(200).json(plans);
  } catch (error) {
    res.status(500).json({ message: 'Server Error fetching plans.' });
  }
};

/**
 * Creates a subscription for an organization.
 * Handles both FREE and PAID plans.
 */
exports.createSubscription = async (req, res) => {
  const { planId } = req.body;
  const { organization: orgId } = req.user;

  try {
    const [plan, organization] = await Promise.all([
        Plan.findById(planId),
        Organization.findById(orgId)
    ]);

    if (!plan) return res.status(404).json({ message: 'Plan not found.' });
    if (!organization) return res.status(404).json({ message: 'Organization not found.' });

    // --- LOGIC FOR FREE PLAN ---
    // If the plan price is 0, create a local subscription and bypass Stripe.
    if (plan.price === 0) {
      const subscription = await Subscription.create({
        organization: orgId,
        plan: planId,
        status: 'active', // Immediately active
        // Set a far-future end date for free plans to represent a lifetime subscription
        currentPeriodEnd: new Date('9999-12-31T23:59:59Z'), 
      });
      return res.status(201).json({ message: 'Subscribed to free plan successfully.', subscription });
    }

    // --- LOGIC FOR PAID PLAN ---
    // For paid plans, redirect to payment flow instead of creating subscription here
    return res.status(200).json({ 
      message: 'Paid plan selected. Please complete payment to activate subscription.',
      planId: planId,
      planName: plan.name,
      planPrice: plan.price,
      redirectTo: '/api/payments/create-order'
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error creating subscription.', error: error.message });
  }
};
