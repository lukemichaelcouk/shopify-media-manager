# Static.app Deployment Guide

This guide will help you deploy the Shopify Media Manager to Static.app using serverless functions.

## Prerequisites

- A Static.app account
- A Shopify Partner account
- Git installed on your computer

## Step 1: Shopify Partner App Setup

1. **Create a Shopify Partner Account**
   - Go to [Shopify Partners](https://partners.shopify.com)
   - Sign up for a free partner account

2. **Create a New App**
   - In your partner dashboard, click "Apps" → "Create app"
   - Choose "Custom app" (simpler for personal use)
   - Give your app a name (e.g., "Media Manager")

3. **Configure App Settings**
   - Set the App URL to your Static.app domain (e.g., `https://your-app-name.static.app`)
   - Set the Allowed redirection URL(s) to `https://your-app-name.static.app/auth-callback.html`
   - Add the following scopes:
     - `read_products`
     - `write_products`
     - `read_assets`
     - `write_assets`

4. **Get API Credentials**
   - Copy your API key and API secret key
   - Keep these secure

## Step 2: Local Setup

1. **Clone/Download the Project**
   ```bash
   git clone <repository-url>
   cd shopify-media-manager
   ```

2. **Install Dependencies**
   ```bash
   # Install main dependencies
   npm install
   
   # Install serverless function dependencies
   cd functions
   npm install
   cd ..
   ```

3. **Configure Environment Variables**
   - Create a `.env` file in the root directory:
   ```
   SHOPIFY_API_KEY=your_api_key_here
   SHOPIFY_API_SECRET=your_api_secret_here
   ```

4. **Update Frontend Configuration**
   - Open `app.js`
   - Replace `YOUR_SHOPIFY_API_KEY` with your actual API key
   - Update the `redirectUri` to match your Static.app domain

## Step 3: Deploy to Static.app

### Option A: Using Static.app CLI

1. **Install Static.app CLI**
   ```bash
   npm install -g @static/cli
   ```

2. **Login to Static.app**
   ```bash
   static login
   ```

3. **Deploy**
   ```bash
   static deploy
   ```

### Option B: Using Git Integration

1. **Push to Git Repository**
   ```bash
   git add .
   git commit -m "Initial deployment"
   git push origin main
   ```

2. **Connect to Static.app**
   - Go to your Static.app dashboard
   - Click "New Site"
   - Connect your Git repository
   - Configure build settings

## Step 4: Configure Environment Variables in Static.app

1. **Go to Static.app Dashboard**
   - Navigate to your site settings
   - Go to "Environment Variables"

2. **Add Environment Variables**
   - `SHOPIFY_API_KEY`: Your Shopify API key
   - `SHOPIFY_API_SECRET`: Your Shopify API secret

## Step 5: Update Configuration Files

### Update static.json
Edit the `static.json` file to match your domain:

```json
{
  "root": ".",
  "clean_urls": true,
  "https_only": true,
  "error_page": "index.html",
  "routes": {
    "/api/**": {
      "proxy": "https://your-backend-api.com/api/**"
    }
  },
  "headers": {
    "/**": {
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  }
}
```

### Update app.js
Make sure the serverless function endpoint is correct:

```javascript
// In the OAuth callback section
const response = await fetch('/.netlify/functions/shopify-auth', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ code, shop })
});
```

## Step 6: Test the Deployment

1. **Visit Your Site**
   - Go to your Static.app domain
   - Verify the application loads correctly

2. **Test OAuth Flow**
   - Click "Connect to Shopify Store"
   - Enter a test store domain
   - Complete the OAuth process

3. **Test Media Operations**
   - Try downloading media files
   - Test file upload functionality

## Step 7: Troubleshooting

### Common Issues

1. **OAuth Redirect Error**
   - Ensure redirect URL in Shopify app settings matches exactly
   - Check for trailing slashes
   - Verify HTTPS is working

2. **Serverless Function Errors**
   - Check Static.app function logs
   - Verify environment variables are set
   - Ensure dependencies are installed

3. **CORS Errors**
   - Check that the serverless function has proper CORS headers
   - Verify the function endpoint URL

### Debug Mode

1. **Check Function Logs**
   - Go to Static.app dashboard
   - Navigate to Functions section
   - View logs for errors

2. **Browser Developer Tools**
   - Open browser dev tools
   - Check Network tab for failed requests
   - Look for console errors

## Step 8: Production Considerations

### Security
- ✅ HTTPS is automatically enabled by Static.app
- ✅ Environment variables are secure
- ✅ CORS is properly configured
- ✅ Input validation is implemented

### Performance
- Static.app provides global CDN
- Serverless functions scale automatically
- No server maintenance required

### Monitoring
- Use Static.app analytics
- Monitor function execution times
- Set up error alerts

## File Structure for Static.app

```
├── index.html              # Main application
├── auth-callback.html      # OAuth callback
├── styles.css             # Application styles
├── app.js                 # Main application logic
├── static.json            # Static.app configuration
├── functions/
│   ├── shopify-auth.js    # Serverless function
│   └── package.json       # Function dependencies
├── package.json           # Main dependencies
├── README.md              # Documentation
└── .gitignore             # Git ignore file
```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `SHOPIFY_API_KEY` | Your Shopify Partner API key | Yes |
| `SHOPIFY_API_SECRET` | Your Shopify Partner API secret | Yes |

## Support

For Static.app specific issues:
1. Check Static.app documentation
2. Review function logs in dashboard
3. Contact Static.app support

For Shopify API issues:
1. Check Shopify API documentation
2. Verify app permissions
3. Test with Shopify API tools

---

**Note**: This deployment uses Static.app's serverless functions for OAuth token exchange. The rest of the application runs entirely in the browser, making it fast and scalable. 