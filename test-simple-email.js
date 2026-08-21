// Simple email service for testing
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

async function testSimpleEmail() {
  try {
    console.log('Testing simple email...');
    
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: process.env.SMTP_USER, // Send to self
      subject: 'Test Email from SMEGo',
      html: '<h1>Test Email</h1><p>If you receive this, email service is working!</p>'
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', result.messageId);
    
  } catch (error) {
    console.error('❌ Email failed:', error);
  }
}

testSimpleEmail();
