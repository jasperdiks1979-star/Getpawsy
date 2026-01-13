#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");

const USD_MARKUP = {
  default: 2.4,
  bed: 2.1,
  beds: 2.1,
  toy: 2.6,
  toys: 2.6,
  grooming: 2.3,
  health: 2.3,
  feeder: 2.2,
  feeders: 2.2,
  bowl: 2.2,
  bowls: 2.2,
  carrier: 2.3,
  carriers: 2.3,
  travel: 2.3,
  collar: 2.5,
  collars: 2.5,
  leash: 2.5,
  leashes: 2.5,
  clothing: 2.4,
  clothes: 2.4,
  accessories: 2.4,
  furniture: 2.2,
  housing: 2.2
};

function psych(p) {
  if (p < 5) return 4.99;
  if (p < 10) return 9.99;
  if (p < 15) return 14.99;
  if (p < 20) return 19.99;
  if (p < 25) return 24.99;
  if (p < 30) return 29.99;
  if (p < 40) return 39.99;
  if (p < 50) return 49.99;
  if (p < 60) return 59.99;
  if (p < 70) return 69.99;
  if (p < 80) return 79.99;
  if (p < 100) return 99.99;
  if (p < 150) return 149.99;
  if (p < 200) return 199.99;
  if (p > 999) return 999.99;
  return Math.floor(p) + 0.99;
}

function getCategoryMarkup(categories) {
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return USD_MARKUP.default;
  }
  const cat = String(categories[0]).toLowerCase().trim();
  return USD_MARKUP[cat] || USD_MARKUP.default;
}

function main() {
  console.log("[FIX-PRICES] Loading catalog...");
  
  const raw = fs.readFileSync(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw);
  
  if (!catalog.products || !Array.isArray(catalog.products)) {
    console.error("[FIX-PRICES] Invalid catalog structure");
    process.exit(1);
  }
  
  let fixed = 0;
  let skipped = 0;
  const priceChanges = [];
  
  for (const product of catalog.products) {
    const cost = Number(product.oldPrice) || Number(product.cj_price) || Number(product.cost) || 0;
    
    if (cost <= 0) {
      skipped++;
      continue;
    }
    
    const markup = getCategoryMarkup(product.categories);
    const rawPrice = cost * markup;
    const newPrice = psych(rawPrice);
    const newCompareAt = psych(newPrice * 1.25);
    
    if (product.price !== newPrice) {
      priceChanges.push({
        slug: (product.slug || "").substring(0, 40),
        oldPrice: product.price,
        newPrice: newPrice,
        cost: cost,
        markup: markup
      });
      
      product.price = newPrice;
      product.compare_at_price = newCompareAt;
      product.compareAtPrice = newCompareAt;
      product.cj_price = cost;
      product.cost = cost;
      fixed++;
    }
  }
  
  catalog.pricesUpdatedAt = new Date().toISOString();
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  
  console.log(`[FIX-PRICES] Fixed ${fixed} prices, skipped ${skipped} (no cost data)`);
  console.log("[FIX-PRICES] Sample price changes:");
  priceChanges.slice(0, 10).forEach(c => {
    console.log(`  ${c.slug}: $${c.oldPrice} → $${c.newPrice} (cost: $${c.cost}, markup: ${c.markup}x)`);
  });
  
  const prices = catalog.products
    .filter(p => p.active)
    .map(p => p.price);
  const uniquePrices = [...new Set(prices)];
  console.log(`[FIX-PRICES] Unique prices in active products: ${uniquePrices.length}`);
  console.log(`[FIX-PRICES] Price range: $${Math.min(...prices)} - $${Math.max(...prices)}`);
}

main();
