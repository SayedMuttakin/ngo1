const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    minlength: [2, 'Product name must be at least 2 characters'],
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    enum: ['Food', 'Clothing', 'Medicine', 'Education', 'Emergency', 'Other'],
    default: 'Other'
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  unit: {
    type: String,
    required: [true, 'Product unit is required'],
    trim: true,
    enum: ['piece', 'kg', 'liter', 'box', 'bag', 'bosta', 'bottle', 'packet', 'dozen'],
    default: 'piece'
  },
  unitPrice: {
    type: Number,
    required: [true, 'Unit price is required'],
    min: [0, 'Unit price cannot be negative']
  },
  totalStock: {
    type: Number,
    required: [true, 'Total stock is required'],
    min: [0, 'Total stock cannot be negative'],
    default: 0
  },
  availableStock: {
    type: Number,
    required: [true, 'Available stock is required'],
    min: [0, 'Available stock cannot be negative'],
    default: 0
  },
  initialStock: {
    type: Number,
    default: 0
  },
  distributedStock: {
    type: Number,
    default: 0,
    min: [0, 'Distributed stock cannot be negative']
  },
  minimumStock: {
    type: Number,
    default: 10,
    min: [0, 'Minimum stock cannot be negative']
  },
  expiryDate: {
    type: Date,
    default: null
  },
  supplier: {
    name: {
      type: String,
      trim: true
    },
    contact: {
      type: String,
      trim: true
    }
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Out of Stock', 'Expired'],
    default: 'Active'
  },
  // Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  restockHistory: [{
    quantity: {
      type: Number,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      trim: true
    }
  }]
}, {
  timestamps: true
});

// Indexes for better performance
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });
productSchema.index({ createdBy: 1 });

// Virtual for stock percentage
productSchema.virtual('stockPercentage').get(function() {
  if (this.totalStock === 0) return 0;
  return Math.round((this.availableStock / this.totalStock) * 100);
});

// Virtual for low stock alert
productSchema.virtual('isLowStock').get(function() {
  return this.availableStock <= this.minimumStock;
});

// Pre-save middleware to update status based on stock
productSchema.pre('save', function(next) {
  if (this.availableStock === 0) {
    this.status = 'Out of Stock';
  } else if (this.expiryDate && this.expiryDate < new Date()) {
    this.status = 'Expired';
  } else if (this.status === 'Out of Stock' && this.availableStock > 0) {
    this.status = 'Active';
  }
  
  // Update distributed stock
  this.distributedStock = this.totalStock - this.availableStock;
  
  next();
});

// Ensure virtuals are included in JSON output
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
