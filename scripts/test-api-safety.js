const http = require('http');

async function testPetTypeFilter() {
  const tests = [
    { pet_type: 'dog', subcategory: 'toys', expectedPetType: 'dog' },
    { pet_type: 'cat', subcategory: 'toys', expectedPetType: 'cat' },
    { pet_type: 'dog', subcategory: 'beds', expectedPetType: 'dog' },
  ];
  
  let passed = 0, failed = 0;
  
  for (const test of tests) {
    const url = `http://localhost:5000/api/products?pet_type=${test.pet_type}&subcategory=${test.subcategory}&limit=20`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      const items = data.items || data.products || [];
      
      const wrongItems = items.filter(p => p.pet_type && p.pet_type !== test.expectedPetType);
      
      if (wrongItems.length === 0) {
        console.log(`✓ PASS: pet_type=${test.pet_type}, subcategory=${test.subcategory} - ${items.length} products, all correct`);
        passed++;
      } else {
        console.log(`✗ FAIL: pet_type=${test.pet_type} - found ${wrongItems.length} wrong items: ${wrongItems.map(p => p.pet_type).join(', ')}`);
        failed++;
      }
    } catch (e) {
      console.log(`✗ ERROR: ${test.pet_type}/${test.subcategory} - ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\n=== Results: ${passed}/${passed+failed} passed ===`);
  return failed === 0;
}

testPetTypeFilter().then(ok => process.exit(ok ? 0 : 1));
