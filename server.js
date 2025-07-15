const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sizeOf = require('image-size');
const imageCalculator = require('./image-calculator');
const multer = require('multer');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Shopify API credentials
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
    console.error('❌ Missing required Shopify API credentials in environment variables');
    console.error('Please set SHOPIFY_API_KEY and SHOPIFY_API_SECRET in your .env file');
    process.exit(1);
}

// Valid Shopify scopes for media management
const SHOPIFY_SCOPES = 'read_products,write_products,read_themes,write_themes';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase JSON payload limit
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Increase URL-encoded payload limit

// Shopify OAuth callback endpoint (MUST be before static file serving)
app.get('/auth/callback', async (req, res) => {
    const { code, shop, state } = req.query;
    if (!code || !shop) {
        return res.status(400).send('Missing code or shop parameter');
    }
    try {
        const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
            client_id: SHOPIFY_API_KEY,
            client_secret: SHOPIFY_API_SECRET,
            code: code
        });
        
        const { access_token } = response.data;
        console.log('OAuth successful for shop:', shop);
        
        // Create a success page that redirects back to the app
        const successPage = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Installation Successful</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .success { color: #28a745; }
                .btn { background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; }
            </style>
        </head>
        <body>
            <h1 class="success">✅ Installation Successful!</h1>
            <p>Your Shopify Media Manager has been successfully installed.</p>
            <p><strong>Store:</strong> ${shop}</p>
            <br>
            <a href="https://app.wearespree.com?shop=${shop}&token=${access_token}" class="btn">
                Open Media Manager
            </a>
            <script>
                // Auto-redirect after 3 seconds
                setTimeout(() => {
                    window.location.href = 'https://app.wearespree.com?shop=${shop}&token=${access_token}';
                }, 3000);
            </script>
        </body>
        </html>`;
        
        res.send(successPage);
    } catch (error) {
        console.error('OAuth callback error:', error.response ? error.response.data : error.message);
        res.status(500).send('Failed to complete authentication: ' + (error.response ? JSON.stringify(error.response.data) : error.message));
    }
});

// Shopify OAuth token exchange endpoint (fallback for local development)
app.post('/api/shopify/exchange-code', async (req, res) => {
    const { code, shop } = req.body;
    if (!code || !shop) {
        return res.status(400).json({ error: 'Missing code or shop' });
    }
    try {
        const client_id = process.env.SHOPIFY_API_KEY;
        const client_secret = process.env.SHOPIFY_API_SECRET;
        const tokenUrl = `https://${shop}/admin/oauth/access_token`;
        const response = await axios.post(tokenUrl, {
            client_id,
            client_secret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${baseUrl}/auth/callback`
        });
        
        const { access_token } = response.data;
        const successPage = `<!DOCTYPE html>
        <html>
        <head>
            <title>Authentication Successful</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .success { color: #28a745; }
                .loading { display: none; }
            </style>
        </head>
        <body>
            <h1 class="success">Authentication Successful!</h1>
            <p>You can now close this window.</p>
            <script>
                setTimeout(() => {
                    window.close();
                }, 3000);
            </script>
        </body>
        </html>`;
        
        res.send(successPage);
    } catch (error) {
        console.error('OAuth callback error:', error.response ? error.response.data : error.message);
        res.status(500).send('Failed to complete authentication: ' + (error.response ? JSON.stringify(error.response.data) : error.message));
    }
});

// Shopify OAuth token exchange endpoint (fallback for local development)
app.post('/api/shopify/exchange-code', async (req, res) => {
    const { code, shop } = req.body;
    if (!code || !shop) {
        return res.status(400).json({ error: 'Missing code or shop' });
    }
    try {
        const client_id = process.env.SHOPIFY_API_KEY;
        const client_secret = process.env.SHOPIFY_API_SECRET;
        const tokenUrl = `https://${shop}/admin/oauth/access_token`;
        const response = await axios.post(tokenUrl, {
            client_id,
            client_secret,
            code
        });
        const { access_token } = response.data;
        res.json({ access_token, shop });
    } catch (err) {
        console.error('OAuth token exchange error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to exchange code for access token' });
    }
});

// === NEW: Fetch store info from Shopify ===
app.post('/api/store', async (req, res) => {
    const { accessToken, shop } = req.body;
    if (!accessToken || !shop) return res.status(400).json({ error: 'Missing accessToken or shop' });
    try {
        const response = await axios.get(`https://${shop}/admin/api/2023-10/shop.json`, {
            headers: { 'X-Shopify-Access-Token': accessToken }
        });
        res.json(response.data.shop);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch store info', details: err.message });
    }
});

// Endpoint to check granted access scopes for the current access token
app.post('/api/scopes', async (req, res) => {
    const { shop, accessToken } = req.body;
    if (!shop || !accessToken) {
        return res.status(400).json({ error: 'Missing shop or accessToken' });
    }
    try {
        const resp = await axios.get(`https://${shop}/admin/oauth/access_scopes.json`, {
            headers: { 'X-Shopify-Access-Token': accessToken }
        });
        console.log('Granted scopes:', resp.data);
        res.json(resp.data);
    } catch (err) {
        if (err.response) {
            console.error('Error fetching access scopes:', JSON.stringify(err.response.data));
            res.status(err.response.status).json(err.response.data);
        } else {
            console.error('Error fetching access scopes:', err.message);
            res.status(500).json({ error: err.message });
        }
    }
});

// --- Global Shopify API Throttler ---
const SHOPIFY_API_DELAY = 2000; // 2 seconds between requests
let lastShopifyApiCall = 0;
async function shopifyApiThrottler() {
    const now = Date.now();
    const wait = Math.max(0, SHOPIFY_API_DELAY - (now - lastShopifyApiCall));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastShopifyApiCall = Date.now();
}

// --- Utility: Ensure directory exists ---
function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// --- Utility: Sanitize file names ---
function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// --- Patch all Shopify API calls to use throttler and log errors ---
async function safeShopifyGet(url, config) {
    await shopifyApiThrottler();
    try {
        return await axios.get(url, config);
    } catch (err) {
        if (err.response) {
            console.error(`[API Error] ${url}:`, JSON.stringify(err.response.data));
        } else {
            console.error(`[API Error] ${url}:`, err.message);
        }
        throw err;
    }
}

// --- Utility: Format file size ---
function formatFileSize(bytes) {
    if (bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to get image dimensions from URL
async function getImageDimensions(url) {
    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 10000, // 10 second timeout
            maxContentLength: 50 * 1024 * 1024 // 50MB max download
        });
        
        const buffer = Buffer.from(response.data);
        const dimensions = (sizeOf.imageSize || sizeOf.default || sizeOf)(buffer);
        
        return {
            width: dimensions.width || 0,
            height: dimensions.height || 0,
            type: dimensions.type || 'unknown'
        };
    } catch (error) {
        console.warn(`Failed to get dimensions for ${url}:`, error.message);
        return {
            width: 0,
            height: 0,
            type: 'unknown'
        };
    }
}

