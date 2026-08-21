const Invoice = require('../models/Invoice')
const { sendInvoiceEmail } = require('../utils/mailer')
const { generateInvoicePdfBuffer } = require('../utils/pdf')
const razorpay = require('../config/razorpay')
const Product = require('../models/Product')
const inventoryService = require('../services/inventoryService')

// Helpers
function computeTotals(items = [], discountAmount = 0) {
	const subtotal = items.reduce((s, it) => s + (it.quantity * it.unitPrice), 0)
	const taxAmount = items.reduce((s, it) => s + ((it.quantity * it.unitPrice) * (it.taxRate || 0) / 100), 0)
	const total = Math.max(0, subtotal + taxAmount - (discountAmount || 0))
	return { subtotal, taxAmount, total }
}

exports.createInvoice = async (req, res) => {
	try {
		const { client, items, currency = 'USD', notes, terms, dueDate, discountAmount = 0 } = req.body
		if (!client?.name || !client?.email) {
			return res.status(400).json({ success: false, message: 'Client name and email are required' })
		}
		if (!Array.isArray(items) || items.length === 0) {
			return res.status(400).json({ success: false, message: 'At least one item is required' })
		}

		const invoiceNumber = await Invoice.generateInvoiceNumber(req.user.organization)

		// Enhanced item preparation with product integration
		const preparedItems = await Promise.all(items.map(async (it) => {
			const baseItem = {
				description: it.description,
				quantity: Number(it.quantity) || 0,
				unitPrice: Number(it.unitPrice) || 0,
				taxRate: Number(it.taxRate) || 0,
				amount: (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)
			}

			// Check if item references a product
			if (it.productId || it.sku) {
				const product = await Product.findOne({
					$or: [
						{ _id: it.productId },
						{ sku: it.sku }
					],
					organization: req.user.organization
				})

				if (product) {
					// Validate stock availability
					if (product.trackInventory && product.qty < it.quantity) {
						throw new Error(`Insufficient stock for ${product.name}. Available: ${product.qty}, Required: ${it.quantity}`)
					}

					// Add product information to item
					baseItem.productId = product._id
					baseItem.sku = product.sku
					baseItem.costPrice = product.costPrice || 0
					baseItem.description = product.name
					baseItem.unitPrice = it.unitPrice || product.price
					baseItem.amount = baseItem.quantity * baseItem.unitPrice
				}
			}

			return baseItem
		}))

		const totals = computeTotals(preparedItems, discountAmount)

		// Calculate total cost of goods sold
		const totalCOGS = preparedItems.reduce((sum, item) => {
			return sum + ((item.costPrice || 0) * item.quantity)
		}, 0)

		const invoice = await Invoice.create({
			organization: req.user.organization,
			createdBy: req.user._id,
			invoiceNumber,
			client,
			items: preparedItems,
			currency,
			notes,
			terms,
			dueDate,
			subtotal: totals.subtotal,
			taxAmount: totals.taxAmount,
			discountAmount,
			totalAmount: totals.total,
			totalCOGS,
			grossProfit: totals.subtotal - totalCOGS,
			status: 'draft'
		})

		// Immediately deduct stock for products on invoice creation
		console.log('🔄 Attempting to deduct stock for invoice:', invoice._id);
		console.log('📦 Invoice items:', invoice.items.map(item => ({ 
			description: item.description, 
			productId: item.productId, 
			quantity: item.quantity 
		})));
		
		try {
			const deductionResults = await inventoryService.deductStockForInvoice(invoice.items, req.user.organization, req.user._id, invoice._id)
			console.log('✅ Stock deduction successful:', deductionResults);
			invoice.stockDeducted = true
			invoice.stockDeductedAt = new Date()
			await invoice.save()
		} catch (stockError) {
			console.error('❌ Stock deduction failed:', stockError.message)
			// Continue with invoice creation but add warning
			invoice.notes = `${invoice.notes || ''}\n[Warning: Stock deduction failed - ${stockError.message}]`
			await invoice.save()
		}

		res.status(201).json({ 
			success: true, 
			data: invoice,
			stockDeducted: true
		})
	} catch (e) {
		console.error('createInvoice error', e)
		res.status(500).json({ 
			success: false, 
			message: e.message || 'Failed to create invoice' 
		})
	}
}

