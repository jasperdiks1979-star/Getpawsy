const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const OUTPUT_DIR = path.join(process.cwd(), 'test-results');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    http.get(fullUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, error: e.message, raw: data.slice(0, 200) });
        }
      });
    }).on('error', reject);
  });
}

async function runAPIChecks() {
  const results = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    checks: []
  };

  console.log('='.repeat(60));
  console.log('GETPAWSY API VERIFICATION');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${results.timestamp}`);
  console.log('');

  // Check 1: Health endpoint
  try {
    const health = await fetchJSON('/health');
    results.checks.push({
      name: 'Health Check',
      endpoint: '/health',
      status: health.status === 200 ? 'PASS' : 'FAIL',
      statusCode: health.status
    });
    console.log(`[${health.status === 200 ? '✓' : '✗'}] Health Check: ${health.status}`);
  } catch (e) {
    results.checks.push({ name: 'Health Check', status: 'FAIL', error: e.message });
    console.log(`[✗] Health Check: ${e.message}`);
  }

  // Check 2: Small Pets API - category filter
  try {
    const smallPets = await fetchJSON('/api/products?category=small_pets&limit=20');
    const count = smallPets.data?.items?.length || 0;
    const total = smallPets.data?.total || 0;
    results.checks.push({
      name: 'Small Pets Category API',
      endpoint: '/api/products?category=small_pets',
      status: total > 0 ? 'PASS' : 'FAIL',
      itemsReturned: count,
      totalAvailable: total
    });
    console.log(`[${total > 0 ? '✓' : '✗'}] Small Pets Category: ${count} items returned, ${total} total`);
  } catch (e) {
    results.checks.push({ name: 'Small Pets Category API', status: 'FAIL', error: e.message });
    console.log(`[✗] Small Pets Category: ${e.message}`);
  }

  // Check 3: Small Pets API - petType filter
  try {
    const smallPetType = await fetchJSON('/api/products?petType=small_pet&limit=20');
    const count = smallPetType.data?.items?.length || 0;
    const total = smallPetType.data?.total || 0;
    results.checks.push({
      name: 'Small Pets PetType API',
      endpoint: '/api/products?petType=small_pet',
      status: total > 0 ? 'PASS' : 'FAIL',
      itemsReturned: count,
      totalAvailable: total
    });
    console.log(`[${total > 0 ? '✓' : '✗'}] Small Pets PetType: ${count} items returned, ${total} total`);
  } catch (e) {
    results.checks.push({ name: 'Small Pets PetType API', status: 'FAIL', error: e.message });
    console.log(`[✗] Small Pets PetType: ${e.message}`);
  }

  // Check 4: Homepage sections
  try {
    const homepage = await fetchJSON('/api/homepage');
    const hasSmallPets = homepage.data?.topPicksSmallPets?.length > 0;
    results.checks.push({
      name: 'Homepage Small Pets Section',
      endpoint: '/api/homepage',
      status: hasSmallPets ? 'PASS' : 'WARN',
      topPicksSmallPets: homepage.data?.topPicksSmallPets?.length || 0
    });
    console.log(`[${hasSmallPets ? '✓' : '!'}] Homepage Small Pets: ${homepage.data?.topPicksSmallPets?.length || 0} products`);
  } catch (e) {
    results.checks.push({ name: 'Homepage Small Pets Section', status: 'FAIL', error: e.message });
    console.log(`[✗] Homepage Small Pets: ${e.message}`);
  }

  // Check 5: Product detail (first small pet product)
  try {
    const smallPets = await fetchJSON('/api/products?category=small_pets&limit=1');
    const firstProduct = smallPets.data?.items?.[0];
    if (firstProduct) {
      const productId = firstProduct.id;
      const detail = await fetchJSON(`/api/products/${productId}`);
      const hasImages = detail.data?.images?.length > 0 || detail.data?.image;
      results.checks.push({
        name: 'Product Detail API',
        endpoint: `/api/products/${productId}`,
        status: detail.status === 200 && hasImages ? 'PASS' : 'FAIL',
        productId,
        hasImages,
        imageCount: detail.data?.images?.length || 0
      });
      console.log(`[${detail.status === 200 && hasImages ? '✓' : '✗'}] Product Detail: ${productId} (${detail.data?.images?.length || 0} images)`);
    } else {
      results.checks.push({ name: 'Product Detail API', status: 'SKIP', reason: 'No small pet products found' });
      console.log(`[!] Product Detail: Skipped - no small pet products`);
    }
  } catch (e) {
    results.checks.push({ name: 'Product Detail API', status: 'FAIL', error: e.message });
    console.log(`[✗] Product Detail: ${e.message}`);
  }

  // Summary
  const passed = results.checks.filter(c => c.status === 'PASS').length;
  const failed = results.checks.filter(c => c.status === 'FAIL').length;
  const warned = results.checks.filter(c => c.status === 'WARN').length;

  results.summary = { passed, failed, warned, total: results.checks.length };

  console.log('');
  console.log('='.repeat(60));
  console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${warned} warnings`);
  console.log('='.repeat(60));

  // Write results
  const outputPath = path.join(OUTPUT_DIR, 'api-check.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to: ${outputPath}`);

  return results;
}

runAPIChecks().catch(err => {
  console.error('API verification failed:', err);
  process.exit(1);
});
