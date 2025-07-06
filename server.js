const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sizeOf = require('image-size');
const imageCalculator = require('./image-calculator');
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
app.use(express.json());

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
        const dimensions = sizeOf(buffer);
        
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
            type: 'unknown',
            aspectRatio: 'unknown',
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
        console.warn('Full error:', e.response?.data || e);
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

// Helper to fetch paginated Shopify endpoints with cache-busting and exponential backoff
// Hardened: only 1 retry (2 total attempts), no exponential backoff
async function fetchAllWithBackoff(endpoint, key, accessToken, shop, maxRetries = 1) {
    let results = [];
    let page = 1;
    let hasMore = true;
    let partial = false;
    while (hasMore) {
        let retries = 0;
        let delay = 1000;
        while (retries < 2) { // Only 1 retry
            try {
                const resp = await axios.get(`https://${shop}/admin/api/2023-10${endpoint}`, {
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    params: { limit: 250, page }
                });
                const items = resp.data[key] || [];
                results = results.concat(items);
                hasMore = items.length === 250;
                page++;
                // Memory check after each page
                const mem = process.memoryUsage();
                if (mem.rss > 500 * 1024 * 1024) {
                    console.error('[Memory] Exceeded 500MB RSS, aborting to prevent server kill. Returning partial results.');
                    partial = true;
                    hasMore = false;
                    break;
                }
                break;
            } catch (err) {
                if (err.response && err.response.status === 429) {
                    retries++;
                    if (retries >= 2) {
                        console.warn(`[429] Skipping page after 1 retry:`, endpoint);
                        break;
                    }
                    await new Promise(res => setTimeout(res, delay));
                } else {
                    console.error(`[API Error] Fetching ${endpoint}:`, err.message);
                    hasMore = false;
                    break;
                }
            }
        }
        if (retries === 2) {
            partial = true;
            console.error(`[RateLimit] Max retries reached for ${endpoint}. Partial results returned.`);
            break;
        }
    }
    return { results, partial };
}

// Utility: limit concurrency for async functions
function withConcurrencyLimit(limit, items, asyncFn) {
    let idx = 0;
    let active = 0;
    let results = [];
    return new Promise((resolve, reject) => {
        function next() {
            if (idx === items.length && active === 0) return resolve(results);
            while (active < limit && idx < items.length) {
                const i = idx++;
                active++;
                asyncFn(items[i], i)
                    .then(r => results[i] = r)
                    .catch(e => results[i] = null)
                    .finally(() => {
                        active--;
                        next();
                    });
            }
        }
        next();
    });
}

// Global catch for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Utility: Check if asset is an image by extension
function isImageAsset(key) {
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(key);
}

// --- /api/media/theme-assets: Return all theme image asset URLs (simple, no detail fetch) ---
app.post('/api/media/theme-assets', async (req, res) => {
    const { accessToken, shop } = req.body;
    if (!accessToken || !shop) return res.status(400).json({ error: 'Missing accessToken or shop' });
    const apiBase = `https://${shop}/admin/api/2023-10`;
    const headers = { 'X-Shopify-Access-Token': accessToken };
    try {
        // Get main theme ID
        const themesResp = await axios.get(`${apiBase}/themes.json`, { headers });
        const mainTheme = Array.isArray(themesResp.data.themes) ? themesResp.data.themes.find(t => t.role === 'main') : null;
        if (!mainTheme) return res.json({ images: [] });
        // Get all assets for the main theme
        const assetsResp = await axios.get(`${apiBase}/themes/${mainTheme.id}/assets.json`, { headers });
        const assets = Array.isArray(assetsResp.data.assets) ? assetsResp.data.assets : [];
        // Only return assets with public_url and image extension
        const imageUrls = assets.filter(a => a.public_url && /\.(jpe?g|png|webp|gif|svg)$/i.test(a.key)).map(a => a.public_url);
        res.json({ images: imageUrls });
    } catch (err) {
        console.error('Theme assets error:', err.message);
        res.status(500).json({ error: 'Failed to fetch theme image assets' });
    }
});

