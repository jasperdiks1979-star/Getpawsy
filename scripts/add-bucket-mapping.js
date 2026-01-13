#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

console.log('=== Add Bucket Mapping to Products ===\n');

const CAT_TO_BUCKET = {
  'beds': 'beds',
  'cat-toys': 'toys',
  'dog-toys': 'toys',
  'grooming': 'grooming',
  'feeding': 'feeding',
  'collars': 'collars',
  'travel': 'travel',
  'scratchers': 'scratchers',
  'supplies': 'supplies'
};

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
let updated = 0;

db.products.forEach(product => {
  if (product.rejected) return;
  
  const category = product.category;
  if (category && CAT_TO_BUCKET[category]) {
    product.bucket = CAT_TO_BUCKET[category];
    updated++;
  }
});

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log(`Updated ${updated} products with bucket field`);

const buckets = {};
db.products.filter(p => !p.rejected).forEach(p => { 
  buckets[p.bucket || 'none'] = (buckets[p.bucket || 'none'] || 0) + 1; 
});
console.log('\nBucket distribution:');
Object.entries(buckets).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log('  ' + k + ':', v));
