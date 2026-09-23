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
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
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
payrollSchema.statics.calculatePayroll = async function (employeeId, periodOrYear, monthOrOrganizationId, organizationId) {
  const Employee = mongoose.model('Employee');
  const Timesheet = mongoose.model('Timesheet');

  // Get employee details
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new Error('Employee not found');
  }

  const period = typeof periodOrYear === 'object'
    ? periodOrYear
    : {
      year: periodOrYear,
      month: monthOrOrganizationId,
      startDate: new Date(periodOrYear, monthOrOrganizationId - 1, 1),
      endDate: new Date(periodOrYear, monthOrOrganizationId, 0),
      organizationId
    };
  const resolvedOrganizationId = period.organizationId || (
    typeof periodOrYear === 'object' ? monthOrOrganizationId : organizationId
  );
  const attendanceSummary = await Timesheet.getAttendanceSummary(
    employeeId,
    period.startDate,
    period.endDate,
    resolvedOrganizationId
  );
  // Determine salary type and base salary
  const structure = employee.salaryStructure;
  if (!structure || !structure.salaryType) {
    throw new Error('Salary structure is required before generating payroll');
  }

  const salaryType = structure.salaryType;
  const baseSalary = structure.salary || 0;
  const hourlyRate = structure.hourlyRate || 0;

  // Calculate basic salary based on type
  let basicSalary = 0;
  if (salaryType === 'monthly') {
    // Attendance-based leave and half-day adjustments are applied as deductions below.
    basicSalary = baseSalary;
  } else {
    // For hourly salary
    basicSalary = attendanceSummary.totalHours * hourlyRate;
  }

  const dailySalary = salaryType === 'monthly'
    ? baseSalary / Math.max(attendanceSummary.totalDays, 1)
    : 0;
  const unpaidLeaveDays = attendanceSummary.absentDays + attendanceSummary.leaveDays;
  const leaveDeduction = salaryType === 'monthly'
    ? unpaidLeaveDays * (structure.leaveDeductionPerDay ?? dailySalary)
    : 0;
  const halfDayDeduction = salaryType === 'monthly'
    ? attendanceSummary.halfDays * (structure.halfDayDeductionPerDay ?? dailySalary * 0.5)
    : 0;
  const bonus = structure.bonus ?? 0;
  const fixedAndHalfDayDeduction = (structure.fixedDeduction ?? 0) + halfDayDeduction;
  const grossSalary = basicSalary + bonus;
  const totalDeductions = leaveDeduction + fixedAndHalfDayDeduction;
  const netSalary = grossSalary - totalDeductions;

  return {
    employee: employeeId,
    organization: resolvedOrganizationId,
    payrollPeriod: {
      month: period.month,
      year: period.year,
      startDate: period.startDate,
      endDate: period.endDate
    },
    salaryType,
    baseSalary: salaryType === 'hourly' ? basicSalary : baseSalary,
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
      overtimePay: 0,
      allowances: {
        transportation: 0,
        food: 0,
        medical: 0,
        housing: 0,
        other: 0,
      },
      bonus,
      grossSalary: Math.round(grossSalary * 100) / 100,
    },
    deductions: {
      tax: 0,
      socialSecurity: 0,
      insurance: 0,
      leaveDeduction: Math.round(leaveDeduction * 100) / 100,
      lateDeduction: 0,
      other: Math.round(fixedAndHalfDayDeduction * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
    },
    netSalary: Math.round(netSalary * 100) / 100,
  };
};

module.exports = mongoose.model('Payroll', payrollSchema);
