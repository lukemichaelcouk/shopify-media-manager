/**
 * Image Optimization Utility
 * Determines if images are oversized based on type-specific limits
 */

/**
 * Determines if an image is oversized based on type-specific rules
 * @param {Object} image - Image object with { id, src, width, height, sizeInBytes, type }
 * @returns {Object} Enhanced image object with oversized analysis
 */
function analyzeImageSize(image) {
    const { id, src, width, height, sizeInBytes, type } = image;
    
    // Define limits for each image type
    const limits = {
        product: {
            maxWidth: 2048,
            maxHeight: 2048,
            maxSizeBytes: 500 * 1024 // 500KB
        },
        collection: {
            maxWidth: 1024,
            maxHeight: 1024,
            maxSizeBytes: 500 * 1024 // 500KB
        },
        banner: {
            maxWidth: 2560,
            maxHeight: 1440,
            maxSizeBytes: 1024 * 1024 // 1MB
        },
        thumbnail: {
            maxWidth: 512,
            maxHeight: 512,
            maxSizeBytes: 100 * 1024 // 100KB
        }
    };
    
    // Universal limits
    const HARD_SIZE_CAP = 2 * 1024 * 1024; // 2MB hard cap
    const MAX_PIXELS = 5 * 1000 * 1000; // 5 million pixels
    
    // Get limits for this image type (default to product if unknown type)
    const typeLimit = limits[type] || limits.product;
    
    const reasons = [];
    let oversized = false;
    
    // Check width
    if (width > typeLimit.maxWidth) {
        reasons.push(`Width ${width}px exceeds ${type} limit of ${typeLimit.maxWidth}px`);
        oversized = true;
    }
    
    // Check height
    if (height > typeLimit.maxHeight) {
        reasons.push(`Height ${height}px exceeds ${type} limit of ${typeLimit.maxHeight}px`);
        oversized = true;
    }
    
    // Check file size against type limit
    if (sizeInBytes > typeLimit.maxSizeBytes) {
        const maxSizeKB = Math.round(typeLimit.maxSizeBytes / 1024);
        const actualSizeKB = Math.round(sizeInBytes / 1024);
        reasons.push(`File size ${actualSizeKB}KB exceeds ${type} limit of ${maxSizeKB}KB`);
        oversized = true;
    }
    
    // Check total pixels
    const totalPixels = width * height;
    if (totalPixels > MAX_PIXELS) {
        reasons.push(`Total pixels ${totalPixels.toLocaleString()} exceeds 5 million pixel limit`);
        oversized = true;
    }
    
    // Check hard file size cap
    if (sizeInBytes > HARD_SIZE_CAP) {
        const actualSizeMB = (sizeInBytes / (1024 * 1024)).toFixed(1);
        reasons.push(`File size ${actualSizeMB}MB exceeds 2MB hard cap`);
        oversized = true;
    }
    
    return {
        id,
        src,
        width,
        height,
        sizeInBytes,
        type,
        oversized,
        reasons,
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
    const oversized = analyzedImages.filter(img => img.oversized).length;
    const totalSizeBytes = analyzedImages.reduce((sum, img) => sum + img.sizeInBytes, 0);
    
    const byType = analyzedImages.reduce((acc, img) => {
        if (!acc[img.type]) {
            acc[img.type] = { total: 0, oversized: 0 };
        }
        acc[img.type].total++;
        if (img.oversized) {
            acc[img.type].oversized++;
        }
        return acc;
    }, {});
    
    return {
        total,
        oversized,
        percentage: total > 0 ? Math.round((oversized / total) * 100) : 0,
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
