const express = require('express');
const User = require('../models/User');
const Member = require('../models/Member');
const CollectionSchedule = require('../models/CollectionSchedule');
const { protect, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Validation middleware for collector creation
// ✅ SIMPLIFIED: Only validate name - email/password auto-generated since collectors don't login
const validateCollector = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s\u0980-\u09FF]+$/)
    .withMessage('Name can only contain letters and spaces'),

  body('phone')
    .optional()
    .matches(/^01[3-9]\d{8}$/)
    .withMessage('Please enter a valid Bangladeshi phone number (01XXXXXXXXX)'),

  body('branch')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Branch name must be between 2 and 100 characters'),

  body('branchCode')
    .optional()
    .matches(/^\d{4}$/)
    .withMessage('Branch code must be exactly 4 digits'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

// @desc    Create new collector
// @route   POST /api/collectors
// @access  Public (Anyone can create collectors)
router.post('/', validateCollector, async (req, res) => {
  try {
    const { name, phone, branch, branchCode, collectionType } = req.body;
    
    // ✅ Auto-generate email and password since collectors don't login
    // Admin/Manager handles all collection operations
    const timestamp = Date.now();
    const sanitizedName = name.trim().toLowerCase().replace(/\s+/g, '.');
    const email = `${sanitizedName}.${timestamp}@collector.satrong.com`;
    const password = 'collector123'; // Dummy password - collectors don't login

    // Check if user already exists with this phone (if provided)
    if (phone) {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'A collector already exists with this phone number'
        });
      }
    }

    // Create collector user
    const collectorData = {
      name,
      email,
      password,
      role: 'collector',
      collectionType: collectionType || 'weekly', // Default to weekly if not provided
      phone,
      branch,
      branchCode,
      isActive: true
      // isApproved is automatically set to true for collectors in User model
    };
    
    const collector = await User.create(collectorData);

    // Remove password from response
    const collectorResponse = collector.toJSON();
    delete collectorResponse.password;

    res.status(201).json({
      success: true,
      message: 'Collector created successfully',
      data: collectorResponse
    });

  } catch (error) {
    console.error('Create collector error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `User already exists with this ${field}`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating collector',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get all collectors
// @route   GET /api/collectors
// @access  Public (Anyone can view collectors)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      branch, 
      branchCode,
      isActive
    } = req.query;

    // Build filter object
    const filter = { 
      role: 'collector'
    };
    
    // ✅ FIXED: Only add isActive filter if explicitly provided
    // If not provided, show all collectors (active and inactive)
    // If provided, filter by the value
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') }
      ];
    }
    
    if (branch) filter.branch = new RegExp(branch, 'i');
    if (branchCode) filter.branchCode = branchCode;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const collectors = await User.find(filter)
      .select('-password')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    // Get additional info for each collector
    const collectorsWithInfo = await Promise.all(
      collectors.map(async (collector) => {
        // Get assigned members count
        const memberCount = await Member.countDocuments({
          assignedCollector: collector._id,
          isActive: true
        });

        // Get collection schedules count
        const scheduleCount = await CollectionSchedule.countDocuments({
          collector: collector._id,
          isActive: true
        });

        // Get assigned branches
        const Branch = require('../models/Branch');
        const assignedBranches = await Branch.find({
          assignedCollector: collector._id,
          isActive: true
        }).select('name branchCode address');

        return {
          ...collector.toJSON(),
          memberCount,
          scheduleCount,
          branches: assignedBranches,
          branchCount: assignedBranches.length
        };
      })
    );

    res.status(200).json({
      success: true,
      data: collectorsWithInfo,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get collectors error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching collectors',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get collectors due amounts
// @route   GET /api/collectors/due-amounts
// @access  Private
router.get('/due-amounts', protect, async (req, res) => {
  try {
    const Installment = require('../models/Installment');
    const Branch = require('../models/Branch');

    // Build filter based on user role
    let collectorFilter = { role: 'collector', isActive: true };
    
    if (req.user.role === 'collector') {
      // If current user is collector, only show their own data
      collectorFilter._id = req.user.id;
    }

    // Get all collectors
    const collectors = await User.find(collectorFilter).select('name email phone branch branchCode');
    console.log(`📊 Found ${collectors.length} collectors in database`);

    // For each collector, calculate their due amounts from pending installments
    const collectorsWithDue = await Promise.all(
      collectors.map(async (collector) => {
        // Get pending installments for this collector
        const pendingInstallments = await Installment.find({
          collector: collector._id,
          status: { $in: ['pending', 'partial'] },
          isActive: true
        }).populate('member', 'name phone branchCode');

        // Calculate total due from pending installments
        const totalDue = pendingInstallments.reduce((sum, inst) => {
          if (inst.status === 'partial') {
            return sum + (inst.amount - inst.paidAmount);
          }
          return sum + inst.amount;
        }, 0);

        // Group products by type from notes
        const productMap = new Map();
        
        pendingInstallments.forEach(inst => {
          if (inst.note && inst.note.includes('Product')) {
            // Extract product name from note
            const productMatch = inst.note.match(/Product.*?:?\s*([^(,]+)/);
            const productName = productMatch ? productMatch[1].trim() : 'Unknown Product';
            
            const dueAmount = inst.status === 'partial' 
              ? (inst.amount - inst.paidAmount) 
              : inst.amount;
            
            if (productMap.has(productName)) {
              const existing = productMap.get(productName);
              existing.quantity += 1;
              existing.totalPrice += inst.amount;
              existing.dueAmount += dueAmount;
              existing.paidAmount += (inst.paidAmount || 0);
            } else {
              productMap.set(productName, {
                name: productName,
                quantity: 1,
                unitPrice: inst.amount,
                totalPrice: inst.amount,
                dueAmount: dueAmount,
                paidAmount: inst.paidAmount || 0
              });
            }
          }
        });

        const products = Array.from(productMap.values());

        // Get assigned branches
        const assignedBranches = await Branch.find({
          assignedCollector: collector._id,
          isActive: true
        }).select('name');

        // Get last payment date
        const lastPayment = await Installment.findOne({
          collector: collector._id,
          status: { $in: ['collected', 'partial'] },
          isActive: true
        }).sort({ collectionDate: -1 }).select('collectionDate');

        return {
          id: collector._id,
          name: collector.name,
          totalDue: totalDue,
          products: products,
          branches: assignedBranches.map(b => b.name),
          lastPayment: lastPayment ? lastPayment.collectionDate : null,
          lastUpdated: new Date()
        };
      })
    );

    // Filter out collectors with no due amounts (optional)
    // Comment out the filter to show all collectors
    // const collectorsWithActiveDue = collectorsWithDue.filter(c => c.totalDue > 0);

    res.status(200).json({
      success: true,
      data: collectorsWithDue, // Show all collectors, even with 0 due
      totalCollectors: collectorsWithDue.length,
      collectorsWithDue: collectorsWithDue.filter(c => c.totalDue > 0).length
    });

  } catch (error) {
    console.error('Get collectors due amounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching due amounts',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get collectors for specific day
// @route   GET /api/collectors/day/:day
// @access  Private
router.get('/day/:day', protect, async (req, res) => {
  try {
    const { day } = req.params;
    
    // Validate day
    const validDays = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    if (!validDays.includes(day)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid day. Must be one of: ' + validDays.join(', ')
      });
    }

    // Get collectors who have schedules for this day
    const schedules = await CollectionSchedule.find({
      collectionDay: day,
      isActive: true
    }).populate('collector', 'name email phone branch branchCode')
     .populate('branches.members', 'name phone monthlyInstallment totalSavings status');

    // Transform data to match frontend expectations
    const collectors = schedules.map(schedule => ({
      id: schedule.collector._id,
      name: schedule.collector.name,
      email: schedule.collector.email,
      phone: schedule.collector.phone,
      branch: schedule.collector.branch,
      branchCode: schedule.collector.branchCode,
      branches: schedule.branches.map(branch => ({
        code: branch.branchCode,
        name: branch.branchName,
        members: branch.members.map(member => ({
          id: member._id,
          name: member.name,
          phone: member.phone,
          monthlyInstallment: member.monthlyInstallment,
          totalSavings: member.totalSavings,
          status: member.status,
          dueAmount: member.monthlyInstallment // For now, using monthly installment as due amount
        }))
      }))
    }));

    res.status(200).json({
      success: true,
      data: collectors
    });

  } catch (error) {
    console.error('Get collectors by day error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching collectors for the day',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get single collector with details
// @route   GET /api/collectors/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const collector = await User.findById(req.params.id)
      .select('-password');

    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({
        success: false,
        message: 'Collector not found'
      });
    }

    // Get assigned members
    const members = await Member.find({
      assignedCollector: collector._id,
      isActive: true
    }).select('name phone branch branchCode monthlyInstallment totalSavings status');

    // Get collection schedules
    const schedules = await CollectionSchedule.find({
      collector: collector._id,
      isActive: true
    }).populate('branches.members', 'name phone monthlyInstallment');

    // Get collector statistics
    const stats = {
      totalMembers: members.length,
      totalSchedules: schedules.length,
      activeBranches: [...new Set(members.map(m => m.branchCode))].length
    };

    res.status(200).json({
      success: true,
      data: {
        collector: collector.toJSON(),
        members,
        schedules,
        stats
      }
    });

  } catch (error) {
    console.error('Get collector error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid collector ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching collector',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Update collector
// @route   PUT /api/collectors/:id
// @access  Private (Admin/Manager only)
router.put('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, phone, branch, branchCode, isActive } = req.body;

    const collector = await User.findById(req.params.id);

    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({
        success: false,
        message: 'Collector not found'
      });
    }

    // Check for duplicate phone (excluding current collector)
    if (phone && phone !== collector.phone) {
      const existingUser = await User.findOne({ 
        phone, 
        _id: { $ne: req.params.id } 
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Phone number already exists'
        });
      }
    }

    // Update collector
    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (branch) updateData.branch = branch;
    if (branchCode) updateData.branchCode = branchCode;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedCollector = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'Collector updated successfully',
      data: updatedCollector
    });

  } catch (error) {
    console.error('Update collector error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid collector ID'
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating collector',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Assign members to collector
// @route   POST /api/collectors/:id/assign-members
// @access  Private (Admin/Manager only)
router.post('/:id/assign-members', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { memberIds } = req.body;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Member IDs array is required'
      });
    }

    const collector = await User.findById(req.params.id);

    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({
        success: false,
        message: 'Collector not found'
      });
    }

    // Validate member IDs
    const validMembers = await Member.find({
      _id: { $in: memberIds },
      isActive: true
    });

    if (validMembers.length !== memberIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some member IDs are invalid or inactive'
      });
    }

    // Assign members to collector
    await Member.updateMany(
      { _id: { $in: memberIds } },
      { 
        assignedCollector: collector._id,
        updatedBy: req.user.id
      }
    );

    res.status(200).json({
      success: true,
      message: `${memberIds.length} members assigned to ${collector.name} successfully`
    });

  } catch (error) {
    console.error('Assign members error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while assigning members',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Remove members from collector
// @route   POST /api/collectors/:id/remove-members
// @access  Private (Admin/Manager only)
router.post('/:id/remove-members', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { memberIds } = req.body;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Member IDs array is required'
      });
    }

    const collector = await User.findById(req.params.id);

    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({
        success: false,
        message: 'Collector not found'
      });
    }

    // Remove collector assignment from members
    await Member.updateMany(
      { 
        _id: { $in: memberIds },
        assignedCollector: collector._id
      },
      { 
        $unset: { assignedCollector: 1 },
        updatedBy: req.user.id
      }
    );

    res.status(200).json({
      success: true,
      message: `Members removed from ${collector.name} successfully`
    });

  } catch (error) {
    console.error('Remove members error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while removing members',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Deactivate collector (soft delete)
// @route   DELETE /api/collectors/:id
// @access  Private (Admin/Manager only)
router.delete('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const collector = await User.findById(req.params.id);

    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({
        success: false,
        message: 'Collector not found'
      });
    }

    // Deactivate collector
    collector.isActive = false;
    await collector.save();

    // Remove collector assignment from all members
    await Member.updateMany(
      { assignedCollector: collector._id },
      { 
        $unset: { assignedCollector: 1 },
        updatedBy: req.user.id
      }
    );

    // Deactivate all schedules
    await CollectionSchedule.updateMany(
      { collector: collector._id },
      { 
        isActive: false,
        updatedBy: req.user.id
      }
    );

    res.status(200).json({
      success: true,
      message: 'Collector deactivated successfully'
    });

  } catch (error) {
    console.error('Deactivate collector error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deactivating collector',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});
// @desc    Get collector savings overview (net savings of all members)
// @route   GET /api/collectors/:id/savings-overview
// @access  Private
router.get('/:id/savings-overview', protect, async (req, res) => {
  try {
    const Installment = require('../models/Installment');

    const collector = await User.findById(req.params.id).select('-password');
    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({ success: false, message: 'Collector not found' });
    }

    // Get all members assigned to this collector
    const members = await Member.find({
      assignedCollector: collector._id,
      isActive: true
    }).select('name memberCode phone branchCode totalSavings');

    // For each member, calculate net savings = savings_in - savings_out
    const memberSavingsDetails = await Promise.all(
      members.map(async (member, idx) => {
        const savingsRecords = await Installment.find({
          member: member._id,
          installmentType: { $in: ['extra', 'savings'] },
          isActive: true
        }).select('amount note installmentType collectionDate status');

        let savingsIn = 0;
        let savingsOut = 0;

        savingsRecords.forEach(rec => {
          const note = rec.note || '';
          if (note.match(/Product Sale:.+\(Qty:/)) return; // Exclude product sale records
          const isSavingsWithdrawal = note.includes('Savings Withdrawal') || note.includes('Withdrawal');
          const isSavingsCollection = note.includes('Savings Collection') || note.includes('Initial Savings');
          if (isSavingsWithdrawal) {
            savingsOut += rec.amount || 0;
          } else if (isSavingsCollection) {
            savingsIn += rec.amount || 0;
          }
        });

        const netSavings = Math.max(0, savingsIn - savingsOut);

        return {
          serial: idx + 1,
          memberId: member._id,
          name: member.name,
          memberCode: member.memberCode || '',
          phone: member.phone || '',
          branchCode: member.branchCode || '',
          savingsIn,
          savingsOut,
          netSavings
        };
      })
    );

    const totalSavingsIn = memberSavingsDetails.reduce((s, m) => s + m.savingsIn, 0);
    const totalSavingsOut = memberSavingsDetails.reduce((s, m) => s + m.savingsOut, 0);
    const totalNetSavings = memberSavingsDetails.reduce((s, m) => s + m.netSavings, 0);

    res.status(200).json({
      success: true,
      data: {
        collector: { id: collector._id, name: collector.name, phone: collector.phone },
        members: memberSavingsDetails,
        summary: { totalSavingsIn, totalSavingsOut, totalNetSavings, memberCount: members.length }
      }
    });

  } catch (error) {
    console.error('Collector savings overview error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// @desc    Get collector daily collection report (today's installments & savings)
// @route   GET /api/collectors/:id/daily-report
// @access  Private
router.get('/:id/daily-report', protect, async (req, res) => {
  try {
    const CollectionHistory = require('../models/CollectionHistory');

    const { date } = req.query;

    const collector = await User.findById(req.params.id).select('-password');
    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({ success: false, message: 'Collector not found' });
    }

    // Build date range for the target day (Bangladesh = UTC+6)
    let targetDateStr;
    if (date) {
      targetDateStr = date;
    } else {
      const now = new Date();
      const bdNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      targetDateStr = bdNow.toISOString().split('T')[0];
    }

    const [year, month, day] = targetDateStr.split('-').map(Number);
    const startUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 6 * 60 * 60 * 1000);
    const endUTC   = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 6 * 60 * 60 * 1000);

    // Use CollectionHistory for exact per-transaction collected amounts
    const todayHistory = await CollectionHistory.find({
      collector: collector._id,
      collectionDate: { $gte: startUTC, $lte: endUTC },
      isActive: true
    }).populate('member', 'name memberCode phone branchCode');

    // Group by member
    const memberMap = new Map();

    todayHistory.forEach(hist => {
      const memberId = hist.member?._id?.toString();
      if (!memberId) return;

      // Skip savings-withdrawal (savings going OUT, not a collection-in)
      if (hist.paymentMethod === 'savings_withdrawal') return;

      // Skip product-sale records (they inflate loan amount)
      const histNote = hist.note || '';
      if (histNote.includes('Product Sale:') || histNote.includes('Product Loan')) return;

      if (!memberMap.has(memberId)) {
        memberMap.set(memberId, {
          memberId,
          memberName: hist.member.name || 'Unknown',
          memberCode: hist.member.memberCode || '',
          phone: hist.member.phone || '',
          branchCode: hist.member.branchCode || hist.branchCode || '',
          // CollectionHistory stores branch full name directly in hist.branch
          branchName: hist.branch || hist.member.branchCode || 'N/A',
          loanAmount: 0,
          savingsAmount: 0
        });
      }

      const entry  = memberMap.get(memberId);
      const amount = hist.collectionAmount || 0;

      // Identify savings by note (stored directly in CollectionHistory)
      const isSavings = (
        histNote.includes('Savings Collection') ||
        histNote.includes('Initial Savings')
      );

      if (isSavings) {
        entry.savingsAmount += amount;
      } else {
        entry.loanAmount += amount;
      }
    });

    // Build result rows — branchName already set in memberMap from CollectionHistory.branch
    const reportRows = [...memberMap.values()].map(entry => ({
      ...entry,
      totalCollected: entry.loanAmount + entry.savingsAmount
    }));

    // Sort: branch code asc, then member name asc
    reportRows.sort((a, b) => {
      if (a.branchCode < b.branchCode) return -1;
      if (a.branchCode > b.branchCode) return 1;
      return a.memberName.localeCompare(b.memberName);
    });
    reportRows.forEach((r, i) => { r.serial = i + 1; });

    const totalLoan       = reportRows.reduce((s, r) => s + r.loanAmount, 0);
    const totalSavings    = reportRows.reduce((s, r) => s + r.savingsAmount, 0);
    const totalCollection = reportRows.reduce((s, r) => s + r.totalCollected, 0);

    res.status(200).json({
      success: true,
      data: {
        collector: { id: collector._id, name: collector.name, phone: collector.phone },
        reportDate: targetDateStr,
        members: reportRows,
        summary: {
          memberCount: reportRows.length,
          totalLoanCollection: totalLoan,
          totalSavingsCollection: totalSavings,
          totalCollection
        }
      }
    });

  } catch (error) {
    console.error('Collector daily report error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// @desc    Get today's savings withdrawals under a collector
// @route   GET /api/collectors/:id/todays-savings-out
// @access  Private
router.get('/:id/todays-savings-out', protect, async (req, res) => {
  try {
    const Installment = require('../models/Installment');

    const { date } = req.query;

    const collector = await User.findById(req.params.id).select('-password');
    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({ success: false, message: 'Collector not found' });
    }

    // BD date range
    let targetDateStr;
    if (date) {
      targetDateStr = date;
    } else {
      const now = new Date();
      const bdNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      targetDateStr = bdNow.toISOString().split('T')[0];
    }

    const [year, month, day] = targetDateStr.split('-').map(Number);
    const startUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 6 * 60 * 60 * 1000);
    const endUTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59) - 6 * 60 * 60 * 1000);

    // Find all members assigned to this collector
    const members = await Member.find({
      assignedCollector: collector._id,
      isActive: true
    }).select('_id');
    const memberIds = members.map(m => m._id);

    // Find savings withdrawal records today for these members
    const withdrawals = await Installment.find({
      member: { $in: memberIds },
      note: { $regex: 'Savings Withdrawal|Withdrawal', $options: 'i' },
      collectionDate: { $gte: startUTC, $lte: endUTC },
      isActive: true
    }).populate('member', 'name memberCode phone branchCode');

    // Also check installmentType = extra with withdrawal note
    const result = withdrawals.map((inst, idx) => ({
      serial: idx + 1,
      memberId: inst.member?._id,
      memberName: inst.member?.name || 'Unknown',
      memberCode: inst.member?.memberCode || '',
      phone: inst.member?.phone || '',
      branchCode: inst.member?.branchCode || '',
      amount: inst.amount || 0,
      note: inst.note || '',
      collectionDate: inst.collectionDate
    }));

    // Sort by branch
    result.sort((a, b) => {
      if (a.branchCode < b.branchCode) return -1;
      if (a.branchCode > b.branchCode) return 1;
      return a.memberName.localeCompare(b.memberName);
    });
    result.forEach((r, i) => { r.serial = i + 1; });

    const totalOut = result.reduce((s, r) => s + r.amount, 0);

    res.status(200).json({
      success: true,
      data: {
        collector: { id: collector._id, name: collector.name },
        reportDate: targetDateStr,
        withdrawals: result,
        totalWithdrawal: totalOut,
        count: result.length
      }
    });

  } catch (error) {
    console.error('Todays savings out error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;