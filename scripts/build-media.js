#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const MEDIA_ROOT = path.join(__dirname, "..", "public", "media", "products");

const CONCURRENCY_LIMIT = 10;
const DOWNLOAD_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const MAX_IMAGE_SIZE = 25 * 1024 * 1024;

let stats = {
  totalProducts: 0,
  totalImages: 0,
  downloaded: 0,
  skipped: 0,
  failed: 0,
  startTime: Date.now()
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function urlHash(url) {
  return crypto.createHash("md5").update(url).digest("hex").substring(0, 12);
}

function getExtFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      return ext;
    }
  } catch (e) {}
  return ".jpg";
}

function downloadFile(url, outPath) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== "string") {
      return reject(new Error("Invalid URL"));
    }
    
    const trimmed = url.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return reject(new Error("Invalid protocol"));
    }

    const parsedUrl = new URL(trimmed);
    const client = parsedUrl.protocol === "https:" ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      timeout: DOWNLOAD_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GetPawsy/2.0)",
        "Accept": "image/*,*/*"
      }
    };

    const req = client.get(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, outPath).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const contentLength = parseInt(res.headers["content-length"] || "0", 10);
      if (contentLength > MAX_IMAGE_SIZE) {
        res.destroy();
        return reject(new Error(`File too large: ${contentLength} bytes`));
      }

      ensureDir(path.dirname(outPath));
      const fileStream = fs.createWriteStream(outPath);
      let downloaded = 0;

      res.on("data", (chunk) => {
        downloaded += chunk.length;
        if (downloaded > MAX_IMAGE_SIZE) {
          res.destroy();
          fileStream.destroy();
          fs.unlinkSync(outPath);
          reject(new Error("Download exceeded size limit"));
        }
      });

      res.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();
        resolve(outPath);
      });
      fileStream.on("error", (err) => {
        fs.unlinkSync(outPath);
        reject(err);
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.on("error", reject);
  });
}

async function downloadWithRetry(url, outPath, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      await downloadFile(url, outPath);
      return true;
    } catch (err) {
      if (i === retries - 1) {
        return false;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return false;
}

async function processProductImages(product) {
  const productDir = path.join(MEDIA_ROOT, product.id);
  ensureDir(productDir);
  
  const originalImages = product.originalImages || product.images || [];
  const localImages = [];
  
  for (let i = 0; i < originalImages.length; i++) {
    const url = originalImages[i];
    if (!url || typeof url !== "string") continue;
    
    const hash = urlHash(url);
    const ext = getExtFromUrl(url);
    const filename = `${i}_${hash}${ext}`;
    const localPath = path.join(productDir, filename);
    const webPath = `/media/products/${product.id}/${filename}`;
    
    if (fs.existsSync(localPath)) {
      stats.skipped++;
      localImages.push(webPath);
      continue;
    }
    
    const success = await downloadWithRetry(url, localPath);
    if (success) {
      stats.downloaded++;
      localImages.push(webPath);
    } else {
      stats.failed++;
    }
  }
  
  return localImages;
}

async function processInBatches(products, batchSize = CONCURRENCY_LIMIT) {
  const updatedProducts = [];
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (product) => {
      const localImages = await processProductImages(product);
      return {
        ...product,
        images: localImages.length > 0 ? localImages : product.images,
        hasLocalMedia: localImages.length > 0 && localImages[0].startsWith("/media/")
      };
    }));
    
    updatedProducts.push(...results);
    
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    const progress = ((i + batch.length) / products.length * 100).toFixed(1);
    console.log(`[Media] Progress: ${progress}% (${i + batch.length}/${products.length}) | Downloaded: ${stats.downloaded} | Skipped: ${stats.skipped} | Failed: ${stats.failed} | Time: ${elapsed}s`);
  }
  
  return updatedProducts;
}

async function main() {
  console.log("[Media Build] Starting media download pipeline...");
  console.log(`[Media Build] Concurrency: ${CONCURRENCY_LIMIT}`);
  
  if (!fs.existsSync(CATALOG_FILE)) {
    console.error("[Media Build] FATAL: catalog.json not found");
    process.exit(1);
  }
  
  const catalogData = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
  const products = catalogData.products || [];
  
  stats.totalProducts = products.length;
  stats.totalImages = products.reduce((sum, p) => sum + (p.originalImages || p.images || []).length, 0);
  
  console.log(`[Media Build] Products: ${stats.totalProducts}`);
  console.log(`[Media Build] Total images to process: ${stats.totalImages}`);
  
  ensureDir(MEDIA_ROOT);
  
  const updatedProducts = await processInBatches(products);
  
  const updatedCatalog = {
    ...catalogData,
    products: updatedProducts,
    buildInfo: {
      mediaBuiltAt: new Date().toISOString(),
      totalProducts: stats.totalProducts,
      imagesDownloaded: stats.downloaded,
      imagesSkipped: stats.skipped,
      imagesFailed: stats.failed,
      hasLocalMedia: updatedProducts.filter(p => p.hasLocalMedia).length
    }
  };
  
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(updatedCatalog, null, 2));
  
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log("\n[Media Build] === COMPLETE ===");
  console.log(`[Media Build] Products processed: ${stats.totalProducts}`);
  console.log(`[Media Build] Images downloaded: ${stats.downloaded}`);
  console.log(`[Media Build] Images skipped (cached): ${stats.skipped}`);
  console.log(`[Media Build] Images failed: ${stats.failed}`);
  console.log(`[Media Build] Products with local media: ${updatedProducts.filter(p => p.hasLocalMedia).length}`);
  console.log(`[Media Build] Total time: ${elapsed}s`);
  console.log(`[Media Build] Catalog updated: ${CATALOG_FILE}`);
}

main().catch(err => {
  console.error("[Media Build] FATAL:", err);
  process.exit(1);
});
