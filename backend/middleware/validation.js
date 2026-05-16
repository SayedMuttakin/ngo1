const { body, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }

  next();
};

// Registration validation rules
const validateRegister = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s\u0980-\u09FF]+$/)
    .withMessage('Name can only contain letters and spaces'),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email address'),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),

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

  body('role')
    .optional()
    .isIn(['admin', 'manager', 'collector'])
    .withMessage('Role must be admin, manager, or collector'),

  handleValidationErrors
];

// Login validation rules
const validateLogin = [
  // Normalize: accept both 'identifier' and 'email' field names
  (req, res, next) => {
    if (!req.body.identifier && req.body.email) {
      req.body.identifier = req.body.email;
    }
    next();
  },

  body('identifier')
    .notEmpty()
    .withMessage('Phone or Email is required')
    .custom((value) => {
      // Check if it's email or phone
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      const phoneRegex = /^01[3-9]\d{8}$/;

      if (!emailRegex.test(value) && !phoneRegex.test(value)) {
        throw new Error('Please enter a valid email address or phone number');
      }
      return true;
    }),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  handleValidationErrors
];

// Update profile validation rules
const validateUpdateProfile = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s\u0980-\u09FF]+$/)
    .withMessage('Name can only contain letters and spaces'),

  body('phone')
    .optional()
    .matches(/^01[3-9]\d{8}$/)
    .withMessage('Please enter a valid Bangladeshi phone number'),

  body('branch')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Branch name must be between 2 and 100 characters'),

  body('branchCode')
    .optional()
    .matches(/^\d{4}$/)
    .withMessage('Branch code must be exactly 4 digits'),

  handleValidationErrors
];

// Change password validation rules
const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),

  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),

  handleValidationErrors
];

// Member validation rules - DISABLED (no validation)
const validateMember = [
  // No validation rules - allow everything
  (req, res, next) => next()
];

// Update member validation rules - DISABLED (no validation)
const validateUpdateMember = [
  // No validation rules - allow everything
  (req, res, next) => next()
];

// Product validation function
const validateProduct = (productData, isUpdate = false) => {
  const errors = {};

  // Name validation
  if (!productData.name || productData.name.trim().length < 2) {
    errors.name = 'Product name must be at least 2 characters';
  }
  if (productData.name && productData.name.length > 100) {
    errors.name = 'Product name cannot exceed 100 characters';
  }

  // Category validation - OPTIONAL (removed from form)
  const validCategories = ['Food', 'Clothing', 'Medicine', 'Education', 'Emergency', 'Other'];
  if (productData.category && !validCategories.includes(productData.category)) {
    errors.category = 'Please select a valid category';
  }

  // Unit validation
  const validUnits = ['piece', 'kg', 'liter', 'box', 'bag', 'bosta', 'bottle', 'packet', 'dozen'];
  if (!productData.unit || !validUnits.includes(productData.unit)) {
    errors.unit = 'Please select a valid unit';
  }

  // Unit price validation
  if (!productData.unitPrice || isNaN(productData.unitPrice) || parseFloat(productData.unitPrice) < 0) {
    errors.unitPrice = 'Unit price must be a valid positive number';
  }

  // Total stock validation - Only for new products (not updates)
  if (!isUpdate) {
    if (productData.totalStock === undefined || productData.totalStock === null || isNaN(productData.totalStock) || parseInt(productData.totalStock) < 0) {
      errors.totalStock = 'Total stock must be a valid positive number';
    }
  }

  // Minimum stock validation
  if (productData.minimumStock && (isNaN(productData.minimumStock) || parseInt(productData.minimumStock) < 0)) {
    errors.minimumStock = 'Minimum stock must be a valid positive number';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

module.exports = {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateMember,
  validateUpdateMember,
  validateProduct,
  handleValidationErrors
};
