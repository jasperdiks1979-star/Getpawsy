#!/usr/bin/env node
/**
 * Normalize Catalog Variants Script
 * Ensures all products have proper variants[] and options[] arrays
 * Creates default variants for products without CJ variant data
 */

const fs = require('fs');
const path = require('path');
const { normalizeProductVariants } = require('../src/lib/variantLinker');

const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');
const BACKUP_PATH = path.join(__dirname, `../data/catalog.backup.variants.${Date.now()}.json`);
const REPORT_PATH = path.join(__dirname, '../data/variant-normalization-report.json');

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function main() {
  log('=== Catalog Variant Normalization ===');
  
  if (!fs.existsSync(CATALOG_PATH)) {
    log('ERROR: catalog.json not found');
    process.exit(1);
  }
  
  // Create backup
  log(`Creating backup at ${path.basename(BACKUP_PATH)}`);
  const rawData = fs.readFileSync(CATALOG_PATH, 'utf-8');
  fs.writeFileSync(BACKUP_PATH, rawData);
  
  const catalog = JSON.parse(rawData);
  const products = catalog.products || [];
  
  const report = {
    startTime: new Date().toISOString(),
    totalProducts: products.length,
    productsWithRealVariants: 0,
    productsWithDefaultVariants: 0,
    totalVariants: 0,
    optionStats: {},
    samples: []
  };
  
  log(`Processing ${products.length} products...`);
  
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const hadVariants = product.variants && product.variants.length > 0;
    
    // Normalize the product
    const normalized = normalizeProductVariants(product);
    
    // Copy normalized data back
    products[i] = normalized;
    
    // Track stats
    if (normalized.hasRealVariants) {
      report.productsWithRealVariants++;
    } else {
      report.productsWithDefaultVariants++;
    }
    
    report.totalVariants += normalized.variants.length;
    
    // Track option types
    for (const opt of normalized.options) {
      if (!report.optionStats[opt.name]) {
        report.optionStats[opt.name] = 0;
      }
      report.optionStats[opt.name]++;
    }
    
    // Add sample
    if (report.samples.length < 10 && normalized.hasRealVariants) {
      report.samples.push({
        id: normalized.id,
        title: (normalized.title || normalized.name || '').substring(0, 50),
        variantCount: normalized.variants.length,
        options: normalized.options.map(o => o.name)
      });
    }
  }
  
  // Save normalized catalog
  catalog.products = products;
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  
  report.endTime = new Date().toISOString();
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  
  log('');
  log('=== Summary ===');
  log(`Total Products: ${report.totalProducts}`);
  log(`With Real Variants: ${report.productsWithRealVariants}`);
  log(`With Default Variants: ${report.productsWithDefaultVariants}`);
  log(`Total Variants: ${report.totalVariants}`);
  log(`Option Types: ${Object.keys(report.optionStats).join(', ') || 'None'}`);
  log('');
  log(`Report saved to: ${path.basename(REPORT_PATH)}`);
  log(`Backup saved to: ${path.basename(BACKUP_PATH)}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
