const express = require('express');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const { sendTokenResponse } = require('../utils/jwt');
const { protect } = require('../middleware/auth');
const superAdminAuth = require('../middleware/superAdminAuth');
const {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword
} = require('../middleware/validation');
const { uploadProfileImage, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { name, email, password, phone, branch, branchCode, role } = req.body;

    // Check if user already exists
    const query = { email };
    if (phone) {
      query.$or = [{ email }, { phone }];
      delete query.email;
    }

    const existingUser = await User.findOne(query);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or phone number'
      });
    }

    // Create user
    const userData = {
      name,
      email,
      password,
      role: role || 'admin'
    };

    // Add optional fields if provided
    if (phone) userData.phone = phone;
    if (branch) userData.branch = branch;
    if (branchCode) userData.branchCode = branchCode;

    const user = await User.create(userData);

    // Return success message without token (waiting for approval)
    res.status(201).json({
      success: true,
      message: 'Registration successful! Your account is pending approval. Please wait for the super admin to approve your account.',
      requiresApproval: true
    });

  } catch (error) {
    console.error('Registration error:', error);

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
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
  try {
    // Debug: log what we received
    console.log('🔐 Login attempt - Body keys:', Object.keys(req.body || {}));
    console.log('🔐 Login attempt - identifier:', req.body?.identifier, 'email:', req.body?.email);

    // Accept both 'identifier' and 'email' field names
    const identifier = req.body.identifier || req.body.email;
    const password = req.body.password;

    // Basic validation
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Email or phone number is required'
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    console.log('🔐 Looking up user:', identifier);

    // Find user by email or phone
    const user = await User.findByEmailOrPhone(identifier);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact administrator.'
      });
    }

    // Check if user is approved
    if (!user.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Waiting for approval. Your account is pending approval by the super admin. Please wait.',
        requiresApproval: true
      });
    }

    // Helper function to convert 24-hour time to 12-hour format with AM/PM
    const convertTo12Hour = (time24) => {
      const [hours, minutes] = time24.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12; // Convert 0 to 12 for midnight
      return `${hour12}:${minutes} ${ampm}`;
    };

    // Check login time restrictions (except for super admin - anarul258011@gmail.com)
    const isSuperAdmin = user.email === 'anarul258011@gmail.com';
    if (!isSuperAdmin) {
      const settings = await SystemSettings.getSettings();
      const loginCheck = settings.isLoginAllowed();

      if (!loginCheck.allowed) {
        const startTime12 = convertTo12Hour(loginCheck.startTime);
        const endTime12 = convertTo12Hour(loginCheck.endTime);

        return res.status(403).json({
          success: false,
          message: `Please login between ${startTime12} and ${endTime12}.`,
          timeRestricted: true,
          allowedTime: {
            start: loginCheck.startTime,
            end: loginCheck.endTime,
            current: loginCheck.currentTime,
            startFormatted: startTime12,
            endFormatted: endTime12
          }
        });
      }
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Send token response
    sendTokenResponse(user, 200, res, 'Login successful');

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, uploadProfileImage, handleUploadError, validateUpdateProfile, async (req, res) => {
  try {
    const { name, phone, branch, branchCode } = req.body;

    // Build update object
    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (branch) updateData.branch = branch;
    if (branchCode) updateData.branchCode = branchCode;

    // Handle profile image upload
    if (req.file) {
      // Store path relative to server root, e.g., '/uploads/members/filename.jpg'
      // The middleware saves to 'uploads/members', so we just need to prepend '/' if serving statically
      // or construct the URL path.
      // req.file.filename is the filename.
      updateData.profileImage = `/uploads/members/${req.file.filename}`;
    }

    // Check if phone is being updated and already exists
    if (phone && phone !== req.user.phone) {
      const existingUser = await User.findOne({ phone, _id: { $ne: req.user.id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Phone number already exists'
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    console.error('Update profile error:', error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during profile update',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', protect, validateChangePassword, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password change',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
});

// @desc    Check if user is authenticated
// @route   GET /api/auth/check
// @access  Public
router.get('/check', protect, (req, res) => {
  res.status(200).json({
    success: true,
    authenticated: true,
    user: req.user
  });
});

// @desc    Get all pending users (waiting for approval)
// @route   GET /api/auth/pending-users
// @access  Private (Super Admin only)
router.get('/pending-users', protect, superAdminAuth, async (req, res) => {
  try {
    // Only show admin/manager who registered via registration page
    // Exclude collectors as they are auto-approved
    const pendingUsers = await User.find({
      isApproved: false,
      role: { $in: ['admin', 'manager'] }  // Only admin/manager, not collectors
    }).select('-password');

    res.status(200).json({
      success: true,
      count: pendingUsers.length,
      users: pendingUsers
    });
  } catch (error) {
    console.error('Get pending users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pending users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Approve user
// @route   PUT /api/auth/approve-user/:id
// @access  Private (Super Admin only)
router.put('/approve-user/:id', protect, superAdminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isApproved) {
      return res.status(400).json({
        success: false,
        message: 'User is already approved'
      });
    }

    user.isApproved = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${user.name} has been approved successfully`,
      user
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Reject/delete user
// @route   DELETE /api/auth/reject-user/:id
// @access  Private (Super Admin only)
router.delete('/reject-user/:id', protect, superAdminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent super admin from rejecting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot reject your own account'
      });
    }

    // Prevent rejecting other super admins
    if (user.isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reject super admin accounts'
      });
    }

    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: `User ${user.name} has been rejected and removed`
    });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get all users
// @route   GET /api/auth/all-users
// @access  Private (Super Admin only)
router.get('/all-users', protect, superAdminAuth, async (req, res) => {
  try {
    // Only show admin/manager in Admin Management page
    // Collectors are managed separately in Collectors page
    const users = await User.find({
      role: { $in: ['admin', 'manager'] }  // Only admin/manager, not collectors
    }).select('-password').sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Activate user
// @route   PUT /api/auth/activate-user/:id
// @access  Private (Super Admin only)
router.put('/activate-user/:id', protect, superAdminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent activating yourself (you're already active)
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own status'
      });
    }

    if (user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'User is already active'
      });
    }

    user.isActive = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${user.name} has been activated successfully`,
      user
    });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while activating user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Deactivate user
// @route   PUT /api/auth/deactivate-user/:id
// @access  Private (Super Admin only)
router.put('/deactivate-user/:id', protect, superAdminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deactivating yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    // Prevent deactivating other super admins
    if (user.isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate super admin accounts'
      });
    }

    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'User is already deactivated'
      });
    }

    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${user.name} has been deactivated successfully`,
      user
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deactivating user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Delete user permanently
// @route   DELETE /api/auth/delete-user/:id
// @access  Private (Super Admin only)
router.delete('/delete-user/:id', protect, superAdminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    // Prevent deleting other super admins
    if (user.isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete super admin accounts'
      });
    }

    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: `User ${user.name} has been deleted permanently`
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Get system settings
// @route   GET /api/auth/system-settings
// @access  Private (Super Admin only)
router.get('/system-settings', protect, superAdminAuth, async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();

    res.status(200).json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching system settings',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @desc    Update system settings
// @route   POST /api/auth/system-settings
// @access  Private (Super Admin only)
router.post('/system-settings', protect, superAdminAuth, async (req, res) => {
  try {
    const { loginTimeRestriction } = req.body;

    let settings = await SystemSettings.getSettings();

    // Update settings
    if (loginTimeRestriction) {
      settings.loginTimeRestriction = {
        enabled: loginTimeRestriction.enabled || false,
        startTime: loginTimeRestriction.startTime || '00:00',
        endTime: loginTimeRestriction.endTime || '23:59'
      };
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'System settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating system settings',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
