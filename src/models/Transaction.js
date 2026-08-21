const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    type: {
      type: String,
      enum: ["purchase", "sale", "adjustment", "adjustment_increase", "adjustment_decrease", "reservation", "fulfillment", "return"],
      required: true,
    },
    qty: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    unitCost: {
      type: Number,
      default: 0,
      min: [0, "Unit cost cannot be negative"],
    },
    totalCost: {
      type: Number,
      default: 0,
      min: [0, "Total cost cannot be negative"],
    },
    note: {
      type: String,
      trim: true,
    },
    // Reference tracking
    referenceType: {
      type: String,
      enum: ["invoice", "purchase_order", "manual", "return", "adjustment"],
      default: "manual",
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'referenceModel',
    },
    referenceModel: {
      type: String,
      enum: ["Invoice", "PurchaseOrder"],
    },
    // Stock levels after transaction
    stockBefore: {
      type: Number,
      required: true,
    },
    stockAfter: {
      type: Number,
      required: true,
    },
    // User who performed the transaction
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
transactionSchema.index({ product: 1, createdAt: -1 });
transactionSchema.index({ organization: 1, type: 1 });
transactionSchema.index({ referenceType: 1, referenceId: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);