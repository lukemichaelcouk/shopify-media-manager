const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sizeOf = require('image-size');
const imageCalculator = require('./image-calculator');
const multer = require('multer');
const sharp = require('sharp');
const FormData = require('form-data');
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
const SHOPIFY_SCOPES = 'read_products,write_products,read_themes,write_themes,read_content,write_content,read_files,write_files';

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
            redirect_uri: 'https://app.wearespree.com/auth/callback'
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

// --- Utility: Extract image URLs from HTML content ---
function extractImageUrlsFromHtml(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') return [];
    
    const imageRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    const urls = [];
    let match;
    
    while ((match = imageRegex.exec(htmlContent)) !== null) {
        const url = match[1];
        if (url && validateImageUrl(url)) {
            urls.push(url);
        }
    }
    
    return urls;
}

// --- Utility: Fetch metafields for a resource ---
async function fetchMetafields(resourceType, resourceId, headers, apiBase) {
    try {
        const response = await axios.get(`${apiBase}/${resourceType}/${resourceId}/metafields.json`, { headers });
        return response.data.metafields || [];
    } catch (error) {
        console.warn(`Failed to fetch metafields for ${resourceType}/${resourceId}:`, error.message);
        return [];
    }
}

// --- Utility: Extract image URLs from metafields ---
function extractImageUrlsFromMetafields(metafields) {
    const imageUrls = [];
    
    for (const metafield of metafields) {
        // Check for file_reference type metafields
        if (metafield.type === 'file_reference' && metafield.value) {
            try {
                const fileData = JSON.parse(metafield.value);
                if (fileData.url && validateImageUrl(fileData.url)) {
                    imageUrls.push({
                        url: fileData.url,
                        metafieldId: metafield.id,
                        metafieldKey: metafield.key,
                        metafieldNamespace: metafield.namespace,
                        resourceType: metafield.owner_resource,
                        resourceId: metafield.owner_id
                    });
                }
            } catch (e) {
                // Try direct URL if JSON parsing fails
                if (validateImageUrl(metafield.value)) {
                    imageUrls.push({
                        url: metafield.value,
                        metafieldId: metafield.id,
                        metafieldKey: metafield.key,
                        metafieldNamespace: metafield.namespace,
                        resourceType: metafield.owner_resource,
                        resourceId: metafield.owner_id
                    });
                }
            }
        }
        // Check for URL type metafields that might contain image URLs
        else if (metafield.type === 'url' && metafield.value && validateImageUrl(metafield.value)) {
            imageUrls.push({
                url: metafield.value,
                metafieldId: metafield.id,
                metafieldKey: metafield.key,
                metafieldNamespace: metafield.namespace,
                resourceType: metafield.owner_resource,
                resourceId: metafield.owner_id
            });
        }
    }
    
    return imageUrls;
}

// --- Utility: GraphQL query for Shopify Files ---
async function fetchShopifyFiles(shop, accessToken) {
    const graphqlEndpoint = `https://${shop}/admin/api/2023-10/graphql.json`;
    const headers = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
    };
    
    const query = `
        query getMediaFiles($first: Int!) {
            files(first: $first, query: "media_type:IMAGE") {
                edges {
                    node {
                        id
                        alt
                        createdAt
                        fileStatus
                        ... on MediaImage {
                            id
                            alt
                            image {
                                url
                                width
                                height
                            }
                            mimeType
                            originalSource {
                                url
                            }
                        }
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    `;
    
    try {
        const response = await axios.post(graphqlEndpoint, {
            query,
            variables: { first: 100 }
        }, { headers });
        
        if (response.data.errors) {
            console.error('GraphQL errors:', response.data.errors);
            return [];
        }
        
        const files = response.data.data?.files?.edges || [];
        return files.map(edge => ({
            id: edge.node.id,
            url: edge.node.image?.url || edge.node.originalSource?.url,
            alt: edge.node.alt,
            width: edge.node.image?.width,
            height: edge.node.image?.height,
            mimeType: edge.node.mimeType,
            createdAt: edge.node.createdAt,
            fileStatus: edge.node.fileStatus
        })).filter(file => file.url && validateImageUrl(file.url));
    } catch (error) {
        console.error('Error fetching Shopify Files:', error.message);
        return [];
    }
}

