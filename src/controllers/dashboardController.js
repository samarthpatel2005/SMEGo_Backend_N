const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const inventoryService = require('../services/inventoryService');

// Get comprehensive dashboard analytics
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const organizationId = req.user.organization;
    const { period = '30' } = req.query; // Default to 30 days
    
    const daysAgo = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    // Run analytics in parallel for better performance
    const [
      invoiceStats,
      productStats,
      transactionStats,
      inventoryValuation,
      lowStockProducts,
      recentInvoices,
      recentTransactions
    ] = await Promise.all([
      getInvoiceStats(organizationId, startDate),
      getProductStats(organizationId),
      getTransactionStats(organizationId, startDate),
      inventoryService.getInventoryValuation(organizationId),
      inventoryService.getLowStockProducts(organizationId),
      getRecentInvoices(organizationId, 5),
      getRecentTransactions(organizationId, 10)
    ]);

    const analytics = {
      invoices: invoiceStats,
      products: productStats,
      transactions: transactionStats,
      inventory: {
        ...inventoryValuation,
        lowStockProducts,
        lowStockCount: lowStockProducts.length
      },
      recent: {
        invoices: recentInvoices,
        transactions: recentTransactions
      },
      period: `${daysAgo} days`
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('getDashboardAnalytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard analytics'
    });
  }
};

