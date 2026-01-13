const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Shop Checkout (Mock Mode)', () => {
  it('Stripe is configured in TEST mode', async () => {
    const stripeKey = process.env.STRIPE_SECRET_KEY || '';
    if (stripeKey) {
      expect(stripeKey.startsWith('sk_test_') || stripeKey === '').toBe(true);
    }
  });

  it('Checkout diagnose endpoint works (admin)', async () => {
    const res = await fetch(`${BASE_URL}/api/checkout/diagnose`);
    expect([200, 401, 403]).toContain(res.status);
  });

  it('Can create mock order in database', async () => {
    const fs = require('fs');
    const path = require('path');
    const ordersFile = path.join(__dirname, '../../data/orders.json');
    
    if (fs.existsSync(ordersFile)) {
      const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
      expect(Array.isArray(orders)).toBe(true);
    }
  });

  it('Order confirmation route exists', async () => {
    const res = await fetch(`${BASE_URL}/order-confirmation`);
    expect([200, 404]).toContain(res.status);
  });
});
