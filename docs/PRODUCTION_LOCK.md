# PRODUCTION LOCK - GetPawsy

## Critical Flow: Cart & Add-to-Cart
- **Implementation**: `public/js/cart-store.js`
- **Unified Function**: `window.addToCartUnified({ productId, variantId, qty, title, price, image })`
- **Storage Strategy**: SafeStorage (localStorage -> cookie fallback -> memory)
- **Storage Key**: `getpawsy_cart_v1`
- **Events**: `cart:updated` dispatched on `window` for UI synchronization

## Critical Components
- **Cart UI**: `public/js/cart-ui.js` (listens to `cart:updated`)
- **PDP (Product Page)**: `views/product.ejs` (uses `addToCartUnified`)
- **Product Cards**: `public/app.js` (uses `addToCartUnified` where applicable)

## Testing (Smoke Tests)
- Run `npm run test:smoke` to verify API integrity
- Verify `/api/products?petType=small` returns products
- Verify `/api/products?petType=dog` returns products
- Verify `/api/products?petType=cat` returns products

## DO NOT EDIT List
- `data/telemetry.json` (System generated)
- `data/safety-scan.json` (System generated)
- `data/audit-logs/` (System generated)

## Production Safety
- Basic security headers enabled in `server.js`
- Compression enabled for all critical assets
- No-cache headers forced for critical JS/CSS files