// --- /api/media: Fetch all available image asset URLs (theme, products, collections) ---
app.post('/api/media', async (req, res) => {
    const { accessToken, shop } = req.body;
    console.log('Media API called for shop:', shop, 'with token:', accessToken ? 'present' : 'missing');
    
    if (!accessToken || !shop) {
        console.log('Missing accessToken or shop in request body');
        return res.status(400).json({ error: 'Missing accessToken or shop' });
    }
    
    const apiBase = `https://${shop}/admin/api/2023-10`;
    const headers = { 'X-Shopify-Access-Token': accessToken };
    let allImages = [];
    let skipped = [];
    let stats = {
        totalFiles: 0,
        categories: {
            theme: 0,
            products: 0,
            collections: 0
        }
    };
    
    console.log('Starting to fetch media for shop:', shop);
    
    // Helper function to create image object without metadata
    function createImageWithoutMetadata(url, category, additionalData = {}) {
        stats.categories[category]++;
        return {
            url,
            category,
            size: 0,
            sizeFormatted: 'Not checked',
            isLarge: false,
            width: 0,
            height: 0,
            ...additionalData
        };
    }
    // --- 1. Theme image assets ---
    try {
        console.log('Fetching themes...');
        const themesResp = await axios.get(`${apiBase}/themes.json`, { headers });
        console.log('Themes response:', themesResp.data.themes?.length, 'themes found');
        
        const mainTheme = Array.isArray(themesResp.data.themes) ? themesResp.data.themes.find(t => t.role === 'main') : null;
        console.log('Main theme found:', mainTheme ? `ID ${mainTheme.id}, Name: ${mainTheme.name}` : 'No main theme');
        
        if (mainTheme) {
            console.log(`Fetching assets for theme ${mainTheme.id}...`);
            const assetsResp = await axios.get(`${apiBase}/themes/${mainTheme.id}/assets.json`, { headers });
            const assets = Array.isArray(assetsResp.data.assets) ? assetsResp.data.assets : [];
            console.log(`Found ${assets.length} total assets`);
            
            // Log some asset examples for debugging
            const assetExamples = assets.slice(0, 5).map(a => ({ key: a.key, public_url: a.public_url }));
            console.log('Asset examples:', assetExamples);
            
            // More inclusive filtering for theme images
            const themeImageUrls = assets
                .filter(a => {
                    // Check if asset is an image file
                    const isImage = a.key && a.key.match(/\.(png|jpe?g|gif|webp|svg|ico)$/i);
                    return isImage;
                })
                .map(a => {
                    // For theme assets, construct the proper Shopify CDN URL
                    if (a.public_url) {
                        return a.public_url;
                    } else if (a.key) {
                        // Standard Shopify theme asset URL format
                        return `https://${shop}/files/${a.key}`;
                    }
                    return null;
                })
                .filter(url => url !== null);
            
            console.log(`Found ${themeImageUrls.length} theme image URLs`);
            console.log('Theme image examples:', themeImageUrls.slice(0, 3));
            
            // Add all theme images without metadata
            const themeImages = themeImageUrls.map(url => createImageWithoutMetadata(url, 'theme'));
            allImages = allImages.concat(themeImages);
        } else {
            // If no main theme, try to get published theme
            const publishedTheme = Array.isArray(themesResp.data.themes) ? themesResp.data.themes.find(t => t.role === 'published') : null;
            if (publishedTheme) {
                console.log(`No main theme found, using published theme ${publishedTheme.id}`);
                const assetsResp = await axios.get(`${apiBase}/themes/${publishedTheme.id}/assets.json`, { headers });
                const assets = Array.isArray(assetsResp.data.assets) ? assetsResp.data.assets : [];
                
                const themeImageUrls = assets
                    .filter(a => {
                        const isImage = a.key && a.key.match(/\.(png|jpe?g|gif|webp|svg|ico)$/i);
                        return isImage;
                    })
                    .map(a => a.public_url || `https://${shop}/files/${a.key}`)
                    .filter(url => url !== null);
                
                console.log(`Found ${themeImageUrls.length} theme images from published theme`);
                const themeImages = themeImageUrls.map(url => createImageWithoutMetadata(url, 'theme'));
                allImages = allImages.concat(themeImages);
            }
        }
    } catch (e) {
        console.warn('[API Error] Theme assets:', e.message);
        skipped.push('theme');
    }
    // --- 2. Product images ---
    try {
        let nextUrl = `${apiBase}/products.json?limit=250`;
        let productIds = [];
        while (nextUrl) {
            const resp = await axios.get(nextUrl, { headers });
            if (Array.isArray(resp.data.products)) {
                productIds.push(...resp.data.products.map(p => p.id));
                // Pagination: look for Link header
                const link = resp.headers['link'];
                if (link && link.includes('rel="next"')) {
                    const match = link.match(/<([^>]+)>; rel="next"/);
                    nextUrl = match ? match[1] : null;
                } else {
                    nextUrl = null;
                }
            } else {
                nextUrl = null;
            }
        }
        
        console.log(`Found ${productIds.length} products, fetching images...`);
        
        let productImageUrls = [];
        for (const id of productIds) { // Process all products
            try {
                const imgResp = await axios.get(`${apiBase}/products/${id}/images.json`, { headers });
                if (Array.isArray(imgResp.data.images)) {
                    const imageUrls = imgResp.data.images.map(img => img.src).filter(Boolean);
                    productImageUrls = productImageUrls.concat(imageUrls);
                }
            } catch (e) {
                // skip this product
            }
        }
        
        console.log(`Found ${productImageUrls.length} product images`);
        
        // Add all product images without metadata
        const productImages = productImageUrls.map(url => createImageWithoutMetadata(url, 'products'));
        allImages = allImages.concat(productImages);
    } catch (e) {
        console.warn('[API Error] Product images:', e.message);
        skipped.push('products');
    }
    // --- 3. Collection images ---
    try {
        console.log('Fetching collection images...');
        // Helper to fetch all paginated collections (custom or smart)
        async function fetchAllCollections(endpoint) {
            let collections = [];
            let nextUrl = `${apiBase}/${endpoint}.json?fields=id,title,handle,image&limit=250`;
            while (nextUrl) {
                const resp = await axios.get(nextUrl, { headers });
                const key = endpoint === 'custom_collections' ? 'custom_collections' : 'smart_collections';
                if (Array.isArray(resp.data[key])) {
                    collections.push(...resp.data[key]);
                }
                const link = resp.headers['link'];
                if (link && link.includes('rel="next"')) {
                    const match = link.match(/<([^>]+)>; rel="next"/);
                    nextUrl = match ? match[1] : null;
                } else {
                    nextUrl = null;
                }
            }
            return collections;
        }
        // Fetch all custom and smart collections
        const [customCollections, smartCollections] = await Promise.all([
            fetchAllCollections('custom_collections'),
            fetchAllCollections('smart_collections')
        ]);
        const allCollections = [...customCollections, ...smartCollections];
        
        // Only collections with images
        const collectionImages = allCollections
            .filter(c => c.image && c.image.src)
            .map(c => createImageWithoutMetadata(c.image.src, 'collections', {
                collectionId: c.id,
                collectionTitle: c.title,
                collectionType: c.handle ? 'custom' : 'smart'
            }));
        
        allImages = allImages.concat(collectionImages);
        
        console.log(`Found ${collectionImages.length} collection images (custom+smart)`);
        if (collectionImages.length === 0) {
            console.log('ℹ️ No collection images found - collections exist but have no featured images assigned');
        }
    } catch (e) {
        console.warn('[API Error] Collection images:', e.message);
        skipped.push('collections');
    }
    
    // Update final stats
    stats.totalFiles = allImages.length;
    
    console.log('Media fetch completed.');
    console.log(`Total images: ${allImages.length}`);
    console.log('Skipped categories:', skipped);
    console.log('Stats:', stats);
    
    res.json({ 
        images: allImages, 
        skipped,
        stats
    });
});

