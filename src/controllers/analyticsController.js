const Product = require("../models/Product");
const Transaction = require("../models/Transaction");
const Invoice = require("../models/Invoice");
const mongoose = require("mongoose");

// Helper function to get date range
const getDateRange = (period, startDate, endDate) => {
  const now = new Date();
  let start, end;

  if (period === 'custom' && startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else {
    end = now;
    switch (period) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  return { start, end };
};

// Get product analytics for organization
const getProductAnalytics = async (req, res) => {
  try {
    const organizationId = req.user.organization;
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    // Get all products for organization
    const products = await Product.find({
      organization: organizationId,
      createdAt: { $gte: start, $lte: end }
    });

    const totalProducts = products.length;
    const activeProducts = products.filter(p => p.isActive).length;
    const lowStockProducts = products.filter(p => p.qty <= p.reorderPoint).length;
    const outOfStockProducts = products.filter(p => p.qty === 0).length;

    // Detailed inventory value calculations
    let totalInventoryValue = 0;
    let totalCostValue = 0;
    let totalStockQuantity = 0;
    let totalProductPrice = 0;

    const inventoryCalculations = products.map(product => {
      const stockValue = product.qty * product.price;
      const costValue = product.qty * (product.costPrice || 0);

      totalInventoryValue += stockValue;
      totalCostValue += costValue;
      totalStockQuantity += product.qty;
      totalProductPrice += product.price;

      return {
        productId: product._id,
        name: product.name,
        quantity: product.qty,
        sellingPrice: product.price,
        costPrice: product.costPrice || 0,
        stockValue: stockValue,
        costValue: costValue,
        potentialProfit: stockValue - costValue,
        profitMargin: stockValue > 0 ? ((stockValue - costValue) / stockValue * 100).toFixed(2) : 0
      };
    });

    const averageProductPrice = totalProducts > 0 ? totalProductPrice / totalProducts : 0;
    const averageStockValue = totalProducts > 0 ? totalInventoryValue / totalProducts : 0;
    const inventoryTurnoverRatio = totalCostValue > 0 ? totalInventoryValue / totalCostValue : 0;

    // Category distribution with detailed calculations
    const categoryMap = new Map();
    products.forEach(product => {
      const category = product.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          count: 0,
          totalValue: 0,
          totalCost: 0,
          totalQuantity: 0,
          products: []
        });
      }
      const categoryData = categoryMap.get(category);
      const stockValue = product.qty * product.price;
      const costValue = product.qty * (product.costPrice || 0);

      categoryData.count += 1;
      categoryData.totalValue += stockValue;
      categoryData.totalCost += costValue;
      categoryData.totalQuantity += product.qty;
      categoryData.products.push({
        name: product.name,
        quantity: product.qty,
        value: stockValue
      });
    });

    const categoryDistribution = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      count: data.count,
      percentage: totalProducts > 0 ? (data.count / totalProducts) * 100 : 0,
      totalValue: data.totalValue,
      totalCost: data.totalCost,
      totalQuantity: data.totalQuantity,
      averageValuePerProduct: data.count > 0 ? data.totalValue / data.count : 0,
      potentialProfit: data.totalValue - data.totalCost,
      profitMargin: data.totalValue > 0 ? ((data.totalValue - data.totalCost) / data.totalValue * 100).toFixed(2) : 0,
      topProducts: data.products.sort((a, b) => b.value - a.value).slice(0, 3)
    }));

    // Enhanced top products with detailed metrics
    const topProducts = products
      .map(product => ({
        _id: product._id,
        name: product.name,
        sku: product.sku,
        stock: product.qty,
        sellingPrice: product.price,
        costPrice: product.costPrice || 0,
        totalValue: product.qty * product.price,
        totalCost: product.qty * (product.costPrice || 0),
        potentialProfit: (product.qty * product.price) - (product.qty * (product.costPrice || 0)),
        profitMargin: (product.qty * product.price) > 0 ?
          (((product.qty * product.price) - (product.qty * (product.costPrice || 0))) / (product.qty * product.price) * 100).toFixed(2) : 0,
        category: product.category || 'Uncategorized',
        reorderPoint: product.reorderPoint,
        stockStatus: product.qty === 0 ? 'Out of Stock' :
          product.qty <= product.reorderPoint ? 'Low Stock' : 'In Stock'
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    // Stock analysis with detailed breakdown
    const stockAnalysis = {
      totalItems: totalStockQuantity,
      averageStockPerProduct: totalProducts > 0 ? totalStockQuantity / totalProducts : 0,
      stockDistribution: {
        inStock: products.filter(p => p.qty > p.reorderPoint).length,
        lowStock: lowStockProducts,
        outOfStock: outOfStockProducts,
        overstocked: products.filter(p => p.qty > (p.reorderPoint * 3)).length
      },
      valueDistribution: {
        highValue: products.filter(p => (p.qty * p.price) > 1000).length,
        mediumValue: products.filter(p => (p.qty * p.price) >= 100 && (p.qty * p.price) <= 1000).length,
        lowValue: products.filter(p => (p.qty * p.price) < 100).length
      }
    };

    // Calculation explanations
    const calculationExplanations = {
      totalInventoryValue: {
        value: totalInventoryValue,
        formula: "Sum of (Quantity × Selling Price) for all products",
        breakdown: inventoryCalculations.map(item => ({
          product: item.name,
          calculation: `${item.quantity} × $${item.sellingPrice} = $${item.stockValue}`,
          value: item.stockValue
        }))
      },
      totalCostValue: {
        value: totalCostValue,
        formula: "Sum of (Quantity × Cost Price) for all products",
        breakdown: inventoryCalculations.map(item => ({
          product: item.name,
          calculation: `${item.quantity} × $${item.costPrice} = $${item.costValue}`,
          value: item.costValue
        }))
      },
      averageProductPrice: {
        value: averageProductPrice,
        formula: "Sum of all product selling prices ÷ Total number of products",
        calculation: `$${totalProductPrice.toFixed(2)} ÷ ${totalProducts} = $${averageProductPrice.toFixed(2)}`
      },
      averageStockValue: {
        value: averageStockValue,
        formula: "Total inventory value ÷ Total number of products",
        calculation: `$${totalInventoryValue.toFixed(2)} ÷ ${totalProducts} = $${averageStockValue.toFixed(2)}`
      },
      inventoryTurnoverRatio: {
        value: inventoryTurnoverRatio,
        formula: "Total inventory value ÷ Total cost value",
        calculation: totalCostValue > 0 ? `$${totalInventoryValue.toFixed(2)} ÷ $${totalCostValue.toFixed(2)} = ${inventoryTurnoverRatio.toFixed(2)}` : "No cost data available"
      }
    };

    const analytics = {
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts,
      totalInventoryValue,
      totalCostValue,
      averageProductPrice,
      averageStockValue,
      inventoryTurnoverRatio,
      categoryDistribution,
      topProducts,
      stockAnalysis,
      lowStockItems: products
        .filter(p => p.qty <= p.reorderPoint)
        .map(product => ({
          _id: product._id,
          name: product.name,
          sku: product.sku,
          stock: product.qty,
          reorderPoint: product.reorderPoint,
          category: product.category || 'Uncategorized',
          stockValue: product.qty * product.price,
          urgency: product.qty === 0 ? 'Critical' :
            product.qty <= (product.reorderPoint * 0.5) ? 'High' : 'Medium'
        })),
      calculationExplanations,
      inventoryCalculations: inventoryCalculations.slice(0, 10) // Top 10 for display
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Product analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product analytics'
    });
  }
};

