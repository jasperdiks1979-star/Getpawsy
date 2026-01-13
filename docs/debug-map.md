# GetPawsy Debug Map

## Category/Collection Data Flow

### Small Pets Routes
- `/small-pets` - Main Small Pets page (SPA route)
- `/collection/small-pets` - Collection route
- `/collection/small-pets/:subcategory` - Subcategory routes

### API Endpoints
- `GET /api/products?category=small_pets` - Products API with category filter
- `GET /api/products?petType=small_pet` - Products API with petType filter
- `GET /api/homepage` - Homepage sections including topPicksSmallPets

### Data Sources
- `data/catalog.json` - Primary product catalog (731 products)
- `data/hero-products.json` - Hero/featured product IDs
- Products have `pet_type: "small_pet"` field

### Category Filter Logic (server.full.js:3553-3575)
- Normalizes category slugs: `small_pets`, `small-pets`, `smallpets` → all match
- Filters by `p.pet_type` or `p.petType` field

## Cart State Flow

### Storage
- Primary key: `gp_cart_v2` (localStorage)
- Legacy keys migrated: `gp_cart`, `getpawsy_cart_v1`, `cart`, `pawsy_cart`

### Cart Store (public/js/cart-store.js)
- `CartStore.getItems()` - Returns cart items array
- `CartStore.getCount()` - Returns SUM of all quantities (badge rule)
- `CartStore.add(product, qty)` - Adds item with 500ms dedupe lock
- `CartStore.renderUI()` - Updates all badge/drawer elements

### Badge Selectors
- `.cart-count`, `#cartCount`, `#pawsyCartCount`

### Drawer Selectors
- Items: `.drawer-items`, `#drawerItems`, `#miniCartItems`, `#pawsyMiniCartItems`
- Subtotal: `.cart-subtotal`, `#cartSubtotal`, `#miniCartSubtotal`, `#pawsyMiniCartTotal`

## Image Loading

### Sources
- Local media: `/media/products/{productId}/main.webp`
- CJ CDN: `https://cf.cjdropshipping.com/...`

### Image Fields
- `p.images` - Array of image URLs
- `p.image` - Primary image (fallback)
- `p.primaryImageUrl` - Resolved primary image

### Lazy Loading
- First 8 images: `loading="eager"` (LCP optimization)
- Rest: `loading="lazy" decoding="async"`

### Image Validation (server.full.js:3498-3509)
- Allows CJ CDN URLs
- Allows local `/media/` paths
- Blocks placeholders/demo images
