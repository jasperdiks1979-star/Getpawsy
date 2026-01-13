const fs = require('fs');
const path = require('path');

// Primary: products_cj.json (CJ products), Fallback: db.json
const PRODUCTS_CJ_PATH = path.join(__dirname, '..', 'data', 'products_cj.json');
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const POPULARITY_PATH = path.join(__dirname, '..', 'data', 'popularity.json');

const SUBCATEGORIES = {
  DOG_CHEW: ['chew', 'treat', 'dental', 'bone'],
  DOG_FETCH: ['ball', 'fetch', 'frisbee', 'throw'],
  DOG_TUG: ['tug', 'rope', 'pull'],
  DOG_TRAINING: ['training', 'clicker', 'treat pouch', 'leash trainer'],
  DOG_WALK: ['leash', 'harness', 'collar', 'walk'],
  DOG_BEDS: ['bed', 'mat', 'cushion', 'crate pad'],
  CAT_PLAY: ['toy', 'feather', 'mouse', 'teaser', 'interactive'],
  CAT_SCRATCH: ['scratch', 'post', 'scratcher', 'cardboard'],
  CAT_LITTER: ['litter', 'box', 'scoop'],
  CAT_BEDS: ['bed', 'hammock', 'cave', 'perch'],
  CAT_GROOM: ['brush', 'groom', 'comb', 'nail', 'deshed']
};

const POPULARITY_EVENTS = {
  view_product: 1,
  add_to_cart: 5,
  checkout_start: 15,
  purchase_completed: 40
};

let _currentSource = null;

function loadDB() {
  // Try products_cj.json first (primary CJ source), then fall back to db.json
  for (const filePath of [PRODUCTS_CJ_PATH, DB_PATH]) {
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const products = data.products || data;
        if (Array.isArray(products) && products.length > 0) {
          _currentSource = path.basename(filePath);
          console.log(`[FeaturedProducts] Loaded ${products.length} products from ${_currentSource}`);
          return { products, _source: _currentSource };
        }
      } catch (e) {
        console.warn(`[FeaturedProducts] Error loading ${filePath}:`, e.message);
      }
    }
  }
  console.warn('[FeaturedProducts] No products found in any source');
  _currentSource = null;
  return { products: [], _source: null };
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function loadPopularity() {
  try {
    return JSON.parse(fs.readFileSync(POPULARITY_PATH, 'utf8'));
  } catch (e) {
    return { events: [], scores: {} };
  }
}

function savePopularity(data) {
  fs.writeFileSync(POPULARITY_PATH, JSON.stringify(data, null, 2));
}

function calculateQualityScore(product) {
  let score = 0;
  
  if (product.images && product.images.length >= 3) score += 20;
  else if (product.images && product.images.length >= 2) score += 15;
  else if (product.image) score += 10;
  
  if (product.variants && product.variants.length >= 3) score += 15;
  else if (product.variants && product.variants.length >= 2) score += 10;
  else if (product.variants && product.variants.length >= 1) score += 5;
  
  const titleLen = (product.title || '').length;
  if (titleLen >= 30 && titleLen <= 80) score += 15;
  else if (titleLen >= 20) score += 10;
  else if (titleLen >= 10) score += 5;
  
  const descLen = (product.description || '').length;
  if (descLen >= 100) score += 15;
  else if (descLen >= 50) score += 10;
  else if (descLen >= 20) score += 5;
  
  const price = parseFloat(product.price) || 0;
  if (price >= 15 && price <= 60) score += 15;
  else if (price >= 10 && price <= 100) score += 10;
  else if (price > 0) score += 5;
  
  if (product.source === 'CJ-API') score += 20;
  else if (product.source === 'demo') score += 5;
  
  return score;
}

function detectSubcategory(product) {
  const text = `${product.title || ''} ${product.description || ''} ${product.category || ''}`.toLowerCase();
  
  for (const [subcat, keywords] of Object.entries(SUBCATEGORIES)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        return subcat;
      }
    }
  }
  
  if (text.includes('dog')) return 'DOG_OTHER';
  if (text.includes('cat')) return 'CAT_OTHER';
  return 'OTHER';
}

function detectPetType(product) {
  // Use existing pet_type or petType field first
  const existingType = product.pet_type || product.petType;
  if (existingType) {
    const normalized = String(existingType).toLowerCase();
    if (normalized === 'dog' || normalized === 'dogs') return 'dog';
    if (normalized === 'cat' || normalized === 'cats') return 'cat';
    if (normalized === 'both') return 'both';
  }
  
  // Fallback: detect from text content
  const text = `${product.title || ''} ${product.description || ''} ${product.category || ''} ${product.mainCategorySlug || ''}`.toLowerCase();
  if (text.includes('dog') || text.includes('puppy') || text.includes('canine')) return 'dog';
  if (text.includes('cat') || text.includes('kitten') || text.includes('feline')) return 'cat';
  return 'other';
}

