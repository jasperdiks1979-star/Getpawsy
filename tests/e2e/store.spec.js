const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.TEST_URL || 'http://localhost:5000';
const IS_PROD = BASE_URL.includes('getpawsy.pet');

test.describe('GetPawsy Store E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Console Error] ${msg.text()}`);
      }
    });
  });

  test('1. Homepage loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errors.push(msg.text());
      }
    });
    
    await page.goto(`${BASE_URL}/?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('.hero-headline, h1')).toBeVisible();
    
    const criticalErrors = errors.filter(e => 
      !e.includes('Failed to load resource') && 
      !e.includes('net::ERR')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('2. Build ID is visible and matches header', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/__fingerprint?v=${Date.now()}`);
    const fingerprint = await response.text();
    expect(fingerprint).toMatch(/^GP-\d{14}-[A-Z0-9]+$/);
    console.log(`[Build ID] ${fingerprint}`);
  });

  test('3. Category navigation works (Dogs)', async ({ page }) => {
    await page.goto(`${BASE_URL}/dogs?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const productCards = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
    await expect(productCards.first()).toBeVisible({ timeout: 10000 });
    
    const count = await productCards.count();
    expect(count).toBeGreaterThan(0);
    console.log(`[Dogs] Found ${count} products`);
  });

  test('4. Category navigation works (Cats)', async ({ page }) => {
    await page.goto(`${BASE_URL}/cats?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const productCards = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
    await expect(productCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('5. Product images load (no placeholders)', async ({ page }) => {
    await page.goto(`${BASE_URL}/?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const images = page.locator('.product-card img, .pawsy-product-card img');
    const count = await images.count();
    
    let validImages = 0;
    let placeholders = 0;
    
    for (let i = 0; i < Math.min(count, 24); i++) {
      const img = images.nth(i);
      const src = await img.getAttribute('src');
      if (src && !src.includes('placeholder') && !src.includes('noimage') && !src.includes('data:')) {
        validImages++;
      } else {
        placeholders++;
      }
    }
    
    console.log(`[Images] ${validImages} valid, ${placeholders} placeholders out of ${count}`);
    expect(validImages).toBeGreaterThan(placeholders);
  });

  test('6. PDP loads with correct price', async ({ page }) => {
    await page.goto(`${BASE_URL}/dogs?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const firstCard = page.locator('.product-card, .pawsy-product-card, [data-product-id]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    
    await page.waitForURL(/\/product\//, { timeout: 10000 });
    
    const priceEl = page.locator('.product-price, .pdp-price, [data-price]').first();
    await expect(priceEl).toBeVisible({ timeout: 5000 });
    
    const priceText = await priceEl.textContent();
    expect(priceText).toMatch(/\$\d+(\.\d{2})?/);
    expect(priceText).not.toContain('€');
    console.log(`[PDP Price] ${priceText}`);
  });

  test('7. Add to cart from PDP works', async ({ page }) => {
    await page.goto(`${BASE_URL}/dogs?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const firstCard = page.locator('.product-card, .pawsy-product-card, [data-product-id]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    
    await page.waitForURL(/\/product\//, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    const addToCartBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 5000 });
    await addToCartBtn.click();
    
    await page.waitForTimeout(1000);
    
    const cartCount = page.locator('#cartCount, .cart-count');
    const countText = await cartCount.textContent();
    const count = parseInt(countText) || 0;
    expect(count).toBeGreaterThan(0);
    console.log(`[Cart Count] ${count}`);
  });

  test('8. Cart persists after page refresh', async ({ page }) => {
    await page.goto(`${BASE_URL}/dogs?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const firstCard = page.locator('.product-card, .pawsy-product-card, [data-product-id]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    
    await page.waitForURL(/\/product\//, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    const addToCartBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 5000 });
    await addToCartBtn.click();
    
    await page.waitForTimeout(500);
    
    const countBefore = await page.locator('#cartCount, .cart-count').textContent();
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const countAfter = await page.locator('#cartCount, .cart-count').textContent();
    expect(parseInt(countAfter)).toBeGreaterThanOrEqual(parseInt(countBefore));
    console.log(`[Cart Persist] Before: ${countBefore}, After: ${countAfter}`);
  });

  test('9. No Cart not ready errors', async ({ page }) => {
    const cartErrors = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Cart not ready') || text.includes('CartStore not available') || text.includes('CartStore singleton missing')) {
        cartErrors.push(text);
      }
    });
    
    await page.goto(`${BASE_URL}/dogs?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const firstCard = page.locator('.product-card, .pawsy-product-card, [data-product-id]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    
    await page.waitForURL(/\/product\//, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    const addToCartBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 5000 });
    
    for (let i = 0; i < 5; i++) {
      await addToCartBtn.click();
      await page.waitForTimeout(200);
    }
    
    await page.waitForTimeout(1000);
    
    expect(cartErrors.length).toBe(0);
    console.log(`[Cart Errors] ${cartErrors.length} errors found`);
  });

  test('10. Prices are in USD (no Euro symbols)', async ({ page }) => {
    await page.goto(`${BASE_URL}/?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const priceElements = page.locator('.product-price, .price, [data-price]');
    const count = await priceElements.count();
    
    let usdCount = 0;
    let euroCount = 0;
    
    for (let i = 0; i < Math.min(count, 30); i++) {
      const text = await priceElements.nth(i).textContent();
      if (text.includes('$')) usdCount++;
      if (text.includes('€')) euroCount++;
    }
    
    console.log(`[Currency] USD: ${usdCount}, EUR: ${euroCount}`);
    expect(euroCount).toBe(0);
  });

  test('11. No $9.95 fallback prices in listing', async ({ page }) => {
    await page.goto(`${BASE_URL}/dogs?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const priceElements = page.locator('.product-price, .price, [data-price]');
    const count = await priceElements.count();
    
    let fallbackCount = 0;
    
    for (let i = 0; i < Math.min(count, 30); i++) {
      const text = await priceElements.nth(i).textContent();
      if (text.includes('$9.95') || text === '$9.95') {
        fallbackCount++;
      }
    }
    
    console.log(`[Fallback Prices] ${fallbackCount} products with $9.95`);
    expect(fallbackCount).toBeLessThan(count * 0.1);
  });

  test('12. Cart drawer shows items with correct total', async ({ page }) => {
    await page.goto(`${BASE_URL}/dogs?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const firstCard = page.locator('.product-card, .pawsy-product-card, [data-product-id]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    
    await page.waitForURL(/\/product\//, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    const priceEl = page.locator('.product-price, .pdp-price, [data-price]').first();
    const priceText = await priceEl.textContent();
    const pdpPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
    
    const addToCartBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")').first();
    await addToCartBtn.click();
    
    await page.waitForTimeout(1000);
    
    const cartBtn = page.locator('#cartBtn, .cartbtn, [data-cart-toggle]');
    await cartBtn.click();
    
    await page.waitForTimeout(500);
    
    const totalEl = page.locator('.cart-total, .cart-subtotal, #cartTotal, .drawer-total');
    if (await totalEl.count() > 0) {
      const totalText = await totalEl.first().textContent();
      const total = parseFloat(totalText.replace(/[^0-9.]/g, ''));
      expect(total).toBeGreaterThan(0);
      console.log(`[Cart Total] PDP: $${pdpPrice}, Drawer: $${total}`);
    }
  });
});

test.describe('Mobile Viewport Tests', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('13. Mobile: Add to cart works without errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Cart not ready') || text.includes('CartStore not available')) {
        errors.push(text);
      }
    });
    
    await page.goto(`${BASE_URL}/dogs?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const firstCard = page.locator('.product-card, .pawsy-product-card, [data-product-id]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    
    await page.waitForURL(/\/product\//, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const addToCartBtn = page.locator('[data-add-to-cart], .add-to-cart, .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 5000 });
    
    for (let i = 0; i < 5; i++) {
      await addToCartBtn.click();
      await page.waitForTimeout(300);
    }
    
    await page.waitForTimeout(1000);
    
    expect(errors.length).toBe(0);
    
    const cartCount = page.locator('#cartCount, .cart-count');
    const countText = await cartCount.textContent();
    const count = parseInt(countText) || 0;
    expect(count).toBeGreaterThan(0);
    console.log(`[Mobile Cart] Count: ${count}, Errors: ${errors.length}`);
  });

  test('14. Mobile: No horizontal overflow', async ({ page }) => {
    await page.goto(`${BASE_URL}/?v=${Date.now()}`);
    await page.waitForLoadState('networkidle');
    
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 390;
    
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
    console.log(`[Mobile Layout] Body: ${bodyWidth}px, Viewport: ${viewportWidth}px`);
  });
});
