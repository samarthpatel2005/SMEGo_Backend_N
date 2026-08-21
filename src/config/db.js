// config/db.js
const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Create indexes
    await createIndexes();
    
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    // User indexes
    await mongoose.model('User').createIndexes([
      { email: 1 },
      { organization: 1 },
      { emailVerificationToken: 1 }
    ]);

    // Organization indexes
    await mongoose.model('Organization').createIndexes([
      { joinCode: 1 },
      { slug: 1 },
      { owner: 1 }
    ]);

    console.log('Database indexes created');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
};

module.exports = connectDB;