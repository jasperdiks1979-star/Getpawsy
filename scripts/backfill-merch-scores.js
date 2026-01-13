#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/db.json');

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function calculateMerchScores(product) {
  const id = product.id || product.cj_spu || String(Date.now());
  const base = hashCode(id) % 100;
  
  const price = parseFloat(product.price) || 0;
  const priceBandBonus = (price >= 10 && price <= 60) ? 15 : 0;
  
  const images = product.images || [];
  const imageCount = images.length;
  const imageBonus = imageCount >= 3 ? 10 : 0;
  
  const hasVariantImages = product.variantImages?.length > 0 || 
    product.variants?.some(v => v.image) || false;
  const variantBonus = hasVariantImages ? 5 : 0;
  
  const createdAt = product.created_at ? new Date(product.created_at) : new Date();
  const daysSinceCreated = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyBonus = daysSinceCreated < 7 ? 20 : 0;
  
  return {
    image_count: imageCount,
    has_variant_images: hasVariantImages,
    featured_score: base + priceBandBonus + imageBonus + variantBonus,
    trending_score: base + recencyBonus + imageBonus + variantBonus,
    sales_score: base + priceBandBonus + imageBonus,
    views_score: base + imageBonus
  };
}

function isEligibleForStorefront(product) {
  if (product.is_pet_product !== true) return false;
  if (product.hidden_from_storefront === true) return false;
  
  const tags = product.tags || [];
  const hasUSWarehouse = tags.length === 0 || tags.some(t => 
    t.toLowerCase().includes('us-warehouse') || 
    t.toLowerCase().includes('us warehouse') ||
    t.toLowerCase() === 'us') ||
    product.warehouseCountry === 'US' ||
    product.importedSource === 'CJ-PRO';
  
  return hasUSWarehouse;
}

function runBackfill() {
  console.log('=== Merchandising Scores Backfill ===\n');
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const products = db.products || [];
  
  let eligibleCount = 0;
  let updatedCount = 0;
  
  const eligible = [];
  
  products.forEach(product => {
    const scores = calculateMerchScores(product);
    
    product.image_count = scores.image_count;
    product.has_variant_images = scores.has_variant_images;
    product.featured_score = scores.featured_score;
    product.trending_score = scores.trending_score;
    product.sales_score = scores.sales_score;
    product.views_score = scores.views_score;
    
    if (!product.created_at) {
      product.created_at = new Date().toISOString();
    }
    
    updatedCount++;
    
    if (isEligibleForStorefront(product)) {
      eligibleCount++;
      eligible.push(product);
    }
  });
  
  eligible.sort((a, b) => b.featured_score - a.featured_score);
  const featuredIds = new Set(eligible.slice(0, 60).map(p => p.id));
  
  const trendingSorted = [...eligible].sort((a, b) => b.trending_score - a.trending_score);
  const trendingIds = new Set(trendingSorted.slice(0, 40).map(p => p.id));
  
  const bestSellerSorted = [...eligible].sort((a, b) => 
    (b.sales_score + b.views_score) - (a.sales_score + a.views_score)
  );
  const bestSellerIds = new Set(bestSellerSorted.slice(0, 30).map(p => p.id));
  
  let featuredCount = 0;
  let trendingCount = 0;
  let bestSellerCount = 0;
  
  products.forEach(product => {
    product.is_featured = featuredIds.has(product.id);
    product.is_trending = trendingIds.has(product.id);
    product.is_best_seller = bestSellerIds.has(product.id);
    
    if (product.is_featured) featuredCount++;
    if (product.is_trending) trendingCount++;
    if (product.is_best_seller) bestSellerCount++;
  });
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  
  const report = {
    total: products.length,
    updated: updatedCount,
    eligible: eligibleCount,
    featured: featuredCount,
    trending: trendingCount,
    bestSeller: bestSellerCount
  };
  
  console.log('Report:');
  console.log(`  Total products: ${report.total}`);
  console.log(`  Scores updated: ${report.updated}`);
  console.log(`  Eligible (pet + US warehouse + visible): ${report.eligible}`);
  console.log(`  Flagged as Featured: ${report.featured}`);
  console.log(`  Flagged as Trending: ${report.trending}`);
  console.log(`  Flagged as Best Seller: ${report.bestSeller}`);
  
  console.log('\n--- Sample Products ---');
  eligible.slice(0, 3).forEach((p, i) => {
    console.log(`\n${i + 1}. ${(p.title || '').slice(0, 50)}`);
    console.log(`   ID: ${p.id}`);
    console.log(`   Scores: featured=${p.featured_score}, trending=${p.trending_score}, sales=${p.sales_score}`);
    console.log(`   Flags: featured=${p.is_featured}, trending=${p.is_trending}, bestSeller=${p.is_best_seller}`);
  });
  
  return report;
}

if (require.main === module) {
  runBackfill();
}

module.exports = { runBackfill, calculateMerchScores, isEligibleForStorefront };