function recordPopularityEvent(productId, eventType) {
  if (!POPULARITY_EVENTS[eventType]) return;
  
  const data = loadPopularity();
  const points = POPULARITY_EVENTS[eventType];
  
  data.events.push({
    productId,
    eventType,
    points,
    timestamp: Date.now()
  });
  
  data.scores[productId] = (data.scores[productId] || 0) + points;
  
  if (data.events.length > 10000) {
    data.events = data.events.slice(-5000);
  }
  
  savePopularity(data);
  
  return data.scores[productId];
}

function getPopularityScore(productId) {
  const data = loadPopularity();
  return data.scores[productId] || 0;
}

function autoSelectTopPicks(limit = 12) {
  const db = loadDB();
  const popularity = loadPopularity();
  
  const scored = db.products
    .filter(p => {
      // Filter out inactive, rejected, and non-homepage eligible products
      if (!p.active && p.active !== undefined) return false;
      if (p.rejected) return false;
      if (p.homepage_eligible === false) return false;
      if (p.is_pet_product === false) return false;
      return true;
    })
    .map(p => ({
      ...p,
      qualityScore: calculateQualityScore(p),
      popularityScore: popularity.scores[p.id] || 0,
      petType: detectPetType(p),
      subcategory: detectSubcategory(p)
    }))
    .map(p => ({
      ...p,
      totalScore: p.qualityScore + (p.popularityScore * 0.5)
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
  
  return scored.slice(0, limit);
}

function getTopPicksByCategory(category, limit = 12) {
  const db = loadDB();
  const popularity = loadPopularity();
  
  // Normalize category name (dogs -> dog, cats -> cat)
  const normalizedCategory = category.replace(/s$/, '').toLowerCase();
  
  const scored = db.products
    .filter(p => {
      // Filter out inactive, rejected, and non-homepage eligible products
      if (!p.active && p.active !== undefined) return false;
      if (p.rejected) return false;
      if (p.homepage_eligible === false) return false;
      if (p.is_pet_product === false) return false;
      return true;
    })
    .filter(p => {
      if (normalizedCategory === 'all') return true;
      const petType = detectPetType(p);
      // Match dog, cat, or both
      return petType === normalizedCategory || petType === 'both';
    })
    .map(p => ({
      ...p,
      qualityScore: calculateQualityScore(p),
      popularityScore: popularity.scores[p.id] || 0,
      petType: detectPetType(p),
      subcategory: detectSubcategory(p)
    }))
    .map(p => ({
      ...p,
      totalScore: p.qualityScore + (p.popularityScore * 0.5)
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
  
  return scored.slice(0, limit);
}

function getTopPicksBySubcategory(subcategory, limit = 8) {
  const db = loadDB();
  const popularity = loadPopularity();
  
  const scored = db.products
    .filter(p => {
      if (!p.active && p.active !== undefined) return false;
      if (p.rejected) return false;
      if (p.homepage_eligible === false) return false;
      if (p.is_pet_product === false) return false;
      return true;
    })
    .filter(p => detectSubcategory(p) === subcategory)
    .map(p => ({
      ...p,
      qualityScore: calculateQualityScore(p),
      popularityScore: popularity.scores[p.id] || 0,
      petType: detectPetType(p),
      subcategory: detectSubcategory(p)
    }))
    .map(p => ({
      ...p,
      totalScore: p.qualityScore + (p.popularityScore * 0.5)
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
  
  return scored.slice(0, limit);
}

function setFeatured(productId, featured = true, rank = 0) {
  // Only allow mutations on db.json products (not CJ products)
  // CJ products from products_cj.json are read-only
  if (_currentSource === 'products_cj.json') {
    console.warn(`[FeaturedProducts] Cannot set featured on CJ product ${productId} - products_cj.json is read-only`);
    return false;
  }
  
  // Force load from db.json for mutations
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const products = data.products || [];
    const product = products.find(p => p.id === productId);
    
    if (product) {
      product.featured = featured;
      product.featuredRank = rank;
      data.products = products;
      saveDB(data);
      return true;
    }
  } catch (e) {
    console.warn(`[FeaturedProducts] Error setting featured: ${e.message}`);
  }
  return false;
}

function getFeaturedProducts() {
  const db = loadDB();
  return db.products
    .filter(p => p.featured && p.active && !p.rejected)
    .sort((a, b) => (a.featuredRank || 0) - (b.featuredRank || 0));
}

function enrichProductsWithScores(products) {
  const popularity = loadPopularity();
  
  return products.map(p => ({
    ...p,
    qualityScore: calculateQualityScore(p),
    popularityScore: popularity.scores[p.id] || 0,
    petType: detectPetType(p),
    subcategory: detectSubcategory(p)
  }));
}

module.exports = {
  calculateQualityScore,
  detectSubcategory,
  detectPetType,
  recordPopularityEvent,
  getPopularityScore,
  autoSelectTopPicks,
  getTopPicksByCategory,
  getTopPicksBySubcategory,
  setFeatured,
  getFeaturedProducts,
  enrichProductsWithScores,
  SUBCATEGORIES,
  POPULARITY_EVENTS
};
