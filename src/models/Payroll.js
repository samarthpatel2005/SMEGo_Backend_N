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
    // --- Attendance-based breakdown fields ---
    perDaySalary: {
      type: Number,
      default: 0,
    },
    effectiveDays: {
      type: Number,
      default: 0,
    },
    earnedBasicSalary: {
      type: Number,
      default: 0,
    },
    absentDeduction: {
      type: Number,
      default: 0,
    },
    // -----------------------------------------
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
      absentDeduction: { type: Number, default: 0 },
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
    this.deductions.absentDeduction +
    this.deductions.lateDeduction +
    this.deductions.other;

  // Calculate net salary
  this.netSalary = this.earnings.grossSalary - this.deductions.totalDeductions;

  next();
});

/**
 * Attendance-based payroll calculation.
 *
 * Formula (monthly salary type):
 *   perDaySalary       = monthlySalary / totalDaysInPeriod
 *   effectiveDays      = presentDays + (halfDays × 0.5)
 *   earnedBasicSalary  = perDaySalary × effectiveDays
 *   absentDeduction    = perDaySalary × absentDays
 *   leaveDeduction     = perDaySalary × leaveDays   (unpaid leave)
 *   netSalary          = earnedBasicSalary + bonus - fixedDeduction
 *
 * The leaveDeductionPerDay in the salary structure acts as an override;
 * if it is 0 (or not set), the system auto-computes it from perDaySalary.
 */
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
  const bonus = structure.bonus ?? 0;
  const fixedDeduction = structure.fixedDeduction ?? 0;

  // Total calendar days in the payroll period
  const totalDaysInPeriod = attendanceSummary.totalDays || 1;

  let basicSalary = 0;
  let perDaySalary = 0;
  let effectiveDays = 0;
  let earnedBasicSalary = 0;
  let absentDeductionAmt = 0;
  let leaveDeductionAmt = 0;
  let halfDayDeductionAmt = 0;
  let overtimePay = 0;

  if (salaryType === 'monthly') {
    // Auto per-day rate
    perDaySalary = baseSalary / totalDaysInPeriod;

    // effectiveDays = present days + half-days counted as 0.5
    effectiveDays = attendanceSummary.presentDays + (attendanceSummary.halfDays * 0.5);

    // Earned basic salary = only for days actually worked
    earnedBasicSalary = perDaySalary * effectiveDays;

    // Absent deduction (auto) — days marked absent
    absentDeductionAmt = perDaySalary * attendanceSummary.absentDays;

    // Leave deduction — use override if set, else auto per-day rate
    const leaveRatePerDay = (structure.leaveDeductionPerDay && structure.leaveDeductionPerDay > 0)
      ? structure.leaveDeductionPerDay
      : perDaySalary;
    leaveDeductionAmt = leaveRatePerDay * attendanceSummary.leaveDays;

    // Half-day already factored into effectiveDays above;
    // if an explicit halfDayDeductionPerDay is set, use it as additional deduction
    if (structure.halfDayDeductionPerDay && structure.halfDayDeductionPerDay > 0) {
      halfDayDeductionAmt = structure.halfDayDeductionPerDay * attendanceSummary.halfDays;
      // Recompute earnedBasicSalary without half-day 0.5 factor, add explicit deduction instead
      effectiveDays = attendanceSummary.presentDays + attendanceSummary.halfDays; // count half-days as full for base
      earnedBasicSalary = perDaySalary * effectiveDays - halfDayDeductionAmt;
    }

    basicSalary = earnedBasicSalary;

  } else {
    // Hourly salary — pay for hours worked
    basicSalary = attendanceSummary.totalHours * hourlyRate;
    earnedBasicSalary = basicSalary;
    perDaySalary = hourlyRate * 8; // 8h reference day
    effectiveDays = attendanceSummary.presentDays + (attendanceSummary.halfDays * 0.5);

    // Overtime pay (1.5× rate)
    overtimePay = attendanceSummary.overtimeHours * hourlyRate * 1.5;
  }

  const grossSalary = basicSalary + bonus + overtimePay;
  const totalDeductions = absentDeductionAmt + leaveDeductionAmt + fixedDeduction;
  const netSalary = Math.max(grossSalary - totalDeductions, 0);

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
    // Attendance-based breakdown
    perDaySalary: Math.round(perDaySalary * 100) / 100,
    effectiveDays: Math.round(effectiveDays * 100) / 100,
    earnedBasicSalary: Math.round(earnedBasicSalary * 100) / 100,
    absentDeduction: Math.round(absentDeductionAmt * 100) / 100,
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
      bonus,
      grossSalary: Math.round(grossSalary * 100) / 100,
    },
    deductions: {
      tax: 0,
      socialSecurity: 0,
      insurance: 0,
      leaveDeduction: Math.round(leaveDeductionAmt * 100) / 100,
      absentDeduction: Math.round(absentDeductionAmt * 100) / 100,
      lateDeduction: 0,
      other: Math.round(fixedDeduction * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
    },
    netSalary: Math.round(netSalary * 100) / 100,
  };
};

module.exports = mongoose.model('Payroll', payrollSchema);
