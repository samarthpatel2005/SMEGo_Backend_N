const Transaction = require("../models/Transaction");
const Product = require("../models/Product");
const inventoryService = require('../services/inventoryService');

// Transform backend transaction to frontend expected format
const transformTransactionForFrontend = (transaction) => {
  const transactionObj = transaction.toObject ? transaction.toObject() : transaction;
  return {
    ...transactionObj,
    quantity: transactionObj.qty, // backend 'qty' -> frontend 'quantity'
    unitPrice: transactionObj.unitCost, // backend 'unitCost' -> frontend 'unitPrice'
    reason: transactionObj.note, // backend 'note' -> frontend 'reason'
    performedBy: transactionObj.createdBy // backend 'createdBy' -> frontend 'performedBy'
  };
};

// Get all transactions with enhanced filtering
const getTransactions = async (req, res, next) => {
  try {
    const { 
      type, 
      productId, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50,
      search
    } = req.query;
    
    const query = { organization: req.user.organization };
    
    // Filter by type
    if (type) {
      query.type = type;
    }
    
    // Filter by product
    if (productId) {
      query.product = productId;
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let transactions = await Transaction.find(query)
      .populate('product', 'name sku')
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Filter out transactions with null products to prevent errors
    transactions = transactions.filter(transaction => transaction.product);
    
    // Search functionality (after population)
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      transactions = transactions.filter(transaction => 
        transaction.product?.name?.match(searchRegex) ||
        transaction.product?.sku?.match(searchRegex) ||
        transaction.reason?.match(searchRegex) ||
        transaction.type?.match(searchRegex)
      );
    }
    
    const total = await Transaction.countDocuments(query);
    
    // Transform transactions for frontend
    const transformedTransactions = transactions.map(transformTransactionForFrontend);
    
    res.json({
      success: true,
      data: transformedTransactions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (err) {
    console.error('getTransactions error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transactions' 
    });
  }
};

// Get single transaction
const getTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      organization: req.user.organization
    })
    .populate('product', 'name sku category')
    .populate('createdBy', 'firstName lastName email')
    .populate('referenceId');
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }
    
    res.json({ success: true, data: transformTransactionForFrontend(transaction) });
  } catch (err) {
    console.error('getTransaction error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch transaction' 
    });
  }
};

// Record a transaction with enhanced functionality
const createTransaction = async (req, res, next) => {
  try {
    console.log('Received transaction data:', req.body);
    
    const { 
      productId, 
      type, 
      quantity, 
      unitPrice, 
      reason,
      referenceType,
      referenceId
    } = req.body;

    // Validate required fields
    if (!productId || !type || !quantity) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID, type, and quantity are required' 
      });
    }

    // Parse and validate numbers
    const parsedQuantity = parseInt(quantity);
    const parsedUnitPrice = parseFloat(unitPrice) || 0;
    
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid quantity is required' 
      });
    }

    const product = await Product.findOne({
      _id: productId,
      organization: req.user.organization
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: "Product not found" 
      });
    }

    const stockBefore = product.qty; // Product model uses 'qty' not 'stock'
    let stockAfter = stockBefore;
    let adjustmentQuantity = 0;

    // Calculate stock changes based on transaction type
    switch (type) {
      case "purchase":
      case "return":
      case "adjustment_increase":
        adjustmentQuantity = Math.abs(parsedQuantity);
        stockAfter = stockBefore + adjustmentQuantity;
        break;
        
      case "sale":
      case "damage":
      case "loss":
      case "adjustment_decrease":
        adjustmentQuantity = -Math.abs(parsedQuantity);
        stockAfter = stockBefore + adjustmentQuantity;
        
        if (stockAfter < 0) {
          return res.status(400).json({ 
            success: false, 
            message: "Insufficient stock for this transaction" 
          });
        }
        break;
        
      case "transfer_out":
        adjustmentQuantity = -Math.abs(parsedQuantity);
        stockAfter = stockBefore + adjustmentQuantity;
        break;
        
      case "transfer_in":
        adjustmentQuantity = Math.abs(parsedQuantity);
        stockAfter = stockBefore + adjustmentQuantity;
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          message: "Invalid transaction type" 
        });
    }

    // Update product stock if inventory is tracked
    if (product.trackInventory) {
      product.qty = stockAfter; // Product model uses 'qty' not 'stock'
      await product.save();
    }

    // Create transaction record
    const transactionData = {
      organization: req.user.organization,
      product: productId,
      type,
      qty: Math.abs(parsedQuantity), // Model expects 'qty' not 'quantity'
      unitCost: parsedUnitPrice || product.costPrice || 0, // Model expects 'unitCost' not 'unitPrice'
      totalCost: Math.abs(parsedQuantity) * (parsedUnitPrice || product.costPrice || 0),
      note: reason || `${type} transaction`, // Model expects 'note' not 'reason'
      stockBefore: stockBefore || 0, // Ensure valid number
      stockAfter: stockAfter || stockBefore || 0, // Ensure valid number
      createdBy: req.user._id, // Model expects 'createdBy' not 'performedBy'
      referenceType: referenceType || 'manual',
      referenceId
    };

    console.log('Transaction data before create:', transactionData);
    
    const transaction = await Transaction.create(transactionData);
    
    // Populate the response
    await transaction.populate('product', 'name sku');
    await transaction.populate('createdBy', 'firstName lastName');

    res.status(201).json({ 
      success: true, 
      data: transformTransactionForFrontend(transaction),
      message: 'Transaction recorded successfully'
    });
  } catch (err) {
    console.error('createTransaction error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create transaction' 
    });
  }
};

