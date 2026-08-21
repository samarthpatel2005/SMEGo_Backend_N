// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./src/config/db');
const { errorMiddleware } = require('./src/middlewares/errorMiddleware');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const employeeRoutes = require('./src/routes/employeeRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const planRoutes = require('./src/routes/planRoutes');
const subscriptionRoutes = require('./src/routes/subscriptionRoutes');
const orgRoutes = require('./src/routes/orgRoutes');
const registrationRoutes = require('./src/routes/registrationRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');
const timesheetRoutes = require('./src/routes/timesheetRoutes');
const payrollRoutes = require('./src/routes/payrollRoutes');
const profileRoutes = require('./src/routes/profileRoutes');

// Business feature modules
const invoiceRoutes = require('./src/routes/invoiceRoutes');
const productRoutes = require('./src/routes/productRoutes');
const transactionRoutes = require('./src/routes/transactionRoutes');
const clientRoutes = require('./src/routes/clientRoutes');
const complaintRoutes = require('./src/routes/complaintRoutes');

// Create Express app
const app = express();

// Connect to database
connectDB();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api', limiter);

// Razorpay webhook route (must be before JSON parsers)
const webhookPath = '/api/webhooks/razorpay';
const { handleRazorpayWebhook } = require('./src/controllers/invoiceController');
app.post(webhookPath, express.raw({ type: '*/*' }), (req, res, next) => {
  try {
    req.body = JSON.parse(req.body.toString('utf8') || '{}');
  } catch {
    req.body = {};
  }
  return handleRazorpayWebhook(req, res, next);
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing
app.use(cookieParser());

// Test route to manually mark invoice as paid (for debugging) - BEFORE auth middleware
app.post('/api/test-mark-paid/:invoiceNumber', async (req, res) => {
	try {
		const { invoiceNumber } = req.params
		const { organizationId } = req.body // Allow specifying organization in request body
		console.log(`Test: Looking for invoice ${invoiceNumber} in organization ${organizationId || 'ANY'}`)
		
		const Invoice = require('./src/models/Invoice')
		
		// Search criteria
		let searchCriteria = { invoiceNumber: invoiceNumber }
		if (organizationId) {
			searchCriteria.organization = organizationId
		}
		
		const invoice = await Invoice.findOne(searchCriteria)
		
		if (!invoice) {
			// If not found with specific org, search globally for debugging
			if (organizationId) {
				const anyInvoice = await Invoice.findOne({ invoiceNumber: invoiceNumber })
				if (anyInvoice) {
					console.log(`Test: Invoice ${invoiceNumber} exists in different organization: ${anyInvoice.organization}`)
					return res.status(404).json({ 
						success: false, 
						message: `Invoice ${invoiceNumber} not found in organization ${organizationId}`,
						debug: `Invoice exists in organization ${anyInvoice.organization}`,
						data: {
							found: true,
							correctOrganization: anyInvoice.organization,
							status: anyInvoice.status,
							id: anyInvoice._id
						}
					})
				}
			}
			
			console.log(`Test: Invoice ${invoiceNumber} not found in database (possibly deleted)`)
			return res.status(404).json({ 
				success: false, 
				message: 'Invoice not found (possibly deleted)',
				debug: organizationId ? `Searched in organization ${organizationId}` : 'Searched globally'
			})
		}

		if (invoice.status === 'paid') {
			return res.json({ 
				success: true, 
				message: `Invoice ${invoiceNumber} already paid`, 
				data: {
					invoiceNumber: invoice.invoiceNumber,
					status: invoice.status,
					organization: invoice.organization,
					paidAt: invoice.paidAt,
					id: invoice._id
				}
			})
		}

		console.log(`Test: Updating invoice ${invoice.invoiceNumber} to paid status`)
		
		invoice.status = 'paid'
		invoice.paidAt = new Date()
		invoice.paymentDate = new Date()
		invoice.paymentMethod = 'manual_test'
		invoice.paymentReference = `test_${Date.now()}`
		await invoice.save()

		console.log(`Test: Invoice ${invoice.invoiceNumber} successfully marked as paid`)

		res.json({ 
			success: true, 
			message: `Invoice ${invoice.invoiceNumber} marked as paid`, 
			data: {
				invoiceNumber: invoice.invoiceNumber,
				status: invoice.status,
				organization: invoice.organization,
				paidAt: invoice.paidAt,
				id: invoice._id
			}
		})
	} catch (e) {
		console.error('Test mark as paid error', e)
		res.status(500).json({ success: false, message: e.message })
	}
})

// Debug route to search for invoices by number
app.get('/api/debug-invoice/:invoiceNumber', async (req, res) => {
	try {
		const { invoiceNumber } = req.params
		console.log(`Debug: Searching for all invoices with number ${invoiceNumber}`)
		
		const Invoice = require('./src/models/Invoice')
		
		// Find all invoices with this number
		const allInvoices = await Invoice.find({ invoiceNumber: invoiceNumber })
		
		// Get the latest invoice to check current numbering
		const latestInvoice = await Invoice.findOne({})
			.sort({ createdAt: -1 })
			.select('invoiceNumber organization createdAt')
		
		// Get count of invoices per organization
		const invoiceCounts = await Invoice.aggregate([
			{ $group: { _id: '$organization', count: { $sum: 1 } } }
		])
		
		res.json({
			success: true,
			data: {
				searchedNumber: invoiceNumber,
				foundInvoices: allInvoices.map(inv => ({
					id: inv._id,
					number: inv.invoiceNumber,
					status: inv.status,
					organization: inv.organization,
					createdAt: inv.createdAt,
					paidAt: inv.paidAt
				})),
				totalFound: allInvoices.length,
				latestInvoice: latestInvoice ? {
					number: latestInvoice.invoiceNumber,
					organization: latestInvoice.organization,
					createdAt: latestInvoice.createdAt
				} : null,
				invoiceCountsByOrganization: invoiceCounts
			}
		})
	} catch (e) {
		console.error('Debug invoice search error', e)
		res.status(500).json({ success: false, message: e.message })
	}
})

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/registration', registrationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/organization', orgRoutes);
app.use("/api/employees", employeeRoutes);
app.use('/api/profile', profileRoutes);
// Business modules
app.use('/api/invoices', invoiceRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/analytics', analyticsRoutes);

// HR modules
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/payroll', payrollRoutes);
// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Error handling middleware
app.use(errorMiddleware);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
