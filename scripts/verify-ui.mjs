#!/usr/bin/env node
/**
 * GetPawsy UI Verification Script
 * Verifies that the correct build is running and pet-only filtering works
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function runTests() {
  console.log('\n🔍 GetPawsy UI Verification Script');
  console.log('================================\n');
  
  const results = [];
  
  // Test 1: /api/version
  try {
    const res = await fetch(`${BASE_URL}/api/version`);
    const data = await res.json();
    const pass = data.build_id && data.commit && data.commit !== 'unknown';
    results.push({
      test: '/api/version',
      pass,
      details: `build_id: ${data.build_id}, commit: ${data.commit}`
    });
  } catch (e) {
    results.push({ test: '/api/version', pass: false, details: e.message });
  }
  
  // Test 2: /api/health
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    results.push({
      test: '/api/health',
      pass: data.ok === true,
      details: `ok: ${data.ok}, build_id: ${data.build_id || 'N/A'}`
    });
  } catch (e) {
    results.push({ test: '/api/health', pass: false, details: e.message });
  }
  
  // Test 3: Homepage contains build info
  try {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    const hasBuildIndicator = html.includes('buildIndicator') || html.includes('footer-build');
    const hasAppShell = html.includes('app.js') && html.includes('styles.css');
    results.push({
      test: 'Homepage app shell',
      pass: hasBuildIndicator && hasAppShell,
      details: `buildIndicator: ${hasBuildIndicator}, appShell: ${hasAppShell}`
    });
  } catch (e) {
    results.push({ test: 'Homepage app shell', pass: false, details: e.message });
  }
  
  // Test 4: /dogs page has proper styling
  try {
    const res = await fetch(`${BASE_URL}/dogs`);
    const html = await res.text();
    const hasStyles = html.includes('styles.css') || html.includes('premium') || html.includes('landing');
    const notBasicLinks = !html.includes('<a href') || html.includes('class=');
    results.push({
      test: '/dogs page styled',
      pass: hasStyles,
      details: `hasStyles: ${hasStyles}`
    });
  } catch (e) {
    results.push({ test: '/dogs page styled', pass: false, details: e.message });
  }
  
  // Test 5: /cats page has proper styling
  try {
    const res = await fetch(`${BASE_URL}/cats`);
    const html = await res.text();
    const hasStyles = html.includes('styles.css') || html.includes('premium') || html.includes('landing');
    results.push({
      test: '/cats page styled',
      pass: hasStyles,
      details: `hasStyles: ${hasStyles}`
    });
  } catch (e) {
    results.push({ test: '/cats page styled', pass: false, details: e.message });
  }
  
  // Test 6: /api/products returns pet-only products
  try {
    const res = await fetch(`${BASE_URL}/api/products?limit=50`);
    const data = await res.json();
    const nonPetKeywords = ['rug', 'carpet', 'pneumatic', 'strapping', 'nail', 'beauty', 'furniture'];
    let nonPetFound = 0;
    for (const item of (data.items || [])) {
      const title = (item.title || '').toLowerCase();
      if (nonPetKeywords.some(kw => title.includes(kw))) {
        nonPetFound++;
        console.log(`   ⚠️ Non-pet item found: ${item.title}`);
      }
    }
    results.push({
      test: '/api/products pet-only',
      pass: nonPetFound === 0,
      details: `total: ${data.items?.length || 0}, non-pet: ${nonPetFound}`
    });
  } catch (e) {
    results.push({ test: '/api/products pet-only', pass: false, details: e.message });
  }
  
  // Test 7: /api/products/top-picks returns pet-only products
  try {
    const res = await fetch(`${BASE_URL}/api/products/top-picks?limit=20`);
    const data = await res.json();
    const nonPetKeywords = ['rug', 'carpet', 'pneumatic', 'strapping', 'nail', 'beauty', 'furniture'];
    let nonPetFound = 0;
    for (const item of (data.products || [])) {
      const title = (item.title || '').toLowerCase();
      if (nonPetKeywords.some(kw => title.includes(kw))) {
        nonPetFound++;
        console.log(`   ⚠️ Non-pet item in top-picks: ${item.title}`);
      }
    }
    results.push({
      test: '/api/products/top-picks pet-only',
      pass: nonPetFound === 0,
      details: `total: ${data.products?.length || 0}, non-pet: ${nonPetFound}`
    });
  } catch (e) {
    results.push({ test: '/api/products/top-picks pet-only', pass: false, details: e.message });
  }
  
  // Test 8: CSS/JS assets load
  try {
    const cssRes = await fetch(`${BASE_URL}/styles.css`);
    const jsRes = await fetch(`${BASE_URL}/app.js`);
    results.push({
      test: 'CSS/JS assets load',
      pass: cssRes.status === 200 && jsRes.status === 200,
      details: `CSS: ${cssRes.status}, JS: ${jsRes.status}`
    });
  } catch (e) {
    results.push({ test: 'CSS/JS assets load', pass: false, details: e.message });
  }
  
  // Print results
  console.log('Test Results:');
  console.log('-------------');
  let passed = 0, failed = 0;
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.test}: ${r.details}`);
    if (r.pass) passed++; else failed++;
  }
  
  console.log('\n================================');
  console.log(`Total: ${passed} passed, ${failed} failed`);
  
  return failed === 0;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
