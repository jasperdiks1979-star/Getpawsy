const express = require('express');
const router = express.Router();

// Main API endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'operational',
    version: 'v14.5',
    message: 'GetPawsy API is running',
    endpoints: [
      '/api/chatbot',
      '/api/auth',
      '/api/cart',
      '/api/checkout',
      '/api/payment',
      '/api/profile',
      '/api/search',
      '/api/recommend'
    ]
  });
});

// API health check
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;
