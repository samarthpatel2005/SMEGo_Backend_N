// Test MongoDB connection
const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
  try {
    console.log('Testing MongoDB connection...');
    console.log('MongoDB URI:', process.env.MONGODB_URI.replace(/:([^:@]+)@/, ':****@')); // Hide password
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 seconds
      connectTimeoutMS: 10000,
    });

    console.log('✅ MongoDB Connected successfully!');
    console.log('Host:', conn.connection.host);
    console.log('Database:', conn.connection.name);
    
    // Test a simple operation
    const collections = await conn.connection.db.listCollections().toArray();
    console.log('Collections found:', collections.length);
    
    await mongoose.connection.close();
    console.log('Connection closed.');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    
    if (error.code) {
      console.error('Error Code:', error.code);
    }
    
    // Specific error handling
    if (error.message.includes('authentication failed')) {
      console.log('\n🔧 Possible solutions:');
      console.log('1. Check username/password in MONGODB_URI');
      console.log('2. Verify database user permissions');
    } else if (error.message.includes('connection timed out')) {
      console.log('\n🔧 Possible solutions:');
      console.log('1. Check your internet connection');
      console.log('2. Verify IP whitelist in MongoDB Atlas');
      console.log('3. Try connecting from a different network');
      console.log('4. Check if Atlas cluster is paused/sleeping');
    } else if (error.message.includes('ENOTFOUND')) {
      console.log('\n🔧 Possible solutions:');
      console.log('1. Check MongoDB cluster hostname');
      console.log('2. Verify DNS resolution');
    }
    
    process.exit(1);
  }
}

testConnection();