// Helper function to get invoice statistics
async function getInvoiceStats(organizationId, startDate) {
  const totalInvoices = await Invoice.countDocuments({ organization: organizationId });
  const paidInvoices = await Invoice.countDocuments({ 
    organization: organizationId, 
    status: 'paid' 
  });
  const pendingInvoices = await Invoice.countDocuments({ 
    organization: organizationId, 
    status: { $in: ['draft', 'sent'] }
  });
  const overdueInvoices = await Invoice.countDocuments({ 
    organization: organizationId, 
    status: { $in: ['sent'] },
    dueDate: { $lt: new Date() }
  });

  // Revenue calculations
  const revenueResult = await Invoice.aggregate([
    { 
      $match: { 
        organization: organizationId, 
        status: 'paid',
        paidAt: { $gte: startDate }
      } 
    },
    { 
      $group: { 
        _id: null, 
        totalRevenue: { $sum: '$totalAmount' },
        totalProfit: { $sum: '$grossProfit' },
        totalCOGS: { $sum: '$totalCOGS' }
      } 
    }
  ]);

  const revenue = revenueResult[0] || { 
    totalRevenue: 0, 
    totalProfit: 0, 
    totalCOGS: 0 
  };

  // Monthly trend
  const monthlyTrend = await Invoice.aggregate([
    { 
      $match: { 
        organization: organizationId, 
        status: 'paid',
        paidAt: { $gte: startDate }
      } 
    },
    {
      $group: {
        _id: {
          year: { $year: '$paidAt' },
          month: { $month: '$paidAt' }
        },
        revenue: { $sum: '$totalAmount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  return {
    total: totalInvoices,
    paid: paidInvoices,
    pending: pendingInvoices,
    overdue: overdueInvoices,
    revenue: revenue.totalRevenue,
    profit: revenue.totalProfit,
    cogs: revenue.totalCOGS,
    profitMargin: revenue.totalRevenue > 0 
      ? ((revenue.totalProfit / revenue.totalRevenue) * 100).toFixed(2)
      : '0.00',
    monthlyTrend
  };
}

// Helper function to get product statistics
async function getProductStats(organizationId) {
  const totalProducts = await Product.countDocuments({ organization: organizationId });
  const activeProducts = await Product.countDocuments({ 
    organization: organizationId, 
    isActive: true 
  });
  const trackedProducts = await Product.countDocuments({ 
    organization: organizationId, 
    trackInventory: true 
  });

  // Category breakdown
  const categoryBreakdown = await Product.aggregate([
    { $match: { organization: organizationId } },
    { 
      $group: { 
        _id: '$category', 
        count: { $sum: 1 },
        totalValue: { $sum: { $multiply: ['$stock', '$costPrice'] } }
      } 
    },
    { $sort: { count: -1 } }
  ]);

  return {
    total: totalProducts,
    active: activeProducts,
    tracked: trackedProducts,
    categoryBreakdown
  };
}

// Helper function to get transaction statistics
async function getTransactionStats(organizationId, startDate) {
  const totalTransactions = await Transaction.countDocuments({ 
    organization: organizationId,
    createdAt: { $gte: startDate }
  });

  // Transaction type breakdown
  const typeBreakdown = await Transaction.aggregate([
    { 
      $match: { 
        organization: organizationId,
        createdAt: { $gte: startDate }
      } 
    },
    { 
      $group: { 
        _id: '$type', 
        count: { $sum: 1 },
        totalValue: { $sum: '$totalCost' }
      } 
    },
    { $sort: { count: -1 } }
  ]);

  // Daily transaction trend
  const dailyTrend = await Transaction.aggregate([
    { 
      $match: { 
        organization: organizationId,
        createdAt: { $gte: startDate }
      } 
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        count: { $sum: 1 },
        value: { $sum: '$totalCost' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);

  return {
    total: totalTransactions,
    typeBreakdown,
    dailyTrend
  };
}

// Helper function to get recent invoices
async function getRecentInvoices(organizationId, limit) {
  return await Invoice.find({ organization: organizationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('invoiceNumber client.name totalAmount status createdAt dueDate')
    .lean();
}

// Helper function to get recent transactions
async function getRecentTransactions(organizationId, limit) {
  return await Transaction.find({ organization: organizationId })
    .populate('product', 'name sku')
    .populate('performedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('type quantity product performedBy createdAt reason')
    .lean();
}

// Get sales performance analytics
exports.getSalesPerformance = async (req, res) => {
  try {
    const organizationId = req.user.organization;
    const { startDate, endDate } = req.query;
    
    const query = { 
      organization: organizationId, 
      status: 'paid' 
    };
    
    if (startDate || endDate) {
      query.paidAt = {};
      if (startDate) query.paidAt.$gte = new Date(startDate);
      if (endDate) query.paidAt.$lte = new Date(endDate);
    }

    // Top products by revenue
    const topProducts = await Invoice.aggregate([
      { $match: query },
      { $unwind: '$items' },
      { 
        $match: { 
          'items.productId': { $exists: true, $ne: null } 
        } 
      },
      {
        $group: {
          _id: '$items.productId',
          totalRevenue: { $sum: '$items.amount' },
          totalQuantity: { $sum: '$items.quantity' },
          totalProfit: { 
            $sum: { 
              $multiply: [
                '$items.quantity', 
                { $subtract: ['$items.unitPrice', '$items.costPrice'] }
              ] 
            } 
          }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);

    // Populate product details
    const productIds = topProducts.map(item => item._id);
    const products = await Product.find({ 
      _id: { $in: productIds },
      organization: organizationId 
    }).select('name sku category').lean();

    const productMap = products.reduce((map, product) => {
      map[product._id] = product;
      return map;
    }, {});

    const enrichedTopProducts = topProducts.map(item => ({
      ...item,
      product: productMap[item._id] || { name: 'Unknown Product' }
    }));

    res.json({
      success: true,
      data: {
        topProducts: enrichedTopProducts
      }
    });
  } catch (error) {
    console.error('getSalesPerformance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales performance'
    });
  }
};

// Get inventory alerts
exports.getInventoryAlerts = async (req, res) => {
  try {
    const organizationId = req.user.organization;
    
    const [lowStockProducts, zeroStockProducts, overStockProducts] = await Promise.all([
      inventoryService.getLowStockProducts(organizationId),
      Product.find({ 
        organization: organizationId, 
        trackInventory: true, 
        stock: 0 
      }).select('name sku category stock').lean(),
      Product.find({ 
        organization: organizationId, 
        trackInventory: true, 
        $expr: { $gt: ['$stock', { $multiply: ['$reorderPoint', 3] }] } 
      }).select('name sku category stock reorderPoint').lean()
    ]);

    res.json({
      success: true,
      data: {
        lowStock: lowStockProducts,
        zeroStock: zeroStockProducts,
        overStock: overStockProducts,
        summary: {
          lowStockCount: lowStockProducts.length,
          zeroStockCount: zeroStockProducts.length,
          overStockCount: overStockProducts.length
        }
      }
    });
  } catch (error) {
    console.error('getInventoryAlerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory alerts'
    });
  }
};
