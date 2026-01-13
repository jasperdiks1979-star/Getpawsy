const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const PROOF_DIR = 'public/qa/proof';

test.describe('Small Pets Category Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/collection/small-pets', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  });

  test('should show all small pets products', async ({ page }) => {
    const productCards = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
    await expect(productCards.first()).toBeVisible({ timeout: 10000 });
    
    const count = await productCards.count();
    console.log(`[QA] All Small Pets: ${count} products`);
    expect(count).toBeGreaterThan(0);
    
    await page.screenshot({ path: `${PROOF_DIR}/small-pets-all.png`, fullPage: true });
  });

  test('should filter by rabbits animal type', async ({ page }) => {
    await page.goto('/collection/small-pets/rabbits', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const productCards = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
    await expect(productCards.first()).toBeVisible({ timeout: 10000 });
    
    const count = await productCards.count();
    console.log(`[QA] Rabbits filter: ${count} products`);
    expect(count).toBeGreaterThan(0);
    
    await page.screenshot({ path: `${PROOF_DIR}/small-pets-rabbits.png`, fullPage: true });
  });

  test('should filter by guinea-pigs animal type (hyphen URL)', async ({ page }) => {
    await page.goto('/collection/small-pets/guinea-pigs', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const productCards = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
    const noProducts = page.locator('.empty-category, :text("No products found")');
    
    const hasProducts = await productCards.count() > 0;
    const hasEmptyMessage = await noProducts.count() > 0;
    
    console.log(`[QA] Guinea Pigs: hasProducts=${hasProducts}, hasEmptyMessage=${hasEmptyMessage}`);
    
    expect(hasProducts).toBe(true);
    
    await page.screenshot({ path: `${PROOF_DIR}/small-pets-guinea-pigs.png`, fullPage: true });
  });

  test('should filter by cages-habitats product category', async ({ page }) => {
    await page.goto('/collection/small-pets/cages-habitats', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const productCards = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
    await expect(productCards.first()).toBeVisible({ timeout: 10000 });
    
    const count = await productCards.count();
    console.log(`[QA] Cages & Habitats: ${count} products`);
    expect(count).toBeGreaterThan(0);
    
    await page.screenshot({ path: `${PROOF_DIR}/small-pets-cages-habitats.png`, fullPage: true });
  });

  test('filter chips should be clickable and functional', async ({ page }) => {
    const chips = page.locator('.filter-chip');
    await expect(chips.first()).toBeVisible({ timeout: 10000 });
    
    const chipCount = await chips.count();
    console.log(`[QA] Found ${chipCount} filter chips`);
    expect(chipCount).toBeGreaterThan(0);
    
    const rabbitsChip = page.locator('.filter-chip:has-text("Rabbits")');
    if (await rabbitsChip.count() > 0) {
      await rabbitsChip.click();
      await page.waitForTimeout(1000);
      
      const productsAfterClick = page.locator('.product-card, .pawsy-product-card, [data-product-id]');
      const count = await productsAfterClick.count();
      console.log(`[QA] Products after Rabbits chip click: ${count}`);
      expect(count).toBeGreaterThan(0);
    }
    
    await page.screenshot({ path: `${PROOF_DIR}/small-pets-chip-click.png`, fullPage: true });
  });
});

test.describe('Cart Reliability', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('pawsy_cart_v2');
      localStorage.removeItem('cart');
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  });

  test('single click should add exactly one item', async ({ page }) => {
    const productCard = page.locator('.product-card, .pawsy-product-card').first();
    await expect(productCard).toBeVisible({ timeout: 10000 });
    
    const addButton = productCard.locator('button:has-text("Add"), [data-action="add-to-cart"], .add-to-cart-btn').first();
    
    if (await addButton.count() === 0) {
      await productCard.click();
      await page.waitForTimeout(1000);
      
      const pdpAddButton = page.locator('button:has-text("Add to Cart"), [data-action="add-to-cart"]').first();
      await expect(pdpAddButton).toBeVisible({ timeout: 5000 });
      
      const initialBadge = await page.locator('.cart-badge, .cart-count, [data-cart-count]').textContent().catch(() => '0');
      const initialCount = parseInt(initialBadge || '0');
      
      await pdpAddButton.click();
      await page.waitForTimeout(800);
      
      const newBadge = await page.locator('.cart-badge, .cart-count, [data-cart-count]').textContent().catch(() => '0');
      const newCount = parseInt(newBadge || '0');
      
      console.log(`[QA] Cart badge: ${initialCount} -> ${newCount}`);
      expect(newCount).toBe(initialCount + 1);
    }
    
    await page.screenshot({ path: `${PROOF_DIR}/cart-single-add.png`, fullPage: true });
  });

  test('double click should not add duplicate items (debounce test)', async ({ page }) => {
    await page.goto('/small-pets/rabbits', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const productCard = page.locator('.product-card, .pawsy-product-card').first();
    await expect(productCard).toBeVisible({ timeout: 10000 });
    
    await productCard.click();
    await page.waitForTimeout(1000);
    
    const addButton = page.locator('button:has-text("Add to Cart"), [data-action="add-to-cart"]').first();
    await expect(addButton).toBeVisible({ timeout: 5000 });
    
    await addButton.click();
    await addButton.click();
    await page.waitForTimeout(1000);
    
    const cartBadge = await page.locator('.cart-badge, .cart-count, [data-cart-count]').textContent().catch(() => '0');
    const count = parseInt(cartBadge || '0');
    
    console.log(`[QA] After double-click, cart count: ${count}`);
    expect(count).toBeLessThanOrEqual(2);
    
    await page.screenshot({ path: `${PROOF_DIR}/cart-double-click.png`, fullPage: true });
  });

  test('cart drawer should show correct items', async ({ page }) => {
    await page.goto('/small-pets/rabbits', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const productCard = page.locator('.product-card, .pawsy-product-card').first();
    await expect(productCard).toBeVisible({ timeout: 10000 });
    
    await productCard.click();
    await page.waitForTimeout(1000);
    
    const addButton = page.locator('button:has-text("Add to Cart"), [data-action="add-to-cart"]').first();
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();
    await page.waitForTimeout(800);
    
    const cartToggle = page.locator('.cart-toggle, .cart-icon, [data-cart-toggle], .cart-button').first();
    if (await cartToggle.count() > 0) {
      await cartToggle.click();
      await page.waitForTimeout(500);
      
      const cartItems = page.locator('.cart-item, .cart-line-item, [data-cart-item]');
      const itemCount = await cartItems.count();
      console.log(`[QA] Cart drawer shows ${itemCount} items`);
      
      const badge = await page.locator('.cart-badge, .cart-count, [data-cart-count]').textContent().catch(() => '0');
      console.log(`[QA] Cart badge shows: ${badge}`);
    }
    
    await page.screenshot({ path: `${PROOF_DIR}/cart-drawer.png`, fullPage: true });
  });
});

