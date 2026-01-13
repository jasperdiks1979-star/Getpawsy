const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Full Customer Journey (E2E Mock)', () => {
  let testProduct = null;
  
  it('Step 1: Homepage loads', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
  });

  it('Step 2: Category page loads', async () => {
    const res = await fetch(`${BASE_URL}/dogs`);
    expect(res.status).toBe(200);
  });

  it('Step 3: Products are available', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=10`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const items = data.items || data.products || data;
    expect(items.length).toBeGreaterThan(0);
    testProduct = items[0];
  });

  it('Step 4: Product page loads', async () => {
    if (!testProduct) {
      const res = await fetch(`${BASE_URL}/api/products?limit=1`);
      const data = await res.json();
      testProduct = (data.items || data.products || data)[0];
    }
    
    const slug = testProduct.slug || testProduct.spu || testProduct.id;
    const res = await fetch(`${BASE_URL}/product/${slug}`);
    expect(res.status).toBe(200);
  });

  it('Step 5: Product has valid data for cart', async () => {
    if (!testProduct) {
      const res = await fetch(`${BASE_URL}/api/products?limit=1`);
      const data = await res.json();
      testProduct = (data.items || data.products || data)[0];
    }
    
    expect(testProduct.id || testProduct.spu).toBeDefined();
    expect(testProduct.price).toBeGreaterThan(0);
    expect(testProduct.title).toBeDefined();
  });

  it('Step 6: Health check passes', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
