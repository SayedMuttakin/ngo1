const express = require('express');
const mongoose = require('mongoose');
const Member = require('../models/Member');
const Installment = require('../models/Installment');
const CollectionSchedule = require('../models/CollectionSchedule');
const User = require('../models/User');
const Branch = require('../models/Branch');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @desc    Get dashboard stats
// @route   GET /api/dashboard/stats
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    // Build filter based on user role
    const memberFilter = { isActive: true };
    // ✅ FIX: Include both 'collected' and 'partial' status for accurate collection totals
    const installmentFilter = { isActive: true, status: { $in: ['collected', 'partial'] } };

    if (req.user.role === 'collector') {
      memberFilter.assignedCollector = req.user.id;
      installmentFilter.collector = req.user.id;
    }

    // ✅ ADDED: Filter installments by active members only
    const activeMemberIds = await Member.find(memberFilter).distinct('_id');
    installmentFilter.member = { $in: activeMemberIds };

    // Get member statistics
    const memberStats = await Member.aggregate([
      { $match: memberFilter },
      {
        $group: {
          _id: null,
          totalMembers: { $sum: 1 },
          activeMembers: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          totalSavings: { $sum: '$totalSavings' },
          totalPaid: { $sum: '$totalPaid' },
          avgMonthlyInstallment: { $avg: '$monthlyInstallment' }
        }
      }
    ]);

    // Get today's collection
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCollection = await Installment.aggregate([
      {
        $match: {
          ...installmentFilter,
          collectionDate: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          // 💰 INSTALLMENT Collections ONLY (exclude savings collections)
          totalCollection: {
            $sum: {
              $cond: [
                {
                  $and: [
                    // Must not be savings collection (better exclusion)
                    { $not: { $regexMatch: { input: '$note', regex: 'Savings Collection', options: 'i' } } },
                    // Include regular installments only (simpler logic)
                    { $eq: ['$installmentType', 'regular'] }
                  ]
                },
                {
                  $cond: [
                    { $eq: ['$status', 'partial'] },
                    { $ifNull: ['$paidAmount', 0] },
                    '$amount'
                  ]
                },
                0
              ]
            }
          },
          // 💸 Track savings deductions separately
          savingsDeductions: {
            $sum: {
              $cond: [
                { $eq: ['$paymentMethod', 'savings_deduction'] },
                {
                  $cond: [
                    { $eq: ['$status', 'partial'] },
                    { $ifNull: ['$paidAmount', 0] },
                    '$amount'
                  ]
                },
                0
              ]
            }
          },
          // 💰 Track actual savings collections (Sav In)
          savingsCollections: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$installmentType', 'extra'] },
                    { $ne: ['$paymentMethod', 'savings_deduction'] },
                    { $regex: ['$note', 'Savings Collection', 'i'] }
                  ]
                },
                '$amount',
                0
              ]
            }
          },
          totalInstallments: { $sum: 1 },
          regularInstallments: {
            $sum: { $cond: [{ $eq: ['$installmentType', 'regular'] }, 1, 0] }
          },
          extraInstallments: {
            $sum: { $cond: [{ $eq: ['$installmentType', 'extra'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get this month's collection
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const monthlyCollection = await Installment.aggregate([
      {
        $match: {
          ...installmentFilter,
          collectionDate: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          // 💰 INSTALLMENT Collections ONLY (exclude savings collections)
          totalAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    // Must not be savings collection (better exclusion)
                    { $not: { $regexMatch: { input: '$note', regex: 'Savings Collection', options: 'i' } } },
                    // Include regular installments only (simpler logic)
                    { $eq: ['$installmentType', 'regular'] }
                  ]
                },
                {
                  $cond: [
                    { $eq: ['$status', 'partial'] },
                    { $ifNull: ['$paidAmount', 0] },
                    '$amount'
                  ]
                },
                0
              ]
            }
          },
          // 💸 Monthly savings deductions
          monthlySavingsDeductions: {
            $sum: {
              $cond: [
                { $eq: ['$paymentMethod', 'savings_deduction'] },
                {
                  $cond: [
                    { $eq: ['$status', 'partial'] },
                    { $ifNull: ['$paidAmount', 0] },
                    '$amount'
                  ]
                },
                0
              ]
            }
          },
          // 💰 Monthly actual savings collections
          monthlySavingsCollections: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$installmentType', 'extra'] },
                    { $ne: ['$paymentMethod', 'savings_deduction'] },
                    { $regex: ['$note', 'Savings Collection', 'i'] }
                  ]
                },
                '$amount',
                0
              ]
            }
          },
          totalInstallments: { $sum: 1 }
        }
      }
    ]);

    // Get collection schedule stats (for admin/manager)
    let scheduleStats = null;
    if (req.user.role !== 'collector') {
      scheduleStats = await CollectionSchedule.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalSchedules: { $sum: 1 },
            totalCollectors: { $addToSet: '$collector' },
            totalBranches: { $sum: { $size: '$branches' } }
          }
        },
        {
          $project: {
            totalSchedules: 1,
            totalCollectors: { $size: '$totalCollectors' },
            totalBranches: 1
          }
        }
      ]);
    }

    // Get recent installments
    const recentInstallments = await Installment.find(installmentFilter)
      .populate('member', 'name phone')
      .populate('collector', 'name')
      .sort({ collectionDate: -1 })
      .limit(5)
      .select('amount installmentType collectionDate receiptNumber');

    // Prepare response data
    const memberData = memberStats[0] || {
      totalMembers: 0,
      activeMembers: 0,
      totalSavings: 0,
      totalPaid: 0,
      avgMonthlyInstallment: 0
    };

    const todayData = todayCollection[0] || {
      totalCollection: 0,
      totalInstallments: 0,
      regularInstallments: 0,
      extraInstallments: 0
    };

    const monthlyData = monthlyCollection[0] || {
      totalAmount: 0,
      totalInstallments: 0,
      monthlySavingsDeductions: 0,
      monthlySavingsCollections: 0
    };

    const scheduleData = scheduleStats?.[0] || {
      totalSchedules: 0,
      totalCollectors: 0,
      totalBranches: 0
    };

    res.status(200).json({
      success: true,
      data: {
        // Member statistics
        totalMembers: memberData.totalMembers,
        activeMembers: memberData.activeMembers,
        inactiveMembers: memberData.totalMembers - memberData.activeMembers,
        totalSavings: memberData.totalSavings,
        totalPaid: memberData.totalPaid,
        avgMonthlyInstallment: Math.round(memberData.avgMonthlyInstallment || 0),

        // Today's collection
        todayCollection: todayData.totalCollection,
        todayInstallments: todayData.totalInstallments,
        todayRegularInstallments: todayData.regularInstallments,
        todayExtraInstallments: todayData.extraInstallments,

        // Monthly collection
        monthlyCollection: monthlyData.totalAmount,
        monthlyInstallments: monthlyData.totalInstallments,
        monthlySavingsDeductions: monthlyData.monthlySavingsDeductions,
        monthlySavingsCollections: monthlyData.monthlySavingsCollections,

        // Schedule statistics (admin/manager only)
        ...(req.user.role !== 'collector' && {
          totalSchedules: scheduleData.totalSchedules,
          totalCollectors: scheduleData.totalCollectors,
          totalBranches: scheduleData.totalBranches
        }),

        // Recent activity
        recentInstallments,

        // User info
        userRole: req.user.role,
        userName: req.user.name
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get collection trends (last 7 days)
// @route   GET /api/dashboard/trends
// @access  Private
router.get('/trends', protect, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    // Build filter based on user role
    // ✅ FIX: Include partial payments and filter by active members only
    const activeMemberIdsForTrend = await Member.find({ isActive: true }).distinct('_id');
    const filter = {
      isActive: true,
      status: { $in: ['collected', 'partial'] },
      member: { $in: activeMemberIdsForTrend }
    };
    if (req.user.role === 'collector') {
      filter.collector = req.user.id;
    }

    // Get date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const trends = await Installment.aggregate([
      {
        $match: {
          ...filter,
          collectionDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$collectionDate' },
            month: { $month: '$collectionDate' },
            day: { $dayOfMonth: '$collectionDate' }
          },
          totalAmount: { $sum: '$amount' },
          totalInstallments: { $sum: 1 },
          regularInstallments: {
            $sum: { $cond: [{ $eq: ['$installmentType', 'regular'] }, 1, 0] }
          },
          extraInstallments: {
            $sum: { $cond: [{ $eq: ['$installmentType', 'extra'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          totalAmount: 1,
          totalInstallments: 1,
          regularInstallments: 1,
          extraInstallments: 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: trends
    });

  } catch (error) {
    console.error('Dashboard trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching collection trends',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get daily collection performance with collectors data
// @route   GET /api/dashboard/daily-collection
// @access  Private
router.get('/daily-collection', protect, async (req, res) => {
  try {
    const { date, month } = req.query;

    // Calculate date range for Day or Month
    let startOfPeriod, endOfPeriod, displayPeriod;
    if (month) {
      // month is expected to be 'YYYY-MM'
      const [year, m] = month.split('-').map(Number);
      startOfPeriod = new Date(year, m - 1, 1, 0, 0, 0, 0);
      endOfPeriod = new Date(year, m, 0, 23, 59, 59, 999);
      displayPeriod = month;
    } else {
      let targetDate;
      if (date) {
        targetDate = new Date(date);
      } else {
        targetDate = new Date();
      }
      startOfPeriod = new Date(targetDate);
      startOfPeriod.setHours(0, 0, 0, 0);
      endOfPeriod = new Date(targetDate);
      endOfPeriod.setHours(23, 59, 59, 999);
      displayPeriod = startOfPeriod.toISOString().split('T')[0];
    }

    // Get all active collectors
    const activeCollectors = await User.find({
      role: 'collector',
      isActive: true
    }).select('_id name email phone branch branchCode');

    // Get collection data for each collector within the period
    const collectorsPerformance = await Promise.all(
      activeCollectors.map(async (collector) => {
        const allUpdatedInPeriod = await Installment.find({
          collector: collector._id,
          status: { $in: ['collected', 'partial'] },
          $or: [
            { 'paymentHistory.date': { $gte: startOfPeriod, $lte: endOfPeriod } },
            { updatedAt: { $gte: startOfPeriod, $lte: endOfPeriod } },
            { collectionDate: { $gte: startOfPeriod, $lte: endOfPeriod } }
          ],
          $and: [
            {
              $or: [
                { note: { $not: { $regex: '(Initial Savings|Savings Collection|Savings Withdrawal)', $options: 'i' } } },
                { note: null },
                { note: '' }
              ]
            },
            {
              $or: [
                { note: { $not: { $regex: 'Product Sale:', $options: 'i' } } },
                { note: null },
                { note: '' }
              ]
            }
          ],
          isActive: true
        }).populate('member', 'name phone branch branchCode monthlyInstallment');

        // Filter to only installments with payments within the period
        const periodInstallments = allUpdatedInPeriod.filter(inst => {
          if (inst.isAutoApplied && (!inst.paymentHistory || inst.paymentHistory.length === 0)) {
            return false;
          }

          if (inst.paymentHistory && inst.paymentHistory.length > 0) {
            return inst.paymentHistory.some(payment => {
              if (!payment.date) return false;
              const paymentDate = new Date(payment.date);
              return paymentDate >= startOfPeriod && paymentDate <= endOfPeriod;
            });
          }

          return inst.collectionDate && inst.collectionDate >= startOfPeriod && inst.collectionDate <= endOfPeriod;
        });

        // Calculate total collection by summing all payments from paymentHistory made in the period
        let totalCollection = 0;
        periodInstallments.forEach(inst => {
          if (inst.paymentHistory && inst.paymentHistory.length > 0) {
            const periodPayments = inst.paymentHistory.filter(payment => {
              if (!payment.date) return false;
              const paymentDate = new Date(payment.date);
              return paymentDate >= startOfPeriod && paymentDate <= endOfPeriod;
            });

            const periodTotal = periodPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
            if (periodTotal > 0) {
              totalCollection += periodTotal;
            }
          } else {
            const amount = (inst.lastPaymentAmount != null && inst.lastPaymentAmount > 0)
              ? inst.lastPaymentAmount
              : (inst.paidAmount != null && inst.paidAmount > 0)
                ? inst.paidAmount
                : inst.amount;
            totalCollection += amount;
          }
        });

        // Get unique members who paid in the period
        const uniqueMembers = [...new Set(periodInstallments.map(inst => inst.member?._id ? inst.member._id.toString() : null).filter(Boolean))];

        // Get collector's assigned branches
        const Branch = require('../models/Branch');
        const assignedBranches = await Branch.find({
          assignedCollector: collector._id,
          isActive: true
        }).select('name branchCode');

        const branchDetails = assignedBranches.map(branch => ({
          name: branch.name,
          code: branch.branchCode
        }));

        let totalMembersInBranches = 0;
        for (const branch of assignedBranches) {
          const memberCount = await Member.countDocuments({
            branchCode: branch.branchCode,
            isActive: true
          });
          totalMembersInBranches += memberCount;
        }

        const lastInstallment = periodInstallments.sort((a, b) => new Date(b.collectionDate) - new Date(a.collectionDate))[0];
        const lastUpdated = lastInstallment ? lastInstallment.collectionDate : null;

        return {
          id: collector._id,
          name: collector.name,
          email: collector.email,
          phone: collector.phone,
          branch: collector.branch,
          branchCode: collector.branchCode,
          totalCollection,
          totalMembers: totalMembersInBranches,
          branches: branchDetails,
          branchCount: branchDetails.length,
          lastUpdated,
          installments: periodInstallments.length,
          regularInstallments: periodInstallments.filter(inst => inst.installmentType === 'regular').length,
          extraInstallments: periodInstallments.filter(inst => inst.installmentType === 'extra').length,
          status: 'Active'
        };
      })
    );

    const totalCollection = collectorsPerformance.reduce((sum, collector) => sum + collector.totalCollection, 0);
    const totalMembers = collectorsPerformance.reduce((sum, collector) => sum + collector.totalMembers, 0);
    const totalInstallments = collectorsPerformance.reduce((sum, collector) => sum + collector.installments, 0);

    const collectorsWithPercentage = collectorsPerformance.map(collector => ({
      ...collector,
      collectionPercentage: totalCollection > 0 ? ((collector.totalCollection / totalCollection) * 100).toFixed(1) : 0
    }));

    collectorsWithPercentage.sort((a, b) => b.totalCollection - a.totalCollection);

    const targetCollection = 5000;

    res.status(200).json({
      success: true,
      data: {
        date: displayPeriod,
        filterType: month ? 'monthly' : 'daily',
        summary: {
          totalCollection,
          totalMembers,
          totalInstallments,
          targetCollection,
          collectionPercentage: targetCollection > 0 ? Math.round((totalCollection / targetCollection) * 100) : 0,
          activeCollectors: collectorsWithPercentage.length
        },
        collectors: collectorsWithPercentage,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Daily collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching daily collection data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get real-time collectors performance summary
// @route   GET /api/dashboard/collectors-performance
// @access  Private
router.get('/collectors-performance', protect, async (req, res) => {
  try {
    const { date, collectorId } = req.query;

    // Parse date or use today
    let targetDate;
    if (date) {
      targetDate = new Date(date);
    } else {
      targetDate = new Date();
    }

    // Set date range for the day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Build collector filter
    const collectorFilter = {
      role: 'collector',
      isActive: true
    };

    if (collectorId) {
      collectorFilter._id = mongoose.Types.ObjectId(collectorId);
    }

    // Get collectors performance using aggregation
    const performanceData = await User.aggregate([
      { $match: collectorFilter },
      {
        $lookup: {
          from: 'installments',
          let: { collectorId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$collector', '$$collectorId'] },
                collectionDate: { $gte: startOfDay, $lte: endOfDay },
                status: { $in: ['collected', 'partial'] },
                isActive: true
              }
            }
          ],
          as: 'dailyInstallments'
        }
      },
      {
        $lookup: {
          from: 'members',
          let: { collectorId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$assignedCollector', '$collectorId'] },
                isActive: true
              }
            }
          ],
          as: 'assignedMembers'
        }
      },
      {
        $addFields: {
          totalCollection: { $sum: '$dailyInstallments.amount' },
          totalInstallments: { $size: '$dailyInstallments' },
          regularInstallments: {
            $size: {
              $filter: {
                input: '$dailyInstallments',
                cond: { $eq: ['$this.installmentType', 'regular'] }
              }
            }
          },
          extraInstallments: {
            $size: {
              $filter: {
                input: '$dailyInstallments',
                cond: { $eq: ['$this.installmentType', 'extra'] }
              }
            }
          },
          uniqueMembers: {
            $size: {
              $setUnion: ['$dailyInstallments.member', []]
            }
          },
          branches: {
            $setUnion: ['$assignedMembers.branch', []]
          },
          branchCodes: {
            $setUnion: ['$assignedMembers.branchCode', []]
          },
          lastInstallmentDate: { $max: '$dailyInstallments.collectionDate' }
        }
      },
      {
        $project: {
          name: 1,
          email: 1,
          phone: 1,
          branch: 1,
          branchCode: 1,
          totalCollection: 1,
          totalInstallments: 1,
          regularInstallments: 1,
          extraInstallments: 1,
          totalMembers: '$uniqueMembers',
          branches: 1,
          branchCount: { $size: '$branches' },
          lastUpdated: '$lastInstallmentDate',
          status: 'Active'
        }
      },
      { $sort: { totalCollection: -1 } }
    ]);

    // Calculate total collection for percentage calculation
    const totalCollection = performanceData.reduce((sum, collector) => sum + collector.totalCollection, 0);

    // Add collection percentage to each collector
    const collectorsWithPercentage = performanceData.map(collector => ({
      ...collector,
      collectionPercentage: totalCollection > 0 ?
        parseFloat(((collector.totalCollection / totalCollection) * 100).toFixed(1)) : 0,
      lastUpdated: collector.lastUpdated ?
        new Date(collector.lastUpdated).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }) : null
    }));

    res.status(200).json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        totalCollection,
        activeCollectors: collectorsWithPercentage.length,
        collectors: collectorsWithPercentage,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Collectors performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching collectors performance',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get collector dashboard data
// @route   GET /api/dashboard/collector/:collectorId
// @access  Private
router.get('/collector/:collectorId', protect, async (req, res) => {
  try {
    const { collectorId } = req.params;
    const { date } = req.query;

    console.log('📊 Getting dashboard for collector:', collectorId, 'Date:', date);

    // Parse date or use today
    let targetDate;
    if (date) {
      targetDate = new Date(date);
    } else {
      targetDate = new Date();
    }

    // Set date range for today
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get collector info
    const collector = await User.findById(collectorId).select('-password');
    if (!collector || collector.role !== 'collector') {
      return res.status(404).json({
        success: false,
        message: 'Collector not found'
      });
    }

    // Get collector's branches
    const branches = await Branch.find({
      assignedCollector: collectorId,
      isActive: true
    });
    const branchCodes = branches.map(b => b.branchCode);

    // 1. ✅ NEW APPROACH: Calculate Today's Collection from Net Balance difference
    console.log('📊 Calculating Today\'s Collection from Net Balance...');

    // 2. আজকের Savings Collection
    const todaySavings = await Installment.aggregate([
      {
        $match: {
          collector: new mongoose.Types.ObjectId(collectorId),
          collectionDate: { $gte: startOfDay, $lte: endOfDay },
          status: { $in: ['collected', 'partial'] },
          $or: [
            { installmentType: 'savings' },
            { note: { $regex: 'Savings', $options: 'i' } },
            { note: { $regex: 'সঞ্চয়', $options: 'i' } }
          ]
        }
      },
      {
        $lookup: {
          from: 'members',
          localField: 'member',
          foreignField: '_id',
          as: 'memberInfo'
        }
      },
      {
        $match: {
          'memberInfo.isActive': true
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'partial'] },
                { $ifNull: ['$paidAmount', 0] },
                '$amount'
              ]
            }
          }
        }
      }
    ]);

    // 3. Due Balance (আজ + Overdue)
    const dueBalance = await Installment.aggregate([
      {
        $match: {
          collector: new mongoose.Types.ObjectId(collectorId),
          status: { $in: ['pending', 'partial'] },
          dueDate: { $lte: endOfDay }, // আজ পর্যন্ত যা due
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'members',
          localField: 'member',
          foreignField: '_id',
          as: 'memberInfo'
        }
      },
      {
        $match: {
          'memberInfo.isActive': true
        }
      },
      {
        $group: {
          _id: null,
          totalDue: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'partial'] },
                { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] },
                '$amount'
              ]
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // 4. Net Balance (Total Outstanding - সব member এর কাছে বাকি)
    // Product Sales থেকে Collection বাদ দিলে যা থাকে
    const productSales = await Installment.aggregate([
      {
        $match: {
          collector: new mongoose.Types.ObjectId(collectorId),
          note: { $regex: 'Product Sale', $options: 'i' },
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'members',
          localField: 'member',
          foreignField: '_id',
          as: 'memberInfo'
        }
      },
      {
        $match: {
          'memberInfo.isActive': true
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$amount' }
        }
      }
    ]);

    const totalCollections = await Installment.aggregate([
      {
        $match: {
          collector: new mongoose.Types.ObjectId(collectorId),
          status: { $in: ['collected', 'partial'] },
          $and: [
            {
              $or: [
                { note: { $not: { $regex: 'Product Sale', $options: 'i' } } },
                { note: null },
                { note: '' }
              ]
            },
            {
              $or: [
                { note: { $not: { $regex: 'Savings', $options: 'i' } } },
                { note: null },
                { note: '' }
              ]
            }
          ],
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'members',
          localField: 'member',
          foreignField: '_id',
          as: 'memberInfo'
        }
      },
      {
        $match: {
          'memberInfo.isActive': true
        }
      },
      {
        $group: {
          _id: null,
          totalCollected: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'partial'] },
                { $ifNull: ['$paidAmount', 0] },
                '$amount'
              ]
            }
          }
        }
      }
    ]);

    const totalProductSales = productSales[0]?.totalSales || 0;
    const totalCollected = totalCollections[0]?.totalCollected || 0;
    const netBalance = totalProductSales - totalCollected;

    // ✅ SIMPLE FIX: Calculate Today's Collection from Net Balance difference
    // Get yesterday's Net Balance to compare
    const yesterday = new Date(targetDate);
    yesterday.setDate(targetDate.getDate() - 1);
    const startOfYesterday = new Date(yesterday);
    startOfYesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    // Calculate collections up to yesterday (not including today)
    const collectionsUpToYesterday = await Installment.aggregate([
      {
        $match: {
          collector: new mongoose.Types.ObjectId(collectorId),
          status: { $in: ['collected', 'partial'] },
          collectionDate: { $lte: endOfYesterday }, // Up to yesterday
          $and: [
            {
              $or: [
                { note: { $not: { $regex: 'Product Sale', $options: 'i' } } },
                { note: null },
                { note: '' }
              ]
            },
            {
              $or: [
                { note: { $not: { $regex: 'Savings', $options: 'i' } } },
                { note: null },
                { note: '' }
              ]
            }
          ],
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'members',
          localField: 'member',
          foreignField: '_id',
          as: 'memberInfo'
        }
      },
      {
        $match: {
          'memberInfo.isActive': true
        }
      },
      {
        $group: {
          _id: null,
          totalCollected: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'partial'] },
                { $ifNull: ['$paidAmount', 0] },
                '$amount'
              ]
            }
          }
        }
      }
    ]);

    const yesterdayCollected = collectionsUpToYesterday[0]?.totalCollected || 0;
    const yesterdayNetBalance = totalProductSales - yesterdayCollected;
    const todayNetBalance = netBalance;

    // Today's Collection = Yesterday's Net Balance - Today's Net Balance
    const todayCollectionFromBalance = Math.max(0, yesterdayNetBalance - todayNetBalance);

    console.log(`📊 Net Balance Calculation:`);
    console.log(`   Total Product Sales: ৳${totalProductSales}`);
    console.log(`   Yesterday's Collections: ৳${yesterdayCollected}`);
    console.log(`   Yesterday's Net Balance: ৳${yesterdayNetBalance}`);
    console.log(`   Today's Collections (total): ৳${totalCollected}`);
    console.log(`   Today's Net Balance: ৳${todayNetBalance}`);
    console.log(`   Today's Collection (from balance): ৳${todayCollectionFromBalance}`);

    // Prepare response
    const responseData = {
      todayCollection: todayCollectionFromBalance, // ✅ Use balance-based calculation
      todaySavings: todaySavings[0]?.total || 0,
      dueBalance: dueBalance[0]?.totalDue || 0,
      netBalance: netBalance > 0 ? netBalance : 0,
      totalOutstanding: netBalance > 0 ? netBalance : 0, // ✅ FIXED: Use netBalance instead of dueBalance
      branches: branches.map(b => ({
        id: b._id,
        name: b.name,
        branchCode: b.branchCode,
        memberCount: b.memberCount || 0
      })),
      collector: {
        id: collector._id,
        name: collector.name,
        email: collector.email,
        phone: collector.phone
      },
      date: targetDate.toISOString().split('T')[0]
    };

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Collector dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching collector dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get comprehensive dashboard overview with all metrics
// @route   GET /api/dashboard/overview
// @access  Private
router.get('/overview', protect, async (req, res) => {
  try {
    // ✅ NEW: Get month and year from query params (default to current month)
    const { month, year } = req.query;
    const now = new Date();
    const selectedMonth = month ? parseInt(month) - 1 : now.getMonth(); // JS months are 0-indexed
    const selectedYear = year ? parseInt(year) : now.getFullYear();

    // Calculate start and end of selected month in UTC (database stores UTC)
    // Bangladesh time = UTC + 6 hours
    // So Nov 1, 2025 00:00 BD = Oct 31, 2025 18:00 UTC
    const monthStart = new Date(Date.UTC(selectedYear, selectedMonth, 1, 0, 0, 0, 0));
    monthStart.setHours(monthStart.getHours() - 6); // Adjust for BD timezone

    const monthEnd = new Date(Date.UTC(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999));
    monthEnd.setHours(monthEnd.getHours() - 6); // Adjust for BD timezone

    console.log(`📅 Dashboard data for: ${selectedMonth + 1}/${selectedYear}`);
    console.log(`📅 Date range: ${monthStart.toISOString()} to ${monthEnd.toISOString()}`);

    // Build filter based on user role
    const memberFilter = { isActive: true };
    const installmentFilter = { isActive: true };

    if (req.user.role === 'collector') {
      // Get collector's branches
      const collectorBranches = await Branch.find({ assignedCollector: req.user.id });
      const branchCodes = collectorBranches.map(b => b.branchCode);
      memberFilter.branchCode = { $in: branchCodes };
    }

    // ✅ ADDED: Filter installments by active members only to ensure consistency in dashboard boxes
    const activeMemberIds = await Member.find(memberFilter).distinct('_id');
    installmentFilter.member = { $in: activeMemberIds };

    // 1. Get total members count
    const totalMembers = await Member.countDocuments(memberFilter);

    // 2. Get total savings & monthly collection from CollectionHistory (single source of truth)
    const CollectionHistory = require('../models/CollectionHistory');

    const monthlyHistoryFilter = {
      isActive: true,
      collectionDate: { $gte: monthStart, $lte: monthEnd }
    };
    if (req.user.role === 'collector') {
      monthlyHistoryFilter.collector = req.user.id;
    } else {
      monthlyHistoryFilter.member = { $in: activeMemberIds };
    }

    const monthlyHistory = await CollectionHistory.find(monthlyHistoryFilter).lean();

    let savingsDeposits = 0;
    let savingsWithdrawals = 0;
    let monthlyTotalCollection = 0;

    monthlyHistory.forEach(h => {
      const noteLower = (h.note || '').toLowerCase();

      // Check if it's savings withdrawal
      if (noteLower.includes('savings withdrawal') || noteLower.includes('withdrawal') || h.paymentMethod === 'savings_withdrawal') {
        savingsWithdrawals += (h.collectionAmount || 0);
      } else if (noteLower.includes('initial savings') || noteLower.includes('savings collection') || noteLower.includes('savings')) {
        savingsDeposits += (h.collectionAmount || 0);
      } else {
        // Exclude product sale disbursements (when loan is given out)
        if (noteLower.includes('product sale:') && noteLower.includes('saleid:')) {
          return;
        }
        // Count ONLY loan installments (corrections are negative, so they subtract)
        monthlyTotalCollection += (h.collectionAmount || 0);
      }
    });

    const totalSavingsCollected = savingsDeposits - savingsWithdrawals;

    console.log(`💰 Savings Breakdown (${selectedMonth + 1}/${selectedYear}) using CollectionHistory:`);
    console.log(`   - Savings Deposits: ৳${savingsDeposits}`);
    console.log(`   - Savings Withdrawals: ৳${savingsWithdrawals}`);
    console.log(`   - Net Savings: ৳${totalSavingsCollected}`);

    // 3. Get today's total LOAN collection and today's SAVINGS collection
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayHistoryFilter = {
      isActive: true,
      collectionDate: { $gte: today, $lt: tomorrow }
    };
    if (req.user.role === 'collector') {
      todayHistoryFilter.collector = req.user.id;
    } else {
      todayHistoryFilter.member = { $in: activeMemberIds };
    }

    const todayHistory = await CollectionHistory.find(todayHistoryFilter).lean();

    let todayCollection = 0;
    let todaySavings = 0;

    todayHistory.forEach(h => {
      const noteLower = (h.note || '').toLowerCase();

      if (noteLower.includes('savings withdrawal') || noteLower.includes('withdrawal') || h.paymentMethod === 'savings_withdrawal') {
        // Skip savings withdrawal for today collections (shown as savings out)
        return;
      } else if (noteLower.includes('initial savings') || noteLower.includes('savings collection') || noteLower.includes('savings')) {
        todaySavings += (h.collectionAmount || 0);
      } else {
        // Skip product sale disbursements
        if (noteLower.includes('product sale:') && noteLower.includes('saleid:')) {
          return;
        }
        // Count only loan installments (corrections are negative, so they subtract)
        todayCollection += (h.collectionAmount || 0);
      }
    });

    console.log(`📊 Today's Loan Collection: ৳${todayCollection}, Today's Savings: ৳${todaySavings}`);
    console.log(`📊 Monthly Loan Collection (EXCLUDING SAVINGS): ৳${monthlyTotalCollection}`);

    // 3c. Calculate Total Outstanding Loans (Net Balance)
    // ✅ NEW APPROACH: Sum of all collectors' Net Balance
    // Net Balance = Sum of all pending/partial installments for each collector

    console.log('\n📊 ========== CALCULATING TOTAL OUTSTANDING LOANS ==========');

    // Get all active collectors
    const activeCollectors = await User.find({
      role: 'collector',
      isActive: true
    }).select('_id name');

    console.log(`👥 Active Collectors: ${activeCollectors.length}`);

    let totalOutstandingLoans = 0;

    // Calculate Net Balance for each collector
    for (const collector of activeCollectors) {
      // Get all pending/partial installments for this collector
      const collectorPendingInstallments = await Installment.find({
        collector: collector._id,
        status: { $in: ['pending', 'partial'] },
        isActive: true,
        member: { $in: activeMemberIds } // ✅ Filter by active members
      });

      let collectorNetBalance = 0;
      collectorPendingInstallments.forEach(inst => {
        if (inst.status === 'partial') {
          collectorNetBalance += (inst.amount - (inst.paidAmount || 0));
        } else {
          collectorNetBalance += inst.amount;
        }
      });

      console.log(`   ${collector.name}: Net Balance = ৳${collectorNetBalance}`);
      totalOutstandingLoans += collectorNetBalance;
    }

    console.log(`\n💼 Total Outstanding Loans (Sum of all Net Balances): ৳${totalOutstandingLoans}`);
    console.log(`========================================\n`);

    // 3d. Calculate Total Savings (All Time)
    // ✅ FIX: Use Member.totalSavings which already includes all deposits and withdrawals
    // This avoids double-counting since Member.totalSavings is updated when installments are collected
    const allTimeSavingsAgg = await Member.aggregate([
      {
        $match: memberFilter
      },
      {
        $group: {
          _id: null,
          totalMemberSavings: { $sum: '$totalSavings' }
        }
      }
    ]);

    const totalAllTimeSavings = allTimeSavingsAgg[0]?.totalMemberSavings || 0;

    console.log(`💰 Total Savings (All Time): ৳${totalAllTimeSavings}`);
    console.log(`   - Calculated from Member.totalSavings (includes all deposits and withdrawals)`);

    // 4. Get total product distributions FOR THE SELECTED MONTH
    // Each product sale creates multiple installments, so we count unique SaleIDs
    const productSalesAgg = await Installment.aggregate([
      {
        $match: {
          ...installmentFilter,
          createdAt: { $gte: monthStart, $lte: monthEnd }, // ✅ Filter by selected month
          note: { $regex: 'SaleID:', $options: 'i' }
        }
      },
      {
        $project: {
          saleId: {
            $regexFind: {
              input: '$note',
              regex: 'SaleID: ([A-Z0-9-]+)',
              options: 'i'
            }
          }
        }
      },
      {
        $group: {
          _id: '$saleId.match',
          count: { $sum: 1 }
        }
      },
      {
        $count: 'totalProductSales'
      }
    ]);
    const productDistributions = productSalesAgg[0]?.totalProductSales || 0;

    // 5. Get pending installments count (no details needed)
    const pendingInstallments = await Installment.countDocuments({
      ...installmentFilter,
      status: 'pending',
      dueDate: { $lte: new Date() }
    });

    // ✅ SKIP detailed pending list - causes slow populate queries
    // Frontend doesn't show this on main dashboard anyway
    const pendingInstallmentsList = [];

    // 6. ✅ OPTIMIZED: Get monthly collection trend with simplified aggregation
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrend = await Installment.aggregate([
      {
        $match: {
          ...installmentFilter,
          status: { $in: ['collected', 'partial'] },
          collectionDate: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$collectionDate' },
            month: { $month: '$collectionDate' }
          },
          collection: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'partial'] },
                { $ifNull: ['$paidAmount', 0] },
                '$amount'
              ]
            }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]).exec(); // Use .exec() instead of .maxTimeMS()

    // 8. Get product distribution breakdown
    let productBreakdown = [];
    try {
      productBreakdown = await Installment.aggregate([
        {
          $match: {
            ...installmentFilter,
            note: { $regex: 'Product Sale:', $options: 'i' }
          }
        },
        {
          $project: {
            productName: {
              $regexFind: {
                input: '$note',
                regex: 'Product Sale: ([^(]+)'
              }
            },
            amount: 1
          }
        },
        {
          $group: {
            _id: '$productName.match',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 4
        }
      ]).exec();
    } catch (err) {
      console.warn('Product breakdown query failed:', err.message);
      productBreakdown = [];
    }

    // ✅ SKIP: Removed slow populate query for recent activities
    // Get from cache or simplified version instead
    const recentActivities = []; // Empty for now - speeds up dashboard significantly

    res.status(200).json({
      success: true,
      data: {
        // ✅ Add month info
        monthInfo: {
          month: selectedMonth + 1, // Convert back to 1-indexed
          year: selectedYear,
          monthName: monthStart.toLocaleString('default', { month: 'long' }),
          dateRange: {
            start: monthStart.toISOString(),
            end: monthEnd.toISOString()
          }
        },
        stats: {
          totalMembers,
          totalSavings: totalSavingsCollected,
          totalCollection: monthlyTotalCollection,
          todayCollection,
          todaySavings,
          productsDistributed: productDistributions,
          pendingInstallments,
          totalOutstandingLoans,
          totalAllTimeSavings
        },
        pendingInstallmentsList: pendingInstallmentsList.map(inst => ({
          id: inst._id,
          memberName: inst.member?.name || 'Unknown',
          memberPhone: inst.member?.phone || '',
          branchCode: inst.member?.branchCode || '',
          collectorName: inst.collector?.name || 'Unassigned',
          amount: inst.amount,
          dueDate: inst.dueDate,
          note: inst.note
        })),
        monthlyTrend: monthlyTrend.map(item => ({
          month: `${item._id.month}/${item._id.year}`,
          collection: item.collection
        })) || [],
        productBreakdown: productBreakdown.slice(0, 4).map((item, index) => {
          const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];
          return {
            name: 'Product',
            value: item.count,
            color: colors[index] || '#6B7280'
          };
        }) || [],
        recentActivities: []
      }
    });

  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard overview',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get daily savings collection data
