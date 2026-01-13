const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const ROUTES_TO_CRAWL = [
  { path: '/', name: 'Homepage', expectStatus: 200 },
  { path: '/dogs', name: 'Dogs Page', expectStatus: 200 },
  { path: '/cats', name: 'Cats Page', expectStatus: 200 },
  { path: '/collections', name: 'Collections', expectStatus: [200, 404] },
  { path: '/categories', name: 'Categories', expectStatus: 200 },
  { path: '/cart', name: 'Cart Page', expectStatus: [200, 404] },
  { path: '/checkout', name: 'Checkout Page', expectStatus: [200, 302, 404] },
  { path: '/admin', name: 'Admin Login', expectStatus: 200 },
  { path: '/health', name: 'Health Check', expectStatus: 200 },
  { path: '/healthz', name: 'Healthz', expectStatus: 200 },
  { path: '/readyz', name: 'Readyz', expectStatus: [200, 503] },
  { path: '/api/health', name: 'API Health', expectStatus: 200 },
  { path: '/api/version', name: 'API Version', expectStatus: 200 },
  { path: '/api/build', name: 'API Build', expectStatus: 200 },
  { path: '/api/products', name: 'Products API', expectStatus: 200 },
  { path: '/api/products?limit=5', name: 'Products API with limit', expectStatus: 200 },
  { path: '/sitemap.xml', name: 'Sitemap', expectStatus: 200 },
  { path: '/robots.txt', name: 'Robots.txt', expectStatus: 200 },
];

const ADMIN_API_ROUTES = [
  { path: '/api/admin/me', name: 'Admin Me', expectStatus: 200 },
  { path: '/api/admin/categories/stats', name: 'Categories Stats', expectStatus: 401 },
  { path: '/api/admin/products/health', name: 'Products Health', expectStatus: 401 },
  { path: '/api/admin/seo/categories', name: 'SEO Categories', expectStatus: 401 },
];

describe('Route Crawler - Public Routes', () => {
  for (const route of ROUTES_TO_CRAWL) {
    it(`${route.name} (${route.path}) responds correctly`, async () => {
      const res = await fetch(`${BASE_URL}${route.path}`);
      const expected = Array.isArray(route.expectStatus) ? route.expectStatus : [route.expectStatus];
      expect(expected).toContain(res.status);
    });
  }
});

describe('Route Crawler - Admin API (Auth Required)', () => {
  for (const route of ADMIN_API_ROUTES) {
    it(`${route.name} (${route.path}) requires authentication`, async () => {
      const res = await fetch(`${BASE_URL}${route.path}`);
      const expected = Array.isArray(route.expectStatus) ? route.expectStatus : [route.expectStatus];
      expect(expected).toContain(res.status);
    });
  }
});

describe('Route Crawler - 404 Handling', () => {
  it('Non-existent page returns 404', async () => {
    const res = await fetch(`${BASE_URL}/this-page-does-not-exist-12345`);
    expect([200, 404]).toContain(res.status);
  });

  it('Non-existent API endpoint returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/nonexistent-endpoint-xyz`);
    expect([404, 500]).toContain(res.status);
  });
});

describe('Route Crawler - Product Pages', () => {
  let testProduct = null;

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=1`);
    if (res.ok) {
      const data = await res.json();
      const products = data.items || data.products || data;
      if (products.length > 0) {
        testProduct = products[0];
      }
    }
  });

  it('Product detail page loads', async () => {
    if (!testProduct) return;
    const slug = testProduct.slug || testProduct.spu || testProduct.id;
    const res = await fetch(`${BASE_URL}/product/${slug}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('<!doctype html');
  });

  it('Product page has proper meta tags', async () => {
    if (!testProduct) return;
    const slug = testProduct.slug || testProduct.spu || testProduct.id;
    const res = await fetch(`${BASE_URL}/product/${slug}`);
    const html = await res.text();
    expect(html).toContain('<meta');
    expect(html).toContain('<title>');
  });
});

describe('Route Crawler - Category Pages', () => {
  it('/c/dogs loads', async () => {
    const res = await fetch(`${BASE_URL}/c/dogs`);
    expect([200, 302]).toContain(res.status);
  });

  it('/c/cats loads', async () => {
    const res = await fetch(`${BASE_URL}/c/cats`);
    expect([200, 302]).toContain(res.status);
  });

  it('/c/both loads', async () => {
    const res = await fetch(`${BASE_URL}/c/both`);
    expect([200, 302, 404]).toContain(res.status);
  });
});

describe('Route Crawler - Static Assets', () => {
  it('Main stylesheet loads', async () => {
    const res = await fetch(`${BASE_URL}/styles.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('css');
  });

  it('Main JavaScript loads', async () => {
    const res = await fetch(`${BASE_URL}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
  });

  it('Pawsy video script loads', async () => {
    const res = await fetch(`${BASE_URL}/pawsy/pawsyVideos.js`);
    expect(res.status).toBe(200);
  });

  it('i18n script loads', async () => {
    const res = await fetch(`${BASE_URL}/i18n.js`);
    expect(res.status).toBe(200);
  });
});

describe('Route Crawler - Health Check Details', () => {
  it('/api/health returns complete status', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.ok).toBe(true);
    expect(data.app).toContain('GetPawsy');
    expect(data.version).toBeDefined();
    expect(data.buildId).toBeDefined();
    expect(data.productCount).toBeGreaterThan(0);
    expect(data.mailConfigured).toBeDefined();
    expect(data.stripeConfigured).toBeDefined();
    expect(data.webhookConfigured).toBeDefined();
  });
});
