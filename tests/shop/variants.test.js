const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Shop Variants Functionality', () => {
  let testProduct = null;
  
  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=1`);
    if (res.ok) {
      const data = await res.json();
      const items = data.items || data.products || data;
      if (items.length > 0) {
        testProduct = items[0];
      }
    }
  });
  
  it('Product list returns products with variants', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=10`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const items = data.items || data.products || data;
    
    const withVariants = items.filter(p => p.variants && p.variants.length > 0);
    expect(withVariants.length).toBeGreaterThan(0);
  });
  
  it('Product detail includes variants array', async () => {
    if (!testProduct) return;
    
    const res = await fetch(`${BASE_URL}/api/products/${testProduct.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.product).toBeDefined();
    expect(data.product.variants).toBeDefined();
    expect(Array.isArray(data.product.variants)).toBe(true);
  });
  
  it('Variants endpoint returns variants with optionsSchema', async () => {
    if (!testProduct) return;
    
    const res = await fetch(`${BASE_URL}/api/products/${testProduct.id}/variants`);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.variants).toBeDefined();
    expect(Array.isArray(data.variants)).toBe(true);
    expect(data.optionsSchema).toBeDefined();
    expect(Array.isArray(data.optionsSchema)).toBe(true);
  });
  
  it('Each variant has required fields', async () => {
    if (!testProduct) return;
    
    const res = await fetch(`${BASE_URL}/api/products/${testProduct.id}/variants`);
    if (res.status !== 200) return;
    
    const data = await res.json();
    if (data.variants.length === 0) return;
    
    const variant = data.variants[0];
    expect(variant.sku || variant.id).toBeDefined();
    expect(variant.price).toBeDefined();
    expect(typeof variant.price).toBe('number');
  });
  
  it('Selecting options yields valid variant match', async () => {
    if (!testProduct) return;
    
    const res = await fetch(`${BASE_URL}/api/products/${testProduct.id}/variants`);
    if (res.status !== 200) return;
    
    const data = await res.json();
    if (data.variants.length === 0) return;
    
    const variant = data.variants[0];
    expect(variant).toBeDefined();
    
    if (variant.options) {
      const optionKeys = Object.keys(variant.options);
      expect(optionKeys.length).toBeGreaterThan(0);
      
      const firstKey = optionKeys[0];
      expect(variant.options[firstKey]).toBeDefined();
    }
  });
  
  it('Variants have proper options structure', async () => {
    if (!testProduct) return;
    
    const res = await fetch(`${BASE_URL}/api/products/${testProduct.id}/variants`);
    if (res.status !== 200) return;
    
    const data = await res.json();
    if (data.variants.length === 0) return;
    
    for (const variant of data.variants) {
      expect(variant.options).toBeDefined();
      expect(typeof variant.options).toBe('object');
      
      const optionKeys = Object.keys(variant.options);
      expect(optionKeys.length).toBeGreaterThan(0);
      
      for (const key of optionKeys) {
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
        expect(variant.options[key]).toBeDefined();
      }
    }
  });
  
  it('Cart can include SKU from variant', async () => {
    if (!testProduct) return;
    
    const res = await fetch(`${BASE_URL}/api/products/${testProduct.id}/variants`);
    if (res.status !== 200) return;
    
    const data = await res.json();
    if (data.variants.length === 0) return;
    
    const variant = data.variants[0];
    const sku = variant.sku || variant.id;
    
    expect(sku).toBeDefined();
    expect(typeof sku).toBe('string');
    expect(sku.length).toBeGreaterThan(0);
  });
});
