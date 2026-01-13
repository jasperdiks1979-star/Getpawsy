#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const cjVariants = require('../helpers/cjVariants');

const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');
const BATCH_SIZE = 3;
const DELAY_MS = 3000;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  log('=== Fetch CJ Variants for Catalog Products ===');
  
  if (!fs.existsSync(CATALOG_PATH)) {
    log('ERROR: catalog.json not found');
    process.exit(1);
  }
  
  const rawCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  const products = Array.isArray(rawCatalog) ? rawCatalog : (rawCatalog.products || []);
  
  log(`Loaded ${products.length} products from catalog.json`);
  
  const productsToFetch = products.filter(p => {
    const pid = p.cjProductId || p.id;
    const hasRealVariants = p.hasRealVariants === true;
    const variantCount = (p.variants || []).length;
    return pid && !hasRealVariants && variantCount <= 1;
  });
  
  log(`${productsToFetch.length} products need variant fetch`);
  
  if (productsToFetch.length === 0) {
    log('No products need variant update. Done!');
    return;
  }
  
  const limit = parseInt(process.argv[2]) || 50;
  log(`Processing first ${limit} products...`);
  
  const toProcess = productsToFetch.slice(0, limit);
  let updated = 0;
  let failed = 0;
  let multiVariant = 0;
  
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(toProcess.length/BATCH_SIZE)}...`);
    
    for (const product of batch) {
      const pid = product.cjProductId || product.id;
      
      try {
        const result = await cjVariants.fetchProductVariants(pid);
        
        if (result && result.variants && result.variants.length > 0) {
          const normalizedVariants = cjVariants.normalizeVariants(result.product);
          
          const catalogProduct = products.find(p => p.id === product.id);
          if (catalogProduct) {
            catalogProduct.variants = normalizedVariants;
            catalogProduct.hasRealVariants = normalizedVariants.length > 1;
            catalogProduct.options = cjVariants.buildOptionsSchema(normalizedVariants);
            
            updated++;
            if (normalizedVariants.length > 1) {
              multiVariant++;
              log(`  ${pid}: ${normalizedVariants.length} variants (${normalizedVariants.map(v => v.title).join(', ').slice(0, 60)}...)`);
            }
          }
        }
      } catch (err) {
        failed++;
        log(`  ERROR ${pid}: ${err.message}`);
      }
    }
    
    if (i + BATCH_SIZE < toProcess.length) {
      await sleep(DELAY_MS);
    }
  }
  
  log(`Updated ${updated} products`);
  log(`Failed: ${failed}`);
  log(`Multi-variant products: ${multiVariant}`);
  
  fs.writeFileSync(CATALOG_PATH + '.backup-variants-' + Date.now(), JSON.stringify(rawCatalog, null, 2));
  
  const outputData = Array.isArray(rawCatalog) ? products : { ...rawCatalog, products };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(outputData, null, 2));
  
  log('Catalog saved!');
  log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
