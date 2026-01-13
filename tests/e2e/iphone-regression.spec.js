const { test, expect } = require('@playwright/test');

test.describe('iPhone Safari Regression Tests', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });

  test('Category dogs/toys shows only dog items', async ({ page }) => {
    const timestamp = Date.now();
    await page.goto(`/dogs/toys?v=${timestamp}`, { waitUntil: 'networkidle' });
    
    await expect(page.locator('.category-title')).toContainText('Dog Toys');
    
    const debugLine = page.locator('#categoryDebug');
    await expect(debugLine).toContainText('pet_type=dog');
    await expect(debugLine).toContainText('subcategory=toys');
    
    const productTitles = await page.locator('.product-card .card-title, .product-card h3, .product-card h4').allTextContents();
    
    for (const title of productTitles) {
      expect(title.toLowerCase()).not.toContain('cat toys');
      expect(title.toLowerCase()).not.toMatch(/\bcat\b.*\btoy/);
    }
    
    console.log(`[Test] Found ${productTitles.length} products on dogs/toys page`);
    expect(productTitles.length).toBeGreaterThan(0);
  });

  test('Add to cart works without "still loading" toast', async ({ page }) => {
    const timestamp = Date.now();
    await page.goto(`/dogs/toys?v=${timestamp}`, { waitUntil: 'networkidle' });
    
    await page.waitForTimeout(1500);
    
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(msg.text()));
    
    const addButtons = page.locator('.add-to-cart, .add-to-cart-btn, [data-add-to-cart], button:has-text("Add")');
    const buttonCount = await addButtons.count();
    expect(buttonCount).toBeGreaterThan(0);
    
    await addButtons.first().click();
    await page.waitForTimeout(1000);
    
    if (buttonCount > 1) {
      await addButtons.nth(1).click();
      await page.waitForTimeout(1000);
    }
    
    const stillLoadingToast = page.locator('.toast:has-text("still loading"), .pdp-toast:has-text("still loading"), [class*="toast"]:has-text("still loading")');
    const toastVisible = await stillLoadingToast.isVisible().catch(() => false);
    expect(toastVisible).toBe(false);
    
    const hasStillLoadingLog = consoleMessages.some(m => m.toLowerCase().includes('still loading'));
    expect(hasStillLoadingLog).toBe(false);
    
    const cartBadge = page.locator('.cart-count, #cartCount, .pawsy-cart-count, .pawsy-cart-badge');
    const badgeVisible = await cartBadge.isVisible();
    if (badgeVisible) {
      const count = await cartBadge.textContent();
      console.log(`[Test] Cart badge count: ${count}`);
      expect(parseInt(count) || 0).toBeGreaterThan(0);
    }
  });

  test('No horizontal overflow on mobile viewport', async ({ page }) => {
    const timestamp = Date.now();
    await page.goto(`/?v=${timestamp}`, { waitUntil: 'networkidle' });
    
    await page.waitForTimeout(1000);
    
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    
    expect(hasOverflow).toBe(false);
    
    await page.goto(`/dogs/toys?v=${timestamp}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    
    const categoryOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    
    expect(categoryOverflow).toBe(false);
  });

  test('Build endpoint returns valid data', async ({ request }) => {
    const response = await request.get('/__build');
    expect(response.ok()).toBe(true);
    
    const build = await response.json();
    
    expect(build.version).toBeDefined();
    expect(build.version).not.toBe('unknown');
    expect(build.commit).toBeDefined();
    expect(build.commit).not.toBe('unknown');
    expect(build.commitShort).toBeDefined();
    expect(build.commitShort).not.toBe('unknown');
    expect(build.buildTime).toBeDefined();
    expect(build.env).toBeDefined();
    
    console.log(`[Test] Build: v${build.version} commit=${build.commitShort} env=${build.env}`);
  });
});
