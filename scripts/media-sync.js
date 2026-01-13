#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const MEDIA_DIR = path.join(__dirname, "..", "public", "media", "products");
const SYNC_STATUS_PATH = path.join(__dirname, "..", "data", "media-sync.json");

const CONCURRENCY = parseInt(process.env.MEDIA_SYNC_CONCURRENCY || "5", 10);
const MIN_FREE_MB = parseInt(process.env.MIN_FREE_MB || "500", 10);
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000;

let stats = {
  totalProducts: 0,
  productsWithLocalMedia: 0,
  imagesDownloaded: 0,
  imagesFailed: 0,
  bytesDownloaded: 0,
  skipped: 0
};

function checkStorageSpace() {
  try {
    const { execSync } = require("child_process");
    const df = execSync("df -m . | tail -1").toString();
    const parts = df.trim().split(/\s+/);
    const availableMB = parseInt(parts[3], 10);
    return availableMB;
  } catch (e) {
    console.warn("[WARN] Could not check disk space:", e.message);
    return Infinity;
  }
}

function downloadFile(url, destPath, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    
    const req = protocol.get(url, { timeout: TIMEOUT_MS }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          return downloadFile(redirectUrl, destPath, retries).then(resolve).catch(reject);
        }
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const fileStream = fs.createWriteStream(destPath);
      let bytes = 0;
      
      res.pipe(fileStream);
      res.on("data", (chunk) => { bytes += chunk.length; });
      
      fileStream.on("finish", () => {
        fileStream.close();
        resolve(bytes);
      });
      
      fileStream.on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
    
    req.on("error", (err) => {
      if (retries > 0) {
        setTimeout(() => {
          downloadFile(url, destPath, retries - 1).then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });
    
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

function generateLocalFilename(url, index) {
  const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 12);
  const ext = path.extname(url).toLowerCase().split("?")[0] || ".jpg";
  return `${index}_${hash}${ext}`;
}

async function syncProductMedia(product) {
  const productId = String(product.id);
  const productDir = path.join(MEDIA_DIR, productId);
  
  if (product.withLocalMedia && fs.existsSync(productDir)) {
    const files = fs.readdirSync(productDir).filter(f => !f.startsWith("."));
    if (files.length > 0) {
      stats.skipped++;
      return { skipped: true };
    }
  }
  
  const originalImages = product.originalImages || [];
  if (originalImages.length === 0) {
    return { skipped: true, reason: "no original images" };
  }
  
  if (!fs.existsSync(productDir)) {
    fs.mkdirSync(productDir, { recursive: true });
  }
  
  const localImages = [];
  let downloaded = 0;
  let failed = 0;
  
  for (let i = 0; i < originalImages.length; i++) {
    const url = originalImages[i];
    const filename = generateLocalFilename(url, i);
    const destPath = path.join(productDir, filename);
    
    if (fs.existsSync(destPath)) {
      localImages.push(`/media/products/${productId}/${filename}`);
      continue;
    }
    
    try {
      const bytes = await downloadFile(url, destPath);
      localImages.push(`/media/products/${productId}/${filename}`);
      stats.bytesDownloaded += bytes;
      downloaded++;
    } catch (e) {
      console.warn(`[WARN] Failed to download ${url}: ${e.message}`);
      failed++;
    }
  }
  
  stats.imagesDownloaded += downloaded;
  stats.imagesFailed += failed;
  
  return {
    downloaded,
    failed,
    localImages,
    withLocalMedia: localImages.length > 0
  };
}

async function processQueue(products) {
  const queue = [...products];
  const results = new Map();
  
  async function worker() {
    while (queue.length > 0) {
      const freeMB = checkStorageSpace();
      if (freeMB < MIN_FREE_MB) {
        console.warn(`[WARN] Low disk space: ${freeMB}MB available, stopping sync`);
        break;
      }
      
      const product = queue.shift();
      if (!product) break;
      
      try {
        const result = await syncProductMedia(product);
        results.set(String(product.id), result);
        
        if (result.downloaded > 0) {
          process.stdout.write(`\r[SYNC] ${results.size}/${products.length} products processed, ${stats.imagesDownloaded} images downloaded`);
        }
      } catch (e) {
        console.error(`[ERROR] Product ${product.id}: ${e.message}`);
      }
    }
  }
  
  const workers = Array(CONCURRENCY).fill(null).map(() => worker());
  await Promise.all(workers);
  
  console.log("");
  return results;
}

async function main() {
  console.log("=".repeat(60));
  console.log("[MEDIA SYNC] Starting media synchronization...");
  console.log(`[CONFIG] CONCURRENCY=${CONCURRENCY}, MIN_FREE_MB=${MIN_FREE_MB}`);
  console.log("=".repeat(60));
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("[ERROR] catalog.json not found at", CATALOG_PATH);
    process.exit(1);
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const products = catalog.products || [];
  stats.totalProducts = products.length;
  
  console.log(`[INFO] Found ${products.length} products in catalog`);
  
  const results = await processQueue(products);
  
  let updatedCount = 0;
  for (const product of products) {
    const result = results.get(String(product.id));
    if (result && result.localImages && result.localImages.length > 0) {
      product.images = result.localImages;
      product.withLocalMedia = true;
      product.mediaSource = "local";
      updatedCount++;
    }
  }
  
  if (updatedCount > 0) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), "utf8");
    console.log(`[INFO] Updated ${updatedCount} products in catalog.json`);
  }
  
  stats.productsWithLocalMedia = products.filter(p => p.withLocalMedia).length;
  
  const syncStatus = {
    lastSyncAt: new Date().toISOString(),
    stats: stats
  };
  fs.writeFileSync(SYNC_STATUS_PATH, JSON.stringify(syncStatus, null, 2), "utf8");
  
  console.log("=".repeat(60));
  console.log("[MEDIA SYNC] Complete!");
  console.log(`  Total products: ${stats.totalProducts}`);
  console.log(`  With local media: ${stats.productsWithLocalMedia}`);
  console.log(`  Images downloaded: ${stats.imagesDownloaded}`);
  console.log(`  Images failed: ${stats.imagesFailed}`);
  console.log(`  Bytes downloaded: ${(stats.bytesDownloaded / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Skipped (already local): ${stats.skipped}`);
  console.log("=".repeat(60));
}

main().catch(err => {
  console.error("[FATAL]", err);
  process.exit(1);
});