// --- /api/media/fetch: Alias for /api/media endpoint (for frontend compatibility) ---
app.post('/api/media/fetch', async (req, res) => {
    const { accessToken, shop } = req.body;
    console.log('Media fetch API called for shop:', shop, 'with token:', accessToken ? 'present' : 'missing');
    
    if (!accessToken || !shop) {
        console.log('Missing accessToken or shop in request body');
        return res.status(400).json({ error: 'Missing accessToken or shop' });
    }

    const apiBase = `https://${shop}/admin/api/2023-10`;
    const headers = { 'X-Shopify-Access-Token': accessToken };
    let allImages = [];
    let skipped = [];
    let stats = {
        totalFiles: 0,
        categories: {
            theme: 0,
            products: 0,
            collections: 0
        }
    };
    
    console.log('Starting to fetch media for shop:', shop);
    
    // Helper function to create image object without metadata
    function createImageWithoutMetadata(url, category, additionalData = {}) {
        stats.categories[category]++;
        return {
            url,
            category,
            size: 0,
            sizeFormatted: 'Not checked',
            isLarge: false,
            width: 0,
            height: 0,
            ...additionalData
        };
    }
    
    // Helper function to safely extract domain
    function extractDomain(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return 'unknown';
        }
    }
    
    // --- 1. Theme image assets ---
    try {
        console.log('Fetching themes...');
        const themesResp = await axios.get(`${apiBase}/themes.json`, { headers });
        console.log('Themes response:', themesResp.data.themes?.length, 'themes found');
        
        const mainTheme = Array.isArray(themesResp.data.themes) ? themesResp.data.themes.find(t => t.role === 'main') : null;
        console.log('Main theme found:', mainTheme ? `ID ${mainTheme.id}, Name: ${mainTheme.name}` : 'No main theme');
        
        if (mainTheme) {
            console.log(`Fetching assets for theme ${mainTheme.id}...`);
            const assetsResp = await axios.get(`${apiBase}/themes/${mainTheme.id}/assets.json`, { headers });
            const assets = Array.isArray(assetsResp.data.assets) ? assetsResp.data.assets : [];
            console.log(`Found ${assets.length} total assets`);
            
            // Log some asset examples for debugging
            const assetExamples = assets.slice(0, 5).map(a => ({ key: a.key, public_url: a.public_url }));
            console.log('Asset examples:', assetExamples);
            
            // More inclusive filtering for theme images
            const themeImageUrls = assets
                .filter(a => {
                    // Check if asset is an image file
                    const isImage = a.key && a.key.match(/\.(png|jpe?g|gif|webp|svg|ico)$/i);
                    return isImage;
                })
                .map(a => {
                    // For theme assets, construct the proper Shopify CDN URL
                    if (a.public_url) {
                        return a.public_url;
                    } else if (a.key) {
                        // Standard Shopify theme asset URL format
                        return `https://${shop}/files/${a.key}`;
                    }
                    return null;
                })
                .filter(url => url !== null);
            
            console.log(`Found ${themeImageUrls.length} theme image URLs`);
            console.log('Theme image examples:', themeImageUrls.slice(0, 3));
            
            // Add all theme images without metadata
            const themeImages = themeImageUrls.map(url => createImageWithoutMetadata(url, 'theme'));
            allImages = allImages.concat(themeImages);
        } else {
            // If no main theme, try to get published theme
            const publishedTheme = Array.isArray(themesResp.data.themes) ? themesResp.data.themes.find(t => t.role === 'published') : null;
            if (publishedTheme) {
                console.log(`No main theme found, using published theme ${publishedTheme.id}`);
                const assetsResp = await axios.get(`${apiBase}/themes/${publishedTheme.id}/assets.json`, { headers });
                const assets = Array.isArray(assetsResp.data.assets) ? assetsResp.data.assets : [];
                
                const themeImageUrls = assets
                    .filter(a => {
                        const isImage = a.key && a.key.match(/\.(png|jpe?g|gif|webp|svg|ico)$/i);
                        return isImage;
                    })
                    .map(a => a.public_url || `https://${shop}/files/${a.key}`)
                    .filter(url => url !== null);
                
                console.log(`Found ${themeImageUrls.length} theme images from published theme`);
                const themeImages = themeImageUrls.map(url => createImageWithoutMetadata(url, 'theme'));
                allImages = allImages.concat(themeImages);
            }
        }
    } catch (e) {
        console.warn('[API Error] Theme assets:', e.message);
        skipped.push('theme');
    }
    // Product images
    try {
        let nextUrl = `${apiBase}/products.json?limit=250`;
        let productIds = [];
        while (nextUrl) {
            const resp = await axios.get(nextUrl, { headers });
            if (Array.isArray(resp.data.products)) {
                productIds.push(...resp.data.products.map(p => p.id));
                // Pagination: look for Link header
                const link = resp.headers['link'];
                if (link && link.includes('rel="next"')) {
                    const match = link.match(/<([^>]+)>; rel="next"/);
                    nextUrl = match ? match[1] : null;
                } else {
                    nextUrl = null;
                }
            } else {
                nextUrl = null;
            }
        }
        
        console.log(`Found ${productIds.length} products, fetching images...`);
        
        let productImageUrls = [];
        for (const id of productIds) {
            try {
                const imgResp = await axios.get(`${apiBase}/products/${id}/images.json`, { headers });
                if (Array.isArray(imgResp.data.images)) {
                    const imageUrls = imgResp.data.images.map(img => img.src).filter(Boolean);
                    productImageUrls = productImageUrls.concat(imageUrls);
                }
            } catch (e) {
                // skip this product
            }
        }
        
        const productImages = productImageUrls
            .filter(url => validateImageUrl(url))
            .map(url => createImageWithoutMetadata(url, 'products', {
                domain: extractDomain(url)
            }));
        
        allImages = allImages.concat(productImages);
        console.log(`Found ${productImages.length} product images`);
    } catch (e) {
        console.warn('[API Error] Product images:', e.message);
        skipped.push('products');
    }
    // Collection images
    try {
        async function fetchAllCollections(endpoint) {
            let nextUrl = `${apiBase}/${endpoint}.json?limit=250`;
            const collections = [];
            while (nextUrl) {
                const resp = await axios.get(nextUrl, { headers });
                const key = endpoint === 'custom_collections' ? 'custom_collections' : 'smart_collections';
                if (Array.isArray(resp.data[key])) {
                    collections.push(...resp.data[key]);
                }
                const link = resp.headers['link'];
                if (link && link.includes('rel="next"')) {
                    const match = link.match(/<([^>]+)>; rel="next"/);
                    nextUrl = match ? match[1] : null;
                } else {
                    nextUrl = null;
                }
            }
            return collections;
        }
        
        // Fetch all custom and smart collections
        const [customCollections, smartCollections] = await Promise.all([
            fetchAllCollections('custom_collections'),
            fetchAllCollections('smart_collections')
        ]);
        const allCollections = [...customCollections, ...smartCollections];
        
        // Only collections with images
        const collectionImages = allCollections
            .filter(c => c.image && c.image.src && validateImageUrl(c.image.src))
            .map(c => createImageWithoutMetadata(c.image.src, 'collections', {
                collectionId: c.id,
                collectionTitle: c.title,
                collectionType: c.handle ? 'custom' : 'smart'
            }));
        
        allImages = allImages.concat(collectionImages);
        
        console.log(`Found ${collectionImages.length} collection images`);
    } catch (e) {
        console.warn('[API Error] Collection images:', e.message);
        skipped.push('collections');
    }
    
    // Update final stats
    stats.totalFiles = allImages.length;
    
    console.log('Media fetch completed.');
    console.log(`Total images: ${allImages.length}`);
    console.log('Skipped categories:', skipped);
    console.log('Stats:', stats);
    
    res.json({ 
        success: true,
        images: allImages, 
        skipped,
        stats
    });
});

