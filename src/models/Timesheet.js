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
    const diffMs = this.checkOut - this.checkIn;
    const totalHours = diffMs / (1000 * 60 * 60); // Convert to hours

    // Standard work day is 8 hours
    const standardHours = 8;

    if (totalHours <= standardHours) {
      this.regularHours = totalHours;
      this.overtimeHours = 0;
    } else {
      this.regularHours = standardHours;
      this.overtimeHours = totalHours - standardHours;
    }

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

// Static method to get monthly attendance summary
timesheetSchema.statics.getMonthlyAttendanceSummary = async function (employeeId, year, month, organizationId) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const timesheets = await this.find({
    employee: employeeId,
    organization: organizationId,
    date: { $gte: startDate, $lte: endDate }
  });

  const summary = {
    totalDays: endDate.getDate(),
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    halfDays: 0,
    totalHours: 0,
    regularHours: 0,
    overtimeHours: 0,
    timesheets: timesheets
  };

  timesheets.forEach(timesheet => {
    switch (timesheet.attendanceType) {
      case 'present':
        summary.presentDays++;
        break;
      case 'absent':
        summary.absentDays++;
        break;
      case 'leave':
        summary.leaveDays++;
        break;
      case 'half_day':
        summary.halfDays++;
        break;
    }

    summary.totalHours += timesheet.totalHours;
    summary.regularHours += timesheet.regularHours;
    summary.overtimeHours += timesheet.overtimeHours;
  });

  return summary;
};

module.exports = mongoose.model('Timesheet', timesheetSchema);
