const express = require('express');
const path = require('path');
const Member = require('../models/Member');
const { protect, authorize } = require('../middleware/auth');
const { uploadProfileImage, compressImage, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// Test endpoint for simple member creation
router.post('/test', protect, async (req, res) => {
  try {
    console.log('Test member creation - Request body:', req.body);

    const testMember = await Member.create({
      name: 'Test Member',
      memberCode: '999',
      phone: '01700000000',
      branch: 'Test Branch',
      branchCode: '9999',
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Test member created successfully',
      data: testMember
    });
  } catch (error) {
    console.error('Test member creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Test member creation failed',
      error: error.message
    });
  }
});

// @desc    Get all members
// @route   GET /api/members
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      branch,
      branchCode,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeDeleted
    } = req.query;

    // Build filter object
    // If includeDeleted is true, don't filter by isActive (show all)
    const filter = {};
    if (includeDeleted !== 'true') {
      filter.isActive = true;
    }

    if (status) filter.status = status;
    if (branch) filter.branch = new RegExp(branch, 'i');
    if (branchCode) filter.branchCode = branchCode;

    // Search functionality
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { nidNumber: new RegExp(search, 'i') }
      ];
    }

    // Role-based filtering
    if (req.user.role === 'collector') {
      filter.assignedCollector = req.user.id;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Execute query
    const members = await Member.find(filter)
      .populate('assignedCollector', 'name email')
      .populate('createdBy', 'name')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Member.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: members,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching members',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get single member
// @route   GET /api/members/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const member = await Member.findById(req.params.id)
      .populate('assignedCollector', 'name email phone')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!member || !member.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Role-based access control
    if (req.user.role === 'collector' &&
      member.assignedCollector &&
      member.assignedCollector._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view members assigned to you.'
      });
    }

    res.status(200).json({
      success: true,
      data: member
    });

  } catch (error) {
    console.error('Get member error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid member ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching member',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Create new member
// @route   POST /api/members
// @access  Private (Admin/Manager/Collector)
router.post('/', protect, uploadProfileImage, compressImage, handleUploadError, async (req, res) => {
  try {
    console.log('📥 Received member creation request');
    console.log('Request body:', req.body);
    console.log('totalSavings from body:', req.body.totalSavings, 'Type:', typeof req.body.totalSavings);

    const {
      name,
      memberCode,
      sponsorName,
      age,
      phone,
      joinDate,
      nidNumber,
      branch,
      branchCode,
      status,
      totalSavings,
      monthlyInstallment,
      address,
      emergencyContact,
      assignedCollector,
      profileImage
    } = req.body;

    // Removed duplicate validation - allow all duplicates

    // Handle profile image
    let profileImagePath = null;
    if (req.file) {
      profileImagePath = `/uploads/members/${req.file.filename}`;
    }

    // Parse totalSavings properly - handle string, number, null, undefined
    let parsedSavings = 0;
    if (totalSavings !== undefined && totalSavings !== null && totalSavings !== '') {
      const savingsNum = parseFloat(totalSavings);
      if (!isNaN(savingsNum)) {
        parsedSavings = savingsNum;
      }
    }

    // 🔍 NEW: Check for existing members with the same code (including inactive ones)
    // If an inactive member has this code, we need to "free it up" by renaming the old one
    if (memberCode) {
      const existingMember = await Member.findOne({ memberCode: memberCode });

      if (existingMember) {
        if (!existingMember.isActive) {
          // Member exists but is inactive (deleted) - modify the old code to free it up
          const oldCode = existingMember.memberCode;
          const newCode = `${oldCode}-deleted-${Date.now()}`;

          // Use updateOne to bypass schema validation (regex)
          await Member.updateOne(
            { _id: existingMember._id },
            { $set: { memberCode: newCode } }
          );

          console.log(`♻️ Freed up member code ${oldCode} by renaming inactive member to ${newCode}`);
        } else {
          // Member exists and is active - this will be caught by the duplicate key error later,
          // or we can return an error here directly
          return res.status(400).json({
            success: false,
            message: `Member code "${memberCode}" already exists and is active`,
            field: 'memberCode',
            friendlyField: 'Member Code',
            value: memberCode,
            type: 'duplicate'
          });
        }
      }
    }

    // Create member data with safe defaults
    const memberData = {
      name: name || '',
      memberCode: memberCode || '',
      sponsorName: sponsorName || '',
      phone: phone || '',
      joinDate: joinDate || Date.now(),
      nidNumber: nidNumber || '',
      branch: branch || '',
      branchCode: branchCode || '',
      status: status || 'Active',
      totalSavings: parsedSavings,
      monthlyInstallment: monthlyInstallment ? parseFloat(monthlyInstallment) : 0,
      address: address || '',
      emergencyContact: emergencyContact || {},
      profileImage: profileImagePath,
      createdBy: req.user.id
    };

    // Only add age if it's provided and valid
    if (age && !isNaN(parseInt(age))) {
      memberData.age = parseInt(age);
    }

    // Set assigned collector
    if (req.user.role === 'collector') {
      memberData.assignedCollector = req.user.id;
    } else if (assignedCollector) {
      memberData.assignedCollector = assignedCollector;
    }

    console.log('💾 Creating member with data:', JSON.stringify(memberData, null, 2));
    console.log('💰 totalSavings value:', memberData.totalSavings, 'Type:', typeof memberData.totalSavings);

    const member = await Member.create(memberData);

    console.log('✅ Member created successfully');
    console.log('📊 Member totalSavings after creation:', member.totalSavings);
    console.log('📊 Full member object:', JSON.stringify(member, null, 2));

    // Update branch member count if branch code provided
    if (branchCode) {
      const Branch = require('../models/Branch');
      await Branch.findOneAndUpdate(
        { branchCode: branchCode },
        { $inc: { memberCount: 1 } }
      );
      console.log(`✅ Updated member count for branch ${branchCode}`);
    }

    // 🎯 NEW: Create initial savings installment record if savings provided
    if (parsedSavings > 0) {
      const Installment = require('../models/Installment');

      // Use assigned collector if available, otherwise use the user who created the member
      const savingsCollector = memberData.assignedCollector || req.user.id;
      console.log(`👤 Initial savings collector: ${savingsCollector} (${memberData.assignedCollector ? 'assigned collector' : 'created by user'})`);

      const currentDate = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[currentDate.getDay()];
      const weekNumber = Math.ceil(currentDate.getDate() / 7);
      const monthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      const timestamp = Date.now();

      const initialSavingsData = {
        member: member._id,
        collector: savingsCollector, // ✅ Use assigned collector or created by user
        amount: parsedSavings,
        installmentType: 'extra',
        paymentMethod: 'cash',
        collectionDate: currentDate,
        collectionDay: currentDay,
        weekNumber: weekNumber,
        monthYear: monthYear,
        branch: branch || '',
        branchCode: branchCode || '',
        receiptNumber: `INIT-SAV-${timestamp}`,
        note: `Initial Savings - ৳${parsedSavings} - Member: ${name}`,
        status: 'collected',
        createdBy: req.user.id
      };

      const installment = await Installment.create(initialSavingsData);
      console.log(`💰 Created initial savings record: ৳${parsedSavings} for collector ${savingsCollector}`);

      // Create a corresponding CollectionHistory record so it shows up in daily reports and dashboards
      try {
        const CollectionHistory = require('../models/CollectionHistory');
        await CollectionHistory.create({
          installment: installment._id,
          member: member._id,
          collector: savingsCollector,
          collectionAmount: parsedSavings,
          collectionDate: currentDate,
          receiptNumber: `INIT-SAV-${timestamp}`,
          paymentMethod: 'cash',
          outstandingAfterCollection: 0,
          installmentTarget: parsedSavings,
          installmentDue: 0,
          branch: branch || member.branch || '',
          branchCode: branchCode || member.branchCode || '',
          collectionDay: currentDay,
          weekNumber: weekNumber,
          monthYear: monthYear,
          note: `Initial Savings - ৳${parsedSavings} - Member: ${name}`,
          createdBy: req.user.id
        });
        console.log(`✅ Created CollectionHistory for initial savings: ৳${parsedSavings}`);
      } catch (historyError) {
        console.error('❌ Error creating CollectionHistory for initial savings:', historyError);
      }
    }

    // 🎯 NEW: Add member to CollectionSchedule
    if (branchCode && assignedCollector) {
      const CollectionSchedule = require('../models/CollectionSchedule');

      // Find all schedules for this collector
      const schedules = await CollectionSchedule.find({
        collector: assignedCollector,
        isActive: true
      });

      // Add member to matching branch in each schedule
      for (const schedule of schedules) {
        const branch = schedule.branches.find(b => b.branchCode === branchCode);
        if (branch) {
          // Check if member already exists
          if (!branch.members.includes(member._id)) {
            branch.members.push(member._id);
            await schedule.save();
            console.log(`✅ Added member to CollectionSchedule (${schedule.collectionDay})`);
          }
        }
      }
    }

    // Populate the created member
    await member.populate('assignedCollector', 'name email');
    await member.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Member created successfully',
      data: member
    });

  } catch (error) {
    console.error('❌ Create member error:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error keyValue:', error.keyValue);
    console.error('❌ Error details:', error.stack);
    console.error('Request body:', req.body);
    console.error('Request file:', req.file);

    // Handle specific MongoDB validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: validationErrors
      });
    }

    // Handle MongoDB duplicate key errors (E11000)
    if (error.code === 11000 || error.name === 'MongoServerError' && error.message.includes('duplicate key')) {
      console.log('🔍 DUPLICATE KEY ERROR DETECTED!');
      console.log('🔍 Error keyValue:', error.keyValue);

      // Extract the duplicate field and value
      const field = error.keyValue ? Object.keys(error.keyValue)[0] : 'unknown';
      const value = error.keyValue ? error.keyValue[field] : 'unknown';

      let message = 'Duplicate entry detected';
      let friendlyField = field;

      // Create user-friendly error messages
      if (field === 'nidNumber') {
        message = `NID number "${value}" already exists`;
        friendlyField = 'NID Number';
      } else if (field === 'phone') {
        message = `Phone number "${value}" already exists`;
        friendlyField = 'Phone Number';
      } else if (field === 'memberCode') {
        message = `Member code "${value}" already exists`;
        friendlyField = 'Member Code';
      }

      console.log('✅ Sending duplicate error response:', message);

      return res.status(400).json({
        success: false,
        message: message,
        field: field,
        friendlyField: friendlyField,
        value: value,
        type: 'duplicate'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating member',
      error: error.message
    });
  }
});

