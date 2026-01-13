const axios = require('axios');

async function runSmokeTests() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const endpoints = [
    '/api/products?petType=dog&limit=4',
    '/api/products?petType=cat&limit=4',
    '/api/products?petType=small&limit=4'
  ];

  console.log('--- STARTING SMOKE TESTS ---');
  let failures = 0;

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint}...`);
      const res = await axios.get(`${baseUrl}${endpoint}`);
      const items = res.data.items || res.data.products || [];
      if (items.length > 0) {
        console.log(`✅ Success: ${items.length} items found`);
      } else {
        console.error(`❌ Failure: No items found for ${endpoint}`);
        failures++;
      }
    } catch (err) {
      console.error(`❌ Error testing ${endpoint}: ${err.message}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`--- SMOKE TESTS FAILED: ${failures} errors ---`);
    process.exit(1);
  } else {
    console.log('--- ALL SMOKE TESTS PASSED ---');
    process.exit(0);
  }
}

runSmokeTests();
