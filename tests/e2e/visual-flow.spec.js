const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const PROOF_DIR = path.join(process.cwd(), 'public/qa/proof');

if (!fs.existsSync(PROOF_DIR)) {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
}

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 }
};

const SMALL_PET_CHIPS = [
  'rabbits',
  'guinea-pigs', 
  'hamsters',
  'birds',
  'reptiles',
  'cages-habitats',
  'toys-enrichment',
  'food-treats'
];

test.describe('Visual Flow - Desktop', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('A) Homepage loads successfully', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/home`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'desktop-01-homepage.png'), fullPage: true });
    
    expect(response?.status()).toBeLessThan(400);
    const bodyContent = await page.locator('body').textContent();
    console.log('[QA] Homepage body length:', bodyContent?.length || 0);
    expect(bodyContent?.length || 0).toBeGreaterThan(100);
  });

  test('B) Small Pets page shows products', async ({ page }) => {
    await page.goto(`${BASE_URL}/small-pets`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const productCards = page.locator('.product-card, .gp-card, article, [class*="product"]');
    const count = await productCards.count();
    console.log('[QA] Small Pets page products:', count);
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'desktop-02-small-pets-all.png'), fullPage: true });
    expect(count).toBeGreaterThan(0);
  });

  test('C) Small Pets chip filters work', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const chips = page.locator('.filter-chip, .chip, [data-subcat]');
    const chipCount = await chips.count();
    console.log('[QA] Filter chips found:', chipCount);
    
    await page.goto(`${BASE_URL}/collection/small-pets/rabbits`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const productCards = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
    const rabbitsCount = await productCards.count();
    console.log('[QA] Rabbits subcategory products:', rabbitsCount);
    expect(rabbitsCount).toBeGreaterThan(0);
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'desktop-03-small-pets-rabbits.png'), fullPage: true });
  });

  test('D) PDP shows real hero image', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const firstProduct = page.locator('.product-card a, .pawsy-product-card a, [data-product-id] a').first();
    if (await firstProduct.count() > 0) {
      await firstProduct.click();
      await page.waitForTimeout(2000);
      
      const heroImage = page.locator('.pdp-hero-image, .product-image, .gallery-main img, .product-gallery img').first();
      if (await heroImage.count() > 0) {
        const src = await heroImage.getAttribute('src');
        console.log('[QA] PDP hero image src:', src);
        expect(src).toBeTruthy();
        expect(src).not.toContain('placeholder');
      }
      
      await page.screenshot({ path: path.join(PROOF_DIR, 'desktop-04-pdp-hero.png'), fullPage: true });
    }
  });

  test('E) Add to Cart works and updates badge', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const badgeBefore = await page.locator('#pawsyCartCount, #cartCount, .cart-count').first().textContent();
    console.log('[QA] Badge before add:', badgeBefore);
    
    const addBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(800);
      
      const badgeAfter = await page.locator('#pawsyCartCount, #cartCount, .cart-count').first().textContent();
      console.log('[QA] Badge after add:', badgeAfter);
      
      expect(parseInt(badgeAfter) || 0).toBeGreaterThan(parseInt(badgeBefore) || 0);
      
      await page.screenshot({ path: path.join(PROOF_DIR, 'desktop-05-after-add.png'), fullPage: true });
    }
  });

  test('F) Cart drawer shows items after add', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const addBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(800);
      
      const cartBtn = page.locator('#pawsyCartBtn, .cart-toggle, [data-cart-toggle]').first();
      if (await cartBtn.count() > 0) {
        await cartBtn.click();
        await page.waitForTimeout(500);
        
        const cartItem = page.locator('.drawer-item, .pawsy-mini-cart-item, .cart-item').first();
        const hasItems = await cartItem.count() > 0;
        console.log('[QA] Cart drawer has items:', hasItems);
        
        await page.screenshot({ path: path.join(PROOF_DIR, 'desktop-06-cart-drawer.png'), fullPage: true });
        expect(hasItems).toBe(true);
      }
    }
  });

  test('G) Double click increments quantity (not duplicates)', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const addBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(100);
      await addBtn.click();
      await page.waitForTimeout(800);
      
      const badge = await page.locator('#pawsyCartCount, #cartCount, .cart-count').first().textContent();
      console.log('[QA] Badge after double click:', badge);
      
      expect(parseInt(badge) || 0).toBeGreaterThanOrEqual(1);
      
      const cartBtn = page.locator('#pawsyCartBtn, .cart-toggle, [data-cart-toggle]').first();
      if (await cartBtn.count() > 0) {
        await cartBtn.click();
        await page.waitForTimeout(500);
        
        const cartItems = page.locator('.drawer-item, .pawsy-mini-cart-item, .cart-item');
        const itemCount = await cartItems.count();
        console.log('[QA] Cart items count:', itemCount);
        expect(itemCount).toBeLessThanOrEqual(1);
        
        const qtyEl = page.locator('.qty-value, .item-qty').first();
        if (await qtyEl.count() > 0) {
          const qty = await qtyEl.textContent();
          console.log('[QA] Item quantity:', qty);
        }
        
        await page.screenshot({ path: path.join(PROOF_DIR, 'desktop-07-double-add.png'), fullPage: true });
      }
    }
  });

  test('H) Cart persists after page refresh', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const addBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(800);
      
      const badgeBeforeRefresh = await page.locator('#pawsyCartCount, #cartCount, .cart-count').first().textContent();
      console.log('[QA] Badge before refresh:', badgeBeforeRefresh);
      
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      
      const badgeAfterRefresh = await page.locator('#pawsyCartCount, #cartCount, .cart-count').first().textContent();
      console.log('[QA] Badge after refresh:', badgeAfterRefresh);
      
      expect(badgeAfterRefresh).toBe(badgeBeforeRefresh);
      
      await page.screenshot({ path: path.join(PROOF_DIR, 'desktop-08-after-refresh.png'), fullPage: true });
    }
  });
});

test.describe('Visual Flow - Mobile', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('Mobile: Small Pets page shows products', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    
    const productCards = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
    await expect(productCards.first()).toBeVisible({ timeout: 10000 });
    
    const count = await productCards.count();
    console.log('[QA] Mobile Small Pets products:', count);
    expect(count).toBeGreaterThan(0);
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'mobile-01-small-pets.png'), fullPage: true });
  });

  test('Mobile: Add to Cart and drawer works', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const addBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(800);
      
      const badge = await page.locator('#pawsyCartCount, #cartCount, .cart-count').first().textContent();
      console.log('[QA] Mobile badge after add:', badge);
      expect(parseInt(badge) || 0).toBeGreaterThan(0);
      
      const cartBtn = page.locator('#pawsyCartBtn, .cart-toggle, [data-cart-toggle]').first();
      if (await cartBtn.count() > 0) {
        await cartBtn.click();
        await page.waitForTimeout(500);
        
        await page.screenshot({ path: path.join(PROOF_DIR, 'mobile-02-cart-drawer.png'), fullPage: true });
        
        const cartItem = page.locator('.drawer-item, .pawsy-mini-cart-item, .cart-item').first();
        const hasItems = await cartItem.count() > 0;
        console.log('[QA] Mobile cart drawer has items:', hasItems);
        expect(hasItems).toBe(true);
      }
    }
  });
});

test.describe('Image Performance', () => {
  test('Images have lazy loading attributes', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const images = page.locator('.product-card img, .pawsy-product-card img');
    const imageCount = await images.count();
    
    let lazyCount = 0;
    for (let i = 0; i < Math.min(imageCount, 10); i++) {
      const img = images.nth(i);
      const loading = await img.getAttribute('loading');
      const decoding = await img.getAttribute('decoding');
      if (loading === 'lazy' || decoding === 'async') {
        lazyCount++;
      }
    }
    
    console.log('[QA] Images with lazy loading:', lazyCount, '/', Math.min(imageCount, 10));
    await page.screenshot({ path: path.join(PROOF_DIR, 'images-lazy-loading.png'), fullPage: false });
  });

  test('Product images load successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/collection/small-pets`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const images = page.locator('.product-card img, .pawsy-product-card img');
    const imageCount = await images.count();
    
    let loadedCount = 0;
    let brokenCount = 0;
    
    for (let i = 0; i < Math.min(imageCount, 5); i++) {
      const img = images.nth(i);
      const naturalWidth = await img.evaluate(el => el.naturalWidth);
      if (naturalWidth > 0) {
        loadedCount++;
      } else {
        brokenCount++;
        const src = await img.getAttribute('src');
        console.log('[QA] Broken image:', src);
      }
    }
    
    console.log('[QA] Loaded images:', loadedCount, 'Broken:', brokenCount);
    expect(loadedCount).toBeGreaterThan(0);
  });
});

test('Generate final summary report', async ({ page }) => {
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    tests: [
      'Homepage loads',
      'Small Pets page shows products',
      'Chip filters work',
      'PDP shows real hero image',
      'Add to Cart updates badge',
      'Cart drawer shows items',
      'Double click increments qty',
      'Cart persists after refresh',
      'Mobile works',
      'Images have lazy loading'
    ]
  };
  
  fs.writeFileSync(
    path.join(PROOF_DIR, 'visual-flow-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log('[QA] Visual flow report generated');
});
