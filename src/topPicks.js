const fs = require('fs');
const path = require('path');

const METRICS_PATH = path.join(__dirname, '..', 'data', 'product_metrics.json');
const TOP_PICKS_PATH = path.join(__dirname, '..', 'data', 'top_picks.json');

const SCORE_WEIGHTS = {
  atcRate: 25,
  checkoutRate: 20,
  viewVelocity: 15,
  imageQuality: 15,
  variantScore: 10,
  marginProxy: 10,
  shippingScore: 5
};

const PENALTIES = {
  missingImage: -30,
  duplicateImage: -20,
  noVariants: -10,
  lowPrice: -5,
  noDescription: -15
};

const FEATURED_BOOST = 300;
const FEATURED_RANK_MULTIPLIER = 50;
const TRENDING_THRESHOLD = 300;

function loadMetrics() {
  try {
    if (fs.existsSync(METRICS_PATH)) {
      return JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8'));
    }
  } catch (e) {}
  return { events: [], productStats: {} };
}

function saveMetrics(data) {
  fs.writeFileSync(METRICS_PATH, JSON.stringify(data, null, 2));
}

function loadTopPicks() {
  try {
    if (fs.existsSync(TOP_PICKS_PATH)) {
      return JSON.parse(fs.readFileSync(TOP_PICKS_PATH, 'utf8'));
    }
  } catch (e) {}
  return { 
    featured: {},
    quarantined: [],
    config: {
      HOME: { limit: 8 },
      DOGS: { limit: 8 },
      CATS: { limit: 8 },
      COLLECTION: { limit: 12 }
    }
  };
}

function saveTopPicks(data) {
  fs.writeFileSync(TOP_PICKS_PATH, JSON.stringify(data, null, 2));
}

function recordMetricEvent(productId, eventType) {
  const validEvents = ['PRODUCT_VIEW', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'PURCHASE'];
  if (!validEvents.includes(eventType)) return false;
  
  const data = loadMetrics();
  const now = Date.now();
  
  data.events.push({ productId, eventType, timestamp: now });
  
  if (data.events.length > 100000) {
    data.events = data.events.slice(-50000);
  }
  
  if (!data.productStats[productId]) {
    data.productStats[productId] = {
      views: 0, atc: 0, checkout: 0, purchases: 0,
      lastView: null, lastAtc: null, lastCheckout: null, lastPurchase: null, firstView: null
    };
  }
  
  const stats = data.productStats[productId];
  if (eventType === 'PRODUCT_VIEW') {
    stats.views++;
    stats.lastView = now;
    if (!stats.firstView) stats.firstView = now;
  } else if (eventType === 'ADD_TO_CART') {
    stats.atc++;
    stats.lastAtc = now;
  } else if (eventType === 'BEGIN_CHECKOUT') {
    stats.checkout++;
    stats.lastCheckout = now;
  } else if (eventType === 'PURCHASE') {
    stats.purchases++;
    stats.lastPurchase = now;
  }
  
  saveMetrics(data);
  return true;
}

