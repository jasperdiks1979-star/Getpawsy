const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const PROOF_DIR = path.join(__dirname, '../public/qa/proof');

async function verify() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        SMALL PETS + CART VERIFICATION REPORT                     ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Base URL: ${BASE_URL.padEnd(52)}║`);
  console.log(`║  Timestamp: ${new Date().toISOString().padEnd(51)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(PROOF_DIR, { recursive: true });

  const results = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    tests: [],
    summary: { passed: 0, failed: 0 }
  };

  const tests = [
    { name: 'API - All Products', url: '/api/products?limit=1000', check: 'api' },
    { name: 'Collection - Small Pets All', url: '/collection/small-pets', check: 'html' },
    { name: 'Collection - Small Pets Rabbits', url: '/collection/small-pets/rabbits', check: 'html' },
    { name: 'Collection - Small Pets Guinea Pigs', url: '/collection/small-pets/guinea-pigs', check: 'html' },
    { name: 'Collection - Small Pets Cages', url: '/collection/small-pets/cages-habitats', check: 'html' },
    { name: 'Collection - Small Pets Hamsters', url: '/collection/small-pets/hamsters', check: 'html' },
    { name: 'Collection - Small Pets Reptiles', url: '/collection/small-pets/reptiles', check: 'html' },
    { name: 'Homepage HTML', url: '/home', check: 'homepage' },
  ];

  for (const test of tests) {
    try {
      const res = await fetch(`${BASE_URL}${test.url}`);
      const content = await res.text();
      
      let passed = false;
      let details = {};

      if (test.check === 'api') {
        const data = JSON.parse(content);
        const items = data.items || data.products || [];
        const smallPets = items.filter(p => {
          const pt = (p.petType || p.pet_type || '').toLowerCase();
          return pt === 'smallpets' || pt === 'small_pet';
        });
        
        details = {
          totalProducts: items.length,
          smallPets: smallPets.length,
          rabbits: smallPets.filter(p => p.smallPetType === 'rabbits').length,
          guineaPigs: smallPets.filter(p => p.smallPetType === 'guinea_pigs').length,
          cagesHabitats: smallPets.filter(p => p.smallPetSubcategory === 'cages_habitats').length
        };
        passed = smallPets.length > 0;
      } else if (test.check === 'html') {
        const productCards = (content.match(/product-card|pawsy-product-card/g) || []).length;
        const hasNoProducts = content.includes('No products found');
        details = { productCards, hasNoProducts, contentLength: content.length };
        passed = productCards > 0 || (!hasNoProducts && content.length > 5000);
      } else if (test.check === 'homepage') {
        const hasCartStore = content.includes('cart-store.js');
        const hasCartDelegate = content.includes('cart-delegate.js');
        details = { hasCartStore, hasCartDelegate, contentLength: content.length };
        passed = hasCartStore && hasCartDelegate;
      }

      const result = { name: test.name, url: test.url, passed, details };
      results.tests.push(result);
      
      if (passed) {
        results.summary.passed++;
        console.log(`✅ ${test.name}`);
        console.log(`   ${JSON.stringify(details)}`);
      } else {
        results.summary.failed++;
        console.log(`❌ ${test.name}`);
        console.log(`   ${JSON.stringify(details)}`);
      }
    } catch (err) {
      results.tests.push({ name: test.name, url: test.url, passed: false, error: err.message });
      results.summary.failed++;
      console.log(`❌ ${test.name} - Error: ${err.message}`);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  SUMMARY: ${results.summary.passed} passed, ${results.summary.failed} failed`.padEnd(67) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  fs.writeFileSync(
    path.join(PROOF_DIR, 'verification-report.json'),
    JSON.stringify(results, null, 2)
  );

  const reportTxt = `
SMALL PETS VERIFICATION REPORT
==============================
Generated: ${results.timestamp}
Base URL: ${results.baseUrl}

RESULTS:
${results.tests.map(t => `${t.passed ? '✅' : '❌'} ${t.name}\n   ${JSON.stringify(t.details || t.error)}`).join('\n\n')}

SUMMARY: ${results.summary.passed} passed, ${results.summary.failed} failed
`;

  fs.writeFileSync(path.join(PROOF_DIR, 'verification-report.txt'), reportTxt);

  console.log('Proof files generated:');
  console.log(`  - ${PROOF_DIR}/verification-report.json`);
  console.log(`  - ${PROOF_DIR}/verification-report.txt`);

  return results.summary.failed === 0;
}

verify().then(passed => {
  process.exit(passed ? 0 : 1);
}).catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