// --- Utility: GraphQL query for metaobjects ---
async function fetchMetaobjects(shop, accessToken) {
    const graphqlEndpoint = `https://${shop}/admin/api/2023-10/graphql.json`;
    const headers = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
    };
    
    // First, get all metaobject definitions to know what types exist
    const definitionsQuery = `
        query getMetaobjectDefinitions($first: Int!) {
            metaobjectDefinitions(first: $first) {
                edges {
                    node {
                        id
                        type
                        name
                        fieldDefinitions {
                            key
                            type {
                                name
                            }
                        }
                    }
                }
            }
        }
    `;
    
    try {
        const definitionsResponse = await axios.post(graphqlEndpoint, {
            query: definitionsQuery,
            variables: { first: 50 }
        }, { headers });
        
        if (definitionsResponse.data.errors) {
            console.error('GraphQL definition errors:', definitionsResponse.data.errors);
            return [];
        }
        
        const definitions = definitionsResponse.data.data?.metaobjectDefinitions?.edges || [];
        const imageUrls = [];
        
        // For each definition, fetch the metaobjects of that type
        for (const defEdge of definitions) {
            const definition = defEdge.node;
            
            // Check if this definition has any image fields
            const hasImageFields = definition.fieldDefinitions.some(field => 
                field.type.name === 'file_reference' || field.type.name === 'single_line_text_field'
            );
            
            if (!hasImageFields) continue;
            
            const objectsQuery = `
                query getMetaobjectsOfType($type: String!, $first: Int!) {
                    metaobjects(type: $type, first: $first) {
                        edges {
                            node {
                                id
                                type
                                handle
                                fields {
                                    key
                                    type
                                    value
                                    reference {
                                        ... on MediaImage {
                                            id
                                            image {
                                                url
                                                width
                                                height
                                            }
                                            alt
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            
            try {
                const objectsResponse = await axios.post(graphqlEndpoint, {
                    query: objectsQuery,
                    variables: { type: definition.type, first: 50 }
                }, { headers });
                
                if (objectsResponse.data.errors) {
                    console.error(`GraphQL objects errors for type ${definition.type}:`, objectsResponse.data.errors);
                    continue;
                }
                
                const metaobjects = objectsResponse.data.data?.metaobjects?.edges || [];
                
                for (const edge of metaobjects) {
                    const metaobject = edge.node;
                    
                    for (const field of metaobject.fields) {
                        // Check for file_reference fields with image references
                        if (field.type === 'file_reference' && field.reference?.image?.url) {
                            imageUrls.push({
                                url: field.reference.image.url,
                                metaobjectId: metaobject.id,
                                metaobjectType: metaobject.type,
                                metaobjectHandle: metaobject.handle,
                                fieldKey: field.key,
                                alt: field.reference.alt,
                                width: field.reference.image.width,
                                height: field.reference.image.height
                            });
                        }
                        // Check for URL fields that might contain image URLs
                        else if (field.type === 'single_line_text_field' && field.value && validateImageUrl(field.value)) {
                            imageUrls.push({
                                url: field.value,
                                metaobjectId: metaobject.id,
                                metaobjectType: metaobject.type,
                                metaobjectHandle: metaobject.handle,
                                fieldKey: field.key
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error fetching metaobjects of type ${definition.type}:`, error.message);
            }
        }
        
        return imageUrls;
    } catch (error) {
        console.error('Error fetching metaobject definitions:', error.message);
        return [];
    }
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

