// controllers/timesheetController.js
const Timesheet = require('../models/Timesheet');
const Employee = require('../models/Employee');
const mongoose = require('mongoose');

// Create or update timesheet entry
const createOrUpdateTimesheet = async (req, res) => {
  try {
    const { employeeId, date, attendanceType, checkIn, checkOut, leaveType, notes } = req.body;

    // Handle both populated and non-populated organization field
    const organizationId = req.user.organization?._id || req.user.organization;
    const createdBy = req.user.id;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: 'No organization associated with user'
      });
    }

    // Validate employee belongs to organization
    const employee = await Employee.findOne({
      _id: employeeId,
      organization: organizationId
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found in your organization'
      });
    }

    // Parse dates
    const timesheetDate = new Date(date);
    const checkInTime = checkIn ? new Date(checkIn) : null;
    const checkOutTime = checkOut ? new Date(checkOut) : null;

    // Validate check-in/check-out times for present attendance
    if (attendanceType === 'present' && (!checkInTime || !checkOutTime)) {
      return res.status(400).json({
        success: false,
        message: 'Check-in and check-out times are required for present attendance'
      });
    }

    if (checkInTime && checkOutTime && checkOutTime <= checkInTime) {
      return res.status(400).json({
        success: false,
        message: 'Check-out time must be after check-in time'
      });
    }

    // Create or update timesheet
    const timesheetData = {
      employee: employeeId,
      organization: organizationId,
      date: timesheetDate,
      attendanceType,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      leaveType: attendanceType === 'leave' ? leaveType : undefined,
      notes,
      createdBy,
      updatedBy: createdBy,
    };

    const existingTimesheet = await Timesheet.findOne({
      employee: employeeId,
      organization: organizationId,
      date: timesheetDate
    });

    let timesheet;
    if (existingTimesheet) {
      timesheet = await Timesheet.findByIdAndUpdate(
        existingTimesheet._id,
        timesheetData,
        { new: true, runValidators: true }
      ).populate('employee', 'fullName email employeeId');
    } else {
      timesheet = new Timesheet(timesheetData);
      await timesheet.save();
      await timesheet.populate('employee', 'fullName email employeeId');
    }

    res.json({
      success: true,
      data: timesheet,
      message: existingTimesheet ? 'Timesheet updated successfully' : 'Timesheet created successfully'
    });

  } catch (error) {
    console.error('Create/Update timesheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get timesheets for a specific date or date range
const getTimesheets = async (req, res) => {
  try {
    const { date, startDate, endDate, employeeId, status, page = 1, limit = 50 } = req.query;

    // Handle both populated and non-populated organization field
    const organizationId = req.user.organization?._id || req.user.organization;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: 'No organization associated with user'
      });
    }

    // Build query
    const query = { organization: organizationId };

    if (employeeId) {
      query.employee = employeeId;
    }

    if (status) {
      query.status = status;
    }

    if (date) {
      const queryDate = new Date(date);
      query.date = queryDate;
    } else if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const timesheets = await Timesheet.find(query)
      .populate('employee', 'fullName email employeeId department position')
      .populate('approvedBy', 'fullName email')
      .sort({ date: -1, 'employee.fullName': 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Timesheet.countDocuments(query);

    res.json({
      success: true,
      data: {
        timesheets,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get timesheets error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get daily attendance sheet for all employees
const getDailyAttendanceSheet = async (req, res) => {
  try {
    const { date } = req.query;
    const organizationId = req.user.organization;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const queryDate = new Date(date);

    // Get all active employees in the organization
    const employees = await Employee.find({
      organization: organizationId,
      isActive: true
    }).select('fullName email employeeId department position').sort({ fullName: 1 });

    // Get timesheets for the date
    const timesheets = await Timesheet.find({
      organization: organizationId,
      date: queryDate
    }).populate('employee', 'fullName email employeeId');

    // Create a map of employee attendance
    const attendanceMap = new Map();
    timesheets.forEach(timesheet => {
      attendanceMap.set(timesheet.employee._id.toString(), timesheet);
    });

    // Build attendance sheet
    const attendanceSheet = employees.map(employee => {
      const timesheet = attendanceMap.get(employee._id.toString());
      return {
        employee: {
          _id: employee._id,
          fullName: employee.fullName,
          email: employee.email,
          employeeId: employee.employeeId,
          department: employee.department,
          position: employee.position
        },
        attendance: timesheet ? {
          attendanceType: timesheet.attendanceType,
          checkIn: timesheet.checkIn,
          checkOut: timesheet.checkOut,
          totalHours: timesheet.totalHours,
          notes: timesheet.notes,
          status: timesheet.status
        } : null
      };
    });

    res.json({
      success: true,
      data: {
        date: queryDate,
        employees: attendanceSheet,
        summary: {
          totalEmployees: employees.length,
          present: timesheets.filter(t => t.attendanceType === 'present').length,
          absent: timesheets.filter(t => t.attendanceType === 'absent').length,
          onLeave: timesheets.filter(t => t.attendanceType === 'leave').length,
          halfDay: timesheets.filter(t => t.attendanceType === 'half_day').length,
          notMarked: employees.length - timesheets.length
        }
      }
    });

  } catch (error) {
    console.error('Get daily attendance sheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get monthly attendance summary
const getMonthlyAttendanceSummary = async (req, res) => {
  try {
    const { year, month, employeeId } = req.query;
    const organizationId = req.user.organization;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required'
      });
    }

    const query = { organization: organizationId };
    if (employeeId) {
      query.employee = employeeId;
    }

    // Get employees
    const employees = await Employee.find(query).select('fullName email employeeId department position salary salaryType hourlyRate');

    // Get attendance summary for each employee
    const attendanceSummaries = await Promise.all(
      employees.map(async (employee) => {
        const summary = await Timesheet.getMonthlyAttendanceSummary(
          employee._id,
          parseInt(year),
          parseInt(month),
          organizationId
        );

        return {
          employee: {
            _id: employee._id,
            fullName: employee.fullName,
            email: employee.email,
            employeeId: employee.employeeId,
            department: employee.department,
            position: employee.position,
            salary: employee.salary,
            salaryType: employee.salaryType,
            hourlyRate: employee.hourlyRate
          },
          attendance: summary
        };
      })
    );

    res.json({
      success: true,
      data: {
        period: { year: parseInt(year), month: parseInt(month) },
        employees: attendanceSummaries
      }
    });

  } catch (error) {
    console.error('Get monthly attendance summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Approve or reject timesheet
const updateTimesheetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, adminNotes } = req.body;
    const organizationId = req.user.organization;
    const approvedBy = req.user.id;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be approved or rejected'
      });
    }

    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when rejecting timesheet'
      });
    }

    const timesheet = await Timesheet.findOne({
      _id: id,
      organization: organizationId
    });

    if (!timesheet) {
      return res.status(404).json({
        success: false,
        message: 'Timesheet not found'
      });
    }

    timesheet.status = status;
    timesheet.approvedBy = approvedBy;
    timesheet.approvedAt = new Date();
    timesheet.rejectionReason = rejectionReason;
    timesheet.adminNotes = adminNotes;
    timesheet.updatedBy = approvedBy;

    await timesheet.save();
    await timesheet.populate('employee', 'fullName email employeeId');
    await timesheet.populate('approvedBy', 'fullName email');

    res.json({
      success: true,
      data: timesheet,
      message: `Timesheet ${status} successfully`
    });

  } catch (error) {
    console.error('Update timesheet status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Bulk create/update attendance for multiple employees
const bulkUpdateAttendance = async (req, res) => {
  try {
    const { date, attendanceRecords } = req.body;
    const organizationId = req.user.organization;
    const createdBy = req.user.id;

    if (!date || !attendanceRecords || !Array.isArray(attendanceRecords)) {
      return res.status(400).json({
        success: false,
        message: 'Date and attendance records array are required'
      });
    }

    const queryDate = new Date(date);
    const results = [];

    for (const record of attendanceRecords) {
      try {
        const { employeeId, attendanceType, checkIn, checkOut, leaveType, notes } = record;

        // Validate employee
        const employee = await Employee.findOne({
          _id: employeeId,
          organization: organizationId
        });

        if (!employee) {
          results.push({
            employeeId,
            success: false,
            message: 'Employee not found'
          });
          continue;
        }

        const timesheetData = {
          employee: employeeId,
          organization: organizationId,
          date: queryDate,
          attendanceType,
          checkIn: checkIn ? new Date(checkIn) : null,
          checkOut: checkOut ? new Date(checkOut) : null,
          leaveType: attendanceType === 'leave' ? leaveType : undefined,
          notes,
          createdBy,
          updatedBy: createdBy,
        };

        const existingTimesheet = await Timesheet.findOne({
          employee: employeeId,
          organization: organizationId,
          date: queryDate
        });

        let timesheet;
        if (existingTimesheet) {
          timesheet = await Timesheet.findByIdAndUpdate(
            existingTimesheet._id,
            timesheetData,
            { new: true, runValidators: true }
          );
        } else {
          timesheet = new Timesheet(timesheetData);
          await timesheet.save();
        }

        results.push({
          employeeId,
          success: true,
          timesheet,
          message: existingTimesheet ? 'Updated' : 'Created'
        });

      } catch (error) {
        results.push({
          employeeId: record.employeeId,
          success: false,
          message: error.message
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: 'Bulk attendance update completed'
    });

  } catch (error) {
    console.error('Bulk update attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete timesheet entry
const deleteTimesheet = async (req, res) => {
  try {
    const { id } = req.params;

    // Handle both populated and non-populated organization field
    const organizationId = req.user.organization?._id || req.user.organization;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: 'No organization associated with user'
      });
    }

    // Find and delete the timesheet
    const timesheet = await Timesheet.findOneAndDelete({
      _id: id,
      organization: organizationId
    });

    if (!timesheet) {
      return res.status(404).json({
        success: false,
        message: 'Timesheet not found'
      });
    }

    res.json({
      success: true,
      message: 'Timesheet deleted successfully'
    });

  } catch (error) {
    console.error('Delete timesheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update existing timesheet
const updateTimesheet = async (req, res) => {
  try {
    const { id } = req.params;
    const { attendanceType, checkIn, checkOut, leaveType, notes } = req.body;

    // Handle both populated and non-populated organization field
    const organizationId = req.user.organization?._id || req.user.organization;
    const updatedBy = req.user.id;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: 'No organization associated with user'
      });
    }

    // Find existing timesheet
    const existingTimesheet = await Timesheet.findOne({
      _id: id,
      organization: organizationId
    });

    if (!existingTimesheet) {
      return res.status(404).json({
        success: false,
        message: 'Timesheet not found'
      });
    }

    // Parse times if provided
    const checkInTime = checkIn ? new Date(checkIn) : null;
    const checkOutTime = checkOut ? new Date(checkOut) : null;

    // Validate check-in/check-out times for present attendance
    if (attendanceType === 'present' && (!checkInTime || !checkOutTime)) {
      return res.status(400).json({
        success: false,
        message: 'Check-in and check-out times are required for present attendance'
      });
    }

    if (checkInTime && checkOutTime && checkOutTime <= checkInTime) {
      return res.status(400).json({
        success: false,
        message: 'Check-out time must be after check-in time'
      });
    }

    // Update timesheet data
    const updateData = {
      attendanceType,
      checkIn: checkInTime,
      checkOut: checkOutTime,
      leaveType: attendanceType === 'leave' ? leaveType : undefined,
      notes,
      updatedBy,
      updatedAt: new Date()
    };

    const timesheet = await Timesheet.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('employee', 'fullName email employeeId');

    res.json({
      success: true,
      data: timesheet,
      message: 'Timesheet updated successfully'
    });

  } catch (error) {
    console.error('Update timesheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  // Main functions
  createTimesheet: createOrUpdateTimesheet,
  getTimesheets,
  getTimesheet: getTimesheets, // For now, use the same function
  updateTimesheet: updateTimesheet, // Use the dedicated update function
  deleteTimesheet: deleteTimesheet, // Use the new delete function

  // Employee functions
  getMyTimesheets: getTimesheets,
  checkIn: createOrUpdateTimesheet,
  checkOut: createOrUpdateTimesheet,
  updateMyTimesheet: createOrUpdateTimesheet,

  // Admin functions
  approveTimesheet: updateTimesheetStatus,
  rejectTimesheet: updateTimesheetStatus,
  getTimesheetSummary: getMonthlyAttendanceSummary,

  // Bulk operations
  bulkCreateTimesheets: bulkUpdateAttendance,
  exportTimesheetsCSV: getDailyAttendanceSheet, // For now, use daily sheet

  // Legacy functions
  createOrUpdateTimesheet,
  getDailyAttendanceSheet,
  getMonthlyAttendanceSummary,
  updateTimesheetStatus,
  bulkUpdateAttendance
};
