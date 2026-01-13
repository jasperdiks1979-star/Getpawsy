# GetPawsy QA Report

## Summary
- **Generated:** 2025-12-20T22:05:29.420Z
- **Base URL:** http://localhost:5000
- **Status:** FAIL

## Test Results
| Metric | Count |
|--------|-------|
| Total Tests | 34 |
| Passed | 32 |
| Failed | 2 |
| Skipped | 0 |
| Pass Rate | 94.1% |

## Failures


### 1. Header navigation links work
- **Suite:** shop.spec.js > Shop - Navigation
- **Error:** TimeoutError: locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('a[href="/dogs"]').first()[22m
[2m    - locator resolved to <a href="/dogs" class="nav-link" data-i18n="navDogs">Dogs</a>[22m
[2m  - attempting click action[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="pet-profile-overlay" onclick="closePetProfileModal()"></div> from <div id="petProfileModal" class="pet-profile-modal active">…</div> subtree intercepts pointer events[22m
[2m    - retrying click action[22m
[2m    - waiting 20ms[22m
[2m    2 × waiting for element to be visible, enabled and stable[22m
[2m      - element is visible, enabled and stable[22m
[2m      - scrolling into view if needed[22m
[2m      - done scrolling[22m
[2m      - <div class="pet-profile-overlay" onclick="closePetProfileModal()"></div> from <div id="petProfileModal" class="pet-profile-modal active">…</div> subtree intercepts pointer events[22m
[2m    - retrying click action[22m
[2m      - waiting 100ms[22m
[2m    - waiting for element to be visible, enabled and stable[22m
[2m    - element is visible, enabled and stable[22m
[2m    - scrolling into view if needed[22m
[2m    - done scrolling[22m
[2m    - <div class="pet-profile-overlay" onclick="closePetProfileModal()"></div> from <div id="petProfileModal" class="pet-profile-modal active">…</div> subtree intercepts pointer events[22m
[2m  - retrying click action[22m
[2m    - waiting 500ms[22m

- **Location:** shop.spec.js


### 2. Product page loads with valid content
- **Suite:** shop.spec.js > Shop - Product Detail Page
- **Error:** [31mTest timeout of 30000ms exceeded.[39m
- **Location:** shop.spec.js


## Test Details
| Suite | Test | Status | Duration |
|-------|------|--------|----------|
| admin.spec.js > Admin - Authentication | Admin login page loads | passed | 4423ms |
| admin.spec.js > Admin - Authentication | Admin login with valid credentials | passed | 7607ms |
| admin.spec.js > Admin - Authentication | Admin routes require authentication | passed | 4079ms |
| admin.spec.js > Admin - API Endpoints (U | Admin API returns 401 without auth | passed | 480ms |
| admin.spec.js > Admin - API Endpoints (U | Admin QA dashboard requires auth | passed | 21ms |
| admin.spec.js > Admin - Authenticated Se | Admin dashboard loads after login | passed | 2793ms |
| admin.spec.js > Admin - Authenticated Se | Admin categories page loads | passed | 2366ms |
| admin.spec.js > Admin - Authenticated Se | Admin jobs API works when authenticated | passed | 748ms |
| admin.spec.js > Admin - Authenticated Se | Admin QA dashboard returns data when aut | passed | 230ms |
| admin.spec.js > Admin - Authenticated Se | Admin product health endpoint works | passed | 581ms |
| admin.spec.js > Admin - Bulk Operations  | Export issues endpoint returns CSV | passed | 100ms |
| shop.spec.js > Shop - Route Smoke Tests | Homepage (/) loads correctly | passed | 3971ms |
| shop.spec.js > Shop - Route Smoke Tests | Dogs Landing (/dogs) loads correctly | passed | 5416ms |
| shop.spec.js > Shop - Route Smoke Tests | Cats Landing (/cats) loads correctly | passed | 5512ms |
| shop.spec.js > Shop - Route Smoke Tests | Collections (/collections) loads correct | passed | 3998ms |
| shop.spec.js > Shop - Route Smoke Tests | Categories (/categories) loads correctly | passed | 4259ms |
| shop.spec.js > Shop - Health Endpoints | /health returns 200 | passed | 73ms |
| shop.spec.js > Shop - Health Endpoints | /healthz returns 200 | passed | 132ms |
| shop.spec.js > Shop - Health Endpoints | /api/health returns 200 | passed | 69ms |
| shop.spec.js > Shop - Health Endpoints | /api/version returns 200 | passed | 89ms |
| shop.spec.js > Shop - Health Endpoints | /api/build returns 200 | passed | 378ms |
| shop.spec.js > Shop - Navigation | Header navigation links work | failed | 12232ms |
| shop.spec.js > Shop - Navigation | Footer links are present | passed | 10724ms |
| shop.spec.js > Shop - Navigation | Logo links to homepage | passed | 12283ms |
| shop.spec.js > Shop - Products API | Products API returns data | passed | 811ms |
| shop.spec.js > Shop - Products API | Products are pet-eligible only | passed | 408ms |
| shop.spec.js > Shop - Product Detail Pag | Product page loads with valid content | failed | 31529ms |
| shop.spec.js > Shop - Product Detail Pag | Product images load without errors | passed | 3672ms |
| shop.spec.js > Shop - Search | Search returns results for "dog" | passed | 16688ms |
| shop.spec.js > Shop - Search | Search API returns results | passed | 516ms |
| shop.spec.js > Shop - Cart | Cart icon is visible | passed | 14480ms |
| shop.spec.js > Shop - Cart | Add to cart updates cart count | passed | 2933ms |
| shop.spec.js > Shop - Pawsy Mascot | Pawsy widget is visible | passed | 5824ms |
| shop.spec.js > Shop - Pawsy Mascot | Pawsy video loads | passed | 5309ms |

## Top 10 Critical Issues
1. **Header navigation links work**: TimeoutError: locator.click: Timeout 5000ms exceeded.
Call log:
[2m  - waiting for locator('a[href=
2. **Product page loads with valid content**: [31mTest timeout of 30000ms exceeded.[39m

---
*Report generated by GetPawsy QA System*
