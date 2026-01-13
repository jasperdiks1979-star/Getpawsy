#!/usr/bin/env node
/**
 * Catalog Canonical Export + Pet Validation Pipeline
 * Generates clean CSV with 16 columns (no JSON, no arrays)
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'data');

const BLACKLIST = [
  'wine', 'whiskey', 'alcohol', 'beer', 'vodka', 'liquor',
  'glass', 'cup', 'mug', 'jewelry', 'earring', 'necklace',
  'bracelet', 'ring', 'pendant',
  'makeup', 'lipstick', 'mascara', 'eyeshadow', 'foundation',
  'pajamas', 'clothing', 'sweater', 'hoodie', 'dress', 'skirt',
  'plush doll', 'christmas tree', 'decoration',
  'electronics', 'meter', 'clamp', 'printer', 'tool', 'wrench',
  'phone case', 'iphone', 'samsung', 'laptop', 'computer',
  'car mount', 'dashboard', 'fishing', 'hunting',
  'women socks', 'adult clothing', 'baby clothing',
  '3d printer', 'led lamp', 'ceiling light'
];

const WHITELIST = [
  'dog', 'cat', 'puppy', 'kitten', 'pet', 'pup', 'kitty', 'canine', 'feline',
  'collar', 'leash', 'harness', 'lead',
  'crate', 'kennel', 'cage', 'hutch', 'terrarium', 'aquarium',
  'litter', 'litter box', 'feeder', 'bowl', 'fountain',
  'chew toy', 'squeaky', 'training', 'grooming', 'brush', 'nail clipper',
  'scratching', 'cat tree', 'climbing',
  'pet bed', 'dog bed', 'cat bed',
  'carrier', 'backpack pet', 'stroller pet',
  'rabbit', 'hamster', 'guinea pig', 'bird', 'parrot', 'fish', 'reptile', 'turtle', 'ferret',
  'small animal', 'small pet'
];

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
  }
  return str;
}

function getFirstImage(product) {
  if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    const img = product.images[0];
    if (typeof img === 'string') return img;
    if (img && img.url) return img.url;
    if (img && img.src) return img.src;
  }
  if (product.image) return product.image;
  if (product.imageUrl) return product.imageUrl;
  return '';
}

function getTags(product) {
  if (!product.tags) return '';
  if (Array.isArray(product.tags)) {
    return product.tags.join('|');
  }
  if (typeof product.tags === 'string') {
    return product.tags.replace(/,/g, '|');
  }
  return '';
}

function normalizePetType(petType, title = '', category = '') {
  const text = `${petType || ''} ${title} ${category}`.toLowerCase();
  if (text.includes('dog') || text.includes('puppy') || text.includes('canine') || text.includes('pup')) {
    return 'dog';
  }
  if (text.includes('cat') || text.includes('kitten') || text.includes('feline') || text.includes('kitty')) {
    return 'cat';
  }
  if (text.includes('rabbit') || text.includes('hamster') || text.includes('guinea') || 
      text.includes('bird') || text.includes('fish') || text.includes('reptile') ||
      text.includes('small pet') || text.includes('small animal')) {
    return 'small_pets';
  }
  return 'dog';
}

function normalizeCategory(petType) {
  switch (petType) {
    case 'dog': return 'Dogs';
    case 'cat': return 'Cats';
    case 'small_pets': return 'Small Pets';
    default: return 'Dogs';
  }
}

function checkBlacklist(text) {
  const lower = text.toLowerCase();
  for (const term of BLACKLIST) {
    if (lower.includes(term.toLowerCase())) {
      return term;
    }
  }
  return null;
}

function checkWhitelist(text) {
  const lower = text.toLowerCase();
  for (const term of WHITELIST) {
    if (lower.includes(term.toLowerCase())) {
      return term;
    }
  }
  return null;
}

function validatePetProduct(product) {
  const searchText = `${product.title || ''} ${getTags(product)} ${product.description || ''}`;
  const blacklistHit = checkBlacklist(searchText);
  const whitelistHit = checkWhitelist(searchText);
  
  if (blacklistHit && !whitelistHit) {
    return { isPet: false, reason: 'blacklist-no-whitelist', blacklistHit, whitelistHit: null };
  }
  if (blacklistHit && whitelistHit) {
    const titleLower = (product.title || '').toLowerCase();
    if (/\b(women|adult|human|girl|boy|child|infant|baby)\b/i.test(titleLower) && 
        !/\bpet\b|\bdog\b|\bcat\b|\bpuppy\b|\bkitten\b/i.test(titleLower)) {
      return { isPet: false, reason: 'human-product', blacklistHit, whitelistHit };
    }
    return { isPet: true, reason: 'whitelist-override', blacklistHit, whitelistHit };
  }
  if (whitelistHit) {
    return { isPet: true, reason: 'whitelist', blacklistHit: null, whitelistHit };
  }
  return { isPet: true, reason: 'default-allow', blacklistHit: null, whitelistHit: null };
}

function run() {
  console.log('[Catalog Export] Starting canonical export pipeline...');
  
  let catalog;
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    catalog = data.products || data || [];
  } catch (err) {
    console.error('[Catalog Export] Failed to load catalog:', err.message);
    process.exit(1);
  }
  
  console.log(`[Catalog Export] Loaded ${catalog.length} products from catalog.json`);
  
  const HEADERS = [
    'product_id', 'slug', 'title', 'category', 'sub_category', 'pet_type',
    'is_pet_product', 'active', 'tags', 'cj_product_id', 'cj_spu',
    'cost', 'price', 'currency', 'image_url', 'updated_at'
  ];
  
  const validProducts = [];
  const excludedProducts = [];
  const allProducts = [];
  
  for (const p of catalog) {
    const validation = validatePetProduct(p);
    const petType = normalizePetType(p.pet_type, p.title, p.category);
    const category = normalizeCategory(petType);
    const subCategory = p.sub_category || p.subCategory || p.category_secondary || 'general';
    
    const row = {
      product_id: p.product_id || p.id || '',
      slug: p.slug || p.handle || '',
      title: (p.title || '').replace(/[\r\n]+/g, ' ').substring(0, 500),
      category: category,
      sub_category: subCategory,
      pet_type: petType,
      is_pet_product: validation.isPet,
      active: validation.isPet && (p.active !== false),
      tags: getTags(p),
      cj_product_id: p.cj_product_id || p.cjProductId || '',
      cj_spu: p.cj_spu || p.cjSpu || '',
      cost: parseFloat(p.cost || 0).toFixed(2),
      price: parseFloat(p.price || 0).toFixed(2),
      currency: 'USD',
      image_url: getFirstImage(p),
      updated_at: p.updated_at || new Date().toISOString()
    };
    
    allProducts.push(row);
    
    if (validation.isPet) {
      row.is_pet_product = true;
      row.active = true;
      validProducts.push(row);
    } else {
      row.is_pet_product = false;
      row.active = false;
      excludedProducts.push({
        product_id: row.product_id,
        title: row.title,
        reason: validation.reason,
        matched_blacklist: validation.blacklistHit || '',
        matched_whitelist: validation.whitelistHit || '',
        action_taken: 'excluded'
      });
    }
  }
  
  const canonicalCSV = [
    HEADERS.join(','),
    ...allProducts.map(row => HEADERS.map(h => escapeCSV(row[h])).join(','))
  ].join('\n');
  
  const importCSV = [
    HEADERS.join(','),
    ...validProducts.map(row => HEADERS.map(h => escapeCSV(row[h])).join(','))
  ].join('\n');
  
  const EXCLUDED_HEADERS = ['product_id', 'title', 'reason', 'matched_blacklist', 'matched_whitelist', 'action_taken'];
  const excludedCSV = [
    EXCLUDED_HEADERS.join(','),
    ...excludedProducts.map(row => EXCLUDED_HEADERS.map(h => escapeCSV(row[h])).join(','))
  ].join('\n');
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'getpawsy_catalog_EXPORT_CANONICAL.csv'), canonicalCSV);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'getpawsy_catalog_IMPORT_READY.csv'), importCSV);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'getpawsy_catalog_EXCLUDED_LOG.csv'), excludedCSV);
  
  const stats = {
    total: catalog.length,
    valid: validProducts.length,
    excluded: excludedProducts.length,
    dogs: validProducts.filter(p => p.pet_type === 'dog').length,
    cats: validProducts.filter(p => p.pet_type === 'cat').length,
    smallPets: validProducts.filter(p => p.pet_type === 'small_pets').length
  };
  
  console.log('\n========================================');
  console.log('CATALOG EXPORT COMPLETE');
  console.log('========================================');
  console.log(`Total products:     ${stats.total}`);
  console.log(`Valid pet products: ${stats.valid}`);
  console.log(`Excluded:           ${stats.excluded}`);
  console.log('----------------------------------------');
  console.log(`Dogs:       ${stats.dogs}`);
  console.log(`Cats:       ${stats.cats}`);
  console.log(`Small Pets: ${stats.smallPets}`);
  console.log('----------------------------------------');
  console.log('Output files:');
  console.log('  - getpawsy_catalog_EXPORT_CANONICAL.csv');
  console.log('  - getpawsy_catalog_IMPORT_READY.csv');
  console.log('  - getpawsy_catalog_EXCLUDED_LOG.csv');
  console.log('========================================\n');
  
  return stats;
}

run();
