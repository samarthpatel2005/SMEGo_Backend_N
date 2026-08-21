// Test email service
require('dotenv').config();
const emailService = require('./src/services/emailService');

async function testEmail() {
  try {
    console.log('Testing email service...');
    console.log('SMTP Configuration:');
    console.log('HOST:', process.env.SMTP_HOST);
    console.log('PORT:', process.env.SMTP_PORT);
    console.log('USER:', process.env.SMTP_USER);
    console.log('FROM_EMAIL:', process.env.FROM_EMAIL);
    
    console.log('EmailService methods:', Object.getOwnPropertyNames(emailService));
    console.log('EmailService prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(emailService)));
    
    // Test sending OTP email
    const testOtp = '123456';
    const testEmail = process.env.SMTP_USER; // Send to self for testing
    
    if (typeof emailService.sendVerificationOtp === 'function') {
      await emailService.sendVerificationOtp(testEmail, testOtp);
      console.log('✅ Test email sent successfully!');
    } else {
      console.log('❌ sendVerificationOtp method not found');
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Email test failed:', error);
    process.exit(1);
  }
}

testEmail();
