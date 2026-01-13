const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function snap(page, name) {
  const dir = path.join(process.cwd(), 'test-results', 'screenshots');
  ensureDir(dir);
  const safe = name.replace(/[^a-z0-9-_]+/gi, '_');
  await page.screenshot({ path: path.join(dir, `${safe}.png`), fullPage: true });
}

test.describe('GetPawsy - Visual E2E Verification', () => {
  
  test('0) /collection/small-pets redirects to /small-pets (modern UI)', async ({ page }, testInfo) => {
    // Navigate to legacy URL
    await page.goto('/collection/small-pets', { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    
    // Verify URL contains /small-pets
    const currentUrl = page.url();
    console.log(`[TEST 0] ${testInfo.project.name}: URL after redirect = ${currentUrl}`);
    expect(currentUrl, 'Should redirect to /small-pets').toContain('/small-pets');
    
    // Verify modern UI (has search, nav, no legacy blue links)
    const hasSearch = await page.locator('input[placeholder*="Search"], #search').count() > 0;
    const hasNav = await page.locator('nav, .nav-links, header').count() > 0;
    console.log(`[TEST 0] ${testInfo.project.name}: Has search = ${hasSearch}, Has nav = ${hasNav}`);
    
    await snap(page, `${testInfo.project.name}_redirect_modern_ui`);
    
    expect(hasNav, 'Should have modern navigation').toBe(true);
  });
  
  test('1) /small-pets shows products (no "No products found")', async ({ page }, testInfo) => {
    await page.goto('/small-pets', { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    
    await snap(page, `${testInfo.project.name}_small-pets_page`);
    
    const noProductsVisible = await page.locator('text=/No products found/i').isVisible().catch(() => false);
    console.log(`[TEST 1] ${testInfo.project.name}: "No products found" visible = ${noProductsVisible}`);
    
    const cards = page.locator('.pawsy-product-card, .product-card, [data-product-id]');
    const cardCount = await cards.count();
    console.log(`[TEST 1] ${testInfo.project.name}: Found ${cardCount} product cards in DOM`);
    
    expect(noProductsVisible, '"No products found" should NOT be visible').toBe(false);
    expect(cardCount, 'Should have products visible').toBeGreaterThan(0);
    
    const response = await page.request.get('/api/products?category=small_pets&limit=10');
    const data = await response.json();
    console.log(`[TEST 1] ${testInfo.project.name}: API returns ${data.total} total products`);
    expect(data.total, 'API should return products').toBeGreaterThan(0);
  });

  test('2) PDP shows main image (not "No image")', async ({ page }, testInfo) => {
    const response = await page.request.get('/api/products?category=small_pets&limit=1');
    const data = await response.json();
    const product = data.items?.[0];
    
    if (!product) {
      console.log('[TEST 2] No products available to test');
      return;
    }
    
    const productUrl = `/product/${product.slug || product.id}`;
    console.log(`[TEST 2] ${testInfo.project.name}: Navigating to ${productUrl}`);
    
    await page.goto(productUrl, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    
    await snap(page, `${testInfo.project.name}_pdp_loaded`);
    
    const noImageVisible = await page.locator('text=/^No image$/i').isVisible().catch(() => false);
    console.log(`[TEST 2] ${testInfo.project.name}: "No image" visible = ${noImageVisible}`);
    
    const mainImg = page.locator('.product-gallery img, .pdp-main-image img, .main-image img, .product-image img, img[alt*="product"]').first();
    const mainImgExists = await mainImg.count() > 0;
    let mainImgSrc = '';
    if (mainImgExists) {
      mainImgSrc = await mainImg.getAttribute('src') || '';
    }
    console.log(`[TEST 2] ${testInfo.project.name}: Main image src = ${mainImgSrc}`);
    
    expect(noImageVisible, 'Should NOT show "No image" text').toBe(false);
    expect(mainImgSrc, 'Main image should have valid src').toBeTruthy();
  });

  test('3) Cart badge and drawer consistency', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    
    const response = await page.request.get('/api/products?category=small_pets&limit=1');
    const data = await response.json();
    const product = data.items?.[0];
    
    if (!product) {
      console.log('[TEST 3] No products available to test');
      return;
    }
    
    const productUrl = `/product/${product.slug || product.id}`;
    await page.goto(productUrl, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    
    const addToCartBtn = page.locator('.pdp-atc-btn, button:has-text("Add to Cart"), [data-action="add-to-cart"]').first();
    const atcExists = await addToCartBtn.count() > 0;
    console.log(`[TEST 3] ${testInfo.project.name}: Add to Cart button exists = ${atcExists}`);
    
    if (!atcExists) {
      await snap(page, `${testInfo.project.name}_cart_no_atc_btn`);
      expect(atcExists, 'PDP should have Add to Cart button').toBe(true);
      return;
    }
    
    await addToCartBtn.click();
    await page.waitForTimeout(1500);
    
    await snap(page, `${testInfo.project.name}_after_add_to_cart`);
    
    const cartBadge = page.locator('.cart-count, #cartCount, #pawsyCartCount').first();
    const badgeText = await cartBadge.textContent().catch(() => '0');
    const badgeCount = parseInt(badgeText || '0', 10);
    console.log(`[TEST 3] ${testInfo.project.name}: Badge count = ${badgeCount}`);
    
    const cartToggle = page.locator('a:has-text("Cart"), button[aria-label*="cart"], #cartToggle').first();
    if (await cartToggle.count() > 0) {
      await cartToggle.click();
      await page.waitForTimeout(1000);
      
      const drawerItems = page.locator('.cart-drawer-item, .cart-item, [data-cart-item]');
      const drawerItemCount = await drawerItems.count();
      console.log(`[TEST 3] ${testInfo.project.name}: Drawer items = ${drawerItemCount}`);
      
      await snap(page, `${testInfo.project.name}_cart_drawer_open`);
      
      expect(badgeCount, 'Badge should show at least 1 after add').toBeGreaterThan(0);
      expect(drawerItemCount, 'Drawer should have items after add').toBeGreaterThan(0);
    }
    
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);
    
    const badgeAfterReload = page.locator('.cart-count, #cartCount, #pawsyCartCount').first();
    const badgeAfterText = await badgeAfterReload.textContent().catch(() => '0');
    const badgeAfterCount = parseInt(badgeAfterText || '0', 10);
    console.log(`[TEST 3] ${testInfo.project.name}: Badge after reload = ${badgeAfterCount}`);
    
    await snap(page, `${testInfo.project.name}_cart_after_reload`);
    
    expect(badgeAfterCount, 'Badge should persist after reload').toBe(badgeCount);
  });

  test('4) Small Pets has no blocked slugs (false positives filtered)', async ({ page }, testInfo) => {
    const blockedSlugs = [
      "korean-style-sweet-and-cute-bunny-ear-plush-hat",
      "easter-bunny-shaped-decorative-creative-resin-craft-ornaments",
      "bunny-stuffed-toy-95cm-white-8124",
      "brazilian-bunny-chocolate-color-long-lasting-moisturizing-lip-gloss",
      "transform-into-a-milk-tea-pig-plush-toy-cute-little-bunny",
      "womens-thickened-coral-fleece-winter-cute-bunny-pajamas",
      "baby-sweet-bunny-romper-ruffle-trim-onesie-with-adjustable-straps-snap-closure",
      "2d-ribbon-bunny-ears-hood-with-bow-and-pearl-decoration-cute-versatile-long-slee",
      "bunny-suction-cup-hook-random",
      "bunny-headband-4111",
      "1-led-bunnyfat-bearstupid-bearchestnut-bearduck-night-lightcute-rainbow-light-ch",
      "cute-cupcake-liners-wrappers-with-plastic-spoons-bunny-flower-pattern-paper-baki",
      "cute-pig-long-plush-pillow-bunny-doll",
      "pastoral-style-girl-floral-bunny-washed-cotton-bedding"
    ];
    
    const response = await page.request.get('/api/products?petType=small_pet&limit=500');
    const data = await response.json();
    const slugs = data.items?.map(p => p.slug || p.handle || '') || [];
    
    console.log(`[TEST 4] ${testInfo.project.name}: Total small pet products = ${data.total}`);
    
    const foundBlockedSlugs = slugs.filter(s => blockedSlugs.includes(s));
    console.log(`[TEST 4] ${testInfo.project.name}: Blocked slugs found = ${foundBlockedSlugs.length}`);
    if (foundBlockedSlugs.length > 0) {
      console.log(`[TEST 4] Blocked slugs still present: ${foundBlockedSlugs.join(', ')}`);
    }
    
    await page.goto('/small-pets', { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    await snap(page, `${testInfo.project.name}_small_pets_filtered`);
    
    const pageContent = await page.content();
    const pageHasBlockedSlugs = blockedSlugs.some(slug => pageContent.includes(slug));
    console.log(`[TEST 4] ${testInfo.project.name}: Page contains blocked slugs = ${pageHasBlockedSlugs}`);
    
    expect(foundBlockedSlugs.length, 'API should NOT return blocked slugs').toBe(0);
    expect(pageHasBlockedSlugs, 'Page should NOT contain blocked slugs').toBe(false);
  });
});
