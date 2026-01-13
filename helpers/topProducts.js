const path = require('path');
const fs = require('fs');
const { filterPetOnly, filterForDogs, filterForCats } = require('../src/petClassifier');
const { isPetProduct, assertPetOnly } = require('../src/domain/isPetProduct');
const { isPetEligible, getPetProducts, assertHomepagePetOnly } = require('../src/strictPetProducts');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function loadProducts() {
  const PRODUCTS_CJ = path.join(__dirname, '..', 'data', 'products_cj.json');
  
  if (!fs.existsSync(PRODUCTS_CJ)) {
    throw new Error('FATAL: products_cj.json not found - API-only mode requires this file');
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(PRODUCTS_CJ, 'utf-8'));
    const products = data.products || data;
    if (!Array.isArray(products) || products.length === 0) {
      throw new Error('FATAL: products_cj.json is empty - no products available');
    }
    return products;
  } catch (e) {
    if (e.message.startsWith('FATAL:')) throw e;
    throw new Error(`FATAL: Failed to load products_cj.json: ${e.message}`);
  }
}

function filterWithImages(products) {
  return products.filter(p => p && p.images && p.images.length > 0);
}

function filterHomepageEligible(products) {
  return filterPetOnly(filterWithImages(products)).filter(p => {
    // STRICT: Only show products that pass ALL eligibility checks
    if (p.homepage_eligible === false) return false;
    if (p.is_pet_product === false) return false;
    if (p.blocked_reason) return false;
    if (p.stock !== undefined && p.stock <= 0) return false;
    
    // STRICT: Must have CJ product ID (real product from CJ Dropshipping)
    const hasCjId = p.cjProductId || p.cjPid || p.cj_pid || 
                   (p.id && (p.id.startsWith('cj-') || /^\d{15,}$/.test(p.id)));
    if (!hasCjId) return false;
    
    return true;
  });
}

function sortByRatingAndPrice(a, b) {
  const ra = Number(a.rating || 0);
  const rb = Number(b.rating || 0);
  if (rb !== ra) return rb - ra;
  const pa = Number(a.price || 0);
  const pb = Number(b.price || 0);
  return pa - pb;
}

function sortByPopularity(a, b) {
  const scoreA = Number(a.popularity_score || 0);
  const scoreB = Number(b.popularity_score || 0);
  if (scoreB !== scoreA) return scoreB - scoreA;
  return sortByRatingAndPrice(a, b);
}

function getTopProducts(limit = 12) {
  const products = filterHomepageEligible(loadProducts());
  return products.sort(sortByRatingAndPrice).slice(0, limit);
}

function getRandomHighRated(limit = 12, minRating = 4.5) {
  const products = filterHomepageEligible(loadProducts());
  const filtered = products.filter(p => Number(p.rating || 0) >= minRating);
  
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }
  
  return filtered.slice(0, limit);
}

function getMixedHomepageProducts(limit = 12, minRating = 4.3) {
  const products = filterHomepageEligible(loadProducts());
  const sorted = products.sort(sortByRatingAndPrice);
  const half = Math.floor(limit / 2);
  
  const bestsellers = sorted.slice(0, half);
  const candidates = sorted.filter(
    (p, idx) => idx >= half && Number(p.rating || 0) >= minRating
  );
  
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  
  const trendings = candidates.slice(0, limit - bestsellers.length);
  return [...bestsellers, ...trendings];
}

function getBestSellers(limit = 12) {
  const { dogs, cats } = getPetProducts(loadProducts());
  const allPetProducts = [...dogs, ...cats]
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  
  // First try explicit best sellers
  let filtered = filterWithImages(allPetProducts)
    .filter(p => p.is_best_seller === true);
  
  // If none, use highest-rated pet products
  if (filtered.length === 0) {
    filtered = filterWithImages(allPetProducts);
    console.log(`[topProducts] No explicit best sellers, using top ${Math.min(filtered.length, limit)} by popularity`);
  }
  
  const result = filtered.sort(sortByPopularity).slice(0, limit);
  return assertHomepagePetOnly(result, 'bestSellers');
}

function getTopPicksForDogs(limit = 12) {
  const { dogs } = getPetProducts(loadProducts());
  const filtered = filterWithImages(dogs);
  const result = filtered.sort(sortByPopularity).slice(0, limit);
  return assertHomepagePetOnly(result, 'topPicksForDogs');
}

function getTopPicksForCats(limit = 12) {
  const { cats } = getPetProducts(loadProducts());
  const filtered = filterWithImages(cats);
  const result = filtered.sort(sortByPopularity).slice(0, limit);
  return assertHomepagePetOnly(result, 'topPicksForCats');
}

function getTopPicksForSmallPets(limit = 12) {
  const products = loadProducts();
  const { getProductsByPetType } = require('./productClassifier');
  const smallPets = getProductsByPetType(products, 'small-pet');
  const filtered = filterWithImages(smallPets);
  const result = filtered.sort(sortByPopularity).slice(0, limit);
  return result;
}

