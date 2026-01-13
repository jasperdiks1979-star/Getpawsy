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

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 9999, offset: 0, write: true, dry: false };
  
  for (const arg of args) {
    if (arg.startsWith("--limit=")) opts.limit = parseInt(arg.split("=")[1]) || 9999;
    if (arg.startsWith("--offset=")) opts.offset = parseInt(arg.split("=")[1]) || 0;
    if (arg.startsWith("--write=")) opts.write = arg.split("=")[1] === "1";
    if (arg.startsWith("--dry=")) opts.dry = arg.split("=")[1] === "1";
  }
  
  if (opts.dry) opts.write = false;
  return opts;
}

function isValidImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (url.length < 10) return false;
  if (url.includes("placeholder")) return false;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/media/")) return true;
  return false;
}

function resolvePrimaryImage(product) {
  if (isValidImageUrl(product.resolved_image)) {
    return product.resolved_image;
  }

  if (Array.isArray(product.images)) {
    for (const img of product.images) {
      if (isValidImageUrl(img)) return img;
    }
  }

  if (product.thumbnail && isValidImageUrl(product.thumbnail)) {
    return product.thumbnail;
  }

  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      if (isValidImageUrl(v.image)) return v.image;
      if (Array.isArray(v.images)) {
        for (const img of v.images) {
          if (isValidImageUrl(img)) return img;
        }
      }
    }
  }

  return null;
}

function generateSlug(title, id) {
  if (!title) return `product-${id || Date.now()}`;
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100);
}

function psych(p) {
  if (p < 10) return 9.99;
  if (p > 999) return 999.99;
  return Math.floor(p) + 0.99;
}

function getCategoryMarkup(cat) {
  if (!cat) return USD_MARKUP.default;
  const key = String(cat).toLowerCase().trim();
  return USD_MARKUP[key] || USD_MARKUP.default;
}

function normalizeProduct(product) {
  const primaryImage = resolvePrimaryImage(product);
  const slug = product.slug || generateSlug(product.title, product.id);
  
  const baseCost = Number(product.cj_price || product.cost || product.source_price || 0);
  let price = Number(product.price) || 0;
  let compareAtPrice = Number(product.compare_at_price || product.compareAtPrice) || 0;
  
  if (baseCost > 0 && (price <= 0 || price === 9.95)) {
    const markup = getCategoryMarkup(product.category || product.mainCategorySlug);
    price = psych(baseCost * markup);
    compareAtPrice = psych(price * 1.3);
  }
  
  const hasValidImage = primaryImage !== null;
  const hasValidPrice = price > 0 && price !== 9.95;
  const hasSlug = slug && slug.length > 0;
  
  const active = hasValidImage && hasValidPrice && hasSlug && product.active !== false;

  const images = Array.isArray(product.images) && product.images.length > 0
    ? product.images.filter(isValidImageUrl)
    : primaryImage ? [primaryImage] : [];

  return {
    ...product,
    slug,
    resolved_image: primaryImage,
    thumbnail: primaryImage || product.thumbnail,
    images,
    price,
    compare_at_price: compareAtPrice,
    compareAtPrice: compareAtPrice,
    currency: "USD",
    active,
    _validation: {
      hasValidImage,
      hasValidPrice,
      hasSlug
    }
  };
}

function main() {
  const opts = parseArgs();
  
  console.log("[CJ RESYNC] Starting catalog normalization...");
  console.log("[CJ RESYNC] Options:", opts);

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

  const backupPath = path.join(__dirname, "..", "data", `catalog.backup.${Date.now()}.json`);
  if (opts.write) {
    fs.writeFileSync(backupPath, rawData);
    console.log("[CJ RESYNC] Backup saved to", backupPath);
  }

  const products = Array.isArray(catalog) ? catalog : (catalog.products || []);
  const subset = products.slice(opts.offset, opts.offset + opts.limit);
  
  console.log("[CJ RESYNC] Processing", subset.length, "products (offset:", opts.offset, ")");

  const normalized = subset.map(normalizeProduct);
  
  const remaining = [
    ...products.slice(0, opts.offset),
    ...normalized,
    ...products.slice(opts.offset + opts.limit)
  ];

  const stats = {
    total: remaining.length,
    active: remaining.filter(p => p.active).length,
    inactive: remaining.filter(p => !p.active).length,
    noImage: remaining.filter(p => !p._validation?.hasValidImage).length,
    noPrice: remaining.filter(p => !p._validation?.hasValidPrice).length,
    noSlug: remaining.filter(p => !p._validation?.hasSlug).length
  };

  console.log("[CJ RESYNC] Results:");
  console.log("  Total products:", stats.total);
  console.log("  Active (visible):", stats.active);
  console.log("  Inactive (hidden):", stats.inactive);
  console.log("  Without valid image:", stats.noImage);
  console.log("  Without valid price:", stats.noPrice);
  console.log("  Without slug:", stats.noSlug);

  if (opts.write) {
    const cleanedProducts = remaining.map(p => {
      const { _validation, ...rest } = p;
      return rest;
    });
    
    const output = Array.isArray(catalog) ? cleanedProducts : { ...catalog, products: cleanedProducts };
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));
    console.log("[CJ RESYNC] Catalog updated at", CATALOG_PATH);
  } else {
    console.log("[CJ RESYNC] DRY RUN - no changes written");
  }

  console.log("[CJ RESYNC] Done!");
}

main();