// Bulk import transactions
const bulkImportTransactions = async (req, res, next) => {
  try {
    const { transactions } = req.body;
    
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Transactions array is required' 
      });
    }

    const results = {
      successful: [],
      failed: [],
      total: transactions.length
    };

    for (let i = 0; i < transactions.length; i++) {
      try {
        const transactionData = transactions[i];
        
        // Validate required fields
        if (!transactionData.productId || !transactionData.type || !transactionData.quantity) {
          results.failed.push({
            index: i,
            data: transactionData,
            error: 'Missing required fields (productId, type, quantity)'
          });
          continue;
        }

        const product = await Product.findOne({
          _id: transactionData.productId,
          organization: req.user.organization
        });

        if (!product) {
          results.failed.push({
            index: i,
            data: transactionData,
            error: 'Product not found'
          });
          continue;
        }

        // Create the transaction (reuse logic from createTransaction)
        const req_mock = {
          body: {
            ...transactionData,
            reason: transactionData.reason || `Bulk import ${transactionData.type}`
          },
          user: req.user
        };

        // This is a simplified version - in production, you'd want to extract the logic
        const stockBefore = product.stock;
        let adjustmentQuantity = 0;

        switch (transactionData.type) {
          case "purchase":
          case "return":
          case "adjustment_increase":
            adjustmentQuantity = Math.abs(transactionData.quantity);
            break;
          case "sale":
          case "damage":
          case "loss":
          case "adjustment_decrease":
            adjustmentQuantity = -Math.abs(transactionData.quantity);
            break;
          default:
            results.failed.push({
              index: i,
              data: transactionData,
              error: 'Invalid transaction type'
            });
            continue;
        }

        const stockAfter = stockBefore + adjustmentQuantity;
        
        if (stockAfter < 0) {
          results.failed.push({
            index: i,
            data: transactionData,
            error: 'Insufficient stock'
          });
          continue;
        }

        // Update product stock
        if (product.trackInventory) {
          product.stock = stockAfter;
          await product.save();
        }

        // Create transaction
        const transaction = await Transaction.create({
          organization: req.user.organization,
          product: transactionData.productId,
          type: transactionData.type,
          quantity: adjustmentQuantity,
          unitPrice: transactionData.unitPrice || product.costPrice || 0,
          totalCost: Math.abs(adjustmentQuantity) * (transactionData.unitPrice || product.costPrice || 0),
          reason: transactionData.reason || `Bulk import ${transactionData.type}`,
          stockBefore,
          stockAfter: product.trackInventory ? stockAfter : null,
          performedBy: req.user._id
        });

        results.successful.push(transaction);
      } catch (error) {
        results.failed.push({
          index: i,
          data: transactions[i],
          error: error.message
        });
      }
    }

    res.status(200).json({ 
      success: true, 
      data: results,
      message: `Processed ${results.total} transactions. ${results.successful.length} successful, ${results.failed.length} failed.`
    });
  } catch (err) {
    console.error('bulkImportTransactions error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to import transactions' 
    });
  }
};

