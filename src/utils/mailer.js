const nodemailer = require('nodemailer')

// Basic transporter using env or ethereal for dev
async function getTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    })
  }

  // Fallback: Ethereal test account
  const testAccount = await nodemailer.createTestAccount()
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass }
  })
}

exports.sendInvoiceEmail = async ({ to, invoice, pdfBuffer }) => {
  // Validate required parameters
  if (!to) {
    throw new Error('Email recipient (to) is required')
  }
  if (!invoice) {
    throw new Error('Invoice object is required')
  }
  if (!invoice.invoiceNumber) {
    throw new Error('Invoice number is required')
  }
  if (!pdfBuffer) {
    throw new Error('PDF buffer is required')
  }

  const transporter = await getTransporter()
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const organizationId = invoice.organization?._id || invoice.organization
  const complaintFormUrl = `${frontendUrl}/complaint-form?invoice=${invoice.invoiceNumber}&org=${organizationId}&email=${encodeURIComponent(to)}&name=${encodeURIComponent(invoice.client?.name || '')}`

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || 'no-reply@smego.local',
    to,
    subject: `Invoice ${invoice.invoiceNumber}`,
    text: `Please find attached invoice ${invoice.invoiceNumber}. Total: ${invoice.totalAmount} ${invoice.currency}.\n\nIf you have any issues or complaints regarding this invoice, please click the following link: ${complaintFormUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Invoice ${invoice.invoiceNumber}</h2>
        <p>Dear ${invoice.client?.name || 'Valued Customer'},</p>
        <p>Please find attached invoice <strong>${invoice.invoiceNumber}</strong>.</p>
        <p>Total Amount: <strong>${invoice.totalAmount} ${invoice.currency}</strong></p>
        
        <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px; border-left: 4px solid #007bff;">
          <h3 style="margin-top: 0; color: #007bff;">Need Help or Have a Complaint?</h3>
          <p>If you have any issues, questions, or complaints regarding this invoice, we're here to help!</p>
          <a href="${complaintFormUrl}" 
             style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Submit a Complaint or Inquiry
          </a>
        </div>
        
        <p>Thank you for your business!</p>
        <p>Best regards,<br>Your SMEGo Team</p>
      </div>
    `,
    attachments: [
      { filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }
    ]
  })

  if (nodemailer.getTestMessageUrl(info)) {
    console.log('Ethereal preview URL:', nodemailer.getTestMessageUrl(info))
  }

  return info
}
