"use strict";

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');
const REPORT_PATH = path.join(__dirname, 'reclassify-report.json');

const SMALL_PET_KEYWORDS = [
  'rabbit', 'bunny', 'hutch', 'hamster', 'guinea pig', 'cavy',
  'bird', 'parrot', 'cockatiel', 'perch', 'aviary',
  'ferret', 'reptile', 'terrarium', 'gecko', 'snake', 'basking', 'heat lamp',
  'aquarium', 'fish tank', 'filter', 'air pump', 'heater',
  'substrate', 'bedding', 'hay rack', 'hay feeder', 'litter scoop',
  'chinchilla', 'gerbil', 'mouse', 'mice', 'rat', 'hedgehog', 'sugar glider',
  'cage', 'vivarium', 'small animal', 'small pet', 'rodent'
];

const CAT_KEYWORDS = [
  'cat', 'kitten', 'feline', 'litter', 'scratching', 'cat tree', 'catnip',
  'clumping', 'kitty', 'meow', 'whisker', 'hairball', 'cat tower', 'cat house',
  'cat bed', 'cat toy', 'cat food', 'cat treat', 'cat collar', 'cat harness'
];

const DOG_KEYWORDS = [
  'dog', 'puppy', 'canine', 'leash', 'collar', 'harness', 'crate', 'kennel',
  'bark', 'fetch', 'chew', 'dog bed', 'dog crate', 'dog house', 'dog toy',
  'dog food', 'dog treat', 'paw', 'snout'
];

const SUBCATEGORY_KEYWORDS = {
  rabbits: ['rabbit', 'bunny', 'hutch', 'hay feeder', 'hay rack'],
  guineaPigs: ['guinea pig', 'cavy'],
  hamsters: ['hamster', 'wheel', 'dwarf hamster'],
  birds: ['bird', 'parrot', 'cockatiel', 'perch', 'aviary', 'feeder'],
  ferrets: ['ferret', 'hammock', 'tube'],
  reptiles: ['reptile', 'terrarium', 'gecko', 'snake', 'heat lamp', 'basking', 'uvb', 'lizard', 'iguana', 'turtle', 'tortoise'],
  fishAquatics: ['aquarium', 'fish tank', 'filter', 'air pump', 'heater', 'aquatic', 'fish', 'betta', 'goldfish'],
  foodTreats: ['pellets', 'treats', 'food', 'nutrition', 'supplement', 'vitamins'],
  cleaningBedding: ['bedding', 'substrate', 'litter', 'odor', 'scoop', 'cleaning'],
  travelCarriers: ['carrier', 'travel', 'portable']
};

function countMatches(text, keywords) {
  let count = 0;
  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      count++;
    }
  }
  return count;
}

function hasMatch(text, keywords) {
  const lowerText = text.toLowerCase();
  return keywords.some(kw => lowerText.includes(kw.toLowerCase()));
}

function determineSmallPetSubcategory(text) {
  const lowerText = text.toLowerCase();
  
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.rabbits)) return 'rabbits';
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.guineaPigs)) return 'guineaPigs';
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.hamsters)) return 'hamsters';
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.birds)) return 'birds';
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.ferrets)) return 'ferrets';
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.reptiles)) return 'reptiles';
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.fishAquatics)) return 'fishAquatics';
  
  if (hasMatch(lowerText, ['hay']) && !hasMatch(lowerText, SUBCATEGORY_KEYWORDS.rabbits)) {
    return 'foodTreats';
  }
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.foodTreats)) return 'foodTreats';
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.cleaningBedding)) return 'cleaningBedding';
  if (hasMatch(lowerText, SUBCATEGORY_KEYWORDS.travelCarriers)) return 'travelCarriers';
  
  return 'cleaningBedding';
}

const DECISIVE_SMALL_PET_KEYWORDS = [
  'rabbit', 'bunny', 'hutch', 'hamster', 'guinea pig', 'cavy',
  'parrot', 'cockatiel', 'aviary', 'ferret', 'reptile', 'terrarium',
  'gecko', 'snake', 'basking', 'heat lamp', 'aquarium', 'fish tank',
  'chinchilla', 'gerbil', 'hedgehog', 'sugar glider', 'vivarium',
  'small animal', 'small pet', 'rodent', 'lizard', 'iguana', 'turtle', 'tortoise'
];

