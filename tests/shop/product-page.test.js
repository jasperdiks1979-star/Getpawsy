const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Shop Product Pages', () => {
  let testProduct = null;

  it('Products API returns products', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=5`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const items = data.items || data.products || data;
    expect(items.length).toBeGreaterThan(0);
    testProduct = items[0];
  });

  it('Product page loads for valid product', async () => {
    if (!testProduct) {
      const res = await fetch(`${BASE_URL}/api/products?limit=1`);
      const data = await res.json();
      testProduct = (data.items || data.products || data)[0];
    }
    
    const slug = testProduct.slug || testProduct.spu || testProduct.id;
    const res = await fetch(`${BASE_URL}/product/${slug}`);
    expect(res.status).toBe(200);
  });

  it('Product has required fields', async () => {
    if (!testProduct) {
      const res = await fetch(`${BASE_URL}/api/products?limit=1`);
      const data = await res.json();
      testProduct = (data.items || data.products || data)[0];
    }
    
    expect(testProduct.title).toBeDefined();
    expect(testProduct.price).toBeDefined();
    expect(testProduct.image || testProduct.images).toBeDefined();
  });

  it('Product has valid price', async () => {
    if (!testProduct) {
      const res = await fetch(`${BASE_URL}/api/products?limit=1`);
      const data = await res.json();
      testProduct = (data.items || data.products || data)[0];
    }
    
    expect(typeof testProduct.price).toBe('number');
    expect(testProduct.price).toBeGreaterThan(0);
  });
});
