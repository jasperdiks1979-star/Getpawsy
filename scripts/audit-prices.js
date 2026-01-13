#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function main() {
  console.log('============================================================');
  console.log('GETPAWSY PRICE AUDIT');
  console.log('============================================================\n');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products || [];
  
  const fallbackPrice = 9.95;
  const pricesAt995 = products.filter(p => parseFloat(p.price) === fallbackPrice);
  const pricesZeroOrMissing = products.filter(p => !p.price || parseFloat(p.price) <= 0);
  const validPrices = products.filter(p => p.price && parseFloat(p.price) > 0 && parseFloat(p.price) !== fallbackPrice);
  
  console.log(`Total products: ${products.length}`);
  console.log(`Products with $${fallbackPrice}: ${pricesAt995.length} (${((pricesAt995.length / products.length) * 100).toFixed(1)}%)`);
  console.log(`Products with $0 or missing: ${pricesZeroOrMissing.length} (${((pricesZeroOrMissing.length / products.length) * 100).toFixed(1)}%)`);
  console.log(`Products with valid prices: ${validPrices.length} (${((validPrices.length / products.length) * 100).toFixed(1)}%)\n`);
  
  if (pricesAt995.length > 0) {
    console.log(`\n=== Products with $${fallbackPrice} (possible fallback) ===`);
    const samples = pricesAt995.slice(0, 20);
    samples.forEach((p, i) => {
      console.log(`${i + 1}. ID: ${p.id?.substring(0, 20)}... | slug: ${p.slug?.substring(0, 30) || 'N/A'} | source: ${p.priceSource || 'catalog'}`);
    });
    if (pricesAt995.length > 20) {
      console.log(`... and ${pricesAt995.length - 20} more`);
    }
  }

  console.log('\n=== Price Distribution ===');
  const priceRanges = {
    '$0-10': 0,
    '$10-25': 0,
    '$25-50': 0,
    '$50-100': 0,
    '$100+': 0
  };
  products.forEach(p => {
    const price = parseFloat(p.price) || 0;
    if (price <= 10) priceRanges['$0-10']++;
    else if (price <= 25) priceRanges['$10-25']++;
    else if (price <= 50) priceRanges['$25-50']++;
    else if (price <= 100) priceRanges['$50-100']++;
    else priceRanges['$100+']++;
  });
  Object.entries(priceRanges).forEach(([range, count]) => {
    const pct = ((count / products.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(pct / 2));
    console.log(`${range.padEnd(10)} ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  });

  console.log('\n=== Random Sample of 10 Products ===');
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  shuffled.slice(0, 10).forEach((p, i) => {
    console.log(`${i + 1}. $${p.price} | ${p.title?.substring(0, 40)} | ID: ${p.id?.substring(0, 15)}`);
  });

  console.log('\n=== Listing vs PDP vs API Consistency Check ===');
  try {
    const apiRes = await fetch(`${BASE_URL}/api/products?limit=5`);
    const apiData = await apiRes.json();
    const apiProducts = apiData.products || [];
    
    console.log(`Checking ${apiProducts.length} products from API...\n`);
    
    for (const apiProduct of apiProducts) {
      const catalogProduct = products.find(p => p.id === apiProduct.id);
      const catalogPrice = catalogProduct ? parseFloat(catalogProduct.price) : null;
      const apiPrice = parseFloat(apiProduct.price);
      
      const match = catalogPrice === apiPrice ? '✅' : '❌';
      console.log(`${match} ${apiProduct.title?.substring(0, 30).padEnd(30)} | API: $${apiPrice} | Catalog: $${catalogPrice || 'N/A'}`);
    }
  } catch (e) {
    console.log(`Could not fetch API: ${e.message}`);
  }

  console.log('\n============================================================');
  if (pricesAt995.length > products.length * 0.1) {
    console.log(`⚠️ WARNING: ${((pricesAt995.length / products.length) * 100).toFixed(1)}% of products have $${fallbackPrice}`);
    console.log('   This may indicate a fallback pricing issue.');
  } else if (pricesAt995.length === 0) {
    console.log('✅ No products with $9.95 fallback price detected');
  } else {
    console.log(`ℹ️ ${pricesAt995.length} products have $${fallbackPrice} (likely intentional)`);
  }
  console.log('============================================================');
}

main().catch(console.error);
