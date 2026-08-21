// models/Payroll.js
const mongoose = require("mongoose");

const payrollSchema = new mongoose.Schema(
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
    payrollPeriod: {
      month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
      },
      year: {
        type: Number,
        required: true,
      },
    },
    salaryType: {
      type: String,
      enum: ['monthly', 'hourly'],
      required: true,
    },
    baseSalary: {
      type: Number,
      required: true,
    },
    hourlyRate: {
      type: Number, // Used for hourly employees
    },
    workingDays: {
      total: { type: Number, default: 0 },
      present: { type: Number, default: 0 },
      absent: { type: Number, default: 0 },
      leave: { type: Number, default: 0 },
      halfDay: { type: Number, default: 0 },
    },
    hours: {
      regularHours: { type: Number, default: 0 },
      overtimeHours: { type: Number, default: 0 },
      totalHours: { type: Number, default: 0 },
    },
    earnings: {
      basicSalary: { type: Number, default: 0 },
      overtimePay: { type: Number, default: 0 },
      allowances: {
        transportation: { type: Number, default: 0 },
        food: { type: Number, default: 0 },
        medical: { type: Number, default: 0 },
        housing: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
      bonus: { type: Number, default: 0 },
      grossSalary: { type: Number, default: 0 },
    },
    deductions: {
      tax: { type: Number, default: 0 },
      socialSecurity: { type: Number, default: 0 },
      insurance: { type: Number, default: 0 },
      leaveDeduction: { type: Number, default: 0 },
      lateDeduction: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      totalDeductions: { type: Number, default: 0 },
    },
    netSalary: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'paid', 'rejected'],
      default: 'draft',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'check', 'cash', 'digital_wallet', 'razorpay'],
    },
    paymentReference: {
      type: String,
      trim: true,
    },
    paymentOrderId: {
      type: String,
      trim: true,
    },
    paymentAmount: {
      type: Number,
    },
    paymentDate: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    slipGenerated: {
      type: Boolean,
      default: false,
    },
    slipGeneratedAt: {
      type: Date,
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

// Create compound index for employee, organization, and payroll period
payrollSchema.index({
  employee: 1,
  organization: 1,
  'payrollPeriod.year': 1,
  'payrollPeriod.month': 1
}, { unique: true });

// Pre-save middleware to calculate net salary
payrollSchema.pre('save', function (next) {
  // Calculate total allowances
  const totalAllowances = Object.values(this.earnings.allowances).reduce((sum, val) => sum + val, 0);

  // Calculate gross salary
  this.earnings.grossSalary =
    this.earnings.basicSalary +
    this.earnings.overtimePay +
    totalAllowances +
    this.earnings.bonus;

  // Calculate total deductions
  this.deductions.totalDeductions =
    this.deductions.tax +
    this.deductions.socialSecurity +
    this.deductions.insurance +
    this.deductions.leaveDeduction +
    this.deductions.lateDeduction +
    this.deductions.other;

  // Calculate net salary
  this.netSalary = this.earnings.grossSalary - this.deductions.totalDeductions;

  next();
});

// Static method to calculate payroll for an employee
payrollSchema.statics.calculatePayroll = async function (employeeId, year, month, organizationId) {
  const Employee = mongoose.model('Employee');
  const Timesheet = mongoose.model('Timesheet');

  // Get employee details
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new Error('Employee not found');
  }

  // Get timesheet summary for the month
  const attendanceSummary = await Timesheet.getMonthlyAttendanceSummary(
    employeeId,
    year,
    month,
    organizationId
  );

  // Determine salary type and base salary
  const salaryType = employee.salary ? 'monthly' : 'hourly';
  const baseSalary = employee.salary || 0;
  const hourlyRate = employee.hourlyRate || 0;

  // Calculate basic salary based on type
  let basicSalary = 0;
  if (salaryType === 'monthly') {
    // For monthly salary, prorate based on working days
    const totalDaysInMonth = attendanceSummary.totalDays;
    const workedDays = attendanceSummary.presentDays + (attendanceSummary.halfDays * 0.5);
    basicSalary = (baseSalary / totalDaysInMonth) * workedDays;
  } else {
    // For hourly salary
    basicSalary = attendanceSummary.regularHours * hourlyRate;
  }

  // Calculate overtime pay (1.5x regular rate)
  const overtimeRate = salaryType === 'hourly' ? hourlyRate * 1.5 : (baseSalary / (22 * 8)) * 1.5;
  const overtimePay = attendanceSummary.overtimeHours * overtimeRate;

  // Calculate leave deduction for unpaid leaves
  const leaveDeduction = attendanceSummary.absentDays * (baseSalary / attendanceSummary.totalDays);

  return {
    employee: employeeId,
    organization: organizationId,
    payrollPeriod: { month, year },
    salaryType,
    baseSalary,
    hourlyRate,
    workingDays: {
      total: attendanceSummary.totalDays,
      present: attendanceSummary.presentDays,
      absent: attendanceSummary.absentDays,
      leave: attendanceSummary.leaveDays,
      halfDay: attendanceSummary.halfDays,
    },
    hours: {
      regularHours: attendanceSummary.regularHours,
      overtimeHours: attendanceSummary.overtimeHours,
      totalHours: attendanceSummary.totalHours,
    },
    earnings: {
      basicSalary: Math.round(basicSalary * 100) / 100,
      overtimePay: Math.round(overtimePay * 100) / 100,
      allowances: {
        transportation: 0,
        food: 0,
        medical: 0,
        housing: 0,
        other: 0,
      },
      bonus: 0,
    },
    deductions: {
      tax: Math.round(basicSalary * 0.1 * 100) / 100, // 10% tax
      socialSecurity: Math.round(basicSalary * 0.05 * 100) / 100, // 5% social security
      insurance: 0,
      leaveDeduction: Math.round(leaveDeduction * 100) / 100,
      lateDeduction: 0,
      other: 0,
    },
  };
};

module.exports = mongoose.model('Payroll', payrollSchema);
