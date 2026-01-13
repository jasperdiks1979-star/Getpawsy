"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { MEDIA_CONFIG } = require("../config/media");

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
  console.warn("[MediaService] Sharp not available, WEBP conversion disabled");
  sharp = null;
}

const ROOT_DIR = path.join(__dirname, "..", "..");
const MEDIA_DIR = path.join(ROOT_DIR, MEDIA_CONFIG.MEDIA_DIR);
const PRODUCTS_DIR = path.join(MEDIA_DIR, "products");
const THUMBS_DIR = path.join(MEDIA_DIR, "thumbs");
const INDEX_PATH = path.join(ROOT_DIR, MEDIA_CONFIG.MEDIA_INDEX_PATH);
const QUEUE_PATH = path.join(ROOT_DIR, MEDIA_CONFIG.MEDIA_QUEUE_PATH);

let mediaIndex = {};
let mediaQueue = { items: [], processing: [] };
let budgetExceeded = false;
let lastSyncAt = null;
let currentUsageBytes = 0;
let usageCacheTime = 0;

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"];

function isVideoUrl(url) {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.includes(ext));
}

function sanitizeImageUrl(urlInput) {
  if (!urlInput) return null;
  let url = urlInput;
  if (Array.isArray(url)) {
    url = url.find(u => typeof u === "string" && u.startsWith("http")) || url[0];
  }
  if (typeof url === "object" && url !== null) {
    url = url.url || url.src || url.href || null;
  }
  if (typeof url !== "string") return null;
  url = url.trim();
  if (url.startsWith("data:")) return null;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  if (MEDIA_CONFIG.SKIP_VIDEOS && isVideoUrl(url)) return null;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

function loadIndex() {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      mediaIndex = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
    }
  } catch (e) {
    console.warn("[MediaService] Could not load media index:", e.message);
    mediaIndex = {};
  }
}

function saveIndex() {
  try {
    const tempPath = INDEX_PATH + ".tmp";
    fs.writeFileSync(tempPath, JSON.stringify(mediaIndex, null, 2));
    fs.renameSync(tempPath, INDEX_PATH);
  } catch (e) {
    console.error("[MediaService] Could not save media index:", e.message);
  }
}

function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_PATH)) {
      mediaQueue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
      if (!mediaQueue.items) mediaQueue.items = [];
      if (!mediaQueue.processing) mediaQueue.processing = [];
    }
  } catch (e) {
    mediaQueue = { items: [], processing: [] };
  }
}

function saveQueue() {
  try {
    const tempPath = QUEUE_PATH + ".tmp";
    fs.writeFileSync(tempPath, JSON.stringify(mediaQueue, null, 2));
    fs.renameSync(tempPath, QUEUE_PATH);
  } catch (e) {
    console.error("[MediaService] Could not save queue:", e.message);
  }
}

function calculateMediaUsage() {
  const now = Date.now();
  if (now - usageCacheTime < 60000 && currentUsageBytes > 0) {
    return currentUsageBytes;
  }
  
  let totalBytes = 0;
  const dirs = [PRODUCTS_DIR, THUMBS_DIR];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          const subItems = fs.readdirSync(itemPath);
          for (const subItem of subItems) {
            try {
              const subStat = fs.statSync(path.join(itemPath, subItem));
              if (subStat.isFile()) totalBytes += subStat.size;
            } catch {}
          }
        } else {
          totalBytes += stat.size;
        }
      }
    } catch {}
  }
  
  currentUsageBytes = totalBytes;
  usageCacheTime = now;
  return totalBytes;
}

function checkBudget() {
  const usageMB = calculateMediaUsage() / (1024 * 1024);
  budgetExceeded = usageMB >= MEDIA_CONFIG.MEDIA_BUDGET_MB;
  return !budgetExceeded;
}

