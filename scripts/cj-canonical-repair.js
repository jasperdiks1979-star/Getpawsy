#!/usr/bin/env node
/**
 * CJ Canonical Repair Script
 * Audits catalog.json for CJ mapping issues and generates reports
 * 
 * Usage:
 *   node scripts/cj-canonical-repair.js           # Dry run - report only
 *   node scripts/cj-canonical-repair.js --apply   # Apply fixes
 *   node scripts/cj-canonical-repair.js --verbose # Detailed output
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const REPORTS_DIR = path.join(__dirname, '..', 'data', 'cj-reports');

const args = process.argv.slice(2);
const APPLY_FIXES = args.includes('--apply');
const VERBOSE = args.includes('--verbose');

function log(...args) {
  console.log('[CJ Repair]', ...args);
}

function vlog(...args) {
  if (VERBOSE) console.log('  ', ...args);
}

function loadCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    return data.products || data;
  } catch (err) {
    console.error('Failed to load catalog:', err.message);
    process.exit(1);
  }
}

function saveCatalog(products) {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    data.products = products;
    data.updated_at = new Date().toISOString();
    data.repaired_at = new Date().toISOString();
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Failed to save catalog:', err.message);
    return false;
  }
}

function backupCatalog() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = path.join(backupDir, `catalog-pre-cj-repair-${timestamp}.json`);
  fs.copyFileSync(CATALOG_PATH, backupPath);
  log('Backup created:', backupPath);
  return backupPath;
}

function extractCJProductIdFromId(productId) {
  if (!productId) return null;
  const str = String(productId);
  if (/^\d{16,}$/.test(str)) return str;
  const match = str.match(/\d{16,}/);
  return match ? match[0] : null;
}

function isCJSku(sku) {
  if (!sku) return false;
  return /^CJ[A-Z0-9]{5,}/i.test(sku) || /^[A-Z]{2,4}\d{6,}[A-Z0-9]*$/i.test(sku);
}

function repairProduct(product) {
  const issues = [];
  const fixes = [];
  const repaired = { ...product };
  
  if (!repaired.cjProductId) {
    const extracted = extractCJProductIdFromId(product.id);
    if (extracted) {
      repaired.cjProductId = extracted;
      fixes.push(`Set cjProductId from id: ${extracted}`);
    } else {
      issues.push('Missing cjProductId - cannot extract from id');
    }
  }
  
  if (!Array.isArray(repaired.variants) || repaired.variants.length === 0) {
    repaired.variants = [{
      id: `${product.id}::default`,
      cjVariantId: null,
      cjSku: repaired.cjProductId || null,
      sku: product.sku || product.id,
      title: 'Standard',
      price: product.price || 0,
      comparePrice: product.comparePrice || null,
      image: product.image || product.thumbnail || (product.images?.[0]) || null,
      options: {},
      available: true,
      stock: 0,
      warehouses: [],
      preferredWarehouse: null,
      isDefault: true
    }];
    fixes.push('Created default variant');
  } else {
    repaired.variants = repaired.variants.map((v, idx) => {
      const variantIssues = [];
      const variant = { ...v };
      
      if (!variant.cjVariantId) {
        if (v.vid) {
          variant.cjVariantId = v.vid;
        } else if (v.cjSku && isCJSku(v.cjSku)) {
          variant.cjVariantId = v.cjSku;
        } else if (v.sku && isCJSku(v.sku)) {
          variant.cjVariantId = v.sku;
          variant.cjSku = v.sku;
        } else {
          variantIssues.push(`Variant ${idx}: Missing cjVariantId`);
        }
      }
      
      if (!variant.id) {
        variant.id = variant.cjVariantId || variant.sku || `${product.id}::var${idx}`;
        fixes.push(`Variant ${idx}: Generated id`);
      }
      
      if (!variant.sku) {
        variant.sku = variant.cjVariantId || variant.id;
        fixes.push(`Variant ${idx}: Set sku from cjVariantId`);
      }
      
      if (!variant.image && product.images?.[0]) {
        variant.image = product.images[0];
        fixes.push(`Variant ${idx}: Set image from product`);
      }
      
      if (variant.price === undefined || variant.price === null) {
        variant.price = product.price || 0;
        fixes.push(`Variant ${idx}: Set price from product`);
      }
      
      if (variant.available === undefined) {
        variant.available = true;
      }
      
      if (!Array.isArray(variant.warehouses)) {
        variant.warehouses = [];
      }
      
      if (!variant.options) {
        variant.options = {};
      }
      
      issues.push(...variantIssues);
      
      return variant;
    });
  }
  
  if (!Array.isArray(repaired.options)) {
    const optionTypes = {};
    for (const v of repaired.variants) {
      if (v.options && typeof v.options === 'object') {
        for (const [key, value] of Object.entries(v.options)) {
          if (value) {
            if (!optionTypes[key]) optionTypes[key] = new Set();
            optionTypes[key].add(String(value));
          }
        }
      }
    }
    repaired.options = Object.entries(optionTypes).map(([name, values]) => ({
      name,
      values: [...values].sort()
    }));
    if (repaired.options.length > 0) {
      fixes.push('Built options schema from variants');
    }
  }
  
  if (!repaired.defaultVariantId && repaired.variants?.[0]) {
    repaired.defaultVariantId = repaired.variants[0].id;
    fixes.push('Set defaultVariantId');
  }
  
  repaired.hasRealVariants = repaired.variants?.length > 1 || 
    repaired.variants?.some(v => v.cjVariantId || v.cjSku);
  
  return {
    product: repaired,
    issues,
    fixes,
    hasCjProductId: !!repaired.cjProductId,
    mappedVariants: repaired.variants?.filter(v => v.cjVariantId || v.cjSku).length || 0,
    totalVariants: repaired.variants?.length || 0
  };
}

function generateReports(results) {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const missingCjProductId = results.filter(r => !r.hasCjProductId);
  const missingVariantSku = results.filter(r => 
    r.product.variants?.some(v => !v.cjVariantId && !v.cjSku && !v.isDefault)
  );
  const noVariants = results.filter(r => !r.product.variants || r.product.variants.length === 0);
  const hasIssues = results.filter(r => r.issues.length > 0);
  const hasFixes = results.filter(r => r.fixes.length > 0);
  
  const summary = {
    timestamp: new Date().toISOString(),
    totalProducts: results.length,
    productsWithCjProductId: results.filter(r => r.hasCjProductId).length,
    productsMissingCjProductId: missingCjProductId.length,
    productsWithMappedVariants: results.filter(r => r.mappedVariants > 0).length,
    totalVariants: results.reduce((sum, r) => sum + r.totalVariants, 0),
    totalMappedVariants: results.reduce((sum, r) => sum + r.mappedVariants, 0),
    productsWithIssues: hasIssues.length,
    productsWithFixes: hasFixes.length,
    applyMode: APPLY_FIXES
  };
  
  fs.writeFileSync(
    path.join(REPORTS_DIR, `summary-${timestamp}.json`),
    JSON.stringify(summary, null, 2)
  );
  
  if (missingCjProductId.length > 0) {
    fs.writeFileSync(
      path.join(REPORTS_DIR, `missing-cj-product-id-${timestamp}.json`),
      JSON.stringify(missingCjProductId.map(r => ({
        id: r.product.id,
        title: r.product.title,
        slug: r.product.slug
      })), null, 2)
    );
  }
  
  if (missingVariantSku.length > 0) {
    fs.writeFileSync(
      path.join(REPORTS_DIR, `missing-variant-sku-${timestamp}.json`),
      JSON.stringify(missingVariantSku.map(r => ({
        id: r.product.id,
        title: r.product.title,
        variants: r.product.variants?.filter(v => !v.cjVariantId && !v.cjSku && !v.isDefault)
          .map(v => ({ id: v.id, title: v.title }))
      })), null, 2)
    );
  }
  
  if (hasIssues.length > 0) {
    fs.writeFileSync(
      path.join(REPORTS_DIR, `all-issues-${timestamp}.json`),
      JSON.stringify(hasIssues.map(r => ({
        id: r.product.id,
        title: r.product.title?.substring(0, 50),
        issues: r.issues
      })), null, 2)
    );
  }
  
  log('Reports written to:', REPORTS_DIR);
  
  return summary;
}

async function main() {
  log('Starting CJ Canonical Repair');
  log('Mode:', APPLY_FIXES ? 'APPLY FIXES' : 'DRY RUN (report only)');
  
  const products = loadCatalog();
  log('Loaded', products.length, 'products');
  
  if (APPLY_FIXES) {
    backupCatalog();
  }
  
  const results = [];
  
  for (const product of products) {
    const result = repairProduct(product);
    results.push(result);
    
    if (VERBOSE && (result.issues.length > 0 || result.fixes.length > 0)) {
      console.log(`\n[${product.id}] ${product.title?.substring(0, 40)}`);
      if (result.issues.length > 0) {
        console.log('  Issues:', result.issues.join('; '));
      }
      if (result.fixes.length > 0) {
        console.log('  Fixes:', result.fixes.join('; '));
      }
    }
  }
  
  const summary = generateReports(results);
  
  console.log('\n=== CJ Canonical Repair Summary ===');
  console.log(`Total products: ${summary.totalProducts}`);
  console.log(`With cjProductId: ${summary.productsWithCjProductId} (${Math.round(summary.productsWithCjProductId/summary.totalProducts*100)}%)`);
  console.log(`Missing cjProductId: ${summary.productsMissingCjProductId}`);
  console.log(`Total variants: ${summary.totalVariants}`);
  console.log(`Mapped variants: ${summary.totalMappedVariants} (${Math.round(summary.totalMappedVariants/summary.totalVariants*100)}%)`);
  console.log(`Products with issues: ${summary.productsWithIssues}`);
  console.log(`Products with fixes: ${summary.productsWithFixes}`);
  
  if (APPLY_FIXES && summary.productsWithFixes > 0) {
    const repairedProducts = results.map(r => r.product);
    if (saveCatalog(repairedProducts)) {
      log('Catalog updated with', summary.productsWithFixes, 'product fixes');
    } else {
      log('ERROR: Failed to save catalog');
      process.exit(1);
    }
  } else if (!APPLY_FIXES && summary.productsWithFixes > 0) {
    log('Run with --apply to apply', summary.productsWithFixes, 'fixes');
  }
  
  log('Done');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
