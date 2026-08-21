// Quick database check script
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');
const Organization = require('./src/models/Organization');
const Subscription = require('./src/models/Subscription');

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Count documents
    const userCount = await User.countDocuments();
    const orgCount = await Organization.countDocuments();
    const subCount = await Subscription.countDocuments();
    
    console.log('\n📊 Database Summary:');
    console.log(`Users: ${userCount}`);
    console.log(`Organizations: ${orgCount}`);
    console.log(`Subscriptions: ${subCount}`);
    
    // Get recent users with organizations
    const recentUsers = await User.find()
      .populate('organization')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('email fullName role organization createdAt');
      
    console.log('\n👥 Recent Users:');
    recentUsers.forEach(user => {
      console.log(`- ${user.email} (${user.role}) - Org: ${user.organization?.name || 'NO ORGANIZATION'} - Created: ${user.createdAt}`);
    });
    
    // Get recent organizations
    const recentOrgs = await Organization.find()
      .populate('owner', 'email fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name owner createdAt');
      
    console.log('\n🏢 Recent Organizations:');
    recentOrgs.forEach(org => {
      console.log(`- ${org.name} - Owner: ${org.owner?.email || 'NO OWNER'} - Created: ${org.createdAt}`);
    });
    
    // Get recent subscriptions
    const recentSubs = await Subscription.find()
      .populate('userId', 'email')
      .populate('organization', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('userId organization status createdAt');
      
    console.log('\n💳 Recent Subscriptions:');
    recentSubs.forEach(sub => {
      console.log(`- User: ${sub.userId?.email || 'NO USER'} - Org: ${sub.organization?.name || 'NO ORG'} - Status: ${sub.status} - Created: ${sub.createdAt}`);
    });
    
  } catch (error) {
    console.error('Database check error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkDatabase();
