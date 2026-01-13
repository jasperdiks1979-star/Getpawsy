#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const BACKUP_PATH = path.join(__dirname, "..", "data", `catalog.backup.${Date.now()}.json`);
const USD_MARKUP = 2.4;
const ROUND_TO = 0.99;

function roundPrice(p) {
  return Math.floor(p) + ROUND_TO;
}

function normalizeProduct(p) {
  let base = Number(p.cj_price || p.cost || p.source_price || p.price || 4.12);
  
  if (base < 1) base = 4.12;
  
  let price = roundPrice(base * USD_MARKUP);
  
  if (price < 9.99) price = 9.99;
  if (price > 999.99) price = 999.99;

  const images = Array.isArray(p.images) && p.images.length > 0
    ? p.images.filter(img => img && typeof img === "string")
    : p.resolved_image
      ? [p.resolved_image]
      : ["/images/placeholder.png"];

  const thumbnail = p.thumbnail || images[0] || "/images/placeholder.png";
  
  const slug = p.slug || (p.title || "product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    ...p,
    currency: "USD",
    price,
    compare_at_price: roundPrice(price * 1.3),
    images,
    thumbnail,
    slug,
    seo: {
      title: p.seo?.title || `${p.title || "Product"} | GetPawsy`,
      description: p.seo?.description || `Buy ${p.title || "this product"} for dogs and cats. Fast US shipping from GetPawsy.`,
    }
  };
}

function main() {
  console.log("[CJ RESYNC] Starting price normalization...");
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("[CJ RESYNC] ERROR: catalog.json not found at", CATALOG_PATH);
    process.exit(1);
  }

  const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
  let catalog;
  
  try {
    catalog = JSON.parse(rawData);
  } catch (e) {
    console.error("[CJ RESYNC] ERROR: Failed to parse catalog.json:", e.message);
    process.exit(1);
  }

  fs.writeFileSync(BACKUP_PATH, rawData);
  console.log("[CJ RESYNC] Backup saved to:", BACKUP_PATH);

  const products = Array.isArray(catalog) ? catalog : (catalog.products || []);
  const updated = products.map(normalizeProduct);

  const output = Array.isArray(catalog) ? updated : { ...catalog, products: updated };
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));
  
  const priceStats = updated.reduce((acc, p) => {
    const bucket = p.price < 20 ? "under20" : p.price < 50 ? "20to50" : p.price < 100 ? "50to100" : "over100";
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});

  console.log("[CJ RESYNC] Updated", updated.length, "products");
  console.log("[CJ RESYNC] Price distribution:", priceStats);
  console.log("[CJ RESYNC] All products now have currency: USD");
  console.log("[CJ RESYNC] Done!");
}

main();
