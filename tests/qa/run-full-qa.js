#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const REPORT_DIR = path.join(__dirname, '../../qa-reports');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║           GetPawsy V2.2 Full QA Suite                  ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const results = {
  timestamp,
  baseUrl: BASE_URL,
  tests: {},
  summary: { passed: 0, failed: 0, total: 0 },
  duration: 0
};

const startTime = Date.now();

async function checkHealth() {
  console.log('1. Checking server health...');
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    results.health = data;
    console.log(`   ✓ Server healthy: ${data.productCount} products, mail=${data.mailConfigured}, stripe=${data.stripeConfigured}`);
    return true;
  } catch (err) {
    console.log(`   ✗ Server health check failed: ${err.message}`);
    results.health = { error: err.message };
    return false;
  }
}

function runVitestTests() {
  console.log('');
  console.log('2. Running Vitest unit/API tests...');
  try {
    const output = execSync('npx vitest run --reporter=json 2>&1', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      cwd: path.join(__dirname, '../..')
    });
    
    try {
      const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        results.tests.vitest = {
          numPassedTests: json.numPassedTests || 0,
          numFailedTests: json.numFailedTests || 0,
          numTotalTests: json.numTotalTests || 0,
          success: (json.numFailedTests || 0) === 0
        };
        results.summary.passed += results.tests.vitest.numPassedTests;
        results.summary.failed += results.tests.vitest.numFailedTests;
        results.summary.total += results.tests.vitest.numTotalTests;
      }
    } catch (parseErr) {
      const passMatch = output.match(/(\d+)\s+passed/);
      const failMatch = output.match(/(\d+)\s+failed/);
      results.tests.vitest = {
        numPassedTests: passMatch ? parseInt(passMatch[1]) : 0,
        numFailedTests: failMatch ? parseInt(failMatch[1]) : 0,
        success: !failMatch || parseInt(failMatch[1]) === 0,
        raw: output.slice(-500)
      };
      results.summary.passed += results.tests.vitest.numPassedTests;
      results.summary.failed += results.tests.vitest.numFailedTests;
      results.summary.total += results.tests.vitest.numPassedTests + results.tests.vitest.numFailedTests;
    }
    
    console.log(`   ✓ Vitest: ${results.tests.vitest.numPassedTests} passed, ${results.tests.vitest.numFailedTests} failed`);
  } catch (err) {
    const output = err.stdout || err.message;
    const passMatch = output.match(/(\d+)\s+passed/);
    const failMatch = output.match(/(\d+)\s+failed/);
    results.tests.vitest = {
      numPassedTests: passMatch ? parseInt(passMatch[1]) : 0,
      numFailedTests: failMatch ? parseInt(failMatch[1]) : 0,
      success: false,
      error: 'Some tests failed'
    };
    results.summary.passed += results.tests.vitest.numPassedTests;
    results.summary.failed += results.tests.vitest.numFailedTests;
    results.summary.total += results.tests.vitest.numPassedTests + results.tests.vitest.numFailedTests;
    console.log(`   ⚠ Vitest: ${results.tests.vitest.numPassedTests} passed, ${results.tests.vitest.numFailedTests} failed`);
  }
}

async function runRouteCrawler() {
  console.log('');
  console.log('3. Running route crawler...');
  
  const routes = [
    '/', '/dogs', '/cats', '/collections', '/categories',
    '/cart', '/checkout', '/admin',
    '/health', '/healthz', '/api/health', '/api/version',
    '/api/products', '/sitemap.xml', '/robots.txt'
  ];
  
  const crawlResults = { passed: 0, failed: 0, routes: [] };
  
  for (const route of routes) {
    try {
      const res = await fetch(`${BASE_URL}${route}`);
      const ok = res.status < 400 || res.status === 401;
      crawlResults.routes.push({ path: route, status: res.status, ok });
      if (ok) crawlResults.passed++;
      else crawlResults.failed++;
    } catch (err) {
      crawlResults.routes.push({ path: route, status: 0, ok: false, error: err.message });
      crawlResults.failed++;
    }
  }
  
  results.tests.routeCrawler = crawlResults;
  results.summary.passed += crawlResults.passed;
  results.summary.failed += crawlResults.failed;
  results.summary.total += routes.length;
  
  console.log(`   ✓ Routes: ${crawlResults.passed}/${routes.length} accessible`);
}

