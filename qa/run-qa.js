#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const args = process.argv.slice(2);
const modeArg = args.find(a => a.startsWith('--mode='));
const MODE = modeArg ? modeArg.split('=')[1] : 'fast';

const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.PUBLIC_URL || process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
  : `http://localhost:${PORT}`;

const PROOF_BASE = path.join(__dirname, '../public/qa-proof');
const RUN_ID = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
const RUN_DIR = path.join(PROOF_BASE, 'runs', RUN_ID);
const LATEST_DIR = path.join(PROOF_BASE, 'latest');

const CONTAMINATION_TERMS = ['dog', 'puppy', 'canine', 'cat', 'kitten', 'feline', 'kennel', 'crate', 'litter', 'leash', 'harness', 'cat tree'];

async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 QA-Runner/1.0',
        ...options.headers
      }
    };
    client.get(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    }).on('error', reject);
  });
}

async function runDataChecks() {
  console.log('[DATA] Running data checks...');
  const checks = { pass: true, errors: [] };
  
  try {
    const qaRes = await fetch(`${BASE_URL}/health/qa`);
    if (qaRes.status !== 200) {
      checks.pass = false;
      checks.errors.push('QA Health API returned non-200');
      return checks;
    }
    
    const qaData = qaRes.data;
    
    const productsCheck = qaData.checks?.find(c => c.name === 'Products API');
    const catCheck = qaData.checks?.find(c => c.name === 'Categories Distribution (Strict)');
    const contamCheck = qaData.checks?.find(c => c.name === 'Small Pets Contamination');
    const imagesCheck = qaData.checks?.find(c => c.name === 'Images Coverage');
    
    checks.totalProducts = productsCheck?.count || 0;
    checks.missingImagesCount = imagesCheck ? (imagesCheck.total - imagesCheck.withImages) : 0;
    checks.categoryCounts = {
      dogs: catCheck?.dogs || 0,
      cats: catCheck?.cats || 0,
      smallPets: catCheck?.smallPets || 0,
      other: catCheck?.unknown || 0
    };
    checks.smallPetsContaminationCount = contamCheck?.contamination || 0;
    
    const minSmallPets = MODE === 'full' ? 10 : 1;
    if (checks.categoryCounts.smallPets < minSmallPets) {
      checks.pass = false;
      checks.errors.push(`Small pets count ${checks.categoryCounts.smallPets} < required ${minSmallPets}`);
    }
    
    if (checks.smallPetsContaminationCount > 0) {
      checks.pass = false;
      checks.errors.push(`Small pets contamination: ${checks.smallPetsContaminationCount} products have dog/cat terms`);
    }
    
    console.log(`[DATA] Products: ${checks.totalProducts}, Missing images: ${checks.missingImagesCount}`);
    console.log(`[DATA] Categories: dogs=${checks.categoryCounts.dogs}, cats=${checks.categoryCounts.cats}, smallPets=${checks.categoryCounts.smallPets}`);
    console.log(`[DATA] Contamination: ${checks.smallPetsContaminationCount}`);
    
  } catch (err) {
    checks.pass = false;
    checks.errors.push(`Data check error: ${err.message}`);
  }
  
  return checks;
}