// --- /api/media/analyze: Re-analyze images with metadata (size, dimensions, optimization analysis) ---
app.post('/api/media/analyze', async (req, res) => {
    const { accessToken, shop, images } = req.body;
    console.log('Media analyze API called for shop:', shop, 'with', images ? images.length : 0, 'images');
    
    if (!accessToken || !shop || !images) {
        return res.status(400).json({ error: 'Missing accessToken, shop, or images' });
    }

    try {
        const analyzedImages = await Promise.all(images.map(async (image, index) => {
            try {
                // Download image to get metadata
                const response = await axios.get(image.url, {
                    responseType: 'arraybuffer',
                    timeout: 5000
                });
                
                const buffer = Buffer.from(response.data);
                const dimensions = (sizeOf.imageSize || sizeOf.default || sizeOf)(buffer);
                const sizeInBytes = buffer.length;
                
                // Determine image type based on category
                let imageType = 'product'; // default
                if (image.category === 'collections') {
                    imageType = 'collection';
                } else if (image.category === 'theme') {
                    // For theme images, try to guess type from filename/path
                    const url = image.url.toLowerCase();
                    if (url.includes('banner') || url.includes('hero') || url.includes('slider')) {
                        imageType = 'banner';
                    } else if (url.includes('thumb') || url.includes('icon') || url.includes('logo')) {
                        imageType = 'thumbnail';
                    } else {
                        imageType = 'banner'; // default for theme images
                    }
                }
                
                // Calculate if image is "large" (>1MB)
                const isLarge = sizeInBytes > 1048576;
                
                // Calculate aspect ratio
                const aspectRatio = dimensions.width && dimensions.height ? 
                    (dimensions.width / dimensions.height).toFixed(2) : 'unknown';
                
                // Infer file type from URL extension
                const inferTypeFromUrl = (url) => {
                    const match = url.match(/\.([^.?]+)(?:\?|$)/);
                    if (match) {
                        const extension = match[1].toLowerCase();
                        const typeMap = {
                            'jpg': 'JPEG',
                            'jpeg': 'JPEG',
                            'png': 'PNG',
                            'gif': 'GIF',
                            'webp': 'WebP',
                            'svg': 'SVG',
                            'bmp': 'BMP',
                            'tiff': 'TIFF',
                            'tif': 'TIFF',
                            'ico': 'ICO',
                            'avif': 'AVIF'
                        };
                        return typeMap[extension] || extension.toUpperCase();
                    }
                    return 'UNKNOWN';
                };
                
                // Enhanced image analysis object
                const enhancedImage = {
                    ...image,
                    size: sizeInBytes,
                    sizeFormatted: formatFileSize(sizeInBytes),
                    width: dimensions.width,
                    height: dimensions.height,
                    isLarge: isLarge,
                    type: dimensions.type ? dimensions.type.toUpperCase() : inferTypeFromUrl(image.url),
                    imageType: imageType,
                    aspectRatio: aspectRatio,
                    totalPixels: dimensions.width * dimensions.height
                };
                
                // Use image calculator for optimization analysis
                const optimizationAnalysis = imageCalculator.calculateImageSavings(enhancedImage);
                
                return {
                    ...enhancedImage,
                    oversized: optimizationAnalysis.totalSavings > 0,
                    oversizeReasons: optimizationAnalysis.recommendations.map(r => r.description)
                };
            } catch (error) {
                console.warn(`Failed to analyze image ${index}:`, error.message);
                
                // Infer file type from URL extension even on error
                const inferTypeFromUrl = (url) => {
                    const match = url.match(/\.([^.?]+)(?:\?|$)/);
                    if (match) {
                        const extension = match[1].toLowerCase();
                        const typeMap = {
                            'jpg': 'JPEG',
                            'jpeg': 'JPEG',
                            'png': 'PNG',
                            'gif': 'GIF',
                            'webp': 'WebP',
                            'svg': 'SVG',
                            'bmp': 'BMP',
                            'tiff': 'TIFF',
                            'tif': 'TIFF',
                            'ico': 'ICO',
                            'avif': 'AVIF'
                        };
                        return typeMap[extension] || extension.toUpperCase();
                    }
                    return 'UNKNOWN';
                };
                
                return {
                    ...image,
                    size: 0,
                    sizeFormatted: 'Unknown',
                    width: 0,
                    height: 0,
                    isLarge: false,
                    type: inferTypeFromUrl(image.url),
                    imageType: 'product',
                    aspectRatio: 'unknown',
                    totalPixels: 0,
                    oversized: false,
                    oversizeReasons: []
                };
            }
        }));
        
        console.log(`Analyzed ${analyzedImages.length} images`);
        
        res.json({
            success: true,
            images: analyzedImages
        });
    } catch (error) {
        console.error('Error analyzing images:', error);
        res.status(500).json({ error: 'Failed to analyze images' });
    }
});

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Check if file is an image
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// --- /api/media/replace: Replace any Shopify image (product, collection, asset, or theme file) ---
app.post('/api/media/replace', upload.single('image'), async (req, res) => {
    const { shop, accessToken, originalUrl, category } = req.body;
    
    console.log('Media replace API called for shop:', shop);
    console.log('Original URL:', originalUrl);
    console.log('Category:', category);
    
    if (!accessToken || !shop || !originalUrl || !req.file) {
        return res.status(400).json({ error: 'Missing required fields: accessToken, shop, originalUrl, or image file' });
    }

    try {
        const processedBuffer = req.file.buffer;
        const processedSize = req.file.size;
        const apiBase = `https://${shop}/admin/api/2023-10`;
        const headers = { 'X-Shopify-Access-Token': accessToken };
        
        // Get image dimensions
        const dimensions = (sizeOf.imageSize || sizeOf.default || sizeOf)(processedBuffer);
        
        console.log(`Replacing ${category} image: ${originalUrl}`);
        console.log(`New image size: ${processedSize} bytes, dimensions: ${dimensions.width}x${dimensions.height}`);
        
        // Step 1: Detect image type and handle accordingly
        const imageType = detectImageType(originalUrl, category);
        console.log('Detected image type:', imageType);
        
        let result;
        switch (imageType.type) {
            case 'product':
                result = await replaceProductImage(shop, accessToken, originalUrl, processedBuffer, imageType, headers, apiBase);
                break;
            case 'collection':
                result = await replaceCollectionImage(shop, accessToken, originalUrl, processedBuffer, imageType, headers, apiBase);
                break;
            case 'theme':
                result = await replaceThemeAsset(shop, accessToken, originalUrl, processedBuffer, imageType, headers, apiBase);
                break;
            case 'file':
                result = await replaceShopifyFile(shop, accessToken, originalUrl, processedBuffer, imageType, headers, apiBase);
                break;
            default:
                throw new Error(`Unsupported image type: ${imageType.type}`);
        }
        
        res.json({
            success: true,
            newUrl: result.newUrl,
            size: processedSize,
            width: dimensions.width,
            height: dimensions.height,
            originalSize: processedSize,
            optimized: false,
            savings: 0,
            imageType: imageType.type,
            resourceId: result.resourceId,
            message: `${imageType.type} image replaced successfully`
        });
        
    } catch (error) {
        console.error('Error replacing image:', error);
        res.status(500).json({ error: 'Failed to replace image: ' + error.message });
    }
});

