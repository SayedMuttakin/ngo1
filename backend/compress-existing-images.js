#!/usr/bin/env node
/**
 * Bulk Image Compression Script
 * Run this ONCE on VPS to compress all existing member images:
 * node compress-existing-images.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads/members');
const MAX_WIDTH = 500;
const MAX_HEIGHT = 600;
const QUALITY = 80;

async function compressImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  if (!validExts.includes(ext)) return null;

  const originalSize = fs.statSync(filePath).size;

  // Skip if already very small (under 100KB - already compressed)
  if (originalSize < 100 * 1024) {
    console.log(`⏭️  Skipping (already small): ${path.basename(filePath)} (${(originalSize / 1024).toFixed(1)}KB)`);
    return null;
  }

  try {
    // Create temp file
    const tempPath = filePath + '.tmp.jpg';

    await sharp(filePath)
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: QUALITY, progressive: true })
      .toFile(tempPath);

    const newSize = fs.statSync(tempPath).size;

    // Only replace if new file is actually smaller
    if (newSize < originalSize) {
      // Replace original with compressed version
      fs.unlinkSync(filePath);
      fs.renameSync(tempPath, filePath.replace(/\.(png|gif|bmp|webp)$/i, '.jpg'));

      // If extension changed (png -> jpg), update the file reference
      const savedKB = ((originalSize - newSize) / 1024).toFixed(1);
      const savedPercent = (((originalSize - newSize) / originalSize) * 100).toFixed(0);
      console.log(`✅ Compressed: ${path.basename(filePath)} | ${(originalSize / 1024).toFixed(1)}KB → ${(newSize / 1024).toFixed(1)}KB (saved ${savedKB}KB, ${savedPercent}%)`);
      return { originalSize, newSize, saved: originalSize - newSize };
    } else {
      fs.unlinkSync(tempPath);
      console.log(`⏭️  Skipping (already optimal): ${path.basename(filePath)}`);
      return null;
    }
  } catch (err) {
    // Clean up temp if exists
    try { fs.unlinkSync(filePath + '.tmp.jpg'); } catch(e) {}
    console.error(`❌ Failed: ${path.basename(filePath)} - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting Bulk Image Compression...');
  console.log(`📁 Directory: ${UPLOADS_DIR}`);
  console.log(`⚙️  Settings: max ${MAX_WIDTH}x${MAX_HEIGHT}px, ${QUALITY}% quality`);
  console.log('─'.repeat(60));

  if (!fs.existsSync(UPLOADS_DIR)) {
    console.error('❌ Uploads directory not found:', UPLOADS_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(UPLOADS_DIR).map(f => path.join(UPLOADS_DIR, f));
  const imageFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
  });

  console.log(`📊 Found ${imageFiles.length} image files\n`);

  let totalSaved = 0;
  let compressed = 0;
  let skipped = 0;

  for (const file of imageFiles) {
    const result = await compressImage(file);
    if (result) {
      totalSaved += result.saved;
      compressed++;
    } else {
      skipped++;
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`✅ Done! Compressed: ${compressed} | Skipped: ${skipped}`);
  console.log(`💾 Total disk space saved: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
  console.log('\n🎉 All existing images have been optimized!');
}

main().catch(console.error);
