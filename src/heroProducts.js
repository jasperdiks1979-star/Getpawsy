const fs = require('fs');
const path = require('path');

const HERO_FILE = path.join(__dirname, '..', 'data', 'hero-products.json');

let heroConfig = null;
let productCache = null;

function loadHeroConfig() {
  if (heroConfig) return heroConfig;
  try {
    heroConfig = JSON.parse(fs.readFileSync(HERO_FILE, 'utf-8'));
    console.log('[HERO] Loaded hero-products.json');
    return heroConfig;
  } catch (e) {
    console.error('[HERO] Error loading hero config:', e.message);
    return { bestSellers: [], topPicksDogs: [], topPicksCats: [], trendingNow: [], pinnedFirst: {} };
  }
}

function loadProducts() {
  if (productCache) return productCache;
  const CATALOG_FILE = path.join(__dirname, '..', 'data', 'catalog.json');
  const LEGACY_FILE = path.join(__dirname, '..', 'data', 'products_cj.json');
  
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
      productCache = data.products || (Array.isArray(data) ? data : []);
      console.log(`[HERO] Loaded catalog.json with ${productCache.length} products`);
      return productCache;
    }
    if (fs.existsSync(LEGACY_FILE)) {
      const data = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf-8'));
      productCache = data.products || (Array.isArray(data) ? data : []);
      console.log(`[HERO] Loaded products_cj.json (fallback) with ${productCache.length} products`);
      return productCache;
    }
    console.error('[HERO] No product files found');
    return [];
  } catch (e) {
    console.error('[HERO] Error loading products:', e.message);
    return [];
  }
}

function isPetApproved(product) {
  if (!product) return false;
  if (product.is_pet_product === false) return false;
  if (product.homepage_eligible === false) return false;
  if (product.blocked_reason) return false;
  if (!product.images || product.images.length === 0) return false;
  if (product.stock !== undefined && product.stock <= 0) return false;
  return true;
}

const ADULT_BLOCKLIST = [
  'sex', 'sexy', 'erotic', 'dildo', 'vibrator', 'anal', 'masturbation', 
  'masturbator', 'plug', 'fetish', 'lingerie', 'condom', 'porn', 'bondage',
  'adult'
];

function isAdultContent(product) {
  const text = [
    product.title || '',
    product.name || '',
    (product.tags || []).join(' '),
    product.category || '',
    product.mainCategorySlug || '',
    product.description || ''
  ].join(' ').toLowerCase();
  
  return ADULT_BLOCKLIST.some(term => text.includes(term));
}

function resolveHeroProducts(heroList, sectionName = 'unknown') {
  const products = loadProducts();
  const { isHardPetApproved } = require('./lib/productFilter');
  
  const idMap = new Map();
  products.forEach(p => {
    idMap.set(String(p.id), p);
  });
  
  const resolved = [];
  const skipped = [];
  
  for (const productId of heroList) {
    const idStr = String(productId);
    const product = idMap.get(idStr);
    
    if (!product) {
      skipped.push({ id: idStr, reason: 'not_found' });
      continue;
    }
    
    const check = isHardPetApproved(product);
    if (!check.approved) {
      skipped.push({ id: idStr, reason: check.reason, title: product.title });
      continue;
    }
    
    if (resolved.find(p => String(p.id) === idStr)) {
      skipped.push({ id: idStr, reason: 'duplicate' });
      continue;
    }
    
    resolved.push(product);
  }
  
  return { products: resolved, skipped };
}

function resolveWithGlobalDedup(heroList, sectionName, usedGlobalSet) {
  const products = loadProducts();
  const { isHardPetApproved } = require('./lib/productFilter');
  
  const idMap = new Map();
  products.forEach(p => {
    idMap.set(String(p.id), p);
  });
  
  const resolved = [];
  const skipped = [];
  
  for (const productId of heroList) {
    const idStr = String(productId);
    const product = idMap.get(idStr);
    
    if (!product) {
      skipped.push({ id: idStr, reason: 'not_found' });
      continue;
    }
    
    const check = isHardPetApproved(product);
    if (!check.approved) {
      skipped.push({ id: idStr, reason: check.reason, title: product.title });
      continue;
    }
    
    if (usedGlobalSet.has(idStr)) {
      skipped.push({ id: idStr, reason: 'duplicate_global', title: product.title });
      continue;
    }
    
    usedGlobalSet.add(idStr);
    resolved.push(product);
  }
  
  return { products: resolved, skipped };
}