// Get transaction analytics for organization
const getTransactionAnalytics = async (req, res) => {
  try {
    const organizationId = req.user.organization;
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    // Get all transactions for organization
    const transactions = await Transaction.find({
      organization: organizationId,
      createdAt: { $gte: start, $lte: end }
    }).populate('product', 'name sku category price costPrice');

    const totalTransactions = transactions.length;
    const totalPurchases = transactions.filter(t => t.type === 'purchase').length;
    const totalSales = transactions.filter(t => t.type === 'sale').length;
    const totalAdjustments = transactions.filter(t => t.type === 'adjustment').length;

    // Calculate financial metrics with detailed breakdown
    const salesTransactions = transactions.filter(t => t.type === 'sale');
    const purchaseTransactions = transactions.filter(t => t.type === 'purchase');
    const adjustmentTransactions = transactions.filter(t => t.type === 'adjustment');

    // Detailed revenue calculation
    let totalRevenue = 0;
    let totalCost = 0;
    let totalQuantitySold = 0;

    const revenueBreakdown = [];
    const costBreakdown = [];

    salesTransactions.forEach(transaction => {
      const unitPrice = transaction.product ? transaction.product.price : 0;
      const unitCost = transaction.product ? (transaction.product.costPrice || 0) : 0;
      const transactionRevenue = transaction.qty * unitPrice;
      const transactionCost = transaction.qty * unitCost;

      totalRevenue += transactionRevenue;
      totalCost += transactionCost;
      totalQuantitySold += transaction.qty;

      revenueBreakdown.push({
        transactionId: transaction._id,
        productName: transaction.product ? transaction.product.name : 'Unknown',
        quantity: transaction.qty,
        unitPrice: unitPrice,
        revenue: transactionRevenue,
        date: transaction.createdAt,
        calculation: `${transaction.qty} × $${unitPrice} = $${transactionRevenue}`
      });

      costBreakdown.push({
        transactionId: transaction._id,
        productName: transaction.product ? transaction.product.name : 'Unknown',
        quantity: transaction.qty,
        unitCost: unitCost,
        cost: transactionCost,
        date: transaction.createdAt,
        calculation: `${transaction.qty} × $${unitCost} = $${transactionCost}`
      });
    });

    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const averageTransactionValue = salesTransactions.length > 0 ? totalRevenue / salesTransactions.length : 0;
    const averageQuantityPerSale = salesTransactions.length > 0 ? totalQuantitySold / salesTransactions.length : 0;

    // Purchase analysis
    const purchaseAnalysis = {
      totalPurchases: purchaseTransactions.length,
      totalPurchaseValue: purchaseTransactions.reduce((sum, t) => {
        const unitPrice = t.product ? t.product.price : 0;
        return sum + (t.qty * unitPrice);
      }, 0),
      totalPurchaseQuantity: purchaseTransactions.reduce((sum, t) => sum + t.qty, 0),
      averagePurchaseSize: purchaseTransactions.length > 0 ?
        purchaseTransactions.reduce((sum, t) => sum + t.qty, 0) / purchaseTransactions.length : 0
    };

    // Monthly trends
    const monthlyMap = new Map();
    transactions.forEach(transaction => {
      const month = transaction.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, {
          purchases: 0,
          sales: 0,
          revenue: 0,
          cost: 0,
          profit: 0
        });
      }

      const monthData = monthlyMap.get(month);
      if (transaction.type === 'purchase') {
        monthData.purchases += transaction.qty;
      } else if (transaction.type === 'sale') {
        monthData.sales += transaction.qty;
        const unitPrice = transaction.product ? transaction.product.price : 0;
        const unitCost = transaction.product ? (transaction.product.costPrice || 0) : 0;
        const transactionRevenue = transaction.qty * unitPrice;
        const transactionCost = transaction.qty * unitCost;
        monthData.revenue += transactionRevenue;
        monthData.cost += transactionCost;
        monthData.profit += (transactionRevenue - transactionCost);
      }
    });

    const monthlyTrends = Array.from(monthlyMap.entries()).map(([month, data]) => ({
      month,
      ...data
    })).sort((a, b) => a.month.localeCompare(b.month));

    // Product performance
    const productMap = new Map();
    salesTransactions.forEach(transaction => {
      if (!transaction.product) return;

      const productId = transaction.product._id.toString();
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          productId,
          productName: transaction.product.name,
          sku: transaction.product.sku,
          totalSold: 0,
          totalRevenue: 0,
          totalCost: 0,
          profit: 0,
          profitMargin: 0
        });
      }

      const productData = productMap.get(productId);
      const unitPrice = transaction.product.price;
      const unitCost = transaction.product.costPrice || 0;
      const transactionRevenue = transaction.qty * unitPrice;
      const transactionCost = transaction.qty * unitCost;

      productData.totalSold += transaction.qty;
      productData.totalRevenue += transactionRevenue;
      productData.totalCost += transactionCost;
      productData.profit += (transactionRevenue - transactionCost);
      productData.profitMargin = productData.totalRevenue > 0 ?
        (productData.profit / productData.totalRevenue) * 100 : 0;
    });

    const productPerformance = Array.from(productMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Category performance
    const categoryMap = new Map();
    salesTransactions.forEach(transaction => {
      if (!transaction.product) return;

      const category = transaction.product.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          totalSold: 0,
          totalRevenue: 0,
          totalCost: 0,
          profit: 0
        });
      }

      const categoryData = categoryMap.get(category);
      const unitPrice = transaction.product.price;
      const unitCost = transaction.product.costPrice || 0;
      const transactionRevenue = transaction.qty * unitPrice;
      const transactionCost = transaction.qty * unitCost;

      categoryData.totalSold += transaction.qty;
      categoryData.totalRevenue += transactionRevenue;
      categoryData.totalCost += transactionCost;
      categoryData.profit += (transactionRevenue - transactionCost);
    });

    const categoryPerformance = Array.from(categoryMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Financial calculation explanations
    const financialCalculations = {
      totalRevenue: {
        value: totalRevenue,
        formula: "Sum of (Quantity Sold × Selling Price) for all sales",
        breakdown: revenueBreakdown.slice(0, 10), // Show top 10 transactions
        totalTransactions: salesTransactions.length
      },
      totalCost: {
        value: totalCost,
        formula: "Sum of (Quantity Sold × Cost Price) for all sales",
        breakdown: costBreakdown.slice(0, 10), // Show top 10 transactions
        totalTransactions: salesTransactions.length
      },
      profit: {
        value: profit,
        formula: "Total Revenue - Total Cost",
        calculation: `$${totalRevenue.toFixed(2)} - $${totalCost.toFixed(2)} = $${profit.toFixed(2)}`,
        profitMargin: profitMargin
      },
      profitMargin: {
        value: profitMargin,
        formula: "(Profit ÷ Total Revenue) × 100",
        calculation: totalRevenue > 0 ? `($${profit.toFixed(2)} ÷ $${totalRevenue.toFixed(2)}) × 100 = ${profitMargin.toFixed(2)}%` : "No revenue to calculate margin"
      },
      averageTransactionValue: {
        value: averageTransactionValue,
        formula: "Total Revenue ÷ Number of Sales",
        calculation: `$${totalRevenue.toFixed(2)} ÷ ${salesTransactions.length} = $${averageTransactionValue.toFixed(2)}`
      },
      averageQuantityPerSale: {
        value: averageQuantityPerSale,
        formula: "Total Quantity Sold ÷ Number of Sales",
        calculation: `${totalQuantitySold} ÷ ${salesTransactions.length} = ${averageQuantityPerSale.toFixed(2)}`
      }
    };

    // Transaction velocity analysis
    const transactionVelocity = {
      dailyAverage: {
        sales: salesTransactions.length / Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))),
        purchases: purchaseTransactions.length / Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))),
        total: transactions.length / Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)))
      },
      peakDays: [], // Will be calculated from daily breakdown
      trends: monthlyTrends
    };

    // Performance metrics
    const performanceMetrics = {
      bestPerformingCategory: categoryPerformance.length > 0 ? categoryPerformance[0].category : 'None',
      worstPerformingCategory: categoryPerformance.length > 0 ? categoryPerformance[categoryPerformance.length - 1].category : 'None',
      topProduct: productPerformance.length > 0 ? productPerformance[0] : null,
      profitabilityScore: profitMargin > 30 ? 'Excellent' : profitMargin > 15 ? 'Good' : profitMargin > 5 ? 'Fair' : 'Poor',
      salesGrowth: monthlyTrends.length > 1 ?
        ((monthlyTrends[monthlyTrends.length - 1].revenue - monthlyTrends[0].revenue) / Math.max(1, monthlyTrends[0].revenue)) * 100 : 0
    };

    const analytics = {
      totalTransactions,
      totalPurchases,
      totalSales,
      totalAdjustments,
      totalRevenue,
      totalCost,
      profit,
      profitMargin,
      averageTransactionValue,
      averageQuantityPerSale,
      totalQuantitySold,
      monthlyTrends,
      productPerformance,
      categoryPerformance,
      purchaseAnalysis,
      financialCalculations,
      transactionVelocity,
      performanceMetrics,
      revenueBreakdown: revenueBreakdown.slice(0, 20), // Show top 20 for detailed view
      costBreakdown: costBreakdown.slice(0, 20)
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Transaction analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction analytics'
    });
  }
};

