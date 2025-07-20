// Simple script to add the shop parameter to all validateImageUrl and extractImageUrlsFromMetafields calls
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace validateImageUrl() calls with validateImageUrl(url, shop)
content = content.replace(/validateImageUrl\(([^,\)]+)\)/g, 'validateImageUrl($1, shop)');

// Replace extractImageUrlsFromHtml() calls with extractImageUrlsFromHtml(content, shop)
content = content.replace(/extractImageUrlsFromHtml\(([^,\)]+)\)/g, 'extractImageUrlsFromHtml($1, shop)');

// Replace extractImageUrlsFromMetafields(metafields) with extractImageUrlsFromMetafields(metafields, shop)
content = content.replace(/extractImageUrlsFromMetafields\(([^,\)]+)\)/g, 'extractImageUrlsFromMetafields($1, shop)');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Updated all validateImageUrl, extractImageUrlsFromHtml, and extractImageUrlsFromMetafields calls with shop parameter');