// @route   GET /api/dashboard/daily-savings
// @access  Private
router.get('/daily-savings', protect, async (req, res) => {
  try {
    const { date } = req.query;

    // Parse date or use today
    let targetDate;
    if (date) {
      targetDate = new Date(date);
    } else {
      targetDate = new Date();
    }

    // Set date range for the day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    console.log('💰 Fetching daily savings for date:', targetDate.toISOString().split('T')[0]);

    // Get all active collectors
    const activeCollectors = await User.find({
      role: 'collector',
      isActive: true
    }).select('_id name email phone branch branchCode');

    console.log('👥 Found', activeCollectors.length, 'active collectors');

    // ✅ ADDED: Get active member IDs
    const activeMemberIds = await Member.find({ isActive: true }).distinct('_id');

    // Get daily savings data for each collector
    const collectorsPerformance = await Promise.all(
      activeCollectors.map(async (collector) => {
        // Get collector's savings installments for the day
        // ✅ ONLY include savings collections (Savings Collection in note)
        const dailySavingsInstallments = await Installment.find({
          collector: collector._id,
          collectionDate: { $gte: startOfDay, $lte: endOfDay },
          status: { $in: ['collected', 'partial'] },
          isActive: true,
          member: { $in: activeMemberIds }, // ✅ Filter by active members
          $or: [
            // Savings collections with note
            { note: { $regex: 'Savings Collection', $options: 'i' } },
            // Or installmentType is savings
            { installmentType: 'savings' },
            // Or note contains savings/সঞ্চয়
            { note: { $regex: 'savings|সঞ্চয়', $options: 'i' } }
          ]
        }).populate('member', 'name phone branch branchCode totalSavings');

        // Calculate total savings collection
        // ✅ Handle withdrawals (subtract) and deposits (add)
        let totalSavings = 0;
        dailySavingsInstallments.forEach(installment => {
          const amount = installment.status === 'partial'
            ? (installment.paidAmount || 0)
            : (installment.amount || 0);

          const note = installment.note || '';
          const noteLower = note.toLowerCase();

          // Check if it's a withdrawal (subtract from savings)
          if (noteLower.includes('withdrawal') || noteLower.includes('উত্তোলন')) {
            totalSavings -= amount;
          } else {
            // It's a deposit (add to savings)
            totalSavings += amount;
          }
        });

        // Get unique members who saved today
        const uniqueMembers = [...new Set(dailySavingsInstallments.map(inst => inst.member._id.toString()))];
        const totalMembers = uniqueMembers.length;

        // Get collector's assigned branches from Branch model
        const assignedBranches = await Branch.find({
          assignedCollector: collector._id,
          isActive: true
        }).select('name branchCode');

        // Get branch details
        const branchDetails = assignedBranches.map(branch => ({
          name: branch.name,
          code: branch.branchCode
        }));

        // Count total members in these branches
        let totalMembersInBranches = 0;
        for (const branch of assignedBranches) {
          const memberCount = await Member.countDocuments({
            branchCode: branch.branchCode,
            isActive: true
          });
          totalMembersInBranches += memberCount;
        }

        // Get last update time (latest installment)
        const lastInstallment = dailySavingsInstallments.sort((a, b) => new Date(b.collectionDate) - new Date(a.collectionDate))[0];
        const lastUpdated = lastInstallment ? lastInstallment.collectionDate : null;

        return {
          id: collector._id,
          name: collector.name,
          email: collector.email,
          phone: collector.phone,
          branch: collector.branch,
          branchCode: collector.branchCode,
          totalSavings,
          totalMembers: totalMembersInBranches,
          membersSavedToday: totalMembers,
          branches: branchDetails,
          branchCount: branchDetails.length,
          lastUpdated,
          savingsTransactions: dailySavingsInstallments.length,
          status: 'Active'
        };
      })
    );

    // Calculate overall totals
    const totalSavings = collectorsPerformance.reduce((sum, collector) => sum + collector.totalSavings, 0);
    const totalMembers = collectorsPerformance.reduce((sum, collector) => sum + collector.totalMembers, 0);
    const totalTransactions = collectorsPerformance.reduce((sum, collector) => sum + collector.savingsTransactions, 0);

    // Add percentage to each collector
    const collectorsWithPercentage = collectorsPerformance.map(collector => ({
      ...collector,
      savingsPercentage: totalSavings > 0 ? ((collector.totalSavings / totalSavings) * 100).toFixed(1) : 0
    }));

    // Sort collectors by savings amount (highest first)
    collectorsWithPercentage.sort((a, b) => b.totalSavings - a.totalSavings);

    console.log('✅ Total savings collected:', totalSavings);
    console.log('✅ Total transactions:', totalTransactions);

    res.status(200).json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        summary: {
          totalSavings,
          totalMembers,
          totalTransactions,
          activeCollectors: collectorsWithPercentage.length,
          collectorsWithSavings: collectorsWithPercentage.filter(c => c.totalSavings > 0).length
        },
        collectors: collectorsWithPercentage,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Daily savings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching daily savings data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Helper function to calculate time ago
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';

  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';

  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';

  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';

  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';

  return Math.floor(seconds) + ' seconds ago';
}

module.exports = router;