// Get inventory analytics for organization
const getInventoryAnalytics = async (req, res) => {
  try {
    const organizationId = req.user.organization;

    const products = await Product.find({
      organization: organizationId,
      isActive: true,
      trackInventory: true
    });

    let totalValue = 0;
    let totalCostValue = 0;
    const categoryMap = new Map();

    products.forEach(product => {
      const productValue = product.qty * product.price;
      const productCostValue = product.qty * (product.costPrice || 0);

      totalValue += productValue;
      totalCostValue += productCostValue;

      const category = product.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          products: 0,
          stockValue: 0,
          costValue: 0
        });
      }

      const categoryData = categoryMap.get(category);
      categoryData.products += 1;
      categoryData.stockValue += productValue;
      categoryData.costValue += productCostValue;
    });

    const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      products: data.products,
      stockValue: data.stockValue,
      costValue: data.costValue,
      percentage: totalValue > 0 ? (data.stockValue / totalValue) * 100 : 0
    }));

    const analytics = {
      totalValue,
      totalCostValue,
      potentialProfit: totalValue - totalCostValue,
      productCount: products.length,
      stockTurnover: 0, // Would need historical data to calculate
      averageStockValue: products.length > 0 ? totalValue / products.length : 0,
      categoryBreakdown
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Inventory analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory analytics'
    });
  }
};

