/**
 * Product Health Checker
 * Computes health flags for products
 */

const { db } = require('../db');
const { log } = require('../logger');

const DEFAULT_MARGIN_THRESHOLD = 30;

function computeProductHealth(product, options = {}) {
  const marginThreshold = options.marginThreshold || DEFAULT_MARGIN_THRESHOLD;
  
  const health = {
    productId: product.id,
    title: product.title,
    imagesOk: false,
    hasGallery: false,
    usShippingOk: false,
    shipDaysOk: false,
    marginOk: false,
    seoOk: false,
    categoryOk: false,
    petEligibleOk: false,
    overallScore: 0,
    issues: []
  };
  
  const img = product.image || (product.images && product.images[0]);
  health.imagesOk = !!(img && !img.includes('placeholder') && !img.includes('demo'));
  if (!health.imagesOk) health.issues.push('Missing or invalid image');
  
  const imageCount = (product.images || []).filter(i => i && !i.includes('placeholder')).length;
  health.hasGallery = imageCount >= 3;
  if (!health.hasGallery) health.issues.push('Needs more images (< 3)');
  
  const warehouse = (product.warehouseCountry || product.warehouse || '').toUpperCase();
  const hasUSTag = (product.tags || []).some(t => /\bus\b|united states|america/i.test(t));
  health.usShippingOk = warehouse === 'US' || warehouse === 'USA' || hasUSTag || product.usWarehouse === true;
  if (!health.usShippingOk) health.issues.push('Not US warehouse');
  
  const shipDays = product.shipDaysMax || product.shippingDays || product.deliveryDays || 999;
  health.shipDaysOk = shipDays <= 7;
  if (!health.shipDaysOk) health.issues.push(`Slow shipping (${shipDays} days)`);
  
  const cost = product.costPrice || product.cjPrice || 0;
  const price = product.price || 0;
  const margin = cost > 0 ? ((price - cost) / price) * 100 : 0;
  health.marginOk = margin >= marginThreshold;
  health.marginPercent = Math.round(margin);
  if (!health.marginOk) health.issues.push(`Low margin (${health.marginPercent}%)`);
  
  const hasSeoTitle = !!(product.seoTitle || product.metaTitle);
  const hasSeoDesc = !!(product.seoDescription || product.metaDescription);
  const hasBullets = (product.bullets || product.highlights || []).length >= 3;
  health.seoOk = hasSeoTitle && hasSeoDesc;
  if (!health.seoOk) health.issues.push('Missing SEO meta');
  
  health.categoryOk = !!(product.categorySlug || product.category);
  if (!health.categoryOk) health.issues.push('No category assigned');
  
  health.petEligibleOk = product.isPetAllowed === true || product.petEligible === true;
  if (!health.petEligibleOk) health.issues.push('Not pet-eligible');
  
  let score = 0;
  if (health.imagesOk) score += 15;
  if (health.hasGallery) score += 10;
  if (health.usShippingOk) score += 20;
  if (health.shipDaysOk) score += 15;
  if (health.marginOk) score += 15;
  if (health.seoOk) score += 10;
  if (health.categoryOk) score += 10;
  if (health.petEligibleOk) score += 5;
  health.overallScore = score;
  
  return health;
}

async function getProductHealthStats() {
  const products = await db.listProducts();
  
  const stats = {
    total: products.length,
    petEligible: 0,
    nonPetFlagged: 0,
    missingImages: 0,
    usWarehouseEligible: 0,
    slowShipping: 0,
    lowMargin: 0,
    noCategory: 0,
    avgMargin: 0,
    healthyProducts: 0,
    needsAttention: 0
  };
  
  let totalMargin = 0;
  let marginCount = 0;
  
  for (const p of products) {
    if (p.deletedAt) continue;
    
    const health = computeProductHealth(p);
    
    if (health.petEligibleOk) stats.petEligible++;
    else stats.nonPetFlagged++;
    
    if (!health.imagesOk) stats.missingImages++;
    if (health.usShippingOk) stats.usWarehouseEligible++;
    if (!health.shipDaysOk) stats.slowShipping++;
    if (!health.marginOk) stats.lowMargin++;
    if (!health.categoryOk) stats.noCategory++;
    
    if (health.marginPercent > 0) {
      totalMargin += health.marginPercent;
      marginCount++;
    }
    
    if (health.overallScore >= 80) stats.healthyProducts++;
    else stats.needsAttention++;
  }
  
  stats.avgMargin = marginCount > 0 ? Math.round(totalMargin / marginCount) : 0;
  
  return stats;
}

async function getProductsNeedingAttention(limit = 50) {
  const products = await db.listProducts();
  const results = [];
  
  for (const p of products) {
    if (p.deletedAt) continue;
    const health = computeProductHealth(p);
    if (health.issues.length > 0) {
      results.push({
        ...health,
        image: p.image,
        price: p.price
      });
    }
  }
  
  results.sort((a, b) => a.overallScore - b.overallScore);
  return results.slice(0, limit);
}

module.exports = {
  computeProductHealth,
  getProductHealthStats,
  getProductsNeedingAttention,
  DEFAULT_MARGIN_THRESHOLD
};
