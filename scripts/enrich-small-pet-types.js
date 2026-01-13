#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');

const ANIMAL_KEYWORDS = {
  rabbits: ['rabbit', 'bunny', 'bunnies', 'hutch', 'rabbit cage', 'rabbit house'],
  guinea_pigs: ['guinea pig', 'guinea-pig', 'cavy', 'cavies'],
  hamsters: ['hamster', 'hamster wheel', 'hamster cage', 'hamster ball'],
  birds: ['bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 'aviary', 'bird cage'],
  reptiles: ['reptile', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko', 'iguana', 'terrarium', 'vivarium'],
  fish: ['fish', 'aquarium', 'aquatic', 'betta', 'goldfish', 'tropical fish', 'fish tank'],
  chinchillas: ['chinchilla'],
  ferrets: ['ferret'],
  hedgehogs: ['hedgehog'],
  mice_rats: ['mouse', 'mice', 'rat', 'rats', 'rodent']
};

function inferAnimalType(product) {
  const text = [
    product.title || '',
    product.description || '',
    ...(product.tags || [])
  ].join(' ').toLowerCase();

  for (const [animalType, keywords] of Object.entries(ANIMAL_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        return animalType;
      }
    }
  }
  return 'other';
}

function main() {
  console.log('Loading catalog...');
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  const products = catalog.products || [];
  
  let updated = 0;
  const stats = {};

  for (const p of products) {
    const petType = (p.petType || p.pet_type || '').toLowerCase();
    if (petType === 'small_pet' || petType === 'smallpets') {
      const animalType = inferAnimalType(p);
      p.smallPetType = animalType;
      stats[animalType] = (stats[animalType] || 0) + 1;
      updated++;
    }
  }

  console.log(`\nUpdated ${updated} small pet products with smallPetType field:`);
  Object.entries(stats).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k}: ${v}`);
  });

  catalog.products = products;
  catalog.lastEnriched = new Date().toISOString();
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log('\nCatalog saved successfully!');
}

main();
