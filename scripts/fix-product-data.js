#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('=== Product Data Fix Script ===\n');

const NEEDS_CONFIG = [
  {
    id: "sleep-comfort",
    keywords: ["bed", "cushion", "blanket", "pillow", "mat", "cave", "orthopedic", "donut", "calming", "nest", "warm", "cozy", "sleep"],
    bucket: "beds"
  },
  {
    id: "play-energy",
    keywords: ["toy", "ball", "rope", "squeaky", "fetch", "interactive", "teaser", "wand", "mouse", "laser", "play", "game", "puzzle", "chew"],
    bucket: "toys"
  },
  {
    id: "feeding",
    keywords: ["bowl", "feeder", "slow feeder", "fountain", "dish", "food", "water", "treat", "snack"],
    bucket: "feeding"
  },
  {
    id: "grooming",
    keywords: ["brush", "groom", "grooming", "deshedding", "shampoo", "clipper", "nail", "fur", "comb", "trim"],
    bucket: "grooming"
  },
  {
    id: "health-wellness",
    keywords: ["supplement", "vitamin", "probiotic", "calming", "dental", "flea", "tick", "health", "medicine"],
    bucket: "health"
  },
  {
    id: "accessories",
    keywords: ["collar", "leash", "harness", "carrier", "crate", "tag", "bag", "travel", "costume", "clothes", "sweater", "jacket"],
    bucket: "accessories"
  }
];

const DOG_KEYWORDS = ["dog", "puppy", "canine", "pup", "hound", "bark"];
const CAT_KEYWORDS = ["cat", "kitten", "feline", "kitty", "meow"];
const BOTH_KEYWORDS = ["pet", "animal", "small animal"];

function determinePetType(product) {
  const text = `${product.title || ''} ${product.description || ''} ${product.tags?.join(' ') || ''} ${product.bucket || ''}`.toLowerCase();
  
  const hasDog = DOG_KEYWORDS.some(k => text.includes(k));
  const hasCat = CAT_KEYWORDS.some(k => text.includes(k));
  
  if (hasDog && hasCat) return 'both';
  if (hasDog) return 'dog';
  if (hasCat) return 'cat';
  return 'both';
}

function determineNeeds(product) {
  const text = `${product.title || ''} ${product.description || ''} ${product.tags?.join(' ') || ''}`.toLowerCase();
  const needs = [];
  
  for (const need of NEEDS_CONFIG) {
    if (product.bucket === need.bucket || need.keywords.some(k => text.includes(k))) {
      needs.push(need.id);
    }
  }
  
  if (needs.length === 0 && product.bucket) {
    const bucketMap = {
      'beds': 'sleep-comfort',
      'toys': 'play-energy',
      'feeding': 'feeding',
      'grooming': 'grooming',
      'health': 'health-wellness',
      'accessories': 'accessories'
    };
    if (bucketMap[product.bucket]) {
      needs.push(bucketMap[product.bucket]);
    }
  }
  
  return [...new Set(needs)];
}

let petTypeFixed = 0;
let needsFixed = 0;
let collectionsFixed = 0;

const activeProducts = db.products.filter(p => !p.rejected && p.active !== false);
console.log(`Processing ${activeProducts.length} active products...\n`);

for (const product of activeProducts) {
  const idx = db.products.findIndex(p => p.id === product.id);
  if (idx === -1) continue;
  
  if (!product.petType) {
    db.products[idx].petType = determinePetType(product);
    petTypeFixed++;
  }
  
  const needs = determineNeeds(product);
  if (needs.length > 0 && (!product.needs || product.needs.length === 0)) {
    db.products[idx].needs = needs;
    needsFixed++;
  }
  
  if (!product.collections || product.collections.length === 0) {
    const collections = [];
    if (db.products[idx].petType === 'dog') collections.push('Dogs');
    if (db.products[idx].petType === 'cat') collections.push('Cats');
    if (db.products[idx].petType === 'both') {
      collections.push('Dogs', 'Cats');
    }
    if (db.products[idx].needs && db.products[idx].needs.length > 0) {
      db.products[idx].needs.forEach(n => {
        const needNames = {
          'sleep-comfort': 'Sleep & Comfort',
          'play-energy': 'Play & Energy',
          'feeding': 'Feeding',
          'grooming': 'Grooming',
          'health-wellness': 'Health & Wellness',
          'accessories': 'Accessories'
        };
        if (needNames[n]) collections.push(needNames[n]);
      });
    }
    if (collections.length > 0) {
      db.products[idx].collections = [...new Set(collections)];
      collectionsFixed++;
    }
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

console.log('=== Results ===');
console.log(`petType assigned: ${petTypeFixed}`);
console.log(`needs assigned: ${needsFixed}`);
console.log(`collections assigned: ${collectionsFixed}`);

const petTypeCounts = { dog: 0, cat: 0, both: 0, undefined: 0 };
const needsCounts = {};
const collectionsCounts = {};

activeProducts.forEach(p => {
  const idx = db.products.findIndex(x => x.id === p.id);
  const updated = db.products[idx];
  
  petTypeCounts[updated.petType || 'undefined']++;
  
  (updated.needs || []).forEach(n => {
    needsCounts[n] = (needsCounts[n] || 0) + 1;
  });
  
  (updated.collections || []).forEach(c => {
    collectionsCounts[c] = (collectionsCounts[c] || 0) + 1;
  });
});

console.log('\n=== Pet Type Distribution ===');
console.log(petTypeCounts);

console.log('\n=== Needs Distribution ===');
console.log(needsCounts);

console.log('\n=== Collections Distribution ===');
console.log(collectionsCounts);

console.log('\n✅ Product data fixed successfully!');
