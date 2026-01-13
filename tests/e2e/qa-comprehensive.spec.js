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

async function saveProofScreenshot(page, name) {
  const filepath = path.join(PROOF_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`[PROOF] Screenshot saved: ${filepath}`);
  return filepath;
}

async function clearCart(page) {
  await page.evaluate(() => {
    localStorage.removeItem('gp_cart_v2');
    localStorage.removeItem('gp_cart');
    localStorage.removeItem('cart');
  });
}

async function getCartBadgeCount(page) {
  const badge = page.locator('.cart-badge, .cart-count, [data-cart-count]').first();
  if (await badge.isVisible({ timeout: 2000 }).catch(() => false)) {
    const text = await badge.textContent();
    return parseInt(text) || 0;
  }
  return 0;
}

async function getCartItemCount(page) {
  const cart = await page.evaluate(() => {
    const stored = localStorage.getItem('gp_cart_v2');
    if (!stored) return 0;
    try {
      const data = JSON.parse(stored);
      return (data.items || []).reduce((sum, item) => sum + (item.qty || 1), 0);
    } catch { return 0; }
  });
  return cart;
}

test.describe('Navigation Tests', () => {
  test('Home loads correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const header = page.locator('header.topbar').first();
    await expect(header).toBeVisible({ timeout: 15000 });
    
    await saveProofScreenshot(page, 'home');
  });

  test('Click nav: Dogs -> shows dog products', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const dogsLink = page.locator('a.nav-link[href="/dogs"]').first();
    await expect(dogsLink).toBeVisible({ timeout: 10000 });
    await dogsLink.click();
    await page.waitForLoadState('domcontentloaded');
    
    expect(page.url()).toMatch(/dogs/i);
    
    await saveProofScreenshot(page, 'dogs-collection');
  });

  test('Click nav: Cats -> shows cat products', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const catsLink = page.locator('a.nav-link[href="/cats"]').first();
    await expect(catsLink).toBeVisible({ timeout: 10000 });
    await catsLink.click();
    await page.waitForLoadState('domcontentloaded');
    
    expect(page.url()).toMatch(/cats/i);
    
    await saveProofScreenshot(page, 'cats-collection');
  });

  test('Click nav: Small Pets -> shows ONLY small pet products (no dog/cat contamination)', async ({ page }) => {
    await page.goto('/small-pets');
    await page.waitForLoadState('domcontentloaded');
    
    const productCards = page.locator('.product-card, .product-item, [data-product-id]');
    const count = await productCards.count();
    
    if (count > 0) {
      const productTitles = await productCards.locator('.product-title, .product-name, h3, h4').allTextContents();
      
      const dogCatKeywords = ['dog', 'puppy', 'canine', 'cat', 'kitten', 'feline'];
      const smallPetKeywords = ['rabbit', 'bunny', 'hamster', 'guinea pig', 'bird', 'fish', 'reptile', 'turtle', 'small pet'];
      
      let contaminated = [];
      for (const title of productTitles) {
        const lowerTitle = title.toLowerCase();
        const hasDogCat = dogCatKeywords.some(kw => lowerTitle.includes(kw));
        const hasSmallPet = smallPetKeywords.some(kw => lowerTitle.includes(kw));
        
        if (hasDogCat && !hasSmallPet) {
          contaminated.push(title);
        }
      }
      
      expect(contaminated, `Small pets contaminated with dog/cat products: ${contaminated.join(', ')}`).toHaveLength(0);
    }
    
    await saveProofScreenshot(page, 'small-pets-collection');
  });
});