// Get dashboard analytics (combined overview)
const getDashboardAnalytics = async (req, res) => {
  try {
    const organizationId = req.user.organization;
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    // Get current month data
    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const currentMonthEnd = new Date();

    // Products data
    const allProducts = await Product.find({ organization: organizationId });
    const productsThisPeriod = await Product.find({
      organization: organizationId,
      createdAt: { $gte: start, $lte: end }
    });

    // Transactions data - ensure both transaction and product belong to the organization
    const allTransactions = await Transaction.find({ organization: organizationId });
    const transactionsThisPeriod = await Transaction.find({
      organization: organizationId,
      createdAt: { $gte: start, $lte: end }
    }).populate({
      path: 'product',
      match: { organization: organizationId }, // Only populate products from same organization
      select: 'name sku category price costPrice'
    });

    // Filter out transactions where product population failed (different organization)
    const validTransactionsThisPeriod = transactionsThisPeriod.filter(t => t.product !== null);

    // Separate transaction types
    const validSalesTransactions = validTransactionsThisPeriod.filter(t => t.type === 'sale');
    const validPurchaseTransactions = validTransactionsThisPeriod.filter(t => t.type === 'purchase');

    const currentMonthTransactions = await Transaction.find({
      organization: organizationId,
      createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd },
      type: 'sale'
    }).populate({
      path: 'product',
      match: { organization: organizationId }, // Only populate products from same organization
      select: 'name price costPrice'
    });

    // Filter out transactions where product population failed (different organization)
    const validCurrentMonthTransactions = currentMonthTransactions.filter(t => t.product !== null);

    // Separate current month transactions by type
    const validCurrentMonthSales = validCurrentMonthTransactions.filter(t => t.type === 'sale');

    // Calculate current month revenue and profit
    const currentMonthRevenue = validCurrentMonthSales.reduce((sum, t) => {
      const unitPrice = t.product ? t.product.price : 0;
      return sum + (t.qty * unitPrice);
    }, 0);

    const currentMonthCost = validCurrentMonthSales.reduce((sum, t) => {
      const unitCost = t.product ? (t.product.costPrice || 0) : 0;
      return sum + (t.qty * unitCost);
    }, 0);

    const currentMonthProfit = currentMonthRevenue - currentMonthCost;

    // Category analysis for top selling
    const categoryMap = new Map();
    validSalesTransactions.forEach(transaction => {
      if (!transaction.product) return;
      const category = transaction.product.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, 0);
      }
      categoryMap.set(category, categoryMap.get(category) + transaction.qty);
    });

    const topSellingCategory = categoryMap.size > 0
      ? Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : 'None';

    // Low stock alerts
    const lowStockAlerts = allProducts.filter(p => p.qty <= p.reorderPoint).length;

    // Basic product analytics
    const totalProducts = allProducts.length;
    const activeProducts = allProducts.filter(p => p.isActive).length;
    const totalInventoryValue = allProducts.reduce((sum, p) => sum + (p.qty * p.price), 0);
    const totalCostValue = allProducts.reduce((sum, p) => sum + (p.qty * (p.costPrice || 0)), 0);

    // Basic transaction analytics
    const salesTransactions = validSalesTransactions;
    const totalRevenue = salesTransactions.reduce((sum, t) => {
      const unitPrice = t.product ? t.product.price : 0;
      return sum + (t.qty * unitPrice);
    }, 0);

    const totalCost = salesTransactions.reduce((sum, t) => {
      const unitCost = t.product ? (t.product.costPrice || 0) : 0;
      return sum + (t.qty * unitCost);
    }, 0);

    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const averageTransactionValue = salesTransactions.length > 0 ? totalRevenue / salesTransactions.length : 0;

    // Detailed transaction breakdown for current month
    const transactionBreakdown = {};
    validCurrentMonthSales.forEach(t => {
      if (!t.product) return;
      const productName = t.product.name || 'Unknown Product';
      if (!transactionBreakdown[productName]) {
        transactionBreakdown[productName] = {
          quantity: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          unitPrice: t.product.price || 0,
          unitCost: t.product.costPrice || 0
        };
      }
      const revenue = t.qty * (t.product.price || 0);
      const cost = t.qty * (t.product.costPrice || 0);
      transactionBreakdown[productName].quantity += t.qty;
      transactionBreakdown[productName].revenue += revenue;
      transactionBreakdown[productName].cost += cost;
      transactionBreakdown[productName].profit += (revenue - cost);
    });

    // Build full analytics response
    const analytics = {
      summary: {
        totalProductsCreated: productsThisPeriod.length,
        totalTransactionsCompleted: validTransactionsThisPeriod.length,
        currentMonthRevenue,
        currentMonthProfit,
        inventoryTurnover: totalCostValue > 0 ? totalInventoryValue / totalCostValue : 0,
        topSellingCategory,
        lowStockAlerts,
        organizationId
      },
      transactionBreakdown,
      products: {
        totalProducts,
        activeProducts,
        lowStockProducts: lowStockAlerts,
        outOfStockProducts: allProducts.filter(p => p.qty === 0).length,
        totalInventoryValue,
        totalCostValue,
        averageProductPrice: totalProducts > 0 ? allProducts.reduce((sum, p) => sum + p.price, 0) / totalProducts : 0,
        averageStockValue: totalProducts > 0 ? totalInventoryValue / totalProducts : 0,
        inventoryTurnoverRatio: totalCostValue > 0 ? totalInventoryValue / totalCostValue : 0,
        categoryDistribution: [],
        topProducts: [],
        stockAnalysis: {
          totalItems: allProducts.reduce((sum, p) => sum + p.qty, 0),
          averageStockPerProduct: totalProducts > 0 ? allProducts.reduce((sum, p) => sum + p.qty, 0) / totalProducts : 0,
          stockDistribution: {
            inStock: allProducts.filter(p => p.qty > p.reorderPoint).length,
            lowStock: lowStockAlerts,
            outOfStock: allProducts.filter(p => p.qty === 0).length,
            overstocked: allProducts.filter(p => p.qty > (p.reorderPoint * 3)).length
          }
        }
      },
      transactions: {
        totalTransactions: validTransactionsThisPeriod.length,
        totalPurchases: validPurchaseTransactions.length,
        totalSales: salesTransactions.length,
        totalAdjustments: validTransactionsThisPeriod.filter(t => t.type === 'adjustment').length,
        totalRevenue,
        totalCost,
        profit,
        profitMargin,
        averageTransactionValue,
        averageQuantityPerSale: salesTransactions.length > 0 ?
          salesTransactions.reduce((sum, t) => sum + t.qty, 0) / salesTransactions.length : 0,
        totalQuantitySold: salesTransactions.reduce((sum, t) => sum + t.qty, 0),
        monthlyTrends: [],
        productPerformance: [],
        categoryPerformance: []
      },
      inventory: {
        totalValue: totalInventoryValue,
        totalCostValue,
        potentialProfit: totalInventoryValue - totalCostValue,
        productCount: totalProducts,
        stockTurnover: 0,
        averageStockValue: totalProducts > 0 ? totalInventoryValue / totalProducts : 0,
        categoryBreakdown: []
      }
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard analytics',
      error: error.message
    });
  }
};

