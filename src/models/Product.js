const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    // Inventory Management
    qty: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },
    reservedQty: {
      type: Number,
      default: 0,
      min: [0, "Reserved quantity cannot be negative"],
    },
    availableQty: {
      type: Number,
      default: function() { return this.qty - this.reservedQty; }
    },
    reorderPoint: {
      type: Number,
      default: 10,
      min: [0, "Reorder point cannot be negative"],
    },
    reorderQty: {
      type: Number,
      default: 50,
      min: [0, "Reorder quantity cannot be negative"],
    },
    // Pricing
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    costPrice: {
      type: Number,
      min: [0, "Cost price cannot be negative"],
      default: 0,
    },
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    trackInventory: {
      type: Boolean,
      default: true,
    },
    // Organization reference
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
  },
  { timestamps: true }
);

// Virtual for available quantity
productSchema.virtual('availableStock').get(function() {
  return Math.max(0, this.qty - this.reservedQty);
});

// Method to check if product is low stock
productSchema.methods.isLowStock = function() {
  return this.qty <= this.reorderPoint;
};

// Method to reserve stock
productSchema.methods.reserveStock = function(quantity) {
  if (this.availableStock < quantity) {
    throw new Error('Insufficient stock available');
  }
  this.reservedQty += quantity;
  return this.save();
};

// Method to release reserved stock
productSchema.methods.releaseReservedStock = function(quantity) {
  this.reservedQty = Math.max(0, this.reservedQty - quantity);
  return this.save();
};

// Method to fulfill reserved stock (convert reserved to sold)
productSchema.methods.fulfillReservedStock = function(quantity) {
  const actualQuantity = Math.min(quantity, this.reservedQty);
  this.reservedQty -= actualQuantity;
  this.qty -= actualQuantity;
  return this.save();
};

module.exports = mongoose.model("Product", productSchema);