// @desc    Update member
// @route   PUT /api/members/:id
// @access  Private (Admin/Manager/Assigned Collector)
router.put('/:id', protect, uploadProfileImage, compressImage, handleUploadError, async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);

    if (!member || !member.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Role-based access control
    if (req.user.role === 'collector' &&
      member.assignedCollector &&
      member.assignedCollector.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only update members assigned to you.'
      });
    }

    // Removed duplicate validation for updates - allow all duplicates

    // Handle profile image update
    const updateData = { ...req.body, updatedBy: req.user.id };
    if (req.file) {
      updateData.profileImage = `/uploads/members/${req.file.filename}`;
    }

    // Update member
    const updatedMember = await Member.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('assignedCollector', 'name email')
      .populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Member updated successfully',
      data: updatedMember
    });

  } catch (error) {
    console.error('Update member error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid member ID'
      });
    }

    // Removed duplicate key error handling for updates - allow all duplicates

    res.status(500).json({
      success: false,
      message: 'Server error while updating member',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Delete member (soft delete)
// @route   DELETE /api/members/:id
// @access  Private (Admin/Manager only)
router.delete('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const member = await Member.findById(req.params.id);

    if (!member || !member.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    // Soft delete
    // Soft delete
    const updateFields = {
      isActive: false,
      updatedBy: req.user.id
    };

    // 🔍 Also rename the memberCode so it can be reused immediately
    // Format: "001-deleted-1678234234234"
    if (member.memberCode && !member.memberCode.includes('-deleted-')) {
      updateFields.memberCode = `${member.memberCode}-deleted-${Date.now()}`;
    }

    // Use updateOne to bypass regex validation
    await Member.updateOne(
      { _id: member._id },
      { $set: updateFields }
    );

    res.status(200).json({
      success: true,
      message: 'Member deleted successfully'
    });

  } catch (error) {
    console.error('Delete member error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid member ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting member',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get members statistics
// @route   GET /api/members/stats
// @access  Private
router.get('/stats/overview', protect, async (req, res) => {
  try {
    const filter = { isActive: true };

    // Role-based filtering
    if (req.user.role === 'collector') {
      filter.assignedCollector = req.user.id;
    }

    const stats = await Member.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalMembers: { $sum: 1 },
          activeMembers: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          inactiveMembers: {
            $sum: { $cond: [{ $eq: ['$status', 'Inactive'] }, 1, 0] }
          },
          pendingMembers: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
          },
          totalSavings: { $sum: '$totalSavings' },
          totalPaid: { $sum: '$totalPaid' },
          avgAge: { $avg: '$age' }
        }
      }
    ]);

    const result = stats[0] || {
      totalMembers: 0,
      activeMembers: 0,
      inactiveMembers: 0,
      pendingMembers: 0,
      totalSavings: 0,
      totalPaid: 0,
      avgAge: 0
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Get member stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching member statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Check if member code exists (Real-time validation)
// @route   GET /api/members/check-code/:memberCode
// @access  Private
router.get('/check-code/:memberCode', protect, async (req, res) => {
  try {
    const { memberCode } = req.params;
    const { excludeMemberId } = req.query; // For edit mode - exclude current member

    console.log(`🔍 Checking member code: ${memberCode}${excludeMemberId ? ` (excluding ${excludeMemberId})` : ''}`);

    // Build query
    const query = {
      memberCode: memberCode,
      isActive: true // Only check active members
    };

    // If editing a member, exclude that member from the check
    if (excludeMemberId) {
      query._id = { $ne: excludeMemberId };
    }

    const existingMember = await Member.findOne(query).select('name branchCode branch memberCode');

    if (existingMember) {
      console.log(`⚠️ Member code ${memberCode} already exists - Branch: ${existingMember.branch} (${existingMember.branchCode})`);
      return res.status(200).json({
        success: true,
        exists: true,
        message: `Member code "${memberCode}" already exists`,
        member: {
          name: existingMember.name,
          branch: existingMember.branch,
          branchCode: existingMember.branchCode
        }
      });
    }

    console.log(`✅ Member code ${memberCode} is available`);
    return res.status(200).json({
      success: true,
      exists: false,
      message: `Member code "${memberCode}" is available`
    });

  } catch (error) {
    console.error('Check member code error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking member code',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get members by branch
// @route   GET /api/members/branch/:branchCode
// @access  Private
router.get('/branch/:branchCode', protect, async (req, res) => {
  try {
    const members = await Member.findByBranch(req.params.branchCode)
      .populate('assignedCollector', 'name email')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: members
    });

  } catch (error) {
    console.error('Get members by branch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching members by branch',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
