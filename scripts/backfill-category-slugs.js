#!/usr/bin/env node
/**
 * Backfill mainCategorySlug and subcategorySlug for existing products
 * Run: node scripts/backfill-category-slugs.js
 */

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

const { classifyProduct } = require('../src/categoryClassifier');

function run() {
  console.log('=== Backfill Category Slugs ===\n');
  
  if (!fs.existsSync(PRODUCTS_FILE)) {
    console.log('No products.json found');
    return;
  }
  
  const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
  const products = data.products || data;
  console.log(`Found ${products.length} products\n`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const product of products) {
    if (product.mainCategorySlug && product.subcategorySlug) {
      skipped++;
      continue;
    }
    
    const classification = classifyProduct(product);
    
    product.mainCategorySlug = classification.categorySlug || product.petType || 'dogs';
    product.subcategorySlug = classification.subcategorySlug || 'accessories';
    
    updated++;
  }
  
  if (data.products) {
    data.products = products;
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));
  } else {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
  }
  
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already had slugs): ${skipped}`);
  console.log('\nDone!');
}

run();