async function checkIntegrations() {
  console.log('');
  console.log('4. Checking integrations...');
  
  const integrations = {
    mail: false,
    stripe: false,
    webhook: false,
    products: 0
  };
  
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    integrations.mail = data.mailConfigured;
    integrations.stripe = data.stripeConfigured;
    integrations.webhook = data.webhookConfigured;
    integrations.products = data.productCount;
    integrations.stripeTestMode = data.stripeTestMode;
  } catch (err) {
    integrations.error = err.message;
  }
  
  results.integrations = integrations;
  
  console.log(`   Mail: ${integrations.mail ? '✓ Configured' : '✗ Not configured'}`);
  console.log(`   Stripe: ${integrations.stripe ? '✓ Configured' : '✗ Not configured'} ${integrations.stripeTestMode ? '(TEST mode)' : ''}`);
  console.log(`   Webhook: ${integrations.webhook ? '✓ Configured' : '✗ Not configured'}`);
  console.log(`   Products: ${integrations.products}`);
}

function generateReport() {
  results.duration = Date.now() - startTime;
  
  const mdReport = `# GetPawsy V2.2 QA Report

**Generated:** ${new Date().toISOString()}
**Base URL:** ${BASE_URL}
**Duration:** ${(results.duration / 1000).toFixed(2)}s

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${results.summary.total} |
| Passed | ${results.summary.passed} |
| Failed | ${results.summary.failed} |
| Pass Rate | ${results.summary.total > 0 ? ((results.summary.passed / results.summary.total) * 100).toFixed(1) : 0}% |

## Health Check

| Field | Value |
|-------|-------|
| App | ${results.health?.app || 'N/A'} |
| Version | ${results.health?.version || 'N/A'} |
| Build ID | ${results.health?.buildId || 'N/A'} |
| Products | ${results.health?.productCount || 0} |
| Mail Configured | ${results.health?.mailConfigured ? '✓' : '✗'} |
| Stripe Configured | ${results.health?.stripeConfigured ? '✓' : '✗'} |
| Stripe Test Mode | ${results.health?.stripeTestMode ? '✓' : '✗'} |
| Webhook Configured | ${results.health?.webhookConfigured ? '✓' : '✗'} |

## Vitest Results

- Passed: ${results.tests.vitest?.numPassedTests || 0}
- Failed: ${results.tests.vitest?.numFailedTests || 0}
- Success: ${results.tests.vitest?.success ? '✓' : '✗'}

## Route Crawler Results

| Route | Status | OK |
|-------|--------|-----|
${(results.tests.routeCrawler?.routes || []).map(r => `| ${r.path} | ${r.status} | ${r.ok ? '✓' : '✗'} |`).join('\n')}

## How to Repeat

\`\`\`bash
# Run all vitest tests
npm test

# Run specific test suites
npm run test:api      # API health/version tests
npm run test:shop     # Shop functionality tests
npm run test:admin    # Admin panel tests

# Run E2E browser tests
npm run test:e2e

# Run full QA suite
npm run qa:full

# Test email system
npm run mail:test

# Test purchase flow
npm run test:purchase

# Generate QA report
npm run qa:report
\`\`\`

## cURL Commands

\`\`\`bash
# Health check
curl -s ${BASE_URL}/api/health | jq

# Test email (with admin auth)
curl -X POST ${BASE_URL}/api/admin/test-email \\
  -H "Content-Type: application/json" \\
  -H "x-admin-key: YOUR_ADMIN_PASSWORD" \\
  -d '{"to": "your@email.com"}'

# Version info
curl -s ${BASE_URL}/api/version | jq
\`\`\`
`;

  const mdPath = path.join(REPORT_DIR, `qa-report-${timestamp}.md`);
  const jsonPath = path.join(REPORT_DIR, `qa-report-${timestamp}.json`);
  const latestMdPath = path.join(REPORT_DIR, 'qa-report.md');
  const latestJsonPath = path.join(REPORT_DIR, 'qa-report.json');
  
  fs.writeFileSync(mdPath, mdReport);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(latestMdPath, mdReport);
  fs.writeFileSync(latestJsonPath, JSON.stringify(results, null, 2));
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('QA SUMMARY:');
  console.log(`  Total: ${results.summary.total} tests`);
  console.log(`  Passed: ${results.summary.passed}`);
  console.log(`  Failed: ${results.summary.failed}`);
  console.log(`  Pass Rate: ${results.summary.total > 0 ? ((results.summary.passed / results.summary.total) * 100).toFixed(1) : 0}%`);
  console.log('');
  console.log('Reports generated:');
  console.log(`  ${mdPath}`);
  console.log(`  ${jsonPath}`);
  console.log('');
}

async function main() {
  const healthy = await checkHealth();
  if (!healthy) {
    console.log('');
    console.log('WARNING: Server not responding. Make sure it is running.');
    console.log(`Expected at: ${BASE_URL}`);
  }
  
  runVitestTests();
  await runRouteCrawler();
  await checkIntegrations();
  generateReport();
}

main().catch(err => {
  console.error('QA Error:', err.message);
  process.exit(1);
});
