// controllers/payrollController.js
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Timesheet = require('../models/Timesheet');
const razorpay = require('../config/razorpay');
const mongoose = require('mongoose');

// Get all employees for payroll
const getEmployeesForPayroll = async (req, res) => {
  try {
    const { year, month } = req.query;
    const organizationId = req.user.organization;
    
    // Get existing payroll records for this period
    const existingPayrolls = await Payroll.find({
      organization: organizationId,
      'payrollPeriod.year': parseInt(year),
      'payrollPeriod.month': parseInt(month),
      status: 'paid'
    }).populate('employee', 'firstName lastName email');

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required'
      });
    }

    // Get all active employees
    const employees = await Employee.find({
      organization: organizationId,
      isActive: true
    }).select('fullName email employeeId department position salary salaryType hourlyRate hireDate')
      .sort({ fullName: 1 });

    // Calculate payroll data for each employee based on attendance
    const employeesWithPayroll = await Promise.all(
      employees.map(async (employee) => {
        // Get attendance summary for the employee for the given month
        const attendanceSummary = await Timesheet.getMonthlyAttendanceSummary(
          employee._id,
          parseInt(year),
          parseInt(month),
          organizationId
        );

        // Calculate payroll amounts
        const payrollData = await Payroll.calculatePayroll(
          employee._id,
          parseInt(year),
          parseInt(month),
          organizationId
        );

        // Check if payroll already exists
        const existingPayroll = await Payroll.findOne({
          employee: employee._id,
          organization: organizationId,
          'payrollPeriod.year': parseInt(year),
          'payrollPeriod.month': parseInt(month)
        });

        return {
          employee: employee.toObject(),
          attendance: attendanceSummary,
          payrollData,
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
        period: { year: parseInt(year), month: parseInt(month) }
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
    const { year, month, employeeIds } = req.body;
    const organizationId = req.user.organization;
    const createdBy = req.user.id;

    if (!year || !month || !employeeIds || !Array.isArray(employeeIds)) {
      return res.status(400).json({
        success: false,
        message: 'Year, month, and employee IDs are required'
      });
    }

    const results = [];

    for (const employeeId of employeeIds) {
      try {
        // Check if payroll already exists
        const existingPayroll = await Payroll.findOne({
          employee: employeeId,
          organization: organizationId,
          'payrollPeriod.year': year,
          'payrollPeriod.month': month
        });

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
          year,
          month,
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
    const organizationId = req.user.organization;

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
        // Use baseSalary instead of netSalary to avoid calculation issues
        const amount = payroll.baseSalary || payroll.netSalary || 1000; // Default to 1000 if no salary
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
        employeeCount: payrolls.length,
        customAmount: customAmount || null
      }
    });

    // Store payment info in payrolls
    for (const payroll of payrolls) {
      const paymentAmount = customAmount && payrolls.length === 1 
        ? customAmount 
        : (payroll.baseSalary || payroll.netSalary || 1000);
      
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
            : (p.baseSalary || p.netSalary || 1000)
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
    const organizationId = req.user.organization;

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
    const organizationId = req.user.organization;

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
    const organizationId = req.user.organization;

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

module.exports = {
  getEmployeesForPayroll,
  generatePayrollForEmployees,
  createPayrollPayment,
  handlePayrollPaymentWebhook,
  getPayrolls,
  deletePayrolls,
  resetPayrollStatus
};
