#!/usr/bin/env node
/**
 * Carousel Verification Script
 * Validates that all carousel products are:
 * - Pet products (dog/cat/small-pet)
 * - Not blocked (no adult/inappropriate content)
 * - Have valid images
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_PATH = path.join(__dirname, '..', 'data', 'products_cj.json');

let classifyProduct, isValidCarouselProduct, getCarouselProducts, getCarouselDebugInfo;

try {
  const classifier = require('../helpers/productClassifier');
  classifyProduct = classifier.classifyProduct;
  isValidCarouselProduct = classifier.isValidCarouselProduct;
  getCarouselProducts = classifier.getCarouselProducts;
  getCarouselDebugInfo = classifier.getCarouselDebugInfo;
} catch (err) {
  console.error('Failed to load productClassifier:', err.message);
  process.exit(1);
}

function loadProducts() {
  if (!fs.existsSync(PRODUCTS_PATH)) {
    console.error('Products file not found:', PRODUCTS_PATH);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
  return Array.isArray(data) ? data : (data.products || []);
}

function runVerification() {
  console.log('='.repeat(60));
  console.log('CAROUSEL VERIFICATION REPORT');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  const products = loadProducts();
  console.log(`Total products loaded: ${products.length}`);
  console.log('');

  const debugInfo = getCarouselDebugInfo(products);
  
  console.log('CLASSIFICATION SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Valid for carousel: ${debugInfo.validForCarousel} / ${debugInfo.totalProducts}`);
  console.log('');
  
  console.log('BY PET TYPE:');
  console.log(`  Dogs:       ${debugInfo.byPetType.dogs}`);
  console.log(`  Cats:       ${debugInfo.byPetType.cats}`);
  console.log(`  Small Pets: ${debugInfo.byPetType.smallPets}`);
  console.log('');
  
  console.log('SKIPPED PRODUCTS:');
  console.log(`  Blocked (NSFW/inappropriate): ${debugInfo.skipped.blocked}`);
  console.log(`  No valid image:               ${debugInfo.skipped.noImage}`);
  console.log(`  Not a pet product:            ${debugInfo.skipped.notPetProduct}`);
  console.log('');

  console.log('CAROUSEL PRODUCTS');
  console.log('-'.repeat(40));
  
  const carousels = [
    { name: 'Top Picks Dogs', petType: 'dog', limit: 12 },
    { name: 'Top Picks Cats', petType: 'cat', limit: 12 },
    { name: 'Small Pets', petType: 'small-pet', limit: 12 },
    { name: 'Best Sellers', petType: null, limit: 12 },
    { name: 'Trending', petType: null, limit: 12 }
  ];
  
  let allPass = true;
  
  for (const carousel of carousels) {
    const items = getCarouselProducts(products, { 
      petType: carousel.petType, 
      limit: carousel.limit 
    });
    
    let blockedCount = 0;
    let noImageCount = 0;
    let notPetCount = 0;
    
    for (const item of items) {
      const classification = classifyProduct(item);
      if (classification.isBlocked) blockedCount++;
      if (!classification.hasImage) noImageCount++;
      if (!classification.isPetProduct) notPetCount++;
    }
    
    const pass = blockedCount === 0 && noImageCount === 0 && (carousel.petType === null || notPetCount === 0);
    
    console.log(`\n${carousel.name}:`);
    console.log(`  Count: ${items.length}`);
    console.log(`  Blocked: ${blockedCount} | No Image: ${noImageCount} | Not Pet: ${notPetCount}`);
    console.log(`  Status: ${pass ? '✅ PASS' : '❌ FAIL'}`);
    
    if (!pass) allPass = false;
    
    if (items.length > 0) {
      console.log('  Sample IDs:', items.slice(0, 5).map(p => p.id).join(', '));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`OVERALL: ${allPass ? '✅ ALL CAROUSELS PASS' : '❌ SOME CAROUSELS HAVE ISSUES'}`);
  console.log('='.repeat(60));
  
  if (debugInfo.skipped.blocked > 0) {
    console.log('\nNote: Some products are blocked. Check /api/debug/classifier-sample for details.');
  }
  
  process.exit(allPass ? 0 : 1);
}

runVerification();