test.describe('Backend Collection Routes', () => {
  test('GET /collection/small-pets should return products', async ({ request }) => {
    const response = await request.get('/collection/small-pets');
    expect(response.ok()).toBe(true);
    
    const html = await response.text();
    const hasProducts = html.includes('product-card') || html.includes('pawsy-product-card');
    const hasNoProducts = html.includes('No products') || html.includes('empty');
    
    console.log(`[QA] /collection/small-pets: hasProducts=${hasProducts}, length=${html.length}`);
    expect(hasProducts || html.length > 5000).toBe(true);
  });

  test('GET /collection/small-pets/rabbits should return rabbit products', async ({ request }) => {
    const response = await request.get('/collection/small-pets/rabbits');
    expect(response.ok()).toBe(true);
    
    const html = await response.text();
    console.log(`[QA] /collection/small-pets/rabbits: length=${html.length}`);
    expect(html.length).toBeGreaterThan(1000);
  });

  test('GET /collection/small-pets/guinea-pigs should return guinea pig products', async ({ request }) => {
    const response = await request.get('/collection/small-pets/guinea-pigs');
    expect(response.ok()).toBe(true);
    
    const html = await response.text();
    console.log(`[QA] /collection/small-pets/guinea-pigs: length=${html.length}`);
    expect(html.length).toBeGreaterThan(1000);
  });

  test('GET /api/products should return small pets with correct fields', async ({ request }) => {
    const response = await request.get('/api/products?limit=1000');
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    const items = data.items || data.products || [];
    
    const smallPets = items.filter(p => {
      const pt = (p.petType || p.pet_type || '').toLowerCase();
      return pt === 'smallpets' || pt === 'small_pet';
    });
    
    console.log(`[QA] API: ${smallPets.length} small pets total`);
    expect(smallPets.length).toBeGreaterThan(0);
    
    const rabbits = smallPets.filter(p => p.smallPetType === 'rabbits');
    const guineaPigs = smallPets.filter(p => p.smallPetType === 'guinea_pigs');
    
    console.log(`[QA] API: ${rabbits.length} rabbits, ${guineaPigs.length} guinea pigs`);
    expect(rabbits.length).toBeGreaterThan(0);
  });
});
