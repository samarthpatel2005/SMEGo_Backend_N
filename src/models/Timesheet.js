// models/Timesheet.js
const mongoose = require("mongoose");

const timesheetSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    attendanceType: {
      type: String,
      enum: ['present', 'absent', 'leave', 'half_day'],
      required: true,
    },
    checkIn: {
      type: Date,
    },
    checkOut: {
      type: Date,
    },
    totalHours: {
      type: Number,
      default: 0,
    },
    regularHours: {
      type: Number,
      default: 0,
    },
    overtimeHours: {
      type: Number,
      default: 0,
    },
    leaveType: {
      type: String,
      enum: ['sick', 'casual', 'annual', 'unpaid', 'maternity', 'paternity'],
    },
    notes: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    isManualEntry: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for employee, organization, and date
timesheetSchema.index({ employee: 1, organization: 1, date: 1 }, { unique: true });

// Pre-save middleware to calculate total hours
timesheetSchema.pre('save', function (next) {
  if (this.checkIn && this.checkOut && this.attendanceType === 'present') {
    const totalHours = (this.checkOut - this.checkIn) / (1000 * 60 * 60);
    const standardHours = 8;
    this.regularHours = Math.min(totalHours, standardHours);
    this.overtimeHours = Math.max(totalHours - standardHours, 0);
    this.totalHours = totalHours;
  } else if (this.attendanceType === 'half_day') {
    this.regularHours = 4;
    this.overtimeHours = 0;
    this.totalHours = 4;
  } else {
    this.regularHours = 0;
    this.overtimeHours = 0;
    this.totalHours = 0;
  }
  next();
});

timesheetSchema.statics.getAttendanceSummary = async function (employeeId, startDate, endDate, organizationId) {
  const rangeStart = new Date(startDate);
  const rangeEnd = new Date(endDate);
  rangeStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(23, 59, 59, 999);

  const timesheets = await this.find({
    employee: employeeId,
    organization: organizationId,
    date: { $gte: rangeStart, $lte: rangeEnd }
  });

  const summary = {
    totalDays: Math.floor((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1,
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    halfDays: 0,
    totalHours: 0,
    regularHours: 0,
    overtimeHours: 0,
    timesheets
  };

  timesheets.forEach(timesheet => {
    if (timesheet.attendanceType === 'present') summary.presentDays++;
    if (timesheet.attendanceType === 'absent') summary.absentDays++;
    if (timesheet.attendanceType === 'leave') summary.leaveDays++;
    if (timesheet.attendanceType === 'half_day') summary.halfDays++;
    summary.totalHours += timesheet.totalHours;
    summary.regularHours += timesheet.regularHours;
    summary.overtimeHours += timesheet.overtimeHours;
  });

  return summary;
};

// Preserve the existing monthly API used by attendance reporting.
timesheetSchema.statics.getMonthlyAttendanceSummary = async function (employeeId, year, month, organizationId) {
  return this.getAttendanceSummary(
    employeeId,
    new Date(year, month - 1, 1),
    new Date(year, month, 0),
    organizationId
  );
};

module.exports = mongoose.model('Timesheet', timesheetSchema);
