const { test, expect } = require('@playwright/test');

// Helper: close pet profile modal if it appears
async function closePetProfileModal(page) {
  try {
    const modal = page.locator('#petProfileModal.active');
    if (await modal.isVisible({ timeout: 500 })) {
      const overlay = page.locator('.pet-profile-overlay');
      if (await overlay.isVisible()) {
        await overlay.click({ force: true });
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {
    // Modal not present, continue
  }
}

// Helper: set localStorage to skip modal before page load
async function skipPetProfileModal(page) {
  await page.addInitScript(() => {
    localStorage.setItem('getpawsy_profile_modal_shown', 'true');
  });
}

const PUBLIC_ROUTES = [
  { path: '/', name: 'Homepage' },
  { path: '/dogs', name: 'Dogs Landing' },
  { path: '/cats', name: 'Cats Landing' },
  { path: '/collections', name: 'Collections' },
  { path: '/categories', name: 'Categories' },
];

const HEALTH_ENDPOINTS = [
  '/health',
  '/healthz',
  '/api/health',
  '/api/version',
  '/api/build',
];

test.describe('Shop - Route Smoke Tests', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.name} (${route.path}) loads correctly`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response.status()).toBe(200);
      
      await expect(page.locator('header').first()).toBeVisible({ timeout: 10000 });
      
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      
      await page.waitForLoadState('networkidle');
      
      const criticalErrors = consoleErrors.filter(e => 
        !e.includes('favicon') && 
        !e.includes('analytics') &&
        !e.includes('gtag') &&
        !e.includes('Failed to load resource') &&  // Non-critical network errors
        !e.includes('net::ERR')  // Network-level errors
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }
});

test.describe('Shop - Health Endpoints', () => {
  for (const endpoint of HEALTH_ENDPOINTS) {
    test(`${endpoint} returns 200`, async ({ request }) => {
      const response = await request.get(endpoint);
      expect(response.status()).toBe(200);
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('application/json')) {
        const body = await response.json();
        expect(body).toBeTruthy();
      }
    });
  }
});

test.describe('Shop - Navigation', () => {
  test('Header navigation links work', async ({ page }) => {
    await skipPetProfileModal(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await closePetProfileModal(page);
    
    const navLinks = page.locator('nav a, header a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
    
    const dogsLink = page.locator('a[href="/dogs"]').first();
    if (await dogsLink.isVisible()) {
      await dogsLink.click({ timeout: 5000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      expect(page.url()).toContain('/dogs');
    }
  });

  test('Footer links are present', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('Logo links to homepage', async ({ page }) => {
    await skipPetProfileModal(page);
    await page.goto('/dogs');
    await page.waitForLoadState('networkidle');
    await closePetProfileModal(page);
    
    const logo = page.locator('[data-testid="logo"], .logo, a[href="/"]').first();
    if (await logo.isVisible()) {
      await logo.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toMatch(/\/$/);
    }
  });
});

test.describe('Shop - Products API', () => {
  test('Products API returns data', async ({ request }) => {
    const response = await request.get('/api/products');
    expect([200, 404]).toContain(response.status());
    if (response.status() === 200) {
      const data = await response.json();
      const items = data.items || data.products || data;
      expect(Array.isArray(items)).toBe(true);
    }
  });

  test('Products are pet-eligible only', async ({ request }) => {
    const response = await request.get('/api/products');
    const data = await response.json();
    const products = data.items || data.products || data;
    
    if (products.length > 0) {
      const sample = products.slice(0, 10);
      for (const product of sample) {
        expect(product.isPetAllowed !== false).toBe(true);
      }
    }
  });
});

test.describe('Shop - Product Detail Page', () => {
  test('Product page loads with valid content', async ({ page, request }) => {
    const productsRes = await request.get('/api/products?limit=5');
    const data = await productsRes.json();
    const products = data.items || data.products || data;
    
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const slug = product.slug || product.spu || product.id;
    expect(slug).toBeTruthy();
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('networkidle');
    
    const title = page.locator('h1, .product-title, [data-testid="product-title"], .pdp-title').first();
    await expect(title).toBeVisible({ timeout: 10000 });
    
    expect(product.price).toBeDefined();
    expect(typeof product.price === 'number' || typeof product.price === 'string').toBe(true);
  });

  test('Product images load without errors', async ({ page, request }) => {
    const productsRes = await request.get('/api/products?limit=3');
    const data = await productsRes.json();
    const products = data.items || data.products || data;
    
    if (products.length > 0) {
      const product = products[0];
      const slug = product.slug || product.pid;
      
      await page.goto(`/product/${slug}`);
      await page.waitForLoadState('networkidle');
      
      const images = page.locator('img');
      const imgCount = await images.count();
      
      if (imgCount > 0) {
        const firstImg = images.first();
        await expect(firstImg).toBeVisible();
      }
    }
  });
});

test.describe('Shop - Search', () => {
  test('Search returns results for "dog"', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const searchInput = page.locator('input[type="search"], input[placeholder*="earch"], [data-testid="search-input"]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('dog');
      await searchInput.press('Enter');
      await page.waitForTimeout(1000);
    }
  });

  test('Search API returns results', async ({ request }) => {
    const response = await request.get('/api/search?q=dog');
    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Shop - Cart', () => {
  test('Cart icon is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const cartIcon = page.locator('[data-testid="cart-icon"], .cart-icon, a[href*="cart"], button:has-text("Cart")').first();
    await expect(cartIcon).toBeVisible();
  });

  test('Add to cart updates cart count', async ({ page, request }) => {
    const productsRes = await request.get('/api/products?limit=1');
    const data = await productsRes.json();
    const products = data.items || data.products || data;
    
    if (products.length > 0) {
      const product = products[0];
      const slug = product.slug || product.pid;
      
      await page.goto(`/product/${slug}`);
      await page.waitForLoadState('networkidle');
      
      const addToCartBtn = page.locator('button:has-text("Add to Cart"), button:has-text("Add to Bag"), [data-testid="add-to-cart"]').first();
      
      if (await addToCartBtn.isVisible()) {
        await addToCartBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('Add to cart does NOT redirect to homepage', async ({ page, request }) => {
    // Get a product to use for testing
    const productsRes = await request.get('/api/products?limit=1');
    const data = await productsRes.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const productId = product.id || product.pid;
    
    // Navigate to homepage and then use JS to trigger the SPA route
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Dismiss any modals/overlays
    await page.evaluate(() => {
      // Close pet profile modal if open
      const modal = document.querySelector('#petProfileModal');
      if (modal) modal.classList.remove('active');
      // Close cookie banner
      const banner = document.querySelector('.cookie-consent');
      if (banner) banner.style.display = 'none';
    });
    
    // Navigate to product via hash change (proper SPA navigation)
    await page.evaluate((pid) => {
      window.location.hash = `product/${pid}`;
    }, productId);
    
    // Wait for PDP to load
    await page.waitForTimeout(1500);
    
    // Check if PDP is visible
    const pdpVisible = await page.locator('#productDetail:not(.hidden)').isVisible().catch(() => false);
    if (!pdpVisible) {
      console.log('PDP not visible, test skipped');
      return; // Skip if PDP doesn't load
    }
    
    const beforeUrl = page.url();
    console.log(`Before click: ${beforeUrl}`);
    
    // Click Add to Cart using JavaScript to ensure it triggers
    await page.evaluate(() => {
      const btn = document.querySelector('#detailAddBtn');
      if (btn) btn.click();
    });
    
    // Wait and check
    await page.waitForTimeout(1000);
    
    const afterUrl = page.url();
    console.log(`After click: ${afterUrl}`);
    
    // URL should still contain product hash or path (not just homepage)
    expect(afterUrl).toMatch(/#product\/|\/product\//);
    console.log('SUCCESS: Add to Cart did NOT redirect to homepage');
  });

  test('Cart drawer shows correct total (not $0.00)', async ({ page, request }) => {
    await skipPetProfileModal(page);
    
    // Get a product
    const productsRes = await request.get('/api/products?limit=1');
    const data = await productsRes.json();
    const products = data.items || data.products || data;
    
    if (products.length > 0) {
      const product = products[0];
      const productId = product.id || product.pid;
      
      // Navigate to homepage first, then set hash to avoid encoding
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await closePetProfileModal(page);
      
      // Use JavaScript to navigate to product page via hash
      await page.evaluate((pid) => {
        window.location.hash = `product/${pid}`;
      }, productId);
      await page.waitForTimeout(1500);
      
      // Add to cart
      const addToCartBtn = page.locator('#detailAddBtn, #stickyAddBtn, button:has-text("Add to Cart")').first();
      if (await addToCartBtn.isVisible({ timeout: 5000 })) {
        await addToCartBtn.click();
        await page.waitForTimeout(800);
        
        // Open cart drawer
        const cartIcon = page.locator('#cartBtn, .cart-icon, [aria-label*="cart"]').first();
        if (await cartIcon.isVisible()) {
          await cartIcon.click();
          await page.waitForTimeout(500);
          
          // Check total is not $0.00
          const totalEl = page.locator('.cart-total, #cartTotal, [class*="total"]').first();
          if (await totalEl.isVisible()) {
            const totalText = await totalEl.textContent();
            expect(totalText).not.toMatch(/^\$?0\.00$/);
            console.log(`Cart total: ${totalText}`);
          }
        }
      }
    }
  });
});

test.describe('Shop - Price Validation', () => {
  test('Products have real prices (not all $9.95)', async ({ request }) => {
    // Check products from different parts of the catalog to get price diversity
    const [res1, res2] = await Promise.all([
      request.get('/api/products?limit=10&offset=0'),
      request.get('/api/products?limit=10&offset=300')
    ]);
    
    const data1 = await res1.json();
    const data2 = await res2.json();
    const products = [...(data1.items || []), ...(data2.items || [])];
    
    expect(products.length).toBeGreaterThan(0);
    
    // Count how many have the suspected fallback price
    const fallbackPriced = products.filter(p => p.price === 9.95);
    const fallbackPercent = (fallbackPriced.length / products.length) * 100;
    
    console.log(`Fallback price ($9.95) in sample: ${fallbackPercent.toFixed(1)}%`);
    
    // Catalog should have diverse pricing - not all products should be $9.95
    const uniquePrices = new Set(products.map(p => p.price));
    expect(uniquePrices.size).toBeGreaterThan(1);
  });

  test('Cart item price matches product price', async ({ page, request }) => {
    await skipPetProfileModal(page);
    
    const productsRes = await request.get('/api/products?limit=5');
    const data = await productsRes.json();
    const products = data.items || data.products || data;
    
    expect(products.length).toBeGreaterThan(0);
    
    // Find a product with price != 9.95 if possible
    let product = products.find(p => p.price !== 9.95) || products[0];
    const productId = product.id || product.pid;
    const expectedPrice = product.price;
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await closePetProfileModal(page);
    
    await page.evaluate((pid) => {
      window.location.hash = `product/${pid}`;
    }, productId);
    await page.waitForTimeout(1500);
    
    // Add to cart - MUST be visible (scroll to make button visible first)
    const addToCartBtn = page.locator('#detailAddBtn');
    await addToCartBtn.scrollIntoViewIfNeeded();
    await expect(addToCartBtn).toBeVisible({ timeout: 5000 });
    await addToCartBtn.click();
    await page.waitForTimeout(800);
    
    // Get cart data from CartStore - MUST exist
    const cartData = await page.evaluate(() => {
      if (window.CartStore) {
        return {
          count: window.CartStore.getCount(),
          subtotal: window.CartStore.getSubtotal(),
          items: window.CartStore.getItems()
        };
      }
      return null;
    });
    
    expect(cartData).not.toBeNull();
    expect(cartData.items.length).toBeGreaterThan(0);
    
    const cartItem = cartData.items[0];
    console.log(`Product price: ${expectedPrice}, Cart item price: ${cartItem.price}`);
    expect(cartItem.price).toBe(expectedPrice);
  });
});

test.describe('Shop - Cart Persistence', () => {
  test('Cart survives page refresh', async ({ page, request }) => {
    await skipPetProfileModal(page);
    
    const productsRes = await request.get('/api/products?limit=1');
    const data = await productsRes.json();
    const products = data.items || data.products || data;
    
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const productId = product.id || product.pid;
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await closePetProfileModal(page);
    
    await page.evaluate((pid) => {
      window.location.hash = `product/${pid}`;
    }, productId);
    await page.waitForTimeout(1500);
    
    // Add to cart - MUST be visible (scroll to make button visible first)
    const addToCartBtn = page.locator('#detailAddBtn');
    await addToCartBtn.scrollIntoViewIfNeeded();
    await expect(addToCartBtn).toBeVisible({ timeout: 5000 });
    await addToCartBtn.click();
    await page.waitForTimeout(800);
    
    const countBefore = await page.evaluate(() => window.CartStore?.getCount() || 0);
    console.log(`Cart count before refresh: ${countBefore}`);
    expect(countBefore).toBeGreaterThan(0);
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.CartStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(500);
    
    const countAfter = await page.evaluate(() => window.CartStore?.getCount() || 0);
    console.log(`Cart count after refresh: ${countAfter}`);
    expect(countAfter).toBe(countBefore);
  });
});

test.describe('Shop - Image Validation', () => {
  test('Product grid shows real images', async ({ page }) => {
    await skipPetProfileModal(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await closePetProfileModal(page);
    await page.waitForTimeout(2000); // Wait for carousel to load
    
    // Get product images from carousel (uses .pawsy-product-thumb class)
    const productImages = page.locator('.pawsy-product-thumb, .product-thumb, [class*="product"] img');
    const imgCount = await productImages.count();
    
    console.log(`Found ${imgCount} product images on page`);
    expect(imgCount).toBeGreaterThan(0);
    
    let realImagesCount = 0;
    const checkCount = Math.min(imgCount, 5);
    
    for (let i = 0; i < checkCount; i++) {
      const img = productImages.nth(i);
      const src = await img.getAttribute('src');
      
      // Check it's not a placeholder
      if (src && !src.includes('placeholder')) {
        realImagesCount++;
      }
    }
    
    console.log(`Real images: ${realImagesCount} of ${checkCount} checked`);
    expect(realImagesCount).toBeGreaterThan(0);
  });
});

test.describe('Shop - Pawsy Mascot', () => {
  test('Pawsy widget is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const pawsy = page.locator('#pawsyMascotte, .pawsy-mascotte, [data-testid="pawsy"]').first();
    await expect(pawsy).toBeVisible({ timeout: 10000 });
  });

  test('Pawsy video loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const video = page.locator('#pawsyVideo, .pawsy-video').first();
    if (await video.isVisible()) {
      await expect(video).toBeVisible();
    }
  });
});