// Utility function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get Shopify API key (safe to expose)
app.get('/api/config', (req, res) => {
    res.json({
        apiKey: SHOPIFY_API_KEY
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        shopify_api_key: SHOPIFY_API_KEY ? 'configured' : 'missing'
    });
});

// Shopify app installation endpoint (handles initial app installation)
app.get('/', (req, res) => {
    const { shop, hmac, timestamp, host } = req.query;
    
    // If this is a Shopify app installation request
    if (shop && hmac) {
        console.log('Shopify app installation request detected:', { shop, hmac, timestamp });
        
        // Validate required environment variables
        if (!SHOPIFY_API_KEY) {
            console.error('Missing SHOPIFY_API_KEY environment variable');
            return res.status(500).send('Server configuration error: Missing API key');
        }
        
        // Generate OAuth URL for Shopify installation
        const scopes = SHOPIFY_SCOPES;
        const redirectUri = 'https://app.wearespree.com/auth/callback';
        const state = Math.random().toString(36).substring(7); // Generate random state
        
        const authUrl = `https://${shop}/admin/oauth/authorize?` + 
            `client_id=${SHOPIFY_API_KEY}&` +
            `scope=${encodeURIComponent(scopes)}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `state=${state}`;
        
        console.log('Generated OAuth URL:', authUrl);
        console.log('OAuth URL components:', {
            shop,
            client_id: SHOPIFY_API_KEY,
            scope: scopes,
            redirect_uri: redirectUri,
            state
        });
        
        // Redirect to Shopify OAuth
        return res.redirect(authUrl);
    }
    
    // Otherwise serve the normal index.html
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Custom app installation endpoint
app.get('/install', (req, res) => {
    const { shop } = req.query;
    
    if (!shop) {
        return res.status(400).send('Missing shop parameter. Please access this via the Partner Portal installation link.');
    }
    
    console.log('Custom app installation request for shop:', shop);
    
    // Validate required environment variables
    if (!SHOPIFY_API_KEY) {
        console.error('Missing SHOPIFY_API_KEY environment variable');
        return res.status(500).send('Server configuration error: Missing API key');
    }
    
    // Generate OAuth URL for custom app installation (without no_redirect)
    const scopes = SHOPIFY_SCOPES;
    const redirectUri = 'https://app.wearespree.com/auth/callback';
    const state = Math.random().toString(36).substring(7);
    
    const authUrl = `https://${shop}/admin/oauth/authorize?` + 
        `client_id=${SHOPIFY_API_KEY}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${state}`;
    
    console.log('Generated OAuth URL:', authUrl);
    console.log('OAuth URL components:', {
        shop,
        client_id: SHOPIFY_API_KEY,
        scope: scopes,
        redirect_uri: redirectUri,
        state
    });
    
    // Redirect to Shopify OAuth
    res.redirect(authUrl);
});

// Serve static files (CSS, JS, images, etc.)
app.use(express.static('.'));

// Serve index.html for all other routes (SPA support) - this must be last
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Shopify Media Manager available at: https://app.wearespree.com`);
    console.log(`🔧 API endpoints available at: https://app.wearespree.com/api/`);
    console.log(`📋 Health check: https://app.wearespree.com/api/health`);
    console.log(`🔑 Shopify API Key: ${SHOPIFY_API_KEY ? 'Configured' : 'Not configured'}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Helper function to construct proper Shopify theme asset URLs
function getThemeAssetUrl(shop, themeId, assetKey) {
    // Remove .myshopify.com if present to get the store handle
    const storeHandle = shop.replace('.myshopify.com', '');
    
    // Check if assetKey already contains "assets/" prefix and remove it
    const assetPath = assetKey.startsWith('assets/') ? assetKey.substring(7) : assetKey;
    
    // For theme assets, we need to request the asset content to get the public URL
    // But for now, let's use the asset key to construct a publicly accessible URL
    // The correct format is through the store's public theme assets
    return `https://${storeHandle}.myshopify.com/assets/${assetPath}`;
}

// Helper function to validate and fix image URLs
function validateImageUrl(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }
    
    // Check if it's already a valid HTTP/HTTPS URL
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
    } catch (e) {
        return null;
    }
}

