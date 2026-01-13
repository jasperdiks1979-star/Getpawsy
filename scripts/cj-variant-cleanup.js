#!/usr/bin/env node
/**
 * CJ Variant Cleanup Script
 * Fixes: garbage options, duplicate variants, missing images
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/db.json');
const REPORT_PATH = path.join(__dirname, '../qa-reports/variant-cleanup-report.json');
const REPORT_MD = path.join(__dirname, '../qa-reports/variant-cleanup-report.md');

const MEANINGFUL_OPTIONS = ['Color', 'Colour', 'Size', 'Type', 'Style', 'Material', 'Pattern'];
const GARBAGE_OPTION_PATTERN = /^Option\d+$/i;

const report = {
  timestamp: new Date().toISOString(),
  totalProducts: 0,
  productsWithVariants: 0,
  totalVariantsBefore: 0,
  totalVariantsAfter: 0,
  variantsRemoved: 0,
  optionsCleaned: 0,
  duplicatesRemoved: 0,
  singleVariantProducts: 0,
  imagesFixed: 0,
  examples: []
};

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function cleanVariantOptions(options) {
  if (!options || typeof options !== 'object') return {};
  
  const cleaned = {};
  let cleanedCount = 0;
  
  for (const [key, value] of Object.entries(options)) {
    if (GARBAGE_OPTION_PATTERN.test(key)) {
      cleanedCount++;
      continue;
    }
    
    const normKey = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
    const normValue = String(value).trim();
    
    if (!normValue || normValue === 'undefined' || normValue.length > 50) continue;
    
    if (MEANINGFUL_OPTIONS.some(m => normKey.toLowerCase() === m.toLowerCase())) {
      cleaned[normKey] = normValue;
    }
  }
  
  report.optionsCleaned += cleanedCount;
  return cleaned;
}

function getVariantKey(options) {
  const color = options.Color || options.Colour || '';
  const size = options.Size || '';
  const type = options.Type || '';
  return `${color}|${size}|${type}`.toLowerCase();
}

function cleanProductVariants(product) {
  if (!product.variants || !Array.isArray(product.variants)) {
    return { variants: [], cleaned: false };
  }
  
  const beforeCount = product.variants.length;
  report.totalVariantsBefore += beforeCount;
  
  const seen = new Map();
  const cleanedVariants = [];
  
  for (const variant of product.variants) {
    const cleanedOptions = cleanVariantOptions(variant.options || {});
    const key = getVariantKey(cleanedOptions);
    
    if (seen.has(key)) {
      report.duplicatesRemoved++;
      continue;
    }
    
    const cleanedVariant = {
      ...variant,
      options: cleanedOptions
    };
    
    if (!cleanedVariant.image && product.image) {
      cleanedVariant.image = product.image;
      report.imagesFixed++;
    }
    
    if (Object.keys(cleanedOptions).length === 0) {
      cleanedVariant.options = { Type: 'Standard' };
    }
    
    seen.set(key, true);
    cleanedVariants.push(cleanedVariant);
  }
  
  if (cleanedVariants.length === 0) {
    cleanedVariants.push({
      id: `${product.id}-STD`,
      sku: product.id + '-STD',
      cj_sku: product.id,
      price: product.price || 19.99,
      options: { Type: 'Standard' },
      image: product.image,
      active: true
    });
  }
  
  const afterCount = cleanedVariants.length;
  report.totalVariantsAfter += afterCount;
  report.variantsRemoved += (beforeCount - afterCount);
  
  if (afterCount === 1) {
    report.singleVariantProducts++;
  }
  
  return {
    variants: cleanedVariants,
    cleaned: beforeCount !== afterCount || report.optionsCleaned > 0
  };
}

async function main() {
  log('=== CJ Variant Cleanup ===');
  
  if (!fs.existsSync(DB_PATH)) {
    log('ERROR: db.json not found');
    process.exit(1);
  }
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const products = db.products || [];
  
  report.totalProducts = products.length;
  log(`Processing ${products.length} products...`);
  
  let updated = 0;
  
  for (const product of products) {
    if (!product.variants || product.variants.length === 0) continue;
    
    report.productsWithVariants++;
    
    const { variants, cleaned } = cleanProductVariants(product);
    
    if (cleaned) {
      product.variants = variants;
      updated++;
      
      if (report.examples.length < 5) {
        report.examples.push({
          id: product.id,
          title: (product.title || '').substring(0, 50),
          variantsBefore: report.totalVariantsBefore,
          variantsAfter: variants.length,
          sampleOptions: variants[0]?.options
        });
      }
    }
  }
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  log(`Updated ${updated} products`);
  
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  
  const md = `# Variant Cleanup Report
  
Generated: ${report.timestamp}

## Summary
- Total Products: ${report.totalProducts}
- Products with Variants: ${report.productsWithVariants}
- Variants Before: ${report.totalVariantsBefore}
- Variants After: ${report.totalVariantsAfter}
- Duplicates Removed: ${report.duplicatesRemoved}
- Options Cleaned (garbage removed): ${report.optionsCleaned}
- Single Variant Products: ${report.singleVariantProducts}
- Images Fixed: ${report.imagesFixed}

## Examples
${report.examples.map(e => `- ${e.id}: ${e.title} (${e.variantsAfter} variants)`).join('\n')}
`;
  
  fs.writeFileSync(REPORT_MD, md);
  
  log('=== Summary ===');
  log(`Variants: ${report.totalVariantsBefore} -> ${report.totalVariantsAfter}`);
  log(`Duplicates removed: ${report.duplicatesRemoved}`);
  log(`Garbage options cleaned: ${report.optionsCleaned}`);
  log(`Report: ${REPORT_PATH}`);
}

main().catch(console.error);
