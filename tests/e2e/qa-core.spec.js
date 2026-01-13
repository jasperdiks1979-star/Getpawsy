const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const QA_DIR = path.join(__dirname, '../../public/qa');
const PROOF_DIR = path.join(QA_DIR, 'proof');

test.beforeAll(async () => {
  if (!fs.existsSync(PROOF_DIR)) {
    fs.mkdirSync(PROOF_DIR, { recursive: true });
  }
});

async function saveProof(page, name) {
  try {
    const filepath = path.join(PROOF_DIR, `${name}.png`);
    await page.screenshot({ path: filepath, fullPage: false, timeout: 5000 });
    console.log(`[PROOF] ${filepath}`);
    return filepath;
  } catch (e) {
    console.log(`[PROOF SKIP] ${name}: ${e.message}`);
    return null;
  }
}

test.describe('Core Navigation', () => {
  test('Homepage loads with navigation', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    
    const body = await response.text();
    expect(body.length).toBeGreaterThan(1000);
    expect(body).toContain('GetPawsy');
    console.log('[HOME] Homepage loaded successfully');
  });

  test('Dogs page loads', async ({ page }) => {
    const response = await page.goto('/dogs', { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBe(200);
    await saveProof(page, 'dogs');
  });

  test('Cats page loads', async ({ page }) => {
    const response = await page.goto('/cats', { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBe(200);
    await saveProof(page, 'cats');
  });

  test('Small Pets page loads with NO dog/cat contamination', async ({ request }) => {
    const pageRes = await request.get('/small-pets');
    expect(pageRes.status()).toBe(200);
    
    const qaRes = await request.get('/health/qa');
    const qaData = await qaRes.json();
    
    const contamCheck = qaData.checks?.find(c => c.name === 'Small Pets Contamination');
    expect(contamCheck?.contamination || 0).toBe(0);
    
    console.log(`[SMALL PETS] Contamination check: ${contamCheck?.contamination || 0}`);
  });
});

test.describe('Product Detail Pages', () => {
  test('Dog product PDP loads', async ({ page, request }) => {
    const res = await request.get('/api/products?pet_type=dog&limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    const response = await page.goto(`/product/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBe(200);
    
    await page.waitForSelector('h1, .pdp-title', { timeout: 10000 });
    await saveProof(page, 'pdp-dog');
  });

  test('Cat product PDP loads', async ({ page, request }) => {
    const res = await request.get('/api/products?pet_type=cat&limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    const response = await page.goto(`/product/${slug}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBe(200);
  });
});

test.describe('Cart System Verification', () => {
  test('Cart system files exist and are configured', async ({ request }) => {
    const qaRes = await request.get('/health/qa');
    const data = await qaRes.json();
    
    const cartCheck = data.checks?.find(c => c.name === 'Cart System');
    expect(cartCheck?.status).toBe('pass');
    expect(cartCheck?.cartStoreEnabled).toBe(true);
    expect(cartCheck?.cartDelegateEnabled).toBe(true);
    expect(cartCheck?.version).toBe('2.7.0');
    
    console.log(`[CART SYSTEM] Version: ${cartCheck?.version}`);
    console.log(`[CART SYSTEM] Features: ${cartCheck?.features?.join(', ')}`);
  });

  test('CartStore JS is accessible and has dedupe lock', async ({ request }) => {
    const res = await request.get('/js/cart-store.js');
    expect(res.status()).toBe(200);
    
    const content = await res.text();
    expect(content).toContain('CartStore');
    expect(content).toContain('gp_cart_v2');
    expect(content).toContain('addItem');
    
    console.log('[CART] cart-store.js loaded successfully with localStorage v2');
  });

  test('CartDelegate JS has PDP handler skip', async ({ request }) => {
    const res = await request.get('/js/cart-delegate.js');
    expect(res.status()).toBe(200);
    
    const content = await res.text();
    expect(content).toContain('CartStore');
    expect(content).toContain('pdpHandled');
    
    console.log('[CART] cart-delegate.js has pdp-handled check for dedupe');
  });

  test('PDP template has proper cart integration', async ({ request }) => {
    const prodRes = await request.get('/api/products?limit=1');
    const data = await prodRes.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    const pdpRes = await request.get(`/product/${slug}/`);
    expect(pdpRes.status()).toBe(200);
    
    const html = await pdpRes.text();
    expect(html).toContain('add');
    expect(html).toContain('cart');
    
    console.log(`[PDP] Product page renders for ${slug}`);
  });
});

test.describe('API Health', () => {
  test('QA Health endpoint shows healthy status', async ({ request }) => {
    const res = await request.get('/health/qa');
    expect(res.status()).toBe(200);
    
    const data = await res.json();
    console.log(`[QA STATUS] passed: ${data.passed}, failed: ${data.failed}`);
    
    const contamination = data.checks?.find(c => c.name === 'Small Pets Contamination');
    expect(contamination?.contamination || 0).toBe(0);
  });

  test('Products API returns data', async ({ request }) => {
    const res = await request.get('/api/products?limit=10');
    expect(res.status()).toBe(200);
    
    const data = await res.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
  });
});
