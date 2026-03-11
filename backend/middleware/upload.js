const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/members');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Use memory storage so sharp can process before saving
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Configure multer with memory storage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Allow up to 10MB input (will be compressed)
  },
  fileFilter: fileFilter
});

// Middleware for single profile image upload
const uploadProfileImage = upload.single('profileImage');

// Image compression middleware - runs AFTER multer
const compressImage = async (req, res, next) => {
  if (!req.file) return next();

  try {
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      // If sharp not installed, save original file
      console.warn('⚠️ sharp not installed - saving original image');
      const memberCode = req.body.memberCode || 'member';
      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `${memberCode}_${timestamp}${ext}`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, req.file.buffer);
      req.file.filename = filename;
      req.file.path = filepath;
      return next();
    }

    const memberCode = req.body.memberCode || 'member';
    const timestamp = Date.now();
    const filename = `${memberCode}_${timestamp}.jpg`; // Always save as JPEG
    const filepath = path.join(uploadsDir, filename);

    // Compress: resize to max 500x600, convert to JPEG at 80% quality
    await sharp(req.file.buffer)
      .resize(500, 600, {
        fit: 'inside',        // Keep aspect ratio
        withoutEnlargement: true // Don't upscale small images
      })
      .jpeg({ quality: 80, progressive: true })
      .toFile(filepath);

    // Update req.file to match what the rest of the app expects
    req.file.filename = filename;
    req.file.path = filepath;
    req.file.mimetype = 'image/jpeg';

    const stats = fs.statSync(filepath);
    console.log(`✅ Image compressed: ${req.file.originalname} → ${filename} (${(stats.size / 1024).toFixed(1)}KB)`);

    next();
  } catch (error) {
    console.error('Image compression error:', error);
    // If compression fails, try to save original
    try {
      const memberCode = req.body.memberCode || 'member';
      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `${memberCode}_${timestamp}${ext}`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, req.file.buffer);
      req.file.filename = filename;
      req.file.path = filepath;
      next();
    } catch (saveError) {
      next(saveError);
    }
  }
};

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.log('Multer error:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field. Only profileImage field is allowed.'
      });
    }
  }

  if (error && error.message === 'Only image files are allowed!') {
    return res.status(400).json({
      success: false,
      message: 'Only image files (JPG, PNG, GIF, etc.) are allowed.'
    });
  }

  if (error) {
    console.log('Upload error:', error);
  }
  next();
};

module.exports = {
  uploadProfileImage,
  compressImage,
  handleUploadError
};
