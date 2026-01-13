#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/db.json');

const STOCK_IMAGES = {
  'dog-toys': [
    '/cache/images/dog_chew_toy_rope_pe_25765af9.jpg',
    '/cache/images/dog_chew_toy_rope_pe_63326851.jpg',
    '/cache/images/dog_chew_toy_rope_pe_7dd213c2.jpg',
    '/cache/images/dog_chew_toy_rope_pe_c7735450.jpg',
  ],
  'cat-toys': [
    '/cache/images/cat_toy_mouse_feathe_0e202b50.jpg',
    '/cache/images/cat_toy_mouse_feathe_5737804c.jpg',
    '/cache/images/cat_toy_mouse_feathe_759d2d3a.jpg',
    '/cache/images/cat_toy_mouse_feathe_859f875c.jpg',
  ],
  'beds': [
    '/cache/images/pet_bed_cozy_dog_cat_27dbcdfd.jpg',
    '/cache/images/pet_bed_cozy_dog_cat_28c9bb8d.jpg',
    '/cache/images/pet_bed_cozy_dog_cat_2fbcd0ee.jpg',
    '/cache/images/pet_bed_cozy_dog_cat_8c8f4f7e.jpg',
  ],
  'feeding': [
    '/cache/images/pet_food_bowl_feeder_4dec9a3a.jpg',
    '/cache/images/pet_food_bowl_feeder_80c8e659.jpg',
    '/cache/images/pet_food_bowl_feeder_94ce9a9b.jpg',
  ],
  'collars': [
    '/cache/images/dog_collar_leash_har_06598c3e.jpg',
    '/cache/images/dog_collar_leash_har_15dee380.jpg',
  ],
  'grooming': [
    '/cache/images/pet_grooming_brush_c_340cccf5.jpg',
    '/cache/images/pet_grooming_brush_c_4e28c9aa.jpg',
  ],
  'scratchers': [
    '/cache/images/cat_scratching_post__99cb884d.jpg',
    '/cache/images/cat_scratching_post__acd7324e.jpg',
  ],
  'training': [
    '/cache/images/dog_treat_training_s_133c66d7.jpg',
    '/cache/images/dog_treat_training_s_6d4677ad.jpg',
  ]
};

function getRandomStockImage(category) {
  const images = STOCK_IMAGES[category] || STOCK_IMAGES['dog-toys'];
  return images[Math.floor(Math.random() * images.length)];
}

function activateCjProducts() {
  let db = { products: [] };
  
  try {
    if (fs.existsSync(DB_PATH)) {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (err) {
    console.error(`DB read error: ${err.message}`);
    return;
  }
  
  const cjProducts = db.products.filter(p => p.source === 'CJ' && p.active === false);
  console.log(`Found ${cjProducts.length} inactive CJ products`);
  
  let activated = 0;
  
  for (const product of cjProducts) {
    const stockImage = getRandomStockImage(product.category);
    product.image = stockImage;
    product.images = [stockImage];
    product.active = true;
    product.activatedAt = new Date().toISOString();
    activated++;
  }
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  
  console.log(`✅ Activated ${activated} CJ products with stock images`);
  console.log(`📊 Distribution:`);
  for (const category in STOCK_IMAGES) {
    const count = cjProducts.filter(p => p.category === category).length;
    if (count > 0) {
      console.log(`  - ${category}: ${count}`);
    }
  }
}

activateCjProducts();