// Validate Shopify access token
app.post('/api/validate-token', async (req, res) => {
    const { shop, accessToken } = req.body;
    if (!shop || !accessToken) {
        return res.status(400).json({ error: 'Missing shop or accessToken', valid: false });
    }
    
    try {
        // Try to fetch shop info to validate the token
        const response = await axios.get(`https://${shop}/admin/api/2023-10/shop.json`, {
            headers: { 'X-Shopify-Access-Token': accessToken },
            timeout: 10000
        });
        
        if (response.data && response.data.shop) {
            res.json({ valid: true, shop: response.data.shop });
        } else {
            res.json({ valid: false, error: 'Invalid response from Shopify' });
        }
    } catch (error) {
        console.error('Token validation error:', error.response?.data || error.message);
        
        // Check if it's an authentication error
        if (error.response?.status === 401 || error.response?.status === 403) {
            res.json({ valid: false, error: 'Invalid or expired token' });
        } else {
            res.json({ valid: false, error: 'Token validation failed' });
        }
    }
});

// --- DEBUG: /api/debug/collections: Inspect collection data structure ---
app.post('/api/debug/collections', async (req, res) => {
    const { accessToken, shop } = req.body;
    if (!accessToken || !shop) return res.status(400).json({ error: 'Missing accessToken or shop' });
    const apiBase = `https://${shop}/admin/api/2023-10`;
    const headers = { 'X-Shopify-Access-Token': accessToken };
    
    try {
        console.log('DEBUG: Collections data structure for shop:', shop);
        
        // Fetch first few custom collections for debugging
        const customResp = await axios.get(`${apiBase}/custom_collections.json?limit=5`, { headers });
        console.log('DEBUG: Custom collections response:', JSON.stringify(customResp.data, null, 2));
        
        // Fetch first few smart collections for debugging
        const smartResp = await axios.get(`${apiBase}/smart_collections.json?limit=5`, { headers });
        console.log('DEBUG: Smart collections response:', JSON.stringify(smartResp.data, null, 2));
        
        res.json({
            custom_collections: customResp.data.custom_collections || [],
            smart_collections: smartResp.data.smart_collections || []
        });
        
    } catch (e) {
        console.error('DEBUG: Collections error:', e.message);
        res.status(500).json({ error: 'Failed to fetch collections' });
    }
});

// --- /api/image-details: Get detailed metadata for specific images ---
app.post('/api/image-details', async (req, res) => {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: 'Missing urls array' });
    }
    
    console.log(`Getting detailed metadata for ${urls.length} images`);
    
    try {
        const imageDetails = await Promise.all(
            urls.map(async (url) => {
                try {
                    // Get file size
                    const headResponse = await axios.head(url, { timeout: 10000 });
                    const size = parseInt(headResponse.headers['content-length']) || 0;
                    const isLarge = size > 1024 * 1024; // > 1MB
                    
                    // Get dimensions
                    const dimensions = await getImageDimensions(url);
                    
                    return {
                        url,
                        size,
                        sizeFormatted: formatFileSize(size),
                        isLarge,
                        width: dimensions.width,
                        height: dimensions.height,
                        type: dimensions.type,
                        aspectRatio: dimensions.width && dimensions.height ? 
                            (dimensions.width / dimensions.height).toFixed(2) : 'unknown'
                    };
                } catch (error) {
                    console.warn(`Failed to get details for ${url}:`, error.message);
                    return {
                        url,
                        size: 0,
                        sizeFormatted: 'Unknown',
                        isLarge: false,
                        width: 0,
                        height: 0,
                        type: 'unknown',
                        aspectRatio: 'unknown',
                        error: error.message
                    };
                }
            })
        );
        
        res.json({ images: imageDetails });
    } catch (error) {
        console.error('Error getting image details:', error.message);
        res.status(500).json({ error: 'Failed to get image details', details: error.message });
    }
});

// Debug endpoint to inspect theme assets
app.post('/api/debug/theme-assets', async (req, res) => {
    const { accessToken, shop } = req.body;
    
    if (!accessToken || !shop) {
        return res.status(400).json({ error: 'Missing accessToken or shop' });
    }
    
    const apiBase = `https://${shop}/admin/api/2023-10`;
    const headers = { 'X-Shopify-Access-Token': accessToken };
    
    try {
        // Get themes
        const themesResp = await axios.get(`${apiBase}/themes.json`, { headers });
        const themes = themesResp.data.themes || [];
        
        console.log('All themes:', themes.map(t => ({ id: t.id, name: t.name, role: t.role })));
        
        const mainTheme = themes.find(t => t.role === 'main') || themes.find(t => t.role === 'published') || themes[0];
        
        if (!mainTheme) {
            return res.json({ error: 'No theme found', themes });
        }
        
        // Get assets for the theme
        const assetsResp = await axios.get(`${apiBase}/themes/${mainTheme.id}/assets.json`, { headers });
        const assets = assetsResp.data.assets || [];
        
        const imageAssets = assets.filter(a => a.key && a.key.match(/\.(png|jpe?g|gif|webp|svg|ico)$/i));
        
        // Sample some assets to see their structure
        const assetSamples = imageAssets.slice(0, 10).map(a => ({
            key: a.key,
            public_url: a.public_url,
            content_type: a.content_type,
            size: a.size,
            theme_store_id: a.theme_store_id
        }));
        
        res.json({
            theme: { id: mainTheme.id, name: mainTheme.name, role: mainTheme.role },
            totalAssets: assets.length,
            imageAssets: imageAssets.length,
            samples: assetSamples,
            shopUrl: shop
        });
        
    } catch (error) {
        console.error('Debug error:', error.message);
        res.status(500).json({ error: error.message, details: error.response?.data });
    }
});

