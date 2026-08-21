const Product = require("../models/Product");
const inventoryService = require('../services/inventoryService');

// Transform backend product model to frontend expected format
const transformProductForFrontend = (product) => {
  const productObj = product.toObject ? product.toObject() : product;
  return {
    ...productObj,
    stock: productObj.qty, // backend 'qty' -> frontend 'stock'
    sellingPrice: productObj.price, // backend 'price' -> frontend 'sellingPrice'
    reservedStock: productObj.reservedQty || 0,
    availableStock: productObj.availableStock || Math.max(0, (productObj.qty || 0) - (productObj.reservedQty || 0)),
    isLowStock: productObj.qty <= (productObj.reorderPoint || 10)
  };
};

// Get all products with enhanced filtering and search
const getProducts = async (req, res, next) => {
  try {
    const { search, category, trackInventory, lowStock, page = 1, limit = 50 } = req.query;
    
    const query = { organization: req.user.organization };
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by inventory tracking
    if (trackInventory !== undefined) {
      query.trackInventory = trackInventory === 'true';
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Filter for low stock if requested
    if (lowStock === 'true') {
      products = products.filter(product => product.isLowStock);
    }
    
    const total = await Product.countDocuments(query);
    
    // Transform products for frontend
    const transformedProducts = products.map(transformProductForFrontend);
    
    res.json({
      success: true,
      data: transformedProducts,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (err) {
    console.error('getProducts error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch products' 
    });
  }
};

// Get single product
const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    res.json({ success: true, data: transformProductForFrontend(product) });
  } catch (err) {
    console.error('getProduct error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch product' 
    });
  }
};

// Create product with enhanced validation
const createProduct = async (req, res, next) => {
  try {
    console.log('Received product data:', req.body);
    
    // Auto-generate SKU if not provided
    let sku = req.body.sku;
    if (!sku || sku.trim() === '') {
      // Generate SKU from product name + timestamp
      const namePrefix = (req.body.name || 'PRD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
      const timestamp = Date.now().toString(36).toUpperCase();
      sku = `${namePrefix}-${timestamp}`;
    }
    
    // Map frontend data to backend model fields
    const productData = {
      name: req.body.name,
      sku: sku,
      description: req.body.description,
      category: req.body.category,
      qty: req.body.stock || 0, // frontend sends 'stock', model expects 'qty'
      price: req.body.sellingPrice || 0, // frontend sends 'sellingPrice', model expects 'price'
      costPrice: req.body.costPrice || 0,
      reorderPoint: req.body.reorderPoint || 10,
      trackInventory: req.body.trackInventory !== false,
      isActive: req.body.isActive !== false,
      organization: req.user.organization,
      createdBy: req.user._id
    };
    
    console.log('Mapped product data:', productData);
    
    // Validate required fields
    if (!productData.name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product name is required' 
      });
    }
    
    if (!productData.price || productData.price <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid selling price is required' 
      });
    }
    
    // Check for duplicate SKU within organization
    if (productData.sku) {
      const existingProduct = await Product.findOne({
        sku: productData.sku,
        organization: req.user.organization
      });
      
      if (existingProduct) {
        return res.status(400).json({ 
          success: false, 
          message: 'SKU already exists in your organization' 
        });
      }
    }
    
    const product = await Product.create(productData);
    
    res.status(201).json({ 
      success: true, 
      data: transformProductForFrontend(product),
      message: 'Product created successfully'
    });
  } catch (err) {
    console.error('createProduct error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product with this SKU already exists' 
      });
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create product' 
    });
  }
};

// Update product
const updateProduct = async (req, res, next) => {
  try {
    const { sku } = req.body;
    
    // Check for duplicate SKU if being updated
    if (sku) {
      const existingProduct = await Product.findOne({
        sku,
        organization: req.user.organization,
        _id: { $ne: req.params.id }
      });
      
      if (existingProduct) {
        return res.status(400).json({ 
          success: false, 
          message: 'SKU already exists in your organization' 
        });
      }
    }
    
    // Map frontend data to backend model fields for update
    const updateData = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.sku !== undefined) updateData.sku = req.body.sku;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.stock !== undefined) updateData.qty = req.body.stock; // frontend 'stock' -> backend 'qty'
    if (req.body.sellingPrice !== undefined) updateData.price = req.body.sellingPrice; // frontend 'sellingPrice' -> backend 'price'
    if (req.body.costPrice !== undefined) updateData.costPrice = req.body.costPrice;
    if (req.body.reorderPoint !== undefined) updateData.reorderPoint = req.body.reorderPoint;
    if (req.body.trackInventory !== undefined) updateData.trackInventory = req.body.trackInventory;
    if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;
    updateData.updatedAt = new Date();
    
    const product = await Product.findOneAndUpdate(
      { 
        _id: req.params.id, 
        organization: req.user.organization 
      },
      updateData,
      { 
        new: true, 
        runValidators: true 
      }
    );
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: transformProductForFrontend(product),
      message: 'Product updated successfully'
    });
  } catch (err) {
    console.error('updateProduct error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update product' 
    });
  }
};