exports.listInvoices = async (req, res) => {
	try {
		const { status } = req.query
		const query = { organization: req.user.organization }
		if (status) query.status = status
		const invoices = await Invoice.find(query).sort({ createdAt: -1 })
		res.json({ success: true, data: invoices })
	} catch (e) {
		console.error('listInvoices error', e)
		res.status(500).json({ success: false, message: 'Failed to list invoices' })
	}
}

exports.getInvoice = async (req, res) => {
	try {
		const invoice = await Invoice.findOne({ _id: req.params.id, organization: req.user.organization })
			.populate('organization', 'name legalName address street city state zipCode postalCode country phone email')
			.populate({
				path: 'organization',
				populate: {
					path: 'owner',
					select: 'fullName'
				}
			})
		if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' })
		res.json({ success: true, data: invoice })
	} catch (e) {
		res.status(500).json({ success: false, message: 'Failed to get invoice' })
	}
}

exports.updateInvoice = async (req, res) => {
  try {
    const { items, discountAmount, status } = req.body
    const currentInvoice = await Invoice.findOne({ 
      _id: req.params.id, 
      organization: req.user.organization 
    })
    
    if (!currentInvoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' })
    }

    const update = { ...req.body }
    
    if (items) {
      // Enhanced item preparation with product integration
      const preparedItems = await Promise.all(items.map(async (it) => {
        const baseItem = {
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
          taxRate: Number(it.taxRate) || 0,
          amount: (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)
        }

        // Check if item references a product
        if (it.productId || it.sku) {
          const product = await Product.findOne({
            $or: [
              { _id: it.productId },
              { sku: it.sku }
            ],
            organization: req.user.organization
          })

          if (product) {
            baseItem.productId = product._id
            baseItem.sku = product.sku
            baseItem.costPrice = product.costPrice || 0
            baseItem.description = product.name
            baseItem.unitPrice = it.unitPrice || product.sellingPrice
            baseItem.amount = baseItem.quantity * baseItem.unitPrice
          }
        }

        return baseItem
      }))

      const totals = computeTotals(preparedItems, discountAmount ?? 0)
      
      // Calculate total cost of goods sold
      const totalCOGS = preparedItems.reduce((sum, item) => {
        return sum + ((item.costPrice || 0) * item.quantity)
      }, 0)

      update.items = preparedItems
      update.subtotal = totals.subtotal
      update.taxAmount = totals.taxAmount
      update.totalAmount = totals.total
      update.totalCOGS = totalCOGS
      update.grossProfit = totals.subtotal - totalCOGS
    }

    // Handle status changes for stock fulfillment
    if (status && status !== currentInvoice.status) {
      if (status === 'paid' && currentInvoice.status !== 'paid') {
        // Fulfill reserved stock when invoice is marked as paid
        try {
          await inventoryService.fulfillStockForInvoice(req.params.id, req.user._id)
          update.stockFulfilled = true
          update.stockFulfilledAt = new Date()
        } catch (stockError) {
          console.warn('Stock fulfillment failed:', stockError.message)
          update.notes = `${update.notes || currentInvoice.notes || ''}\n[Warning: Stock fulfillment failed - ${stockError.message}]`
        }
      }
    }

    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organization },
      update,
      { new: true, runValidators: true }
    )

    res.json({ 
      success: true, 
      data: invoice,
      stockFulfilled: update.stockFulfilled || false
    })
  } catch (e) {
    console.error('updateInvoice error', e)
    res.status(500).json({ 
      success: false, 
      message: e.message || 'Failed to update invoice' 
    })
  }
}

