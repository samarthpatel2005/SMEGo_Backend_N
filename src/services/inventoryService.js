// services/inventoryService.js
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');

class InventoryService {
  
  // Immediately deduct stock for invoice items (on invoice creation)
  async deductStockForInvoice(invoiceItems, organizationId, userId, invoiceId) {
    console.log('🔄 Starting stock deduction for invoice:', invoiceId);
    console.log('📦 Items to process:', invoiceItems.length);
    
    const deductionResults = [];
    
    for (const item of invoiceItems) {
      console.log(`🔍 Processing item: ${item.description}, ProductID: ${item.productId}, Quantity: ${item.quantity}`);
      
      if (item.productId && item.isInventoryItem !== false) {
        try {
          const product = await Product.findOne({ 
            _id: item.productId, 
            organization: organizationId 
          });
          
          if (!product) {
            console.error(`❌ Product ${item.productId} not found`);
            throw new Error(`Product ${item.productId} not found`);
          }
          
          console.log(`📊 Found product: ${product.name}, Current Stock: ${product.qty}, Track Inventory: ${product.trackInventory}`);
          
          if (!product.trackInventory) {
            console.log(`⏭️ Skipping inventory tracking for ${product.name}`);
            continue; // Skip inventory tracking for this product
          }
          
          if (product.qty < item.quantity) {
            console.error(`❌ Insufficient stock for ${product.name}. Available: ${product.qty}, Required: ${item.quantity}`);
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.qty}, Required: ${item.quantity}`);
          }
          
          // Deduct the stock immediately
          const stockBefore = product.qty;
          console.log(`🔧 About to deduct stock: ${product.name} qty before: ${stockBefore}`);
          
          product.qty -= item.quantity;
          console.log(`🔧 After deduction in memory: ${product.name} qty after: ${product.qty}`);
          
          const savedProduct = await product.save();
          console.log(`💾 Product saved to database: ${savedProduct.name} qty: ${savedProduct.qty}`);
          
          // Verify the save by refetching from database
          const verifyProduct = await Product.findById(product._id);
          console.log(`✔️ Database verification: ${verifyProduct.name} qty: ${verifyProduct.qty}`);
          
          console.log(`✅ Stock deducted for ${product.name}: ${stockBefore} -> ${product.qty} (deducted: ${item.quantity})`);
          
          // Create sale transaction
          const transaction = new Transaction({
            organization: organizationId,
            product: product._id,
            type: 'sale',
            qty: item.quantity,
            unitCost: item.unitPrice,
            totalCost: item.quantity * item.unitPrice,
            stockBefore: stockBefore,
            stockAfter: product.qty,
            createdBy: userId,
            referenceType: 'invoice',
            referenceId: invoiceId,
            note: `Stock deducted for invoice creation`
          });
          
          await transaction.save();
          console.log(`📝 Transaction created for ${product.name}: ${transaction._id}`);
          
          deductionResults.push({
            productId: product._id,
            quantity: item.quantity,
            transactionId: transaction._id
          });
          
        } catch (error) {
          console.error(`❌ Error processing item ${item.description}:`, error);
          console.error(`❌ Error stack:`, error.stack);
          // Rollback any successful deductions
          await this.rollbackDeductions(deductionResults, organizationId, userId);
          throw error;
        }
      } else {
        console.log(`⏭️ Skipping non-inventory item: ${item.description}`);
      }
    }
    
    console.log(`✅ Stock deduction completed. Processed ${deductionResults.length} items.`);
    return deductionResults;
  }

  // Restore stock when invoice is deleted
  async restoreStockForDeletedInvoice(invoiceItems, organizationId, userId, invoiceId) {
    const restorationResults = [];
    
    for (const item of invoiceItems) {
      if (item.productId && item.isInventoryItem !== false) {
        try {
          const product = await Product.findOne({ 
            _id: item.productId, 
            organization: organizationId 
          });
          
          if (!product) {
            console.warn(`Product ${item.productId} not found for stock restoration`);
            continue;
          }
          
          if (!product.trackInventory) {
            continue; // Skip inventory tracking for this product
          }
          
          // Restore the stock
          const stockBefore = product.qty;
          product.qty += item.quantity;
          await product.save();
          
          // Create restoration transaction
          const transaction = new Transaction({
            organization: organizationId,
            product: product._id,
            type: 'adjustment_increase',
            qty: item.quantity,
            unitCost: item.unitPrice,
            totalCost: item.quantity * item.unitPrice,
            stockBefore: stockBefore,
            stockAfter: product.qty,
            createdBy: userId,
            referenceType: 'invoice',
            referenceId: invoiceId,
            note: `Stock restored due to invoice deletion`
          });
          
          await transaction.save();
          
          restorationResults.push({
            productId: product._id,
            quantity: item.quantity,
            transactionId: transaction._id
          });
          
        } catch (error) {
          console.error('Error restoring stock:', error);
          // Continue with other items even if one fails
        }
      }
    }
    
    return restorationResults;
  }

  // Rollback stock deductions in case of error
  async rollbackDeductions(deductionResults, organizationId, userId) {
    for (const deduction of deductionResults) {
      try {
        const product = await Product.findOne({ 
          _id: deduction.productId, 
          organization: organizationId 
        });
        
        if (product) {
          product.qty += deduction.quantity;
          await product.save();
          
          // Create rollback transaction
          const transaction = new Transaction({
            organization: organizationId,
            product: product._id,
            type: 'adjustment',
            qty: deduction.quantity,
            stockBefore: product.qty - deduction.quantity,
            stockAfter: product.qty,
            createdBy: userId,
            note: `Stock rollback due to invoice creation failure`
          });
          
          await transaction.save();
        }
      } catch (error) {
        console.error('Error rolling back stock deduction:', error);
      }
    }
  }

  // Reserve stock for invoice items
  async reserveStockForInvoice(invoiceItems, organizationId, userId) {
    const reservationResults = [];
    
    for (const item of invoiceItems) {
      if (item.productId && item.isInventoryItem !== false) {
        try {
          const product = await Product.findOne({ 
            _id: item.productId, 
            organization: organizationId 
          });
          
          if (!product) {
            throw new Error(`Product ${item.productId} not found`);
          }
          
          if (!product.trackInventory) {
            continue; // Skip inventory tracking for this product
          }
          
          if (product.availableStock < item.quantity) {
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.availableStock}, Required: ${item.quantity}`);
          }
          
          // Reserve the stock
          await product.reserveStock(item.quantity);
          
          // Create reservation transaction
          const transaction = new Transaction({
            organization: organizationId,
            product: product._id,
            type: 'reservation',
            qty: item.quantity,
            unitCost: product.costPrice || 0,
            totalCost: (product.costPrice || 0) * item.quantity,
            note: `Stock reserved for invoice`,
            referenceType: 'invoice',
            stockBefore: product.qty,
            stockAfter: product.qty, // Qty doesn't change, only reserved
            createdBy: userId,
          });
          
          await transaction.save();
          
          reservationResults.push({
            productId: product._id,
            quantity: item.quantity,
            transactionId: transaction._id
          });
          
        } catch (error) {
          // Rollback any successful reservations
          await this.releaseReservations(reservationResults, organizationId, userId);
          throw error;
        }
      }
    }
    
    return reservationResults;
  }
  
  // Release stock reservations
  async releaseReservations(reservationResults, organizationId, userId) {
    for (const reservation of reservationResults) {
      try {
        const product = await Product.findOne({ 
          _id: reservation.productId, 
          organization: organizationId 
        });
        
        if (product) {
          await product.releaseReservedStock(reservation.quantity);
          
          // Create release transaction
          const transaction = new Transaction({
            organization: organizationId,
            product: product._id,
            type: 'adjustment',
            qty: reservation.quantity,
            note: `Stock reservation released`,
            stockBefore: product.qty,
            stockAfter: product.qty,
            createdBy: userId,
          });
          
          await transaction.save();
        }
      } catch (error) {
        console.error('Error releasing reservation:', error);
      }
    }
  }
  
  // Fulfill stock (convert reserved to sold)
  async fulfillStockForInvoice(invoice, userId) {
    const fulfillmentResults = [];
    
    for (const item of invoice.items) {
      if (item.productId && item.isInventoryItem !== false) {
        try {
          const product = await Product.findOne({ 
            _id: item.productId, 
            organization: invoice.organization 
          });
          
          if (!product || !product.trackInventory) {
            continue;
          }
          
          // Fulfill reserved stock
          await product.fulfillReservedStock(item.quantity);
          
          // Create sale transaction
          const transaction = new Transaction({
            organization: invoice.organization,
            product: product._id,
            type: 'sale',
            qty: item.quantity,
            unitCost: item.costPrice || product.costPrice || 0,
            totalCost: (item.costPrice || product.costPrice || 0) * item.quantity,
            note: `Stock fulfilled for invoice ${invoice.invoiceNumber}`,
            referenceType: 'invoice',
            referenceId: invoice._id,
            stockBefore: product.qty + item.quantity,
            stockAfter: product.qty,
            createdBy: userId,
          });
          
          await transaction.save();
          
          fulfillmentResults.push({
            productId: product._id,
            quantity: item.quantity,
            transactionId: transaction._id
          });
          
        } catch (error) {
          console.error('Error fulfilling stock:', error);
          throw error;
        }
      }
    }
    
    return fulfillmentResults;
  }
  
  // Get low stock products
  async getLowStockProducts(organizationId) {
    return await Product.find({
      organization: organizationId,
      isActive: true,
      trackInventory: true,
      $expr: { $lte: ['$qty', '$reorderPoint'] }
    }).sort({ qty: 1 });
  }
  
  // Get inventory valuation
  async getInventoryValuation(organizationId) {
    const products = await Product.find({
      organization: organizationId,
      isActive: true,
      trackInventory: true
    });
    
    let totalValue = 0;
    let totalCostValue = 0;
    
    for (const product of products) {
      totalValue += product.qty * product.price;
      totalCostValue += product.qty * (product.costPrice || 0);
    }
    
    return {
      totalRetailValue: totalValue,
      totalCostValue: totalCostValue,
      potentialProfit: totalValue - totalCostValue,
      productCount: products.length
    };
  }
}

module.exports = new InventoryService();
