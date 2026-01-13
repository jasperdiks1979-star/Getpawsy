const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/db.json');
const METRICS_PATH = path.join(__dirname, '../data/product_metrics.json');
const OUTPUT_DIR = path.join(__dirname, '../data/computed');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function loadData() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  let metrics = {};
  if (fs.existsSync(METRICS_PATH)) {
    metrics = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8'));
  }
  return { products: db.products || [], metrics };
}

function isEligible(product) {
  const tags = product.tags || [];
  const isPet = tags.includes('pet') || tags.includes('cj') || product.is_pet_product === true;
  const isUS = tags.includes('us-warehouse') || tags.includes('cj');
  const hasImages = (product.images && product.images.length > 0) || product.image;
  const hasPrice = product.price && product.price > 0;
  const isActive = product.active !== false;
  const notHidden = product.hidden_from_storefront !== true;
  
  return isPet && isUS && hasImages && hasPrice && isActive && notHidden;
}

function isDogProduct(product) {
  const text = `${product.title || ''} ${product.description || ''} ${(product.tags || []).join(' ')} ${product.mainCategorySlug || ''}`.toLowerCase();
  const dogKeywords = ['dog', 'puppy', 'pup', 'canine', 'doggy', 'leash', 'collar', 'harness', 'chew'];
  return dogKeywords.some(kw => text.includes(kw)) || product.mainCategorySlug === 'dogs';
}

function isCatProduct(product) {
  const text = `${product.title || ''} ${product.description || ''} ${(product.tags || []).join(' ')} ${product.mainCategorySlug || ''}`.toLowerCase();
  const catKeywords = ['cat', 'kitten', 'kitty', 'feline', 'litter', 'scratching'];
  return catKeywords.some(kw => text.includes(kw)) || product.mainCategorySlug === 'cats';
}

function calculateScore(product, metrics) {
  let score = 50;
  
  const m = metrics[product.id] || {};
  score += (m.views || 0) * 0.1;
  score += (m.addToCart || 0) * 2;
  score += (m.purchases || 0) * 5;
  
  const imageCount = (product.images || []).length;
  if (imageCount >= 5) score += 15;
  else if (imageCount >= 3) score += 10;
  else if (imageCount >= 1) score += 5;
  
  if (product.variants && product.variants.length > 0) score += 10;
  
  const price = product.price || 0;
  if (price >= 10 && price <= 60) score += 15;
  else if (price >= 5 && price <= 100) score += 8;
  
  if (price > 250) score -= 20;
  
  if (product.enrichment_mode) score += 10;
  if (product.seo_title) score += 5;
  if (product.benefits && product.benefits.length > 0) score += 5;
  
  if (product.createdAt) {
    const daysOld = (Date.now() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) score += 15;
    else if (daysOld < 30) score += 8;
  }
  
  return Math.max(0, score);
}

function generateReason(product, score) {
  const reasons = [];
  const imageCount = (product.images || []).length;
  
  if (imageCount >= 3) reasons.push('Quality images');
  if (product.price >= 10 && product.price <= 60) reasons.push('Great price');
  if (product.variants && product.variants.length > 0) reasons.push('Multiple options');
  if (product.enrichment_mode) reasons.push('Premium content');
  
  const tags = product.tags || [];
  if (tags.includes('us-warehouse')) reasons.push('US Fast Shipping');
  
  return reasons.length > 0 ? reasons.join(' + ') : 'Popular choice';
}