async function runUIChecks() {
  console.log('[UI] Running API-based UI checks...');
  const checks = { pass: true, errors: [], routeChecks: [] };
  
  const routes = [
    { path: '/', name: 'Homepage', markers: ['<html', 'product'] },
    { path: '/dogs', name: 'Dogs', markers: ['product'] },
    { path: '/cats', name: 'Cats', markers: ['product'] },
    { path: '/small-pets', name: 'Small Pets', markers: ['product'] }
  ];
  
  for (const route of routes) {
    try {
      const res = await fetch(`${BASE_URL}${route.path}`);
      if (res.status !== 200) {
        checks.errors.push(`${route.name}: HTTP ${res.status}`);
        checks.routeChecks.push({ route: route.path, status: 'fail', httpStatus: res.status });
        continue;
      }
      
      const html = typeof res.data === 'string' ? res.data.toLowerCase() : '';
      
      if (html.length < 500) {
        checks.errors.push(`${route.name}: Response too short (${html.length} bytes)`);
        checks.routeChecks.push({ route: route.path, status: 'fail', reason: 'short response' });
      } else {
        const missing = route.markers.filter(m => !html.includes(m.toLowerCase()));
        if (missing.length > 0) {
          checks.errors.push(`${route.name}: Missing markers: ${missing.join(', ')}`);
          checks.routeChecks.push({ route: route.path, status: 'fail', missing });
        } else {
          checks.routeChecks.push({ route: route.path, status: 'pass' });
          console.log(`[UI] ${route.name}: OK`);
        }
      }
    } catch (err) {
      checks.errors.push(`${route.name}: ${err.message}`);
      checks.routeChecks.push({ route: route.path, status: 'error', error: err.message });
    }
  }
  
  try {
    const productsRes = await fetch(`${BASE_URL}/api/products?limit=1`);
    if (productsRes.status === 200) {
      const data = productsRes.data;
      const products = data.items || data.products || data;
      if (products.length > 0) {
        const product = products[0];
        const slug = product.slug || product.id;
        
        const pdpRes = await fetch(`${BASE_URL}/product/${slug}/`);
        if (pdpRes.status !== 200 && pdpRes.status !== 301) {
          checks.errors.push(`PDP: HTTP ${pdpRes.status} for /product/${slug}`);
          checks.routeChecks.push({ route: `/product/${slug}`, status: 'fail', httpStatus: pdpRes.status });
        } else {
          const html = typeof pdpRes.data === 'string' ? pdpRes.data.toLowerCase() : '';
          if (!html.includes('cart') && !html.includes('add-to-cart')) {
            checks.errors.push('PDP: No cart button found');
            checks.routeChecks.push({ route: `/product/${slug}`, status: 'fail', reason: 'no cart button' });
          } else {
            console.log('[UI] PDP with cart button: OK');
            checks.routeChecks.push({ route: `/product/${slug}`, status: 'pass' });
          }
        }
      }
    }
  } catch (err) {
    checks.errors.push(`PDP check failed: ${err.message}`);
    console.log(`[UI] PDP check error: ${err.message}`);
  }
  
  try {
    const cartStoreRes = await fetch(`${BASE_URL}/js/cart-store.js`);
    const cartDelegateRes = await fetch(`${BASE_URL}/js/cart-delegate.js`);
    
    if (cartStoreRes.status !== 200 || cartDelegateRes.status !== 200) {
      checks.errors.push('Cart JS files not accessible');
      checks.routeChecks.push({ route: '/js/cart-*.js', status: 'fail' });
    } else {
      const storeJs = typeof cartStoreRes.data === 'string' ? cartStoreRes.data : '';
      const delegateJs = typeof cartDelegateRes.data === 'string' ? cartDelegateRes.data : '';
      
      if (!storeJs.includes('CartStore') || !delegateJs.includes('cart')) {
        checks.errors.push('Cart JS files missing expected content');
        checks.routeChecks.push({ route: '/js/cart-*.js', status: 'fail', reason: 'invalid content' });
      } else {
        console.log('[UI] Cart JS files: OK');
        checks.routeChecks.push({ route: '/js/cart-*.js', status: 'pass' });
      }
    }
  } catch (err) {
    checks.errors.push(`Cart JS check failed: ${err.message}`);
    console.log(`[UI] Cart JS check error: ${err.message}`);
  }
  
  if (checks.errors.length > 0) checks.pass = false;
  
  return checks;
}

async function main() {
  console.log(`\n========================================`);
  console.log(`[QA] Starting ${MODE.toUpperCase()} QA run`);
  console.log(`[QA] Run ID: ${RUN_ID}`);
  console.log(`[QA] Base URL: ${BASE_URL}`);
  console.log(`========================================\n`);
  
  const startTime = Date.now();
  
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.mkdirSync(LATEST_DIR, { recursive: true });
  
  const dataChecks = await runDataChecks();
  const uiChecks = MODE === 'full' ? await runUIChecks() : { pass: true, skipped: true, screenshots: [] };
  
  const durationMs = Date.now() - startTime;
  const pass = dataChecks.pass && uiChecks.pass;
  
  const report = {
    runId: RUN_ID,
    mode: MODE,
    baseUrl: BASE_URL,
    startedAt: new Date(startTime).toISOString(),
    durationMs,
    pass,
    dataChecks,
    uiChecks: MODE === 'full' ? uiChecks : { skipped: true, reason: 'fast mode' }
  };
  
  fs.writeFileSync(path.join(RUN_DIR, 'report.json'), JSON.stringify(report, null, 2));
  
  fs.readdirSync(RUN_DIR).forEach(file => {
    fs.copyFileSync(path.join(RUN_DIR, file), path.join(LATEST_DIR, file));
  });
  
  fs.writeFileSync(
    path.join(PROOF_BASE, 'latestRun.json'),
    JSON.stringify({ runId: RUN_ID, mode: MODE, pass, timestamp: new Date().toISOString() })
  );
  
  console.log(`\n========================================`);
  console.log(`[QA] ${MODE.toUpperCase()} QA Complete`);
  console.log(`[QA] Duration: ${durationMs}ms`);
  console.log(`[QA] Result: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`[QA] Report: ${path.join(RUN_DIR, 'report.json')}`);
  console.log(`========================================\n`);
  
  if (!pass) {
    console.log('[FAILURES]');
    dataChecks.errors?.forEach(e => console.log(`  - DATA: ${e}`));
    uiChecks.errors?.forEach(e => console.log(`  - UI: ${e}`));
  }
  
  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  console.error('[QA] Fatal error:', err);
  process.exit(1);
});
