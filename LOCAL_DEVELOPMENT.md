# Local Development Guide

This guide will help you preview the Shopify Media Manager locally before deploying to Static.app.

## Prerequisites

- Node.js 14+ installed
- npm or yarn package manager
- A Shopify Partner account (optional for basic preview)

## Quick Start

### 1. Install Dependencies

```bash
# Install main dependencies
npm install

# Install serverless function dependencies
cd functions
npm install
cd ..
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
# Copy the example file
cp env.example .env
```

Edit `.env` and add your Shopify credentials (optional for basic preview):

```env
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
PORT=3000
NODE_ENV=development
```

### 3. Start Local Development Server

```bash
# Start both the main server and serverless functions
npm run dev
```

This will start:
- Main server on `http://localhost:3000`
- Netlify dev server on `http://localhost:8888` (for serverless functions)

### 4. Preview the Application

Open your browser and visit:
- **Main App**: http://localhost:3000
- **With Functions**: http://localhost:8888

## Development Options

### Option A: Simple Static Preview (No OAuth)

If you just want to see the UI without Shopify integration:

```bash
# Start only the static server
npm run server
```

Visit: http://localhost:3000

### Option B: Full Preview with OAuth

For full functionality including Shopify OAuth:

1. **Set up Shopify Partner App** (see STATIC_APP_DEPLOYMENT.md)
2. **Configure environment variables** with your API credentials
3. **Start the full development environment**:

```bash
npm run dev
```

Visit: http://localhost:8888

## File Structure for Local Development

```
├── index.html              # Main application
├── auth-callback.html      # OAuth callback
├── styles.css             # Application styles
├── app.js                 # Main application logic
├── server.js              # Local development server
├── netlify.toml           # Netlify/Static.app configuration
├── package.json           # Dependencies and scripts
├── functions/
│   ├── shopify-auth.js    # Serverless function
│   └── package.json       # Function dependencies
├── .env                   # Environment variables (create this)
└── env.example            # Environment variables template
```

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and functions |
| `npm run server` | Start only the main server |
| `npm run functions` | Start only the serverless functions |
| `npm start` | Start production server |

## Testing Different Scenarios

### 1. UI/UX Testing
- Start with `npm run server`
- Test responsive design
- Check all UI interactions
- Verify animations and transitions

### 2. OAuth Flow Testing
- Set up Shopify Partner app
- Configure environment variables
- Use `npm run dev`
- Test complete OAuth flow

### 3. API Testing
- Check health endpoint: http://localhost:3000/api/health
- Test OAuth endpoint: POST http://localhost:3000/api/shopify/exchange-code

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Kill process on port 3000
   lsof -ti:3000 | xargs kill -9
   
   # Or use a different port
   PORT=3001 npm run server
   ```

2. **Environment Variables Not Loading**
   ```bash
   # Check if .env file exists
   ls -la .env
   
   # Verify variables are loaded
   node -e "require('dotenv').config(); console.log(process.env.SHOPIFY_API_KEY)"
   ```

3. **Serverless Functions Not Working**
   ```bash
   # Install Netlify CLI globally
   npm install -g netlify-cli
   
   # Check function logs
   netlify dev --debug
   ```

4. **CORS Errors**
   - Ensure the server is running on the correct port
   - Check that CORS is properly configured in server.js
   - Verify the function endpoint URL in app.js

### Debug Mode

Enable debug logging:

```bash
# For the main server
DEBUG=* npm run server

# For Netlify functions
netlify dev --debug
```

### Browser Developer Tools

1. **Open Dev Tools** (F12)
2. **Check Console** for JavaScript errors
3. **Check Network** tab for failed requests
4. **Check Application** tab for localStorage issues

## Hot Reloading

The development server will automatically reload when you make changes to:
- HTML files
- CSS files
- JavaScript files
- Server files (with nodemon)

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SHOPIFY_API_KEY` | Shopify Partner API key | For OAuth | - |
| `SHOPIFY_API_SECRET` | Shopify Partner API secret | For OAuth | - |
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment | No | development |

## Next Steps

After local testing:

1. **Fix any issues** found during local testing
2. **Test OAuth flow** with a real Shopify store
3. **Deploy to Static.app** (see STATIC_APP_DEPLOYMENT.md)
4. **Configure production environment** variables

## Support

For local development issues:
1. Check the console output for error messages
2. Verify all dependencies are installed
3. Ensure environment variables are set correctly
4. Check browser developer tools for client-side errors

---

**Note**: Local development simulates the Static.app environment, so any issues you find and fix locally should work the same way in production. 