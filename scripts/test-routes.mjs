#!/usr/bin/env node
/**
 * test-routes.mjs
 * Smoke test for all main routes - ensures no 404s from UI flows
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const ROUTES = [
  { path: '/', name: 'Homepage' },
  { path: '/dogs', name: 'Dogs Category' },
  { path: '/cats', name: 'Cats Category' },
  { path: '/toys', name: 'Toys Category' },
  { path: '/feeding', name: 'Feeding Category' },
  { path: '/accessories', name: 'Accessories Category' },
  { path: '/cart', name: 'Cart Page' },
  { path: '/search?q=test', name: 'Search' },
  { path: '/api/version', name: 'API Version' },
  { path: '/health', name: 'Health Check' },
  { path: '/api/debug/home-source', name: 'Debug Home Source' },
];

async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function testRoute(route) {
  const url = `${BASE_URL}${route.path}`;
  try {
    const response = await fetchWithTimeout(url);
    const status = response.status;
    const ok = status >= 200 && status < 400;
    return { 
      ...route, 
      status, 
      ok, 
      error: null 
    };
  } catch (err) {
    return { 
      ...route, 
      status: 0, 
      ok: false, 
      error: err.message 
    };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║              ROUTE SMOKE TEST                          ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');
  
  const results = [];
  
  for (const route of ROUTES) {
    const result = await testRoute(route);
    results.push(result);
    
    const icon = result.ok ? '✅' : '❌';
    const statusStr = result.error ? `ERROR: ${result.error}` : `${result.status}`;
    console.log(`${icon} ${result.name.padEnd(25)} ${result.path.padEnd(30)} ${statusStr}`);
  }
  
  console.log('');
  console.log('─'.repeat(60));
  
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  const allPassed = passed === total;
  
  if (allPassed) {
    console.log(`✅ ROUTE TEST PASSED: ${passed}/${total} routes OK`);
    process.exit(0);
  } else {
    console.log(`❌ ROUTE TEST FAILED: ${passed}/${total} routes OK`);
    const failed = results.filter(r => !r.ok);
    console.log('');
    console.log('Failed routes:');
    failed.forEach(r => {
      console.log(`  - ${r.name}: ${r.path} (${r.error || r.status})`);
    });
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
