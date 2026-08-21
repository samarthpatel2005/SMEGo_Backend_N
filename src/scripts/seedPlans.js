// scripts/seedPlans.js
const mongoose = require('mongoose');
const Plan = require('../models/Plan');
require('dotenv').config();

const plans = [
  {
    name: 'basic',
    displayName: 'Basic Plan',
    price: 0, // Free plan
    currency: 'INR',
    interval: 'month',
    limits: {
      employees: 5,
      clients: 25,
      invoices: 100
    },
    features: [
      'Up to 5 employees',
      'Up to 25 clients',
      '100 invoices per month',
      'Basic reporting',
      'Email support'
    ],
    isActive: true
  },
  {
    name: 'pro',
    displayName: 'Pro Plan',
    price: 25000, // ₹250.00 in paise
    currency: 'INR',
    interval: 'month',
    limits: {
      employees: 10,
      clients: 50,
      invoices: -1 // unlimited
    },
    features: [
      'Up to 10 employees',
      'Up to 50 clients',
      'Unlimited invoices',
      'Advanced reporting',
      'Priority email support',
      'Integration with third-party apps'
    ],
    isActive: true
  }
];

async function seedPlans() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const plan of plans) {
      const existingPlan = await Plan.findOne({ name: plan.name });
      if (existingPlan) {
        await Plan.updateOne({ _id: existingPlan._id }, plan);
        console.log(`Updated plan: ${plan.displayName}`);
      } else {
        await Plan.create(plan);
        console.log(`Created plan: ${plan.displayName}`);
      }
    }

    console.log('Plans seeding completed ✅');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding plans:', err);
    process.exit(1);
  }
}

seedPlans();