/**
 * Get the full URL for an uploaded image
 * @param {string} imagePath - The image path from the database (e.g., /uploads/members/image.jpg)
 * @returns {string|null} - Full URL for the image
 */
export const getImageUrl = (imagePath) => {
    if (!imagePath) return null;

    // If already a full URL, return as-is
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath;
    }

    // ✅ CRITICAL FIX: Backend is in separate 'ngo-backend' folder on production server
    // Images are at: https://satrong-sajghor.com/ngo-backend/uploads/members/...
    // Runtime check for production domain
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    if (isProduction) {
        // Nginx serves uploads directly from /uploads/ path
        const fullUrl = imagePath.startsWith('/uploads') ? imagePath : `/uploads${imagePath}`;
        return fullUrl;
    } else {
        // In development mode, prepend the API base URL
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const baseUrl = apiUrl.replace('/api', '');
        return `${baseUrl}${imagePath}`;
    }
};

// Version: 2.0 - Fixed for ngo-backend folder structure

/**
 * Compress an image on the client side using Canvas API
 * @param {File} file - The original image file
 * @param {number} maxWidth - Max width of the output image (default 500)
 * @param {number} maxHeight - Max height of the output image (default 600)
 * @param {number} quality - Compression quality between 0 and 1 (default 0.75)
 * @returns {Promise<File>} - Promise resolving to the compressed File object
 */
export const compressImage = (file, maxWidth = 500, maxHeight = 600, quality = 0.75) => {
    return new Promise((resolve) => {
        // If not an image, resolve with original
        if (!file || !file.type.startsWith('image/')) {
            return resolve(file);
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Maintain aspect ratio
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            return resolve(file); // Fallback to original
                        }
                        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        console.log(`📸 Client-side image compressed: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) → ${(compressedFile.size / 1024).toFixed(1)}KB`);
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => {
                resolve(file); // Fallback
            };
        };
        reader.onerror = () => {
            resolve(file); // Fallback
        };
    });
};