exports.deleteInvoice = async (req, res) => {
  try {
    const invoiceId = req.params.id
    const organizationId = req.user.organization
    
    console.log(`🗑️ Delete request: Invoice ID: ${invoiceId}, Organization: ${organizationId}`)
    
    // First check if invoice exists
    const existingInvoice = await Invoice.findOne({ 
      _id: invoiceId, 
      organization: organizationId 
    })
    
    if (!existingInvoice) {
      console.log(`❌ Invoice not found: ${invoiceId}`)
      return res.status(404).json({ success: false, message: 'Invoice not found' })
    }
    
    console.log(`📄 Found invoice: ${existingInvoice.invoiceNumber} (${existingInvoice.status})`)
    
    // Delete the invoice
    const deletedInvoice = await Invoice.findOneAndDelete({ 
      _id: invoiceId, 
      organization: organizationId 
    })
    
    if (deletedInvoice) {
      console.log(`✅ Successfully deleted invoice: ${deletedInvoice.invoiceNumber}`)
      
      // Restore stock if it was deducted
      if (deletedInvoice.stockDeducted) {
        try {
          await inventoryService.restoreStockForDeletedInvoice(deletedInvoice.items, organizationId, req.user._id, deletedInvoice._id)
          console.log(`✅ Stock restored for deleted invoice: ${deletedInvoice.invoiceNumber}`)
        } catch (stockError) {
          console.warn('Stock restoration failed:', stockError.message)
        }
      }
      
      res.json({ 
        success: true, 
        message: 'Invoice deleted successfully and stock restored',
        deletedInvoice: {
          id: deletedInvoice._id,
          invoiceNumber: deletedInvoice.invoiceNumber,
          status: deletedInvoice.status
        }
      })
    } else {
      console.log(`❌ Failed to delete invoice: ${invoiceId}`)
      res.status(500).json({ success: false, message: 'Failed to delete invoice' })
    }
  } catch (e) {
    console.error('❌ Delete invoice error:', e)
    res.status(500).json({ success: false, message: 'Failed to delete invoice', error: e.message })
  }
}

exports.generatePdf = async (req, res) => {
	try {
		const invoice = await Invoice.findOne({ _id: req.params.id, organization: req.user.organization })
			.populate('organization', 'name companyName address street city state zipCode postalCode country phone email')
			.populate({
				path: 'organization',
				populate: {
					path: 'owner',
					select: 'fullName'
				}
			})
		if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' })
		const pdf = await generateInvoicePdfBuffer(invoice)
		res.setHeader('Content-Type', 'application/pdf')
		res.setHeader('Content-Disposition', `inline; filename=${invoice.invoiceNumber}.pdf`)
		res.send(pdf)
	} catch (e) {
		console.error('generatePdf error', e)
		res.status(500).json({ success: false, message: 'Failed to generate PDF' })
	}
}

exports.sendInvoice = async (req, res) => {
	try {
		const invoice = await Invoice.findOne({ _id: req.params.id, organization: req.user.organization })
			.populate('organization', 'name companyName address street city state zipCode postalCode country phone email')
			.populate({
				path: 'organization',
				populate: {
					path: 'owner',
					select: 'fullName'
				}
			})
		if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' })

		const pdf = await generateInvoicePdfBuffer(invoice)
		await sendInvoiceEmail({
			to: invoice.client.email,
			invoice: invoice,
			pdfBuffer: pdf
		})

		if (invoice.status === 'draft') {
			invoice.status = 'sent'
		}
		invoice.sentAt = new Date()
		await invoice.save()
		res.json({ success: true, message: 'Invoice sent', data: invoice })
	} catch (e) {
		console.error('sendInvoice error', e)
		res.status(500).json({ success: false, message: 'Failed to send invoice' })
	}
}


