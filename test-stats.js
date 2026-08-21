// Test complaint stats endpoint
const axios = require('axios');

const testComplaintStats = async () => {
  try {
    // First, let's test without authentication to see the error
    console.log('Testing complaint stats endpoint...');
    
    const response = await axios.get('http://localhost:5000/api/complaints/stats', {
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add a valid JWT token here
        // 'Authorization': 'Bearer YOUR_JWT_TOKEN'
      }
    });
    
    console.log('Stats Response:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.status, error.response?.data || error.message);
  }
};

testComplaintStats();
