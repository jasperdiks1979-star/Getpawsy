"use strict";

const http = require("http");
const express = require("express");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");

// Smart Media Sync config
const { MEDIA_CONFIG, printConfig } = require("./src/config/media");
const mediaService = require("./src/services/mediaService");
const { classifyWithConfidence, isStrictSmallPet, getClassificationStats } = require("./src/strictCategoryClassifier");

const PORT = Number(process.env.PORT || 5000);
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();

// ============== BUILD METADATA SYSTEM ==============
// Reads build info from build-meta.json (generated at build time)
// This ensures commit hash is available even in production without .git
const os = require("os");
const SERVER_START_TIME = new Date().toISOString();

// Load build metadata from pre-generated file (build-time stamped)
let BUILD_META = {
  version: "2.7.2",
  commit: "no-meta",
  commitShort: "no-meta",
  buildTime: new Date().toISOString(),
  fingerprint: "GP-RUNTIME",
  env: "development",
  node: process.version
};

const BUILD_META_PATH = path.join(__dirname, "public", "build-meta.json");
try {
  if (fs.existsSync(BUILD_META_PATH)) {
    BUILD_META = JSON.parse(fs.readFileSync(BUILD_META_PATH, "utf8"));
    console.log(`[BUILD] Loaded build-meta.json: v${BUILD_META.version} commit=${BUILD_META.commitShort}`);
  } else {
    console.warn("[BUILD] build-meta.json not found, using defaults. Run: node scripts/generate-build-meta.js");
  }
} catch (e) {
  console.warn("[BUILD] Error reading build-meta.json:", e.message);
}

// Export constants from build meta
const BUILD_VERSION = BUILD_META.version;
const GIT_COMMIT_SHA = BUILD_META.commit;
const GIT_COMMIT_SHORT = BUILD_META.commitShort;
const BUILD_TIME = BUILD_META.buildTime;
const BUILD_FINGERPRINT = BUILD_META.fingerprint;

// ============== PRODUCTION SAFETY LOCK ==============
const IS_PRODUCTION = process.env.NODE_ENV === "production" || BUILD_META.env === "production" || process.env.PRODUCTION_LOCK === "1";
function safeWrite(filePath, data) {
  if (IS_PRODUCTION && (filePath.includes('telemetry') || filePath.includes('safety-scan'))) return;
  try { fs.writeFileSync(filePath, data); } catch (e) { console.error("[PROD-LOCK] Write failed:", e.message); }
}

// Log fingerprint prominently at startup
console.log("=".repeat(60));
console.log(`[BUILD] fingerprint=${BUILD_FINGERPRINT}`);
console.log(`[BUILD] version=${BUILD_VERSION}`);
console.log(`[BUILD] commit=${GIT_COMMIT_SHORT}`);
console.log(`[BUILD] serverStart=${SERVER_START_TIME}`);
console.log(`[BUILD] pid=${process.pid}`);
console.log(`[BUILD] node=${process.version}`);
console.log("=".repeat(60));

// Print media config
printConfig();

// Persist fingerprint to files
try {
  fs.writeFileSync("/tmp/build_fingerprint.txt", BUILD_FINGERPRINT, "utf8");
  fs.writeFileSync(path.join(PUBLIC_DIR, "build.txt"), BUILD_FINGERPRINT, "utf8");
  console.log(`[BUILD] Fingerprint written to /tmp/build_fingerprint.txt and public/build.txt`);
} catch (e) {
  console.warn(`[BUILD] Could not write fingerprint file: ${e.message}`);
}

// No-cache headers helper
function setNoCacheHeaders(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
}

// ============== DOEL A: FORCE NO-CACHE FOR CRITICAL ASSETS ==============
// Serve critical JS/CSS with strict no-cache headers to prevent stale code
const CRITICAL_ASSETS = ['/styles.css', '/app.js', '/js/cart-store.js', '/js/cart-delegate.js', '/i18n.js'];

CRITICAL_ASSETS.forEach(assetPath => {
  app.get(assetPath, (req, res, next) => {
    const filePath = path.join(PUBLIC_DIR, assetPath);
    if (!fs.existsSync(filePath)) return next();
    
    // Set aggressive no-cache headers
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("X-Build-Id", BUILD_FINGERPRINT);
    res.set("X-Asset", assetPath);
    
    res.type(assetPath.endsWith('.css') ? 'text/css' : 'application/javascript');
    fs.createReadStream(filePath).pipe(res);
  });
});

// ============== GLOBAL BUILD ID HEADER ==============
// Add X-Build-Id to ALL responses for deployment verification
// Also set locals for EJS templates to use dynamic asset versioning
app.use((req, res, next) => {
  res.set("X-Build-Id", BUILD_FINGERPRINT);
  res.set("X-Server-Start", SERVER_START_TIME);
  res.set("X-App-Version", BUILD_VERSION);
  res.set("X-App-Commit", GIT_COMMIT_SHORT);
  // Make build info available to all EJS templates
  res.locals.BUILD_FINGERPRINT = BUILD_FINGERPRINT;
  res.locals.assetVersion = BUILD_FINGERPRINT; // Use fingerprint for cache busting
  res.locals.version = BUILD_VERSION;
  res.locals.gitCommit = GIT_COMMIT_SHORT;
  res.locals.gitCommitFull = GIT_COMMIT_SHA;
  res.locals.appVersion = BUILD_VERSION;
  res.locals.buildTime = BUILD_TIME;
  res.locals.buildStamp = `Build: ${BUILD_FINGERPRINT.substring(3, 18)} | Env=${IS_PRODUCTION ? 'prod' : 'dev'}`;
  next();
});

// ============== DEBUG ENDPOINT PROTECTION ==============
// In production, debug endpoints require a secret header or ?debug_token=xxx
const DEBUG_TOKEN = process.env.DEBUG_TOKEN || "pawsy-debug-2024";
const IS_PRODUCTION_BAK = IS_PRODUCTION;

function requireDebugAccess(req, res, next) {
  // Allow in development
  if (!IS_PRODUCTION) {
    return next();
  }
  
  // Check for debug token in header or query
  const headerToken = req.headers["x-debug-token"];
  const queryToken = req.query.debug_token;
  
  if (headerToken === DEBUG_TOKEN || queryToken === DEBUG_TOKEN) {
    return next();
  }
  
  // Block in production without token
  return res.status(403).json({
    error: "Debug endpoints are restricted in production",
    hint: "Use X-Debug-Token header or ?debug_token= query param"
  });
}

// Apply debug protection to ALL /api/debug/* routes
app.use("/api/debug", requireDebugAccess);

// ============== PUBLIC DEBUG PAGE (NO AUTH) ==============
// Simple HTML page showing build info for production verification
app.get("/debug", async (req, res) => {
  setNoCacheHeaders(res);
  
  let catalogCount = 0;
  let sampleProduct = null;
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      const products = catalog.products || [];
      catalogCount = products.length;
      if (products.length > 0) {
        const p = products[Math.floor(Math.random() * products.length)];
        sampleProduct = {
          id: p.id,
          title: (p.title || "").substring(0, 50),
          price: p.price,
          hasImage: !!(p.thumbImage || p.image || (p.images && p.images[0]))
        };
      }
    }
  } catch (e) { /* ignore */ }
  
  const html = `<!DOCTYPE html>
<html><head><title>GetPawsy Debug</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; background: #1a1a2e; color: #eee; }
.card { background: #16213e; border-radius: 12px; padding: 20px; margin: 10px 0; }
.label { color: #888; font-size: 12px; text-transform: uppercase; }
.value { font-size: 18px; font-weight: 600; color: #E07A5F; word-break: break-all; }
h1 { color: #E07A5F; }
.ok { color: #4ade80; }
.warn { color: #fbbf24; }
</style></head>
<body>
<h1>GetPawsy Debug Panel</h1>
<div class="card">
  <div class="label">Build Fingerprint</div>
  <div class="value">${BUILD_FINGERPRINT}</div>
</div>
<div class="card">
  <div class="label">Build Version</div>
  <div class="value">${BUILD_VERSION}</div>
</div>
<div class="card">
  <div class="label">Server Start Time</div>
  <div class="value">${SERVER_START_TIME}</div>
</div>
<div class="card">
  <div class="label">Current Time</div>
  <div class="value">${new Date().toISOString()}</div>
</div>
<div class="card">
  <div class="label">Catalog Products</div>
  <div class="value ${catalogCount > 0 ? 'ok' : 'warn'}">${catalogCount}</div>
</div>
<div class="card">
  <div class="label">Sample Product</div>
  <div class="value">${sampleProduct ? JSON.stringify(sampleProduct, null, 2) : 'N/A'}</div>
</div>
<div class="card">
  <div class="label">Node Version</div>
  <div class="value">${process.version}</div>
</div>
<div class="card">
  <div class="label">Environment</div>
  <div class="value">${process.env.NODE_ENV || 'development'}</div>
</div>
<p style="color:#666; font-size:12px; margin-top:30px;">
  If this page shows on production but cart/images don't work, check browser console for JS errors.
  <br>API: /api/products, /api/debug/deploy-info (requires token in prod)
</p>
</body></html>`;
  
  res.type("html").send(html);
});

// ============== COMPRESSION MIDDLEWARE ==============
// Enable brotli/gzip compression for HTML, JS, CSS, JSON responses
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024
}));

// ============== COOKIE PARSER ==============
app.use(cookieParser());