function classifyProduct(product) {
  const title = (product.title || product.name || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const category = Array.isArray(product.categories) 
    ? product.categories.join(' ').toLowerCase() 
    : (product.category || '').toLowerCase();
  const tags = Array.isArray(product.tags) ? product.tags.join(' ').toLowerCase() : '';
  const slug = (product.slug || product.handle || '').toLowerCase();
  
  const fullText = `${title} ${description} ${category} ${tags} ${slug}`;
  
  const hasDecisiveSmallPet = hasMatch(fullText, DECISIVE_SMALL_PET_KEYWORDS);
  const smallPetScore = countMatches(fullText, SMALL_PET_KEYWORDS);
  const catScore = countMatches(fullText, CAT_KEYWORDS);
  const dogScore = countMatches(fullText, DOG_KEYWORDS);
  
  let petType = 'dogs';
  let smallPetsSubcategory = null;
  
  if (hasDecisiveSmallPet || smallPetScore >= 2) {
    petType = 'smallPets';
    smallPetsSubcategory = determineSmallPetSubcategory(fullText);
  } else if (catScore > dogScore + 1) {
    petType = 'cats';
  } else if (dogScore > catScore + 1) {
    petType = 'dogs';
  } else if (catScore > 0 && dogScore > 0) {
    if (title.startsWith('cat') || category.includes('cat')) {
      petType = 'cats';
    } else if (title.startsWith('dog') || category.includes('dog')) {
      petType = 'dogs';
    } else {
      petType = catScore >= dogScore ? 'cats' : 'dogs';
    }
  } else if (catScore > 0) {
    petType = 'cats';
  } else if (dogScore > 0) {
    petType = 'dogs';
  } else {
    const existingPetType = product.pet_type;
    if (existingPetType === 'cat') petType = 'cats';
    else if (existingPetType === 'dog') petType = 'dogs';
    else if (existingPetType === 'small_pet') {
      petType = 'smallPets';
      smallPetsSubcategory = determineSmallPetSubcategory(fullText);
    }
  }
  
  return { petType, smallPetsSubcategory };
}

function getMainCategorySlug(petType) {
  switch (petType) {
    case 'cats': return 'cats';
    case 'smallPets': return 'small-pets';
    default: return 'dogs';
  }
}

function reclassifyProducts() {
  console.log('='.repeat(60));
  console.log('[Reclassify] Starting product reclassification...');
  console.log('='.repeat(60));
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('FATAL: catalog.json not found at', CATALOG_PATH);
    return { error: 'catalog.json not found' };
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products || [];
  
  console.log(`[Reclassify] Processing ${products.length} products...`);
  
  const stats = {
    total: products.length,
    dogs: 0,
    cats: 0,
    smallPets: 0,
    subcategories: {
      rabbits: 0,
      guineaPigs: 0,
      hamsters: 0,
      birds: 0,
      ferrets: 0,
      reptiles: 0,
      fishAquatics: 0,
      foodTreats: 0,
      cleaningBedding: 0,
      travelCarriers: 0
    },
    changed: 0,
    changes: []
  };
  
  for (const product of products) {
    const oldPetType = product.petType || product.pet_type;
    const oldSubcategory = product.smallPetsSubcategory;
    
    const { petType, smallPetsSubcategory } = classifyProduct(product);
    
    product.petType = petType;
    product.pet_type = petType === 'cats' ? 'cat' : petType === 'smallPets' ? 'small_pet' : 'dog';
    product.mainCategorySlug = getMainCategorySlug(petType);
    
    if (petType === 'smallPets') {
      product.smallPetsSubcategory = smallPetsSubcategory;
    } else {
      delete product.smallPetsSubcategory;
    }
    
    if (oldPetType !== petType || oldSubcategory !== smallPetsSubcategory) {
      stats.changed++;
      stats.changes.push({
        id: product.id,
        title: (product.title || '').slice(0, 40),
        from: { petType: oldPetType, subcategory: oldSubcategory },
        to: { petType, subcategory: smallPetsSubcategory }
      });
      console.log(`  [CHANGE] ${product.id}: ${oldPetType} → ${petType}${smallPetsSubcategory ? ` (${smallPetsSubcategory})` : ''}`);
    }
    
    stats[petType]++;
    if (smallPetsSubcategory) {
      stats.subcategories[smallPetsSubcategory]++;
    }
  }
  
  catalog.buildInfo = catalog.buildInfo || {};
  catalog.buildInfo.reclassifiedAt = new Date().toISOString();
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  
  const report = {
    timestamp: new Date().toISOString(),
    stats,
    changes: stats.changes.slice(0, 50)
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  
  console.log('='.repeat(60));
  console.log('[Reclassify] Complete!');
  console.log(`  Total: ${stats.total}`);
  console.log(`  Dogs: ${stats.dogs}`);
  console.log(`  Cats: ${stats.cats}`);
  console.log(`  Small Pets: ${stats.smallPets}`);
  if (stats.smallPets > 0) {
    console.log('  Subcategories:');
    for (const [sub, count] of Object.entries(stats.subcategories)) {
      if (count > 0) console.log(`    ${sub}: ${count}`);
    }
  }
  console.log(`  Changed: ${stats.changed}`);
  console.log(`  Report saved to: ${REPORT_PATH}`);
  console.log('='.repeat(60));
  
  return stats;
}

if (require.main === module) {
  reclassifyProducts();
}

module.exports = { reclassifyProducts, classifyProduct };
