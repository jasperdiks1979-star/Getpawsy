"use strict";

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');

const CAT_KEYWORDS = [
  'cat', 'cats', 'kitten', 'kitty', 'feline', 'litter', 'scratching', 'catnip',
  'meow', 'whisker', 'hairball', 'cat tree', 'cat tower', 'cat house',
  'cat bed', 'cat toy', 'cat food', 'cat treat', 'cat collar', 'cat harness'
];

const DOG_KEYWORDS = [
  'dog', 'dogs', 'puppy', 'puppies', 'canine', 'leash', 'bark', 'kennel',
  'fetch', 'chew', 'dog bed', 'dog crate', 'dog house', 'dog toy', 
  'dog food', 'dog treat', 'dog collar', 'dog harness', 'paw', 'snout'
];

const SMALL_PET_KEYWORDS = [
  'rabbit', 'bunny', 'hamster', 'guinea pig', 'ferret', 'chinchilla',
  'bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch',
  'reptile', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko', 'iguana',
  'fish', 'aquarium', 'aquatic', 'betta', 'goldfish', 'tropical fish',
  'gerbil', 'mouse', 'mice', 'rat', 'hedgehog', 'sugar glider',
  'cage', 'terrarium', 'vivarium', 'hutch', 'habitat',
  'small animal', 'small pet', 'rodent'
];

const BOTH_KEYWORDS = [
  'pet carrier', 'pet stroller', 'pet bed', 'pet sofa', 'pet house',
  'pet grooming', 'pet brush', 'pet shampoo', 'pet bowl', 'pet feeder',
  'pet water', 'pet travel', 'pet car', 'pet safety', 'pet gate'
];

function countKeywordMatches(text, keywords) {
  let count = 0;
  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      count++;
    }
  }
  return count;
}

function normalizeCategory(product) {
  const title = (product.title || product.name || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const tags = (product.tags || []).join(' ').toLowerCase();
  const fullText = `${title} ${description} ${tags}`;
  
  const smallPetScore = countKeywordMatches(fullText, SMALL_PET_KEYWORDS);
  if (smallPetScore >= 2) {
    return 'small_pet';
  }
  
  const catScore = countKeywordMatches(fullText, CAT_KEYWORDS);
  const dogScore = countKeywordMatches(fullText, DOG_KEYWORDS);
  const bothScore = countKeywordMatches(fullText, BOTH_KEYWORDS);
  
  if (bothScore >= 2 && Math.abs(catScore - dogScore) <= 1) {
    return 'both';
  }
  
  const titlePrefix = title.split(' ')[0];
  if (titlePrefix === 'dog' && catScore > dogScore + 2) {
    console.log(`  [FIX] Title starts with "Dog" but strong cat signals: ${product.title.slice(0, 50)}...`);
    return 'cat';
  }
  if (titlePrefix === 'cat' && dogScore > catScore + 2) {
    console.log(`  [FIX] Title starts with "Cat" but strong dog signals: ${product.title.slice(0, 50)}...`);
    return 'dog';
  }
  
  if (catScore > dogScore) return 'cat';
  if (dogScore > catScore) return 'dog';
  
  if (product.mainCategorySlug === 'dogs') return 'dog';
  if (product.mainCategorySlug === 'cats') return 'cat';
  
  return 'both';
}

function getMainCategorySlug(petType) {
  switch (petType) {
    case 'dog': return 'dogs';
    case 'cat': return 'cats';
    case 'small_pet': return 'small-pets';
    case 'both': return 'dogs';
    default: return 'dogs';
  }
}

function repairCategories() {
  console.log('='.repeat(60));
  console.log('[Repair Categories] Starting category normalization...');
  console.log('='.repeat(60));
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('FATAL: catalog.json not found at', CATALOG_PATH);
    process.exit(1);
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products || [];
  
  console.log(`[Repair] Processing ${products.length} products...`);
  
  let changedCount = 0;
  const categoryCounts = { dog: 0, cat: 0, small_pet: 0, both: 0 };
  
  for (const product of products) {
    const oldPetType = product.pet_type;
    const newPetType = normalizeCategory(product);
    
    if (oldPetType !== newPetType) {
      console.log(`  [CHANGE] ${product.id}: ${oldPetType} → ${newPetType} | "${(product.title || '').slice(0, 40)}..."`);
      product.pet_type = newPetType;
      product.mainCategorySlug = getMainCategorySlug(newPetType);
      changedCount++;
    }
    
    categoryCounts[newPetType] = (categoryCounts[newPetType] || 0) + 1;
  }
  
  catalog.buildInfo = catalog.buildInfo || {};
  catalog.buildInfo.categoriesRepairedAt = new Date().toISOString();
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  
  console.log('='.repeat(60));
  console.log('[Repair] Complete!');
  console.log(`  Total products: ${products.length}`);
  console.log(`  Changed: ${changedCount}`);
  console.log(`  Dogs: ${categoryCounts.dog}`);
  console.log(`  Cats: ${categoryCounts.cat}`);
  console.log(`  Small Pets: ${categoryCounts.small_pet}`);
  console.log(`  Both: ${categoryCounts.both}`);
  console.log('='.repeat(60));
}

if (require.main === module) {
  repairCategories();
}

module.exports = { normalizeCategory, repairCategories };
