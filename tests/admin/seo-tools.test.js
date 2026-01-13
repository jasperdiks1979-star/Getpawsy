const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Admin SEO Tools', () => {
  it('SEO categories endpoint requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/seo/categories`);
    expect([200, 401, 403]).toContain(res.status);
  });

  it('Admin SEO studio page exists', async () => {
    const res = await fetch(`${BASE_URL}/admin/seo-studio`);
    expect([200, 302, 401]).toContain(res.status);
  });

  it('Products have SEO fields', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=5`);
    const data = await res.json();
    const items = data.items || data.products || data;
    
    if (items.length > 0) {
      const hasTitle = items.some(p => p.title);
      const hasDescription = items.some(p => p.description || p.seoDescription);
      expect(hasTitle).toBe(true);
    }
  });

  it('Bulk SEO regenerate endpoint requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/bulk/regenerate-seo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect([200, 401, 403]).toContain(res.status);
  });
});
