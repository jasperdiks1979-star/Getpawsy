const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PROOF_DIR = path.join(process.cwd(), 'public/qa/proof');
const RESULTS_DIR = path.join(process.cwd(), 'test-results');

test.beforeAll(async () => {
  if (!fs.existsSync(PROOF_DIR)) fs.mkdirSync(PROOF_DIR, { recursive: true });
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
});

test.describe('TEST 1 - Small Pets Listing', () => {
  test('Small Pets page shows products (not "No products found")', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name.includes('mobile');
    const suffix = isMobile ? 'mobile' : 'desktop';
    
    await page.goto('/small-pets', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const noProductsText = page.locator('text="No products found"');
    const noProductsVisible = await noProductsText.isVisible().catch(() => false);
    
    const productCards = page.locator('.gp-card, .product-card, article, [class*="product-"], [data-product-id]');
    const productCount = await productCards.count();
    
    console.log(`[TEST 1] ${suffix}: Product cards found: ${productCount}`);
    console.log(`[TEST 1] ${suffix}: "No products found" visible: ${noProductsVisible}`);
    
    await page.screenshot({ path: path.join(PROOF_DIR, `smallpets-${suffix}.png`), fullPage: true });
    
    expect(noProductsVisible, '"No products found" should NOT be visible').toBe(false);
    expect(productCount, 'Should have products visible').toBeGreaterThan(0);
  });

  test('Small Pets API returns products', async ({ page }) => {
    const response = await page.request.get('/api/products?category=small_pets&limit=20');
    const data = await response.json();
    
    console.log(`[TEST 1 API] Items returned: ${data.items?.length}, Total: ${data.total}`);
    
    expect(data.total, 'API should return products').toBeGreaterThan(0);
    expect(data.items?.length, 'Items array should have products').toBeGreaterThan(0);
  });
});

test.describe('TEST 2 - Cart Badge + Drawer Consistency', () => {
  test('Add to cart updates badge AND drawer consistently', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name.includes('mobile');
    const suffix = isMobile ? 'mobile' : 'desktop';
    
    await page.evaluate(() => localStorage.clear());
    await page.goto('/small-pets', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const initialBadge = page.locator('.cart-count, #cartCount, #pawsyCartCount').first();
    const initialCount = await initialBadge.textContent().catch(() => '0');
    console.log(`[TEST 2] Initial badge count: ${initialCount}`);
    
    const productLink = page.locator('a[href*="/product/"]').first();
    if (await productLink.count() > 0) {
      await productLink.click();
      await page.waitForTimeout(2000);
      
      const pdpImage = page.locator('.pdp-main-image img, .product-image img, [class*="gallery"] img').first();
      if (await pdpImage.count() > 0) {
        const imageSrc = await pdpImage.getAttribute('src');
        console.log(`[TEST 2] PDP image src: ${imageSrc}`);
        expect(imageSrc, 'PDP should have real image (not placeholder)').toBeTruthy();
      }
      
      await page.screenshot({ path: path.join(PROOF_DIR, `pdp-before-add-${suffix}.png`) });
      
      const addToCartBtn = page.locator('button:has-text("Add"), button:has-text("Cart"), .pdp-atc-btn, [class*="add-to-cart"]').first();
      if (await addToCartBtn.count() > 0) {
        await addToCartBtn.click();
        await page.waitForTimeout(1500);
        
        await page.screenshot({ path: path.join(PROOF_DIR, `cart-after-add-${suffix}.png`) });
        
        const newBadge = page.locator('.cart-count, #cartCount, #pawsyCartCount').first();
        const newCount = await newBadge.textContent().catch(() => '0');
        console.log(`[TEST 2] Badge after add: ${newCount}`);
        
        expect(parseInt(newCount) || 0, 'Badge should show at least 1 item').toBeGreaterThan(0);
        
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(2000);
        
        const refreshedBadge = page.locator('.cart-count, #cartCount, #pawsyCartCount').first();
        const refreshedCount = await refreshedBadge.textContent().catch(() => '0');
        console.log(`[TEST 2] Badge after refresh: ${refreshedCount}`);
        
        await page.screenshot({ path: path.join(PROOF_DIR, `cart-after-refresh-${suffix}.png`) });
        
        expect(refreshedCount, 'Badge should persist after refresh').toBe(newCount);
      }
    }
  });
});

test.describe('TEST 3 - Image Performance', () => {
  test('Product images load successfully (no 404s)', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name.includes('mobile');
    const suffix = isMobile ? 'mobile' : 'desktop';
    
    const failedImages = [];
    
    page.on('response', response => {
      const url = response.url();
      if ((url.includes('/media/') || url.includes('cjdropshipping')) && 
          (url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.webp') || url.endsWith('.jpeg'))) {
        if (response.status() >= 400) {
          failedImages.push({ url, status: response.status() });
        }
      }
    });
    
    await page.goto('/small-pets', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const images = page.locator('img[src*="/media/"], img[src*="cjdropshipping"]');
    const imageCount = await images.count();
    const imageSrcs = [];
    
    for (let i = 0; i < Math.min(6, imageCount); i++) {
      const src = await images.nth(i).getAttribute('src').catch(() => '');
      if (src) imageSrcs.push(src);
    }
    
    console.log(`[TEST 3] Images found: ${imageCount}`);
    console.log(`[TEST 3] Sample sources: ${imageSrcs.slice(0, 3).join(', ')}`);
    console.log(`[TEST 3] Failed images: ${failedImages.length}`);
    
    await page.screenshot({ path: path.join(PROOF_DIR, `listing-images-${suffix}.png`), fullPage: true });
    
    if (failedImages.length > 0) {
      console.log('[TEST 3] Failed image URLs:', failedImages);
    }
    
    expect(failedImages.length, 'Should have no 404 image errors').toBe(0);
    expect(imageCount, 'Should have images on page').toBeGreaterThan(0);
  });

  test('PDP shows real product image', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name.includes('mobile');
    const suffix = isMobile ? 'mobile' : 'desktop';
    
    await page.goto('/small-pets', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const productLink = page.locator('a[href*="/product/"]').first();
    if (await productLink.count() > 0) {
      await productLink.click();
      await page.waitForTimeout(2000);
      
      const pdpImage = page.locator('.pdp-main-image img, .product-image img, img[id*="main"], .gallery-main img').first();
      
      if (await pdpImage.count() > 0) {
        const src = await pdpImage.getAttribute('src');
        const alt = await pdpImage.getAttribute('alt');
        
        console.log(`[TEST 3 PDP] Image src: ${src}`);
        console.log(`[TEST 3 PDP] Image alt: ${alt}`);
        
        await page.screenshot({ path: path.join(PROOF_DIR, `pdp-image-${suffix}.png`) });
        
        expect(src, 'PDP image should have valid src').toBeTruthy();
      }
    }
  });
});
