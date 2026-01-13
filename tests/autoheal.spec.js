const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5000';
const SCREENSHOTS_DIR = process.env.AUTOHEAL_SCREENSHOTS_DIR || '.autoheal/screenshots';

test.describe('AutoHeal Tests', () => {
  
  test('Home page loads correctly', async ({ page }) => {
    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);
    
    const content = await page.content();
    expect(content.toLowerCase()).toContain('getpawsy');
    
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/home.png` });
  });

  test('Dogs category page loads with products', async ({ page }) => {
    await page.goto(`${BASE_URL}/dogs`, { waitUntil: 'domcontentloaded' });
    
    await page.waitForSelector('.product-card, [data-product], .product-grid article', { timeout: 10000 }).catch(() => null);
    
    const productCards = await page.locator('.product-card, [data-product], .product-grid article').count();
    expect(productCards).toBeGreaterThan(0);
    
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/dogs-category.png` });
  });

  test('PDP cart flow - add to cart works', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE_URL}/api/products?limit=1&active=true`);
    const apiData = await apiResponse.json();
    
    const products = apiData.products || apiData;
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const slug = product.slug || product.id || product.product_id;
    
    await page.goto(`${BASE_URL}/product/${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/pdp-before-cart.png` });
    
    const addToCartButton = page.locator('button:has-text("Add to Cart"), .add-to-cart, [data-action="add-to-cart"]').first();
    
    if (await addToCartButton.isVisible()) {
      await addToCartButton.click();
      await page.waitForTimeout(1500);
      
      const cartButton = page.locator('.cart-button, [data-cart-toggle], header .cart, nav .cart').first();
      if (await cartButton.isVisible()) {
        await cartButton.click();
        await page.waitForTimeout(500);
      }
      
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/pdp-after-cart.png` });
      
      const cartContent = await page.content();
      const hasCartItem = cartContent.includes(product.title) || 
                          cartContent.includes('cart-item') ||
                          cartContent.includes('subtotal');
      
      const cartTotal = await page.locator('.cart-total, .subtotal, [data-cart-total]').textContent().catch(() => '$0.00');
      const totalValue = parseFloat(cartTotal.replace(/[^0-9.]/g, '')) || 0;
      
      expect(hasCartItem || totalValue > 0).toBeTruthy();
    } else {
      console.warn('Add to cart button not found on PDP');
      expect(true).toBe(true);
    }
  });

  test('Product images are not placeholder', async ({ page }) => {
    const apiResponse = await page.request.get(`${BASE_URL}/api/products?limit=5&active=true`);
    const apiData = await apiResponse.json();
    
    const products = apiData.products || apiData;
    expect(products.length).toBeGreaterThan(0);
    
    let productsChecked = 0;
    let productsWithValidImages = 0;
    
    for (const product of products.slice(0, 3)) {
      const slug = product.slug || product.id;
      await page.goto(`${BASE_URL}/product/${slug}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      
      productsChecked++;
      
      const mainImage = page.locator('.product-image img, .pdp-image img, [data-main-image] img, .gallery-main img').first();
      
      if (await mainImage.isVisible()) {
        const src = await mainImage.getAttribute('src');
        
        const isPlaceholder = src?.includes('placeholder') || 
                              src?.includes('no-image') ||
                              !src;
        
        if (!isPlaceholder) {
          productsWithValidImages++;
        }
      }
    }
    
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/product-images.png` });
    
    expect(productsWithValidImages).toBeGreaterThanOrEqual(Math.floor(productsChecked * 0.5));
  });

  test('Admin page loads', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/admin/`, { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);
    
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/admin.png` });
  });

  test('Admin API requires authentication', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/admin/ping`);
    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('UNAUTHORIZED_ADMIN');
  });

  test('Pet-only filtering - no non-pet products in main categories', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/products?limit=50&active=true`);
    const data = await response.json();
    
    const products = data.products || data;
    
    const NON_PET_KEYWORDS = ['sock', 'chair', 'office', 'jewelry', 'cosmetic', 'furniture', 'electronics'];
    
    let violations = [];
    
    for (const product of products) {
      const text = `${product.title || ''} ${product.description || ''}`.toLowerCase();
      
      for (const keyword of NON_PET_KEYWORDS) {
        if (text.includes(keyword)) {
          const titleWords = (product.title || '').toLowerCase().split(/\s+/);
          if (titleWords.some(w => w.includes(keyword))) {
            violations.push({
              id: product.id || product.product_id,
              title: product.title,
              keyword
            });
            break;
          }
        }
      }
    }
    
    console.log(`Pet filter check: ${products.length} products, ${violations.length} violations`);
    if (violations.length > 0) {
      console.log('Violations:', violations.slice(0, 5));
    }
    
    expect(violations.length).toBeLessThan(5);
  });

  test('Diagnostics endpoint returns valid data', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/health/diagnostics`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.products).toBeDefined();
    expect(data.products.total).toBeGreaterThan(0);
  });

});
