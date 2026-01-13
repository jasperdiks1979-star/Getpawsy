#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

console.log('=== Build Product Gallery from Variant Images ===\n');

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const products = db.products;

let updated = 0;
let totalGalleryImages = 0;

products.forEach(product => {
  if (product.rejected) return;
  
  const variants = product.variants || [];
  if (variants.length === 0) return;
  
  const uniqueImages = new Set();
  
  if (product.image) {
    uniqueImages.add(product.image);
  }
  
  variants.forEach(v => {
    if (v.image && typeof v.image === 'string') {
      if (v.image.startsWith('/') || v.image.startsWith('http://') || v.image.startsWith('https://')) {
        uniqueImages.add(v.image);
      }
    }
  });
  
  const galleryImages = Array.from(uniqueImages);
  
  if (galleryImages.length > 1 || (galleryImages.length === 1 && (!product.images || product.images.length === 0))) {
    const oldCount = product.images?.length || 0;
    product.images = galleryImages;
    
    if (!product.image && galleryImages.length > 0) {
      product.image = galleryImages[0];
    }
    
    if (galleryImages.length > oldCount) {
      updated++;
      totalGalleryImages += galleryImages.length;
      
      if (updated <= 10) {
        console.log(`  ${product.id}: ${oldCount} -> ${galleryImages.length} images`);
      }
    }
  }
});

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log(`\n=== Summary ===`);
console.log(`Products updated: ${updated}`);
console.log(`Total gallery images: ${totalGalleryImages}`);

const withMultiImages = products.filter(p => p.images && p.images.length > 1).length;
console.log(`Products with >1 image now: ${withMultiImages}`);
