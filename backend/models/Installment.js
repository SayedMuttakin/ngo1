const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema({
  member: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member',
    required: [true, 'Member is required']
  },
  collector: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Collector is required']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required']
    // Note: corrections use negative amounts, so no min:0 constraint
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  lastPaymentAmount: {
    type: Number,
    default: 0
  },
  outstandingAtCollection: {
    type: Number,
    default: null
  },
  remainingAmount: {
    type: Number,
    default: function () { return this.amount; }
    // Note: corrections can have negative amounts
  },
  installmentType: {
    type: String,
    enum: ['regular', 'extra', 'advance', 'penalty', 'savings'],
    default: 'regular'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'mobile_banking', 'bank_transfer', 'savings_deduction', 'savings_withdrawal', 'correction'],
    default: 'cash'
  },
  collectionDate: {
    type: Date,
    required: false
  },
  dueDate: {
    type: Date,
    required: false  // Optional - for scheduled installments
  },
  collectionDay: {
    type: String,
    enum: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    required: [true, 'Collection day is required']
  },
  weekNumber: {
    type: Number,
    required: false
  },
  monthYear: {
    type: String,
    required: false // Format: "2024-03"
  },
  branch: {
    type: String,
    required: [true, 'Branch is required']
  },
  branchCode: {
    type: String,
    required: [true, 'Branch code is required']
  },
  note: {
    type: String,
    trim: true,
    maxlength: [500, 'Note cannot be more than 500 characters']
  },
  status: {
    type: String,
    enum: ['collected', 'pending', 'partial', 'missed', 'cancelled', 'correction'],
    default: 'collected'
  },
  receiptNumber: {
    type: String,
    unique: true,
    sparse: true, // Allow null/undefined values (not counted for uniqueness)
    required: false // Optional - auto-applied installments won't have receipt
  },
  // GPS location where payment was collected
  location: {
    latitude: {
      type: Number,
      min: [-90, 'Invalid latitude'],
      max: [90, 'Invalid latitude']
    },
    longitude: {
      type: Number,
      min: [-180, 'Invalid longitude'],
      max: [180, 'Invalid longitude']
    }
  },
  // Tracking fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Distribution/Sale grouping fields
  distributionId: {
    type: String,
    default: null,
    index: true
  },
  serialNumber: {
    type: Number,
    default: null
  },
  totalInDistribution: {
    type: Number,
    default: null
  },
  // Product sale date tracking (for product loans only)
  saleDate: {
    type: Date,
    default: null,  // Only set for product loan installments
    required: false
  },
  // Installment frequency (for product loans)
  installmentFrequency: {
    type: String,
    default: null,
    required: false,
    validate: {
      validator: function (v) {
        // Allow null/undefined for non-product-loan installments
        if (v === null || v === undefined) return true;
        // Otherwise must be one of these values
        return ['daily', 'weekly', 'monthly'].includes(v);
      },
      message: props => `${props.value} is not a valid installment frequency. Use 'daily', 'weekly', or 'monthly'.`
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // SMS tracking field
  lastSmsDate: {
    type: Date,
    default: null  // Will be set when SMS is sent
  },
  smsCount: {
    type: Number,
    default: 0  // Track how many SMS sent for this installment
  },
  // Auto deduction tracking fields
  isDeduction: {
    type: Boolean,
    default: false  // Flag to identify savings deduction records
  },
  originalInstallmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Installment',
    default: null  // Reference to original installment for deduction records
  },
  // Overpayment auto-apply tracking
  isAutoApplied: {
    type: Boolean,
    default: false  // Flag to identify installments paid via overpayment auto-apply
  },
  // ✅ NEW: Payment history to track each partial payment
  paymentHistory: [{
    amount: {
      type: Number,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    collector: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    receiptNumber: String,
    note: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
installmentSchema.index({ member: 1, collectionDate: -1 });
installmentSchema.index({ collector: 1, collectionDate: -1 });
installmentSchema.index({ branchCode: 1, collectionDate: -1 });
installmentSchema.index({ collectionDay: 1, weekNumber: 1 });
installmentSchema.index({ monthYear: 1 });
installmentSchema.index({ receiptNumber: 1 });
installmentSchema.index({ status: 1 });

// Generate receipt number before saving
installmentSchema.pre('save', async function (next) {
  // Don't generate receipt for auto-applied installments (paid via overpayment)
  if (this.isNew && !this.receiptNumber && !this.isAutoApplied) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    // Find the last receipt number for today
    const lastInstallment = await this.constructor.findOne({
      receiptNumber: new RegExp(`^INS${year}${month}${day}`)
    }).sort({ receiptNumber: -1 });

    let sequence = 1;
    if (lastInstallment) {
      const lastSequence = parseInt(lastInstallment.receiptNumber.slice(-4));
      sequence = lastSequence + 1;
    }

    this.receiptNumber = `INS${year}${month}${day}${sequence.toString().padStart(4, '0')}`;
  }

  this.updatedAt = Date.now();
  next();
});

// Calculate week number from date
installmentSchema.pre('save', function (next) {
  if (this.collectionDate) {
    const date = new Date(this.collectionDate);
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - startOfYear) / 86400000;
    this.weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);

    // Set month-year
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    this.monthYear = `${date.getFullYear()}-${month}`;
  }
  next();
});

// Static method to get installments by collector and date range
installmentSchema.statics.findByCollectorAndDateRange = function (collectorId, startDate, endDate) {
  return this.find({
    collector: collectorId,
    collectionDate: {
      $gte: startDate,
      $lte: endDate
    },
    isActive: true
  }).populate('member', 'name phone branch branchCode')
    .sort({ collectionDate: -1 });
};

// Static method to get daily collection summary
installmentSchema.statics.getDailyCollectionSummary = function (date, collectorId = null) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const matchQuery = {
    collectionDate: { $gte: startOfDay, $lte: endOfDay },
    status: 'collected',
    isActive: true
  };

  if (collectorId) {
    matchQuery.collector = mongoose.Types.ObjectId(collectorId);
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$collector',
        totalAmount: { $sum: '$amount' },
        totalInstallments: { $sum: 1 },
        regularInstallments: {
          $sum: { $cond: [{ $eq: ['$installmentType', 'regular'] }, 1, 0] }
        },
        extraInstallments: {
          $sum: { $cond: [{ $eq: ['$installmentType', 'extra'] }, 1, 0] }
        },
        branches: { $addToSet: '$branch' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'collectorInfo'
      }
    },
    {
      $unwind: '$collectorInfo'
    },
    {
      $project: {
        collectorId: '$_id',
        collectorName: '$collectorInfo.name',
        totalAmount: 1,
        totalInstallments: 1,
        regularInstallments: 1,
        extraInstallments: 1,
        branches: 1,
        branchCount: { $size: '$branches' }
      }
    }
  ]);
};

// Static method to get member installment history
installmentSchema.statics.getMemberHistory = function (memberId, limit = 10) {
  return this.find({
    member: memberId,
    isActive: true
  }).populate('member', 'name phone branch branchCode')
    .populate('collector', 'name')
    .sort({ collectionDate: -1 })
    .limit(limit);
};

// Instance method to get installment summary
installmentSchema.methods.getSummary = function () {
  return {
    id: this._id,
    receiptNumber: this.receiptNumber,
    amount: this.amount,
    installmentType: this.installmentType,
    collectionDate: this.collectionDate,
    collectionDay: this.collectionDay,
    status: this.status,
    note: this.note
  };
};

module.exports = mongoose.model('Installment', installmentSchema);