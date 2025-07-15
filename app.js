// Utility function to extract file extension from URL, stripping query strings and fragments
function getFileExtension(url) {
    return url.split('.').pop().split('?')[0].split('#')[0].toLowerCase();
}

// Shopify Media Manager App
class ShopifyMediaManager {
    constructor() {
        this.shopifyConfig = {
            apiKey: null, // Will be fetched from server
            scopes: 'read_products,write_products,read_files,write_files,read_themes,write_themes,read_content,write_content',
            redirectUri: window.location.origin + '/auth-callback.html'
        };
        
        this.currentStore = null;
        this.accessToken = null;
        this.mediaFiles = [];
        this.downloadedFiles = new Map();
        this.selectedMedia = new Set();
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
    }
    
    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            this.shopifyConfig.apiKey = config.apiKey;
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    bindEvents() {
        document.getElementById('fetch-images-btn').onclick = () => this.fetchAndShowImages();
    }

    async fetchAndShowImages() {
        const status = document.getElementById('images-status');
        const list = document.getElementById('image-list');
        status.textContent = 'Loading...';
        list.innerHTML = '';
        try {
            const response = await fetch('/api/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: this.accessToken,
                    shop: this.currentStore
                })
            });
            if (!response.ok) throw new Error('Failed to fetch images');
            const data = await response.json();
            if (Array.isArray(data.images)) {
                if (data.images.length === 0) {
                    list.innerHTML = '<div style="color:#888">No images found.</div>';
                } else {
                    list.innerHTML = data.images.map(url => `<div><a href="${url}" target="_blank">${url}</a></div>`).join('');
                }
            }
            if (Array.isArray(data.skipped) && data.skipped.length > 0) {
                status.innerHTML = `Done. <span style="color:orange">(Skipped: ${data.skipped.join(', ')})</span>`;
            } else {
                status.textContent = 'Done.';
            }
        } catch (e) {
            status.textContent = 'Error.';
            list.innerHTML = `<div style="color:red">${e.message}</div>`;
        }
    }

    // Authentication Methods
    async connectToShopify() {
        const shop = prompt('Enter your Shopify store domain (e.g., your-store.myshopify.com):');
        if (!shop) {
            console.log('No shop entered, aborting.');
            return;
        }
        const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
        const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${this.shopifyConfig.apiKey}&scope=${this.shopifyConfig.scopes}&redirect_uri=${encodeURIComponent(this.shopifyConfig.redirectUri)}`;
        console.log('OAuth URL:', authUrl);

        // Store shop domain for callback
        localStorage.setItem('shopify_shop', shopDomain);

        // Try to open the popup and log the result
        const popup = window.open(authUrl, 'shopify_auth', 'width=500,height=600');
        if (popup) {
            console.log('Popup opened successfully');
            popup.focus();
            
            // Listen for auth completion
            window.addEventListener('message', (event) => {
                if (event.data.type === 'SHOPIFY_AUTH_SUCCESS') {
                    this.handleAuthSuccess(event.data.accessToken, shopDomain);
                    popup.close();
                }
            });
        } else {
            alert('Popup was blocked! Please allow popups for this site.');
            console.log('Popup blocked by browser');
        }
    }

    async handleAuthSuccess(accessToken, shopDomain) {
        this.accessToken = accessToken;
        this.currentStore = shopDomain;
        
        // Store auth data
        localStorage.setItem('shopify_access_token', accessToken);
        localStorage.setItem('shopify_shop', shopDomain);
        
        // Update UI
        this.updateConnectionStatus(true);
        this.showNotification('Successfully connected to Shopify store!', 'success');
        
        // Load store info
        await this.loadStoreInfo();
        
        // Show media sections
        document.getElementById('media-section').classList.remove('hidden');
        document.getElementById('media-list-section').classList.remove('hidden');
    }

    async loadStoreInfo() {
        try {
            // Use backend endpoint to fetch store info
            const response = await fetch('/api/store', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: this.accessToken,
                    shop: this.currentStore
                })
            });
            if (!response.ok) throw new Error('Failed to fetch store info');
            const shop = await response.json();
            document.getElementById('store-name').textContent = shop.name || '';
            document.getElementById('store-domain').textContent = shop.domain || '';
        } catch (error) {
            console.error('Error loading store info:', error);
        }
    }

    disconnect() {
        this.accessToken = null;
        this.currentStore = null;
        this.mediaFiles = [];
        this.downloadedFiles.clear();
        
        // Clear stored data
        localStorage.removeItem('shopify_access_token');
        localStorage.removeItem('shopify_shop');
        localStorage.removeItem('media_files');
        
        // Update UI
        this.updateConnectionStatus(false);
        this.hideMediaSections();
        this.showNotification('Disconnected from Shopify store', 'info');
    }

    checkAuthStatus() {
        const accessToken = localStorage.getItem('shopify_access_token');
        const shop = localStorage.getItem('shopify_shop');
        
        if (accessToken && shop) {
            this.accessToken = accessToken;
            this.currentStore = shop;
            this.updateConnectionStatus(true);
            this.loadStoreInfo();
            document.getElementById('media-section').classList.remove('hidden');
            document.getElementById('media-list-section').classList.remove('hidden');
        }
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        const connectBtn = document.getElementById('connect-btn');
        const storeInfo = document.getElementById('store-info');
        
        if (connected) {
            statusEl.className = 'status-connected';
            statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
            connectBtn.classList.add('hidden');
            storeInfo.classList.remove('hidden');
        } else {
            statusEl.className = 'status-disconnected';
            statusEl.innerHTML = '<i class="fas fa-times-circle"></i> Not Connected';
            connectBtn.classList.remove('hidden');
            storeInfo.classList.add('hidden');
        }
    }

    hideMediaSections() {
        document.getElementById('media-section').classList.add('hidden');
        document.getElementById('media-list-section').classList.add('hidden');
    }

    // Shopify API Methods
    async shopifyRequest(method, endpoint, data = null) {
        if (!this.accessToken || !this.currentStore) {
            throw new Error('Not authenticated with Shopify');
        }

        const url = `https://${this.currentStore}${endpoint}`;
        const headers = {
            'X-Shopify-Access-Token': this.accessToken,
            'Content-Type': 'application/json'
        };

        const options = {
            method,
            headers,
            ...(data && { body: JSON.stringify(data) })
        };

        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    // Upload Methods
    handleFileSelection(event) {
        const files = Array.from(event.target.files);
        const uploadBtn = document.getElementById('upload-btn');
        
        if (files.length > 0) {
            uploadBtn.disabled = false;
            this.showNotification(`Selected ${files.length} files for upload`, 'info');
        } else {
            uploadBtn.disabled = true;
        }
    }

    async uploadFiles() {
        const files = Array.from(document.getElementById('file-input').files);
        const uploadMode = document.querySelector('input[name="upload-mode"]:checked').value;
        
        if (files.length === 0) {
            this.showNotification('Please select files to upload', 'error');
            return;
        }

        try {
            this.showUploadProgress();
            
            if (uploadMode === 'single') {
                await this.uploadFilesOneByOne(files);
            } else {
                await this.uploadFilesBatch(files);
            }
            
            this.showNotification('Upload completed successfully!', 'success');
            this.hideUploadProgress();
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('Error uploading files', 'error');
            this.hideUploadProgress();
        }
    }

    async uploadFilesOneByOne(files) {
        const totalFiles = files.length;
        let uploadedCount = 0;

        for (const file of files) {
            try {
                await this.uploadFile(file);
                uploadedCount++;
                this.updateUploadProgress(uploadedCount, totalFiles, file.name);
                
                // Small delay between uploads
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);
                this.showNotification(`Failed to upload ${file.name}`, 'error');
            }
        }
    }

    async uploadFilesBatch(files) {
        // For batch upload, we'll use Shopify's bulk operations API
        const assets = await Promise.all(files.map(async file => ({
            key: file.name,
            attachment: await this.fileToBase64(file)
        })));

        const response = await this.shopifyRequest('PUT', '/admin/api/2023-10/themes/current/assets.json', {
            assets: assets
        });

        return response;
    }

    async uploadFile(file) {
        const base64Data = await this.fileToBase64(file);
        
        const asset = {
            key: file.name,
            attachment: base64Data
        };

        return await this.shopifyRequest('PUT', '/admin/api/2023-10/themes/current/assets.json', {
            asset: asset
        });
    }

    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Progress Tracking Methods
    showUploadProgress() {
        document.getElementById('upload-progress').classList.remove('hidden');
        document.getElementById('upload-btn').disabled = true;
    }

    hideUploadProgress() {
        document.getElementById('upload-progress').classList.add('hidden');
        document.getElementById('upload-btn').disabled = false;
    }

    updateUploadProgress(current, total, filename) {
        const progress = (current / total) * 100;
        document.getElementById('upload-progress-bar').style.width = `${progress}%`;
        document.getElementById('upload-count').textContent = `${current} / ${total}`;
        document.getElementById('current-upload').textContent = `Uploading: ${filename}`;
    }

    // UI Methods
    updateStats() {
        const totalFiles = this.mediaFiles.length;
        const totalSize = this.mediaFiles.reduce((sum, file) => sum + (file.fileSize || 0), 0);

        document.getElementById('total-files').textContent = totalFiles;
        document.getElementById('total-size').textContent = this.formatBytes(totalSize);

        this.renderMediaList();
    }

    renderMediaList() {
        const mediaList = document.getElementById('media-list');
        mediaList.innerHTML = '';
        this.mediaFiles.forEach((file, idx) => {
            const mediaItem = this.createMediaItem(file, idx);
            mediaList.appendChild(mediaItem);
        });
        // Update checkboxes
        this.updateSelectionUI();
    }

    createMediaItem(file, idx) {
        const item = document.createElement('div');
        item.className = 'media-item';
        const icon = this.getFileIcon(file.content_type);
        const size = this.formatBytes(file.fileSize || file.size || 0);
        const origin = file.origin ? `<span class="media-origin">${file.origin.replace('_', ' ')}</span>` : '';
        // Checkbox for selection
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'media-checkbox';
        checkbox.dataset.idx = idx;
        checkbox.checked = this.selectedMedia.has(idx);
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectedMedia.add(idx);
            } else {
                this.selectedMedia.delete(idx);
            }
            this.updateSelectionUI();
        });
        item.innerHTML = `
            <div class="media-icon">
                <i class="${icon}"></i>
            </div>
            <div class="media-info">
                <div class="media-name">${file.name || file.key}</div>
                <div class="media-details">
                    <span class="media-size">${size}</span>
                    ${origin}
                </div>
            </div>
        `;
        item.prepend(checkbox);
        return item;
    }

    getFileIcon(contentType) {
        if (contentType?.startsWith('image')) {
            return 'fas fa-image';
        } else if (contentType?.startsWith('video')) {
            return 'fas fa-video';
        } else if (contentType?.includes('pdf')) {
            return 'fas fa-file-pdf';
        } else if (contentType?.includes('spreadsheet') || contentType?.includes('excel')) {
            return 'fas fa-file-excel';
        } else if (contentType?.includes('zip')) {
            return 'fas fa-file-archive';
        } else if (contentType?.includes('audio')) {
            return 'fas fa-file-audio';
        } else {
            return 'fas fa-file';
        }
    }

    filterMedia(searchTerm = '', filterType = 'all') {
        const mediaItems = document.querySelectorAll('.media-item');
        
        mediaItems.forEach(item => {
            const fileName = item.querySelector('.media-name').textContent.toLowerCase();
            
            let show = true;
            
            // Search filter
            if (searchTerm && !fileName.includes(searchTerm.toLowerCase())) {
                show = false;
            }
            
            // Type filter (only 'all' and 'normal' are supported now)
            // Since we removed oversized functionality, all files are considered normal
            
            item.style.display = show ? 'flex' : 'none';
        });
    }

    // Utility Methods
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        notifications.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    loadStoredData() {
        const storedFiles = localStorage.getItem('media_files');
        if (storedFiles) {
            try {
                this.mediaFiles = JSON.parse(storedFiles);
                this.updateStats();
            } catch (error) {
                console.error('Error loading stored media files:', error);
            }
        }
    }

    saveStoredData() {
        localStorage.setItem('media_files', JSON.stringify(this.mediaFiles));
    }

    updateSelectionUI() {
        // Update select all checkbox
        const selectAll = document.getElementById('select-all-media');
        if (selectAll) {
            selectAll.checked = this.selectedMedia.size === this.mediaFiles.length && this.mediaFiles.length > 0;
            selectAll.indeterminate = this.selectedMedia.size > 0 && this.selectedMedia.size < this.mediaFiles.length;
        }
        // Enable/disable download selected button
        const downloadSelectedBtn = document.getElementById('download-selected-btn');
        if (downloadSelectedBtn) {
            downloadSelectedBtn.disabled = this.selectedMedia.size === 0;
        }
        // Update checkboxes
        document.querySelectorAll('.media-checkbox').forEach((cb, idx) => {
            cb.checked = this.selectedMedia.has(Number(cb.dataset.idx));
        });
    }

    toggleSelectAll(checked) {
        if (checked) {
            this.selectedMedia = new Set(this.mediaFiles.map((_, idx) => idx));
        } else {
            this.selectedMedia.clear();
        }
        this.renderMediaList();
    }

    async downloadSelectedMedia() {
        if (!this.accessToken) {
            this.showNotification('Please connect to a Shopify store first', 'error');
            return;
        }
        if (this.selectedMedia.size === 0) {
            this.showNotification('No media selected', 'warning');
            return;
        }
        const selected = Array.from(this.selectedMedia).map(idx => this.mediaFiles[idx]);
        if (selected.length === 1) {
            // Download single file directly
            const file = selected[0];
            const url = file.public_url || file.src;
            if (!url) {
                this.showNotification('No URL for selected file', 'error');
                return;
            }
            try {
                this.showNotification('Downloading file...', 'info');
                const resp = await fetch(url);
                if (!resp.ok) throw new Error('Failed to fetch');
                const blob = await resp.blob();
                const ext = getFileExtension(url);
                const safeName = (file.key || file.name || 'file') + '.' + ext;
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = safeName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                this.showNotification('File downloaded.', 'success');
            } catch (err) {
                this.showNotification('Error downloading file', 'error');
            }
            return;
        }
        // Multiple files: ZIP in browser
        try {
            this.showNotification('Zipping selected media...', 'info');
            this.showDownloadProgress();
            this.updateDownloadProgress(0, selected.length, '');
            if (typeof JSZip === 'undefined') {
                this.showNotification('JSZip library not loaded', 'error');
                this.hideDownloadProgress();
                return;
            }
            const zip = new JSZip();
            let count = 0;
            for (const file of selected) {
                const url = file.public_url || file.src;
                if (!url) continue;
                try {
                    const resp = await fetch(url);
                    if (!resp.ok) throw new Error('Failed to fetch');
                    const blob = await resp.blob();
                    const ext = getFileExtension(url);
                    const safeName = (file.key || file.name || 'file_' + count) + '.' + ext;
                    zip.file(safeName, blob);
                    count++;
                } catch (err) {
                    console.warn('Failed to fetch for zip:', url, err);
                }
                this.updateDownloadProgress(count, selected.length, file.key || file.name);
            }
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(zipBlob);
            a.download = 'shopify-selected-media.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            this.showNotification('ZIP file ready for download.', 'success');
            this.hideDownloadProgress();
        } catch (err) {
            this.showNotification('Error zipping selected media', 'error');
            this.hideDownloadProgress();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ShopifyMediaManager();

    // Add JSZip via CDN if not present
    if (typeof JSZip === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => console.log('JSZip loaded');
        document.head.appendChild(script);
    }
});

// Handle OAuth callback (this would be in auth-callback.html)
if (window.location.search.includes('code=')) {
    (async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const shop = urlParams.get('shop');
        
        try {
            // Exchange code for access token using serverless function
            const response = await fetch(getTokenExchangeEndpoint(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, shop })
            });
            
            const data = await response.json();
            
            if (data.access_token) {
                window.opener.postMessage({
                    type: 'SHOPIFY_AUTH_SUCCESS',
                    accessToken: data.access_token
                }, window.location.origin);
            } else {
                console.error('Auth error:', data.error);
            }
        } catch (error) {
            console.error('Auth error:', error);
        }
    })();
}

function getTokenExchangeEndpoint() {
    if (window.location.port === "3001") {
        return "/api/shopify/exchange-code";
    }
    return "/.netlify/functions/shopify-auth";
} 