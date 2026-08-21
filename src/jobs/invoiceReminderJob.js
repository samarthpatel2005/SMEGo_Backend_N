const cron = require('node-cron')
const Invoice = require('../models/Invoice')
const { sendInvoiceEmail } = require('../utils/mailer')
const { generateInvoicePdfBuffer } = require('../utils/pdf')

async function processOverdueInvoices() {
	const now = new Date()
	const invoices = await Invoice.find({ status: { $in: ['sent'] }, dueDate: { $lt: now } })
		.populate('organization', 'name legalName address street city state zipCode postalCode country phone email')
		.populate({
			path: 'organization',
			populate: {
				path: 'owner',
				select: 'fullName'
			}
		})
		.limit(200)
	for (const inv of invoices) {
		try {
			inv.status = 'overdue'
			const pdf = await generateInvoicePdfBuffer(inv)
			await sendInvoiceEmail({ to: inv.client.email, invoice: inv, pdfBuffer: pdf })
			inv.overdueNotifiedAt = new Date()
			await inv.save()
		} catch (e) {
			console.error('Overdue processing failed for invoice', inv._id, e)
		}
	}
}

exports.startInvoiceReminderCron = () => {
	// Run nightly at 02:00 server time
	cron.schedule('0 2 * * *', () => {
		processOverdueInvoices().catch((e) => console.error('Cron error', e))
	})
}