function getTrending(limit = 12) {
  const { dogs, cats } = getPetProducts(loadProducts());
  const allPetProducts = [...dogs, ...cats]
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  
  // First try explicit trending
  let filtered = filterWithImages(allPetProducts)
    .filter(p => p.is_trending === true);
  
  // If none, use recent high-quality pet products
  if (filtered.length === 0) {
    filtered = filterWithImages(allPetProducts);
    console.log(`[topProducts] No explicit trending, using top ${Math.min(filtered.length, limit)} by score`);
  }
  
  const result = filtered.sort(sortByPopularity).slice(0, limit);
  return assertHomepagePetOnly(result, 'trending');
}

function resolveWithGlobalDedup(candidates, limit, usedGlobalSet, fallbackPool = []) {
  const resolved = [];
  const requestedIds = candidates.map(p => p.id);
  const skippedIds = [];
  
  for (const product of candidates) {
    if (resolved.length >= limit) break;
    if (!product || !product.id) continue;
    
    if (usedGlobalSet.has(product.id)) {
      skippedIds.push(product.id);
      continue;
    }
    
    usedGlobalSet.add(product.id);
    resolved.push(product);
  }
  
  if (resolved.length < limit && fallbackPool.length > 0) {
    const sortedFallback = fallbackPool.sort(sortByPopularity);
    for (const product of sortedFallback) {
      if (resolved.length >= limit) break;
      if (!product || !product.id) continue;
      if (usedGlobalSet.has(product.id)) continue;
      
      usedGlobalSet.add(product.id);
      resolved.push(product);
    }
  }
  
  return {
    products: resolved,
    requestedIds,
    resolvedIds: resolved.map(p => p.id),
    skippedIds
  };
}

function getCandidatesForSection(sectionName, allProducts) {
  const { dogs, cats } = getPetProducts(allProducts);
  const allPetProducts = [...dogs, ...cats]
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  
  switch (sectionName) {
    case 'bestSellers': {
      let filtered = filterWithImages(allPetProducts).filter(p => p.is_best_seller === true);
      if (filtered.length === 0) {
        filtered = filterWithImages(allPetProducts);
      }
      return filtered.sort(sortByPopularity);
    }
    case 'topPicksDogs': {
      return filterWithImages(dogs).sort(sortByPopularity);
    }
    case 'topPicksCats': {
      return filterWithImages(cats).sort(sortByPopularity);
    }
    case 'trending': {
      let filtered = filterWithImages(allPetProducts).filter(p => p.is_trending === true);
      if (filtered.length === 0) {
        filtered = filterWithImages(allPetProducts);
      }
      return filtered.sort(sortByPopularity);
    }
    default:
      return [];
  }
}

function getHomepageSections() {
  const result = getHomepageSectionsWithDebug();
  return result.sections;
}

function getHomepageSectionsWithDebug() {
  const allProducts = loadProducts();
  const usedGlobalSet = new Set();
  const debugMeta = {
    sectionsOrder: ['bestSellers', 'topPicksDogs', 'topPicksCats', 'trending'],
    sections: {},
    usedGlobalSet: [],
    duplicatesFound: []
  };
  
  const fallbackPool = filterHomepageEligible(allProducts);
  const sectionOrder = ['bestSellers', 'topPicksDogs', 'topPicksCats', 'trending'];
  const limit = 12;
  
  const sections = {
    top12: getTopProducts(12),
    highRatedRandom: getRandomHighRated(12, 4.5),
    mixed: getMixedHomepageProducts(12, 4.3)
  };
  
  for (const sectionName of sectionOrder) {
    const candidates = getCandidatesForSection(sectionName, allProducts);
    const result = resolveWithGlobalDedup(candidates, limit, usedGlobalSet, fallbackPool);
    
    sections[sectionName] = assertHomepagePetOnly(result.products, sectionName);
    
    debugMeta.sections[sectionName] = {
      requestedIds: result.requestedIds.slice(0, limit * 2),
      resolvedIds: result.resolvedIds,
      skippedDuplicates: result.skippedIds,
      count: result.products.length
    };
    
    debugMeta.duplicatesFound.push(...result.skippedIds);
  }
  
  debugMeta.usedGlobalSet = Array.from(usedGlobalSet);
  
  for (const [name, products] of Object.entries(sections)) {
    if (!sectionOrder.includes(name)) {
      sections[name] = assertHomepagePetOnly(products, name);
    }
  }
  
  return {
    sections,
    debug: debugMeta
  };
}

function getHomepageStats() {
  const allProducts = loadProducts();
  const petOnly = filterPetOnly(allProducts);
  const eligible = filterHomepageEligible(allProducts);
  const dogs = filterForDogs(allProducts);
  const cats = filterForCats(allProducts);
  
  return {
    total: allProducts.length,
    petOnly: petOnly.length,
    homepageEligible: eligible.length,
    dogs: dogs.length,
    cats: cats.length,
    withImages: filterWithImages(allProducts).length,
    inStock: allProducts.filter(p => p.stock > 0).length
  };
}

module.exports = {
  getTopProducts,
  getRandomHighRated,
  getMixedHomepageProducts,
  getBestSellers,
  getTopPicksForDogs,
  getTopPicksForCats,
  getTopPicksForSmallPets,
  getTrending,
  getHomepageSections,
  getHomepageSectionsWithDebug,
  getHomepageStats,
  filterHomepageEligible,
  loadProducts,
  resolveWithGlobalDedup
};
