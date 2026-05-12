const mongoose = require('mongoose');

const collectionHistorySchema = new mongoose.Schema({
    // Reference to the original installment
    installment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Installment',
        required: true,
        index: true
    },
    // Reference to member
    member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member',
        required: true,
        index: true
    },
    // Reference to collector who made this collection
    collector: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Amount collected in THIS specific transaction (negative for corrections)
    collectionAmount: {
        type: Number,
        required: true
    },
    // Date when this collection was made
    collectionDate: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    // Receipt number for this collection
    receiptNumber: {
        type: String,
        required: false
    },
    // Payment method used
    paymentMethod: {
        type: String,
        enum: ['cash', 'mobile_banking', 'bank_transfer', 'savings_deduction', 'savings_withdrawal', 'correction'],
        default: 'cash'
    },
    // Outstanding loan balance AFTER this collection
    outstandingAfterCollection: {
        type: Number,
        required: true
    },
    // Installment details at time of collection
    installmentTarget: {
        type: Number,
        required: true
    },
    installmentDue: {
        type: Number,
        required: true
    },
    // Distribution/Product loan grouping
    distributionId: {
        type: String,
        required: false,
        index: true
    },
    // Branch information
    branch: {
        type: String,
        required: true
    },
    branchCode: {
        type: String,
        required: true
    },
    // Collection day info
    collectionDay: {
        type: String,
        enum: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        required: true
    },
    weekNumber: {
        type: Number,
        required: true
    },
    monthYear: {
        type: String,
        required: true
    },
    // Additional notes
    note: {
        type: String,
        trim: true
    },
    // Tracking
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes for better query performance
collectionHistorySchema.index({ member: 1, collectionDate: -1 });
collectionHistorySchema.index({ distributionId: 1, collectionDate: 1 });
collectionHistorySchema.index({ collector: 1, collectionDate: -1 });
collectionHistorySchema.index({ branchCode: 1, collectionDate: -1 });

// Static method to get collection history by member
collectionHistorySchema.statics.getByMember = function (memberId) {
    return this.find({
        member: memberId,
        isActive: true
    })
        .populate('member', 'name phone branch branchCode')
        .populate('collector', 'name')
        .populate('installment', 'note serialNumber totalInDistribution')
        .sort({ collectionDate: 1 });
};

// Static method to get collection history by distribution
collectionHistorySchema.statics.getByDistribution = function (distributionId) {
    return this.find({
        distributionId: distributionId,
        isActive: true
    })
        .populate('member', 'name phone')
        .populate('collector', 'name')
        .sort({ collectionDate: 1 });
};

module.exports = mongoose.model('CollectionHistory', collectionHistorySchema);