function getHeroCarousels() {
  const config = loadHeroConfig();
  const pinned = config.pinnedFirst || {};
  
  const usedGlobalSet = new Set();
  const duplicatesSkipped = [];
  
  const bestSellersResult = resolveWithGlobalDedup(config.bestSellers || [], 'bestSellers', usedGlobalSet);
  const topPicksDogsResult = resolveWithGlobalDedup(config.topPicksDogs || [], 'topPicksDogs', usedGlobalSet);
  const topPicksCatsResult = resolveWithGlobalDedup(config.topPicksCats || [], 'topPicksCats', usedGlobalSet);
  const topPicksSmallPetsResult = resolveWithGlobalDedup(config.topPicksSmallPets || [], 'topPicksSmallPets', usedGlobalSet);
  const trendingResult = resolveWithGlobalDedup(config.trending || config.trendingNow || [], 'trending', usedGlobalSet);
  
  let bestSellers = bestSellersResult.products;
  if (pinned.bestSellers) {
    const pinnedIdx = bestSellers.findIndex(p => p.id === pinned.bestSellers);
    if (pinnedIdx > 0) {
      const [pinnedProduct] = bestSellers.splice(pinnedIdx, 1);
      bestSellers.unshift(pinnedProduct);
    }
  }
  
  const allSkipped = [
    ...bestSellersResult.skipped.map(s => ({ ...s, section: 'bestSellers' })),
    ...topPicksDogsResult.skipped.map(s => ({ ...s, section: 'topPicksDogs' })),
    ...topPicksCatsResult.skipped.map(s => ({ ...s, section: 'topPicksCats' })),
    ...topPicksSmallPetsResult.skipped.map(s => ({ ...s, section: 'topPicksSmallPets' })),
    ...trendingResult.skipped.map(s => ({ ...s, section: 'trending' }))
  ];
  
  const globalDuplicates = allSkipped.filter(s => s.reason === 'duplicate_global');
  
  return {
    bestSellers,
    topPicksDogs: topPicksDogsResult.products,
    topPicksCats: topPicksCatsResult.products,
    topPicksSmallPets: topPicksSmallPetsResult.products,
    trending: trendingResult.products,
    meta: {
      source: 'hero-whitelist-deduped',
      skipped: allSkipped,
      globalDeduplication: {
        enabled: true,
        totalUnique: usedGlobalSet.size,
        duplicatesSkipped: globalDuplicates.length
      },
      counts: {
        bestSellers: bestSellers.length,
        topPicksDogs: topPicksDogsResult.products.length,
        topPicksCats: topPicksCatsResult.products.length,
        topPicksSmallPets: topPicksSmallPetsResult.products.length,
        trending: trendingResult.products.length
      }
    }
  };
}

function logHeroSections() {
  const carousels = getHeroCarousels();
  console.log('[HERO] bestSellers:', carousels.bestSellers.map(p => p.title || p.name).slice(0, 3).join(', ') + '...');
  console.log('[HERO] topPicksDogs:', carousels.topPicksDogs.map(p => p.title || p.name).slice(0, 3).join(', ') + '...');
  console.log('[HERO] topPicksCats:', carousels.topPicksCats.map(p => p.title || p.name).slice(0, 3).join(', ') + '...');
  console.log('[HERO] trending:', carousels.trending.map(p => p.title || p.name).slice(0, 3).join(', ') + '...');
}

function clearCache() {
  heroConfig = null;
  productCache = null;
}

module.exports = {
  loadHeroConfig,
  resolveHeroProducts,
  getHeroCarousels,
  logHeroSections,
  clearCache,
  isPetApproved
};
