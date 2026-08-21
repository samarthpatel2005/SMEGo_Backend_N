const PDFDocument = require('pdfkit')

function formatMoney(amount, currency = 'INR') {
  const numAmount = Number(amount) || 0
  if (currency === 'INR') {
    return `INR ${numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(numAmount)
}

function drawBlueBar(doc, y, width = 545, height = 15) {
  doc.rect(50, y, width, height).fill('#4472C4')
}

exports.generateInvoicePdfBuffer = (invoice) => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    const pageWidth = 545 // A4 width minus margins
    let currentY = 50

    // Top Blue Bar
    drawBlueBar(doc, currentY)
    currentY += 25

    // Company Header - Dynamic from Organization
    doc.fillColor('black')
    doc.fontSize(16).font('Helvetica-Bold')
    const organizationName = invoice.organization?.name || invoice.organization?.legalName || 'Your Company Name'
    doc.text(organizationName, 50, currentY)
    currentY += 20

    doc.fontSize(10).font('Helvetica')
    // Build complete address from organization data
    let companyAddress = ''
    if (invoice.organization?.address) {
      // Handle nested address object structure
      const addr = invoice.organization.address
      const addressLines = []
      
      if (addr.street) addressLines.push(addr.street)
      
      // City, State PostalCode on one line
      const cityStateZip = []
      if (addr.city) cityStateZip.push(addr.city)
      if (addr.state) cityStateZip.push(addr.state)
      if (addr.postalCode) cityStateZip.push(addr.postalCode)
      if (cityStateZip.length > 0) addressLines.push(cityStateZip.join(', '))
      
      if (addr.country) addressLines.push(addr.country)
      
      companyAddress = addressLines.join('\n')
    } else if (invoice.organization?.street || invoice.organization?.city) {
      // Handle flat organization structure (if exists)
      const addressParts = []
      if (invoice.organization.street) addressParts.push(invoice.organization.street)
      if (invoice.organization.city) addressParts.push(invoice.organization.city)
      if (invoice.organization.state) addressParts.push(invoice.organization.state)
      if (invoice.organization.zipCode || invoice.organization.postalCode) {
        addressParts.push(invoice.organization.zipCode || invoice.organization.postalCode)
      }
      if (invoice.organization.country) addressParts.push(invoice.organization.country)
      
      companyAddress = addressParts.join(', ')
    }
    
    // Fallback address if no organization address found
    if (!companyAddress.trim()) {
      companyAddress = '77 Namrata Bldg,\nDelhi, Delhi 400077'
    }
    
    doc.text(companyAddress, 50, currentY)
    currentY += 40

    // Bill To and Ship To Section
    const billToY = currentY
    doc.fontSize(10).font('Helvetica-Bold')
    doc.text('BILL TO', 50, billToY)
    doc.text('SHIP TO', 200, billToY)
    
    // Invoice Details Section (Right side)
    doc.text('INVOICE #', 400, billToY)
    doc.text('INVOICE DATE', 400, billToY + 15)
    doc.text('P.O.#', 400, billToY + 30)
    doc.text('DUE DATE', 400, billToY + 45)

    doc.font('Helvetica')
    // Bill To details
    const clientName = invoice.client?.name || 'Client Name'
    const clientAddress = invoice.client?.address || 'Client Address'
    doc.text(clientName, 50, billToY + 15)
    doc.text(clientAddress, 50, billToY + 30)

    // Ship To details (same as Bill To for now)
    doc.text(clientName, 200, billToY + 15)
    doc.text(clientAddress, 200, billToY + 30)

    // Invoice details values
    doc.text(invoice.invoiceNumber || 'INV-001', 480, billToY)
    doc.text(new Date(invoice.issueDate).toLocaleDateString('en-GB') || new Date().toLocaleDateString('en-GB'), 480, billToY + 15)
    doc.text(invoice.poNumber || '24302019', 480, billToY + 30)
    doc.text(new Date(invoice.dueDate).toLocaleDateString('en-GB') || new Date().toLocaleDateString('en-GB'), 480, billToY + 45)

    currentY = billToY + 80

    // Invoice Total (Large)
    doc.fontSize(24).font('Helvetica-Bold')
    doc.text('Invoice Total', 50, currentY)
    doc.text(formatMoney(invoice.totalAmount, invoice.currency), 350, currentY, { align: 'right', width: 195 })
    
    // Horizontal line
    currentY += 35
    doc.moveTo(50, currentY).lineTo(545, currentY).stroke()
    currentY += 15

    // Table Headers
    doc.fontSize(10).font('Helvetica-Bold')
    doc.text('QTY', 50, currentY)
    doc.text('DESCRIPTION', 100, currentY)
    doc.text('UNIT PRICE', 400, currentY)
    doc.text('AMOUNT', 480, currentY)
    currentY += 20

    // Table Items
    doc.font('Helvetica')
    let subtotal = 0
    invoice.items.forEach((item, index) => {
      const qty = item.quantity || 1
      const unitPrice = Number(item.unitPrice) || 0
      const amount = qty * unitPrice
      subtotal += amount

      doc.text(String(qty), 50, currentY)
      doc.text(item.description || `Item ${index + 1}`, 100, currentY, { width: 280 })
      doc.text(formatMoney(unitPrice, invoice.currency), 400, currentY)
      doc.text(formatMoney(amount, invoice.currency), 480, currentY)
      currentY += 20
    })

    // Add some spacing before totals
    currentY += 20

    // Totals Section
    const totalsX = 400
    doc.fontSize(10).font('Helvetica')
    
    // Subtotal
    doc.text('Subtotal', totalsX, currentY)
    doc.text(formatMoney(subtotal, invoice.currency), 480, currentY)
    currentY += 15

    // Tax (GST)
    const taxRate = invoice.taxRate || 12
    const taxAmount = subtotal * (taxRate / 100)
    doc.text(`GST ${taxRate}%`, totalsX, currentY)
    doc.text(formatMoney(taxAmount, invoice.currency), 480, currentY)
    currentY += 30

    // Signature area
    doc.fontSize(12).font('Helvetica-Bold')
    // Get organization owner name or fallback to a default
    const ownerName = invoice.organization?.owner?.fullName || 'Admin'
    doc.text(ownerName, 400, currentY, { align: 'center', width: 145 })
    
    // Signature line
    currentY += 20
    doc.moveTo(400, currentY).lineTo(545, currentY).stroke()
    currentY += 40

    // Terms & Conditions
    doc.fontSize(10).font('Helvetica-Bold')
    doc.text('TERMS & CONDITIONS', 50, currentY)
    currentY += 15

    doc.font('Helvetica')
    const terms = invoice.terms || 'Payment is due within 15 days'
    doc.text(terms, 50, currentY)
    currentY += 20

    // Bank Details
    doc.text('State Bank of India', 50, currentY)
    currentY += 12
    doc.text('Account Number: 12345678', 50, currentY)
    currentY += 12
    doc.text('Routing Number: 098765432110', 50, currentY)
    currentY += 30

    // Bottom Blue Bar
    drawBlueBar(doc, doc.page.height - 65)

    doc.end()
  } catch (e) {
    reject(e)
  }
})
