/**
 * Apply CSV Import Script
 * Uses optimized_import CSV as source of truth for pricing/categories
 * Uses excluded_log CSV to block/disable products
 */
const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const OPTIMIZED_CSV = path.join(__dirname, '..', 'getpawsy_products_optimized_import.csv');
const EXCLUDED_CSV = path.join(__dirname, '..', 'getpawsy_products_excluded_log.csv');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  
  if (lines.length < 2) return { headers: [], rows: [] };
  
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

function normalizePrice(val) {
  if (!val) return null;
  const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? null : num;
}

async function main() {
  console.log('='.repeat(60));
  console.log('CSV IMPORT SCRIPT - Option A: CSV as Source of Truth');
  console.log('='.repeat(60));
  
  // Load catalog
  console.log('\n[1] Loading catalog.json...');
  const catalogData = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  const products = catalogData.products || catalogData;
  console.log(`   Loaded ${products.length} products`);
  
  // Create lookup map
  const productMap = new Map();
  products.forEach(p => {
    productMap.set(p.id, p);
    if (p.slug) productMap.set(p.slug, p);
  });
  
  // Parse optimized import CSV
  console.log('\n[2] Parsing optimized import CSV...');
  const optimizedData = parseCSV(OPTIMIZED_CSV);
  console.log(`   Found ${optimizedData.rows.length} rows`);
  console.log(`   Columns: ${optimizedData.headers.slice(0, 10).join(', ')}...`);
  
  // Group by product_id (since CSV has one row per variant)
  const optimizedProducts = new Map();
  for (const row of optimizedData.rows) {
    const productId = row.product_id;
    if (!productId) continue;
    
    if (!optimizedProducts.has(productId)) {
      optimizedProducts.set(productId, {
        price: normalizePrice(row.price),
        pet_type: row.pet_type || row.pet_type_inferred,
        category_slug: row.category_slug || row.category_slug_inferred,
        slug: row.slug,
        title: row.title
      });
    }
  }
  console.log(`   Unique products in optimized CSV: ${optimizedProducts.size}`);
  
  // Parse excluded log CSV
  console.log('\n[3] Parsing excluded log CSV...');
  const excludedData = parseCSV(EXCLUDED_CSV);
  console.log(`   Found ${excludedData.rows.length} rows`);
  
  // Get unique product IDs to exclude
  const excludedProductIds = new Set();
  for (const row of excludedData.rows) {
    if (row.product_id) {
      excludedProductIds.add(row.product_id);
    }
  }
  console.log(`   Unique products to exclude: ${excludedProductIds.size}`);
  
  // Apply updates
  console.log('\n[4] Applying updates to catalog...');
  
  let updatedCount = 0;
  let priceUpdates = 0;
  let categoryUpdates = 0;
  let petTypeUpdates = 0;
  let blockedCount = 0;
  let notFoundCount = 0;
  
  const updatedExamples = [];
  const blockedExamples = [];
  const notFoundExamples = [];
  
  // First: Update from optimized CSV
  for (const [productId, csvData] of optimizedProducts) {
    const product = productMap.get(productId);
    
    if (!product) {
      notFoundCount++;
      if (notFoundExamples.length < 5) {
        notFoundExamples.push({ id: productId, title: csvData.title?.slice(0, 40) });
      }
      continue;
    }
    
    let changed = false;
    
    // Update price if valid and different
    if (csvData.price && csvData.price > 0) {
      const oldPrice = parseFloat(product.price) || 0;
      if (Math.abs(oldPrice - csvData.price) > 0.01) {
        product.price = csvData.price;
        priceUpdates++;
        changed = true;
      }
    }
    
    // Update pet_type
    if (csvData.pet_type && csvData.pet_type !== product.pet_type && csvData.pet_type !== product.petType) {
      product.pet_type = csvData.pet_type;
      product.petType = csvData.pet_type;
      petTypeUpdates++;
      changed = true;
    }
    
    // Update category_slug
    if (csvData.category_slug && csvData.category_slug !== product.mainCategorySlug) {
      product.mainCategorySlug = csvData.category_slug;
      categoryUpdates++;
      changed = true;
    }
    
    if (changed) {
      product.updatedAt = new Date().toISOString();
      updatedCount++;
      if (updatedExamples.length < 5) {
        updatedExamples.push({ id: productId, title: product.title?.slice(0, 40), price: product.price });
      }
    }
  }
  
  // Second: Block excluded products
  for (const productId of excludedProductIds) {
    const product = productMap.get(productId);
    
    if (!product) continue;
    
    if (product.blocked !== true || product.active !== false) {
      product.blocked = true;
      product.active = false;
      product.blockedReason = 'CSV excluded log';
      product.updatedAt = new Date().toISOString();
      blockedCount++;
      
      if (blockedExamples.length < 5) {
        blockedExamples.push({ id: productId, title: product.title?.slice(0, 40) });
      }
    }
  }
  
  // Save catalog
  console.log('\n[5] Saving catalog.json...');
  if (catalogData.products) {
    catalogData.products = products;
  }
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalogData, null, 2));
  console.log('   Catalog saved.');
  
  // Report
  console.log('\n' + '='.repeat(60));
  console.log('RAPPORT');
  console.log('='.repeat(60));
  console.log(`\nProducts updated:    ${updatedCount}`);
  console.log(`  - Price updates:   ${priceUpdates}`);
  console.log(`  - Pet type updates: ${petTypeUpdates}`);
  console.log(`  - Category updates: ${categoryUpdates}`);
  console.log(`\nProducts blocked:    ${blockedCount}`);
  console.log(`Products not found:  ${notFoundCount}`);
  
  console.log('\n--- Updated Examples ---');
  updatedExamples.forEach((p, i) => console.log(`  ${i+1}. ${p.id} - ${p.title} ($${p.price})`));
  
  console.log('\n--- Blocked Examples ---');
  blockedExamples.forEach((p, i) => console.log(`  ${i+1}. ${p.id} - ${p.title}`));
  
  if (notFoundExamples.length > 0) {
    console.log('\n--- Not Found Examples ---');
    notFoundExamples.forEach((p, i) => console.log(`  ${i+1}. ${p.id} - ${p.title}`));
  }
  
  console.log('\n' + '='.repeat(60));
  
  return {
    updated: updatedCount,
    blocked: blockedCount,
    notFound: notFoundCount,
    updatedExamples,
    blockedExamples
  };
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
