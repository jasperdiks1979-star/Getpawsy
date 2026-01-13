const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const PROOF_DIR = path.join(__dirname, '../public/qa/proof-cart');

test.beforeAll(async () => {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
});

test.describe('Cart System E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?resetCart=1`);
    await page.waitForTimeout(500);
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
  });

  test('Add to cart from homepage shows correct badge count', async ({ page }) => {
    await page.waitForSelector('[data-add]', { timeout: 10000 });
    
    const addButtons = await page.locator('[data-add]').all();
    expect(addButtons.length).toBeGreaterThan(0);
    
    const firstAddBtn = addButtons[0];
    await firstAddBtn.click();
    await page.waitForTimeout(600);
    
    const badge = await page.locator('#cartCount, .cart-count, [data-cart-count]').first();
    const badgeText = await badge.textContent();
    expect(parseInt(badgeText)).toBe(1);
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'cart-home-after-1.png'), fullPage: false });
  });

  test('Clicking same Add button twice increases qty, no duplicate rows', async ({ page }) => {
    await page.waitForSelector('[data-add]', { timeout: 10000 });
    
    const addButtons = await page.locator('[data-add]').all();
    const firstAddBtn = addButtons[0];
    const productId = await firstAddBtn.getAttribute('data-add');
    
    await firstAddBtn.click();
    await page.waitForTimeout(600);
    
    await firstAddBtn.click();
    await page.waitForTimeout(600);
    
    const badge = await page.locator('#cartCount, .cart-count, [data-cart-count]').first();
    const badgeText = await badge.textContent();
    expect(parseInt(badgeText)).toBe(2);
    
    const cartItems = await page.evaluate(() => {
      if (window.CartStore) {
        return window.CartStore.getState();
      }
      return [];
    });
    
    const matchingItems = cartItems.filter(item => item.productId === productId);
    expect(matchingItems.length).toBe(1);
    if (matchingItems.length === 1) {
      expect(matchingItems[0].qty).toBe(2);
    }
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'cart-home-after-2.png'), fullPage: false });
  });

  test('Double-click spam does not add multiple items due to lock', async ({ page }) => {
    await page.waitForSelector('[data-add]', { timeout: 10000 });
    
    const addButtons = await page.locator('[data-add]').all();
    const firstAddBtn = addButtons[0];
    
    await firstAddBtn.dblclick();
    await page.waitForTimeout(100);
    await firstAddBtn.click();
    await page.waitForTimeout(600);
    
    const badge = await page.locator('#cartCount, .cart-count, [data-cart-count]').first();
    const badgeText = await badge.textContent();
    const count = parseInt(badgeText);
    expect(count).toBeLessThanOrEqual(2);
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'cart-spam-click.png'), fullPage: false });
  });

  test('Cart persists after page reload', async ({ page }) => {
    await page.waitForSelector('[data-add]', { timeout: 10000 });
    
    const addButtons = await page.locator('[data-add]').all();
    await addButtons[0].click();
    await page.waitForTimeout(600);
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    const badge = await page.locator('#cartCount, .cart-count, [data-cart-count]').first();
    const badgeText = await badge.textContent();
    expect(parseInt(badgeText)).toBeGreaterThanOrEqual(1);
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'cart-persist-reload.png'), fullPage: false });
  });

  test('Badge equals SUM of quantities (Rule A)', async ({ page }) => {
    await page.waitForSelector('[data-add]', { timeout: 10000 });
    
    const addButtons = await page.locator('[data-add]').all();
    
    if (addButtons.length >= 2) {
      await addButtons[0].click();
      await page.waitForTimeout(600);
      
      await addButtons[1].click();
      await page.waitForTimeout(600);
      
      await addButtons[0].click();
      await page.waitForTimeout(600);
      
      const cartState = await page.evaluate(() => {
        if (window.CartStore) {
          return {
            count: window.CartStore.getCount(),
            items: window.CartStore.getState()
          };
        }
        return { count: 0, items: [] };
      });
      
      const sumQty = cartState.items.reduce((sum, item) => sum + item.qty, 0);
      expect(cartState.count).toBe(sumQty);
      expect(sumQty).toBe(3);
      
      const badge = await page.locator('#cartCount, .cart-count, [data-cart-count]').first();
      const badgeText = await badge.textContent();
      expect(parseInt(badgeText)).toBe(3);
    }
    
    await page.screenshot({ path: path.join(PROOF_DIR, 'cart-rule-a-sum.png'), fullPage: false });
  });
});