function buildRankings() {
  console.log('=== Building Product Rankings ===\n');
  
  const { products, metrics } = loadData();
  const eligible = products.filter(isEligible);
  
  console.log(`Total products: ${products.length}`);
  console.log(`Eligible for rankings: ${eligible.length}`);
  
  const scored = eligible.map(p => ({
    ...p,
    _score: calculateScore(p, metrics),
    _reason: generateReason(p, calculateScore(p, metrics))
  })).sort((a, b) => b._score - a._score);
  
  const dogs = scored.filter(isDogProduct);
  const cats = scored.filter(isCatProduct);
  
  const topPicksDogs = dogs.slice(0, 8).map((p, i) => ({
    product_id: p.id,
    rank: i + 1,
    score: p._score,
    reason: p._reason,
    title: p.title
  }));
  
  const topPicksCats = cats.slice(0, 8).map((p, i) => ({
    product_id: p.id,
    rank: i + 1,
    score: p._score,
    reason: p._reason,
    title: p.title
  }));
  
  const bestSellers = scored.slice(0, 10).map((p, i) => ({
    product_id: p.id,
    rank: i + 1,
    score: p._score,
    reason: p._reason,
    title: p.title
  }));
  
  const recentlyAdded = [...eligible]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 20)
    .map((p, i) => ({
      product_id: p.id,
      rank: i + 1,
      title: p.title
    }));
  
  const trendingScored = eligible.map(p => {
    let trendScore = 0;
    
    if (p.createdAt) {
      const daysOld = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      trendScore += Math.max(0, 50 - daysOld * 2);
    }
    
    const imageCount = (p.images || []).length;
    trendScore += imageCount >= 3 ? 25 : imageCount * 5;
    
    const m = metrics[p.id] || {};
    trendScore += (m.views || 0) * 0.2;
    trendScore += (m.addToCart || 0) * 3;
    
    const price = p.price || 0;
    if (price >= 10 && price <= 60) trendScore += 10;
    
    return { ...p, _trendScore: trendScore };
  }).sort((a, b) => b._trendScore - a._trendScore);
  
  const trendingNow = trendingScored.slice(0, 12).map((p, i) => ({
    product_id: p.id,
    rank: i + 1,
    score: p._trendScore,
    title: p.title
  }));
  
  const categoryBest = {};
  const categories = [...new Set(eligible.map(p => p.subcategorySlug).filter(Boolean))];
  
  for (const cat of categories) {
    const catProducts = scored.filter(p => p.subcategorySlug === cat);
    categoryBest[cat] = catProducts.slice(0, 6).map((p, i) => ({
      product_id: p.id,
      rank: i + 1,
      score: p._score,
      title: p.title
    }));
  }
  
  const collections = {
    'top-picks-dogs': {
      slug: 'top-picks-dogs',
      title: 'Top Picks for Dogs',
      items: topPicksDogs,
      updated_at: new Date().toISOString()
    },
    'top-picks-cats': {
      slug: 'top-picks-cats',
      title: 'Top Picks for Cats',
      items: topPicksCats,
      updated_at: new Date().toISOString()
    },
    'best-sellers': {
      slug: 'best-sellers',
      title: 'Best Sellers',
      items: bestSellers,
      updated_at: new Date().toISOString()
    },
    'recently-added': {
      slug: 'recently-added',
      title: 'Recently Added',
      items: recentlyAdded,
      updated_at: new Date().toISOString()
    },
    'trending-now': {
      slug: 'trending-now',
      title: 'Trending Now',
      items: trendingNow,
      updated_at: new Date().toISOString()
    }
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'collections.json'),
    JSON.stringify(collections, null, 2)
  );
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'category-best.json'),
    JSON.stringify(categoryBest, null, 2)
  );
  
  const report = {
    generated_at: new Date().toISOString(),
    total_products: products.length,
    total_eligible: eligible.length,
    excluded_no_images: products.filter(p => !((p.images && p.images.length > 0) || p.image)).length,
    excluded_non_pet: products.filter(p => p.is_pet_product === false).length,
    excluded_hidden: products.filter(p => p.hidden_from_storefront === true).length,
    collections: {
      top_picks_dogs: topPicksDogs.length,
      top_picks_cats: topPicksCats.length,
      best_sellers: bestSellers.length,
      recently_added: recentlyAdded.length,
      trending_now: trendingNow.length,
      category_best_categories: Object.keys(categoryBest).length
    },
    top_10_list: bestSellers.map(b => ({ id: b.product_id, title: b.title })),
    top_dogs: topPicksDogs.map(b => ({ id: b.product_id, title: b.title })),
    top_cats: topPicksCats.map(b => ({ id: b.product_id, title: b.title }))
  };
  
  console.log('\n=== Rankings Report ===');
  console.log(`Eligible: ${report.total_eligible}`);
  console.log(`Top Picks Dogs: ${report.collections.top_picks_dogs}`);
  console.log(`Top Picks Cats: ${report.collections.top_picks_cats}`);
  console.log(`Best Sellers: ${report.collections.best_sellers}`);
  console.log(`Recently Added: ${report.collections.recently_added}`);
  console.log(`Trending Now: ${report.collections.trending_now}`);
  console.log(`Category Best (categories): ${report.collections.category_best_categories}`);
  
  console.log('\n=== Top 10 Best Sellers ===');
  bestSellers.forEach(b => console.log(`#${b.rank}: ${b.title?.substring(0, 50)}`));
  
  return report;
}

if (require.main === module) {
  buildRankings();
}

module.exports = { buildRankings };
