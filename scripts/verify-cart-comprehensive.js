#!/usr/bin/env node
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const tests = [];
let passed = 0;
let failed = 0;

function log(icon, msg) {
  console.log(`  ${icon} ${msg}`);
}

async function runTest(name, fn) {
  try {
    await fn();
    tests.push({ name, status: 'PASS' });
    log('✅', name);
    passed++;
  } catch (err) {
    tests.push({ name, status: 'FAIL', error: err.message });
    log('❌', `${name}: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('\n============================================================');
  console.log('CART SYSTEM COMPREHENSIVE VERIFICATION');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('============================================================\n');

  // 1. Health check
  await runTest('Server health check', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.status !== 200) throw new Error(`Health check failed: ${res.status}`);
  });

  // 2. Products API returns items with prices
  let products = [];
  await runTest('Products API returns items with real prices', async () => {
    const res = await fetch(`${BASE_URL}/api/products?limit=20`);
    const data = await res.json();
    products = data.items || data.products || data;
    if (!products || products.length === 0) throw new Error('No products returned');
    
    const fallbackCount = products.filter(p => parseFloat(p.price) === 9.95).length;
    const fallbackPct = (fallbackCount / products.length) * 100;
    
    if (fallbackPct > 10) {
      throw new Error(`Too many $9.95 fallback prices: ${fallbackPct.toFixed(1)}%`);
    }
    
    log('  ', `  ${products.length} products, ${fallbackCount} with $9.95 (${fallbackPct.toFixed(1)}%)`);
  });

  // 3. Product prices are valid (not $0, not undefined)
  await runTest('All products have valid prices > $0', async () => {
    const invalidPrices = products.filter(p => !p.price || parseFloat(p.price) <= 0);
    if (invalidPrices.length > 0) {
      throw new Error(`${invalidPrices.length} products have invalid prices`);
    }
  });

  // 4. Products have images (check thumbImage, resolved_image, or images)
  await runTest('Products have images', async () => {
    const noImages = products.filter(p => 
      !p.image && 
      !p.thumbImage && 
      !p.resolved_image && 
      (!p.images || p.images.length === 0)
    );
    if (noImages.length > 5) {
      throw new Error(`${noImages.length} products missing images`);
    }
    log('  ', `  ${products.length - noImages.length}/${products.length} have images`);
  });

  // 5. Cart add API endpoint works
  let testProduct = products[0];
  await runTest('Cart add API accepts item', async () => {
    const res = await fetch(`${BASE_URL}/api/cart/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: testProduct.id || testProduct.spu,
        qty: 1,
        title: testProduct.title,
        price: testProduct.price
      })
    });
    
    if (res.status !== 200 && res.status !== 201) {
      const text = await res.text();
      throw new Error(`Cart add failed: ${res.status} - ${text.slice(0, 100)}`);
    }
  });

  // 6. PDP pages load and have correct price
  await runTest('PDP page loads with correct price', async () => {
    if (!testProduct.slug && !testProduct.handle) {
      log('  ', '  Skipping - no slug available');
      return;
    }
    const slug = testProduct.slug || testProduct.handle;
    const res = await fetch(`${BASE_URL}/product/${slug}`);
    if (res.status !== 200) throw new Error(`PDP returned ${res.status}`);
    
    const html = await res.text();
    const priceMatch = html.match(/\$[\d,]+\.?\d{0,2}/);
    if (!priceMatch) throw new Error('No price found on PDP');
    
    log('  ', `  Found price: ${priceMatch[0]}`);
  });

  // 7. Homepage loads with cart elements (SPA loads products dynamically)
  await runTest('Homepage loads with cart elements', async () => {
    // Send browser-like headers to get HTML instead of health check response
    const res = await fetch(`${BASE_URL}/`, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Test/1.0'
      }
    });
    if (res.status !== 200) throw new Error(`Homepage returned ${res.status}`);
    
    const html = await res.text();
    
    if (html.length < 1000) {
      throw new Error(`Homepage HTML too short (${html.length} bytes) - might be health check response`);
    }
    
    // Check for cart UI elements (products are loaded dynamically via JS)
    if (!html.includes('cartItems') && !html.includes('cart-items') && !html.includes('id="cart"')) {
      throw new Error('Cart elements missing from homepage');
    }
    
    // Check for app.js which loads products
    if (!html.includes('app.js')) {
      throw new Error('app.js script not found');
    }
  });

  // 8. Cart store script is loaded
  await runTest('Cart store JS is properly loaded', async () => {
    const res = await fetch(`${BASE_URL}/`, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Test/1.0'
      }
    });
    const html = await res.text();
    
    // The script is loaded as /js/cart-store.js with version cache busting
    if (!html.includes('/js/cart-store.js') && !html.includes('cart-store.js')) {
      throw new Error('Cart store script not found in page');
    }
  });

  // 9. Check cart-store.js loads
  await runTest('cart-store.js is accessible', async () => {
    const res = await fetch(`${BASE_URL}/js/cart-store.js`);
    if (res.status !== 200) throw new Error(`cart-store.js returned ${res.status}`);
    
    const js = await res.text();
    if (!js.includes('CartStore') && !js.includes('__GETPAWSY_CART__')) {
      throw new Error('cart-store.js does not define CartStore');
    }
  });

  // 10. Check cart-delegate.js loads
  await runTest('cart-delegate.js is accessible', async () => {
    const res = await fetch(`${BASE_URL}/js/cart-delegate.js`);
    if (res.status !== 200) throw new Error(`cart-delegate.js returned ${res.status}`);
    
    const js = await res.text();
    if (!js.includes('handleAddToCart') && !js.includes('addToCart')) {
      throw new Error('cart-delegate.js does not define handlers');
    }
  });

  // 11. Verify no "Cart not ready" in homepage HTML
  await runTest('No "Cart not ready" hardcoded in page', async () => {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    
    if (html.includes('Cart not ready')) {
      throw new Error('Found "Cart not ready" text in page - possible race condition');
    }
  });

  // 12. Image proxy works
  await runTest('Image proxy endpoint works', async () => {
    const testUrl = encodeURIComponent('https://via.placeholder.com/100');
    const res = await fetch(`${BASE_URL}/api/img?url=${testUrl}&w=50`);
    
    // 200 or 307 redirect is OK
    if (res.status !== 200 && res.status !== 307 && res.status !== 302) {
      throw new Error(`Image proxy returned ${res.status}`);
    }
  });

  // 13. Price validity check (listing prices are valid)
  await runTest('Prices are valid (not $0, not undefined)', async () => {
    const listingPrice = parseFloat(testProduct.price);
    
    if (!listingPrice || listingPrice <= 0) {
      throw new Error(`Invalid listing price: ${testProduct.price}`);
    }
    
    if (listingPrice === 9.95) {
      log('  ', `  Warning: Price is $9.95 (possible fallback)`);
    } else {
      log('  ', `  Listing price: $${listingPrice} - OK`);
    }
  });

  // Summary
  console.log('\n────────────────────────────────────────');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('────────────────────────────────────────');
  
  if (failed === 0) {
    console.log('\n✅ ALL CART VERIFICATION TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED\n');
    console.log('Failed tests:');
    tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
