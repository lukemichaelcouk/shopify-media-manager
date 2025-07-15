/**
 * Image Utility
 * Basic image analysis and processing utilities
 */

/**
 * Analyzes image properties for basic information
 * @param {Object} image - Image object with { id, src, width, height, sizeInBytes, type }
 * @returns {Object} Enhanced image object with basic analysis
 */
function analyzeImageSize(image) {
    const { id, src, width, height, sizeInBytes, type } = image;
    
    // Basic size classification for UI purposes
    const isLarge = sizeInBytes > 1024 * 1024; // 1MB threshold for "large" classification
    
    return {
        id,
        src,
        width,
        height,
        sizeInBytes,
        type,
        isLarge,
        // Additional helper properties
        sizeFormatted: formatBytes(sizeInBytes)
    };
}

/**
 * Format bytes into human-readable string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Analyze multiple images at once
 * @param {Array} images - Array of image objects
 * @returns {Array} Array of analyzed image objects
 */
function analyzeBatchImages(images) {
    return images.map(image => analyzeImageSize(image));
}

/**
 * Get summary statistics for a collection of analyzed images
 * @param {Array} analyzedImages - Array of analyzed image objects
 * @returns {Object} Summary statistics
 */
function getImageSummary(analyzedImages) {
    const total = analyzedImages.length;
    const large = analyzedImages.filter(img => img.isLarge).length;
    const totalSizeBytes = analyzedImages.reduce((sum, img) => sum + img.sizeInBytes, 0);
    
    const byType = analyzedImages.reduce((acc, img) => {
        if (!acc[img.type]) {
            acc[img.type] = { total: 0, large: 0 };
        }
        acc[img.type].total++;
        if (img.isLarge) {
            acc[img.type].large++;
        }
        return acc;
    }, {});
    
    return {
        total,
        large,
        percentage: total > 0 ? Math.round((large / total) * 100) : 0,
        totalSize: formatBytes(totalSizeBytes),
        byType
    };
}

// Export functions for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        analyzeImageSize,
        analyzeBatchImages,
        getImageSummary,
        formatBytes
    };
} else if (typeof window !== 'undefined') {
    window.ImageOptimizer = {
        analyzeImageSize,
        analyzeBatchImages,
        getImageSummary,
        formatBytes
    };
}
