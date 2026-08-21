const express = require('express')
const router = express.Router()
const complaintController = require('../controllers/complaintController')
const { protect } = require('../middlewares/authMiddleware')
const roleMiddleware = require('../middlewares/roleMiddleware')

// Public route - for clients to submit complaints
router.post('/submit', complaintController.createComplaint)

// Protected routes - require authentication
router.get('/', protect, complaintController.getComplaints)
router.get('/stats', protect, complaintController.getComplaintStats)
router.get('/:id', protect, complaintController.getComplaintById)
router.put('/:id', protect, complaintController.updateComplaint)

// Admin only routes
router.delete('/:id', protect, roleMiddleware(['admin']), complaintController.deleteComplaint)

module.exports = router
