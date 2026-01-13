#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  extractCjPid,
  fetchProductMedia,
  loadCheckpoint,
  saveCheckpoint,
  delay
} = require("../helpers/cjMediaFetcher");
const { classifyBlockReason } = require("../helpers/reportGenerator");

const PRODUCTS_PATH = path.join(__dirname, "..", "data", "products_cj.json");
const CONCURRENCY = 3;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const LOG_INTERVAL = 10;

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { mode: "zero", limit: 50, dryRun: false };
  
  for (const arg of args) {
    if (arg.startsWith("--mode=")) config.mode = arg.split("=")[1];
    else if (arg.startsWith("--limit=")) config.limit = parseInt(arg.split("=")[1], 10);
    else if (arg === "--dry-run") config.dryRun = true;
  }
  
  return config;
}

function loadProducts() {
  if (!fs.existsSync(PRODUCTS_PATH)) {
    console.error("[Enrich] Products file not found:", PRODUCTS_PATH);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf-8"));
  return Array.isArray(data) ? data : (data.products || []);
}

function saveProducts(products) {
  fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2));
}

function countImages(product) {
  const images = product.images || [];
  const mainImage = product.image ? 1 : 0;
  const uniqueImages = new Set([
    ...(Array.isArray(images) ? images : []),
    product.image
  ].filter(Boolean));
  return uniqueImages.size;
}

function selectTargets(products, mode, limit, doneSet) {
  const doneIds = new Set(doneSet);
  const targets = [];
  
  for (const product of products) {
    if (targets.length >= limit) break;
    if (doneIds.has(String(product.id))) continue;
    
    const blockResult = classifyBlockReason(product);
    if (!blockResult.allowed) continue;
    
    const imgCount = countImages(product);
    
    if (mode === "zero" && imgCount === 0) {
      targets.push(product);
    } else if (mode === "one" && imgCount === 1) {
      targets.push(product);
    } else if (mode === "all") {
      targets.push(product);
    }
  }
  
  return targets;
}

async function enrichProduct(product) {
  const pid = extractCjPid(product);
  if (!pid) {
    return { updated: false, reason: "no_pid" };
  }
  
  const media = await fetchProductMedia(pid);
  
  if (media.error === "rate_limited") {
    return { updated: false, reason: "rate_limited", retryAfter: media.retryAfter };
  }
  
  if (media.error) {
    return { updated: false, reason: media.error };
  }
  
  const currentImgCount = countImages(product);
  const newImgCount = media.images.length;
  
  if (newImgCount <= currentImgCount) {
    return { updated: false, reason: "no_improvement", currentImages: currentImgCount, newImages: newImgCount };
  }
  
  return {
    updated: true,
    images: media.images,
    videos: media.videos,
    previousImages: currentImgCount,
    newImages: newImgCount
  };
}

async function processBatch(batch, products, productMap, checkpoint, config) {
  const results = await Promise.all(batch.map(async (product) => {
    const result = await enrichProduct(product);
    return { product, result };
  }));
  
  let rateLimited = false;
  
  for (const { product, result } of results) {
    if (result.reason === "rate_limited") {
      rateLimited = true;
      continue;
    }
    
    checkpoint.doneSet.push(String(product.id));
    checkpoint.lastProcessedId = product.id;
    
    if (result.updated && !config.dryRun) {
      const idx = productMap.get(String(product.id));
      if (idx !== undefined) {
        products[idx].images = result.images;
        products[idx].image = result.images[0];
        if (result.videos.length > 0) {
          products[idx].videos = result.videos;
        }
        products[idx].enrichedAt = new Date().toISOString();
        checkpoint.stats.imagesUpdated = (checkpoint.stats.imagesUpdated || 0) + 1;
        if (result.videos.length > 0) {
          checkpoint.stats.videosUpdated = (checkpoint.stats.videosUpdated || 0) + 1;
        }
      }
    }
    
    if (!result.updated) {
      checkpoint.stats.skipped = (checkpoint.stats.skipped || 0) + 1;
    }
  }
  
  checkpoint.stats.processed = (checkpoint.stats.processed || 0) + batch.length;
  
  return { rateLimited };
}

async function main() {
  const config = parseArgs();
  console.log("\n============================================================");
  console.log("        GETPAWSY MEDIA ENRICHMENT");
  console.log("============================================================");
  console.log(`Mode: ${config.mode} | Limit: ${config.limit} | Dry Run: ${config.dryRun}`);
  console.log();
  
  const products = loadProducts();
  const productMap = new Map(products.map((p, i) => [String(p.id), i]));
  
  let checkpoint = loadCheckpoint();
  
  if (config.mode !== checkpoint.lastMode) {
    console.log(`[Enrich] Mode changed from ${checkpoint.lastMode} to ${config.mode}, resetting checkpoint`);
    checkpoint = { doneSet: [], lastProcessedId: null, stats: {} };
  }
  checkpoint.lastMode = config.mode;
  checkpoint.stats = { processed: 0, imagesUpdated: 0, videosUpdated: 0, skipped: 0 };
  
  const targets = selectTargets(products, config.mode, config.limit, checkpoint.doneSet);
  
  console.log(`[Enrich] Found ${targets.length} products to process`);
  console.log(`[Enrich] Already done: ${checkpoint.doneSet.length}`);
  console.log();
  
  if (targets.length === 0) {
    console.log("[Enrich] No products to enrich. Done!");
    return;
  }
  
  let batchNum = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    batchNum++;
    const batch = targets.slice(i, i + CONCURRENCY);
    
    const { rateLimited } = await processBatch(batch, products, productMap, checkpoint, config);
    
    if (checkpoint.stats.processed % LOG_INTERVAL === 0 || i + CONCURRENCY >= targets.length) {
      console.log(`[Enrich] Progress: ${checkpoint.stats.processed}/${targets.length} | Updated: ${checkpoint.stats.imagesUpdated} | Skipped: ${checkpoint.stats.skipped}`);
    }
    
    saveCheckpoint(checkpoint);
    
    if (rateLimited) {
      console.log("[Enrich] Rate limited! Waiting 60 seconds...");
      await delay(60000);
    } else if (i + CONCURRENCY < targets.length) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }
  
  if (!config.dryRun) {
    console.log("[Enrich] Saving products...");
    saveProducts(products);
  }
  
  console.log("\n============================================================");
  console.log("        ENRICHMENT COMPLETE");
  console.log("============================================================");
  console.log(`  Processed:       ${checkpoint.stats.processed}`);
  console.log(`  Images Updated:  ${checkpoint.stats.imagesUpdated}`);
  console.log(`  Videos Updated:  ${checkpoint.stats.videosUpdated}`);
  console.log(`  Skipped:         ${checkpoint.stats.skipped}`);
  console.log("============================================================\n");
  
  const stillZero = products.filter(p => countImages(p) === 0);
  if (stillZero.length > 0) {
    console.log(`\nProducts still with 0 images (${stillZero.length}):`);
    stillZero.slice(0, 20).forEach(p => {
      console.log(`  - ${p.id}: ${(p.title || p.name || "").slice(0, 50)}`);
    });
  }
}

main().catch(err => {
  console.error("[Enrich] Fatal error:", err);
  process.exit(1);
});
