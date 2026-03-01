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
