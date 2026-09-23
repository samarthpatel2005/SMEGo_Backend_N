// controllers/payrollController.js
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Timesheet = require('../models/Timesheet');
const razorpay = require('../config/razorpay');
const mongoose = require('mongoose');

const getOrganizationId = (user) => user.organization?._id || user.organization;

const getPayrollPeriod = (values) => {
  const { year, month, startDate, endDate } = values;
  if ((startDate && !endDate) || (!startDate && endDate)) {
    throw new Error('Both start date and end date are required');
  }

  const rangeStart = startDate ? new Date(`${startDate}T00:00:00`) : new Date(Number(year), Number(month) - 1, 1);
  const rangeEnd = endDate ? new Date(`${endDate}T23:59:59.999`) : new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeStart > rangeEnd) {
    throw new Error('A valid payroll date range is required');
  }

  return {
    year: rangeStart.getFullYear(),
    month: rangeStart.getMonth() + 1,
    startDate: rangeStart,
    endDate: rangeEnd
  };
};

const getSalaryStructure = async (req, res) => {
  try {
    const employee = await Employee.findOne({
      _id: req.params.employeeId,
      organization: getOrganizationId(req.user)
    }).select('fullName employeeId salaryStructure');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.json({ success: true, data: employee });
  } catch (error) {
    console.error('Get salary structure error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

const updateSalaryStructure = async (req, res) => {
  try {
    const {
      salaryType,
      salary,
      hourlyRate,
      bonus = 0,
      fixedDeduction = 0,
      leaveDeductionPerDay = 0,
      halfDayDeductionPerDay = 0
    } = req.body;

    if (!['monthly', 'hourly'].includes(salaryType)) {
      return res.status(400).json({ success: false, message: 'Salary type must be monthly or hourly' });
    }
    if (salaryType === 'monthly' && (!Number.isFinite(Number(salary)) || Number(salary) < 0)) {
      return res.status(400).json({ success: false, message: 'Monthly salary is required' });
    }
    if (salaryType === 'hourly' && (!Number.isFinite(Number(hourlyRate)) || Number(hourlyRate) < 0)) {
      return res.status(400).json({ success: false, message: 'Hourly rate is required' });
    }

    const employee = await Employee.findOne({
      _id: req.params.employeeId,
      organization: getOrganizationId(req.user)
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    employee.salaryStructure = {
      salaryType,
      salary: Number(salary) || 0,
      hourlyRate: Number(hourlyRate) || 0,
      bonus: Math.max(Number(bonus) || 0, 0),
      fixedDeduction: Math.max(Number(fixedDeduction) || 0, 0),
      leaveDeductionPerDay: Math.max(Number(leaveDeductionPerDay) || 0, 0),
      halfDayDeductionPerDay: Math.max(Number(halfDayDeductionPerDay) || 0, 0),
      effectiveFrom: employee.salaryStructure?.effectiveFrom || new Date(),
      updatedBy: req.user.id
    };

    await employee.save();
    res.json({ success: true, message: 'Salary structure saved successfully', data: employee.salaryStructure });
  } catch (error) {
    console.error('Update salary structure error:', error);
    res.status(500).json({ success: false, message: 'Failed to save salary structure', error: error.message });
  }
};

// Get all employees for payroll
const getEmployeesForPayroll = async (req, res) => {
  try {
    const { year, month, startDate, endDate } = req.query;
    const organizationId = getOrganizationId(req.user);

    let period;
    try {
      period = getPayrollPeriod({ year, month, startDate, endDate });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Get all active employees
    const employees = await Employee.find({
      organization: organizationId,
      isActive: true
    }).select('fullName email employeeId department position salary salaryType hourlyRate salaryStructure hireDate')
      .sort({ fullName: 1 });

    // Calculate payroll data for each employee based on attendance
    const employeesWithPayroll = await Promise.all(
      employees.map(async (employee) => {
        // Get attendance summary for the employee for the selected period
        const attendanceSummary = await Timesheet.getAttendanceSummary(
          employee._id,
          period.startDate,
          period.endDate,
          organizationId
        );

        const hasSalaryStructure = !!employee.salaryStructure?.salaryType;
        const payrollData = hasSalaryStructure
          ? await Payroll.calculatePayroll(employee._id, period, organizationId)
          : null;

        // Check if payroll already exists
        const existingPayroll = await Payroll.findOne({
          employee: employee._id,
          organization: organizationId,
          'payrollPeriod.year': period.year,
          'payrollPeriod.month': period.month,
          ...(startDate && endDate ? {
            'payrollPeriod.startDate': period.startDate,
            'payrollPeriod.endDate': period.endDate
          } : {})
        });

        return {
          employee: employee.toObject(),
          attendance: attendanceSummary,
          payrollData,
          hasSalaryStructure,
          hasExistingPayroll: !!existingPayroll,
          existingPayrollId: existingPayroll?._id,
          payrollStatus: existingPayroll?.status || 'not_generated'
        };
      })
    );

    res.json({
      success: true,
      data: {
        employees: employeesWithPayroll,
        period: {
          year: period.year,
          month: period.month,
          startDate: period.startDate.toISOString().slice(0, 10),
          endDate: period.endDate.toISOString().slice(0, 10)
        }
      }
    });

  } catch (error) {
    console.error('Get employees for payroll error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Generate payroll for specific employees
const generatePayrollForEmployees = async (req, res) => {
  try {
    const { year, month, startDate, endDate, employeeIds } = req.body;
    const organizationId = getOrganizationId(req.user);
    const createdBy = req.user.id;

    if (!employeeIds || !Array.isArray(employeeIds)) {
      return res.status(400).json({
        success: false,
        message: 'Employee IDs are required'
      });
    }

    let period;
    try {
      period = getPayrollPeriod({ year, month, startDate, endDate });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    const results = [];

    for (const employeeId of employeeIds) {
      try {
        const employee = await Employee.findOne({ _id: employeeId, organization: organizationId });
        if (!employee) {
          throw new Error('Employee not found in this organization');
        }
        if (!employee.salaryStructure || !employee.salaryStructure.salaryType) {
          throw new Error('Salary structure must be set before generating payroll');
        }

        // Check if payroll already exists
        const existingPayrollQuery = {
          employee: employeeId,
          organization: organizationId,
          'payrollPeriod.year': period.year,
          'payrollPeriod.month': period.month
        };
        if (startDate && endDate) {
          existingPayrollQuery['payrollPeriod.startDate'] = period.startDate;
          existingPayrollQuery['payrollPeriod.endDate'] = period.endDate;
        }
        const existingPayroll = await Payroll.findOne(existingPayrollQuery);

        if (existingPayroll) {
          results.push({
            employeeId,
            success: false,
            message: 'Payroll already exists for this period',
            payrollId: existingPayroll._id
          });
          continue;
        }

        // Calculate payroll
        const payrollData = await Payroll.calculatePayroll(
          employeeId,
          period,
          organizationId
        );

        payrollData.createdBy = createdBy;
        payrollData.status = 'approved'; // Auto-approve for payment

        // Create payroll record
        const payroll = new Payroll(payrollData);
        await payroll.save();

        await payroll.populate('employee', 'fullName email employeeId department position');

        results.push({
          employeeId,
          success: true,
          payrollId: payroll._id,
          payroll: payroll,
          message: 'Payroll generated successfully'
        });

      } catch (error) {
        const employee = await Employee.findById(employeeId);
        results.push({
          employeeId,
          employeeName: employee?.fullName || 'Unknown',
          success: false,
          message: error.message
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: 'Payroll generation completed'
    });

  } catch (error) {
    console.error('Generate payroll for employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Create Razorpay payment for payroll
const createPayrollPayment = async (req, res) => {
  try {
    const { payrollIds, customAmount } = req.body;
    const organizationId = getOrganizationId(req.user);

    if (!payrollIds || !Array.isArray(payrollIds) || payrollIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payroll IDs are required'
      });
    }

    // Get payroll records
    const payrolls = await Payroll.find({
      _id: { $in: payrollIds },
      organization: organizationId,
      status: 'approved'
    }).populate('employee', 'fullName email employeeId');

    if (payrolls.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No approved payrolls found'
      });
    }

    // Calculate total amount - use custom amount if provided for single payroll
    let totalAmount;
    if (customAmount && payrolls.length === 1) {
      totalAmount = Math.max(customAmount, 1); // Minimum ₹1
    } else {
      totalAmount = payrolls.reduce((sum, payroll) => {
        const amount = payroll.netSalary || payroll.baseSalary || 1000;
        return sum + Math.max(amount, 1);
      }, 0);
    }

    // Ensure minimum amount for Razorpay (₹1)
    totalAmount = Math.max(totalAmount, 1);

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: `payroll_${Date.now()}`,
      notes: {
        type: 'payroll',
        payrollIds: payrollIds.join(','),
        organizationId: organizationId.toString(),
        employeeCount: String(payrolls.length),
        customAmount: customAmount ? String(customAmount) : ''
      }
    });

    // Store payment info in payrolls
    for (const payroll of payrolls) {
      const paymentAmount = customAmount && payrolls.length === 1
        ? customAmount
        : (payroll.netSalary || payroll.baseSalary || 1000);

      // Update payroll using updateOne to avoid validation issues
      await Payroll.updateOne(
        { _id: payroll._id },
        {
          $set: {
            paymentOrderId: order.id,
            paymentAmount: paymentAmount
          }
        }
      );
    }

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: totalAmount,
        currency: 'INR',
        payrolls: payrolls.map(p => ({
          _id: p._id,
          employee: p.employee,
          amount: customAmount && payrolls.length === 1
            ? customAmount
            : (p.netSalary || p.baseSalary || 1000)
        }))
      }
    });

  } catch (error) {
    console.error('Create payroll payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment',
      error: error.message
    });
  }
};

// Verify and mark payroll as paid after successful Razorpay payment (for test/frontend callback)
const verifyPayrollPayment = async (req, res) => {
  try {
    const { payrollIds, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const organizationId = getOrganizationId(req.user);

    if (!payrollIds || !Array.isArray(payrollIds) || payrollIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Payroll IDs are required' });
    }

    // In test mode, trust the payment if we have razorpay_payment_id
    const isTestMode = (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_');
    let verified = false;

    if (isTestMode && razorpay_payment_id) {
      // Test mode: trust the callback — no webhook needed for localhost
      verified = true;
    } else if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      // Production: verify HMAC signature
      const crypto = require('crypto');
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');
      verified = expectedSignature === razorpay_signature;
    }

    if (!verified) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // Mark payrolls as paid
    const result = await Payroll.updateMany(
      {
        _id: { $in: payrollIds },
        organization: organizationId,
        status: 'approved'
      },
      {
        $set: {
          status: 'paid',
          paidAt: new Date(),
          paymentMethod: 'razorpay',
          paymentReference: razorpay_payment_id,
          paymentDate: new Date()
        }
      }
    );

    console.log(`Payroll payment verified: ${result.modifiedCount} records marked as paid. Payment: ${razorpay_payment_id}`);

    res.json({
      success: true,
      message: `${result.modifiedCount} payroll(s) marked as paid`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Verify payroll payment error:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed', error: error.message });
  }
};

// Razorpay webhook for payroll payments
const handlePayrollPaymentWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log('Payroll payment webhook received:', JSON.stringify(event, null, 2));

    if (event.event === 'order.paid') {
      const order = event.payload.order.entity;
      const notes = order.notes;

      if (notes.type === 'payroll') {
        let payrolls = [];
        let customAmount = null;

        if (notes.payrollIds) {
          // If payrollIds are provided in notes
          const payrollIds = notes.payrollIds.split(',');
          customAmount = notes.customAmount ? parseFloat(notes.customAmount) : null;

          payrolls = await Payroll.find({
            _id: { $in: payrollIds },
            paymentOrderId: order.id
          });
        } else {
          // If only order ID is provided, find payrolls by order ID
          payrolls = await Payroll.find({
            paymentOrderId: order.id
          });
        }

        // Update payroll records
        for (const payroll of payrolls) {
          payroll.status = 'paid';
          payroll.paidAt = new Date();
          payroll.paymentMethod = 'razorpay';
          payroll.paymentReference = order.id;
          payroll.paymentDate = new Date();

          // Use custom amount if provided for single payroll, otherwise use stored amount
          if (customAmount && payrolls.length === 1) {
            payroll.paymentAmount = customAmount;
          }

          await payroll.save();
        }

        console.log(`Updated ${payrolls.length} payroll records to paid status`);

        // Log payment details
        for (const payroll of payrolls) {
          console.log(`Payroll payment completed for ${payroll.employee}: ₹${payroll.paymentAmount || payroll.netSalary}`);
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Payroll payment webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
};

// Get payroll records with filters
const getPayrolls = async (req, res) => {
  try {
    const { year, month, employeeId, status, page = 1, limit = 20 } = req.query;
    const organizationId = getOrganizationId(req.user);

    // Build query
    const query = { organization: organizationId };

    if (employeeId) {
      query.employee = employeeId;
    }

    if (status) {
      query.status = status;
    }

    if (year) {
      query['payrollPeriod.year'] = parseInt(year);
    }

    if (month) {
      query['payrollPeriod.month'] = parseInt(month);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const payrolls = await Payroll.find(query)
      .populate('employee', 'fullName email employeeId department position salary salaryType hourlyRate')
      .populate('approvedBy', 'fullName email')
      .populate('createdBy', 'fullName email')
      .sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1, 'employee.fullName': 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payroll.countDocuments(query);

    res.json({
      success: true,
      data: {
        payrolls,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get payrolls error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete payroll records
const deletePayrolls = async (req, res) => {
  try {
    const { payrollIds } = req.body;
    const organizationId = getOrganizationId(req.user);

    if (!payrollIds || !Array.isArray(payrollIds)) {
      return res.status(400).json({
        success: false,
        message: 'Payroll IDs are required'
      });
    }

    // Only allow deletion of draft or rejected payrolls
    const result = await Payroll.deleteMany({
      _id: { $in: payrollIds },
      organization: organizationId,
      status: { $in: ['draft', 'rejected'] }
    });

    res.json({
      success: true,
      message: `${result.deletedCount} payroll records deleted successfully`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Delete payrolls error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Reset payroll status from paid back to approved (for testing)
const resetPayrollStatus = async (req, res) => {
  try {
    const { payrollIds } = req.body;
    const organizationId = getOrganizationId(req.user);

    if (!payrollIds || !Array.isArray(payrollIds)) {
      return res.status(400).json({
        success: false,
        message: 'Payroll IDs are required'
      });
    }

    // Reset status from paid to approved
    const result = await Payroll.updateMany(
      {
        _id: { $in: payrollIds },
        organization: organizationId,
        status: 'paid'
      },
      {
        $set: {
          status: 'approved',
          paidAt: null,
          paymentMethod: null,
          paymentReference: null,
          paymentOrderId: null,
          paymentAmount: null,
          paymentDate: null
        }
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} payroll records reset to approved status`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Reset payroll status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get payroll summary for a period — totals across all employees
const getPayrollSummary = async (req, res) => {
  try {
    const { year, month, startDate, endDate } = req.query;
    const organizationId = getOrganizationId(req.user);

    let period;
    try {
      period = getPayrollPeriod({ year, month, startDate, endDate });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    // Fetch all active employees
    const employees = await Employee.find({
      organization: organizationId,
      isActive: true
    }).select('fullName employeeId department position salaryStructure');

    const totalDaysInPeriod = Math.round(
      (period.endDate - period.startDate) / (1000 * 60 * 60 * 24)
    ) + 1;

    let summaryRows = [];
    let grandTotalPayable = 0;
    let grandTotalAbsentDeduction = 0;
    let grandTotalLeaveDeduction = 0;
    let grandTotalBonus = 0;
    let grandTotalPresent = 0;
    let grandTotalAbsent = 0;

    for (const employee of employees) {
      if (!employee.salaryStructure || !employee.salaryStructure.salaryType) continue;

      const attendance = await Timesheet.getAttendanceSummary(
        employee._id,
        period.startDate,
        period.endDate,
        organizationId
      );

      const structure = employee.salaryStructure;
      const monthlySalary = structure.salary || 0;
      const perDaySalary = structure.salaryType === 'monthly'
        ? monthlySalary / totalDaysInPeriod
        : (structure.hourlyRate || 0) * 8;

      const effectiveDays = attendance.presentDays + (attendance.halfDays * 0.5);
      const earnedSalary = perDaySalary * effectiveDays;
      const absentDeduction = perDaySalary * attendance.absentDays;
      const leaveRatePerDay = (structure.leaveDeductionPerDay && structure.leaveDeductionPerDay > 0)
        ? structure.leaveDeductionPerDay
        : perDaySalary;
      const leaveDeduction = leaveRatePerDay * attendance.leaveDays;
      const bonus = structure.bonus || 0;
      const fixedDeduction = structure.fixedDeduction || 0;
      const netPayable = Math.max(earnedSalary + bonus - fixedDeduction - leaveDeduction, 0);

      grandTotalPayable += netPayable;
      grandTotalAbsentDeduction += absentDeduction;
      grandTotalLeaveDeduction += leaveDeduction;
      grandTotalBonus += bonus;
      grandTotalPresent += attendance.presentDays;
      grandTotalAbsent += attendance.absentDays;

      summaryRows.push({
        employee: {
          _id: employee._id,
          fullName: employee.fullName,
          employeeId: employee.employeeId,
          department: employee.department,
        },
        monthlySalary,
        perDaySalary: Math.round(perDaySalary * 100) / 100,
        totalDaysInPeriod,
        effectiveDays: Math.round(effectiveDays * 100) / 100,
        presentDays: attendance.presentDays,
        absentDays: attendance.absentDays,
        halfDays: attendance.halfDays,
        leaveDays: attendance.leaveDays,
        earnedSalary: Math.round(earnedSalary * 100) / 100,
        absentDeduction: Math.round(absentDeduction * 100) / 100,
        leaveDeduction: Math.round(leaveDeduction * 100) / 100,
        bonus,
        fixedDeduction,
        netPayable: Math.round(netPayable * 100) / 100,
      });
    }

    res.json({
      success: true,
      data: {
        period: {
          year: period.year,
          month: period.month,
          startDate: period.startDate.toISOString().slice(0, 10),
          endDate: period.endDate.toISOString().slice(0, 10),
          totalDays: totalDaysInPeriod,
        },
        totals: {
          totalPayable: Math.round(grandTotalPayable * 100) / 100,
          totalAbsentDeduction: Math.round(grandTotalAbsentDeduction * 100) / 100,
          totalLeaveDeduction: Math.round(grandTotalLeaveDeduction * 100) / 100,
          totalBonus: Math.round(grandTotalBonus * 100) / 100,
          totalPresentDays: grandTotalPresent,
          totalAbsentDays: grandTotalAbsent,
          employeeCount: summaryRows.length,
        },
        employees: summaryRows,
      }
    });
  } catch (error) {
    console.error('Get payroll summary error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

module.exports = {
  getSalaryStructure,
  updateSalaryStructure,
  getEmployeesForPayroll,
  generatePayrollForEmployees,
  createPayrollPayment,
  verifyPayrollPayment,
  handlePayrollPaymentWebhook,
  getPayrolls,
  deletePayrolls,
  resetPayrollStatus,
  getPayrollSummary
};
