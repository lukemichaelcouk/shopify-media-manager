# Shopify Custom App Setup Instructions

## Fix the "Installation Link Invalid" Error

The error occurs because your Custom App is not properly configured for OAuth. Follow these steps to fix it:

### Option 1: Update Existing Custom App

1. **Go to Shopify Partner Dashboard**
   - Visit: https://partners.shopify.com
   - Sign in to your account

2. **Find Your Custom App**
   - Go to "Apps" → "Custom apps"
   - Click on "SpreeCompress"

3. **Update App Configuration**
   - Click "App setup" or "Configuration"
   - Set **App URL** to: `http://localhost:3000`
   - Add **Allowed redirection URL(s)**: `http://localhost:3000/auth-callback.html`
   - Save changes

### Option 2: Create New Custom App

If you can't update the existing app:

1. **Create New Custom App**
   - Go to "Apps" → "Custom apps"
   - Click "Create custom app"
   - Name: "SpreeCompress"
   - App developer: Your name

2. **Configure App Settings**
   - **App URL**: `http://localhost:3000`
   - **Allowed redirection URL(s)**: `http://localhost:3000/auth-callback.html`

3. **Configure API Scopes**
   - Go to "API credentials"
   - Enable these scopes:
     - `read_products`
     - `write_products`
     - `read_themes`
     - `write_themes`

4. **Get New Credentials**
   - Copy the new **API key** and **API secret key**
   - Update your `.env` file with the new credentials

### Option 3: Use Public App (Alternative)

If Custom App continues to have issues:

1. **Create Public App**
   - Go to "Apps" → "Public apps"
   - Click "Create app"
   - Choose "Public app"

2. **Configure for Development**
   - Set App URL to your development URL
   - Add redirect URLs
   - This bypasses Custom App limitations

## Test After Configuration

After updating the app configuration:

1. **Restart your server**: `npm run server`
2. **Test OAuth**: Go to `http://localhost:3000/test-oauth.html`
3. **Try the OAuth flow** - it should now work properly

## Common Issues

- **App URL mismatch**: Must be exactly `http://localhost:3000`
- **Missing redirect URL**: Must include the callback URL
- **Wrong scopes**: Ensure all required scopes are enabled
- **App not active**: Make sure the app status is "Active" 