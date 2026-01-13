# GetPawsy V2.2 QA Report

**Generated:** 2025-12-21T01:06:22.084Z
**Base URL:** http://localhost:5000
**Duration:** 6.52s

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 15 |
| Passed | 13 |
| Failed | 2 |
| Pass Rate | 86.7% |

## Health Check

| Field | Value |
|-------|-------|
| App | GetPawsy V2.2 |
| Version | 2.2.0 |
| Build ID | f0zttq |
| Products | 429 |
| Mail Configured | ✓ |
| Stripe Configured | ✓ |
| Stripe Test Mode | ✓ |
| Webhook Configured | ✓ |

## Vitest Results

- Passed: 0
- Failed: 0
- Success: ✗

## Route Crawler Results

| Route | Status | OK |
|-------|--------|-----|
| / | 200 | ✓ |
| /dogs | 200 | ✓ |
| /cats | 200 | ✓ |
| /collections | 200 | ✓ |
| /categories | 200 | ✓ |
| /cart | 404 | ✗ |
| /checkout | 404 | ✗ |
| /admin | 200 | ✓ |
| /health | 200 | ✓ |
| /healthz | 200 | ✓ |
| /api/health | 200 | ✓ |
| /api/version | 200 | ✓ |
| /api/products | 200 | ✓ |
| /sitemap.xml | 200 | ✓ |
| /robots.txt | 200 | ✓ |

## How to Repeat

```bash
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
```

## cURL Commands

```bash
# Health check
curl -s http://localhost:5000/api/health | jq

# Test email (with admin auth)
curl -X POST http://localhost:5000/api/admin/test-email \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_PASSWORD" \
  -d '{"to": "your@email.com"}'

# Version info
curl -s http://localhost:5000/api/version | jq
```
