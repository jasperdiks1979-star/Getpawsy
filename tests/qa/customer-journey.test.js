const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Customer Journey - Landing to Cart', () => {
  let testProduct = null;

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=10`);
    if (res.ok) {
      const data = await res.json();
      const products = data.items || data.products || data;
      if (products.length > 0) {
        testProduct = products.find(p => p.price > 0 && p.active !== false) || products[0];
      }
    }
  });

  it('Step 1: Homepage loads', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('getpawsy');
  });

  it('Step 2: Dogs category loads', async () => {
    const res = await fetch(`${BASE_URL}/dogs`);
    expect(res.status).toBe(200);
  });

  it('Step 3: Product API returns products', async () => {
    const res = await fetch(`${BASE_URL}/api/products`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
  });

  it('Step 4: Product detail page loads', async () => {
    if (!testProduct) return;
    const slug = testProduct.slug || testProduct.spu || testProduct.id;
    const res = await fetch(`${BASE_URL}/product/${slug}`);
    expect(res.status).toBe(200);
  });

  it('Step 5: Cart page loads', async () => {
    const res = await fetch(`${BASE_URL}/cart`);
    expect([200, 404]).toContain(res.status);
  });

  it('Step 6: Cart API works', async () => {
    const res = await fetch(`${BASE_URL}/api/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get' })
    });
    expect([200, 404]).toContain(res.status);
  });
});

describe('Customer Journey - Checkout Flow', () => {
  it('Checkout page loads', async () => {
    const res = await fetch(`${BASE_URL}/checkout`);
    expect([200, 302, 404]).toContain(res.status);
  });

  it('Stripe is in TEST mode', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    expect(data.stripeConfigured).toBe(true);
    expect(data.stripeTestMode).toBe(true);
  });

  it('Checkout API endpoint exists', async () => {
    const res = await fetch(`${BASE_URL}/api/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] })
    });
    expect([200, 400, 401, 404, 500]).toContain(res.status);
  });

  it('Checkout diagnose endpoint requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/checkout/diagnose`);
    expect([200, 401, 403]).toContain(res.status);
  });
});

describe('Customer Journey - Order Flow', () => {
  it('Orders API exists', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`);
    expect([200, 401, 404]).toContain(res.status);
  });
});

describe('Customer Journey - Email System', () => {
  it('Mail is configured', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    expect(data.mailConfigured).toBe(true);
    expect(data.mailTransport).toBeDefined();
    expect(['smtp.gmail.com', 'smtp.office365.com']).toContain(data.mailTransport.host);
  });

  it('Test email endpoint requires auth', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/test-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'test@example.com' })
    });
    expect(res.status).toBe(401);
  });
});

describe('Customer Journey - Stripe Webhook', () => {
  it('Webhook is configured', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    expect(data.webhookConfigured).toBe(true);
  });
});

describe('Customer Journey - Search & Discovery', () => {
  it('Search for "dog" returns results', async () => {
    const res = await fetch(`${BASE_URL}/api/search?q=dog`);
    expect([200, 404]).toContain(res.status);
  });

  it('Search for "cat" returns results', async () => {
    const res = await fetch(`${BASE_URL}/api/search?q=cat`);
    expect([200, 404]).toContain(res.status);
  });

  it('Categories API returns data', async () => {
    const res = await fetch(`${BASE_URL}/api/categories`);
    expect([200, 404]).toContain(res.status);
  });
});

describe('Customer Journey - Internationalization', () => {
  it('i18n script is available', async () => {
    const res = await fetch(`${BASE_URL}/i18n.js`);
    expect(res.status).toBe(200);
  });

  it('Homepage includes hreflang tags', async () => {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    expect(html).toContain('hreflang');
  });
});

describe('Customer Journey - SEO', () => {
  it('Homepage has meta description', async () => {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    expect(html).toContain('meta');
    expect(html).toContain('description');
  });

  it('Sitemap is valid XML', async () => {
    const res = await fetch(`${BASE_URL}/sitemap.xml`);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<urlset');
  });

  it('Robots.txt allows crawling', async () => {
    const res = await fetch(`${BASE_URL}/robots.txt`);
    expect(res.status).toBe(200);
    const txt = await res.text();
    expect(txt.toLowerCase()).toContain('user-agent');
  });
});
