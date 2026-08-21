// models/Invoice.js
const mongoose = require('mongoose')

const invoiceItemSchema = new mongoose.Schema({
	productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // Link to product
	description: { type: String, required: true, trim: true },
	sku: { type: String }, // Snapshot of SKU at time of invoice
	quantity: { type: Number, required: true, min: 0 },
	unitPrice: { type: Number, required: true, min: 0 }, // Price at time of invoice
	costPrice: { type: Number, default: 0 }, // For COGS calculation
	taxRate: { type: Number, default: 0 }, // percent, e.g., 10
	amount: { type: Number, required: true, min: 0 },
	isInventoryItem: { type: Boolean, default: true }, // Track if this affects inventory
}, { _id: false })

const invoiceSchema = new mongoose.Schema({
	organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
	createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

	invoiceNumber: { type: String, required: true, index: true },

	client: {
		id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
		name: { type: String, required: true },
		email: { type: String, required: true },
		address: { type: String }
	},

	items: { type: [invoiceItemSchema], default: [] },

	currency: { type: String, default: 'USD' },
	subtotal: { type: Number, default: 0 },
	taxAmount: { type: Number, default: 0 },
	discountAmount: { type: Number, default: 0 },
	totalAmount: { type: Number, default: 0 },

	notes: String,
	terms: String,

	issueDate: { type: Date, default: () => new Date() },
	dueDate: { type: Date, required: true },
	paymentDate: { type: Date },

	status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], default: 'draft', index: true },
	sentAt: Date,
	paidAt: Date,
	overdueNotifiedAt: Date,

	stripe: {
		checkoutSessionId: String,
		paymentIntentId: String,
		paymentUrl: String
	},

	// Inventory tracking
	stockReserved: { type: Boolean, default: false },
	stockFulfilled: { type: Boolean, default: false },
	stockDeducted: { type: Boolean, default: false },
	stockDeductedAt: { type: Date },
	stockFulfilledAt: { type: Date },
	reservationId: String, // For tracking stock reservations

	// Financial tracking
	totalCOGS: { type: Number, default: 0 }, // Cost of Goods Sold
	grossProfit: { type: Number, default: 0 }, // Revenue - COGS

}, { timestamps: true })

invoiceSchema.statics.generateInvoiceNumber = async function (organizationId) {
	const year = new Date().getFullYear()
	const prefix = `INV-${year}-`
	// Search globally across ALL organizations for the highest invoice number
	const last = await this.findOne({ invoiceNumber: { $regex: `^${prefix}` } })
		.sort({ createdAt: -1 })
		.select('invoiceNumber')

	let next = 1
	if (last && last.invoiceNumber) {
		const match = last.invoiceNumber.match(/INV-\d{4}-(\d+)/)
		if (match) next = parseInt(match[1], 10) + 1
	}
	return `${prefix}${String(next).padStart(4, '0')}`
}

module.exports = mongoose.model('Invoice', invoiceSchema)