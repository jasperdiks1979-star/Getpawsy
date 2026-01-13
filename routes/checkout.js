const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('checkout', {
    title: 'Checkout - GetPawsy',
    user: req.session?.user || null
  });
});

router.post('/api/validate/contact', (req, res) => {
  const { email, phone } = req.body;
  const errors = [];
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: 'email', message: 'Please enter a valid email address' });
  }
  
  if (phone && phone.replace(/\D/g, '').length < 10) {
    errors.push({ field: 'phone', message: 'Please enter a valid phone number' });
  }
  
  res.json({ valid: errors.length === 0, errors });
});

router.post('/api/validate/shipping', (req, res) => {
  const { first_name, last_name, address, city, state, zip } = req.body;
  const errors = [];
  
  if (!first_name) errors.push({ field: 'first_name', message: 'First name is required' });
  if (!last_name) errors.push({ field: 'last_name', message: 'Last name is required' });
  if (!address) errors.push({ field: 'address', message: 'Address is required' });
  if (!city) errors.push({ field: 'city', message: 'City is required' });
  if (!state) errors.push({ field: 'state', message: 'State is required' });
  if (!zip || zip.length < 5) errors.push({ field: 'zip', message: 'Valid ZIP code is required' });
  
  res.json({ valid: errors.length === 0, errors });
});

router.post('/api/validate/payment', (req, res) => {
  const { card_number, expiry, cvv, name_on_card } = req.body;
  const errors = [];
  
  const cleanCard = (card_number || '').replace(/\s/g, '');
  if (!cleanCard || cleanCard.length < 15) {
    errors.push({ field: 'card_number', message: 'Please enter a valid card number' });
  }
  
  if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry)) {
    errors.push({ field: 'expiry', message: 'Please enter a valid expiry date (MM/YY)' });
  }
  
  if (!cvv || cvv.length < 3) {
    errors.push({ field: 'cvv', message: 'Please enter a valid CVV' });
  }
  
  if (!name_on_card) {
    errors.push({ field: 'name_on_card', message: 'Name on card is required' });
  }
  
  res.json({ valid: errors.length === 0, errors });
});

router.post('/api/calculate', (req, res) => {
  const { items, shipping_method, state } = req.body;
  
  const subtotal = (items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  let shipping = 0;
  if (shipping_method === 'express') shipping = 9.99;
  else if (shipping_method === 'overnight') shipping = 19.99;
  
  const taxRate = 0.0825;
  const tax = subtotal * taxRate;
  const total = subtotal + shipping + tax;
  
  res.json({
    success: true,
    subtotal,
    shipping,
    tax,
    total
  });
});

router.get('/api/session', (req, res) => {
  res.json({ checkout: req.session?.checkout || {} });
});

router.post('/api/session', (req, res) => {
  if (!req.session) req.session = {};
  req.session.checkout = req.body;
  res.json({ success: true });
});

router.post('/api/process', async (req, res) => {
  const { contact, shipping_address, payment, shipping_method, items } = req.body;
  
  if (!contact?.email || !shipping_address?.first_name || !items?.length) {
    return res.json({ success: false, error: 'Missing required order information' });
  }
  
  const orderId = 'GP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
  
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  let shipping = 0;
  if (shipping_method === 'express') shipping = 9.99;
  else if (shipping_method === 'overnight') shipping = 19.99;
  const tax = subtotal * 0.0825;
  const total = subtotal + shipping + tax;
  
  const order = {
    id: orderId,
    status: 'confirmed',
    created_at: new Date().toISOString(),
    customer: {
      email: contact.email,
      phone: contact.phone || ''
    },
    shipping_address: {
      name: `${shipping_address.first_name} ${shipping_address.last_name}`,
      address: shipping_address.address,
      city: shipping_address.city,
      state: shipping_address.state,
      zip: shipping_address.zip,
      country: shipping_address.country || 'US'
    },
    shipping_method,
    items: items.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    })),
    totals: { subtotal, shipping, tax, total }
  };
  
  try {
    const fs = require('fs');
    const ordersPath = './data/orders.json';
    let orders = [];
    
    if (fs.existsSync(ordersPath)) {
      orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    }
    
    orders.push(order);
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
    
    if (req.session) {
      req.session.cart = [];
      req.session.checkout = {};
    }
    
    res.json({ success: true, order_id: orderId });
  } catch (error) {
    console.error('Order save error:', error);
    res.json({ success: false, error: 'Failed to save order' });
  }
});

module.exports = router;