// Get transaction analytics
const getTransactionAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate, productId } = req.query;
    
    const query = { organization: req.user.organization };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    if (productId) {
      query.product = productId;
    }

    const transactions = await Transaction.find(query)
      .populate('product', 'name sku category');

    const analytics = {
      totalTransactions: transactions.length,
      totalValue: 0,
      typeBreakdown: {},
      categoryBreakdown: {},
      monthlyTrend: {}
    };

    transactions.forEach(transaction => {
      // Total value
      analytics.totalValue += transaction.totalCost || 0;
      
      // Type breakdown
      if (!analytics.typeBreakdown[transaction.type]) {
        analytics.typeBreakdown[transaction.type] = { count: 0, value: 0 };
      }
      analytics.typeBreakdown[transaction.type].count++;
      analytics.typeBreakdown[transaction.type].value += transaction.totalCost || 0;
      
      // Category breakdown (if product has category)
      if (transaction.product?.category) {
        if (!analytics.categoryBreakdown[transaction.product.category]) {
          analytics.categoryBreakdown[transaction.product.category] = { count: 0, value: 0 };
        }
        analytics.categoryBreakdown[transaction.product.category].count++;
        analytics.categoryBreakdown[transaction.product.category].value += transaction.totalCost || 0;
      }
      
      // Monthly trend
      const monthKey = transaction.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!analytics.monthlyTrend[monthKey]) {
        analytics.monthlyTrend[monthKey] = { count: 0, value: 0 };
      }
      analytics.monthlyTrend[monthKey].count++;
      analytics.monthlyTrend[monthKey].value += transaction.totalCost || 0;
    });

    res.json({ 
      success: true, 
      data: analytics
    });
  } catch (err) {
    console.error('getTransactionAnalytics error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get transaction analytics' 
    });
  }
};

// Get invoice-based transactions (only for paid invoices)
const getInvoiceTransactions = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 50,
      search,
      startDate,
      endDate
    } = req.query;
    
    const Invoice = require('../models/Invoice');
    const query = { 
      organization: req.user.organization,
      status: 'paid' // Only show paid invoices
    };
    
    // Date range filter (based on payment date)
    if (startDate || endDate) {
      query.paidAt = {};
      if (startDate) query.paidAt.$gte = new Date(startDate);
      if (endDate) query.paidAt.$lte = new Date(endDate);
    }
    
    // Search filter (client name or invoice number)
    if (search) {
      query.$or = [
        { 'client.name': { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get paid invoices with populated product data
    const invoices = await Invoice.find(query)
      .populate('items.productId', 'name sku category')
      .sort({ paidAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalInvoices = await Invoice.countDocuments(query);
    
    // Transform invoice data to transaction format
    const transactions = [];
    
    invoices.forEach(invoice => {
      invoice.items.forEach((item, index) => {
        transactions.push({
          _id: `${invoice._id}_${index}`, // Unique transaction ID
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          transactionId: invoice.paymentReference || `TXN_${invoice._id}_${index}`,
          
          // Product information
          product: item.productId ? {
            _id: item.productId._id,
            name: item.productId.name || item.description,
            sku: item.productId.sku || item.sku,
            category: item.productId.category
          } : {
            _id: null,
            name: item.description,
            sku: item.sku,
            category: null
          },
          
          // Client information
          client: {
            name: invoice.client.name,
            email: invoice.client.email,
            address: invoice.client.address
          },
          
          // Transaction details
          type: 'sale', // All invoice transactions are sales
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.amount,
          taxRate: item.taxRate || 0,
          
          // Payment information
          paymentMethod: invoice.paymentMethod || 'razorpay',
          paymentReference: invoice.paymentReference,
          paymentDate: invoice.paidAt,
          
          // Timestamps
          createdAt: invoice.paidAt,
          updatedAt: invoice.paidAt,
          
          // Organization
          organization: invoice.organization
        });
      });
    });
    
    const totalPages = Math.ceil(totalInvoices / parseInt(limit));
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        current: parseInt(page),
        pages: totalPages,
        total: totalInvoices
      }
    });

  } catch (err) {
    console.error('getInvoiceTransactions error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get invoice transactions' 
    });
  }
};

module.exports = { 
  getTransactions,
  getTransaction,
  createTransaction,
  bulkImportTransactions,
  getTransactionAnalytics,
  getInvoiceTransactions
};