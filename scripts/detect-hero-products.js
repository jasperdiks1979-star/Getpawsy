#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, '../data/products_cj.json');
const HERO_OUTPUT = path.join(__dirname, '../data/hero-products.json');

const HERO_DEFINITIONS = [
  {
    name: 'Dog Car Barrier',
    keywords: ['car barrier', 'dog car', 'vehicle barrier', 'pet car barrier', 'car divider'],
    petType: 'dog',
    category: 'bestSellers'
  },
  {
    name: 'Foldable Dog Ramp',
    keywords: ['dog ramp', 'pet ramp', 'foldable ramp', 'folding ramp', 'car ramp'],
    petType: 'dog',
    category: 'bestSellers'
  },
  {
    name: 'Interactive Dog Puzzle Toy',
    keywords: ['dog puzzle', 'interactive dog toy', 'dog treat toy', 'treat dispenser dog', 'puzzle feeder dog'],
    petType: 'dog',
    category: 'bestSellers'
  },
  {
    name: 'Cat Water Fountain',
    keywords: ['cat water', 'pet fountain', 'water dispenser', 'drinking fountain', 'cat fountain'],
    petType: 'cat',
    category: 'bestSellers'
  },
  {
    name: 'Interactive Cat Toy',
    keywords: ['interactive cat', 'cat toy', 'self play cat', 'electric cat toy', 'automatic cat toy'],
    petType: 'cat',
    category: 'bestSellers'
  }
];

function loadProducts() {
  const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
  return data.products || [];
}

function matchScore(product, hero) {
  const title = (product.title || product.name || '').toLowerCase();
  const handle = (product.handle || product.slug || '').toLowerCase();
  const tags = (product.tags || []).join(' ').toLowerCase();
  const category = (product.category || product.mainCategorySlug || '').toLowerCase();
  const searchText = `${title} ${handle} ${tags} ${category}`;
  
  let score = 0;
  let matchedKeywords = [];
  
  for (const keyword of hero.keywords) {
    if (searchText.includes(keyword.toLowerCase())) {
      score += 10;
      matchedKeywords.push(keyword);
    }
  }
  
  const petType = (product.pet_type || product.petType || '').toLowerCase();
  if (petType === hero.petType || petType === 'both') {
    score += 5;
  }
  
  if (product.is_pet_product === true || product.petApproved === true) {
    score += 3;
  }
  
  if (product.images && product.images.length > 3) {
    score += 2;
  }
  
  if (product.stock > 0) {
    score += 1;
  }
  
  return { score, matchedKeywords };
}

function findBestMatch(products, hero) {
  let candidates = [];
  
  for (const product of products) {
    const { score, matchedKeywords } = matchScore(product, hero);
    if (score > 0) {
      candidates.push({
        product,
        score,
        matchedKeywords
      });
    }
  }
  
  candidates.sort((a, b) => b.score - a.score);
  
  if (candidates.length === 0) {
    return null;
  }
  
  return candidates[0];
}

function getProductIdentifier(product) {
  return product.handle || product.slug || product.id;
}

function main() {
  console.log('=== AUTO-DETECT HERO PRODUCTS ===\n');
  
  const products = loadProducts();
  console.log(`Loaded ${products.length} products from database\n`);
  
  const results = [];
  const heroProducts = {
    bestSellers: [],
    topPicksDogs: [],
    topPicksCats: [],
    trendingNow: [],
    pinnedFirst: {},
    _meta: {
      version: '2.0',
      autoDetected: true,
      generatedAt: new Date().toISOString()
    }
  };
  
  for (const hero of HERO_DEFINITIONS) {
    const match = findBestMatch(products, hero);
    
    if (match) {
      const id = getProductIdentifier(match.product);
      const title = match.product.title || match.product.name;
      
      console.log(`✅ ${hero.name}`);
      console.log(`   Title: ${title.slice(0, 60)}`);
      console.log(`   ID/Handle: ${id}`);
      console.log(`   Score: ${match.score} (matched: ${match.matchedKeywords.join(', ')})`);
      console.log('');
      
      results.push({
        hero: hero.name,
        found: true,
        productId: id,
        productTitle: title,
        score: match.score
      });
      
      heroProducts.bestSellers.push(id);
      
      if (hero.petType === 'dog') {
        heroProducts.topPicksDogs.push(id);
      } else if (hero.petType === 'cat') {
        heroProducts.topPicksCats.push(id);
      }
      
      if (hero.name === 'Dog Car Barrier') {
        heroProducts.pinnedFirst.bestSellers = id;
      }
    } else {
      console.log(`❌ ${hero.name} - NOT FOUND`);
      console.log(`   Searched for: ${hero.keywords.join(', ')}`);
      console.log('');
      
      results.push({
        hero: hero.name,
        found: false,
        searchedKeywords: hero.keywords
      });
    }
  }
  
  heroProducts.trendingNow = [
    ...heroProducts.topPicksDogs.slice(0, 2),
    ...heroProducts.topPicksCats.slice(0, 2)
  ].filter(Boolean);
  
  fs.writeFileSync(HERO_OUTPUT, JSON.stringify(heroProducts, null, 2));
  console.log(`\n✅ Written to: ${HERO_OUTPUT}`);
  
  console.log('\n=== HERO PRODUCTS MAPPING ===');
  console.log(JSON.stringify(heroProducts, null, 2));
  
  const foundCount = results.filter(r => r.found).length;
  console.log(`\n=== SUMMARY ===`);
  console.log(`Found: ${foundCount}/${HERO_DEFINITIONS.length} hero products`);
  
  if (foundCount < HERO_DEFINITIONS.length) {
    console.log('\n⚠️  Missing hero products - check search keywords or product catalog');
  }
  
  return results;
}

main();
