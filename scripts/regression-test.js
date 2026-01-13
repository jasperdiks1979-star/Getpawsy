const axios = require('axios');

async function runRegressionTests() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const petTypes = ['dog', 'cat', 'small'];
  let failures = 0;

  console.log('--- STARTING REGRESSION TESTS ---');

  for (const type of petTypes) {
    try {
      console.log(`Testing petType=${type}...`);
      const res = await axios.get(`${baseUrl}/api/products?petType=${type}&limit=4`);
      const items = res.data.items || res.data.products || [];
      if (res.status === 200 && items.length > 0) {
        console.log(`✅ ${type}: Found ${items.length} items`);
      } else {
        console.error(`❌ ${type}: Status ${res.status}, Items: ${items.length}`);
        failures++;
      }
    } catch (err) {
      console.error(`❌ ${type}: ${err.message}`);
      failures++;
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
  console.log('--- ALL TESTS PASSED ---');
  process.exit(0);
}

runRegressionTests();