exports.createCheckout = async (req, res) => {
	try {
		const invoice = await Invoice.findOne({ _id: req.params.id, organization: req.user.organization })
		if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' })
		if (invoice.status === 'paid') return res.status(400).json({ success: false, message: 'Invoice already paid' })

		// Check if payment link already exists
		if (invoice.razorpay?.paymentLinkId) {
			// Return existing payment link
			return res.json({ success: true, data: { url: invoice.razorpay.shortUrl } })
		}

		// Create a Razorpay Payment Link for the invoice
		const currency = (invoice.currency || 'INR').toUpperCase()
		
		try {
			const link = await razorpay.paymentLink.create({
				amount: Math.round((invoice.totalAmount || 0) * 100),
				currency,
				reference_id: `${invoice._id}_${Date.now()}`, // Make reference_id unique
				description: `Invoice ${invoice.invoiceNumber}`,
				customer: {
					name: invoice.client?.name,
					email: invoice.client?.email,
				},
				notify: { email: true, sms: false },
				reminder_enable: true,
				callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard/invoices/success?id=${invoice._id}`,
				callback_method: 'get',
			})

			invoice.razorpay = { paymentLinkId: link.id, shortUrl: link.short_url, status: link.status }
			await invoice.save()

			res.json({ success: true, data: { url: link.short_url } })
		} catch (razorpayError) {
			// If it's a duplicate reference_id error, try with a different reference
			if (razorpayError.error?.code === 'BAD_REQUEST_ERROR' && razorpayError.error?.description?.includes('reference_id')) {
				const link = await razorpay.paymentLink.create({
					amount: Math.round((invoice.totalAmount || 0) * 100),
					currency,
					reference_id: `inv_${invoice._id}_${Math.random().toString(36).substr(2, 9)}`,
					description: `Invoice ${invoice.invoiceNumber}`,
					customer: {
						name: invoice.client?.name,
						email: invoice.client?.email,
					},
					notify: { email: true, sms: false },
					reminder_enable: true,
					callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard/invoices/success?id=${invoice._id}`,
					callback_method: 'get',
				})

				invoice.razorpay = { paymentLinkId: link.id, shortUrl: link.short_url, status: link.status }
				await invoice.save()

				res.json({ success: true, data: { url: link.short_url } })
			} else {
				throw razorpayError
			}
		}
	} catch (e) {
		console.error('createCheckout (Razorpay) error', e)
		res.status(500).json({ success: false, message: e.message || 'Failed to create Razorpay payment link' })
	}
}

// Razorpay webhook handler to mark invoice as paid
exports.handleRazorpayWebhook = async (req, res) => {
	try {
		console.log('Webhook received:', JSON.stringify(req.body, null, 2))
		
		const crypto = require('crypto')
		const signature = req.headers['x-razorpay-signature']
		const secret = process.env.RAZORPAY_WEBHOOK_SECRET
		
		// Skip signature verification if webhook secret is not set (for testing)
		if (secret) {
			const body = JSON.stringify(req.body)
			const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
			if (expected !== signature) {
				console.log('Webhook signature verification failed')
				return res.status(400).json({ success: false, message: 'Invalid signature' })
			}
		}

		const event = req.body
		console.log('Processing webhook event:', event?.event)
		
		// payment_link.paid or order.paid
		let referenceId
		if (event?.event === 'payment_link.paid') {
			referenceId = event?.payload?.payment_link?.entity?.reference_id
		} else if (event?.event === 'order.paid') {
			referenceId = event?.payload?.order?.entity?.notes?.reference_id
		}

		console.log('Reference ID from webhook:', referenceId)

		if (referenceId) {
			// Extract invoice ID from reference_id (handle different formats)
			let invoiceId = referenceId
			
			// If reference_id contains underscore, extract the invoice ID part
			if (referenceId.includes('_')) {
				// Format: "inv_<invoiceId>_<randomString>" or "<invoiceId>_<timestamp>"
				const parts = referenceId.split('_')
				if (parts[0] === 'inv' && parts.length >= 2) {
					invoiceId = parts[1] // Extract the invoice ID from "inv_<invoiceId>_<random>"
				} else if (parts.length >= 2) {
					invoiceId = parts[0] // Extract the invoice ID from "<invoiceId>_<timestamp>"
				}
			}

			console.log('Extracted invoice ID:', invoiceId)

			const invoice = await Invoice.findById(invoiceId)
				.populate('organization', 'name legalName address street city state zipCode postalCode country phone email')
				.populate({
					path: 'organization',
					populate: {
						path: 'owner',
						select: 'fullName'
					}
				})
			if (invoice && invoice.status !== 'paid') {
				console.log(`Updating invoice ${invoice.invoiceNumber} to paid status`)
				
				invoice.status = 'paid'
				invoice.paidAt = new Date()
				invoice.paymentDate = new Date()
				invoice.paymentMethod = 'razorpay'
				invoice.paymentReference = event?.payload?.payment?.entity?.id || event?.payload?.payment_link?.entity?.id
				await invoice.save()

				// Send payment confirmation email with PDF
				try {
					const pdfBuffer = await generateInvoicePdfBuffer(invoice)
					await sendInvoiceEmail({
						to: invoice.client.email,
						invoice: invoice,
						pdfBuffer: pdfBuffer
					})
					console.log(`Payment confirmation email sent for invoice ${invoice.invoiceNumber}`)
				} catch (emailError) {
					console.warn('Failed to send payment confirmation email:', emailError.message)
				}
				// Stock is already deducted on invoice creation
				// No additional stock fulfillment needed on payment
			}
		}

		res.json({ received: true })
	} catch (e) {
		console.error('Razorpay webhook error', e)
		res.status(400).json({ success: false, message: e.message })
	}
}

