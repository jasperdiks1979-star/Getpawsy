const { test, expect, devices } = require('@playwright/test');

const iPhone = devices['iPhone 13'];

test.describe('iOS Safari Critical Bugs - GetPawsy Production', () => {
  test.use({ ...iPhone });

  test.describe('A. Homepage Product Grid - No Image Issues', () => {
    test('Product cards show actual images (not "No image" placeholders)', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(3000);
      
      const productImages = page.locator('.card img, .product-card img, .product-thumb img');
      const count = await productImages.count();
      console.log(`Found ${count} product images`);
      expect(count).toBeGreaterThan(0);
      
      let noImageCount = 0;
      let brokenImageCount = 0;
      
      for (let i = 0; i < Math.min(count, 24); i++) {
        const img = productImages.nth(i);
        const src = await img.getAttribute('src');
        const alt = await img.getAttribute('alt');
        
        if (!src || src.includes('placeholder') || src.includes('no-image') || src === '') {
          noImageCount++;
          console.log(`[No Image] Card ${i}: src=${src}, alt=${alt}`);
        }
        
        const naturalWidth = await img.evaluate(el => el.naturalWidth);
        if (naturalWidth === 0) {
          brokenImageCount++;
          console.log(`[Broken] Card ${i}: src=${src} (naturalWidth=0)`);
        }
      }
      
      const noImageRate = noImageCount / Math.min(count, 24);
      const brokenRate = brokenImageCount / Math.min(count, 24);
      
      console.log(`Results: ${noImageCount} no-image (${(noImageRate * 100).toFixed(1)}%), ${brokenImageCount} broken (${(brokenRate * 100).toFixed(1)}%)`);
      
      expect(noImageRate).toBeLessThan(0.1);
      expect(brokenRate).toBeLessThan(0.15);
    });

    test('Lazy-loaded images load on scroll (iOS IntersectionObserver)', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(2000);
      
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(1500);
      
      const visibleImages = page.locator('.card img:visible, .product-card img:visible');
      const count = await visibleImages.count();
      
      let loadedCount = 0;
      for (let i = 0; i < Math.min(count, 12); i++) {
        const naturalWidth = await visibleImages.nth(i).evaluate(el => el.naturalWidth);
        if (naturalWidth > 0) loadedCount++;
      }
      
      console.log(`After scroll: ${loadedCount}/${Math.min(count, 12)} images loaded`);
      expect(loadedCount).toBeGreaterThan(Math.min(count, 12) * 0.7);
    });
  });

  test.describe('B. PDP Add to Cart - No Race Condition', () => {
    test('Add to Cart does NOT show "Cart not ready" error', async ({ page }) => {
      const errors = [];
      page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Cart not ready') || text.includes('CartStore not') || msg.type() === 'error') {
          errors.push({ type: msg.type(), text });
        }
      });
      
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      const productLink = page.locator('.card a, a.card-link, .product-card a').first();
      await productLink.click();
      await page.waitForURL('**/product/**', { timeout: 10000 });
      await page.waitForTimeout(1500);
      
      const addToCartBtn = page.locator('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")').first();
      await expect(addToCartBtn).toBeVisible({ timeout: 5000 });
      
      await addToCartBtn.click();
      await page.waitForTimeout(2000);
      
      const cartReadyErrors = errors.filter(e => e.text.includes('Cart not ready'));
      console.log(`Errors: ${errors.length}, Cart ready errors: ${cartReadyErrors.length}`);
      expect(cartReadyErrors).toHaveLength(0);
    });

    test('Sticky bottom Add to Cart bar works on mobile', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      await page.locator('.card a, a.card-link').first().click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1500);
      
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(500);
      
      const stickyBar = page.locator('#stickyAddToCart, .sticky-add-to-cart');
      const stickyBtn = page.locator('#stickyAddBtn, .sticky-add-btn');
      
      if (await stickyBar.isVisible()) {
        await stickyBtn.click();
        await page.waitForTimeout(1500);
        
        const cartCount = await page.locator('#cartCount, .cart-count').first().textContent();
        expect(parseInt(cartCount) || 0).toBeGreaterThan(0);
      } else {
        console.log('Sticky bar not visible - may be above fold');
      }
    });
  });

  test.describe('C. Cart Drawer - Correct Prices and Totals', () => {
    test('Cart drawer shows items with correct prices (not $0.00)', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      await page.locator('.card a, a.card-link').first().click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1500);
      
      await page.locator('[data-add-to-cart], .add-to-cart-btn, button:has-text("Add to Cart")').first().click();
      await page.waitForTimeout(1500);
      
      await page.locator('#cartBtn, .cartbtn, [data-cart-toggle]').first().click();
      await page.waitForTimeout(1000);
      
      const cartDrawer = page.locator('#cart, .drawer, .cart-drawer, #pawsyMiniCart');
      await expect(cartDrawer.first()).toBeVisible({ timeout: 5000 });
      
      const priceElements = page.locator('.cart-item-price, .item-price, [class*="price"]').filter({ hasText: '$' });
      const count = await priceElements.count();
      
      let zeroCount = 0;
      for (let i = 0; i < count; i++) {
        const text = await priceElements.nth(i).textContent();
        if (text && (text.includes('$0.00') || text.includes('$0'))) {
          zeroCount++;
          console.log(`[Zero Price] Element ${i}: ${text}`);
        }
      }
      
      console.log(`Price elements: ${count}, Zero prices: ${zeroCount}`);
      expect(zeroCount).toBe(0);
    });

    test('Cart total is sum of item prices (not $0.00)', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      await page.locator('.card a, a.card-link').first().click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1000);
      
      await page.locator('[data-add-to-cart], .add-to-cart-btn, button:has-text("Add to Cart")').first().click();
      await page.waitForTimeout(1500);
      
      await page.locator('#cartBtn, .cartbtn').first().click();
      await page.waitForTimeout(1000);
      
      const totalElement = page.locator('#cartTotal, .cart-total, .subtotal-value').first();
      const totalText = await totalElement.textContent();
      
      console.log(`Cart total: ${totalText}`);
      
      const amount = parseFloat((totalText || '').replace(/[^0-9.]/g, ''));
      expect(amount).toBeGreaterThan(0);
    });

    test('Cart persists after page refresh', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      await page.locator('.card a, a.card-link').first().click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1000);
      
      await page.locator('[data-add-to-cart], .add-to-cart-btn, button:has-text("Add to Cart")').first().click();
      await page.waitForTimeout(1500);
      
      const countBefore = await page.locator('#cartCount, .cart-count').first().textContent();
      console.log(`Count before refresh: ${countBefore}`);
      
      await page.reload();
      await page.waitForTimeout(2000);
      
      const countAfter = await page.locator('#cartCount, .cart-count').first().textContent();
      console.log(`Count after refresh: ${countAfter}`);
      
      expect(parseInt(countAfter) || 0).toBe(parseInt(countBefore) || 0);
    });
  });

  test.describe('D. Currency Consistency', () => {
    test('All prices show USD ($) - no EUR or mixed currencies', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(3000);
      
      const allPriceText = await page.locator('.price, [class*="price"], .card-price').allTextContents();
      
      let euroCount = 0;
      let dollarCount = 0;
      
      for (const text of allPriceText) {
        if (text.includes('€')) euroCount++;
        if (text.includes('$')) dollarCount++;
      }
      
      console.log(`Currency check: ${dollarCount} USD, ${euroCount} EUR`);
      expect(euroCount).toBe(0);
      expect(dollarCount).toBeGreaterThan(0);
    });

    test('PDP shows consistent USD pricing', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      await page.locator('.card a, a.card-link').first().click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1500);
      
      const priceText = await page.locator('.pdp-price, .product-price, [class*="price"]').first().textContent();
      
      console.log(`PDP price: ${priceText}`);
      expect(priceText).toContain('$');
      expect(priceText).not.toContain('€');
      
      const amount = parseFloat((priceText || '').replace(/[^0-9.]/g, ''));
      expect(amount).toBeGreaterThan(0);
      expect(amount).not.toBe(9.95);
    });
  });

  test.describe('E. Build Verification', () => {
    test('Build fingerprint is visible and matches server', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(2000);
      
      const serverFingerprint = await page.evaluate(async () => {
        const res = await fetch('/__fingerprint');
        return res.text();
      });
      
      console.log(`Server fingerprint: ${serverFingerprint}`);
      expect(serverFingerprint).toMatch(/^GP-\d{14}-[A-Z0-9]+$/);
      
      const xBuildId = await page.evaluate(async () => {
        const res = await fetch('/__fingerprint');
        return res.headers.get('X-Build-Id');
      });
      
      console.log(`X-Build-Id header: ${xBuildId}`);
      expect(xBuildId).toBe(serverFingerprint);
    });

    test('Assets have cache-busting query params', async ({ page }) => {
      await page.goto('/');
      
      const stylesheetHref = await page.locator('link[rel="stylesheet"][href*="styles.css"]').getAttribute('href');
      console.log(`Stylesheet href: ${stylesheetHref}`);
      
      expect(stylesheetHref).toMatch(/\?v=GP-\d{14}-[A-Z0-9]+/);
    });
  });
});