function downloadBuffer(url, timeout = 30000, retries = 2) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    
    const req = protocol.get(url, { timeout }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          return downloadBuffer(redirectUrl, timeout, retries).then(resolve).catch(reject);
        }
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("image")) {
        return reject(new Error(`Not an image: ${contentType}`));
      }
      
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    
    req.on("error", (err) => {
      if (retries > 0) {
        setTimeout(() => {
          downloadBuffer(url, timeout, retries - 1).then(resolve).catch(reject);
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

async function processImage(buffer, width, format = "webp") {
  if (!sharp) {
    return { buffer, format: "original" };
  }
  
  try {
    let processor = sharp(buffer).resize(width, null, { 
      withoutEnlargement: true,
      fit: "inside"
    });
    
    if (format === "webp") {
      processor = processor.webp({ quality: 85 });
    } else if (format === "jpeg" || format === "jpg") {
      processor = processor.jpeg({ quality: 85 });
    }
    
    const outputBuffer = await processor.toBuffer();
    return { buffer: outputBuffer, format };
  } catch (e) {
    console.warn("[MediaService] Sharp processing failed:", e.message);
    return { buffer, format: "original" };
  }
}

function generateFilename(productId, urlHash, type, format) {
  const ext = format === "original" ? ".jpg" : `.${format}`;
  return `${productId}_${urlHash}_${type}${ext}`;
}

async function downloadProductMedia(productId, imageUrls) {
  if (!checkBudget()) {
    console.log(`[MediaService] Budget exceeded, skipping ${productId}`);
    return { success: false, reason: "budget_exceeded" };
  }
  
  const validUrls = imageUrls
    .map(sanitizeImageUrl)
    .filter(Boolean)
    .slice(0, MEDIA_CONFIG.DOWNLOAD_THUMBS_ONLY ? 1 : MEDIA_CONFIG.MAX_IMAGES_PER_PRODUCT);
  
  if (validUrls.length === 0) {
    return { success: false, reason: "no_valid_urls" };
  }
  
  const productDir = path.join(PRODUCTS_DIR, String(productId));
  const thumbDir = THUMBS_DIR;
  
  if (!fs.existsSync(productDir)) fs.mkdirSync(productDir, { recursive: true });
  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
  
  const results = { main: null, thumb: null, gallery: [] };
  
  for (let i = 0; i < validUrls.length; i++) {
    const url = validUrls[i];
    const urlHash = crypto.createHash("md5").update(url).digest("hex").slice(0, 8);
    
    try {
      const buffer = await downloadBuffer(url);
      
      const { buffer: mainBuffer, format: mainFormat } = await processImage(
        buffer, 
        MEDIA_CONFIG.IMAGE_MAIN_WIDTH, 
        MEDIA_CONFIG.IMAGE_FORMAT
      );
      
      const mainFilename = generateFilename(productId, urlHash, "main", mainFormat === "original" ? "jpg" : mainFormat);
      const mainPath = path.join(productDir, mainFilename);
      fs.writeFileSync(mainPath, mainBuffer);
      
      const { buffer: thumbBuffer, format: thumbFormat } = await processImage(
        buffer,
        MEDIA_CONFIG.IMAGE_THUMB_WIDTH,
        MEDIA_CONFIG.IMAGE_FORMAT
      );
      
      const thumbFilename = generateFilename(productId, urlHash, "thumb", thumbFormat === "original" ? "jpg" : thumbFormat);
      const thumbPath = path.join(thumbDir, thumbFilename);
      fs.writeFileSync(thumbPath, thumbBuffer);
      
      const localMain = `/media/products/${productId}/${mainFilename}`;
      const localThumb = `/media/thumbs/${thumbFilename}`;
      
      if (i === 0) {
        results.main = localMain;
        results.thumb = localThumb;
      } else {
        results.gallery.push(localMain);
      }
      
    } catch (e) {
      console.warn(`[MediaService] Failed to download ${url}: ${e.message}`);
    }
  }
  
  if (results.main) {
    mediaIndex[productId] = {
      thumb: results.thumb,
      main: results.main,
      gallery: results.gallery,
      updatedAt: new Date().toISOString(),
      source: "local"
    };
    saveIndex();
    currentUsageBytes = 0;
    return { success: true, results };
  }
  
  return { success: false, reason: "download_failed" };
}

function enqueueProduct(productId, priority = 0, imageUrls = []) {
  loadQueue();
  
  const exists = mediaQueue.items.some(item => item.productId === productId) ||
                 mediaQueue.processing.some(item => item.productId === productId);
  
  if (exists) return false;
  
  mediaQueue.items.push({
    type: "productMedia",
    productId: String(productId),
    priority,
    imageUrls,
    createdAt: new Date().toISOString()
  });
  
  mediaQueue.items.sort((a, b) => b.priority - a.priority);
  saveQueue();
  return true;
}

function getProductMedia(productId) {
  loadIndex();
  return mediaIndex[String(productId)] || null;
}

function getStatus() {
  loadIndex();
  loadQueue();
  
  const usageBytes = calculateMediaUsage();
  const usageMB = (usageBytes / (1024 * 1024)).toFixed(2);
  
  let totalFiles = 0;
  for (const dir of [PRODUCTS_DIR, THUMBS_DIR]) {
    if (fs.existsSync(dir)) {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            totalFiles += fs.readdirSync(itemPath).length;
          } else {
            totalFiles++;
          }
        }
      } catch {}
    }
  }
  
  return {
    mediaMode: MEDIA_CONFIG.MEDIA_MODE,
    budgetMB: MEDIA_CONFIG.MEDIA_BUDGET_MB,
    usageMB: parseFloat(usageMB),
    usageBytes,
    budgetExceeded,
    totalFiles,
    productsIndexed: Object.keys(mediaIndex).length,
    queueLength: mediaQueue.items.length,
    processing: mediaQueue.processing.length,
    lastSyncAt,
    config: {
      thumbsOnly: MEDIA_CONFIG.DOWNLOAD_THUMBS_ONLY,
      mainWidth: MEDIA_CONFIG.IMAGE_MAIN_WIDTH,
      thumbWidth: MEDIA_CONFIG.IMAGE_THUMB_WIDTH,
      format: MEDIA_CONFIG.IMAGE_FORMAT,
      skipVideos: MEDIA_CONFIG.SKIP_VIDEOS,
      onDemand: MEDIA_CONFIG.ON_DEMAND_DOWNLOAD,
      concurrency: MEDIA_CONFIG.MEDIA_CONCURRENCY
    }
  };
}

let workerInterval = null;
let workerRunning = false;

async function processQueue() {
  if (workerRunning) return;
  if (!checkBudget()) return;
  
  loadQueue();
  
  if (mediaQueue.items.length === 0) return;
  
  workerRunning = true;
  
  const batch = mediaQueue.items.splice(0, MEDIA_CONFIG.MEDIA_CONCURRENCY);
  mediaQueue.processing = batch;
  saveQueue();
  
  for (const item of batch) {
    try {
      await downloadProductMedia(item.productId, item.imageUrls);
    } catch (e) {
      console.error(`[MediaService] Queue processing error for ${item.productId}:`, e.message);
    }
  }
  
  mediaQueue.processing = [];
  lastSyncAt = new Date().toISOString();
  saveQueue();
  
  workerRunning = false;
}

function startWorker() {
  if (workerInterval) return;
  
  loadIndex();
  loadQueue();
  
  workerInterval = setInterval(processQueue, 5000);
  console.log("[MediaService] Background worker started (5s interval)");
}

function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}

function rebuildIndex() {
  const newIndex = {};
  
  if (fs.existsSync(PRODUCTS_DIR)) {
    const productDirs = fs.readdirSync(PRODUCTS_DIR);
    for (const productId of productDirs) {
      const productPath = path.join(PRODUCTS_DIR, productId);
      try {
        if (!fs.statSync(productPath).isDirectory()) continue;
      } catch { continue; }
      
      const files = fs.readdirSync(productPath).filter(f => 
        !f.startsWith(".") && 
        (f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png") || f.endsWith(".webp") || f.endsWith(".gif"))
      );
      
      if (files.length === 0) continue;
      
      // First file is main, rest are gallery (compatible with existing naming scheme)
      const sortedFiles = files.sort();
      const mainFile = sortedFiles[0];
      const galleryFiles = sortedFiles.slice(1);
      
      // Check for thumb in thumbs dir
      let thumbPath = `/media/products/${productId}/${mainFile}`;
      if (fs.existsSync(THUMBS_DIR)) {
        const thumbFiles = fs.readdirSync(THUMBS_DIR).filter(f => f.startsWith(`${productId}_`));
        if (thumbFiles.length > 0) {
          thumbPath = `/media/thumbs/${thumbFiles[0]}`;
        }
      }
      
      newIndex[productId] = {
        main: `/media/products/${productId}/${mainFile}`,
        thumb: thumbPath,
        gallery: galleryFiles.map(f => `/media/products/${productId}/${f}`),
        updatedAt: new Date().toISOString(),
        source: "local"
      };
    }
  }
  
  mediaIndex = newIndex;
  saveIndex();
  currentUsageBytes = 0;
  
  return { indexed: Object.keys(newIndex).length };
}

loadIndex();
loadQueue();

module.exports = {
  sanitizeImageUrl,
  downloadProductMedia,
  enqueueProduct,
  getProductMedia,
  getStatus,
  startWorker,
  stopWorker,
  rebuildIndex,
  checkBudget,
  MEDIA_CONFIG
};