// Manual payment processing endpoint
exports.markAsPaid = async (req, res) => {
	try {
		const { paymentMethod, paymentReference, paymentDate } = req.body
		const invoice = await Invoice.findOne({ 
			_id: req.params.id, 
			organization: req.user.organization 
		})
		
		if (!invoice) {
			return res.status(404).json({ success: false, message: 'Invoice not found' })
		}
		
		if (invoice.status === 'paid') {
			return res.status(400).json({ success: false, message: 'Invoice already paid' })
		}

		invoice.status = 'paid'
		invoice.paidAt = new Date(paymentDate || Date.now())
		invoice.paymentDate = new Date(paymentDate || Date.now())
		invoice.paymentMethod = paymentMethod || 'manual'
		invoice.paymentReference = paymentReference

		await invoice.save()

		// Stock is already deducted on invoice creation
		// No additional stock fulfillment needed on payment

		res.json({ 
			success: true, 
			data: invoice,
			message: 'Invoice marked as paid'
		})
	} catch (e) {
		console.error('markAsPaid error', e)
		res.status(500).json({ 
			success: false, 
			message: 'Failed to mark invoice as paid' 
		})
	}
}

// Get inventory insights for invoice dashboard
exports.getInventoryInsights = async (req, res) => {
	try {
		const insights = await inventoryService.getInventoryValuation(req.user.organization)
		const lowStockProducts = await inventoryService.getLowStockProducts(req.user.organization)
		
		res.json({
			success: true,
			data: {
				...insights,
				lowStockProducts,
				lowStockCount: lowStockProducts.length
			}
		})
	} catch (e) {
		console.error('getInventoryInsights error', e)
		res.status(500).json({ 
			success: false, 
			message: 'Failed to get inventory insights' 
		})
	}
}

// Get profit analytics for invoices
exports.getProfitAnalytics = async (req, res) => {
	try {
		const { startDate, endDate } = req.query
		const query = { 
			organization: req.user.organization,
			status: 'paid'
		}
		
		if (startDate || endDate) {
			query.paidAt = {}
			if (startDate) query.paidAt.$gte = new Date(startDate)
			if (endDate) query.paidAt.$lte = new Date(endDate)
		}

		const invoices = await Invoice.find(query)
		
		const analytics = invoices.reduce((acc, invoice) => {
			acc.totalRevenue += invoice.totalAmount || 0
			acc.totalCOGS += invoice.totalCOGS || 0
			acc.totalProfit += invoice.grossProfit || 0
			acc.invoiceCount += 1
			return acc
		}, {
			totalRevenue: 0,
			totalCOGS: 0,
			totalProfit: 0,
			invoiceCount: 0
		})

		analytics.profitMargin = analytics.totalRevenue > 0 
			? ((analytics.totalProfit / analytics.totalRevenue) * 100).toFixed(2)
			: '0.00'

		res.json({
			success: true,
			data: analytics
		})
	} catch (e) {
		console.error('getProfitAnalytics error', e)
		res.status(500).json({ 
			success: false, 
			message: 'Failed to get profit analytics' 
		})
	}
}

