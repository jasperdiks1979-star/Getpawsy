# GetPawsy Pricing Engine & CSV Export/Import Plan

## Phase 0: Data Inventory

### Data Location
- **Source of Truth**: `data/catalog.json`
- **Format**: JSON array wrapped in `{ products: [...] }`
- **Auth Middleware**: `src/adminAuth.js` → `requireAdminSession`

### Product Fields (Relevant)
| Field | Description | Type |
|-------|-------------|------|
| `id` | Product ID | string |
| `title` | Product title | string |
| `slug` | URL-friendly handle | string |
| `price` | Selling price (USD) | number |
| `oldPrice` | Compare-at price | number |
| `costPrice` | CJ cost price (USD) | number |
| `pet_type` | Primary pet category | string |
| `mainCategorySlug` | Main category (dogs/cats/small-pets) | string |
| `subcategorySlug` | Subcategory | string |
| `categories` | Array of category tags | string[] |
| `active` | Product active status | boolean |
| `variants` | Array of variants | object[] |
| `originalImages` | CJ CDN image URLs | string[] |

### Variant Fields (if present)
| Field | Description |
|-------|-------------|
| `vid` | Variant ID |
| `variantName` | Variant title |
| `variantSku` | SKU |
| `costPrice` | Variant-level cost |
| `price` | Variant-level price |

### Source of Truth Mapping
- **Cost**: `product.costPrice` or `variant.costPrice`
- **Price**: `product.price` or `variant.price`
- **Slug/Handle**: `product.slug`
- **Categories**: `mainCategorySlug`, `subcategorySlug`, `pet_type`
- **CJ URL**: Constructed from product ID

## Phase 1: Pricing Engine

### Tiered Markup (Default)
| Cost Range (USD) | Multiplier |
|------------------|------------|
| $0 - $10 | ×3.0 |
| $10 - $30 | ×2.5 |
| $30 - $80 | ×2.0 |
| $80 - $150 | ×1.8 |
| $150+ | ×1.5 |

### Category Overrides
- `small-pets/cages-habitats` → max ×1.8
- `toys` → ×2.5 - ×3.0
- `food` → ×2.0

### Psychological Rounding
- < $100 → ends in .99
- $100 - $250 → ends in .95
- ≥ $250 → round to nearest 10, end in .00

### Guardrails
- Minimum absolute margin: $5
- Never below cost + $0.01
- Max price clamp (optional)

## Phase 2: CSV Export

### Endpoint
`GET /api/admin/products/export.csv`

### Columns
```
product_id,slug,title,category_slug,pet_type,subcategory,
variant_id,variant_sku,variant_title,
cost,price,suggested_price,multiplier_used,rounding_rule,
active,cj_product_url,image_url
```

## Phase 3: CSV Import

### Endpoints
- `POST /api/admin/products/import?mode=dryrun` - Preview changes
- `POST /api/admin/products/import?mode=apply` - Apply changes

### Updateable Fields
- `price` (variant or product level)
- `active`
- `category_slug`, `pet_type`, `subcategory` (optional)

### Validation Rules
- New price must be numeric
- New price ≥ cost + $0.01
- New price > 0
- Normalize to 2 decimal places

## Phase 4: Admin UI

### Location
Admin dashboard → "Pricing & CSV" section

### Features
1. Download CSV button
2. Upload CSV with preview
3. Dry-run preview table
4. Apply changes button
5. Auto-Reprice button (optional)

## Implementation Notes

### Files Created
- `server/pricing/pricing-engine.js` - Core pricing logic
- `routes/admin-pricing.js` - Admin API endpoints
- `views/admin/pricing.ejs` - Admin UI panel
- `docs/admin-pricing-csv.md` - User documentation
