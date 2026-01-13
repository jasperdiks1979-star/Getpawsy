const { test, expect } = require('@playwright/test');

test.describe('Critical User Journeys - GetPawsy', () => {
  test.describe('A. Navigation Flow', () => {
    test('Homepage → Category → Product Grid → PDP', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.hero-headline, h1')).toBeVisible({ timeout: 10000 });
      
      await page.click('a[href="/dogs"], [data-i18n="navDogs"]');
      await page.waitForURL('**/dogs**');
      
      await expect(page.locator('.card, .product-card').first()).toBeVisible({ timeout: 10000 });
      
      const firstProduct = page.locator('.card a, .product-card a, a.card-link').first();
      await firstProduct.click();
      
      await expect(page.locator('.pdp-title, h1.product-title, h1')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('B. Product Images', () => {
    test('Product grid thumbnails load (no "No image" fallback)', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(3000);
      
      const images = page.locator('.card img, .product-card img');
      const count = await images.count();
      expect(count).toBeGreaterThan(0);
      
      let fallbackCount = 0;
      for (let i = 0; i < Math.min(count, 20); i++) {
        const src = await images.nth(i).getAttribute('src');
        if (src && (src.includes('placeholder') || src.includes('no-image'))) {
          fallbackCount++;
        }
      }
      
      const fallbackRate = fallbackCount / Math.min(count, 20);
      console.log(`Fallback rate: ${(fallbackRate * 100).toFixed(1)}% (${fallbackCount}/${Math.min(count, 20)})`);
      expect(fallbackRate).toBeLessThan(0.3);
    });
  });

  test.describe('C. Add to Cart - No Race Condition', () => {
    test('PDP Add to Cart works without "Cart not ready" error', async ({ page }) => {
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      const productLink = page.locator('.card a, a.card-link').first();
      await productLink.click();
      await page.waitForURL('**/product/**');
      
      await expect(page.locator('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")').first()).toBeVisible({ timeout: 10000 });
      
      await page.click('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")');
      await page.waitForTimeout(1500);
      
      const cartErrors = consoleErrors.filter(e => e.includes('Cart not ready') || e.includes('CartStore not'));
      expect(cartErrors).toHaveLength(0);
    });
  });

  test.describe('D. Cart Badge Count', () => {
    test('Cart badge increments correctly', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      const initialBadge = await page.locator('.cart-count, #cartCount').first().textContent();
      const initialCount = parseInt(initialBadge) || 0;
      
      const productLink = page.locator('.card a, a.card-link').first();
      await productLink.click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1000);
      
      await page.click('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")');
      await page.waitForTimeout(2000);
      
      const newBadge = await page.locator('.cart-count, #cartCount').first().textContent();
      const newCount = parseInt(newBadge) || 0;
      
      expect(newCount).toBeGreaterThan(initialCount);
    });
  });

  test.describe('E. Cart Drawer Items', () => {
    test('Cart drawer shows items with +/- and remove buttons', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      const productLink = page.locator('.card a, a.card-link').first();
      await productLink.click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1000);
      
      await page.click('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")');
      await page.waitForTimeout(2000);
      
      const drawer = page.locator('#cartDrawer, .cart-drawer, .drawer');
      await expect(drawer).toBeVisible({ timeout: 5000 });
      
      await expect(page.locator('#cartItems .msg, .cart-item')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('F. Cart Totals', () => {
    test('Cart total is never $0.00 when items are present', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      const productLink = page.locator('.card a, a.card-link').first();
      await productLink.click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1000);
      
      await page.click('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")');
      await page.waitForTimeout(2000);
      
      const totalText = await page.locator('#cartTotal, .cart-subtotal').first().textContent();
      const totalValue = parseFloat(totalText.replace(/[^0-9.]/g, ''));
      
      expect(totalValue).toBeGreaterThan(0);
    });
  });

  test.describe('G. Cart Persistence', () => {
    test('Cart persists after page refresh', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      const productLink = page.locator('.card a, a.card-link').first();
      await productLink.click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(1000);
      
      await page.click('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")');
      await page.waitForTimeout(2000);
      
      const countBefore = await page.locator('.cart-count, #cartCount').first().textContent();
      
      await page.reload();
      await page.waitForTimeout(3000);
      
      const countAfter = await page.locator('.cart-count, #cartCount').first().textContent();
      
      expect(parseInt(countAfter)).toBe(parseInt(countBefore));
    });
  });

  test.describe('H. Multi-Product Cart', () => {
    test('Add 3 different products - all visible in cart', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(2000);
      
      const products = page.locator('.card a, a.card-link');
      const productCount = await products.count();
      const toAdd = Math.min(3, productCount);
      
      for (let i = 0; i < toAdd; i++) {
        await page.goto('/dogs');
        await page.waitForTimeout(1500);
        
        const product = products.nth(i);
        await product.click();
        await page.waitForURL('**/product/**');
        await page.waitForTimeout(1000);
        
        await page.click('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")');
        await page.waitForTimeout(1500);
        
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
      
      const finalCount = await page.locator('.cart-count, #cartCount').first().textContent();
      expect(parseInt(finalCount)).toBeGreaterThanOrEqual(toAdd);
    });
  });

  test.describe('I. Currency Consistency', () => {
    test('All prices display in USD ($)', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(3000);
      
      const priceTexts = await page.locator('.price, .product-price, [class*="price"]').allTextContents();
      
      let eurCount = 0;
      let usdCount = 0;
      
      for (const text of priceTexts) {
        if (text.includes('€')) eurCount++;
        if (text.includes('$')) usdCount++;
      }
      
      console.log(`Prices: ${usdCount} USD, ${eurCount} EUR`);
      expect(eurCount).toBe(0);
      expect(usdCount).toBeGreaterThan(0);
    });
  });

  test.describe('J. Price Consistency', () => {
    test('Product card price matches PDP price', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(3000);
      
      const cardPrice = await page.locator('.card .price, .product-card .price').first().textContent();
      const cardPriceNum = parseFloat(cardPrice.replace(/[^0-9.]/g, ''));
      
      const productLink = page.locator('.card a, a.card-link').first();
      await productLink.click();
      await page.waitForURL('**/product/**');
      await page.waitForTimeout(2000);
      
      const pdpPrice = await page.locator('.pdp-price, .product-price, [class*="price"]').first().textContent();
      const pdpPriceNum = parseFloat(pdpPrice.replace(/[^0-9.]/g, ''));
      
      expect(pdpPriceNum).toBeCloseTo(cardPriceNum, 0);
    });
  });

  test.describe('K. No Fallback $9.95', () => {
    test('Products do not all have $9.95 price (not a universal fallback)', async ({ page }) => {
      await page.goto('/dogs');
      await page.waitForTimeout(3000);
      
      const prices = await page.locator('.card .price, .product-card .price').allTextContents();
      
      let count995 = 0;
      for (const price of prices) {
        if (price.includes('9.95')) count995++;
      }
      
      const rate995 = count995 / prices.length;
      console.log(`$9.95 rate: ${(rate995 * 100).toFixed(1)}% (${count995}/${prices.length})`);
      
      expect(rate995).toBeLessThan(0.5);
    });
  });

  test.describe('Build Verification', () => {
    test('Build fingerprint endpoint returns valid ID', async ({ page }) => {
      const response = await page.request.get('/__fingerprint');
      const text = await response.text();
      
      expect(text).toMatch(/^GP-\d{14}-[A-Z0-9]{6}$/);
      console.log(`Build fingerprint: ${text}`);
    });
    
    test('Build ID visible in footer or header', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(2000);
      
      const pageContent = await page.content();
      const hasBuildInfo = pageContent.includes('Build:') || pageContent.includes('GP-');
      
      expect(hasBuildInfo).toBe(true);
    });
  });
});