function calculateProductScore(product, metrics) {
  let score = 50;
  const stats = metrics.productStats[product.id] || { views: 0, atc: 0, checkout: 0, purchases: 0 };
  
  if (product.isFeatured) {
    score += FEATURED_BOOST;
    score += (product.featuredRank || 0) * FEATURED_RANK_MULTIPLIER;
  }
  
  const viewPoints = Math.min(stats.views || 0, 500) * 1;
  const cartPoints = Math.min(stats.atc || 0, 200) * 8;
  const purchasePoints = Math.min(stats.purchases || 0, 100) * 25;
  score += viewPoints + cartPoints + purchasePoints;
  
  if (stats.views > 0) {
    const atcRate = stats.atc / stats.views;
    score += atcRate * SCORE_WEIGHTS.atcRate * 10;
  }
  
  if (stats.atc > 0) {
    const checkoutRate = stats.checkout / stats.atc;
    score += checkoutRate * SCORE_WEIGHTS.checkoutRate * 10;
  }
  
  const createdAt = product.createdAt || product.importedAt || product.updatedAt;
  const recencyDays = createdAt ? daysSince(createdAt) : 60;
  const recencyBoost = recencyDays <= 30 ? (30 - recencyDays) * 2 : 0;
  score += recencyBoost;
  
  const lastActivity = Math.max(stats.lastView || 0, stats.lastAtc || 0, stats.lastPurchase || 0);
  const daysSinceActivity = lastActivity ? Math.min(daysSince(new Date(lastActivity).toISOString()), 60) : 60;
  const decayFactor = Math.max(0.4, Math.min(1.0, 1 - (daysSinceActivity * 0.01)));
  
  const daysSinceFirst = stats.firstView ? 
    (Date.now() - stats.firstView) / (1000 * 60 * 60 * 24) : 30;
  const viewVelocity = daysSinceFirst > 0 ? stats.views / daysSinceFirst : 0;
  score += Math.min(viewVelocity, 10) * SCORE_WEIGHTS.viewVelocity / 10;
  
  const images = product.images || [];
  if (images.length >= 3) score += SCORE_WEIGHTS.imageQuality;
  else if (images.length >= 2) score += SCORE_WEIGHTS.imageQuality * 0.7;
  else if (images.length >= 1) score += SCORE_WEIGHTS.imageQuality * 0.4;
  
  const variants = product.variants || [];
  if (variants.length >= 3) score += SCORE_WEIGHTS.variantScore;
  else if (variants.length >= 2) score += SCORE_WEIGHTS.variantScore * 0.7;
  else if (variants.length >= 1) score += SCORE_WEIGHTS.variantScore * 0.4;
  
  const price = parseFloat(product.price) || 0;
  if (price >= 20 && price <= 80) score += SCORE_WEIGHTS.marginProxy;
  else if (price >= 10) score += SCORE_WEIGHTS.marginProxy * 0.5;
  
  if (product.source === 'CJ-API') score += SCORE_WEIGHTS.shippingScore;
  
  if (!product.image) score += PENALTIES.missingImage;
  if (!variants.length) score += PENALTIES.noVariants;
  if (price < 5) score += PENALTIES.lowPrice;
  if (!product.description || product.description.length < 20) score += PENALTIES.noDescription;
  
  const finalScore = Math.round(Math.max(0, Math.min(1000, score * decayFactor)));
  return finalScore;
}

