const router = require('express').Router()
const { protect } = require('../middlewares/authMiddleware')
const ctrl = require('../controllers/invoiceController')

// Note: For Stripe webhooks we need the raw body; mounted separately in server

router.use(protect)

router.get('/', ctrl.listInvoices)
router.post('/', ctrl.createInvoice)
router.get('/analytics/profit', ctrl.getProfitAnalytics)
router.get('/analytics/inventory', ctrl.getInventoryInsights)
router.get('/:id', ctrl.getInvoice)
router.put('/:id', ctrl.updateInvoice)
router.delete('/:id', ctrl.deleteInvoice)
router.post('/:id/mark-paid', ctrl.markAsPaid)

router.get('/:id/pdf', ctrl.generatePdf)
router.post('/:id/send', ctrl.sendInvoice)
router.post('/:id/checkout', ctrl.createCheckout)

module.exports = router
