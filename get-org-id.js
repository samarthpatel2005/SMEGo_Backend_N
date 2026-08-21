// Get valid organization ID from database
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
    
    // Get the first organization
    const Organization = require('./src/models/Organization');
    const org = await Organization.findOne({});
    
    if (org) {
      console.log('Valid Organization ID:', org._id.toString());
      console.log('Organization Name:', org.name);
    } else {
      console.log('No organizations found in database');
    }
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

connectDB();