// Test endpoint to manually mark invoice as paid (for debugging)
exports.testMarkAsPaid = async (req, res) => {
	try {
		const { invoiceNumber } = req.params
		console.log(`Test: Looking for invoice ${invoiceNumber} in organization ${req.user.organization}`)
		
		// First, check if invoice exists in current organization
		const invoice = await Invoice.findOne({ 
			invoiceNumber: invoiceNumber,
			organization: req.user.organization 
		})
		
		if (!invoice) {
			// Check if invoice exists in ANY organization (for debugging)
			const anyInvoice = await Invoice.findOne({ invoiceNumber: invoiceNumber })
			if (anyInvoice) {
				console.log(`Test: Invoice ${invoiceNumber} exists but belongs to different organization: ${anyInvoice.organization}`)
				return res.status(404).json({ 
					success: false, 
					message: `Invoice ${invoiceNumber} not found in your organization`,
					debug: `Invoice exists in organization ${anyInvoice.organization}` 
				})
			} else {
				console.log(`Test: Invoice ${invoiceNumber} does not exist in database (possibly deleted)`)
				return res.status(404).json({ 
					success: false, 
					message: `Invoice ${invoiceNumber} not found (possibly deleted)` 
				})
			}
		}

		if (invoice.status === 'paid') {
			return res.json({ 
				success: true, 
				message: `Invoice ${invoiceNumber} already paid`, 
				data: invoice 
			})
		}

		console.log(`Test: Updating invoice ${invoice.invoiceNumber} to paid status`)
		
		invoice.status = 'paid'
		invoice.paidAt = new Date()
		invoice.paymentDate = new Date()
		invoice.paymentMethod = 'test'
		invoice.paymentReference = `test_${Date.now()}`
		await invoice.save()

		console.log(`Test: Invoice ${invoice.invoiceNumber} successfully marked as paid`)

		res.json({ 
			success: true, 
			message: `Invoice ${invoice.invoiceNumber} marked as paid`, 
			data: invoice 
		})
	} catch (e) {
		console.error('Test mark as paid error', e)
		res.status(500).json({ success: false, message: e.message })
	}
}

// Test endpoint to check invoice numbering and search for invoices
exports.testInvoiceSearch = async (req, res) => {
	try {
		const { invoiceNumber } = req.params
		console.log(`Debug: Searching for invoice ${invoiceNumber}`)
		
		// Search in current organization
		const orgInvoice = await Invoice.findOne({ 
			invoiceNumber: invoiceNumber,
			organization: req.user.organization 
		})
		
		// Search globally
		const allInvoices = await Invoice.find({ invoiceNumber: invoiceNumber })
		
		// Get latest invoice number to see current numbering
		const latestInvoice = await Invoice.findOne({})
			.sort({ createdAt: -1 })
			.select('invoiceNumber organization createdAt')
		
		res.json({
			success: true,
			data: {
				searchedNumber: invoiceNumber,
				currentOrganization: req.user.organization,
				foundInOrganization: orgInvoice ? {
					id: orgInvoice._id,
					number: orgInvoice.invoiceNumber,
					status: orgInvoice.status,
					organization: orgInvoice.organization
				} : null,
				foundGlobally: allInvoices.map(inv => ({
					id: inv._id,
					number: inv.invoiceNumber,
					status: inv.status,
					organization: inv.organization,
					createdAt: inv.createdAt
				})),
				latestInvoice: latestInvoice ? {
					number: latestInvoice.invoiceNumber,
					organization: latestInvoice.organization,
					createdAt: latestInvoice.createdAt
				} : null,
				totalCount: allInvoices.length
			}
		})
	} catch (e) {
		console.error('Test invoice search error', e)
		res.status(500).json({ success: false, message: e.message })
	}
}