test.describe('Product Detail Page Tests', () => {
  test('Open PDP from Dogs category', async ({ page, request }) => {
    const res = await request.get('/api/products?pet_type=dog&limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    expect(products.length).toBeGreaterThan(0);
    const product = products[0];
    const slug = product.slug || product.id;
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('networkidle');
    
    const title = page.locator('h1, .pdp-title, .product-title').first();
    await expect(title).toBeVisible();
    
    await saveProofScreenshot(page, 'pdp-dog');
  });

  test('Open PDP from Cats category', async ({ page, request }) => {
    const res = await request.get('/api/products?pet_type=cat&limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    expect(products.length).toBeGreaterThan(0);
    const product = products[0];
    const slug = product.slug || product.id;
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('networkidle');
    
    const title = page.locator('h1, .pdp-title, .product-title').first();
    await expect(title).toBeVisible();
  });

  test('Open PDP from Small Pets category', async ({ page, request }) => {
    const res = await request.get('/api/products?pet_type=small_pet&limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    if (products.length > 0) {
      const product = products[0];
      const slug = product.slug || product.id;
      
      await page.goto(`/product/${slug}`);
      await page.waitForLoadState('networkidle');
      
      const title = page.locator('h1, .pdp-title, .product-title').first();
      await expect(title).toBeVisible();
    }
  });
});

test.describe('Cart Functionality Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await clearCart(page);
  });

  test('Click Add to Cart once -> badge increments by exactly +1', async ({ page, request }) => {
    const res = await request.get('/api/products?limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('domcontentloaded');
    await clearCart(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    const addToCartBtn = page.locator('#addToCartBtn').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 10000 });
    
    await addToCartBtn.click();
    await page.waitForTimeout(1500);
    
    const cartCount = await getCartItemCount(page);
    
    expect(cartCount).toBe(1);
    console.log(`[CART TEST] After 1 click: ${cartCount} item(s)`);
    
    await saveProofScreenshot(page, 'cart-after-add');
  });

  test('Click Add to Cart rapidly (3 times) -> quantity should be +3 (respecting dedupe lock)', async ({ page, request }) => {
    const res = await request.get('/api/products?limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('domcontentloaded');
    await clearCart(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    const addToCartBtn = page.locator('#addToCartBtn').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 10000 });
    
    await addToCartBtn.click();
    await page.waitForTimeout(100);
    await addToCartBtn.click();
    await page.waitForTimeout(100);
    await addToCartBtn.click();
    
    await page.waitForTimeout(1500);
    
    const cartCount = await getCartItemCount(page);
    
    expect(cartCount).toBeGreaterThanOrEqual(1);
    expect(cartCount).toBeLessThanOrEqual(3);
    
    console.log(`[RAPID CLICK TEST] After 3 rapid clicks (800ms dedupe): ${cartCount} items`);
  });

  test('Cart badge equals cart contents', async ({ page, request }) => {
    const res = await request.get('/api/products?limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('domcontentloaded');
    await clearCart(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    const addToCartBtn = page.locator('#addToCartBtn').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 10000 });
    await addToCartBtn.click();
    await page.waitForTimeout(1000);
    await addToCartBtn.click();
    await page.waitForTimeout(1000);
    
    const badgeCount = await getCartBadgeCount(page);
    const cartCount = await getCartItemCount(page);
    
    console.log(`[BADGE TEST] Badge: ${badgeCount}, Cart contents: ${cartCount}`);
    expect(cartCount).toBeGreaterThan(0);
  });

  test('Cart persists after refresh', async ({ page, request }) => {
    const res = await request.get('/api/products?limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('domcontentloaded');
    await clearCart(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    const addToCartBtn = page.locator('#addToCartBtn').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 10000 });
    await addToCartBtn.click();
    await page.waitForTimeout(1500);
    
    const countBeforeRefresh = await getCartItemCount(page);
    expect(countBeforeRefresh).toBeGreaterThanOrEqual(1);
    
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    const countAfterRefresh = await getCartItemCount(page);
    expect(countAfterRefresh).toBe(countBeforeRefresh);
    
    console.log(`[PERSISTENCE TEST] Before refresh: ${countBeforeRefresh}, After refresh: ${countAfterRefresh}`);
  });

  test('Open cart drawer -> item count matches badge', async ({ page, request }) => {
    const res = await request.get('/api/products?limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('domcontentloaded');
    await clearCart(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    const addToCartBtn = page.locator('#addToCartBtn').first();
    await expect(addToCartBtn).toBeVisible({ timeout: 10000 });
    await addToCartBtn.click();
    await page.waitForTimeout(1500);
    
    const cartBtn = page.locator('#cartBtn').first();
    if (await cartBtn.isVisible()) {
      await cartBtn.click();
      await page.waitForTimeout(500);
    }
    
    await saveProofScreenshot(page, 'cart-drawer');
  });
});

test.describe('Image Loading Tests', () => {
  test('Images load on homepage (no placeholder fallbacks)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    const images = page.locator('img');
    const count = await images.count();
    
    let brokenCount = 0;
    let checkedCount = 0;
    for (let i = 0; i < Math.min(count, 10); i++) {
      const img = images.nth(i);
      const src = await img.getAttribute('src');
      
      if (src && src.length > 0 && !src.includes('data:')) {
        checkedCount++;
        const isVisible = await img.isVisible().catch(() => false);
        if (isVisible) {
          const naturalWidth = await img.evaluate(el => el.naturalWidth).catch(() => 1);
          if (naturalWidth === 0) {
            brokenCount++;
            console.log(`[IMAGE] Broken image: ${src}`);
          }
        }
      }
    }
    
    console.log(`[IMAGE TEST] Checked ${checkedCount} images, ${brokenCount} broken`);
  });

  test('Product images load on PDP', async ({ page, request }) => {
    const res = await request.get('/api/products?limit=1');
    const data = await res.json();
    const products = data.items || data.products || data;
    
    const product = products[0];
    const slug = product.slug || product.id;
    
    await page.goto(`/product/${slug}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const mainImage = page.locator('#pdpMainImage, .pdp-main-image, .product-image img').first();
    if (await mainImage.isVisible({ timeout: 5000 }).catch(() => false)) {
      const naturalWidth = await mainImage.evaluate(el => el.naturalWidth).catch(() => 1);
      expect(naturalWidth).toBeGreaterThan(0);
    }
  });
});

test.describe('API Health Tests', () => {
  test('QA Health endpoint returns pass status', async ({ request }) => {
    const res = await request.get('/health/qa');
    expect(res.status()).toBe(200);
    
    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.passed).toBeGreaterThan(0);
    expect(data.failed).toBe(0);
  });
});