// --- /api/media/products: Return all product image URLs (simple) ---
app.post('/api/media/products', async (req, res) => {
    const { accessToken, shop } = req.body;
    if (!accessToken || !shop) return res.status(400).json({ error: 'Missing accessToken or shop' });
    const apiBase = `https://${shop}/admin/api/2023-10`;
    const headers = { 'X-Shopify-Access-Token': accessToken };
    try {
        let nextUrl = `${apiBase}/products.json?fields=id&limit=250`;
        let productIds = [];
        while (nextUrl) {
            const resp = await axios.get(nextUrl, { headers });
            if (Array.isArray(resp.data.products)) {
                productIds.push(...resp.data.products.map(p => p.id));
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
        let imageUrls = [];
        for (const pid of productIds) {
            const url = `${apiBase}/products/${pid}/images.json?fields=src`;
            try {
                const resp = await axios.get(url, { headers });
                if (Array.isArray(resp.data.images)) {
                    imageUrls.push(...resp.data.images.map(img => img.src).filter(Boolean));
                }
            } catch (e) {}
        }
        res.json({ images: imageUrls });
    } catch (e) {
        console.error('Products error:', e.message);
        res.json({ images: [] });
    }
});

// --- /api/media/collections: Return all collection image URLs (with improved logic) ---
app.post('/api/media/collections', async (req, res) => {
    const { accessToken, shop } = req.body;
    if (!accessToken || !shop) return res.status(400).json({ error: 'Missing accessToken or shop' });
    const apiBase = `https://${shop}/admin/api/2023-10`;
    const headers = { 'X-Shopify-Access-Token': accessToken };
    
    try {
        console.log('Collections API called for shop:', shop);
        const collectionImages = [];
        
        // Fetch custom collections
        console.log('Fetching custom collections...');
        let nextUrl = `${apiBase}/custom_collections.json?limit=250`;
        while (nextUrl) {
            try {
                const resp = await axios.get(nextUrl, { headers });
                console.log('Custom collections response status:', resp.status);
                
                if (resp.data.custom_collections && Array.isArray(resp.data.custom_collections)) {
                    console.log(`Found ${resp.data.custom_collections.length} custom collections`);
                    
                    for (const collection of resp.data.custom_collections) {
                        if (collection.image && collection.image.src) {
                            collectionImages.push(collection.image.src);
                        }
                    }
                    
                    // Check for pagination
                    const link = resp.headers['link'];
                    if (link && link.includes('rel="next"')) {
                        const match = link.match(/<([^>]+)>; rel="next"/);
                        nextUrl = match ? match[1] : null;
                    } else {
                        nextUrl = null;
                    }
                } else {
                    console.log('No custom collections data in response:', resp.data);
                    nextUrl = null;
                }
            } catch (error) {
                console.error('Error fetching custom collections:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                    console.error('Response status:', error.response.status);
                }
                nextUrl = null;
            }
        }
        
        // Fetch smart collections
        console.log('Fetching smart collections...');
        nextUrl = `${apiBase}/smart_collections.json?limit=250`;
        while (nextUrl) {
            try {
                const resp = await axios.get(nextUrl, { headers });
                console.log('Smart collections response status:', resp.status);
                
                if (resp.data.smart_collections && Array.isArray(resp.data.smart_collections)) {
                    console.log(`Found ${resp.data.smart_collections.length} smart collections`);
                    
                    for (const collection of resp.data.smart_collections) {
                        if (collection.image && collection.image.src) {
                            collectionImages.push(collection.image.src);
                        }
                    }
                    
                    // Check for pagination
                    const link = resp.headers['link'];
                    if (link && link.includes('rel="next"')) {
                        const match = link.match(/<([^>]+)>; rel="next"/);
                        nextUrl = match ? match[1] : null;
                    } else {
                        nextUrl = null;
                    }
                } else {
                    console.log('No smart collections data in response:', resp.data);
                    nextUrl = null;
                }
            } catch (error) {
                console.error('Error fetching smart collections:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                    console.error('Response status:', error.response.status);
                }
                nextUrl = null;
            }
        }
        
        console.log(`Total collection images found: ${collectionImages.length}`);
        
        if (collectionImages.length === 0) {
            console.log('ℹ️ No collection images found. This is normal - many stores don\'t assign images to collections.');
            console.log('📊 Collections summary:', {
                custom_collections_count: collectionImages.filter(img => img.includes('custom')).length,
                smart_collections_count: collectionImages.filter(img => img.includes('smart')).length,
                note: 'Collections exist but have no assigned featured images'
            });
        }
        
        res.json({ 
            images: collectionImages,
            summary: {
                collections_found: collectionImages.length,
                message: collectionImages.length === 0 ? 
                    'No collection images found. Collections exist but have no assigned featured images.' : 
                    `Found ${collectionImages.length} collection images`
            }
        });
        
    } catch (e) {
        console.error('Collections error:', e.message);
        res.status(500).json({ error: 'Failed to fetch collection images', details: e.message });
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
        res.status(500).json({ error: 'Failed to fetch debug collections', details: e.message });
    }
});

// Token validation endpoint
app.post('/api/validate-token', async (req, res) => {
    const { shop, accessToken } = req.body;
    console.log('Token validation called for shop:', shop, 'with token:', accessToken ? 'present' : 'missing');
    
    if (!shop || !accessToken) {
        console.log('Missing shop or accessToken in validation request');
        return res.status(400).json({ error: 'Missing shop or accessToken' });
    }
    try {
        console.log('Validating token for shop:', shop);
        // Try to fetch shop info to validate the token
        const response = await axios.get(`https://${shop}/admin/api/2023-10/shop.json`, {
            headers: { 'X-Shopify-Access-Token': accessToken }
        });
        console.log('Token validation successful for shop:', shop);
        res.json({ valid: true, shop: response.data.shop });
    } catch (err) {
        console.error('Token validation failed for shop:', shop, 'Error:', err.response?.data || err.message);
        res.json({ valid: false, error: err.response?.data || err.message });
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
    
    try {
        console.log(`Calculating optimization savings for ${images.length} images`);
        
        const optimizationResult = imageCalculator.calculateTotalSavings(images);
        
        console.log(`Optimization calculation complete: ${optimizationResult.summary.formattedSavings} potential savings`);
        
        res.json({
            success: true,
            optimization: optimizationResult
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