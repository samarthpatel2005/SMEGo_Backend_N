// routes/timesheetRoutes.js
const express = require('express');
const router = express.Router();
const timesheetController = require('../controllers/timesheetController');
const { protect } = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Apply authentication middleware to all routes
router.use(protect);

// Basic timesheet routes (accessible by all authenticated users)
router.get('/', timesheetController.getTimesheets);
router.post('/', timesheetController.createTimesheet);
router.put('/:id', timesheetController.updateTimesheet);
router.delete('/:id', roleMiddleware(['admin', 'manager', 'hr']), timesheetController.deleteTimesheet);

// Admin routes
router.get('/summary', roleMiddleware(['admin', 'manager']), timesheetController.getTimesheetSummary);
router.post('/bulk-update', roleMiddleware(['admin', 'manager']), timesheetController.bulkUpdateAttendance);
router.get('/daily/:date', roleMiddleware(['admin', 'manager']), timesheetController.getDailyAttendanceSheet);

module.exports = router;