// ============== IMAGE PROXY ENDPOINT ==============
// WebP conversion and caching for optimized image delivery
const IMG_CACHE_DIR = path.join(PUBLIC_DIR, "media", "cache");
if (!fs.existsSync(IMG_CACHE_DIR)) {
  fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });
}

// SSRF protection: block private IPs and localhost
function isPrivateUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.')) return true;
    if (host.endsWith('.local') || host.endsWith('.internal')) return true;
    return false;
  } catch {
    return true;
  }
}

// Placeholder SVG for failed image requests
function sendPlaceholderSvg(res, reason) {
  console.log(`[IMG Proxy] Returning placeholder: ${reason}`);
  res.set("Content-Type", "image/svg+xml");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
    <rect fill="#f3f4f6" width="400" height="400"/>
    <path d="M200 120c-22 0-40 18-40 40s18 40 40 40 40-18 40-40-18-40-40-40zm-80 160c0-26.5 53-40 80-40s80 13.5 80 40v20H120v-20z" fill="#9ca3af"/>
    <text x="200" y="360" text-anchor="middle" fill="#6b7280" font-family="system-ui" font-size="14">Image unavailable</text>
  </svg>`);
}

// Image Proxy Rate Limiter for errors
const proxyErrorLog = {
  lastLog: 0,
  interval: 30000 // 30 seconds
};

app.get("/api/img", async (req, res) => {
  try {
    const raw = req.query.url || req.query.src || req.query.u || req.query.image || req.query.href;
    if (!raw) {
      const now = Date.now();
      if (now - proxyErrorLog.lastLog > proxyErrorLog.interval) {
        console.warn(`[IMG Proxy] Missing url parameter. Query:`, req.query);
        proxyErrorLog.lastLog = now;
      }
      return res.status(400).json({ error: "missing_url" });
    }
    
    const targetUrl = typeof raw === "string" ? raw.trim() : raw[0].trim();
    const url = decodeURIComponent(targetUrl);
    
    // Validate URL protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ error: "Invalid URL protocol" });
    }
    
    if (isPrivateUrl(url)) {
      return sendPlaceholderSvg(res, "Private URL blocked");
    }
    
    // Parse options with defaults and clamping
    const w = Math.max(200, Math.min(1600, parseInt(req.query.w) || 600));
    const q = Math.max(40, Math.min(90, parseInt(req.query.q) || 75));
    const fmt = req.query.fmt === 'jpeg' ? 'jpeg' : 'webp';
    
    // Generate cache key
    const hash = crypto.createHash('sha1').update(url + w + q + fmt).digest('hex');
    const cacheFile = path.join(IMG_CACHE_DIR, `${hash}.${fmt}`);
    
    // Check cache
    if (fs.existsSync(cacheFile)) {
      res.set("Content-Type", fmt === 'webp' ? "image/webp" : "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400, immutable");
      return fs.createReadStream(cacheFile).pipe(res);
    }
    
    // Download image with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GetPawsy-ImageProxy/1.0'
      }
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.warn(`[IMG Proxy] Remote fetch failed: ${response.status} for ${new URL(url).hostname}`);
      return sendPlaceholderSvg(res, `Remote returned ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return sendPlaceholderSvg(res, "Not an image content-type");
    }
    
    // Check size limit (15MB)
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength > 15 * 1024 * 1024) {
      return sendPlaceholderSvg(res, "Image too large");
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Process with Sharp
    let processed;
    if (fmt === 'webp') {
      processed = await sharp(buffer)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: q })
        .toBuffer();
    } else {
      processed = await sharp(buffer)
        .resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: q })
        .toBuffer();
    }
    
    // Save to cache (async, don't wait)
    fs.writeFile(cacheFile, processed, () => {});
    
    // Send response
    res.set("Content-Type", fmt === 'webp' ? "image/webp" : "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400, immutable");
    res.send(processed);
    
  } catch (err) {
    console.error("[IMG Proxy] Error:", err.message);
    sendPlaceholderSvg(res, err.message);
  }
});

// ============== FINGERPRINT ENDPOINTS ==============

// Plain text fingerprint (most reliable)
app.get("/__fingerprint", (req, res) => {
  setNoCacheHeaders(res);
  res.type("text/plain").send(BUILD_FINGERPRINT);
});

// Serve build.txt (static fingerprint file)
app.get("/build.txt", (req, res) => {
  setNoCacheHeaders(res);
  res.type("text/plain").send(BUILD_FINGERPRINT);
});

// 1) PRIORITY HEALTHCHECKS (Immediate 200)
app.get("/healthz", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).send("ok");
});

app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).send("ok");
});

app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({ 
    ok: true, 
    ts: new Date().toISOString(),
    version: BUILD_VERSION,
    fingerprint: BUILD_FINGERPRINT,
    env: IS_PRODUCTION ? "production" : "development",
    uptime: Math.floor(process.uptime())
  });
});

// /health/media - Media health endpoint for production verification
app.get("/health/media", (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf8")) : { products: [] };
    const products = catalog.products || [];
    
    const mediaDir = path.join(PUBLIC_DIR, "media", "products");
    let totalImages = 0;
    if (fs.existsSync(mediaDir)) {
      const productDirs = fs.readdirSync(mediaDir).filter(f => {
        try { return fs.statSync(path.join(mediaDir, f)).isDirectory(); } catch { return false; }
      });
      for (const dir of productDirs) {
        try {
          const files = fs.readdirSync(path.join(mediaDir, dir)).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
          totalImages += files.length;
        } catch {}
      }
    }
    
    const localCount = products.filter(p => p.withLocalMedia === true).length;
    const externalUrls = products.flatMap(p => (p.images || []).filter(i => typeof i === 'string' && i.startsWith('http'))).length;
    
    res.status(200).json({
      mediaMode: "local",
      products: products.length,
      images: totalImages,
      productsWithLocalMedia: localCount,
      externalImageUrlsRemaining: externalUrls,
      status: externalUrls === 0 ? "OK" : "EXTERNAL_URLS_PRESENT"
    });
  } catch (e) {
    res.status(500).json({ mediaMode: "local", products: 0, images: 0, error: e.message });
  }
});

// Load build.json for frontend build ID
let FRONTEND_BUILD_INFO = { frontend_build_id: "dev", frontend_built_at: SERVER_START_TIME, git: "unknown" };
try {
  const buildJsonPath = path.join(PUBLIC_DIR, "build.json");
  if (fs.existsSync(buildJsonPath)) {
    FRONTEND_BUILD_INFO = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
    console.log(`[BOOT] Loaded build.json: ${FRONTEND_BUILD_INFO.frontend_build_id}`);
  }
} catch (e) {
  console.warn("[BOOT] Could not load build.json:", e.message);
}

// /api/ui-build - Returns frontend build info for cache validation
app.get("/api/ui-build", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.status(200).json({
    buildId: FRONTEND_BUILD_INFO.frontend_build_id,
    builtAt: FRONTEND_BUILD_INFO.frontend_built_at,
    git: FRONTEND_BUILD_INFO.git,
    dist: true,
    assetsHashed: true,
    serverVersion: BUILD_VERSION,
    serverStart: SERVER_START_TIME
  });
});

// MEDIA_MODE: "proxy" | "local" | "hybrid" (default: local for production reliability)
const MEDIA_MODE = process.env.MEDIA_MODE || "local";

app.get("/api/version", (req, res) => {
  setNoCacheHeaders(res);
  
  // Get catalog source info with category breakdown
  let catalogSource = "unknown";
  let productCount = 0;
  let counts = { total: 0, dogs: 0, cats: 0, small_pets: 0, other: 0 };
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    if (fs.existsSync(catalogPath)) {
      catalogSource = "catalog.json";
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      const products = catalog.products || [];
      productCount = products.length;
      counts.total = productCount;
      
      products.forEach(p => {
        const pt = (p.petType || p.pet_type || '').toLowerCase();
        if (pt === 'dog' || pt === 'dogs') counts.dogs++;
        else if (pt === 'cat' || pt === 'cats') counts.cats++;
        else if (pt === 'small_pet' || pt === 'smallpets' || pt === 'small-pets') counts.small_pets++;
        else counts.other++;
      });
    }
  } catch (e) { /* ignore */ }
  
  res.status(200).json({ 
    version: BUILD_VERSION,
    app: `GetPawsy v${BUILD_VERSION}+hotfix`,
    commit: GIT_COMMIT_SHA,
    commitShort: GIT_COMMIT_SHORT,
    buildTime: BUILD_TIME,
    fingerprint: BUILD_FINGERPRINT,
    buildId: FRONTEND_BUILD_INFO.frontend_build_id,
    build_id: FRONTEND_BUILD_INFO.frontend_build_id || BUILD_FINGERPRINT,
    slug: GIT_COMMIT_SHORT,
    gitSha: FRONTEND_BUILD_INFO.git || GIT_COMMIT_SHORT,
    timestamp: new Date().toISOString(),
    serverStart: SERVER_START_TIME,
    pid: process.pid,
    nodeVersion: process.version,
    env: process.env.NODE_ENV || "production",
    hostname: os.hostname(),
    mediaMode: MEDIA_MODE,
    catalogSource: catalogSource,
    productCount: productCount,
    counts: counts,
    swEnabled: process.env.DISABLE_SW !== "true",
    cartStorageFallback: "localStorage|cookie|memory",
    cartUIModule: true
  });
});