// Get revenue analytics
const getRevenueAnalytics = async (req, res) => {
  try {
    const organizationId = req.user.organization;
    const { period, startDate, endDate } = req.query;
    const { start, end } = getDateRange(period, startDate, endDate);

    const salesTransactions = await Transaction.find({
      organization: organizationId,
      type: 'sale',
      createdAt: { $gte: start, $lte: end }
    }).populate('product', 'name price category');

    // Daily revenue
    const dailyRevenueMap = new Map();
    salesTransactions.forEach(transaction => {
      const date = transaction.createdAt.toISOString().substring(0, 10);
      const revenue = transaction.qty * (transaction.product?.price || 0);
      dailyRevenueMap.set(date, (dailyRevenueMap.get(date) || 0) + revenue);
    });

    const dailyRevenue = Array.from(dailyRevenueMap.entries()).map(([date, revenue]) => ({
      date,
      revenue
    })).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: {
        dailyRevenue,
        totalRevenue: salesTransactions.reduce((sum, t) => sum + (t.qty * (t.product?.price || 0)), 0)
      }
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue analytics'
    });
  }
};

module.exports = {
  getProductAnalytics,
  getTransactionAnalytics,
  getInventoryAnalytics,
  getDashboardAnalytics,
  getRevenueAnalytics
};
