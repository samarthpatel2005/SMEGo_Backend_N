import cron from 'node-cron';
import Product from '../models/Product.js';
import nodemailer from 'nodemailer';

// Send email if product qty < 10
const checkLowStock = async () => {
  const lowStockProducts = await Product.find({ quantity: { $lt: 10 } });
  if (lowStockProducts.length > 0) {
    console.log('⚠ Low stock alert:', lowStockProducts.map(p => p.name));

    // Example: Email (configure in .env)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const message = lowStockProducts.map(p => `${p.name} - Qty: ${p.quantity}`).join('\n');

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ALERT_EMAIL || process.env.EMAIL_USER,
      subject: 'Low Stock Alert',
      text: message,
    });
  }
};

// Schedule every day at 9 AM
cron.schedule('0 9 * * *', () => {
  console.log('⏰ Running low stock check...');
  checkLowStock();
});

export { checkLowStock };