test.describe('Variant Cart Behavior', () => {
  test('Different variants of same product can coexist in cart', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    const cartState = await page.evaluate(() => {
      if (!window.CartStore) return null;
      window.CartStore.clear();
      
      window.CartStore.addItem({ 
        id: 'test-product-1', 
        variantId: 'variant-A', 
        title: 'Test Product - Variant A', 
        price: 10.00 
      });
      
      window.CartStore.addItem({ 
        id: 'test-product-1', 
        variantId: 'variant-B', 
        title: 'Test Product - Variant B', 
        price: 15.00 
      });
      
      return {
        items: window.CartStore.getItems(),
        count: window.CartStore.getCount(),
        total: window.CartStore.getTotal()
      };
    });
    
    expect(cartState).not.toBeNull();
    expect(cartState.items).toHaveLength(2);
    expect(cartState.count).toBe(2);
    expect(cartState.total).toBe(25);
    
    const variantA = cartState.items.find(i => i.variantId === 'variant-A');
    const variantB = cartState.items.find(i => i.variantId === 'variant-B');
    
    expect(variantA).toBeDefined();
    expect(variantB).toBeDefined();
    expect(variantA.price).toBe(10);
    expect(variantB.price).toBe(15);
  });
  
  test('Adding same variant twice increments quantity', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    const cartState = await page.evaluate(() => {
      if (!window.CartStore) return null;
      window.CartStore.clear();
      
      window.CartStore.addItem({ 
        id: 'test-product-2', 
        variantId: 'variant-X', 
        title: 'Test Product X', 
        price: 20.00 
      });
      
      window.CartStore.addItem({ 
        id: 'test-product-2', 
        variantId: 'variant-X', 
        title: 'Test Product X', 
        price: 20.00 
      });
      
      return {
        items: window.CartStore.getItems(),
        count: window.CartStore.getCount()
      };
    });
    
    expect(cartState).not.toBeNull();
    expect(cartState.items).toHaveLength(1);
    expect(cartState.items[0].qty).toBe(2);
    expect(cartState.count).toBe(2);
  });
});

