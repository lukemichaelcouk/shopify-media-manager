# Deployment Guide

This guide will help you deploy the Shopify Media Manager to production.

## Prerequisites

- Node.js 14+ installed
- A Shopify Partner account
- A web server with HTTPS support
- Domain name (optional but recommended)

## Step 1: Shopify Partner App Setup

1. **Create a Shopify Partner Account**
   - Go to [Shopify Partners](https://partners.shopify.com)
   - Sign up for a free partner account

2. **Create a New App**
   - In your partner dashboard, click "Apps" → "Create app"
   - Choose "Custom app" or "Public app" (Custom is simpler for personal use)
   - Give your app a name (e.g., "Media Manager")

3. **Configure App Settings**
   - Set the App URL to your domain (e.g., `https://yourdomain.com`)
   - Set the Allowed redirection URL(s) to `https://yourdomain.com/auth-callback.html`
   - Add the following scopes:
     - `read_products`
     - `write_products`
     - `read_assets`
     - `write_assets`

4. **Get API Credentials**
   - Copy your API key and API secret key
   - Keep these secure and never commit them to version control

## Step 2: Local Development Setup

1. **Clone/Download the Project**
   ```bash
   git clone <repository-url>
   cd shopify-media-manager
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` and add your Shopify credentials:
   ```
   SHOPIFY_API_KEY=your_api_key_here
   SHOPIFY_API_SECRET=your_api_secret_here
   PORT=3000
   ```

4. **Update Frontend Configuration**
   - Open `app.js`
   - Replace `YOUR_SHOPIFY_API_KEY` with your actual API key
   - Update the `redirectUri` to match your domain

5. **Test Locally**
   ```bash
   npm run dev
   ```
   
   Visit `http://localhost:3000` to test the application

## Step 3: Production Deployment

### Option A: Traditional Web Server (Apache/Nginx)

1. **Upload Files**
   - Upload all files to your web server
   - Ensure the directory is accessible via HTTPS

2. **Configure Web Server**
   
   **Apache (.htaccess):**
   ```apache
   RewriteEngine On
   RewriteCond %{HTTPS} off
   RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
   
   # Handle SPA routing
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule ^(.*)$ /index.html [L]
   ```
   
   **Nginx:**
   ```nginx
   server {
       listen 443 ssl;
       server_name yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       root /var/www/shopify-media-manager;
       index index.html;
       
       location / {
           try_files $uri $uri/ /index.html;
       }
       
       location /api/ {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

3. **Start Backend Server**
   ```bash
   npm start
   ```
   
   Consider using PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "shopify-media-manager"
   pm2 startup
   pm2 save
   ```

### Option B: Cloud Platforms

#### Heroku
1. **Create Heroku App**
   ```bash
   heroku create your-app-name
   ```

2. **Set Environment Variables**
   ```bash
   heroku config:set SHOPIFY_API_KEY=your_api_key
   heroku config:set SHOPIFY_API_SECRET=your_api_secret
   ```

3. **Deploy**
   ```bash
   git push heroku main
   ```

#### Vercel
1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

3. **Set Environment Variables**
   - Go to your Vercel dashboard
   - Add `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`

#### Netlify
1. **Create `netlify.toml`**
   ```toml
   [build]
     publish = "."
     functions = "functions"
   
   [[redirects]]
     from = "/api/*"
     to = "/.netlify/functions/api/:splat"
     status = 200
   ```

2. **Deploy via Git or Netlify CLI**

## Step 4: SSL Certificate Setup

HTTPS is required for OAuth to work properly.

### Let's Encrypt (Free)
```bash
sudo apt-get install certbot
sudo certbot --nginx -d yourdomain.com
```

### Cloudflare (Free SSL)
1. Add your domain to Cloudflare
2. Update nameservers
3. Enable "Always Use HTTPS"

## Step 5: Final Configuration

1. **Update Shopify App Settings**
   - Go back to your Shopify Partner dashboard
   - Update the App URL and redirect URL to your production domain
   - Test the OAuth flow

2. **Test the Application**
   - Visit your production URL
   - Try connecting to a test Shopify store
   - Test download and upload functionality

## Step 6: Monitoring and Maintenance

### Logs
```bash
# View application logs
pm2 logs shopify-media-manager

# View nginx logs
sudo tail -f /var/log/nginx/access.log
```

### Updates
```bash
# Pull latest changes
git pull origin main

# Restart application
pm2 restart shopify-media-manager
```

### Backup
- Regularly backup your `.env` file
- Consider backing up downloaded media files
- Monitor disk space usage

## Troubleshooting

### Common Issues

1. **OAuth Redirect Error**
   - Ensure redirect URL matches exactly
   - Check for trailing slashes
   - Verify HTTPS is working

2. **CORS Errors**
   - Check CORS configuration in `server.js`
   - Verify API endpoint URLs

3. **File Upload Failures**
   - Check file size limits
   - Verify file permissions
   - Monitor server logs

4. **API Rate Limits**
   - Implement retry logic
   - Add delays between requests
   - Monitor API usage

### Debug Mode
Enable debug logging by setting:
```bash
export DEBUG=shopify-media-manager:*
```

## Security Checklist

- [ ] HTTPS enabled
- [ ] Environment variables secured
- [ ] API keys not in version control
- [ ] CORS properly configured
- [ ] Input validation implemented
- [ ] Rate limiting configured
- [ ] Error handling in place
- [ ] Regular security updates

## Support

For deployment issues:
1. Check the logs
2. Verify configuration
3. Test with a simple Shopify store first
4. Contact support with specific error messages 