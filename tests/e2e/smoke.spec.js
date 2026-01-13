const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

test.describe('GetPawsy E2E Smoke Tests', () => {

  test.describe('A) Navigation & Routing', () => {

    test('A1) Homepage starts at top (scrollY near 0)', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForTimeout(500);
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeLessThan(100);
    });

    test('A2) Product card click navigates to correct product detail page', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      
      const firstCard = page.locator('.pawsy-product-card, .card').first();
      const cardHref = await firstCard.getAttribute('href') || 
                       await firstCard.locator('a').first().getAttribute('href');
      
      if (cardHref) {
        await page.goto(BASE_URL + cardHref);
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/product/');
        const title = page.locator('.pdp-title, #detailTitle, h1').first();
        await expect(title).toBeVisible({ timeout: 5000 });
      }
    });

    test('A3) Route change scrolls to top', async ({ page }) => {
      await page.goto(BASE_URL + '/dogs');
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => window.scrollTo(0, 500));
      
      await page.goto(BASE_URL);
      await page.waitForTimeout(500);
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeLessThan(100);
    });
  });

  test.describe('B) Add to Cart', () => {

    test('B1) Add to cart from product page works correctly', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      
      const productCard = page.locator('a[href^="/product/"]').first();
      const productHref = await productCard.getAttribute('href');
      
      if (productHref) {
        await page.goto(BASE_URL + productHref);
        await page.waitForLoadState('networkidle');
        
        const addBtn = page.locator('#addToCartBtn, .pdp-atc-btn, [data-add-to-cart]').first();
        await expect(addBtn).toBeVisible({ timeout: 5000 });
        await addBtn.click();
        
        await page.waitForTimeout(1000);
        
        const cartCount = page.locator('.cart-count, #cartCount, .pawsy-cart-badge');
        const countText = await cartCount.textContent();
        expect(parseInt(countText) || 0).toBeGreaterThanOrEqual(1);
      }
    });

    test('B2) Cart badge updates after adding item', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      
      const initialCount = await page.evaluate(() => {
        const badge = document.querySelector('.cart-count, #cartCount, .pawsy-cart-badge');
        return badge ? parseInt(badge.textContent) || 0 : 0;
      });
      
      const productCard = page.locator('a[href^="/product/"]').first();
      await productCard.click();
      await page.waitForLoadState('networkidle');
      
      const addBtn = page.locator('#addToCartBtn, .pdp-atc-btn').first();
      if (await addBtn.isVisible()) {
        await addBtn.click();
        await page.waitForTimeout(1000);
        
        const newCount = await page.evaluate(() => {
          const badge = document.querySelector('.cart-count, #cartCount, .pawsy-cart-badge');
          return badge ? parseInt(badge.textContent) || 0 : 0;
        });
        
        expect(newCount).toBeGreaterThan(initialCount);
      }
    });
  });

  test.describe('C) Variants', () => {

    test('C1) Variant selector visible on product with variants', async ({ page }) => {
      const response = await page.request.get(BASE_URL + '/api/products?limit=100');
      const data = await response.json();
      
      const productWithVariants = data.products?.find(p => 
        p.variants && p.variants.length > 1
      );
      
      if (productWithVariants) {
        await page.goto(BASE_URL + '/product/' + (productWithVariants.slug || productWithVariants.id));
        await page.waitForLoadState('networkidle');
        
        const variantSelector = page.locator('.pdp-variant-btn, .pdp-variant-options, .variant-selector');
        const isVisible = await variantSelector.first().isVisible().catch(() => false);
        expect(isVisible || productWithVariants.variants.length <= 1).toBeTruthy();
      }
    });
  });

  test.describe('F) Responsive Layout', () => {

    test('F1) No horizontal overflow on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      
      expect(hasOverflow).toBeFalsy();
    });

    test('F2) No horizontal overflow on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      
      expect(hasOverflow).toBeFalsy();
    });

    test('F3) Product page loads correctly on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      
      const productCard = page.locator('a[href^="/product/"]').first();
      if (await productCard.isVisible()) {
        await productCard.click();
        await page.waitForLoadState('networkidle');
        
        const title = page.locator('.pdp-title, h1').first();
        await expect(title).toBeVisible({ timeout: 5000 });
        
        const addBtn = page.locator('#addToCartBtn, .pdp-atc-btn').first();
        await expect(addBtn).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
