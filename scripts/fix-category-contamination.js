#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { 
  classifyWithConfidence, 
  isStrictSmallPet, 
  reclassifyProduct,
  getClassificationStats,
  normalizeText,
  SMALL_PET_EXCLUSIONS
} = require('../src/strictCategoryClassifier');

const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');

function loadCatalog() {
  const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  return data;
}

function saveCatalog(data) {
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
}

function findContamination(products) {
  const contaminated = [];
  
  for (const p of products) {
    const wasSmallPet = p.pet_type === 'small_pet' || p.mainCategorySlug === 'small-pets';
    if (!wasSmallPet) continue;
    
    const title = normalizeText(p.title || p.name || '');
    for (const ex of SMALL_PET_EXCLUSIONS.slice(0, 14)) {
      if (title.includes(normalizeText(ex))) {
        contaminated.push({
          id: p.id,
          title: p.title,
          old_pet_type: p.pet_type,
          old_mainCategorySlug: p.mainCategorySlug,
          contaminant: ex
        });
        break;
      }
    }
  }
  
  return contaminated;
}

function run() {
  console.log('[FIX] Loading catalog...');
  const catalog = loadCatalog();
  const products = catalog.products || [];
  
  console.log(`[FIX] Found ${products.length} products`);
  
  const beforeStats = getClassificationStats(products);
  console.log('\n[BEFORE] Classification stats:');
  console.log(`  Dogs: ${beforeStats.dogs}`);
  console.log(`  Cats: ${beforeStats.cats}`);
  console.log(`  Small Pets: ${beforeStats.smallPets}`);
  console.log(`  Unknown: ${beforeStats.unknown}`);
  console.log(`  Blocked: ${beforeStats.blocked}`);
  console.log(`  Small Pet Contamination: ${beforeStats.smallPetContamination}`);
  
  const contaminated = findContamination(products);
  console.log(`\n[FIX] Found ${contaminated.length} contaminated products:`);
  for (const c of contaminated.slice(0, 10)) {
    console.log(`  - [${c.id}] "${c.title.slice(0, 50)}..." (contains "${c.contaminant}")`);
  }
  if (contaminated.length > 10) {
    console.log(`  ... and ${contaminated.length - 10} more`);
  }
  
  console.log('\n[FIX] Reclassifying all products...');
  let fixed = 0;
  const reclassified = products.map(p => {
    const updated = reclassifyProduct(p);
    if (updated.pet_type !== p.pet_type || updated.mainCategorySlug !== p.mainCategorySlug) {
      fixed++;
    }
    return updated;
  });
  
  console.log(`[FIX] Reclassified ${fixed} products`);
  
  const afterStats = getClassificationStats(reclassified);
  console.log('\n[AFTER] Classification stats:');
  console.log(`  Dogs: ${afterStats.dogs}`);
  console.log(`  Cats: ${afterStats.cats}`);
  console.log(`  Small Pets: ${afterStats.smallPets}`);
  console.log(`  Unknown: ${afterStats.unknown}`);
  console.log(`  Blocked: ${afterStats.blocked}`);
  console.log(`  Small Pet Contamination: ${afterStats.smallPetContamination}`);
  console.log(`  Small Pet Subcategories:`, afterStats.bySmallPetSubcat);
  
  catalog.products = reclassified;
  catalog.buildInfo = catalog.buildInfo || {};
  catalog.buildInfo.lastCategoryFix = new Date().toISOString();
  catalog.buildInfo.categoryFixStats = {
    before: beforeStats,
    after: afterStats,
    fixed
  };
  
  saveCatalog(catalog);
  console.log('\n[FIX] Catalog saved successfully');
  
  const stillContaminated = findContamination(reclassified);
  if (stillContaminated.length > 0) {
    console.log(`\n[WARN] Still have ${stillContaminated.length} contaminated products after fix:`);
    for (const c of stillContaminated) {
      console.log(`  - [${c.id}] "${c.title.slice(0, 50)}..." (contains "${c.contaminant}")`);
    }
  } else {
    console.log('\n[SUCCESS] No contamination remaining!');
  }
}

run();
