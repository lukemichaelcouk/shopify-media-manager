# SPREE Media Manager

A professional Shopify Media Manager application built by SPREE Agency for analyzing, optimizing, and managing Shopify store media assets.

## Features

- **Complete Media Analysis**: Fetch and analyze all images from Shopify stores (products, collections, theme assets)
- **Image Optimization**: Calculate potential savings from lossless compression and resizing
- **Advanced Filtering**: Filter images by category and file type with dynamic counts
- **Bulk Operations**: Download all or selected images as ZIP files
- **Responsive Design**: Modern UI with SPREE branding and mobile-friendly layout
- **Real-time Analysis**: Live image analysis with progress tracking
- **Performance Insights**: Detailed optimization recommendations and savings calculations
- **Progress Tracking**: Real-time progress indicators for download and upload operations
- **File Management**: Search and filter media files by size and type
- **Responsive Design**: Works on desktop and mobile devices

## Setup Instructions

### 1. Shopify Partner App Setup

1. Go to [Shopify Partners](https://partners.shopify.com) and create a new app
2. Set the following permissions:
   - `read_products`
   - `write_products`
   - `read_assets`
   - `write_assets`
3. Set the redirect URI to: `https://your-domain.com/auth-callback.html`
4. Copy your API key and secret

### 2. Configuration

1. Open `app.js` and replace `YOUR_SHOPIFY_API_KEY` with your actual Shopify Partner API key
2. Update the `redirectUri` in the `shopifyConfig` object to match your domain

### 3. Backend Setup (Required for Production)

For production use, you'll need a backend server to handle the OAuth token exchange. The current implementation includes a mock token for demonstration purposes.

Create a simple backend endpoint (Node.js example):

```javascript
const express = require('express');
const axios = require('axios');

app.post('/api/shopify/exchange-code', async (req, res) => {
    const { code, shop } = req.body;
    
    try {
        const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
            client_id: process.env.SHOPIFY_API_KEY,
            client_secret: process.env.SHOPIFY_API_SECRET,
            code: code
        });
        
        res.json({ access_token: response.data.access_token });
    } catch (error) {
        res.status(500).json({ error: 'Failed to exchange code for token' });
    }
});
```

### 4. Deployment

1. Upload all files to your web server
2. Ensure HTTPS is enabled (required for OAuth)
3. Update the redirect URI in your Shopify app settings

## Usage

### Connecting to Your Store

1. Click "Connect to Shopify Store"
2. Enter your store domain (e.g., `your-store.myshopify.com`)
3. Complete the OAuth authorization process

### Downloading Media

1. Click "Download All Media" to fetch all media files from your store
2. Monitor the progress bar to track download status
3. View the media list to see file details and information

### Uploading Optimized Media

1. Select your optimized files using the file picker
2. Choose upload mode:
   - **One by One**: Upload files individually (recommended for large files)
   - **Batch Upload**: Upload all files at once (faster for small files)
3. Click "Upload Files" and monitor progress

### File Analysis

The app provides basic file analysis and categorization to help you manage your media files efficiently.

## File Structure

```
├── index.html              # Main application page
├── auth-callback.html      # OAuth callback handler
├── styles.css             # Application styles
├── app.js                 # Main application logic
└── README.md              # This file
```

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Security Considerations

- Always use HTTPS in production
- Store API keys securely on your backend
- Implement proper session management
- Validate all user inputs
- Use CORS headers appropriately

## Limitations

- File size limits may apply based on Shopify's API restrictions
- Rate limiting may affect large batch operations
- Some file types may not be supported by Shopify's asset API

## Troubleshooting

### Common Issues

1. **OAuth Error**: Ensure your redirect URI matches exactly
2. **CORS Errors**: Configure your backend to handle CORS properly
3. **File Upload Failures**: Check file size limits and supported formats
4. **API Rate Limits**: Implement retry logic for failed requests

### Debug Mode

Enable browser developer tools to see detailed error messages and API responses.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue on the GitHub repository or contact the development team.

---

**Note**: This is a V1 implementation focused on basic media management. Future versions will include advanced optimization features, batch processing, and enhanced error handling. 