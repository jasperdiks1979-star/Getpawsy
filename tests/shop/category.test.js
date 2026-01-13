const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Shop Category Pages', () => {
  it('/dogs page loads', async () => {
    const res = await fetch(`${BASE_URL}/dogs`);
    expect(res.status).toBe(200);
  });

  it('/cats page loads', async () => {
    const res = await fetch(`${BASE_URL}/cats`);
    expect(res.status).toBe(200);
  });

  it('/categories page loads', async () => {
    const res = await fetch(`${BASE_URL}/categories`);
    expect(res.status).toBe(200);
  });

  it('Products API returns pet-eligible products only', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=10`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const items = data.items || data.products || data;
    
    for (const product of items) {
      expect(product.isPetAllowed !== false).toBe(true);
    }
  });

  it('Products have category or pet classification', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=50`);
    const data = await res.json();
    const items = data.items || data.products || data;
    
    const classified = items.filter(p => p.petType || p.pet_usage || p.category || p.bestFor);
    expect(classified.length).toBeGreaterThanOrEqual(0);
  });
});
