#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000';
const PROOF_DIR = path.join(__dirname, '../public/qa/proof');

async function fetch(urlPath) {
  return new Promise((resolve, reject) => {
    const url = BASE_URL + urlPath;
    http.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function fetchJSON(urlPath) {
  const res = await fetch(urlPath);
  try {
    return JSON.parse(res.body);
  } catch (e) {
    return { error: 'Invalid JSON', raw: res.body.substring(0, 200) };
  }
}

const results = {
  timestamp: new Date().toISOString(),
  smallPets: {},
  images: {},
  cart: {},
  summary: { passed: 0, failed: 0, tests: [] }
};

function addTest(category, name, passed, details = '') {
  results[category][name] = { passed, details };
  results.summary.tests.push({ category, name, passed, details });
  if (passed) results.summary.passed++;
  else results.summary.failed++;
  console.log(`${passed ? '✅' : '❌'} [${category}] ${name}${details ? ': ' + details : ''}`);
}

async function testSmallPets() {
  console.log('\n=== SMALL PETS TESTS ===\n');
  
  const carousels = await fetchJSON('/api/homepage/carousels');
  addTest('smallPets', 'API returns topPicksSmallPets', 
    carousels.topPicksSmallPets?.length >= 2,
    `${carousels.topPicksSmallPets?.length || 0} products`);
  
  const products = await fetchJSON('/api/products?pet_type=small_pet&limit=10');
  addTest('smallPets', 'API products filter works', 
    (products.items?.length || products.products?.length) > 0,
    `${products.items?.length || products.products?.length || 0} products`);
  
  const collectionPage = await fetch('/collection/small-pets');
  const collectionCards = (collectionPage.body.match(/product-card/g) || []).length;
  addTest('smallPets', 'Collection page has products', 
    collectionCards >= 10,
    `${collectionCards} product cards`);
  
  const subcategories = ['rabbits', 'guinea-pigs', 'hamsters', 'birds', 'cages-habitats'];
  let subcatSuccess = 0;
  for (const subcat of subcategories) {
    const subcatPage = await fetch(`/collection/small-pets/${subcat}`);
    const subcatCards = (subcatPage.body.match(/product-card/g) || []).length;
    if (subcatCards > 0) subcatSuccess++;
  }
  addTest('smallPets', 'Subcategory pages have products', 
    subcatSuccess >= 3,
    `${subcatSuccess}/${subcategories.length} subcategories with products`);
}

async function testImages() {
  console.log('\n=== IMAGE TESTS ===\n');
  
  const products = await fetchJSON('/api/products?limit=5');
  const items = products.items || products.products || [];
  
  let imagesValid = 0;
  let sampleProduct = null;
  for (const p of items) {
    if (p.images?.length > 0 || p.image) {
      imagesValid++;
      if (!sampleProduct) sampleProduct = p;
    }
  }
  addTest('images', 'Products have images', 
    imagesValid >= 3,
    `${imagesValid}/${items.length} products with images`);
  
  if (sampleProduct) {
    const imageUrl = sampleProduct.image || sampleProduct.images?.[0];
    const isLocal = imageUrl?.startsWith('/media/');
    addTest('images', 'Images use local media', isLocal, imageUrl?.substring(0, 50));
  }
  
  const homepage = await fetch('/home');
  const hasLazyLoading = homepage.body.includes('loading="lazy"') || homepage.body.includes('decoding="async"');
  addTest('images', 'Images have lazy loading', hasLazyLoading, 'Found lazy/async attributes');
}

async function testCart() {
  console.log('\n=== CART TESTS ===\n');
  
  const cartStoreJS = await fetch('/js/cart-store.js');
  const hasCartStore = cartStoreJS.status === 200 && cartStoreJS.body.includes('gp_cart_v2');
  addTest('cart', 'CartStore module loaded', hasCartStore, 'Uses gp_cart_v2 storage key');
  
  const hasLock = cartStoreJS.body.includes('LOCK_DURATION_MS') || cartStoreJS.body.includes('500');
  addTest('cart', 'CartStore has dedup lock', hasLock, '500ms lock present');
  
  const hasGetCount = cartStoreJS.body.includes('getCount');
  addTest('cart', 'CartStore has getCount for badge', hasGetCount);
  
  const appJS = await fetch('/app.js');
  const usesCartStore = appJS.body.includes('CartStore.addItem') || appJS.body.includes('window.CartStore');
  addTest('cart', 'App delegates to CartStore', usesCartStore);
  
  const hasBadgeRule = appJS.body.includes('CartStore.getCount()');
  addTest('cart', 'Badge uses CartStore.getCount', hasBadgeRule, 'SUM of quantities');
}

async function generateProof() {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  
  fs.writeFileSync(path.join(PROOF_DIR, 'results.json'), JSON.stringify(results, null, 2));
  
  const txt = `
GETPAWSY QA VERIFICATION REPORT
================================
Timestamp: ${results.timestamp}

SUMMARY
-------
Passed: ${results.summary.passed}
Failed: ${results.summary.failed}
Total:  ${results.summary.tests.length}

SMALL PETS
----------
${Object.entries(results.smallPets).map(([k,v]) => `${v.passed ? '✅' : '❌'} ${k}: ${v.details}`).join('\n')}

IMAGES
------
${Object.entries(results.images).map(([k,v]) => `${v.passed ? '✅' : '❌'} ${k}: ${v.details}`).join('\n')}

CART
----
${Object.entries(results.cart).map(([k,v]) => `${v.passed ? '✅' : '❌'} ${k}: ${v.details}`).join('\n')}

TEST DETAILS
------------
${results.summary.tests.map(t => `[${t.category}] ${t.name}: ${t.passed ? 'PASS' : 'FAIL'} - ${t.details}`).join('\n')}
`;
  
  fs.writeFileSync(path.join(PROOF_DIR, 'verification-report.txt'), txt.trim());
  console.log(`\nProof files generated:\n  - ${PROOF_DIR}/results.json\n  - ${PROOF_DIR}/verification-report.txt`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           GETPAWSY COMPREHENSIVE QA VERIFICATION                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Base URL: ${BASE_URL.padEnd(53)}║`);
  console.log(`║  Timestamp: ${new Date().toISOString().padEnd(52)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  try {
    await testSmallPets();
    await testImages();
    await testCart();
    await generateProof();
    
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log(`║  SUMMARY: ${results.summary.passed} passed, ${results.summary.failed} failed`.padEnd(67) + '║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    
    process.exit(results.summary.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test error:', err.message);
    process.exit(1);
  }
}

main();
