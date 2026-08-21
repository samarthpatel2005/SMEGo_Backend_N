// models/Organization.js
const mongoose = require("mongoose");
const crypto = require("crypto");

const organizationSchema = new mongoose.Schema(
  {
    orgId: {
      type: String,
      default: () => crypto.randomUUID(), // unique ID without nanoid
      unique: true,
    },
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 100,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    legalName: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      enum: [
        "Technology",
        "Healthcare",
        "Finance",
        "Education",
        "Manufacturing",
        "Retail",
        "Consulting",
        "Professional Services",
        "Real Estate",
        "Construction",
        "Food & Beverage",
        "Transportation",
        "Media & Entertainment",
        "Non-profit",
        "Government",
        "Other",
      ],
    },
    country: {
      type: String,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      enum: ["USD", "INR", "EUR", "GBP"],
    },
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    taxId: {
      type: String,
      validate: {
        validator: function (taxId) {
          if (!taxId || taxId.trim() === '') return true;
          // Skip validation for test/placeholder values
          if (taxId.startsWith('GST') || taxId.startsWith('TEST')) return true;
          // Basic GST validation for India
          if (this.country === "IN") {
            return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
              taxId
            );
          }
          return true;
        },
        message: "Invalid tax ID format",
      },
    },
    invoiceNumberPrefix: {
      type: String,
      default: "INV",
      maxlength: 10,
    },
    joinCode: {
      type: String,
      unique: true,
      uppercase: true,
      minlength: 6,
      maxlength: 8,
    },
    allowedEmailDomains: [String],
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false, // Allow creation without owner initially
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    settings: {
      allowEmployeeInvites: { type: Boolean, default: true },
      allowClientRegistration: { type: Boolean, default: true },
      requireEmailDomain: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

// 🔹 Generate unique join code
organizationSchema.methods.generateJoinCode = function () {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// 🔹 Generate slug + ensure joinCode
organizationSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-");
  }
  if (!this.joinCode) {
    this.joinCode = this.generateJoinCode();
  }
  next();
});

module.exports = mongoose.model("Organization", organizationSchema);
