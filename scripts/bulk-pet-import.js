#!/usr/bin/env node
/**
 * Bulk Pet Product Import Script
 * Imports pet products from CJ Dropshipping with strict pet-only filters
 */

const path = require('path');
const cjUrlImport = require('../src/cjUrlImport.js');
const { log } = require('../src/logger.js');

const PET_KEYWORDS = {
  dog: [
    'dog toy squeaky', 'dog toy plush', 'dog toy rope', 'dog toy ball',
    'dog bed', 'dog blanket', 'dog cushion',
    'dog leash', 'dog collar', 'dog harness',
    'dog bowl', 'dog feeder', 'dog water fountain',
    'dog grooming brush', 'dog nail clipper',
    'dog carrier', 'dog crate', 'dog car seat',
    'puppy toy', 'puppy training pad'
  ],
  cat: [
    'cat toy mouse', 'cat toy feather', 'cat toy ball', 'cat toy interactive',
    'cat bed', 'cat cave', 'cat hammock',
    'cat scratcher', 'cat scratching post', 'cat tree tower',
    'cat litter box', 'cat litter mat', 'cat litter scoop',
    'cat bowl', 'cat feeder', 'cat water fountain',
    'cat grooming brush', 'cat nail clipper',
    'cat carrier', 'kitten toy'
  ],
  both: [
    'pet bed', 'pet bowl', 'pet carrier', 'pet grooming', 'pet toy'
  ]
};

const TARGET_COUNTS = {
  dog: 130,
  cat: 100,
  both: 20
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchAndCollect(type, keywords, maxCount) {
  const products = [];
  const seenPids = new Set();
  
  console.log(`\n--- Searching for ${type} products (target: ${maxCount}) ---`);
  
  for (const keyword of keywords) {
    if (products.length >= maxCount) break;
    
    try {
      console.log(`Searching: "${keyword}"...`);
      const result = await cjUrlImport.searchCatalog({
        keyword,
        petOnly: true,
        requireImages: true,
        pageNum: 1,
        pageSize: Math.min(50, (maxCount - products.length) * 2)
      });
      
      for (const p of result.products || []) {
        if (products.length >= maxCount) break;
        if (seenPids.has(p.pid)) continue;
        
        const title = (p.title || p.productNameEn || '').toLowerCase();
        
        const NON_PET_KEYWORDS = ['human', 'baby clothing', 'phone case', 'iphone', 'android', 'laptop', 'tablet', 'car accessory', 'solar power', 'earring', 'necklace jewelry', 'bracelet', 'makeup', 'cosmetic'];
        const hasNonPetKeyword = NON_PET_KEYWORDS.some(k => title.includes(k));
        if (hasNonPetKeyword) continue;
        
        seenPids.add(p.pid);
        products.push({
          ...p,
          petType: type,
          searchKeyword: keyword
        });
      }
      
      console.log(`  Found ${result.products?.length || 0} results, collected ${products.length}/${maxCount}`);
      await delay(300);
      
    } catch (err) {
      console.error(`  Error searching "${keyword}":`, err.message);
    }
  }
  
  return products;
}

async function main() {
  console.log('='.repeat(60));
  console.log('GetPawsy Bulk Pet Product Import');
  console.log('='.repeat(60));
  
  const allProducts = [];
  
  for (const [type, keywords] of Object.entries(PET_KEYWORDS)) {
    const products = await searchAndCollect(type, keywords, TARGET_COUNTS[type]);
    allProducts.push(...products);
    console.log(`Collected ${products.length} ${type} products`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total products collected: ${allProducts.length}`);
  console.log(`Dog: ${allProducts.filter(p => p.petType === 'dog').length}`);
  console.log(`Cat: ${allProducts.filter(p => p.petType === 'cat').length}`);
  console.log(`Both: ${allProducts.filter(p => p.petType === 'both').length}`);
  console.log('='.repeat(60));
  
  if (process.argv.includes('--import')) {
    console.log('\nStarting import...');
    const db = require('../src/db.js');
    
    let imported = 0, skipped = 0, failed = 0;
    
    for (const product of allProducts) {
      try {
        const result = await cjUrlImport.importProduct(product.pid, db, {
          overwrite: false,
          requireImages: true,
          rejectNonPet: true,
          markFeatured: false,
          categoryPin: 'AUTO',
          subcatPin: 'AUTO'
        });
        
        if (result.ok) {
          imported++;
          console.log(`✓ Imported: ${result.product?.title?.substring(0, 50)}`);
        } else if (result.skipped) {
          skipped++;
        } else {
          failed++;
          console.log(`✗ Failed: ${product.pid} - ${result.error}`);
        }
        
        await delay(200);
      } catch (err) {
        failed++;
        console.log(`✗ Error: ${product.pid} - ${err.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Import complete!');
    console.log(`Imported: ${imported}, Skipped: ${skipped}, Failed: ${failed}`);
    console.log('='.repeat(60));
  } else {
    console.log('\nDry run complete. Add --import flag to actually import products.');
    console.log('\nSample products:');
    allProducts.slice(0, 5).forEach(p => {
      console.log(`  - [${p.petType}] ${p.title?.substring(0, 50)} (${p.pid})`);
    });
  }
}

main().catch(console.error);
