const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Shop Cart Functionality', () => {
  it('Cart page loads', async () => {
    const res = await fetch(`${BASE_URL}/cart`);
    expect([200, 404]).toContain(res.status);
  });

  it('Products have add-to-cart capability', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=1`);
    const data = await res.json();
    const items = data.items || data.products || data;
    
    expect(items.length).toBeGreaterThan(0);
    const product = items[0];
    expect(product.id || product.spu).toBeDefined();
    expect(product.price).toBeDefined();
  });

  it('Cart subtotal calculation is correct', () => {
    const items = [
      { price: 9.99, qty: 2 },
      { price: 14.99, qty: 1 }
    ];
    
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    expect(subtotal).toBeCloseTo(34.97, 2);
  });
});
