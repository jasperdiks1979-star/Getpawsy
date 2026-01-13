# GetPawsy Admin Pricing & CSV Guide

## Overview

The Pricing & CSV system allows you to manage product prices through bulk CSV export/import operations with a built-in pricing engine that calculates suggested prices based on cost.

## Access

Navigate to **Admin Dashboard** → **Pricing & CSV** tab.

## Features

### 1. CSV Export

Download a complete CSV of all products with:
- Product ID, slug, title
- Category information (pet type, subcategory)
- Cost price (from CJ Dropshipping)
- Current selling price
- Suggested price (calculated by pricing engine)
- Multiplier and rounding rule used

**To export:**
1. Click "Download CSV" button
2. Open in Excel or Google Sheets
3. Edit the "price" column as needed
4. Save as CSV

### 2. CSV Import

Upload a modified CSV to update prices:

**Steps:**
1. Drag & drop your CSV or click "Choose File"
2. Click "Preview Changes (Dry-run)" to see what will change
3. Review the preview table showing old vs new values
4. If satisfied, click "Apply Changes"

**Supported updates:**
- `price` - Product/variant selling price
- `active` - true/false to enable/disable products
- `category_slug` - Main category assignment
- `pet_type` - Pet type (dog/cat/small_pet)
- `subcategory` - Subcategory assignment

**Validation rules:**
- Price must be a valid number
- Price must be > $0
- Price must be at least cost + $0.01

### 3. Auto-Reprice

Automatically recalculate all prices using the pricing engine:

1. Click "Preview Reprice" to see proposed changes
2. Review increases/decreases summary
3. Click "Apply Reprice to All" to update

### 4. Audit Log

View recent price changes:
- Timestamp
- Product ID
- Old price → New price
- Source (csv_import or auto_reprice)

## Pricing Engine Rules

### Tiered Markup

| Cost (USD) | Multiplier |
|------------|------------|
| $0 - $10   | ×3.0       |
| $10 - $30  | ×2.5       |
| $30 - $80  | ×2.0       |
| $80 - $150 | ×1.8       |
| $150+      | ×1.5       |

### Category Overrides

- `cages-habitats` → max ×1.8
- `toys` → ×2.5
- `food` → ×2.0

### Psychological Rounding

| Price Range | Ending |
|-------------|--------|
| < $100      | .99    |
| $100 - $250 | .95    |
| ≥ $250      | .00 (nearest 10) |

### Guardrails

- Minimum profit margin: $5
- Never price below cost + $0.01

## API Endpoints

### Export CSV
```
GET /api/admin/pricing/products/export.csv
```

### Import (Dry-run)
```
POST /api/admin/pricing/products/import?mode=dryrun
Content-Type: text/csv

[CSV data]
```

### Import (Apply)
```
POST /api/admin/pricing/products/import?mode=apply
Content-Type: text/csv

[CSV data]
```

### Auto-Reprice (Dry-run)
```
POST /api/admin/pricing/pricing/reprice?mode=dryrun
```

### Auto-Reprice (Apply)
```
POST /api/admin/pricing/pricing/reprice?mode=apply
```

### Audit Log
```
GET /api/admin/pricing/pricing/audit?limit=100
```

## Example CSV Row

```csv
product_id,slug,title,category_slug,pet_type,subcategory,variant_id,variant_sku,variant_title,cost,price,old_price,suggested_price,multiplier,rounding_rule,active,cj_product_url,image_url
1996064726721794050,stylish-foldable-pet-carrier,Stylish Pet Carrier,dogs,dog,travel,,,12.50,35.00,45.50,37.99,3.00,.99,true,https://cjdropshipping.com/...,/media/...
```
