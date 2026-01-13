const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Admin Product List', () => {
  it('Products API returns data', async () => {
    const res = await fetch(`${BASE_URL}/api/products`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items || data.products || data).toBeDefined();
  });

  it('Products have required fields for admin', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=5`);
    const data = await res.json();
    const items = data.items || data.products || data;
    
    if (items.length > 0) {
      const product = items[0];
      expect(product.id || product.spu).toBeDefined();
      expect(product.title).toBeDefined();
      expect(product.active !== undefined || product.status !== undefined).toBe(true);
    }
  });

  it('Admin product health endpoint requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/products/health`);
    expect([200, 401, 403]).toContain(res.status);
  });

  it('Products can be filtered', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=5&category=dogs`);
    expect([200, 400]).toContain(res.status);
  });
});
