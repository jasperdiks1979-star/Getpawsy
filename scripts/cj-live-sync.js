#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const BACKUP_PATH = path.join(__dirname, "..", "data", `catalog.backup.${Date.now()}.json`);

const USD_MARKUP = {
  default: 2.4,
  bed: 2.1,
  beds: 2.1,
  toy: 2.6,
  toys: 2.6,
  grooming: 2.3,
  feeder: 2.2,
  feeders: 2.2,
  bowl: 2.2,
  bowls: 2.2,
  carrier: 2.3,
  carriers: 2.3,
  collar: 2.5,
  collars: 2.5,
  leash: 2.5,
  leashes: 2.5,
  clothing: 2.4,
  clothes: 2.4,
  accessories: 2.4
};

function psych(p) {
  if (p < 10) return 9.99;
  if (p > 999) return 999.99;
  return Math.floor(p) + 0.99;
}

function categoryMarkup(cat) {
  if (!cat) return USD_MARKUP.default;
  const key = String(cat).toLowerCase().trim();
  return USD_MARKUP[key] || USD_MARKUP.default;
}

function normalizeProduct(p) {
  const base = Number(p.cj_price || p.cost || p.source_price || p.price || 4.5);
  const markup = categoryMarkup(p.category || p.mainCategorySlug);
  const price = psych(base * markup);

  const images = Array.isArray(p.images) && p.images.length > 0
    ? p.images.filter(img => img && typeof img === "string")
    : p.resolved_image
      ? [p.resolved_image]
      : ["/images/placeholder.png"];

  const thumbnail = p.thumbnail || images[0] || "/images/placeholder.png";

  const slug = p.slug || (p.title || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const seo = {
    title: p.seo?.title || `${p.title || "Product"} for Dogs & Cats | GetPawsy`,
    description: p.seo?.description || `Shop ${p.title || "this product"}. Fast US shipping, pet-safe materials, trusted by pet owners.`
  };

  return {
    ...p,
    currency: "USD",
    price,
    compare_at_price: psych(price * 1.3),
    images,
    thumbnail,
    slug,
    seo
  };
}

function main() {
  console.log("[CJ LIVE SYNC] Starting full production sync...");
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("[CJ LIVE SYNC] ERROR: catalog.json not found");
    process.exit(1);
  }

  const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
  let catalog;
  
  try {
    catalog = JSON.parse(rawData);
  } catch (e) {
    console.error("[CJ LIVE SYNC] ERROR: Failed to parse catalog.json:", e.message);
    process.exit(1);
  }

  fs.writeFileSync(BACKUP_PATH, rawData);
  console.log("[CJ LIVE SYNC] Backup saved");

  const products = Array.isArray(catalog) ? catalog : (catalog.products || []);
  const updated = products.map(normalizeProduct);

  const output = Array.isArray(catalog) ? updated : { ...catalog, products: updated };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));

  const stats = {
    total: updated.length,
    withImages: updated.filter(p => p.images.length > 0 && !p.images[0].includes("placeholder")).length,
    withSeo: updated.filter(p => p.seo?.title && p.seo?.description).length,
    priceRanges: {
      under20: updated.filter(p => p.price < 20).length,
      "20to50": updated.filter(p => p.price >= 20 && p.price < 50).length,
      "50to100": updated.filter(p => p.price >= 50 && p.price < 100).length,
      over100: updated.filter(p => p.price >= 100).length
    }
  };

  console.log("[CJ LIVE SYNC] Updated", stats.total, "products");
  console.log("[CJ LIVE SYNC] With images:", stats.withImages);
  console.log("[CJ LIVE SYNC] With SEO:", stats.withSeo);
  console.log("[CJ LIVE SYNC] Price ranges:", stats.priceRanges);
  console.log("[CJ LIVE SYNC] Currency: USD enforced");
  console.log("[CJ LIVE SYNC] Done!");
}

main();