// --- Optimization Calculation Endpoints ---

// Calculate savings for all images
app.post('/api/optimization/calculate', async (req, res) => {
    const { images } = req.body;
    
    if (!images || !Array.isArray(images)) {
        return res.status(400).json({ error: 'Missing or invalid images array' });
    }
    
    // Limit the number of images to process to avoid 413 errors
    const MAX_IMAGES = 100;
    const imagesToProcess = images.slice(0, MAX_IMAGES);
    
    try {
        console.log(`Calculating optimization savings for ${imagesToProcess.length} images (limited from ${images.length})`);
        
        // Process images in smaller chunks to avoid memory issues
        const CHUNK_SIZE = 25;
        const chunks = [];
        
        for (let i = 0; i < imagesToProcess.length; i += CHUNK_SIZE) {
            chunks.push(imagesToProcess.slice(i, i + CHUNK_SIZE));
        }
        
        let totalOptimizationResult = {
            summary: {
                totalImages: 0,
                optimizableImages: 0,
                totalSavings: 0,
                totalSavingsPercent: 0,
                compressionSavings: 0,
                resizeSavings: 0,
                resizableImages: 0,
                formattedSavings: '0 MB'
            },
            images: []
        };
        
        // Process each chunk
        for (const chunk of chunks) {
            const chunkResult = imageCalculator.calculateTotalSavings(chunk);
            
            // Merge results
            totalOptimizationResult.summary.totalImages += chunkResult.summary.totalImages;
            totalOptimizationResult.summary.optimizableImages += chunkResult.summary.optimizableImages;
            totalOptimizationResult.summary.totalSavings += chunkResult.summary.totalSavings;
            totalOptimizationResult.summary.compressionSavings += chunkResult.summary.compressionSavings;
            totalOptimizationResult.summary.resizeSavings += chunkResult.summary.resizeSavings;
            totalOptimizationResult.summary.resizableImages += chunkResult.summary.resizableImages;
            totalOptimizationResult.images.push(...chunkResult.images);
        }
        
        // Recalculate percentages and formatted strings
        if (totalOptimizationResult.summary.totalImages > 0) {
            totalOptimizationResult.summary.totalSavingsPercent = Math.round(
                (totalOptimizationResult.summary.totalSavings / 
                 totalOptimizationResult.images.reduce((sum, img) => sum + (img.originalSize || 0), 0)) * 100
            );
            
            const totalSavingsMB = totalOptimizationResult.summary.totalSavings / (1024 * 1024);
            totalOptimizationResult.summary.formattedSavings = `${totalSavingsMB.toFixed(2)} MB`;
        }
        
        console.log(`Optimization calculation complete: ${totalOptimizationResult.summary.formattedSavings} potential savings`);
        
        res.json({
            success: true,
            optimization: totalOptimizationResult,
            processed: imagesToProcess.length,
            total: images.length,
            limited: images.length > MAX_IMAGES
        });
        
    } catch (error) {
        console.error('Error calculating optimization savings:', error.message);
        res.status(500).json({ error: 'Failed to calculate optimization savings', details: error.message });
    }
});

// Get optimization settings
app.get('/api/optimization/settings', (req, res) => {
    try {
        const settings = imageCalculator.getOptimizationSettings();
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error getting optimization settings:', error.message);
        res.status(500).json({ error: 'Failed to get optimization settings', details: error.message });
    }
});

// --- Image Replacement Helper Functions ---

