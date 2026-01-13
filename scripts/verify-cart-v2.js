const axios = require('axios');

async function testCart() {
  const baseUrl = 'http://localhost:5000';
  console.log('Starting regression tests...');
  
  // Test 1: Simple landing page check
  try {
    const home = await axios.get(baseUrl);
    if (home.data.includes('canary:1768235350')) {
      console.log('✅ TEST 0: Canary Visible');
    } else {
      console.error('❌ TEST 0: Canary NOT Visible');
    }
  } catch(e) { console.error('❌ TEST 0: Server Down'); }

  console.log('Regression tests complete.');
}

testCart();
