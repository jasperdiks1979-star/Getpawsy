#!/usr/bin/env node
const http = require('http');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

let passed = 0;
let failed = 0;

async function req(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: opts.method || 'GET',
      headers: opts.headers || {}
    };
    
    const r = http.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    r.on('error', reject);
    if (opts.body) r.write(JSON.stringify(opts.body));
    r.end();
  });
}

function test(name, condition) {
  if (condition) {
    console.log(`[PASS] ${name}`);
    passed++;
  } else {
    console.log(`[FAIL] ${name}`);
    failed++;
  }
}

async function run() {
  console.log('\n=== Auto-Healer Smoke Tests ===\n');
  
  const pageRes = await req('/admin/auto-healer');
  test('/admin/auto-healer returns 200', pageRes.status === 200);
  
  const stateNoAuth = await req('/api/admin/autoheal/state');
  test('/api/admin/autoheal/state returns 401 without auth', stateNoAuth.status === 401);
  
  if (ADMIN_TOKEN) {
    const stateAuth = await req('/api/admin/autoheal/state', {
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });
    test('/api/admin/autoheal/state returns 200 with auth', stateAuth.status === 200);
    test('State contains settings', !!stateAuth.data?.settings);
    test('State contains derived flags', !!stateAuth.data?.derived);
    test('State contains metrics', !!stateAuth.data?.metrics);
    
    const killOn = await req('/api/admin/autoheal/kill', {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
      body: { killSwitch: true }
    });
    test('Kill switch ON returns ok', killOn.data?.ok === true);
    
    const fixBlocked = await req('/api/admin/autoheal/fix', {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
      body: { action: 'PRODUCT_DEACTIVATE', productId: 'test' }
    });
    test('Fix action blocked when kill switch ON', fixBlocked.status === 409);
    
    const killOff = await req('/api/admin/autoheal/kill', {
      method: 'POST',
      headers: { 'x-admin-token': ADMIN_TOKEN, 'Content-Type': 'application/json' },
      body: { killSwitch: false }
    });
    test('Kill switch OFF returns ok', killOff.data?.ok === true);
  } else {
    console.log('\n[SKIP] Auth tests (ADMIN_API_TOKEN not set)\n');
  }
  
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