function daysSince(dateStr) {
  if (!dateStr) return 365;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

function getPopularityBadge(product, score) {
  if (product.isFeatured) return 'Top Pick';
  if (score >= TRENDING_THRESHOLD) return 'Trending';
  return null;
}

function recalculateScores(products) {
  const metrics = loadMetrics();
  const topPicks = loadTopPicks();
  
  const scored = products
    .filter(p => p.active && !p.rejected)
    .map(p => ({
      id: p.id,
      title: p.title,
      score: calculateProductScore(p, metrics),
      category: p.category,
      petType: detectPetType(p)
    }))
    .sort((a, b) => b.score - a.score);
  
  topPicks.lastRecalculated = new Date().toISOString();
  topPicks.scoredProducts = scored;
  saveTopPicks(topPicks);
  
  return scored;
}

function detectPetType(product) {
  const text = `${product.title || ''} ${product.description || ''} ${product.category || ''}`.toLowerCase();
  if (text.includes('dog') || text.includes('puppy')) return 'dog';
  if (text.includes('cat') || text.includes('kitten')) return 'cat';
  return 'other';
}

function getTopPicks(scope = 'HOME', limit = 8) {
  const topPicks = loadTopPicks();
  const config = topPicks.config[scope] || { limit: 8 };
  const effectiveLimit = limit || config.limit;
  
  let products = topPicks.scoredProducts || [];
  
  if (scope === 'DOGS') {
    products = products.filter(p => p.petType === 'dog');
  } else if (scope === 'CATS') {
    products = products.filter(p => p.petType === 'cat');
  }
  
  const quarantined = new Set(topPicks.quarantined || []);
  products = products.filter(p => !quarantined.has(p.id));
  
  const featured = topPicks.featured[scope] || [];
  const featuredSet = new Set(featured);
  
  const featuredProducts = products.filter(p => featuredSet.has(p.id));
  const nonFeatured = products.filter(p => !featuredSet.has(p.id));
  
  return [...featuredProducts, ...nonFeatured].slice(0, effectiveLimit);
}

function setFeatured(productId, scope, featured = true) {
  const topPicks = loadTopPicks();
  if (!topPicks.featured[scope]) topPicks.featured[scope] = [];
  
  if (featured) {
    if (!topPicks.featured[scope].includes(productId)) {
      topPicks.featured[scope].push(productId);
    }
  } else {
    topPicks.featured[scope] = topPicks.featured[scope].filter(id => id !== productId);
  }
  
  saveTopPicks(topPicks);
  return { ok: true };
}

function quarantine(productId, quarantine = true) {
  const topPicks = loadTopPicks();
  if (!topPicks.quarantined) topPicks.quarantined = [];
  
  if (quarantine) {
    if (!topPicks.quarantined.includes(productId)) {
      topPicks.quarantined.push(productId);
    }
  } else {
    topPicks.quarantined = topPicks.quarantined.filter(id => id !== productId);
  }
  
  saveTopPicks(topPicks);
  return { ok: true };
}

function getStats(products) {
  const topPicks = loadTopPicks();
  const metrics = loadMetrics();
  
  const active = products.filter(p => p.active && !p.rejected);
  const withImages = active.filter(p => p.image);
  const quarantined = topPicks.quarantined || [];
  
  return {
    eligible: active.length,
    withImages: withImages.length,
    missingImages: active.length - withImages.length,
    quarantined: quarantined.length,
    totalEvents: metrics.events?.length || 0,
    lastRecalculated: topPicks.lastRecalculated
  };
}

function setProductFeatured(productStore, productId, isFeatured, featuredRank = 0) {
  const product = productStore.getProduct(productId);
  if (!product) return { ok: false, error: 'Product not found' };
  
  productStore.updateProduct(productId, {
    isFeatured: isFeatured,
    featuredRank: featuredRank,
    updatedAt: new Date().toISOString()
  });
  
  return { ok: true, productId, isFeatured, featuredRank };
}

function recomputeScoresWithUpdate(productStore, options = {}) {
  const { mode = 'all' } = options;
  const metrics = loadMetrics();
  const allProducts = productStore.listProducts({ activeOnly: false, animalUsedOnly: false });
  
  let processed = 0;
  let updated = 0;
  const results = [];
  
  for (const product of allProducts) {
    if (mode === 'delta') {
      const stats = metrics.productStats[product.id];
      if (!stats) continue;
      const lastActivity = Math.max(stats.lastView || 0, stats.lastAtc || 0, stats.lastPurchase || 0);
      if (!lastActivity || daysSince(new Date(lastActivity).toISOString()) > 7) continue;
    }
    
    const newScore = calculateProductScore(product, metrics);
    const oldScore = product.popularityScore || 0;
    
    if (newScore !== oldScore) {
      productStore.updateProduct(product.id, {
        popularityScore: newScore,
        popularityUpdatedAt: new Date().toISOString()
      });
      updated++;
      results.push({ id: product.id, title: product.title?.substring(0, 50), oldScore, newScore });
    }
    processed++;
  }
  
  recalculateScores(allProducts.filter(p => p.active && !p.rejected));
  
  return { processed, updated, results: results.slice(0, 30) };
}

function getMetricsSummary() {
  const metrics = loadMetrics();
  const stats = metrics.productStats || {};
  const entries = Object.entries(stats);
  
  const topByViews = entries
    .sort((a, b) => (b[1].views || 0) - (a[1].views || 0))
    .slice(0, 20)
    .map(([id, s]) => ({ productId: id, views: s.views, atc: s.atc, purchases: s.purchases }));
  
  const topByAtc = entries
    .sort((a, b) => (b[1].atc || 0) - (a[1].atc || 0))
    .slice(0, 20)
    .map(([id, s]) => ({ productId: id, views: s.views, atc: s.atc, purchases: s.purchases }));
  
  const totalViews = entries.reduce((sum, [_, s]) => sum + (s.views || 0), 0);
  const totalAtc = entries.reduce((sum, [_, s]) => sum + (s.atc || 0), 0);
  const totalPurchases = entries.reduce((sum, [_, s]) => sum + (s.purchases || 0), 0);
  
  return {
    totalProducts: entries.length,
    totalViews,
    totalAtc,
    totalPurchases,
    topByViews,
    topByAtc
  };
}

function resetProductStats(productId) {
  const metrics = loadMetrics();
  if (metrics.productStats[productId]) {
    metrics.productStats[productId] = {
      views: 0, atc: 0, checkout: 0, purchases: 0,
      lastView: null, firstView: null
    };
    saveMetrics(metrics);
    return { ok: true };
  }
  return { ok: false, error: 'Product not found in metrics' };
}

function resetAllStats() {
  saveMetrics({ events: [], productStats: {} });
  return { ok: true };
}

module.exports = {
  recordMetricEvent,
  calculateProductScore,
  recalculateScores,
  getTopPicks,
  setFeatured,
  quarantine,
  getStats,
  loadTopPicks,
  saveTopPicks,
  getPopularityBadge,
  setProductFeatured,
  recomputeScoresWithUpdate,
  getMetricsSummary,
  resetProductStats,
  resetAllStats,
  daysSince,
  SCORE_WEIGHTS,
  PENALTIES,
  FEATURED_BOOST,
  TRENDING_THRESHOLD
};
