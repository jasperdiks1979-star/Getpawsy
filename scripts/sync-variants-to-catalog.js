#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/db.json');
const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  log('=== Sync Variants from db.json to catalog.json ===');
  
  if (!fs.existsSync(DB_PATH)) {
    log('ERROR: db.json not found');
    process.exit(1);
  }
  
  if (!fs.existsSync(CATALOG_PATH)) {
    log('ERROR: catalog.json not found');
    process.exit(1);
  }
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  
  const dbProducts = db.products || [];
  const catalogProducts = Array.isArray(catalog) ? catalog : (catalog.products || []);
  
  log(`DB has ${dbProducts.length} products`);
  log(`Catalog has ${catalogProducts.length} products`);
  
  const dbVariantMap = new Map();
  let dbMultiVariantCount = 0;
  
  for (const p of dbProducts) {
    if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
      dbVariantMap.set(String(p.id), p.variants);
      if (p.variants.length > 1) dbMultiVariantCount++;
    }
  }
  
  log(`DB has ${dbMultiVariantCount} products with multiple variants`);
  log(`DB variant map has ${dbVariantMap.size} entries`);
  
  let updated = 0;
  let skipped = 0;
  let multiVariantNow = 0;
  
  for (const product of catalogProducts) {
    const pid = String(product.id);
    const dbVariants = dbVariantMap.get(pid);
    
    if (dbVariants && dbVariants.length > 0) {
      const currentVariants = product.variants || [];
      
      if (currentVariants.length !== dbVariants.length) {
        product.variants = dbVariants;
        updated++;
        if (dbVariants.length > 1) multiVariantNow++;
      } else {
        skipped++;
        if (dbVariants.length > 1) multiVariantNow++;
      }
    }
  }
  
  log(`Updated ${updated} products with variants`);
  log(`Skipped ${skipped} (already had same variant count)`);
  log(`Total multi-variant products now: ${multiVariantNow}`);
  
  fs.writeFileSync(CATALOG_PATH + '.backup-' + Date.now(), JSON.stringify(catalog, null, 2));
  
  const outputData = Array.isArray(catalog) ? catalogProducts : { ...catalog, products: catalogProducts };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(outputData, null, 2));
  
  log('Catalog saved with synced variants');
  log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
