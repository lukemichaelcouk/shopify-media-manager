const axios = require('axios');

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { code, shop } = JSON.parse(event.body);

    if (!code || !shop) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing code or shop parameter' })
      };
    }

    // Exchange code for access token
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code: code
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token: response.data.access_token,
        shop: shop
      })
    };

  } catch (error) {
    console.error('OAuth token exchange error:', error.response?.data || error.message);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to exchange code for token',
        details: error.response?.data || error.message
      })
    };
  }
}; 