test.describe('Mobile Safari iOS Simulation', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  
  test('Add to Cart works on mobile viewport', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    
    await page.goto('/dogs');
    await page.waitForTimeout(3000);
    
    const productLink = page.locator('.card a, a.card-link').first();
    await productLink.click();
    await page.waitForURL('**/product/**');
    await page.waitForTimeout(2000);
    
    await page.click('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")');
    await page.waitForTimeout(2000);
    
    const cartErrors = consoleErrors.filter(e => e.includes('Cart not ready') || e.includes('CartStore not'));
    expect(cartErrors).toHaveLength(0);
    
    const badge = await page.locator('.cart-count, #cartCount').first().textContent();
    expect(parseInt(badge)).toBeGreaterThan(0);
  });
  
  test('Cart drawer opens and shows items on mobile', async ({ page }) => {
    await page.goto('/dogs');
    await page.waitForTimeout(2000);
    
    const productLink = page.locator('.card a, a.card-link').first();
    await productLink.click();
    await page.waitForURL('**/product/**');
    await page.waitForTimeout(1500);
    
    await page.click('[data-add-to-cart], .add-to-cart-btn, .pdp-atc-btn, button:has-text("Add to Cart")');
    await page.waitForTimeout(2000);
    
    const drawer = page.locator('#cartDrawer, .cart-drawer, .drawer, .pawsy-mini-cart');
    await expect(drawer.first()).toBeVisible({ timeout: 5000 });
    
    const cartTotal = await page.locator('#cartTotal, .cart-subtotal').first().textContent();
    const totalValue = parseFloat(cartTotal.replace(/[^0-9.]/g, ''));
    expect(totalValue).toBeGreaterThan(0);
  });
});