// Helper function to validate and fix image URLs
function validateImageUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    // Check if it's already a valid HTTP/HTTPS URL
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// --- /api/media: Fetch all available image asset URLs (theme, products, collections, blogs, pages, metafields, files, metaobjects) ---
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
    let productIds = []; // Declare here for use in metafields section
    let allCollections = []; // Declare here for use in metafields section
    let stats = {
        totalFiles: 0,
        categories: {
            theme: 0,
            products: 0,
            collections: 0,
            blogs: 0,
            pages: 0,
            metafields: 0,
            files: 0,
            metaobjects: 0
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
            
            // More inclusive filtering for theme images
            const themeImageUrls = assets
                .filter(a => {
                    const isImage = a.key && a.key.match(/\.(png|jpe?g|gif|webp|svg|ico)$/i);
                    return isImage;
                })
                .map(a => {
                    if (a.public_url) {
                        return a.public_url;
                    } else if (a.key) {
                        return `https://${shop}/files/${a.key}`;
                    }
                    return null;
                })
                .filter(url => url !== null);
            
            console.log(`Found ${themeImageUrls.length} theme image URLs`);
            const themeImages = themeImageUrls.map(url => createImageWithoutMetadata(url, 'theme'));
            allImages = allImages.concat(themeImages);
        }
    } catch (e) {
        console.warn('[API Error] Theme assets:', e.message);
        skipped.push('theme');
    }
    
    // --- 2. Product images ---
    try {
        let nextUrl = `${apiBase}/products.json?limit=250`;
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
        
        console.log(`Found ${productImageUrls.length} product images`);
        const productImages = productImageUrls.map(url => createImageWithoutMetadata(url, 'products'));
        allImages = allImages.concat(productImages);
    } catch (e) {
        console.warn('[API Error] Product images:', e.message);
        skipped.push('products');
    }
    
    // --- 3. Collection images ---
    try {
        console.log('Fetching collection images...');
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
        
        const [customCollections, smartCollections] = await Promise.all([
            fetchAllCollections('custom_collections'),
            fetchAllCollections('smart_collections')
        ]);
        allCollections = [...customCollections, ...smartCollections];
        
        const collectionImages = allCollections
            .filter(c => c.image && c.image.src)
            .map(c => createImageWithoutMetadata(c.image.src, 'collections', {
                collectionId: c.id,
                collectionTitle: c.title,
                collectionType: c.handle ? 'custom' : 'smart'
            }));
        
        allImages = allImages.concat(collectionImages);
        console.log(`Found ${collectionImages.length} collection images (custom+smart)`);
    } catch (e) {
        console.warn('[API Error] Collection images:', e.message);
        skipped.push('collections');
    }
    
    // --- 4. Blog article images ---
    try {
        console.log('Fetching blog articles...');
        const blogsResp = await axios.get(`${apiBase}/blogs.json`, { headers });
        const blogs = blogsResp.data.blogs || [];
        
        let blogImageUrls = [];
        for (const blog of blogs) {
            try {
                const articlesResp = await axios.get(`${apiBase}/blogs/${blog.id}/articles.json`, { headers });
                const articles = articlesResp.data.articles || [];
                
                for (const article of articles) {
                    if (article.content) {
                        const imageUrls = extractImageUrlsFromHtml(article.content);
                        for (const url of imageUrls) {
                            blogImageUrls.push({
                                url,
                                blogId: blog.id,
                                blogTitle: blog.title,
                                articleId: article.id,
                                articleTitle: article.title,
                                sourceType: 'blog_article'
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn(`Failed to fetch articles for blog ${blog.id}:`, e.message);
            }
        }
        
        const blogImages = blogImageUrls.map(data => createImageWithoutMetadata(data.url, 'blogs', data));
        allImages = allImages.concat(blogImages);
        console.log(`Found ${blogImages.length} blog article images`);
    } catch (e) {
        console.warn('[API Error] Blog articles:', e.response?.status === 403 ? 'Insufficient permissions - read_content scope required' : e.message);
        skipped.push('blogs');
    }
    
    // --- 5. Page images ---
    try {
        console.log('Fetching pages...');
        let nextUrl = `${apiBase}/pages.json?limit=250`;
        let pageImageUrls = [];
        
        while (nextUrl) {
            const resp = await axios.get(nextUrl, { headers });
            const pages = resp.data.pages || [];
            
            for (const page of pages) {
                if (page.body_html) {
                    const imageUrls = extractImageUrlsFromHtml(page.body_html);
                    for (const url of imageUrls) {
                        pageImageUrls.push({
                            url,
                            pageId: page.id,
                            pageTitle: page.title,
                            pageHandle: page.handle,
                            sourceType: 'page'
                        });
                    }
                }
            }
            
            const link = resp.headers['link'];
            if (link && link.includes('rel="next"')) {
                const match = link.match(/<([^>]+)>; rel="next"/);
                nextUrl = match ? match[1] : null;
            } else {
                nextUrl = null;
            }
        }
        
        const pageImages = pageImageUrls.map(data => createImageWithoutMetadata(data.url, 'pages', data));
        allImages = allImages.concat(pageImages);
        console.log(`Found ${pageImages.length} page images`);
    } catch (e) {
        console.warn('[API Error] Pages:', e.response?.status === 403 ? 'Insufficient permissions - read_content scope required' : e.message);
        skipped.push('pages');
    }
    
    // --- 6. Metafield images ---
    try {
        console.log('Fetching metafield images...');
        let metafieldImageUrls = [];
        
        // Fetch metafields for products
        for (const id of productIds.slice(0, 50)) { // Limit to first 50 products to avoid timeout
            try {
                const metafields = await fetchMetafields('products', id, headers, apiBase);
                const imageUrls = extractImageUrlsFromMetafields(metafields);
                metafieldImageUrls = metafieldImageUrls.concat(imageUrls);
            } catch (e) {
                // Skip this product
            }
        }
        
        // Fetch metafields for collections
        for (const collection of allCollections.slice(0, 50)) { // Limit to first 50 collections
            try {
                const metafields = await fetchMetafields('collections', collection.id, headers, apiBase);
                const imageUrls = extractImageUrlsFromMetafields(metafields);
                metafieldImageUrls = metafieldImageUrls.concat(imageUrls);
            } catch (e) {
                // Skip this collection
            }
        }
        
        const metafieldImages = metafieldImageUrls.map(data => createImageWithoutMetadata(data.url, 'metafields', data));
        allImages = allImages.concat(metafieldImages);
        console.log(`Found ${metafieldImages.length} metafield images`);
    } catch (e) {
        console.warn('[API Error] Metafields:', e.message);
        skipped.push('metafields');
    }
    
    // --- 7. Shopify Files ---
    try {
        console.log('Fetching Shopify Files...');
        const shopifyFiles = await fetchShopifyFiles(shop, accessToken);
        const fileImages = shopifyFiles.map(file => createImageWithoutMetadata(file.url, 'files', {
            fileId: file.id,
            alt: file.alt,
            mimeType: file.mimeType,
            createdAt: file.createdAt,
            sourceType: 'shopify_file'
        }));
        
        allImages = allImages.concat(fileImages);
        console.log(`Found ${fileImages.length} Shopify File images`);
    } catch (e) {
        console.warn('[API Error] Shopify Files:', e.message);
        skipped.push('files');
    }
    
    // --- 8. Metaobject images ---
    try {
        console.log('Fetching metaobject images...');
        const metaobjectImageUrls = await fetchMetaobjects(shop, accessToken);
        const metaobjectImages = metaobjectImageUrls.map(data => createImageWithoutMetadata(data.url, 'metaobjects', data));
        
        allImages = allImages.concat(metaobjectImages);
        console.log(`Found ${metaobjectImages.length} metaobject images`);
    } catch (e) {
        console.warn('[API Error] Metaobjects:', e.message);
        skipped.push('metaobjects');
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

// --- /api/media/fetch: Alias for /api/media endpoint (for frontend compatibility) ---
app.post('/api/media/fetch', async (req, res) => {
    console.log('Media fetch API called, forwarding to main media logic');
    
    // Just call the main media endpoint with the same request
    const originalUrl = req.url;
    req.url = '/api/media';
    
    // Create a response interceptor to ensure we return success: true
    const originalJson = res.json;
    res.json = function(data) {
        if (data && !data.success) {
            data.success = true;
        }
        return originalJson.call(this, data);
    };
    
    return app._router.handle(req, res);
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
                    const url = image.url.toLowerCase();
                    if (url.includes('banner') || url.includes('hero') || url.includes('slider')) {
                        imageType = 'banner';
                    } else if (url.includes('thumb') || url.includes('icon') || url.includes('logo')) {
                        imageType = 'thumbnail';
                    } else {
                        imageType = 'banner';
                    }
                }
                
                const isLarge = sizeInBytes > 1048576;
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
                
                return {
                    ...enhancedImage
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
                    totalPixels: 0
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

// --- /api/media/replace: Replace any Shopify image (product, collection, asset, theme file, blog, page, metafield, file, metaobject) ---
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
        
        const dimensions = (sizeOf.imageSize || sizeOf.default || sizeOf)(processedBuffer);
        
        console.log(`Replacing ${category} image: ${originalUrl}`);
        console.log(`New image size: ${processedSize} bytes, dimensions: ${dimensions.width}x${dimensions.height}`);
        
        // Detect image type and handle accordingly
        const imageType = detectImageType(originalUrl, category, req.body);
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
            case 'blog':
                result = await replaceBlogImage(shop, accessToken, originalUrl, processedBuffer, imageType, headers, apiBase);
                break;
            case 'page':
                result = await replacePageImage(shop, accessToken, originalUrl, processedBuffer, imageType, headers, apiBase);
                break;
            case 'metafield':
                result = await replaceMetafieldImage(shop, accessToken, originalUrl, processedBuffer, imageType, headers, apiBase);
                break;
            case 'metaobject':
                result = await replaceMetaobjectImage(shop, accessToken, originalUrl, processedBuffer, imageType, headers, apiBase);
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

// --- Image Replacement Helper Functions ---

// Step 1: Detect image type (product, collection, file, theme asset, blog, page, metafield, metaobject)
function detectImageType(url, category, additionalData = {}) {
    console.log(`Detecting image type for URL: ${url}, category: ${category}`);
    
    // Check additional data for specific identifiers
    if (additionalData.metafieldId) {
        return {
            type: 'metafield',
            metafieldId: additionalData.metafieldId,
            resourceType: additionalData.resourceType,
            resourceId: additionalData.resourceId
        };
    }
    
    if (additionalData.metaobjectId) {
        return {
            type: 'metaobject',
            metaobjectId: additionalData.metaobjectId,
            fieldKey: additionalData.fieldKey
        };
    }
    
    if (additionalData.fileId) {
        return {
            type: 'file',
            fileId: additionalData.fileId
        };
    }
    
    if (additionalData.blogId) {
        return {
            type: 'blog',
            blogId: additionalData.blogId,
            articleId: additionalData.articleId
        };
    }
    
    if (additionalData.pageId) {
        return {
            type: 'page',
            pageId: additionalData.pageId
        };
    }
    
    // Parse URL to extract information
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Product images
    if (pathname.includes('/products/') && pathname.includes('/images/')) {
        const productMatch = pathname.match(/\/products\/(\d+)/);
        const imageMatch = pathname.match(/\/images\/(\d+)/);
        return {
            type: 'product',
            productId: productMatch ? productMatch[1] : null,
            imageId: imageMatch ? imageMatch[1] : null
        };
    }
    
    // Collection images
    if (pathname.includes('/collections/') || category === 'collections') {
        const collectionMatch = pathname.match(/\/collections\/(.+?)\//);
        return {
            type: 'collection',
            collectionHandle: collectionMatch ? collectionMatch[1] : null
        };
    }
    
    // Theme assets
    if (pathname.includes('/t/') && pathname.includes('/assets/')) {
        const themeMatch = pathname.match(/\/t\/(\d+)/);
        const assetMatch = pathname.match(/\/assets\/(.+)$/);
        return {
            type: 'theme',
            themeId: themeMatch ? themeMatch[1] : null,
            assetKey: assetMatch ? `assets/${assetMatch[1]}` : null
        };
    }
    
    // Generic files
    if (pathname.includes('/files/')) {
        const fileMatch = pathname.match(/\/files\/(.+)$/);
        return {
            type: 'file',
            fileName: fileMatch ? fileMatch[1] : null
        };
    }
    
    // Default based on category
    if (category === 'products') {
        return { type: 'product', productId: null, imageId: null };
    }
    
    if (category === 'theme') {
        return { type: 'theme', themeId: null, assetKey: null };
    }
    
    // Fallback to file type
    return { type: 'file', fileName: null };
}

// Replacement functions for different image types
async function replaceProductImage(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing product image...');
    
    try {
        if (imageType.productId && imageType.imageId) {
            const base64Image = imageBuffer.toString('base64');
            
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
            // Need to find the product and image by searching through products
            console.log('Searching for product image by URL...');
            
            let foundProduct = null;
            let foundImage = null;
            
            // Get all products and search for matching image URL
            let nextUrl = `${apiBase}/products.json?limit=250`;
            while (nextUrl && !foundProduct) {
                const resp = await axios.get(nextUrl, { headers });
                const products = resp.data.products || [];
                
                for (const product of products) {
                    const imgResp = await axios.get(`${apiBase}/products/${product.id}/images.json`, { headers });
                    const images = imgResp.data.images || [];
                    
                    for (const image of images) {
                        if (image.src === originalUrl) {
                            foundProduct = product;
                            foundImage = image;
                            break;
                        }
                    }
                    
                    if (foundProduct) break;
                }
                
                // Check for pagination
                const link = resp.headers['link'];
                if (link && link.includes('rel="next"')) {
                    const match = link.match(/<([^>]+)>; rel="next"/);
                    nextUrl = match ? match[1] : null;
                } else {
                    nextUrl = null;
                }
            }
            
            if (!foundProduct || !foundImage) {
                throw new Error('Product image not found');
            }
            
            // Now replace the found image
            const base64Image = imageBuffer.toString('base64');
            
            const updateResponse = await axios.put(
                `${apiBase}/products/${foundProduct.id}/images/${foundImage.id}.json`,
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
        }
    } catch (error) {
        console.error('Error replacing product image:', error.message);
        throw error;
    }
}

async function replaceCollectionImage(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing collection image...');
    
    try {
        // Find the collection by searching through all collections
        let foundCollection = null;
        
        // Check custom collections
        const customResp = await axios.get(`${apiBase}/custom_collections.json`, { headers });
        const customCollections = customResp.data.custom_collections || [];
        
        for (const collection of customCollections) {
            if (collection.image && collection.image.src === originalUrl) {
                foundCollection = { ...collection, type: 'custom' };
                break;
            }
        }
        
        // Check smart collections if not found in custom
        if (!foundCollection) {
            const smartResp = await axios.get(`${apiBase}/smart_collections.json`, { headers });
            const smartCollections = smartResp.data.smart_collections || [];
            
            for (const collection of smartCollections) {
                if (collection.image && collection.image.src === originalUrl) {
                    foundCollection = { ...collection, type: 'smart' };
                    break;
                }
            }
        }
        
        if (!foundCollection) {
            throw new Error('Collection image not found');
        }
        
        // Upload the new image as a file first
        const base64Image = imageBuffer.toString('base64');
        const endpoint = foundCollection.type === 'custom' ? 'custom_collections' : 'smart_collections';
        
        const updateResponse = await axios.put(
            `${apiBase}/${endpoint}/${foundCollection.id}.json`,
            {
                [foundCollection.type === 'custom' ? 'custom_collection' : 'smart_collection']: {
                    id: foundCollection.id,
                    image: {
                        attachment: base64Image,
                        filename: `collection_${Date.now()}.jpg`
                    }
                }
            },
            { headers }
        );
        
        const collectionData = updateResponse.data[foundCollection.type === 'custom' ? 'custom_collection' : 'smart_collection'];
        
        return {
            newUrl: collectionData.image.src,
            resourceId: collectionData.id
        };
    } catch (error) {
        console.error('Error replacing collection image:', error.message);
        throw error;
    }
}

async function replaceThemeAsset(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing theme asset...');
    throw new Error('Theme asset replacement not yet implemented');
}

async function replaceShopifyFile(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing Shopify file...');
    
    try {
        // For Shopify Files, we need to create a new file and then delete the old one
        const graphqlEndpoint = `https://${shop}/admin/api/2023-10/graphql.json`;
        const graphqlHeaders = {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
        };
        
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');
        
        // Create staged upload for the new file
        const stagedUploadMutation = `
            mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
                stagedUploadsCreate(input: $input) {
                    stagedUploads {
                        resourceUrl
                        url
                        parameters {
                            name
                            value
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;
        
        const stagedUploadResponse = await axios.post(graphqlEndpoint, {
            query: stagedUploadMutation,
            variables: {
                input: [{
                    filename: `replacement_${Date.now()}.jpg`,
                    mimeType: 'image/jpeg',
                    httpMethod: 'POST'
                }]
            }
        }, { headers: graphqlHeaders });
        
        if (stagedUploadResponse.data.errors) {
            throw new Error('Failed to create staged upload: ' + JSON.stringify(stagedUploadResponse.data.errors));
        }
        
        const stagedUpload = stagedUploadResponse.data.data.stagedUploadsCreate.stagedUploads[0];
        
        // Upload the file to the staged upload URL
        const formData = new FormData();
        stagedUpload.parameters.forEach(param => {
            formData.append(param.name, param.value);
        });
        formData.append('file', imageBuffer, `replacement_${Date.now()}.jpg`);
        
        await axios.post(stagedUpload.url, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });
        
        // Create the file in Shopify
        const fileCreateMutation = `
            mutation fileCreate($files: [FileCreateInput!]!) {
                fileCreate(files: $files) {
                    files {
                        id
                        ... on MediaImage {
                            image {
                                url
                            }
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;
        
        const fileCreateResponse = await axios.post(graphqlEndpoint, {
            query: fileCreateMutation,
            variables: {
                files: [{
                    originalSource: stagedUpload.resourceUrl,
                    contentType: 'IMAGE'
                }]
            }
        }, { headers: graphqlHeaders });
        
        if (fileCreateResponse.data.errors) {
            throw new Error('Failed to create file: ' + JSON.stringify(fileCreateResponse.data.errors));
        }
        
        const newFile = fileCreateResponse.data.data.fileCreate.files[0];
        
        return {
            newUrl: newFile.image.url,
            resourceId: newFile.id
        };
    } catch (error) {
        console.error('Error replacing Shopify file:', error.message);
        throw error;
    }
}

async function replaceBlogImage(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing blog image...');
    
    try {
        // Blog images are embedded in HTML content, so we need to:
        // 1. Upload the new image as a file
        // 2. Update the blog article content to reference the new image
        
        if (!imageType.blogId || !imageType.articleId) {
            throw new Error('Missing blog ID or article ID for blog image replacement');
        }
        
        // First, upload the new image as a Shopify file
        const newFileResult = await replaceShopifyFile(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase);
        
        // Get the current article content
        const articleResp = await axios.get(`${apiBase}/blogs/${imageType.blogId}/articles/${imageType.articleId}.json`, { headers });
        const article = articleResp.data.article;
        
        // Replace the old image URL with the new one in the content
        const updatedContent = article.content.replace(new RegExp(originalUrl, 'g'), newFileResult.newUrl);
        
        // Update the article with the new content
        const updateResponse = await axios.put(
            `${apiBase}/blogs/${imageType.blogId}/articles/${imageType.articleId}.json`,
            {
                article: {
                    id: article.id,
                    content: updatedContent
                }
            },
            { headers }
        );
        
        return {
            newUrl: newFileResult.newUrl,
            resourceId: updateResponse.data.article.id
        };
    } catch (error) {
        console.error('Error replacing blog image:', error.message);
        throw error;
    }
}

async function replacePageImage(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing page image...');
    
    try {
        // Page images are embedded in HTML content, similar to blog images
        
        if (!imageType.pageId) {
            throw new Error('Missing page ID for page image replacement');
        }
        
        // First, upload the new image as a Shopify file
        const newFileResult = await replaceShopifyFile(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase);
        
        // Get the current page content
        const pageResp = await axios.get(`${apiBase}/pages/${imageType.pageId}.json`, { headers });
        const page = pageResp.data.page;
        
        // Replace the old image URL with the new one in the content
        const updatedContent = page.body_html.replace(new RegExp(originalUrl, 'g'), newFileResult.newUrl);
        
        // Update the page with the new content
        const updateResponse = await axios.put(
            `${apiBase}/pages/${imageType.pageId}.json`,
            {
                page: {
                    id: page.id,
                    body_html: updatedContent
                }
            },
            { headers }
        );
        
        return {
            newUrl: newFileResult.newUrl,
            resourceId: updateResponse.data.page.id
        };
    } catch (error) {
        console.error('Error replacing page image:', error.message);
        throw error;
    }
}

async function replaceMetafieldImage(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing metafield image...');
    
    try {
        if (!imageType.metafieldId) {
            throw new Error('Missing metafield ID for metafield image replacement');
        }
        
        // First, upload the new image as a Shopify file
        const newFileResult = await replaceShopifyFile(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase);
        
        // Update the metafield with the new image URL
        const updateResponse = await axios.put(
            `${apiBase}/metafields/${imageType.metafieldId}.json`,
            {
                metafield: {
                    id: imageType.metafieldId,
                    value: newFileResult.newUrl,
                    type: 'url'
                }
            },
            { headers }
        );
        
        return {
            newUrl: newFileResult.newUrl,
            resourceId: updateResponse.data.metafield.id
        };
    } catch (error) {
        console.error('Error replacing metafield image:', error.message);
        throw error;
    }
}

async function replaceMetaobjectImage(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase) {
    console.log('Replacing metaobject image...');
    
    try {
        if (!imageType.metaobjectId || !imageType.fieldKey) {
            throw new Error('Missing metaobject ID or field key for metaobject image replacement');
        }
        
        // First, upload the new image as a Shopify file
        const newFileResult = await replaceShopifyFile(shop, accessToken, originalUrl, imageBuffer, imageType, headers, apiBase);
        
        // Update the metaobject field using GraphQL
        const graphqlEndpoint = `https://${shop}/admin/api/2023-10/graphql.json`;
        const graphqlHeaders = {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
        };
        
        const updateMutation = `
            mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
                metaobjectUpdate(id: $id, metaobject: $metaobject) {
                    metaobject {
                        id
                        handle
                        fields {
                            key
                            value
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;
        
        const updateResponse = await axios.post(graphqlEndpoint, {
            query: updateMutation,
            variables: {
                id: imageType.metaobjectId,
                metaobject: {
                    fields: [{
                        key: imageType.fieldKey,
                        value: newFileResult.resourceId // Use the file ID for file_reference fields
                    }]
                }
            }
        }, { headers: graphqlHeaders });
        
        if (updateResponse.data.errors) {
            throw new Error('GraphQL error: ' + JSON.stringify(updateResponse.data.errors));
        }
        
        return {
            newUrl: newFileResult.newUrl,
            resourceId: updateResponse.data.data.metaobjectUpdate.metaobject.id
        };
    } catch (error) {
        console.error('Error replacing metaobject image:', error.message);
        throw error;
    }
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

// Validate Shopify access token
app.post('/api/validate-token', async (req, res) => {
    const { shop, accessToken } = req.body;
    if (!shop || !accessToken) {
        return res.status(400).json({ error: 'Missing shop or accessToken', valid: false });
    }
    
    try {
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
        
        if (error.response?.status === 401 || error.response?.status === 403) {
            res.json({ valid: false, error: 'Invalid or expired token' });
        } else {
            res.json({ valid: false, error: 'Token validation failed' });
        }
    }
});

// Shopify app installation endpoint (handles initial app installation)
app.get('/', (req, res) => {
    const { shop, hmac, timestamp, host } = req.query;
    
    if (shop && hmac) {
        console.log('Shopify app installation request detected:', { shop, hmac, timestamp });
        
        if (!SHOPIFY_API_KEY) {
            console.error('Missing SHOPIFY_API_KEY environment variable');
            return res.status(500).send('Server configuration error: Missing API key');
        }
        
        const scopes = SHOPIFY_SCOPES;
        const redirectUri = 'https://app.wearespree.com/auth/callback';
        const state = Math.random().toString(36).substring(7);
        
        const authUrl = `https://${shop}/admin/oauth/authorize?` + 
            `client_id=${SHOPIFY_API_KEY}&` +
            `scope=${encodeURIComponent(scopes)}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `state=${state}`;
        
        console.log('Generated OAuth URL:', authUrl);
        return res.redirect(authUrl);
    }
    
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Custom app installation endpoint
app.get('/install', (req, res) => {
    const { shop } = req.query;
    
    if (!shop) {
        return res.status(400).send('Missing shop parameter. Please access this via the Partner Portal installation link.');
    }
    
    console.log('Custom app installation request for shop:', shop);
    
    if (!SHOPIFY_API_KEY) {
        console.error('Missing SHOPIFY_API_KEY environment variable');
        return res.status(500).send('Server configuration error: Missing API key');
    }
    
    const scopes = SHOPIFY_SCOPES;
    const redirectUri = 'https://app.wearespree.com/auth/callback';
    const state = Math.random().toString(36).substring(7);
    
    const authUrl = `https://${shop}/admin/oauth/authorize?` + 
        `client_id=${SHOPIFY_API_KEY}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${state}`;
    
    console.log('Generated OAuth URL:', authUrl);
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