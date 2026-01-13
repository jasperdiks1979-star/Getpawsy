#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");

function auditCatalog() {
  console.log("=== GetPawsy Catalog Pricing Audit ===\n");

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("ERROR: catalog.json not found at", CATALOG_PATH);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const products = Array.isArray(catalog) ? catalog : catalog.products || [];

  console.log(`Total products: ${products.length}\n`);

  let nullPriceCount = 0;
  const priceCounts = {};

  for (const p of products) {
    const price = parseFloat(p.price);
    if (isNaN(price) || price === null || price === undefined) {
      nullPriceCount++;
    } else {
      const key = price.toFixed(2);
      priceCounts[key] = (priceCounts[key] || 0) + 1;
    }
  }

  console.log(`Products with null/invalid price: ${nullPriceCount}`);
  console.log(`Products with valid price: ${products.length - nullPriceCount}\n`);

  const sortedPrices = Object.entries(priceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  console.log("Top 15 most common prices:");
  console.log("-".repeat(30));
  for (const [price, count] of sortedPrices) {
    const pct = ((count / products.length) * 100).toFixed(1);
    console.log(`$${price.padStart(8)} : ${String(count).padStart(4)} products (${pct}%)`);
  }

  const count995 = priceCounts["9.95"] || 0;
  console.log(`\n$9.95 specifically: ${count995} products (${((count995 / products.length) * 100).toFixed(1)}%)`);

  const priceRanges = {
    "Under $10": 0,
    "$10-$25": 0,
    "$25-$50": 0,
    "$50-$100": 0,
    "$100-$200": 0,
    "Over $200": 0
  };

  for (const p of products) {
    const price = parseFloat(p.price);
    if (isNaN(price)) continue;
    if (price < 10) priceRanges["Under $10"]++;
    else if (price < 25) priceRanges["$10-$25"]++;
    else if (price < 50) priceRanges["$25-$50"]++;
    else if (price < 100) priceRanges["$50-$100"]++;
    else if (price < 200) priceRanges["$100-$200"]++;
    else priceRanges["Over $200"]++;
  }

  console.log("\nPrice distribution:");
  console.log("-".repeat(30));
  for (const [range, count] of Object.entries(priceRanges)) {
    const pct = ((count / products.length) * 100).toFixed(1);
    console.log(`${range.padEnd(12)}: ${String(count).padStart(4)} products (${pct}%)`);
  }

  console.log("\n=== Audit Complete ===");
}

auditCatalog();
