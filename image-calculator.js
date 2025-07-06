// Image Optimization Calculator
// Calculates potential savings from lossless compression and resizing

const sharp = require('sharp');

/**
 * Image optimization settings
 */
const OPTIMIZATION_SETTINGS = {
    // Maximum dimensions for different image types
    maxDimensions: {
        product: { width: 2048, height: 2048 },
        collection: { width: 1920, height: 1080 },
        banner: { width: 2400, height: 1200 },
        thumbnail: { width: 600, height: 600 },
        default: { width: 1920, height: 1920 }
    },
    
    // Compression quality settings (0-100)
    quality: {
        jpeg: 85,
        webp: 80,
        png: 9, // PNG compression level (0-9)
        avif: 75
    },
    
    // Expected compression ratios (conservative estimates)
    compressionRatios: {
        'JPG': 0.75,   // 25% reduction typical
        'JPEG': 0.75,
        'PNG': 0.85,   // 15% reduction typical
        'WEBP': 0.70,  // 30% reduction typical
        'AVIF': 0.60,  // 40% reduction typical
        'GIF': 0.90,   // 10% reduction typical
        'SVG': 0.95    // 5% reduction typical
    }
};

/**
 * Calculate potential savings for a single image
 * @param {Object} image - Image object with metadata
 * @returns {Object} Savings calculation
 */
function calculateImageSavings(image) {
    const originalSize = image.size || 0;
    const fileType = (image.type || 'unknown').toUpperCase();
    const imageType = image.imageType || 'default';
    const width = image.width || 0;
    const height = image.height || 0;
    
    if (originalSize === 0 || width === 0 || height === 0) {
        return {
            originalSize,
            estimatedOptimizedSize: originalSize,
            compressionSavings: 0,
            resizeSavings: 0,
            totalSavings: 0,
            newDimensions: { width, height },
            recommendations: []
        };
    }
    
    // Get max dimensions for this image type
    const maxDims = OPTIMIZATION_SETTINGS.maxDimensions[imageType] || 
                   OPTIMIZATION_SETTINGS.maxDimensions.default;
    
    // Calculate resize savings
    let resizeRatio = 1;
    let newWidth = width;
    let newHeight = height;
    
    if (width > maxDims.width || height > maxDims.height) {
        const widthRatio = maxDims.width / width;
        const heightRatio = maxDims.height / height;
        resizeRatio = Math.min(widthRatio, heightRatio);
        
        newWidth = Math.round(width * resizeRatio);
        newHeight = Math.round(height * resizeRatio);
    }
    
    // Resize saves proportional to pixel reduction (squared ratio)
    const resizeSavings = originalSize * (1 - (resizeRatio * resizeRatio));
    const sizeAfterResize = originalSize - resizeSavings;
    
    // Calculate compression savings
    const compressionRatio = OPTIMIZATION_SETTINGS.compressionRatios[fileType] || 0.80;
    const compressionSavings = sizeAfterResize * (1 - compressionRatio);
    
    const estimatedOptimizedSize = sizeAfterResize - compressionSavings;
    const totalSavings = resizeSavings + compressionSavings;
    
    // Generate recommendations
    const recommendations = [];
    
    if (resizeSavings > 0) {
        recommendations.push({
            type: 'resize',
            description: `Resize from ${width}×${height} to ${newWidth}×${newHeight}`,
            savings: resizeSavings,
            savingsPercent: Math.round((resizeSavings / originalSize) * 100)
        });
    }
    
    if (compressionSavings > 0) {
        recommendations.push({
            type: 'compression',
            description: `Apply lossless compression to ${fileType}`,
            savings: compressionSavings,
            savingsPercent: Math.round((compressionSavings / originalSize) * 100)
        });
    }
    
    // Format conversion recommendations
    if (fileType === 'PNG' && originalSize > 500000) { // > 500KB PNG
        const webpSavings = originalSize * 0.4; // WebP typically 40% smaller
        recommendations.push({
            type: 'format',
            description: 'Convert PNG to WebP format',
            savings: webpSavings,
            savingsPercent: Math.round((webpSavings / originalSize) * 100)
        });
    }
    
    return {
        originalSize,
        estimatedOptimizedSize: Math.round(estimatedOptimizedSize),
        compressionSavings: Math.round(compressionSavings),
        resizeSavings: Math.round(resizeSavings),
        totalSavings: Math.round(totalSavings),
        savingsPercent: Math.round((totalSavings / originalSize) * 100),
        newDimensions: { width: newWidth, height: newHeight },
        needsResize: resizeRatio < 1,
        compressionRatio,
        recommendations
    };
}

/**
 * Calculate total savings for all images
 * @param {Array} images - Array of image objects
 * @returns {Object} Total savings calculation
 */
function calculateTotalSavings(images) {
    let totalOriginalSize = 0;
    let totalOptimizedSize = 0;
    let totalCompressionSavings = 0;
    let totalResizeSavings = 0;
    let optimizableImages = 0;
    let resizableImages = 0;
    
    const imageCalculations = images.map(image => {
        const calculation = calculateImageSavings(image);
        
        totalOriginalSize += calculation.originalSize;
        totalOptimizedSize += calculation.estimatedOptimizedSize;
        totalCompressionSavings += calculation.compressionSavings;
        totalResizeSavings += calculation.resizeSavings;
        
        if (calculation.totalSavings > 0) {
            optimizableImages++;
        }
        
        if (calculation.needsResize) {
            resizableImages++;
        }
        
        return {
            ...image,
            optimization: calculation
        };
    });
    
    const totalSavings = totalCompressionSavings + totalResizeSavings;
    const totalSavingsPercent = totalOriginalSize > 0 ? 
        Math.round((totalSavings / totalOriginalSize) * 100) : 0;
    
    return {
        images: imageCalculations,
        summary: {
            totalImages: images.length,
            optimizableImages,
            resizableImages,
            totalOriginalSize,
            totalOptimizedSize,
            totalSavings,
            totalSavingsPercent,
            compressionSavings: totalCompressionSavings,
            resizeSavings: totalResizeSavings,
            formattedOriginalSize: formatBytes(totalOriginalSize),
            formattedOptimizedSize: formatBytes(totalOptimizedSize),
            formattedSavings: formatBytes(totalSavings)
        }
    };
}

/**
 * Format bytes to human readable format
 * @param {number} bytes 
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get optimization settings for frontend
 * @returns {Object}
 */
function getOptimizationSettings() {
    return {
        maxDimensions: OPTIMIZATION_SETTINGS.maxDimensions,
        quality: OPTIMIZATION_SETTINGS.quality,
        supportedFormats: ['JPG', 'JPEG', 'PNG', 'WEBP', 'AVIF', 'GIF']
    };
}

module.exports = {
    calculateImageSavings,
    calculateTotalSavings,
    getOptimizationSettings,
    formatBytes
};
