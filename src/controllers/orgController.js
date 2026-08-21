const Organization = require('../models/Organization');
const User = require('../models/User');
const Plan = require('../models/Plan'); // <-- Import Plan model
const Subscription = require('../models/Subscription'); // <-- Import Subscription model

/**
 * Creates an Organization and can optionally subscribe it to a FREE plan
 * in the same step to streamline onboarding.
 */
exports.createOrganization = async (req, res) => {
  // 'planId' is now an optional field in the request body
  const { name, country, timezone, currency, planId, ...optionalFields } = req.body;

  try {
    const user = req.user;
    
    if (user.role !== 'admin' && user.role !== 'owner' || user.organization) {
        return res.status(403).json({ message: 'Not authorized or organization already exists.' });
    }

    // 1. Create the Organization
    const newOrg = await Organization.create({
      name, country, timezone, currency,
      ...optionalFields,
      owner: user._id,
    });

    // 2. Link the organization to the user
    user.organization = newOrg._id;
    await user.save();

    // 3. If a free planId was provided, create the subscription immediately
    if (planId) {
        const plan = await Plan.findById(planId);
        // IMPORTANT: Only proceed if the plan exists and its price is 0
        if (plan && plan.price === 0) {
            await Subscription.create({
                organization: newOrg._id,
                plan: planId,
                status: 'active',
                currentPeriodEnd: new Date('9999-12-31T23:59:59Z'),
            });
        }
    }

    res.status(201).json({
        message: 'Organization created successfully.',
        organization: newOrg
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// Get current user's organization
exports.getCurrentOrganization = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user || !user.organization) {
      return res.status(404).json({
        success: false,
        message: 'No organization found for user'
      });
    }

    res.json({
      success: true,
      organization: {
        id: user.organization._id,
        name: user.organization.name,
        joinCode: user.organization.joinCode,
        address: user.organization.address,
        taxId: user.organization.taxId,
        country: user.organization.country,
        timezone: user.organization.timezone,
        currency: user.organization.currency,
        settings: {
          currency: user.organization.currency,
          timezone: user.organization.timezone,
          dateFormat: user.organization.dateFormat || 'MM/DD/YYYY'
        }
      }
    });
  } catch (error) {
    console.error('Error getting current organization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get organization'
    });
  }
};
