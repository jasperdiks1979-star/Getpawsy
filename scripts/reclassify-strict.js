#!/usr/bin/env node
/**
 * STRICT RECLASSIFICATION SCRIPT
 * Reclassifies all products using the strict classifier with DOG/CAT exclusion from Small Pets.
 */

const fs = require('fs');
const path = require('path');
const { reclassifyProduct, getClassificationStats, classifyWithConfidence } = require('../src/strictCategoryClassifier');

const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');
const BACKUP_PATH = path.join(__dirname, '../data/catalog.backup.json');

function reclassifyAll() {
  console.log('[Reclassify] Starting strict reclassification...');
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('[Reclassify] catalog.json not found');
    process.exit(1);
  }
  
  const catalogData = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  const products = catalogData.products || [];
  
  console.log(`[Reclassify] Loaded ${products.length} products`);
  
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(catalogData, null, 2));
  console.log('[Reclassify] Backup created at catalog.backup.json');
  
  const beforeStats = getClassificationStats(products);
  console.log('[Reclassify] BEFORE stats:', beforeStats);
  
  const reclassified = products.map(p => reclassifyProduct(p));
  
  const afterStats = getClassificationStats(reclassified);
  console.log('[Reclassify] AFTER stats:', afterStats);
  
  const changes = [];
  for (let i = 0; i < products.length; i++) {
    const oldCat = products[i].mainCategorySlug || products[i].pet_type || 'unknown';
    const newCat = reclassified[i].mainCategorySlug || 'unknown';
    if (oldCat !== newCat) {
      changes.push({
        id: products[i].id,
        title: (products[i].title || '').slice(0, 60),
        from: oldCat,
        to: newCat
      });
    }
  }
  
  console.log(`[Reclassify] ${changes.length} products changed category:`);
  changes.slice(0, 20).forEach(c => {
    console.log(`  ${c.from} -> ${c.to}: ${c.title}`);
  });
  
  const contaminatedBefore = products.filter(p => {
    if (p.mainCategorySlug !== 'small-pets' && p.pet_type !== 'small_pet') return false;
    const title = (p.title || '').toLowerCase();
    return title.includes('dog') || title.includes('cat') || title.includes('kitten') || title.includes('puppy');
  });
  
  const contaminatedAfter = reclassified.filter(p => {
    if (p.mainCategorySlug !== 'small-pets') return false;
    const title = (p.title || '').toLowerCase();
    return title.includes('dog') || title.includes('cat') || title.includes('kitten') || title.includes('puppy');
  });
  
  console.log(`[Reclassify] Small Pets contamination: ${contaminatedBefore.length} -> ${contaminatedAfter.length}`);
  
  if (contaminatedAfter.length > 0) {
    console.log('[Reclassify] WARNING: Remaining contaminated products:');
    contaminatedAfter.forEach(p => {
      console.log(`  - ${p.id}: ${(p.title || '').slice(0, 60)}`);
    });
  }
  
  catalogData.products = reclassified;
  catalogData.lastReclassified = new Date().toISOString();
  catalogData.classifierVersion = '2.0-strict';
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalogData, null, 2));
  console.log('[Reclassify] Saved updated catalog.json');
  
  return {
    before: beforeStats,
    after: afterStats,
    changes: changes.length,
    contamination: {
      before: contaminatedBefore.length,
      after: contaminatedAfter.length
    }
  };
}

if (require.main === module) {
  const result = reclassifyAll();
  console.log('\n[Reclassify] SUMMARY:', JSON.stringify(result, null, 2));
}

module.exports = { reclassifyAll };
