const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PROOF_DIR = path.join(__dirname, '../../public/qa-proof/fast');

async function saveProof(page, name) {
  if (!fs.existsSync(PROOF_DIR)) {
    fs.mkdirSync(PROOF_DIR, { recursive: true });
  }
  const screenshotPath = path.join(PROOF_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`[PROOF] ${screenshotPath}`);
  return screenshotPath;
}

test.describe('Fast QA - Navigation', () => {
  test('Homepage loads with products', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    
    const html = await res.text();
    expect(html).toContain('GetPawsy');
    expect(html).toContain('product');
    
    console.log('[NAV] Homepage loaded successfully');
  });

  test('Dogs collection loads', async ({ request }) => {
    const res = await request.get('/dogs');
    expect(res.status()).toBe(200);
    
    const html = await res.text();
    expect(html.toLowerCase()).toContain('dog');
    
    console.log('[NAV] Dogs collection loaded');
  });

  test('Cats collection loads', async ({ request }) => {
    const res = await request.get('/cats');
    expect(res.status()).toBe(200);
    
    const html = await res.text();
    expect(html.toLowerCase()).toContain('cat');
    
    console.log('[NAV] Cats collection loaded');
  });

  test('Small Pets collection loads', async ({ request }) => {
    const res = await request.get('/small-pets');
    expect(res.status()).toBe(200);
    
    const html = await res.text();
    expect(html.toLowerCase()).toContain('small');
    
    console.log('[NAV] Small Pets collection loaded');
  });
});

test.describe('Fast QA - PDP', () => {
  test('Dog product PDP loads with add-to-cart button', async ({ request }) => {
    const res = await request.get('/api/products?limit=50');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    const dogProduct = products.find(p => 
      (p.pet_type || p.petType || '').toLowerCase().includes('dog')
    );
    
    expect(dogProduct).toBeDefined();
    const slug = dogProduct.slug || dogProduct.id;
    
    const pdpRes = await request.get(`/product/${slug}/`);
    expect(pdpRes.status()).toBe(200);
    
    const html = await pdpRes.text();
    expect(html).toContain(dogProduct.name || dogProduct.title || slug);
    expect(html.toLowerCase()).toContain('add');
    expect(html.toLowerCase()).toContain('cart');
    
    console.log(`[PDP] Dog product loaded: ${slug}`);
  });

  test('Cat product PDP loads', async ({ request }) => {
    const res = await request.get('/api/products?limit=50');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    const catProduct = products.find(p => 
      (p.pet_type || p.petType || '').toLowerCase().includes('cat')
    );
    
    expect(catProduct).toBeDefined();
    const slug = catProduct.slug || catProduct.id;
    
    const pdpRes = await request.get(`/product/${slug}/`);
    expect(pdpRes.status()).toBe(200);
    
    const html = await pdpRes.text();
    expect(html.toLowerCase()).toContain('cat');
    
    console.log(`[PDP] Cat product loaded: ${slug}`);
  });

  test('Small pet product PDP loads', async ({ request }) => {
    const qaRes = await request.get('/health/qa');
    const qaData = await qaRes.json();
    
    const catCheck = qaData.checks?.find(c => c.name === 'Categories Distribution (Strict)');
    const hasSmallPets = catCheck?.smallPets > 0;
    
    if (!hasSmallPets) {
      console.log('[PDP] No small pet products in catalog - skipping');
      return;
    }
    
    const res = await request.get('/small-pets');
    expect(res.status()).toBe(200);
    
    const html = await res.text();
    expect(html.toLowerCase()).toContain('small');
    
    console.log(`[PDP] Small pets page loaded with ${catCheck?.smallPets} products`);
  });
});

test.describe('Fast QA - Cart System', () => {
  test('Cart system is configured correctly', async ({ request }) => {
    const res = await request.get('/health/qa');
    const data = await res.json();
    
    const cartCheck = data.checks?.find(c => c.name === 'Cart System');
    expect(cartCheck?.status).toBe('pass');
    expect(cartCheck?.version).toBe('2.7.0');
    
    console.log(`[CART] Version: ${cartCheck?.version}, Features: ${cartCheck?.features?.join(', ')}`);
  });

  test('Cart JS files are accessible', async ({ request }) => {
    const storeRes = await request.get('/js/cart-store.js');
    expect(storeRes.status()).toBe(200);
    
    const delegateRes = await request.get('/js/cart-delegate.js');
    expect(delegateRes.status()).toBe(200);
    
    const storeContent = await storeRes.text();
    expect(storeContent).toContain('gp_cart_v2');
    expect(storeContent).toContain('addItem');
    
    console.log('[CART] cart-store.js and cart-delegate.js accessible');
  });
});

test.describe('Fast QA - Data Integrity', () => {
  test('Products API returns data', async ({ request }) => {
    const res = await request.get('/api/products?limit=500');
    expect(res.status()).toBe(200);
    
    const data = await res.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
    
    console.log(`[DATA] Total products: ${products.length}`);
  });

  test('All products have images', async ({ request }) => {
    const res = await request.get('/api/products?limit=500');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    const missingImages = products.filter(p => {
      const hasImage = p.images?.length > 0 || p.image || p.originalImages?.length > 0 || p.thumbnail;
      return !hasImage;
    });
    
    expect(missingImages.length).toBe(0);
    console.log(`[IMAGES] All ${products.length} products have images`);
  });

  test('Category distribution is correct', async ({ request }) => {
    const qaRes = await request.get('/health/qa');
    const data = await qaRes.json();
    
    const catCheck = data.checks?.find(c => c.name === 'Categories Distribution (Strict)');
    expect(catCheck?.status).toBe('pass');
    expect(catCheck?.dogs).toBeGreaterThan(0);
    expect(catCheck?.cats).toBeGreaterThan(0);
    expect(catCheck?.smallPets).toBeGreaterThan(0);
    
    console.log(`[CATEGORIES] Dogs: ${catCheck?.dogs}, Cats: ${catCheck?.cats}, Small Pets: ${catCheck?.smallPets}`);
  });

  test('Small pets has zero contamination', async ({ request }) => {
    const qaRes = await request.get('/health/qa');
    const data = await qaRes.json();
    
    const contamCheck = data.checks?.find(c => c.name === 'Small Pets Contamination');
    expect(contamCheck?.status).toBe('pass');
    expect(contamCheck?.contamination).toBe(0);
    
    console.log(`[CONTAMINATION] Small pets contamination: ${contamCheck?.contamination}`);
  });
});

test.describe('Fast QA - API Health', () => {
  test('QA Health endpoint returns valid data', async ({ request }) => {
    const res = await request.get('/health/qa');
    expect(res.status()).toBe(200);
    
    const data = await res.json();
    expect(data.checks).toBeDefined();
    expect(data.checks.length).toBeGreaterThan(0);
    
    const coreChecks = data.checks.filter(c => 
      !c.name.includes('E2E') && c.status === 'pass'
    );
    expect(coreChecks.length).toBeGreaterThanOrEqual(5);
    
    console.log(`[QA] Passed: ${data.passed}, Failed: ${data.failed}, Core checks OK: ${coreChecks.length}`);
  });
});
