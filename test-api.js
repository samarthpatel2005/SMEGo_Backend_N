const axios = require('axios');

async function testAPI() {
  const baseURL = 'http://localhost:5000';
  
  console.log('Testing backend API endpoints...\n');
  
  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthRes = await axios.get(`${baseURL}/health`);
    console.log('✅ Health endpoint working:', healthRes.data);
  } catch (err) {
    console.log('❌ Health endpoint failed:', err.message);
  }
  
  try {
    // Test products endpoint without auth
    console.log('\n2. Testing products endpoint (no auth)...');
    const productsRes = await axios.get(`${baseURL}/api/products`);
    console.log('✅ Products endpoint working:', productsRes.data);
  } catch (err) {
    console.log('❌ Products endpoint failed:', err.response?.status, err.response?.data || err.message);
  }
  
  try {
    // Test invoices endpoint without auth
    console.log('\n3. Testing invoices endpoint (no auth)...');
    const invoicesRes = await axios.get(`${baseURL}/api/invoices`);
    console.log('✅ Invoices endpoint working:', invoicesRes.data);
  } catch (err) {
    console.log('❌ Invoices endpoint failed:', err.response?.status, err.response?.data || err.message);
  }
  
  try {
    // Test transactions endpoint without auth
    console.log('\n4. Testing transactions endpoint (no auth)...');
    const transactionsRes = await axios.get(`${baseURL}/api/transactions`);
    console.log('✅ Transactions endpoint working:', transactionsRes.data);
  } catch (err) {
    console.log('❌ Transactions endpoint failed:', err.response?.status, err.response?.data || err.message);
  }
}

testAPI();