// Step 1: Detect image type (product, collection, file, theme asset)
function detectImageType(url, category) {
    console.log(`Detecting image type for URL: ${url}, category: ${category}`);
    
    // Parse URL to extract information
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Product images: /products/{product_id}/images/{image_id}
    if (pathname.includes('/products/') && pathname.includes('/images/')) {
        const productMatch = pathname.match(/\/products\/(\d+)/);
        const imageMatch = pathname.match(/\/images\/(\d+)/);
        return {
            type: 'product',
            productId: productMatch ? productMatch[1] : null,
            imageId: imageMatch ? imageMatch[1] : null
        };
    }
    
    // Collection images: /collections/{collection_id}
    if (pathname.includes('/collections/') || category === 'collections') {
        const collectionMatch = pathname.match(/\/collections\/(.+?)\//);
        return {
            type: 'collection',
            collectionHandle: collectionMatch ? collectionMatch[1] : null
        };
    }
    
    // Theme assets: /t/{theme_id}/assets/ or /assets/
    if (pathname.includes('/t/') && pathname.includes('/assets/')) {
        const themeMatch = pathname.match(/\/t\/(\d+)/);
        const assetMatch = pathname.match(/\/assets\/(.+)$/);
        return {
            type: 'theme',
            themeId: themeMatch ? themeMatch[1] : null,
            assetKey: assetMatch ? `assets/${assetMatch[1]}` : null
        };
    }
    
    // Generic files: /files/
    if (pathname.includes('/files/')) {
        const fileMatch = pathname.match(/\/files\/(.+)$/);
        return {
            type: 'file',
            fileName: fileMatch ? fileMatch[1] : null
        };
    }
    
    // Default to product if category suggests it
    if (category === 'products') {
        return { type: 'product', productId: null, imageId: null };
    }
    
    // Default to theme if category suggests it
    if (category === 'theme') {
        return { type: 'theme', themeId: null, assetKey: null };
    }
    
    // Fallback to file type
    return { type: 'file', fileName: null };
}

// Step 2: Replace product image
async function replaceProductImage(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing product image...');
    
    try {
        // If we have specific product/image IDs, use them
        if (imageType.productId && imageType.imageId) {
            console.log(`Updating product ${imageType.productId} image ${imageType.imageId}`);
            
            // Convert buffer to base64
            const base64Image = imageBuffer.toString('base64');
            const mimeType = 'image/jpeg'; // Default, could be detected
            
            // Update the existing product image
            const updateResponse = await axios.put(
                `${apiBase}/products/${imageType.productId}/images/${imageType.imageId}.json`,
                {
                    image: {
                        attachment: base64Image,
                        filename: `updated_${Date.now()}.jpg`
                    }
                },
                { headers }
            );
            
            return {
                newUrl: updateResponse.data.image.src,
                resourceId: updateResponse.data.image.id
            };
        } else {
            // Need to find the product by searching for the image URL
            const product = await findProductByImageUrl(originalUrl, headers, apiBase);
            if (product) {
                console.log(`Found product ${product.productId} with image ${product.imageId}`);
                
                const base64Image = imageBuffer.toString('base64');
                const updateResponse = await axios.put(
                    `${apiBase}/products/${product.productId}/images/${product.imageId}.json`,
                    {
                        image: {
                            attachment: base64Image,
                            filename: `updated_${Date.now()}.jpg`
                        }
                    },
                    { headers }
                );
                
                return {
                    newUrl: updateResponse.data.image.src,
                    resourceId: updateResponse.data.image.id
                };
            } else {
                throw new Error('Could not find product for image URL');
            }
        }
    } catch (error) {
        console.error('Error replacing product image:', error.message);
        throw error;
    }
}

// Step 3: Replace collection image
async function replaceCollectionImage(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing collection image...');
    
    try {
        // Find the collection by searching
        const collection = await findCollectionByImageUrl(originalUrl, headers, apiBase);
        if (!collection) {
            throw new Error('Could not find collection for image URL');
        }
        
        console.log(`Found collection ${collection.id} (${collection.type})`);
        
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');
        
        // Update collection image
        const endpoint = collection.type === 'custom' ? 'custom_collections' : 'smart_collections';
        const updateResponse = await axios.put(
            `${apiBase}/${endpoint}/${collection.id}.json`,
            {
                [collection.type === 'custom' ? 'custom_collection' : 'smart_collection']: {
                    id: collection.id,
                    image: {
                        attachment: base64Image,
                        filename: `collection_${Date.now()}.jpg`
                    }
                }
            },
            { headers }
        );
        
        const updatedCollection = collection.type === 'custom' 
            ? updateResponse.data.custom_collection 
            : updateResponse.data.smart_collection;
        
        return {
            newUrl: updatedCollection.image.src,
            resourceId: updatedCollection.id
        };
    } catch (error) {
        console.error('Error replacing collection image:', error.message);
        throw error;
    }
}

// Step 4: Replace theme asset
async function replaceThemeAsset(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing theme asset...');
    
    try {
        // Get the main theme
        const themesResponse = await axios.get(`${apiBase}/themes.json`, { headers });
        const mainTheme = themesResponse.data.themes.find(t => t.role === 'main') || 
                           themesResponse.data.themes.find(t => t.role === 'published');
        
        if (!mainTheme) {
            throw new Error('No main theme found');
        }
        
        // Determine asset key
        let assetKey = imageType.assetKey;
        if (!assetKey) {
            // Extract from URL
            const urlObj = new URL(originalUrl);
            const pathname = urlObj.pathname;
            const assetMatch = pathname.match(/\/assets\/(.+)$/);
            if (assetMatch) {
                assetKey = `assets/${assetMatch[1].split('?')[0]}`; // Remove query params
            } else {
                throw new Error('Could not determine asset key from URL');
            }
        }
        
        console.log(`Updating theme ${mainTheme.id} asset ${assetKey}`);
        
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');
        
        // Update theme asset
        const updateResponse = await axios.put(
            `${apiBase}/themes/${mainTheme.id}/assets.json`,
            {
                asset: {
                    key: assetKey,
                    attachment: base64Image
                }
            },
            { headers }
        );
        
        return {
            newUrl: updateResponse.data.asset.public_url || originalUrl,
            resourceId: mainTheme.id
        };
    } catch (error) {
        console.error('Error replacing theme asset:', error.message);
        throw error;
    }
}

// Step 5: Replace Shopify file
async function replaceShopifyFile(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing Shopify file...');
    
    try {
        // For files, we need to create a new file since Shopify doesn't allow direct file replacement
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');
        
        // Generate a unique filename
        const timestamp = Date.now();
        const originalFileName = imageType.fileName || `replaced_${timestamp}.jpg`;
        const newFileName = `replaced_${timestamp}_${originalFileName}`;
        
        // Create new file
        const createResponse = await axios.post(
            `${apiBase}/assets.json`,
            {
                asset: {
                    key: `assets/${newFileName}`,
                    attachment: base64Image
                }
            },
            { headers }
        );
        
        return {
            newUrl: createResponse.data.asset.public_url,
            resourceId: createResponse.data.asset.key
        };
    } catch (error) {
        console.error('Error replacing Shopify file:', error.message);
        throw error;
    }
}

// Helper: Find product by image URL
async function findProductByImageUrl(imageUrl, headers, apiBase) {
    console.log('Searching for product by image URL...');
    
    try {
        let page = 1;
        const limit = 50;
        
        while (page <= 10) { // Limit search to prevent infinite loops
            const response = await axios.get(
                `${apiBase}/products.json?limit=${limit}&page=${page}&fields=id,images`,
                { headers }
            );
            
            const products = response.data.products || [];
            if (products.length === 0) break;
            
            for (const product of products) {
                if (product.images) {
                    for (const image of product.images) {
                        if (image.src === imageUrl) {
                            return {
                                productId: product.id,
                                imageId: image.id
                            };
                        }
                    }
                }
            }
            
            page++;
        }
        
        return null;
    } catch (error) {
        console.error('Error finding product by image URL:', error.message);
        return null;
    }
}

// Helper: Find collection by image URL
async function findCollectionByImageUrl(imageUrl, headers, apiBase) {
    console.log('Searching for collection by image URL...');
    
    try {
        // Search custom collections
        const customResponse = await axios.get(
            `${apiBase}/custom_collections.json?limit=250`,
            { headers }
        );
        
        const customCollections = customResponse.data.custom_collections || [];
        for (const collection of customCollections) {
            if (collection.image && collection.image.src === imageUrl) {
                return {
                    id: collection.id,
                    type: 'custom'
                };
            }
        }
        
        // Search smart collections
        const smartResponse = await axios.get(
            `${apiBase}/smart_collections.json?limit=250`,
            { headers }
        );
        
        const smartCollections = smartResponse.data.smart_collections || [];
        for (const collection of smartCollections) {
            if (collection.image && collection.image.src === imageUrl) {
                return {
                    id: collection.id,
                    type: 'smart'
                };
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding collection by image URL:', error.message);
        return null;
    }
}