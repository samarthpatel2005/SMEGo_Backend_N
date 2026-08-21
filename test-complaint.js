// Test complaint submission
const axios = require('axios');

const testComplaintSubmission = async () => {
  try {
    const testData = {
      clientName: "Test Client",
      clientEmail: "test@example.com",
      clientPhone: "1234567890",
      subject: "Test Complaint",
      description: "This is a test complaint to verify the API is working",
      priority: "medium",
      category: "other",
      invoiceNumber: "INV-2025-0029",
      organizationId: "68aca820cf39d438cfa49528" // Valid organization ID from database
    };

    console.log('Sending test complaint...', testData);
    
    const response = await axios.post('http://localhost:5000/api/complaints/submit', testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Success:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
};

testComplaintSubmission();
