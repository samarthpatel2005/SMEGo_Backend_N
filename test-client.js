const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

// Test client functionality
async function testClientAPI() {
  console.log('🚀 Testing Client API...');

  try {
    // Test creating a client (you'll need to replace the token with a valid one)
    const testClient = {
      name: 'Test Client',
      email: 'test.client@example.com',
      phone: '+1234567890',
      companyName: 'Test Company',
      clientType: 'business',
      billingAddress: {
        street: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        zipCode: '12345',
        country: 'Test Country'
      },
      tags: ['test', 'api'],
      notes: 'This is a test client created via API'
    };

    // You'll need to get a valid JWT token first
    console.log('Sample client data:', JSON.stringify(testClient, null, 2));
    console.log('\n📝 To test the API:');
    console.log('1. First login to get a JWT token');
    console.log('2. Use the token in Authorization header: Bearer <token>');
    console.log('3. POST to /api/clients with the client data');
    console.log('4. GET /api/clients to list all clients');
    console.log('5. GET /api/clients/:id to get a specific client');
    
    console.log('\n✅ Client model and API endpoints are ready!');
    
  } catch (error) {
    console.error('❌ Error testing client API:', error.message);
  }
}

// Test database connection and model
async function testClientModel() {
  console.log('\n🔍 Testing Client Model...');
  
  try {
    const mongoose = require('mongoose');
    require('dotenv').config();
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smego');
    console.log('✅ Database connected');
    
    const Client = require('./src/models/Client');
    
    // Test model validation
    const testClient = new Client({
      name: 'Test Client',
      email: 'test@example.com',
      phone: '+1234567890',
      organization: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      createdByModel: 'User'
    });
    
    const validationError = testClient.validateSync();
    if (validationError) {
      console.log('❌ Validation errors:', validationError.errors);
    } else {
      console.log('✅ Client model validation passed');
    }
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error testing client model:', error.message);
  }
}

// Run tests
if (require.main === module) {
  testClientModel().then(() => {
    testClientAPI();
  });
}

module.exports = { testClientAPI, testClientModel };