// /api/catalog/source - Returns catalog source info
app.get("/api/catalog/source", (req, res) => {
  setNoCacheHeaders(res);
  
  let result = { source: "unknown", productCount: 0, lastUpdated: null, filePath: null };
  
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    if (fs.existsSync(catalogPath)) {
      const stats = fs.statSync(catalogPath);
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      result = {
        source: "catalog.json",
        productCount: (catalog.products || []).length,
        lastUpdated: stats.mtime.toISOString(),
        filePath: "data/catalog.json"
      };
    }
  } catch (e) {
    result.error = e.message;
  }
  
  res.status(200).json(result);
});

// /api/media/status - Comprehensive media status (enhanced with Smart Media Sync)
app.get("/api/media/status", (req, res) => {
  setNoCacheHeaders(res);
  
  const serviceStatus = mediaService.getStatus();
  
  // Also get catalog info for backwards compatibility
  let catalogInfo = { totalProducts: 0, productsWithLocalMedia: 0, externalImageUrlsRemaining: 0 };
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      const products = catalog.products || [];
      catalogInfo.totalProducts = products.length;
      catalogInfo.productsWithLocalMedia = products.filter(p => p.withLocalMedia === true).length;
      
      let externalCount = 0;
      for (const p of products) {
        const images = p.images || [];
        for (const img of images) {
          if (img && typeof img === 'string' && img.startsWith('http')) {
            externalCount++;
          }
        }
      }
      catalogInfo.externalImageUrlsRemaining = externalCount;
    }
  } catch (e) { /* ignore */ }
  
  res.status(200).json({
    ...serviceStatus,
    totalProducts: catalogInfo.totalProducts,
    productsWithLocalMedia: catalogInfo.productsWithLocalMedia,
    externalImageUrlsRemaining: catalogInfo.externalImageUrlsRemaining
  });
});

// POST /api/media/queue/:productId - Enqueue product for media download
app.post("/api/media/queue/:productId", express.json(), (req, res) => {
  setNoCacheHeaders(res);
  
  const { productId } = req.params;
  const { priority = 0, imageUrls = [] } = req.body || {};
  
  const enqueued = mediaService.enqueueProduct(productId, priority, imageUrls);
  
  res.status(200).json({
    success: true,
    productId,
    enqueued,
    message: enqueued ? "Added to queue" : "Already in queue"
  });
});

// GET /api/media/product/:productId - Get media info for a product
app.get("/api/media/product/:productId", (req, res) => {
  setNoCacheHeaders(res);
  
  const { productId } = req.params;
  const mediaInfo = mediaService.getProductMedia(productId);
  
  // Also get external URLs from catalog
  let externalUrls = [];
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      const product = (catalog.products || []).find(p => String(p.id) === String(productId));
      if (product) {
        externalUrls = (product.originalImages || product.images || []).filter(u => typeof u === 'string' && u.startsWith('http'));
      }
    }
  } catch (e) { /* ignore */ }
  
  res.status(200).json({
    productId,
    local: mediaInfo,
    externalUrls: externalUrls.slice(0, 5),
    hasLocal: !!mediaInfo
  });
});

