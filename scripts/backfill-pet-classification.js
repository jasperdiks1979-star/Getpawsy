#!/usr/bin/env node
/**
 * Backfill Pet Classification Script
 * Adds is_pet_product, pet_type, homepage_eligible, blocked_reason to all products
 */

const fs = require('fs');
const path = require('path');
const { isPetProduct, classifyPetType, classifyProductBucket } = require('../src/petClassifier');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_CJ = path.join(DATA_DIR, 'products_cj.json');
const PRODUCTS_V5 = path.join(DATA_DIR, 'products_v5.json');
const REPORT_FILE = path.join(DATA_DIR, 'pet-classification-report.json');

function classifyProduct(product) {
  const result = isPetProduct(product);
  const petType = classifyPetType(product);
  const bucket = classifyProductBucket(product);
  
  return {
    is_pet_product: result.ok,
    pet_type: petType,
    homepage_eligible: result.ok && product.stock > 0 && product.images && product.images.length > 0,
    blocked_reason: result.ok ? null : result.reason,
    pet_score: result.score || 0,
    pet_bucket: bucket,
    classified_at: new Date().toISOString()
  };
}

function processProductsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return null;
  }

  console.log(`Processing ${path.basename(filePath)}...`);
  
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return null;
  }

  const products = data.products || data;
  if (!Array.isArray(products)) {
    console.error('Products is not an array');
    return null;
  }

  const stats = {
    total: products.length,
    pet_products: 0,
    non_pet: 0,
    dogs: 0,
    cats: 0,
    both: 0,
    homepage_eligible: 0,
    blocked_reasons: {}
  };

  const classifiedProducts = products.map(p => {
    const classification = classifyProduct(p);
    
    if (classification.is_pet_product) {
      stats.pet_products++;
      if (classification.pet_type === 'dog') stats.dogs++;
      else if (classification.pet_type === 'cat') stats.cats++;
      else if (classification.pet_type === 'both') stats.both++;
    } else {
      stats.non_pet++;
      const reason = classification.blocked_reason || 'Unknown';
      stats.blocked_reasons[reason] = (stats.blocked_reasons[reason] || 0) + 1;
    }

    if (classification.homepage_eligible) {
      stats.homepage_eligible++;
    }

    return {
      ...p,
      ...classification
    };
  });

  if (data.products) {
    data.products = classifiedProducts;
  } else {
    data = { products: classifiedProducts };
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Saved ${classifiedProducts.length} products to ${path.basename(filePath)}`);

  return stats;
}

function main() {
  console.log('=== Pet Classification Backfill ===\n');

  const reports = {};

  const cjStats = processProductsFile(PRODUCTS_CJ);
  if (cjStats) reports.products_cj = cjStats;

  const v5Stats = processProductsFile(PRODUCTS_V5);
  if (v5Stats) reports.products_v5 = v5Stats;

  const report = {
    timestamp: new Date().toISOString(),
    files: reports
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n=== Summary ===');
  for (const [file, stats] of Object.entries(reports)) {
    console.log(`\n${file}:`);
    console.log(`  Total: ${stats.total}`);
    console.log(`  Pet products: ${stats.pet_products} (${((stats.pet_products/stats.total)*100).toFixed(1)}%)`);
    console.log(`  Non-pet: ${stats.non_pet}`);
    console.log(`  Dogs: ${stats.dogs}, Cats: ${stats.cats}, Both: ${stats.both}`);
    console.log(`  Homepage eligible: ${stats.homepage_eligible}`);
    
    if (Object.keys(stats.blocked_reasons).length > 0) {
      console.log('  Top blocked reasons:');
      const sorted = Object.entries(stats.blocked_reasons).sort((a,b) => b[1] - a[1]).slice(0, 5);
      sorted.forEach(([reason, count]) => {
        console.log(`    - ${reason}: ${count}`);
      });
    }
  }

  console.log(`\nReport saved to: ${REPORT_FILE}`);
}

main();