// Delete product
const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    // Check if product has reserved stock
    if (product.reservedStock > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete product with reserved stock. Fulfill or cancel reservations first.' 
      });
    }
    
    await Product.findByIdAndDelete(req.params.id);
    
    res.json({ 
      success: true, 
      message: 'Product deleted successfully' 
    });
  } catch (err) {
    console.error('deleteProduct error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete product' 
    });
  }
};

// Adjust stock levels
const adjustStock = async (req, res, next) => {
  try {
    const { quantity, reason, type } = req.body;
    
    if (!quantity || !reason || !type) {
      return res.status(400).json({ 
        success: false, 
        message: 'Quantity, reason, and type are required' 
      });
    }
    
    if (!['increase', 'decrease'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type must be either "increase" or "decrease"' 
      });
    }
    
    const product = await Product.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    if (!product.trackInventory) {
      return res.status(400).json({ 
        success: false, 
        message: 'This product does not track inventory' 
      });
    }
    
    const adjustment = type === 'increase' ? quantity : -quantity;
    const newStock = product.stock + adjustment;
    
    if (newStock < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Insufficient stock for this adjustment' 
      });
    }
    
    // Create transaction record
    await inventoryService.createStockTransaction({
      organization: req.user.organization,
      product: product._id,
      type: 'adjustment',
      quantity: adjustment,
      reason,
      performedBy: req.user._id,
      stockBefore: product.stock,
      stockAfter: newStock
    });
    
    // Update product stock
    product.stock = newStock;
    await product.save();
    
    res.json({ 
      success: true, 
      data: transformProductForFrontend(product),
      message: `Stock ${type}d successfully`
    });
  } catch (err) {
    console.error('adjustStock error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to adjust stock' 
    });
  }
};

// Get low stock products
const getLowStockProducts = async (req, res, next) => {
  try {
    const products = await inventoryService.getLowStockProducts(req.user.organization);
    
    res.json({ 
      success: true, 
      data: products.map(transformProductForFrontend),
      count: products.length
    });
  } catch (err) {
    console.error('getLowStockProducts error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch low stock products' 
    });
  }
};

// Get inventory valuation
const getInventoryValuation = async (req, res, next) => {
  try {
    const valuation = await inventoryService.getInventoryValuation(req.user.organization);
    
    res.json({ 
      success: true, 
      data: valuation
    });
  } catch (err) {
    console.error('getInventoryValuation error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to calculate inventory valuation' 
    });
  }
};

// Get product categories
const getCategories = async (req, res, next) => {
  try {
    const categories = await Product.distinct('category', {
      organization: req.user.organization,
      category: { $exists: true, $ne: null, $ne: '' }
    });
    
    res.json({ 
      success: true, 
      data: categories.sort()
    });
  } catch (err) {
    console.error('getCategories error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch categories' 
    });
  }
};

// Test endpoint to manually deduct stock (for debugging)
const testStockDeduction = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    
    console.log(`🧪 Test stock deduction: ProductID=${productId}, Quantity=${quantity}`);
    
    const product = await Product.findOne({
      _id: productId,
      organization: req.user.organization
    });
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    console.log(`📊 Before deduction: ${product.name} = ${product.qty} units`);
    
    if (product.qty < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${product.qty}, Required: ${quantity}`
      });
    }
    
    const stockBefore = product.qty;
    product.qty -= quantity;
    await product.save();
    
    console.log(`✅ After deduction: ${product.name} = ${product.qty} units`);
    
    res.json({
      success: true,
      message: 'Stock deducted successfully',
      data: {
        productName: product.name,
        stockBefore,
        stockAfter: product.qty,
        deducted: quantity
      }
    });
  } catch (err) {
    console.error('testStockDeduction error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to deduct stock' 
    });
  }
};

module.exports = { 
  getProducts, 
  getProduct,
  createProduct, 
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts,
  getInventoryValuation,
  getCategories,
  testStockDeduction
};