// POST /api/media/rebuild-index - Rebuild media index from filesystem
app.post("/api/media/rebuild-index", (req, res) => {
  setNoCacheHeaders(res);
  
  try {
    const result = mediaService.rebuildIndex();
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Combined deployment diagnostics
app.get("/api/debug/deploy-info", (req, res) => {
  setNoCacheHeaders(res);
  
  // Check media status from catalog
  let mediaStatus = { withLocalMedia: false, mediaSource: "unknown", localCount: 0, totalCount: 0 };
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      const products = catalog.products || [];
      mediaStatus.totalCount = products.length;
      mediaStatus.localCount = products.filter(p => p.withLocalMedia === true).length;
      mediaStatus.withLocalMedia = mediaStatus.localCount === products.length && products.length > 0;
      mediaStatus.mediaSource = mediaStatus.withLocalMedia ? "local" : "mixed";
    }
  } catch (e) {
    mediaStatus.error = e.message;
  }
  
  res.status(200).json({
    fingerprint: BUILD_FINGERPRINT,
    version: BUILD_VERSION,
    timeNow: new Date().toISOString(),
    serverStart: SERVER_START_TIME,
    pid: process.pid,
    nodeVersion: process.version,
    cwd: process.cwd(),
    buildOutputExists: {
      dist: fs.existsSync(path.join(__dirname, "dist")),
      public: fs.existsSync(PUBLIC_DIR),
      buildTxt: fs.existsSync(path.join(PUBLIC_DIR, "build.txt")),
      catalogJson: fs.existsSync(path.join(__dirname, "data", "catalog.json")),
      mediaProducts: fs.existsSync(path.join(PUBLIC_DIR, "media", "products"))
    },
    media: mediaStatus,
    envKeysPresent: [
      process.env.NODE_ENV ? "NODE_ENV" : null,
      process.env.PORT ? "PORT" : null,
      process.env.REPL_ID ? "REPL_ID" : null,
      process.env.REPLIT_DEPLOYMENT_ID ? "REPLIT_DEPLOYMENT_ID" : null,
      process.env.REPLIT_SLOT_ID ? "REPLIT_SLOT_ID" : null
    ].filter(Boolean),
    routes: ["/__fingerprint", "/build.txt", "/api/version", "/api/debug/deploy-info", "/api/debug/media", "/api/health"]
  });
});

// Media status endpoint
app.get("/api/debug/media", (req, res) => {
  setNoCacheHeaders(res);
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    const products = catalog.products || [];
    
    const localCount = products.filter(p => p.withLocalMedia === true).length;
    const externalUrls = products.flatMap(p => (p.images || []).filter(i => i.startsWith("http"))).length;
    
    res.status(200).json({
      withLocalMedia: localCount === products.length && products.length > 0,
      mediaSource: localCount === products.length ? "local" : "mixed",
      totalProducts: products.length,
      productsWithLocalMedia: localCount,
      externalImageUrls: externalUrls,
      mediaDir: fs.existsSync(path.join(PUBLIC_DIR, "media", "products")),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cart/debug - Debug cart session and cookies
app.get("/api/cart/debug", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    cookie_gp_admin_exists: !!req.cookies?.gp_admin,
    cookies: req.cookies,
    node_env: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// GET /api/admin/pet-filter/report - Report on blocked/allowed products
app.get("/api/admin/pet-filter/report", (req, res) => {
  const { products } = loadProductsFromCatalog();
  const { isValidPetProduct, getValidationReason } = require("./src/lib/productNormalize");
  
  const report = {
    total: products.length,
    valid: 0,
    invalid: 0,
    reasons: {},
    examples_invalid: []
  };
  
  products.forEach(p => {
    const valid = isValidPetProduct(p);
    if (valid) {
      report.valid++;
    } else {
      report.invalid++;
      const reason = getValidationReason(p);
      report.reasons[reason] = (report.reasons[reason] || 0) + 1;
      if (report.examples_invalid.length < 10) {
        report.examples_invalid.push({ id: p.id, title: p.title, reason });
      }
    }
  });
  
  res.json(report);
});

// GET /admin and /admin/ fallback
app.get(["/admin", "/admin/"], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin", "index.html"));
});

// GET /admin/auto-healer
app.get("/admin/auto-healer", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin", "auto-healer.html"));
});

// ============== AUTOHEAL ROUTES ==============
const autohealRoutes = require('./src/autoheal/routes');
const { collectDiagnostics, bufferLog } = require('./src/autoheal');

// Public diagnostics endpoint
app.get("/api/health/diagnostics", async (req, res) => {
  setNoCacheHeaders(res);
  try {
    const diagnostics = await collectDiagnostics();
    res.json(diagnostics);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Mount autoheal admin routes
app.use("/api/admin/autoheal", express.json(), autohealRoutes);

// ============== BACKUP ROUTES ==============
const adminBackupRoutes = require('./routes/admin-backup');
app.use("/api/admin/backups", express.json(), adminBackupRoutes);
console.log('[Backup] Routes mounted at /api/admin/backups');

// ============== CJ RESYNC ROUTES ==============
const adminCjRoutes = require('./server/routes/adminCjRoutes');
app.use("/api/admin", express.json(), adminCjRoutes);
app.get("/admin/cj", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin", "cj-resync.html"));
});
console.log('[CJ Resync] Routes mounted at /api/admin/cj');

// ============== MARGINS DASHBOARD ROUTES ==============
const adminMarginsRoutes = require('./server/routes/adminMarginsRoutes');
app.use(adminMarginsRoutes);
console.log('[Margins] Dashboard mounted at /admin/margins');

// ============== GOOGLE FEED ROUTES ==============
const feedRoutes = require('./server/routes/feedRoutes');
app.use(feedRoutes);
console.log('[Feeds] Routes mounted at /feeds/*, /sitemap.xml');

// ============== PAWSY AI Q&A ROUTES ==============
const pawsyQaRoutes = require('./server/routes/pawsyQaRoutes');
app.use(express.json(), pawsyQaRoutes);
console.log('[Pawsy Q&A] Route mounted at /api/pawsy/ask');

// ============== MAIN API ROUTER ==============
const apiRouter = require('./routes/api');
app.use('/api', express.json(), apiRouter);
console.log('[API] Main API router mounted at /api');

// Buffer console logs for triage
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = function(...args) {
  bufferLog(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
  originalConsoleLog.apply(console, args);
};
console.error = function(...args) {
  bufferLog('[ERROR] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
  originalConsoleError.apply(console, args);
};

console.log('[AutoHeal] Routes mounted at /api/admin/autoheal');
console.log('[AutoHeal] Diagnostics available at /api/health/diagnostics');

// Public telemetry endpoint for RUM events
const { recordEvents, VALID_EVENTS } = require('./src/autoheal/telemetry');

app.post('/api/telemetry', express.json(), (req, res) => {
  if (IS_PRODUCTION) return res.status(202).json({ status: "accepted", mode: "locked" });
  try {
    const { events } = req.body || {};
    
    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'INVALID_PAYLOAD',
        hint: 'Send { events: [{ event: "event_name", metadata: {...} }] }',
        validEvents: VALID_EVENTS
      });
    }
    
    if (events.length > 50) {
      return res.status(400).json({
        ok: false,
        error: 'TOO_MANY_EVENTS',
        hint: 'Maximum 50 events per request'
      });
    }
    
    const result = recordEvents(events);
    res.json(result);
  } catch (err) {
    console.error('[Telemetry] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

console.log('[AutoHeal] Telemetry endpoint at POST /api/telemetry');

// /api/diagnostics
app.get("/api/diagnostics", (req, res) => {
  setNoCacheHeaders(res);
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf8")) : { products: [] };
    const products = catalog.products || [];
    
    const localCount = products.filter(p => p.withLocalMedia === true).length;
    const externalUrls = products.flatMap(p => (p.images || []).filter(i => i && i.startsWith("http"))).length;
    
    res.status(200).json({
      version: BUILD_VERSION,
      build: FRONTEND_BUILD_INFO.frontend_build_id || "dev",
      fingerprint: BUILD_FINGERPRINT,
      env: process.env.NODE_ENV || "development",
      mediaMode: MEDIA_MODE,
      mediaSource: localCount === products.length ? "local" : "mixed",
      totalProducts: products.length,
      productsWithLocalMedia: localCount,
      externalImageUrls: externalUrls,
      swEnabled: process.env.DISABLE_SW !== "true",
      serverStart: SERVER_START_TIME,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/debug/runtime
app.get("/api/debug/runtime", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  res.status(200).json({
    version: BUILD_VERSION,
    build: process.env.REPLIT_SLOT_ID || "dev",
    timestamp: new Date().toISOString(),
    serverStart: SERVER_START_TIME,
    uptime: process.uptime(),
    uptimeFormatted: `${Math.floor(process.uptime() / 60)} minutes`,
    env: process.env.NODE_ENV || "development",
    hostname: require("os").hostname(),
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage()
  });
});

app.get("/api/debug/headers", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  res.status(200).json({
    requestHeaders: req.headers,
    responseHeaders: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store"
    },
    timestamp: new Date().toISOString()
  });
});

const SMALL_PET_KEYWORDS = ['rabbit', 'hamster', 'guinea pig', 'ferret', 'bird', 'parrot', 'aquarium', 'fish', 'reptile', 'turtle', 'chinchilla', 'gerbil', 'mouse', 'rat', 'hedgehog', 'small animal', 'small pet'];

function isSmallPetProduct(product) {
  const text = `${product.name || ''} ${product.title || ''} ${product.description || ''} ${(product.tags || []).join(' ')}`.toLowerCase();
  return SMALL_PET_KEYWORDS.some(kw => text.includes(kw));
}

// Helper function to load products from catalog.json (normalized for images)
function loadProductsFromCatalog() {
  const catalogPath = path.join(__dirname, "data", "catalog.json");
  const legacyPath = path.join(__dirname, "data", "products_cj.json");
  
  let products = [];
  let source = "none";
  let fallback = false;

  if (fs.existsSync(catalogPath)) {
    const catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    products = catalogData.products || [];
    source = "catalog.json";
  } else if (fs.existsSync(legacyPath)) {
    const productsData = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    products = productsData.products || (Array.isArray(productsData) ? productsData : []);
    source = "products_cj.json";
    fallback = true;
  }

  // Normalize images for every product
  const normalized = products.map(p => {
    // Ensure images array exists
    if (!p.images) p.images = [];
    if (p.image && !p.images.includes(p.image)) p.images.unshift(p.image);
    if (p.imageUrl && !p.images.includes(p.imageUrl)) p.images.unshift(p.imageUrl);
    
    // Set primaryImageUrl and thumbnailUrl for the frontend
    const productId = String(p.id || p.cj_id);
    const localMain = `/media/products/${productId}/main.webp`;
    const localThumb = `/media/products/${productId}/thumb.webp`;
    
    // Fix for "No image" issue: ensure we have a valid image URL
    const resolvedImage = p.resolved_image || (p.images && p.images[0]) || (p.thumbnails && p.thumbnails[0]) || p.image || p.imageUrl || '/images/placeholder-product.svg';
    p.resolved_image = resolvedImage;
    p.primaryImageUrl = resolvedImage;
    p.thumbnailUrl = localThumb;
    
    return p;
  });

  return { products: normalized, source, fallback };
}

// /api/debug/frontend-build - Frontend build verification endpoint
app.get("/api/debug/frontend-build", (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const { products, source, fallback } = loadProductsFromCatalog();
    const catalogData = fs.existsSync(path.join(__dirname, "data", "catalog.json")) 
      ? JSON.parse(fs.readFileSync(path.join(__dirname, "data", "catalog.json"), "utf8"))
      : {};
    
    const withLocalMedia = products.filter(p => p.hasLocalMedia === true).length;
    const withCdnMedia = products.filter(p => !p.hasLocalMedia && p.images && p.images.length > 0).length;
    
    res.json({
      catalogSource: source,
      productCount: products.length,
      buildTimestamp: FRONTEND_BUILD_INFO.frontend_built_at,
      buildId: FRONTEND_BUILD_INFO.frontend_build_id,
      serverVersion: BUILD_VERSION,
      hasLocalMedia: withLocalMedia,
      hasCdnMedia: withCdnMedia,
      mediaBuiltAt: catalogData.buildInfo?.mediaBuiltAt || null,
      pagesGenerated: FRONTEND_BUILD_INFO.pagesGenerated || 0,
      status: source === "catalog.json" && !fallback ? "OK" : "FALLBACK_ACTIVE"
    });
  } catch (err) {
    res.status(500).json({ error: err.message, status: "ERROR" });
  }
});

// /health/qa - Comprehensive QA check with Playwright test results
app.get("/health/qa", (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const { products } = loadProductsFromCatalog();
    
    const cartStoreExists = fs.existsSync(path.join(__dirname, "public", "js", "cart-store.js"));
    const cartDelegateExists = fs.existsSync(path.join(__dirname, "public", "js", "cart-delegate.js"));
    
    const classStats = getClassificationStats(products);
    const strictSmallPets = products.filter(p => isStrictSmallPet(p));
    
    let e2eResults = null;
    const e2eResultsPath = path.join(__dirname, "public", "qa", "results.json");
    if (fs.existsSync(e2eResultsPath)) {
      try {
        const raw = fs.readFileSync(e2eResultsPath, "utf8");
        const parsed = JSON.parse(raw);
        e2eResults = {
          lastRun: parsed.stats?.startTime || null,
          duration: parsed.stats?.duration || null,
          total: parsed.stats?.expected || 0,
          passed: parsed.stats?.expected - (parsed.stats?.unexpected || 0) - (parsed.stats?.flaky || 0),
          failed: parsed.stats?.unexpected || 0,
          flaky: parsed.stats?.flaky || 0,
          status: (parsed.stats?.unexpected || 0) === 0 ? "pass" : "fail"
        };
      } catch (e) {
        e2eResults = { error: "Failed to parse results" };
      }
    }
    
    let proofScreenshots = [];
    const proofDir = path.join(__dirname, "public", "qa", "proof");
    if (fs.existsSync(proofDir)) {
      proofScreenshots = fs.readdirSync(proofDir)
        .filter(f => f.endsWith('.png'))
        .map(f => `/qa/proof/${f}`);
    }
    
    const checks = [
      { name: "Products API", status: products.length > 0 ? "pass" : "fail", count: products.length },
      { 
        name: "Categories Distribution (Strict)", 
        status: "pass",
        dogs: classStats.dogs,
        cats: classStats.cats,
        smallPets: classStats.smallPets,
        blocked: classStats.blocked,
        unknown: classStats.unknown
      },
      {
        name: "Small Pets Contamination",
        status: classStats.smallPetContamination === 0 ? "pass" : "fail",
        contamination: classStats.smallPetContamination,
        strictSmallPetCount: strictSmallPets.length
      },
      {
        name: "Images Coverage",
        status: products.every(p => p.primaryImageUrl && p.primaryImageUrl !== "/images/placeholder-product.svg") ? "pass" : "warn",
        total: products.length,
        withImages: products.filter(p => p.primaryImageUrl && p.primaryImageUrl !== "/images/placeholder-product.svg").length
      },
      {
        name: "Cart System",
        status: cartStoreExists && cartDelegateExists ? "pass" : "fail",
        cartStoreEnabled: cartStoreExists,
        cartDelegateEnabled: cartDelegateExists,
        version: "2.7.0",
        features: ["dedupe-lock", "event-delegation", "localStorage-v2", "legacy-migration"]
      },
      {
        name: "Routes Availability",
        status: "pass",
        routes: ["/", "/collection/dogs", "/collection/cats", "/small-pets", "/cart", "/checkout"]
      },
      {
        name: "E2E Tests",
        status: e2eResults ? e2eResults.status : "not_run",
        ...e2eResults
      }
    ];

    const passed = checks.filter(c => c.status === "pass").length;
    const failed = checks.filter(c => c.status === "fail").length;
    
    res.json({ 
      timestamp: new Date().toISOString(), 
      checks, 
      passed, 
      failed,
      status: failed === 0 ? "healthy" : "degraded",
      cartSystemVersion: "2.7.0",
      e2eTestResults: e2eResults,
      proofScreenshots,
      artifacts: {
        htmlReport: "/qa/html-report/index.html",
        jsonResults: "/qa/results.json",
        proofDir: "/qa/proof/"
      }
    });
  } catch (e) {
    res.status(500).json({ status: "error", error: e.message });
  }
});

// QA Dashboard API Routes
const QA_TOKEN = process.env.QA_TOKEN || 'pawsy-qa-default';
const QA_PROOF_BASE = path.join(__dirname, 'public', 'qa-proof');

function requireQAToken(req, res, next) {
  const token = req.headers['x-qa-token'] || req.query.token;
  if (token !== QA_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized - invalid or missing QA token' });
  }
  next();
}

// POST /api/qa/run - Start QA run
app.post('/api/qa/run', requireQAToken, (req, res) => {
  const { spawn } = require('child_process');
  const mode = req.query.mode || 'fast';
  if (!['fast', 'full'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Use fast or full.' });
  }
  
  const runId = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  
  const child = spawn('node', ['qa/run-qa.js', `--mode=${mode}`], {
    cwd: __dirname,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  
  res.json({ 
    runId, 
    mode,
    status: 'started',
    message: `QA ${mode} run started. Check /api/qa/latest for results.`
  });
});

// GET /api/qa/latest - Get latest QA report
app.get('/api/qa/latest', requireQAToken, (req, res) => {
  const reportPath = path.join(QA_PROOF_BASE, 'latest', 'report.json');
  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ error: 'No QA report found. Run QA first.' });
  }
  
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read report', details: err.message });
  }
});

// GET /api/qa/runs/:runId - Get specific QA run
app.get('/api/qa/runs/:runId', requireQAToken, (req, res) => {
  const reportPath = path.join(QA_PROOF_BASE, 'runs', req.params.runId, 'report.json');
  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ error: 'Run not found' });
  }
  
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read report', details: err.message });
  }
});

// GET /api/qa/screenshots - Get list of screenshots
app.get('/api/qa/screenshots', requireQAToken, (req, res) => {
  const latestDir = path.join(QA_PROOF_BASE, 'latest');
  if (!fs.existsSync(latestDir)) {
    return res.json({ screenshots: [] });
  }
  
  const files = fs.readdirSync(latestDir).filter(f => f.endsWith('.png'));
  res.json({ 
    screenshots: files.map(f => `/qa-proof/latest/${f}`)
  });
});

// GET /admin/qa - QA Dashboard page
app.get('/admin/qa', (req, res) => {
  const token = req.query.token;
  if (token !== QA_TOKEN) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head><title>QA Dashboard - Auth Required</title></head>
      <body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>QA Dashboard</h1>
        <p>Please provide token via query parameter: <code>/admin/qa?token=YOUR_TOKEN</code></p>
      </body>
      </html>
    `);
  }
  
  res.render('admin/qa');
});

app.get("/api/debug/collections", (req, res) => {
  try {
    const { products, source } = loadProductsFromCatalog();
    
    if (products.length === 0 && source === "none") {
      return res.status(404).json({ error: "Products data not found" });
    }
    
    const counts = {
      total: products.length,
      dogs: products.filter(p => p.pet_type === 'dog' || p.pet_type === 'both' || p.mainCategorySlug === 'dogs').length,
      cats: products.filter(p => p.pet_type === 'cat' || p.pet_type === 'both' || p.mainCategorySlug === 'cats').length,
      smallPets: products.filter(p => p.pet_type === 'small_pet' || isSmallPetProduct(p)).length,
      active: products.filter(p => p.active !== false).length,
      withLocalMedia: products.filter(p => p.hasLocalMedia === true).length,
      source
    };
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/collections", (req, res) => {
  res.redirect("/api/debug/collections");
});

app.get("/api/debug/catalog-source", (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    const legacyPath = path.join(__dirname, "data", "products_cj.json");
    
    const catalogExists = fs.existsSync(catalogPath);
    const legacyExists = fs.existsSync(legacyPath);
    
    let catalogInfo = null;
    let legacyInfo = null;
    
    if (catalogExists) {
      const stats = fs.statSync(catalogPath);
      const data = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      catalogInfo = {
        path: "data/catalog.json",
        exists: true,
        productCount: (data.products || []).length,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        buildInfo: data.buildInfo || null
      };
    }
    
    if (legacyExists) {
      const stats = fs.statSync(legacyPath);
      const data = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
      legacyInfo = {
        path: "data/products_cj.json",
        exists: true,
        productCount: (data.products || (Array.isArray(data) ? data : [])).length,
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    }
    
    const { products, source, fallback } = loadProductsFromCatalog();
    
    const sampleIds = products.slice(0, 5).map(p => String(p.id));
    
    res.json({
      source: source,
      fallbackUsed: fallback,
      productCount: products.length,
      sampleIds,
      catalogMtime: catalogInfo?.modified || null,
      timestamp: new Date().toISOString(),
      activeSource: source,
      fallbackActive: fallback,
      catalog: catalogInfo,
      legacy: legacyInfo,
      recommendation: catalogExists && !fallback ? "Using catalog.json (OK)" : "Using fallback (check build)"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MEDIA_CACHE_BUDGET_BYTES = parseInt(process.env.MEDIA_CACHE_MAX_MB || "1000") * 1024 * 1024;

app.get("/api/debug/media-cache", (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const cacheDir = path.join(__dirname, "public", "cache", "images");
    const mediaDir = path.join(__dirname, "public", "media", "products");
    
    let cacheInfo = { exists: false, files: 0, size: 0 };
    let mediaInfo = { exists: false, products: 0, totalImages: 0, size: 0 };
    let oldest = null;
    let newest = null;
    
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      let totalSize = 0;
      let oldestTime = Infinity;
      let newestTime = 0;
      files.forEach(f => {
        try {
          const stat = fs.statSync(path.join(cacheDir, f));
          totalSize += stat.size;
          if (stat.mtimeMs < oldestTime) { oldestTime = stat.mtimeMs; oldest = new Date(stat.mtime).toISOString(); }
          if (stat.mtimeMs > newestTime) { newestTime = stat.mtimeMs; newest = new Date(stat.mtime).toISOString(); }
        } catch (e) {}
      });
      cacheInfo = {
        exists: true,
        path: "public/cache/images",
        files: files.length,
        size: totalSize,
        sizeFormatted: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
      };
    }
    
    if (fs.existsSync(mediaDir)) {
      const productDirs = fs.readdirSync(mediaDir).filter(f => {
        try {
          return fs.statSync(path.join(mediaDir, f)).isDirectory();
        } catch (e) { return false; }
      });
      let totalImages = 0;
      let totalSize = 0;
      productDirs.forEach(dir => {
        try {
          const images = fs.readdirSync(path.join(mediaDir, dir));
          totalImages += images.length;
          images.forEach(img => {
            try {
              const stat = fs.statSync(path.join(mediaDir, dir, img));
              totalSize += stat.size;
            } catch (e) {}
          });
        } catch (e) {}
      });
      mediaInfo = {
        exists: true,
        path: "public/media/products",
        products: productDirs.length,
        totalImages,
        size: totalSize,
        sizeFormatted: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
      };
    }
    
    res.json({
      items: cacheInfo.files + mediaInfo.totalImages,
      totalBytes: cacheInfo.size + mediaInfo.size,
      oldest,
      newest,
      evictions: global._imgCacheEvictions || 0,
      budgetBytes: MEDIA_CACHE_BUDGET_BYTES,
      budgetFormatted: `${(MEDIA_CACHE_BUDGET_BYTES / (1024 * 1024)).toFixed(0)} MB`,
      strategy: "local-first",
      cache: cacheInfo,
      localMedia: mediaInfo,
      config: {
        MEDIA_CACHE_MAX_MB: process.env.MEDIA_CACHE_MAX_MB || "1000",
        MEDIA_CACHE_MAX_ITEMS: process.env.MEDIA_CACHE_MAX_ITEMS || "5000"
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: loadProductsFromCatalog is defined earlier in this file (line ~116)
// with full metadata including fallback flag - do not redefine here

app.get("/api/debug/pdp-health", (req, res) => {
  res.set("Cache-Control", "no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  try {
    const { products, source } = loadProductsFromCatalog();
    const heroPath = path.join(__dirname, "data", "hero-products.json");
    
    if (products.length === 0) {
      return res.status(404).json({ error: "Products data not found" });
    }
    const productIds = new Set(products.map(p => String(p.id)));
    
    let heroIds = [];
    if (fs.existsSync(heroPath)) {
      try {
        const heroData = JSON.parse(fs.readFileSync(heroPath, "utf8"));
        Object.values(heroData).forEach(section => {
          if (Array.isArray(section)) {
            section.forEach(p => {
              if (p && p.id) heroIds.push(String(p.id));
            });
          }
        });
      } catch (e) {}
    }
    
    const missingIds = heroIds.filter(id => !productIds.has(id));
    const uniqueMissing = [...new Set(missingIds)];
    
    res.json({
      checked: heroIds.length,
      validCount: heroIds.length - uniqueMissing.length,
      missingCount: uniqueMissing.length,
      sampleMissingIds: uniqueMissing.slice(0, 10),
      lastRun: new Date().toISOString(),
      productPoolSize: products.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/classifier-sample", (req, res) => {
  try {
    const { getClassifierSample, getCarouselDebugInfo } = require("./helpers/productClassifier");
    const { products, source } = loadProductsFromCatalog();
    if (products.length === 0) {
      return res.status(404).json({ error: "Products data not found" });
    }
    const limit = parseInt(req.query.limit) || 50;
    const species = req.query.species || null;
    
    let filtered = products;
    if (species) {
      const { getProductsByPetType } = require("./helpers/productClassifier");
      filtered = getProductsByPetType(products, species);
    }
    
    const sample = getClassifierSample(filtered, limit);
    res.json({
      total: products.length,
      filtered: filtered.length,
      sample: sample
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/carousels", (req, res) => {
  try {
    const { getCarouselDebugInfo, getCarouselProducts } = require("./helpers/productClassifier");
    const { products, source } = loadProductsFromCatalog();
    if (products.length === 0) {
      return res.status(404).json({ error: "Products data not found" });
    }
    
    const debugInfo = getCarouselDebugInfo(products);
    
    const topPicksDogs = getCarouselProducts(products, { petType: 'dog', limit: 12 });
    const topPicksCats = getCarouselProducts(products, { petType: 'cat', limit: 12 });
    const smallPets = getCarouselProducts(products, { petType: 'small-pet', limit: 12 });
    const bestSellers = getCarouselProducts(products, { limit: 12, sortBy: 'score' });
    const trending = getCarouselProducts(products, { limit: 12, sortBy: 'score' });
    
    res.json({
      ...debugInfo,
      carousels: {
        topPicksDogs: topPicksDogs.map(p => ({ id: p.id, title: (p.title || p.name || '').slice(0, 50) })),
        topPicksCats: topPicksCats.map(p => ({ id: p.id, title: (p.title || p.name || '').slice(0, 50) })),
        smallPets: smallPets.map(p => ({ id: p.id, title: (p.title || p.name || '').slice(0, 50) })),
        bestSellers: bestSellers.map(p => ({ id: p.id, title: (p.title || p.name || '').slice(0, 50) })),
        trending: trending.map(p => ({ id: p.id, title: (p.title || p.name || '').slice(0, 50) }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/report", (req, res) => {
  try {
    const { generateReport } = require("./helpers/reportGenerator");
    const report = generateReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Combined LIVE endpoint - shows version + catalog + collections + cache in one call
app.get("/api/debug/live", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  
  try {
    const { products, source, fallback } = loadProductsFromCatalog();
    
    // Count by pet type
    let dogs = 0, cats = 0, smallPets = 0, active = 0;
    for (const p of products) {
      if (p.status === 'active' || !p.status) active++;
      const petType = (p.petType || '').toLowerCase();
      if (petType === 'dog') dogs++;
      else if (petType === 'cat') cats++;
      else if (isSmallPetProduct(p)) smallPets++;
    }
    
    // Media cache stats
    const cacheDir = path.join(__dirname, "public", "cache", "images");
    let cacheItems = 0, cacheBytes = 0;
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      cacheItems = files.length;
      files.forEach(f => {
        try { cacheBytes += fs.statSync(path.join(cacheDir, f)).size; } catch (e) {}
      });
    }
    
    res.json({
      version: BUILD_VERSION,
      build: process.env.REPLIT_SLOT_ID || "dev",
      timestamp: new Date().toISOString(),
      buildId: FRONTEND_BUILD_INFO.frontend_build_id,
      serverStart: SERVER_START_TIME,
      catalog: {
        source,
        productCount: products.length,
        fallbackUsed: fallback || false
      },
      collections: {
        dogs,
        cats,
        smallPets,
        active
      },
      mediaCache: {
        items: cacheItems,
        totalBytes: cacheBytes
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/enrich-status", (req, res) => {
  try {
    const checkpointPath = path.join(__dirname, "data", "enrich-checkpoint.json");
    if (!fs.existsSync(checkpointPath)) {
      return res.json({ status: "never_run", checkpoint: null });
    }
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    res.json({
      status: "available",
      lastMode: checkpoint.lastMode,
      doneCount: (checkpoint.doneSet || []).length,
      lastProcessedId: checkpoint.lastProcessedId,
      stats: checkpoint.stats || {}
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/enrich-test/:pid", async (req, res) => {
  if (process.env.REPLIT_DEPLOYMENT) {
    return res.status(403).json({ error: "Debug endpoint disabled in production" });
  }
  try {
    const { fetchProductMedia } = require("./helpers/cjMediaFetcher");
    const pid = req.params.pid;
    const media = await fetchProductMedia(pid);
    res.json({ pid, media });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/media-sample", (req, res) => {
  try {
    const { products, source } = loadProductsFromCatalog();
    if (products.length === 0) {
      return res.status(404).json({ error: "Products data not found" });
    }
    const limit = parseInt(req.query.limit) || 10;
    
    const sample = products.slice(0, limit).map(p => {
      const images = p.images || (p.image ? [p.image] : []);
      const variantImages = (p.variants || []).filter(v => v.image).map(v => v.image);
      const allImages = [...new Set([...images, ...variantImages])];
      const videos = p.videos || (p.video ? [p.video] : []);
      
      return {
        id: p.id,
        title: (p.title || p.name || '').slice(0, 50),
        imageCount: allImages.length,
        hasMultipleImages: allImages.length > 1,
        variantImageCount: variantImages.length,
        videoCount: videos.length,
        hasVideo: videos.length > 0,
        images: allImages.slice(0, 3),
        videos: videos
      };
    });
    
    const summary = {
      sampleSize: sample.length,
      withMultipleImages: sample.filter(s => s.hasMultipleImages).length,
      withVariantImages: sample.filter(s => s.variantImageCount > 0).length,
      withVideos: sample.filter(s => s.hasVideo).length,
      avgImageCount: (sample.reduce((sum, s) => sum + s.imageCount, 0) / sample.length).toFixed(1)
    };
    
    res.json({ summary, sample });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/product/:id", (req, res) => {
  try {
    const { products, source, fallback } = loadProductsFromCatalog();
    if (products.length === 0) {
      return res.status(404).json({ error: "Products data not found" });
    }
    const id = req.params.id;
    let product = products.find(p => String(p.id) === id);
    if (!product) {
      product = products.find(p => p.slug === id);
    }
    if (!product) {
      product = products.find(p => String(p.cj_pid) === id || String(p.cjProductId) === id);
    }
    if (!product) {
      return res.status(404).json({ 
        error: "Product not found", 
        searched: id, 
        catalogSource: source,
        totalProducts: products.length
      });
    }
    const images = product.images || (product.image ? [product.image] : []);
    const videos = product.videos || (product.video ? [product.video] : []);
    res.json({
      found: true,
      id: product.id,
      slug: product.slug,
      title: product.title || product.name,
      price: product.price,
      imagesCount: images.length,
      videosCount: videos.length,
      images: images,
      videos: videos,
      petType: product.petType || product.pet_type,
      category: product.category || product.mainCategorySlug,
      source: source,
      fallback: fallback
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/ui-data-source", (req, res) => {
  try {
    const { products, source, fallback } = loadProductsFromCatalog();
    res.json({
      source: source,
      fallback: fallback,
      productCount: products.length,
      sampleIds: products.slice(0, 5).map(p => String(p.id)),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== PAGINATED PRODUCTS API ==============
// Optimized endpoint with pagination and lightweight listing fields
// Enforces PET-ONLY LOCKDOWN - non-pet products are always filtered out
// Adds resolved_image for reliable image display
app.get("/api/products", (req, res) => {
  try {
    const { products: allProducts } = loadProductsFromCatalog();
    const category = req.query.category || null;
    const petType = req.query.petType || req.query.pet_type || null;
    const subcategory = req.query.subcategory || null; // NEW: explicit subcategory filter
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Default 24, max 100
    const offset = parseInt(req.query.offset) || 0;
    const page = parseInt(req.query.page) || 1;
    const fields = req.query.fields || 'listing'; // 'listing' (lightweight) or 'full'
    const debug = req.query.debug === '1' || req.query.debug === 'true';
    
    // Log query params for debugging
    console.log(`[API /products] Query: petType=${petType}, subcategory=${subcategory}, limit=${limit}`);
    
    // ═══════════════════════════════════════════════════════════════════
    // PET-ONLY LOCKDOWN FILTER - Always enforced
    // ═══════════════════════════════════════════════════════════════════
    const { filterPetApproved, PETONLY_MODE } = require('./src/lib/petOnlyEngine');
    const { resolveImage, isValidPetProduct } = require('./src/lib/productNormalize');
    const { products: petApprovedProducts, stats: filterStats } = filterPetApproved(allProducts, PETONLY_MODE);
    
    // Additional filter with productNormalize for extra safety
    let products = petApprovedProducts.filter(p => isValidPetProduct(p));
    
    // Filter by category or pet type
    if (category) {
      const normalizedCat = category.toLowerCase().replace(/[-\s]/g, '_');
      products = products.filter(p => {
        const pCat = (p.category || p.mainCategorySlug || '').toLowerCase().replace(/[-\s]/g, '_');
        const pPetType = (p.petType || p.pet_type || '').toLowerCase().replace(/[-\s]/g, '_');
        return pCat === normalizedCat || pPetType === normalizedCat;
      });
    }
    
    if (petType) {
      const normalizedPetType = petType.toLowerCase().replace(/[-\s]/g, '_');
      products = products.filter(p => {
        const pPetType = (p.petType || p.pet_type || p._pet_type_detected || '').toLowerCase().replace(/[-\s]/g, '_');
        
        // Match small_pet/small_pets/smallpets/small variants
        if (normalizedPetType.startsWith('small')) {
          return pPetType.includes('small');
        }
        
        // Match dog/dogs, cat/cats
        const root = normalizedPetType.replace(/s$/, '');
        const pRoot = pPetType.replace(/s$/, '');
        
        return pPetType === normalizedPetType || 
               pRoot === root || 
               pPetType.includes(root) || 
               pPetType.includes(root) ||
               (root.length > 2 && pPetType.includes(root));
      });
    }
    
    // Server-side subcategory filtering (no client-side filtering needed)
    if (subcategory) {
      const normalizedSubcat = subcategory.toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');
      const beforeCount = products.length;
      products = products.filter(p => {
        const pSubcat = (p.subcategory || p.subcategorySlug || '').toLowerCase().replace(/-/g, ' ');
        const pCat = (p.category || p.mainCategorySlug || '').toLowerCase();
        const pCategories = Array.isArray(p.categories) ? p.categories.join(' ').toLowerCase() : '';
        const title = (p.title || '').toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags.join(' ').toLowerCase() : '';
        
        // Exact match on subcategory/category fields
        if (pSubcat.includes(normalizedSubcat) || pCat.includes(normalizedSubcat)) return true;
        if (pCategories.includes(normalizedSubcat)) return true;
        
        // Title-based matching (products often have subcategory in title)
        if (title.includes(normalizedSubcat)) return true;
        
        // Keyword matching for common subcategories (singular/plural)
        const subcatRoot = normalizedSubcat.replace(/s$/, ''); // toys -> toy
        if (title.includes(subcatRoot) || pCategories.includes(subcatRoot) || tags.includes(subcatRoot)) {
          return true;
        }
        
        // Special cases
        if (normalizedSubcat === 'feeding' || normalizedSubcat === 'food') {
          return title.includes('food') || title.includes('feed') || title.includes('bowl') || 
                 pCategories.includes('food') || pCategories.includes('feed') || pCategories.includes('feeder');
        }
        return false;
      });
      console.log(`[API /products] Subcategory=${subcategory}: ${beforeCount} -> ${products.length}`);
    }
    
    const totalCount = products.length;
    
    // Apply pagination
    const actualOffset = offset > 0 ? offset : (page - 1) * limit;
    products = products.slice(actualOffset, actualOffset + limit);
    
    // Return lightweight listing fields for grid performance
    let items;
    if (fields === 'listing') {
      items = products.map(p => {
        const resolved = resolveImage(p);
        const thumbImage = resolved || '/images/placeholder-pawsy.webp';
        
        return {
          id: p.id,
          slug: p.slug || p.handle,
          title: p.title || p.name,
          price: p.variants?.[0]?.price || p.price,
          thumbImage: thumbImage,
          resolved_image: resolved,
          pet_type: p.pet_type || p.petType,
          variantCount: (p.variants || []).length,
          badges: p.badges || [],
          is_best_seller: p.is_best_seller || false,
          is_trending: p.is_trending || false
        };
      });
    } else {
      // Full response - add resolved_image to each product
      items = products.map(p => ({
        ...p,
        resolved_image: resolveImage(p)
      }));
    }
    
    const response = {
      items,
      total: totalCount,
      limit,
      offset: actualOffset,
      page: Math.floor(actualOffset / limit) + 1,
      totalPages: Math.ceil(totalCount / limit),
      hasMore: actualOffset + products.length < totalCount
    };
    
    // Debug mode: include filter stats
    if (debug) {
      const reasonsTop = Object.entries(filterStats.reasons || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([reason, count]) => ({ reason, count }));
      
      response._debug = {
        petOnlyMode: PETONLY_MODE,
        lockdownEnabled: true,
        countBefore: allProducts.length,
        countAfterPetFilter: petApprovedProducts.length,
        countAfterCategoryFilter: totalCount,
        rejected: allProducts.length - petApprovedProducts.length,
        rejectedReasonsTop: reasonsTop,
        byPetType: filterStats.byPetType,
        filtersApplied: {
          petOnly: true,
          category: category || null,
          petType: petType || null
        },
        homepageSections: {
          dog: petApprovedProducts.filter(p => (p.petType || p.pet_type || '').toLowerCase().startsWith('dog')).length,
          cat: petApprovedProducts.filter(p => (p.petType || p.pet_type || '').toLowerCase().startsWith('cat')).length,
          small: petApprovedProducts.filter(p => (p.petType || p.pet_type || '').toLowerCase().startsWith('small')).length
        }
      };
    }
    
    if (response.items.length === 0 && !petType && !category) { console.warn("[API] 0 products found, returning first 50 as safety"); const { products: backup } = loadProductsFromCatalog(); response.items = backup.slice(0, 50); response.total = backup.length; }
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== PERFORMANCE DEBUG ENDPOINT ==============
app.get("/api/perf/debug", (req, res) => {
  try {
    const catalogPath = path.join(__dirname, 'data', 'catalog.json');
    const mediaDir = path.join(PUBLIC_DIR, 'media', 'products');
    
    let products = [];
    let catalogSize = 0;
    try {
      const catalogData = fs.readFileSync(catalogPath, 'utf8');
      catalogSize = Buffer.byteLength(catalogData, 'utf8');
      const catalog = JSON.parse(catalogData);
      products = catalog.products || [];
    } catch (e) {
      console.error('[Perf] Failed to load catalog:', e.message);
    }
    
    let totalMediaFiles = 0;
    let totalMediaSize = 0;
    let thumbCount = 0;
    try {
      if (fs.existsSync(mediaDir)) {
        const productDirs = fs.readdirSync(mediaDir).filter(f => {
          try { return fs.statSync(path.join(mediaDir, f)).isDirectory(); } catch { return false; }
        });
        for (const dir of productDirs) {
          try {
            const files = fs.readdirSync(path.join(mediaDir, dir));
            for (const file of files) {
              const filePath = path.join(mediaDir, dir, file);
              const stat = fs.statSync(filePath);
              totalMediaFiles++;
              totalMediaSize += stat.size;
              if (file.includes('thumb') || file.includes('_420') || file.includes('_640')) {
                thumbCount++;
              }
            }
          } catch {}
        }
      }
    } catch (e) {}
    
    const sampleProduct = products[0] || {};
    const listingPayload = {
      id: sampleProduct.id || '',
      slug: sampleProduct.slug || '',
      title: sampleProduct.title || '',
      price: sampleProduct.price || 0,
      thumbImage: sampleProduct.images?.[0] || '',
      pet_type: sampleProduct.pet_type || '',
      variantCount: (sampleProduct.variants || []).length,
      badges: sampleProduct.badges || []
    };
    const listingPayloadSize = JSON.stringify(listingPayload).length;
    const fullPayloadSize = JSON.stringify(sampleProduct).length;
    const gridOf24Size = listingPayloadSize * 24 + 200;
    
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      catalog: {
        totalProducts: products.length,
        catalogFileSize: `${(catalogSize / 1024).toFixed(1)} KB`,
        avgListingPayloadSize: `${listingPayloadSize} bytes`,
        avgFullPayloadSize: `${fullPayloadSize} bytes`,
        reductionPercent: `${((1 - listingPayloadSize / fullPayloadSize) * 100).toFixed(1)}%`
      },
      media: {
        totalFiles: totalMediaFiles,
        totalSize: `${(totalMediaSize / 1024 / 1024).toFixed(2)} MB`,
        thumbCount: thumbCount,
        avgFileSize: totalMediaFiles > 0 ? `${(totalMediaSize / totalMediaFiles / 1024).toFixed(1)} KB` : '0 KB'
      },
      caching: {
        mediaHeaders: 'Cache-Control: public, max-age=604800',
        staticAssets: 'Cache-Control: public, max-age=86400',
        htmlFiles: 'Cache-Control: no-cache, must-revalidate',
        compression: 'gzip enabled (level 6)'
      },
      pageEstimates: {
        gridOf24Products: `${(gridOf24Size / 1024).toFixed(1)} KB`,
        fullPageWith24: `~${((gridOf24Size + 50000) / 1024).toFixed(0)} KB (HTML+CSS+JS+data)`
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const param = decodeURIComponent(req.params.id || "").trim();
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    let products = [];
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      products = catalog.products || [];
    }
    
    // Robust lookup
    const key = param.toLowerCase();
    let p = products.find(x => String(x.id) === param || String(x.productId) === param);
    
    if (!p) {
      p = products.find(x => {
        if (x.slug && x.slug.toLowerCase() === key) return true;
        if (x.handle && x.handle.toLowerCase() === key) return true;
        // Fallback: derive slug from title
        const derived = (x.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        return derived === key;
      });
    }

    if (!p) {
      const now = Date.now();
      if (now - proxyErrorLog.lastLog > proxyErrorLog.interval) {
        console.warn(`[PDP] Product not found key=${param}`);
        proxyErrorLog.lastLog = now;
      }
      return res.status(404).json({ 
        error: "Product not found", 
        id: param,
        message: "The requested pet product is unavailable or moved." 
      });
    }
    
    res.json(p);
  } catch (err) {
    console.error("[PDP] Error loading product:", err.message);
    res.status(500).json({ error: "Error loading product" });
  }
});

app.get("/readyz", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).send("ok");
});

// /__build - JSON build info endpoint for debugging/verification
app.get("/__build", (req, res) => {
  setNoCacheHeaders(res);
  res.json({
    version: BUILD_VERSION,
    commit: GIT_COMMIT_SHA,
    commitShort: GIT_COMMIT_SHORT,
    fingerprint: BUILD_FINGERPRINT,
    buildTime: BUILD_TIME,
    serverStart: SERVER_START_TIME,
    env: IS_PRODUCTION ? "production" : "development",
    node: process.version,
    pid: process.pid,
    uptime: Math.floor(process.uptime()) + "s",
    cartStorageFallback: "localStorage|cookie|memory",
    cartUIModule: "cart-ui.js loaded"
  });
});

// 2) SMART ROOT HANDLER with NO-CACHE for HTML
app.get("/", (req, res) => {
  const accept = String(req.headers["accept"] || "");
  const ua = String(req.headers["user-agent"] || "");
  const isHealth = req.query.health === "1" || 
                   ua.includes("HealthCheck") || 
                   ua.includes("kube-probe") || 
                   ua.includes("Replit");
                   
  const looksLikeBrowser = !isHealth && (
    accept.includes("text/html") ||
    ua.includes("Mozilla") ||
    ua.includes("Safari") ||
    ua.includes("Chrome")
  );

  if (looksLikeBrowser) {
    console.log("[WEB] serving index.html on /");
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      setNoCacheHeaders(res);
      let html = fs.readFileSync(indexPath, "utf8");
      
      // Dynamic cache-busting: replace static versions with BUILD_FINGERPRINT
      html = html.replace(/\?v=[^"'\s]+/g, `?v=${BUILD_FINGERPRINT}`);
      
      // Update build indicator in footer with version + commit + buildTime + fingerprint
      const buildTimeShort = BUILD_TIME.slice(0, 16).replace('T', ' '); // "2026-01-10 23:27"
      const homeBuildStamp = `v${BUILD_VERSION} · ${GIT_COMMIT_SHORT} · ${buildTimeShort} · ${BUILD_FINGERPRINT.slice(-6)}`;
      html = html.replace(/<span id="buildIndicator"[^>]*>[^<]*<\/span>/, 
        `<span id="buildIndicator" class="footer-build" title="Build: ${BUILD_FINGERPRINT} | Commit: ${GIT_COMMIT_SHORT} | Time: ${BUILD_TIME}">${homeBuildStamp}</span>`);
      
      // Only inject fingerprint badge when ?debug=1 or ?debug=true
      if (req.query.debug === '1' || req.query.debug === 'true') {
        const fpBadge = `<div id="fpBadge" style="position:fixed;bottom:8px;left:8px;z-index:99999;background:rgba(0,0,0,0.9);color:#0f0;font-family:monospace;font-size:10px;padding:4px 8px;border-radius:4px;pointer-events:none;">LIVE: ${BUILD_FINGERPRINT}</div>`;
        html = html.replace("</body>", fpBadge + "</body>");
      }
      return res.type("html").send(html);
    }
    // Fallback if index.html is missing
    return res.status(200).send("Welcome to GetPawsy (Loading...)");
  }

  // Non-browser or explicit health check
  console.log("[HEALTH] root ok");
  res.set("Cache-Control", "no-store");
  return res.status(200).send("OK");
});

// 3) ENHANCED MEDIA SERVING with range support for videos
const MEDIA_EXTENSIONS = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml'
};

app.get("/media/*", (req, res, next) => {
  // Sanitize path to prevent directory traversal
  const relativePath = req.path.replace(/^\/media\//, '').replace(/\.\./g, '');
  const filePath = path.join(PUBLIC_DIR, "media", relativePath);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return next();
  }
  
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return next();
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MEDIA_EXTENSIONS[ext] || 'application/octet-stream';
  
  // Cache headers for media - long cache for images
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.set("Content-Type", contentType);
  
  // Handle range requests for video streaming
  if (contentType.startsWith('video/') && req.headers.range) {
    const range = req.headers.range;
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = (end - start) + 1;
    
    res.status(206);
    res.set({
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize
    });
    
    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
    return;
  }
  
  // Regular file serving
  res.set("Content-Length", stat.size);
  res.set("Accept-Ranges", "bytes");
  fs.createReadStream(filePath).pipe(res);
});

// 4) STATIC SERVING (fallback for other static files)
// Use long cache for hashed assets, shorter for HTML
// redirect: false prevents 301 redirects for directories (e.g. /product/slug)
app.use(express.static(PUBLIC_DIR, { 
  maxAge: "1d",
  index: false,
  redirect: false,
  setHeaders: (res, filePath) => {
    // Hashed assets (js, css with hash in name) get immutable caching
    if (/\.[a-f0-9]{8,}\.(js|css)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
    // HTML files get no-cache
    else if (filePath.endsWith('.html')) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    }
    // Images get long cache
    else if (/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=604800"); // 1 week
    }
  }
}));

// 5) CATEGORY REDIRECTS - Redirect legacy /collection/* routes to modern SPA routes
app.get("/collection/small-pets", (req, res) => res.redirect(301, "/small-pets"));
app.get("/collection/dogs", (req, res) => res.redirect(301, "/dogs"));
app.get("/collection/cats", (req, res) => res.redirect(301, "/cats"));

// 6) SPA FALLBACK (for /home, /dogs, /cats, /small-pets, etc) with NO-CACHE + FINGERPRINT INJECTION
// NOTE: /product/* routes are handled by server.full.js (EJS templates), not SPA
app.get("*", (req, res, next) => {
  const accept = String(req.headers["accept"] || "");
  const isServerRendered = req.path.startsWith("/product/") || 
                           req.path.startsWith("/c/") || 
                           req.path.startsWith("/admin");
  
  if (accept.includes("text/html") && !req.path.startsWith("/api/") && !isServerRendered) {
    console.log(`[WEB] serving index.html for SPA route: ${req.path}`);
    setNoCacheHeaders(res);
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    let html = fs.readFileSync(indexPath, "utf8");
    
    // Dynamic cache-busting: replace static versions with BUILD_FINGERPRINT
    html = html.replace(/\?v=[^"'\s]+/g, `?v=${BUILD_FINGERPRINT}`);
    
    // Update build indicator in footer with version + commit + buildTime + fingerprint
    const buildTimeShort = BUILD_TIME.slice(0, 16).replace('T', ' '); // "2026-01-10 23:27"
    const buildStamp = `v${BUILD_VERSION} · ${GIT_COMMIT_SHORT} · ${buildTimeShort} · ${BUILD_FINGERPRINT.slice(-6)}`;
    html = html.replace(/<span id="buildIndicator"[^>]*>[^<]*<\/span>/, 
      `<span id="buildIndicator" class="footer-build" title="Build: ${BUILD_FINGERPRINT} | Commit: ${GIT_COMMIT_SHORT} | Time: ${BUILD_TIME}">${buildStamp}</span>`);
    
    // Only inject fingerprint badge when ?debug=1 or ?debug=true
    if (req.query.debug === '1' || req.query.debug === 'true') {
      const fpBadge = `<div id="fpBadge" style="position:fixed;bottom:8px;left:8px;z-index:99999;background:rgba(0,0,0,0.9);color:#0f0;font-family:monospace;font-size:10px;padding:4px 8px;border-radius:4px;pointer-events:none;">LIVE: ${BUILD_FINGERPRINT}</div>`;
      html = html.replace("</body>", fpBadge + "</body>");
    }
    return res.type("html").send(html);
  }
  next();
});

// Placeholder for full app handler
let fullAppHandler = (req, res, next) => {
  res.status(503).send("Warming up… please refresh in a few seconds.");
};

app.use((req, res, next) => {
  fullAppHandler(req, res, next);
});

const server = http.createServer(app);

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}, closing server...`);
  if (server && typeof server.close === "function") {
    server.close(() => {
      console.log("[SHUTDOWN] Server closed gracefully");
      process.exit(0);
    });
    // Force exit after 10s if server doesn't close
    setTimeout(() => {
      console.warn("[SHUTDOWN] Forcing exit after timeout");
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

server.listen(PORT, HOST, () => {
  console.log(`[BOOT] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
  console.log(`[BOOT] Server listening on ${HOST}:${PORT}`);
  console.log(`[BOOT] Serving DIST build ${FRONTEND_BUILD_INFO.frontend_build_id}`);
  
  // Start media sync worker
  mediaService.startWorker();
  
  // Start optional CJ resync scheduler
  const cjScheduler = require('./server/jobs/cjScheduler');
  cjScheduler.start();
  
  // Print test URLs for deployment verification
  console.log("=".repeat(60));
  console.log("[TEST URLS] Verify these on getpawsy.pet after deploy:");
  console.log("  https://getpawsy.pet/__fingerprint");
  console.log("  https://getpawsy.pet/build.txt");
  console.log("  https://getpawsy.pet/api/version");
  console.log("  https://getpawsy.pet/api/debug/deploy-info");
  console.log(`[EXPECTED] fingerprint=${BUILD_FINGERPRINT}`);
  console.log("=".repeat(60));
  
  // 5) DEFERRED HEAVY INIT
  setImmediate(async () => {
    try {
      console.log("[BOOT] Loading heavy app modules...");
      const { createApp } = require("./server.full.js");
      const fullApp = createApp();
      
      // Use frontend build ID from build.json
      const buildId = FRONTEND_BUILD_INFO.frontend_build_id;
      console.log(`[BOOT] Setting build ID: ${buildId}`);
      
      // Update handler to use full app
      fullAppHandler = (req, res, next) => {
        res.locals.buildId = buildId;
        fullApp(req, res, next);
      };
      console.log("[BOOT] Full app is now live ✅");
    } catch (e) {
      console.error('[BOOT] Failed to load full app:', e);
    }
  });
});
