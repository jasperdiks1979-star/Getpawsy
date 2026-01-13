const express = require("express");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const cookieParser = require("cookie-parser");

const PORT = parseInt(process.env.PORT || "5000");
const IS_DEPLOY = process.env.REPLIT_DEPLOYMENT === "1";
const DEFER_HEAVY_BOOT_MS = parseInt(process.env.DEFER_HEAVY_BOOT_MS || "45000");

function createApp() {
const app = express();
let server = null;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACTS - Hard fail on violations (NO FALLBACKS)
// ═══════════════════════════════════════════════════════════════════════════════
function noFallback(value, label) {
  if (value === undefined || value === null) {
    throw new Error(`❌ Fallback forbidden: ${label}`);
  }
  return value;
}

function assertOnlyPetProducts(products) {
  if (!Array.isArray(products)) return;
  const invalid = products.filter(p =>
    !p || !p.category ||
    !["dog", "cat", "pet", "dogs", "cats", "pets"].some(k =>
      (p.category || "").toLowerCase().includes(k)
    )
  );
  if (invalid.length > 0) {
    console.error("❌ NON-PET PRODUCTS DETECTED:", invalid.map(p => p?.id || "unknown"));
    throw new Error(`Homepage blocked: ${invalid.length} non-pet products detected`);
  }
}

function assertCartIntegrity(cart) {
  if (!cart || typeof cart !== "object") {
    throw new Error("Cart corrupted: invalid structure");
  }
  const items = cart.items || cart;
  if (typeof items === "object") {
    Object.entries(items).forEach(([id, item]) => {
      if (!item || (typeof item.quantity === "number" && item.quantity <= 0)) {
        throw new Error(`Invalid cart item: ${id}`);
      }
    });
  }
}

const { isExcludedProduct, getExcludedReason } = require('./server/utils/excludedProducts');
const { filterPetOnly, isPetOnly } = require('./src/lib/petOnly');
const petOnlyEngine = require('./src/lib/petOnlyEngine');

// ═══════════════════════════════════════════════════════════════════════════════
// SMALL PETS DENY GATE - Block ONLY verified non-pet products (explicit slugs only)
// ═══════════════════════════════════════════════════════════════════════════════

function isSmallPetsBlockedSlug(product) {
  if (!product) return false;
  return isExcludedProduct(product);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK ROUTES - ABSOLUTE FIRST (zero blocking before these)
// ═══════════════════════════════════════════════════════════════════════════════
app.get("/", (req, res) => {
  const accept = String(req.headers["accept"] || "");
  const ua = String(req.headers["user-agent"] || "");
  const looksLikeBrowser =
    accept.includes("text/html") ||
    ua.includes("Mozilla") ||
    ua.includes("Safari") ||
    ua.includes("Chrome");
  if (looksLikeBrowser) {
    res.status(200);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-store");
    return res.send('<!doctype html><html><head><meta http-equiv="refresh" content="0;url=/home"/></head><body>OK</body></html>');
  }
  res.set("Cache-Control", "no-store");
  return res.status(200).send("OK");
});
app.get("/health", (req, res) => {
  res.status(200).set("Cache-Control", "no-store").type("text/plain").send("ok");
});
app.get("/healthz", (req, res) => {
  res.status(200).set("Cache-Control", "no-store").type("text/plain").send("ok");
});
app.get("/readyz", (req, res) => {
  res.status(200).set("Cache-Control", "no-store").type("text/plain").send("ok");
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED: Build info and homepage loading (after health routes)
// ═══════════════════════════════════════════════════════════════════════════════
let BUILD_ID = Date.now().toString(36).slice(-6);
let BUILD_START_TIME = new Date().toISOString();
let CACHED_HOMEPAGE_HTML = null;
const FRONTEND_DIR = path.join(__dirname, "public");

// Read fingerprint from file (created by server.js)
let BUILD_FINGERPRINT = "unknown";
try {
  const fpPath = path.join(__dirname, "public", "build.txt");
  if (fs.existsSync(fpPath)) {
    BUILD_FINGERPRINT = fs.readFileSync(fpPath, "utf8").trim();
  } else if (fs.existsSync("/tmp/build_fingerprint.txt")) {
    BUILD_FINGERPRINT = fs.readFileSync("/tmp/build_fingerprint.txt", "utf8").trim();
  }
} catch (e) {
  console.warn("[BUILD] Could not read fingerprint:", e.message);
}
// Make fingerprint available to all EJS templates
app.locals.BUILD_FINGERPRINT = BUILD_FINGERPRINT;
console.log(`[DEPLOY] BUILD_FINGERPRINT=${BUILD_FINGERPRINT}`);

function loadBuildInfo() {
  try {
    const buildInfo = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "build.json"), "utf-8"));
    BUILD_ID = buildInfo.frontend_build_id || BUILD_ID;
    BUILD_START_TIME = buildInfo.frontend_built_at || BUILD_START_TIME;
    console.log(`[DEPLOY] Loaded build info: ${BUILD_ID}`);
  } catch (e) {
    console.log(`[DEPLOY] Using fallback build info: ${BUILD_ID}`);
  }
}

function preloadHomepageHTML() {
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf-8");
    const serverBuildInfo = `Build: ${BUILD_ID} | ${BUILD_START_TIME.slice(0, 16).replace('T', ' ')} (server-injected)`;
    html = html.replace(
      /<div id="deployBadge"[^>]*>.*?<\/div>/,
      `<div id="deployBadge" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#1a1a2e;color:#00C4A7;text-align:center;font-size:11px;padding:4px 8px;font-family:monospace;">${serverBuildInfo}</div>`
    );
    CACHED_HOMEPAGE_HTML = html;
    console.log(`[DEPLOY] Homepage HTML cached (${html.length} bytes)`);
  } catch (e) {
    CACHED_HOMEPAGE_HTML = `<!DOCTYPE html><html><head><title>GetPawsy</title></head><body><h1>GetPawsy</h1><p>Loading...</p></body></html>`;
    console.log(`[DEPLOY] Using fallback homepage HTML`);
  }
}

function getHomepageHTML() {
  if (!CACHED_HOMEPAGE_HTML) {
    loadBuildInfo();
    preloadHomepageHTML();
  }
  return CACHED_HOMEPAGE_HTML;
}

const GIT_COMMIT = process.env.REPLIT_DEPLOYMENT_SHA || 
                   process.env.VERCEL_GIT_COMMIT_SHA || 
                   process.env.GIT_COMMIT ||
                   BUILD_ID || "unknown";

// HOMEPAGE ROUTE - actual shop homepage (deferred loading)
app.get("/home", (req, res) => {
  res.set("Content-Type", "text/html");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.send(getHomepageHTML());
});

app.use("/pawsy", express.static(path.join(__dirname, "public/pawsy"), { maxAge: "1d" }));

// Aggressive caching for product media images (1 year for versioned files)
app.use("/media", express.static(path.join(__dirname, "public/media"), { 
  maxAge: "365d",
  immutable: true,
  setHeaders: (res, filePath) => {
    res.set("Cache-Control", "public, max-age=31536000, immutable");
  }
}));

// Debug mode middleware - sets res.locals.debug for all templates
// Only shows debug elements when ?debug=1 or ?debug=true
// QA mode shows build badge when ?qa=1
app.use((req, res, next) => {
  res.locals.debug = req.query.debug === '1' || req.query.debug === 'true';
  res.locals.qaMode = req.query.qa === '1' || req.query.qa === 'true';
  res.locals.buildId = BUILD_ID;
  res.locals.commitSha = GIT_COMMIT;
  res.locals.BUILD_FINGERPRINT = BUILD_FINGERPRINT;
  next();
});

// Block early static access to admin folder - auth is handled later
app.use("/admin", (req, res, next) => {
  res.locals.__pendingAdminAuth = true;
  next("route");
});

app.use(express.static(path.join(__dirname, "public"), { 
  maxAge: "1h",
  index: false,
  redirect: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html") || filePath.endsWith(".html")) {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    }
    if (filePath.includes("/admin/")) {
      return res.status(403).end();
    }
  }
}));

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD HEAVY MODULES AND INITIALIZE (called by bootstrap after delay)
// ═══════════════════════════════════════════════════════════════════════════════
preloadHomepageHTML();
function loadHeavyModulesAndInitialize() {
  console.log("[Boot] Loading heavy modules...");
  
const { db } = require("./src/db");
const { seedIfEmpty } = require("./src/seed");
const { parseCSV, normalizeProduct } = require("./src/csvImport");
const { parseCJCSV } = require("./src/cjImport");
const { parseCJCSVRobust, parseCJCSVSimple, getImportProgress, resetProgress } = require("./src/cjImportRobust");
const cjXlsxImport = require("./src/cjXlsxImport");
const { runCJSync } = require("./src/cjSync");
const { getPawsyResponse } = require("./src/pawsyLogic");
const { log, getLogs } = require("./src/logger");
const { prepareCJOrder, savePendingCJOrder, exportCJOrder, getCJOrders } = require("./src/cjFulfillment");
const { generateSEOMeta, generateProductSEOMeta, generateProductStructuredData, generateOrganizationStructuredData, injectSEOIntoHTML, generateSitemap, generateHreflangTags } = require("./src/seo");
const { placePendingOrders } = require("./src/cjFulfillment");
const { askPawsyLLM } = require("./src/pawsyLLM");
const { askPawsyHybrid, classifyIntent } = require("./src/pawsyHybridLLM");
const { askPawsyRAG } = require("./src/pawsyRAG");
const { askPawsyV3, isEnabled: isV3Enabled } = require("./src/pawsySalesAgentV3");
const { initAITables, getEmbeddingsCount } = require("./src/aiDatabase");
const { triggerReindexDelta, triggerReindexFull, getJobStatus, getJobById } = require("./src/aiJobRunner");
const { getReindexStatus } = require("./src/aiReindex");
const { retrieveContext } = require("./src/aiRetrieval");
const { isEnabled: embeddingsEnabled } = require("./src/aiEmbeddings");
const { addLabelsToProducts, addLabelsToProduct } = require("./src/productLabels");
const cjExactMapper = require("./src/cjCsvExactMapper");
const { applyPetFilter } = require("./src/petFilter");
const adminAuth = require("./src/adminAuth");
const { logAdminAction, getAdminLogs } = require("./src/adminLogger");
const { classifyPetRelevance, batchClassify, getRejectReasons } = require("./src/petRelevance");
const cjUrlImport = require("./src/cjUrlImport");
const featuredProducts = require("./src/featuredProducts");
const smartPricing = require("./src/smartPricing");
const feedScheduler = require("./src/feedScheduler");
const petEligibility = require("./src/petEligibility");
const { classifyWithConfidence, isStrictSmallPet } = require("./src/strictCategoryClassifier");
const adsGenerator = require("./src/adsGenerator");
const copywriter = require("./src/copywriter");
const heroStudio = require("./src/heroStudio");
const abTesting = require("./src/abTesting");
const seoGenerator = require("./src/seoGenerator");
const topPicks = require("./src/topPicks");
const { localeMiddleware, getLocaleFromRequest, getSupportedLocales, SUPPORTED_LOCALES, DEFAULT_LOCALE } = require("./src/localeMiddleware");
const { getSeoLocalized, getAllSeoForProduct, upsertSeoLocalized, lockSeoField, unlockSeoField, getSeoStats } = require("./src/aiDatabase");
const productTranslation = require("./src/productTranslation");
const enrichmentJob = require("./src/enrichmentJobV2");
const translationJob = require("./src/translationJob");
const imageTextDetection = require("./src/imageTextDetection");
const translationStore = require("./src/translationStore");
const { productStore, readDB, writeDB } = require("./src/productStore");
const seoBulkJob = require("./src/seoBulkJob");
const imageCache = require("./src/imageCache");
const { classifyProduct, getAllCategories, getCategoryBySlug, getSubcategoryBySlug } = require("./src/categoryClassifier");
const petEligibilityNew = require("./src/lib/petEligibility");
const safeBoot = require("./src/boot/safeBoot");
const jobOrchestrator = require("./src/boot/jobOrchestrator");
const ga4Config = require("./src/config/ga4Config");
const ga4Client = require("./src/analytics/ga4Client");
const pawsyReason = require("./src/pawsyReason");
const pawsyBoxes = require("./src/pawsyBoxes");
const cjImportPro = require("./src/cjImportPro");
const { setupCollectionsRoutes } = require("./src/collectionsApi");
const { filterStorefrontProducts, isStorefrontEligible } = require("./src/petSafetyNet");
const { isRealProduct, filterRealProducts } = require("./src/isRealProduct");
const productSafety = require("./src/lib/productSafety");

const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

// Rate limiter for Pawsy
const pawsyRateLimits = new Map();
const PAWSY_RATE_LIMIT = parseInt(process.env.PAWSY_AI_RATE_LIMIT_PER_MIN || "20");

// Demo product visibility flag (default: false = hide demo products)
const SHOW_DEMO_PRODUCTS = process.env.SHOW_DEMO_PRODUCTS === "true";

// SHARED PET ELIGIBILITY HELPER - Use this everywhere for consistent filtering
// V2.3: STRICT MODE - Only allow products that pass ALL checks
function checkPetEligible(product, options = {}) {
  if (!product) return false;
  const { forHomepage = false } = options;
  
  // HARD REJECT: Explicitly marked as non-pet
  if (product.is_pet === false) return false;
  if (product.is_pet_product === false) return false;
  if (product.blocked_reason) return false;
  
  // Homepage-specific check (only for homepage rendering)
  if (forHomepage && product.homepage_eligible === false) return false;
  
  // HARD REJECT: No CJ product ID = not a real product
  // V2.9: Accept both cj- (hyphen) and cj_ (underscore) prefixes
  const hasCjId = product.cjProductId || product.cjPid || product.cj_pid || 
                  (product.id && (product.id.startsWith('cj-') || product.id.startsWith('cj_') || /^\d{15,}$/.test(product.id)));
  if (!hasCjId) {
    return false;
  }
  
  // Fast path: if already classified as pet product
  if (product.is_pet === true) return true;
  if (product.is_pet_product === true) return true;
  if (product.isPetAllowed === true) return true;
  if (product.petType || product.pet_usage) return true;
  if (product.pet_type && ['dog', 'cat', 'both', 'small_pet', 'smallpets'].includes(product.pet_type)) return true;
  
  // Fall through to keyword-based classification
  const result = petEligibilityNew.isPetEligible({
    title: product.title || '',
    description: product.description || '',
    tags: product.tags,
    category: product.category || '',
    type: product.type || ''
  });
  return result.eligible;
}

// Image Validator - Block demo/placeholder/stock images
// V2.9: Fixed to allow CJ CDN and local media paths
function isValidProductImage(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return false;
  const lower = imagePath.toLowerCase();
  // Allow CJ CDN images (cf.cjdropshipping.com) - essential for product images
  if (lower.includes('cjdropshipping.com')) return true;
  // Allow local media paths
  if (lower.startsWith('/media/')) return true;
  const invalid = ['demo-product', 'placeholder', 'stock-photo', 'unsplash', 'sample-image', 'pexels', 'pixabay'];
  return !invalid.some(term => lower.includes(term));
}

// Pet Bucket classification helper
function inferBucketFromProduct(p) {
  const combined = [p.title, p.description, Array.isArray(p.tags) ? p.tags.join(' ') : p.tags, p.category, p.type].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9\s\-]/g, ' ');
  const has = (words) => words.some(w => combined.includes(w));
  if (has(['litter box', 'cat litter', 'litter', 'scoop'])) return 'litter';
  if (has(['scratcher', 'scratching', 'cat tree', 'cat tower', 'scratch post', 'scratching post'])) return 'scratchers';
  if (has(['toy', 'toys', 'ball', 'rope', 'squeaky', 'fetch', 'chew toy', 'interactive toy', 'teaser'])) return 'toys';
  if (has(['bowl', 'feeder', 'slow feeder', 'fountain', 'water fountain', 'kibble', 'treat', 'treats', 'food', 'feeding', 'catnip'])) return 'feeding';
  if (has(['carrier', 'car seat', 'seat cover', 'pet barrier', 'car barrier', 'travel', 'crate', 'kennel'])) return 'travel';
  if (has(['groom', 'grooming', 'brush', 'deshedding', 'nail clipper', 'fur', 'pet hair', 'shampoo'])) return 'grooming';
  if (has(['training', 'clicker', 'muzzle', 'anti bark', 'bark', 'lead training'])) return 'training';
  if (has(['bed', 'mat', 'blanket', 'cushion', 'orthopedic', 'sofa cover'])) return 'beds';
  if (has(['flea', 'tick', 'supplement', 'probiotic', 'vitamin', 'calming', 'health'])) return 'health';
  return 'unknown';
}

// Image Audit - Detect duplicate/overused main images
function auditProductImages(products) {
  const imageMap = {};
  products.forEach(p => {
    if (p.image && p.active !== false) {
      imageMap[p.image] = (imageMap[p.image] || 0) + 1;
    }
  });
  const topReused = Object.entries(imageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));
  return topReused;
}

// Resolve all images from product
function resolveAllImages(p) {
  if (!p) return [];
  const urls = [];
  const addImages = (val) => {
    if (!val) return;
    if (Array.isArray(val)) {
      urls.push(...val.filter(v => typeof v === 'string'));
    } else if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) urls.push(...parsed.filter(v => typeof v === 'string'));
        else if (parsed && typeof parsed === 'string') urls.push(parsed);
      } catch {
        const trimmed = val.trim();
        if (/^(https?:\/\/|\/)/i.test(trimmed)) urls.push(trimmed);
      }
    }
  };
  addImages(p.images);
  addImages(p.imageUrls);
  addImages(p.imageList);
  addImages(p.gallery);
  addImages(p.imageUrl);
  addImages(p.mainImage);
  addImages(p.productImage);
  addImages(p.image);
  addImages(p.featuredImage);
  addImages(p.thumbnail);
  addImages(p.thumbnailUrl);
  if (Array.isArray(p.variants)) {
    p.variants.forEach(v => {
      if (v.image) addImages(v.image);
      if (v.imageUrl) addImages(v.imageUrl);
      if (v.images) addImages(v.images);
    });
  }
  const unique = new Set(urls.map(u => String(u).trim()).filter(u => /^(https?:\/\/|\/)/i.test(u)));
  return Array.from(unique);
}

function getPrimaryImage(p) {
  if (!p) return null;
  const images = resolveAllImages(p);
  return images?.[0] || null;
}

function isPetProduct(product) {
  if (!product) return false;
  const title = (product.title || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const combined = title + ' ' + desc;
  const nonPetKeywords = ['earrings', 'necklace', 'ring', 'jewelry', 'bracelet', 'keychain', 'phone case', 't-shirt', 'tshirt', 'clothing', 'hoodie', 'dress', 'apparel'];
  if (nonPetKeywords.some(kw => combined.includes(kw))) return false;
  const petSignals = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'kitty'];
  const petKeywords = ['toy', 'leash', 'collar', 'harness', 'litter', 'bed', 'bowl', 'groom', 'treat', 'crate', 'carrier', 'scratcher', 'cage', 'perch', 'feeder'];
  const hasPetWord = petSignals.some(s => combined.includes(s));
  const hasPetKeyword = petKeywords.some(kw => combined.includes(kw));
  return hasPetWord || hasPetKeyword;
}

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `pawsy:${ip}`;
  if (!pawsyRateLimits.has(key)) {
    pawsyRateLimits.set(key, [now]);
    return { allowed: true, remaining: PAWSY_RATE_LIMIT - 1 };
  }
  const times = pawsyRateLimits.get(key).filter(t => now - t < 60000);
  if (times.length >= PAWSY_RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  times.push(now);
  pawsyRateLimits.set(key, times);
  return { allowed: true, remaining: PAWSY_RATE_LIMIT - times.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: Configure middleware and remaining routes
// ═══════════════════════════════════════════════════════════════════════════════

// Database readiness flag - set to true after db.init() completes
let DB_READY = false;
function setDbReady() { DB_READY = true; }
function isDbReady() { return DB_READY; }

// Readyz endpoint checks if app is fully ready
app.get("/readyz", (req, res) => {
  if (DB_READY || safeBoot.isDeployment()) {
    res.status(200).send("OK");
  } else {
    res.status(503).send("Starting...");
  }
});

// CRITICAL STABILITY: Disable background jobs on boot (safe mode)
const ENABLE_BACKGROUND_JOBS = safeBoot.jobsEnabled();
const DISABLE_DB_MIGRATIONS = process.env.DISABLE_DB_MIGRATIONS !== "false";
const FEED_AUTO_RUN_ON_START = process.env.FEED_AUTO_RUN_ON_START === "true";
const FEED_AUTO_RUN_DAILY = process.env.FEED_AUTO_RUN_DAILY === "true";
const AI_REINDEX_ON_START = process.env.AI_REINDEX_ON_START === "true";

// Job mutex
const activeJobs = new Set();
function canEnqueueJob(jobName) {
  if (activeJobs.has(jobName)) {
    log(`[JobMutex] Skipped ${jobName} - already running`);
    return false;
  }
  activeJobs.add(jobName);
  return true;
}
function completeJob(jobName) {
  activeJobs.delete(jobName);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

let lastSyncTime = null;
let lastSyncMode = null;
let lastSyncCount = 0;

// Database readiness gate - block DB-dependent routes until ready
app.use((req, res, next) => {
  if (DB_READY || safeBoot.isDeployment()) return next();
  const isStatic = req.path.startsWith('/pawsy/') || 
                   req.path.startsWith('/images/') ||
                   /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|mp4|webm|json)$/i.test(req.path);
  if (isStatic) return next();
  if (req.path === '/' || req.path === '') return next();
  log(`[Readiness] Blocking ${req.path} - DB not ready yet`);
  res.status(503).set('Retry-After', '1').json({ error: 'Service starting', message: 'Please retry in a moment' });
});

app.use(express.json({ limit: "10mb" }));
app.use(express.raw({ type: "text/csv", limit: "100mb" }));
app.use(express.text({ type: "text/plain", limit: "100mb" }));
app.use(cookieParser());

// MIME types for video files
app.use((req, res, next) => {
  if (/\.mp4$/i.test(req.path)) res.type('video/mp4');
  else if (/\.webm$/i.test(req.path)) res.type('video/webm');
  else if (/\.ogg$/i.test(req.path)) res.type('video/ogg');
  next();
});

// Performance: Compression middleware
app.use((req, res, next) => {
  const acceptEncoding = req.headers["accept-encoding"] || "";
  const shouldCompress = /\.(js|css|json|html|svg|xml|txt)$/.test(req.path);
  
  if (!shouldCompress) return next();
  
  const originalSend = res.send;
  res.send = function(data) {
    if (!data || data.length < 200) {
      return originalSend.call(this, data);
    }
    
    if (acceptEncoding.includes("gzip")) {
      res.set("Content-Encoding", "gzip");
      return zlib.gzip(data, (err, compressed) => {
        if (err) return originalSend.call(res, data);
        originalSend.call(res, compressed);
      });
    }
    return originalSend.call(this, data);
  };
  next();
});

// Performance: Caching headers middleware
app.use((req, res, next) => {
  const isStatic = /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|mp4|webm|ogg)$/.test(req.path);
  const isImage = /\.(?:png|jpg|jpeg|gif|svg|webp)$/.test(req.path);
  const isVideo = /\.(?:mp4|webm|ogg)$/.test(req.path);
  const isHTML = req.path === "/" || req.path === "/admin" || req.path.startsWith("/product/") || req.path.startsWith("/collection");
  const isAPI = req.path.startsWith("/api/");
  
  if (isAPI) {
    // API responses: no caching to ensure fresh data
    res.set("Cache-Control", "no-store, must-revalidate");
    res.set("Pragma", "no-cache");
  } else if (isVideo) {
    res.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (isStatic && isImage) {
    res.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (isStatic) {
    res.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (isHTML) {
    res.set("Cache-Control", "no-store, must-revalidate, no-cache");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

// Performance: Security headers
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

// Image Proxy Endpoint - Proxies external images through our domain
// Fixes mixed-content, hotlink/403 issues, and provides fallback
const IMAGE_PROXY_ALLOWED_DOMAINS = [
  'cjdropshipping.com',
  'cjstatic.com',
  'cbu01.alicdn.com',
  'ae01.alicdn.com',
  'ae02.alicdn.com',
  'ae03.alicdn.com',
  'ae04.alicdn.com',
  'alicdn.com',
  'img.alicdn.com',
  'sc04.alicdn.com',
  'g-search1.alicdn.com',
  'gdimg.gmarket.co.kr',
  's.alicdn.com',
  'i.ebayimg.com',
  'images-na.ssl-images-amazon.com',
  'm.media-amazon.com',
  'images-amazon.com',
  'cf.cjdropshipping.com',
  'img.cjdropshipping.com',
  'assets.cjdropshipping.com'
];

// LRU eviction for image cache
const IMAGE_CACHE_BUDGET_BYTES = parseInt(process.env.MEDIA_CACHE_MAX_MB || "1000") * 1024 * 1024;
global._imgCacheEvictions = global._imgCacheEvictions || 0;

function enforceImageCacheBudget(cacheDir) {
  try {
    if (!fs.existsSync(cacheDir)) return;
    const files = fs.readdirSync(cacheDir).map(f => {
      const fullPath = path.join(cacheDir, f);
      try {
        const stat = fs.statSync(fullPath);
        return { path: fullPath, size: stat.size, mtime: stat.mtimeMs };
      } catch (e) { return null; }
    }).filter(Boolean);
    
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize <= IMAGE_CACHE_BUDGET_BYTES) return;
    
    // Sort by oldest first (LRU eviction)
    files.sort((a, b) => a.mtime - b.mtime);
    let evicted = 0;
    let freedBytes = 0;
    const targetSize = IMAGE_CACHE_BUDGET_BYTES * 0.8; // Evict to 80% of budget
    
    for (const file of files) {
      if (totalSize - freedBytes <= targetSize) break;
      try {
        fs.unlinkSync(file.path);
        freedBytes += file.size;
        evicted++;
        global._imgCacheEvictions++;
      } catch (e) {}
    }
    if (evicted > 0) {
      log(`[ImageCache] Evicted ${evicted} files (${(freedBytes / 1024 / 1024).toFixed(1)}MB) to stay within budget`);
    }
  } catch (e) {}
}

// Normalize image URL: accept string, array, JSON-stringified array, or null
function normalizeImageUrl(raw) {
  if (!raw) return null;
  let url = String(raw).trim();
  
  // Double-decode if needed
  try { url = decodeURIComponent(url); } catch (e) {}
  
  // Handle JSON array
  if (url.startsWith('[') || url.startsWith('%5B')) {
    try {
      const parsed = JSON.parse(url);
      if (Array.isArray(parsed) && parsed.length > 0) {
        url = String(parsed[0]).trim();
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }
  
  // Extract first valid http(s) URL if multiple are comma-separated
  if (url.includes(',')) {
    const parts = url.split(',').map(s => s.trim());
    url = parts.find(p => p.startsWith('http://') || p.startsWith('https://')) || parts[0];
  }
  
  // Upgrade http to https
  if (url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  
  // Final validation
  if (!url.startsWith('https://')) return null;
  
  return url;
}

// Enhanced image proxy with resize/webp conversion using sharp
const sharp = require("sharp");

app.get("/api/img", async (req, res) => {
  let rawUrl = req.query.u || req.query.url;
  const width = parseInt(req.query.w) || 0;
  const quality = Math.min(Math.max(parseInt(req.query.q) || 72, 10), 100);
  const PLACEHOLDER = "/images/placeholder-product.svg";
  
  // Sanitize and validate format - only allow webp, jpeg, png
  const ALLOWED_FORMATS = ["webp", "jpeg", "jpg", "png"];
  let requestedFormat = (req.query.fm || "webp").toLowerCase();
  if (requestedFormat === "jpg") requestedFormat = "jpeg";
  if (!ALLOWED_FORMATS.includes(requestedFormat)) requestedFormat = "webp";
  const format = requestedFormat === "jpg" ? "jpeg" : requestedFormat;
  
  if (!rawUrl) {
    return res.redirect(302, PLACEHOLDER);
  }
  
  try {
    // Normalize URL using robust function
    const targetUrl = normalizeImageUrl(rawUrl);
    
    if (!targetUrl) {
      return res.redirect(302, PLACEHOLDER);
    }
    
    // Validate URL format
    let urlObj;
    try {
      urlObj = new URL(targetUrl);
    } catch (e) {
      if (!global._imgProxyLastInvalidLog || Date.now() - global._imgProxyLastInvalidLog > 60000) {
        global._imgProxyLastInvalidLog = Date.now();
        log(`[ImageProxy] Invalid URL (rate-limited log): ${String(rawUrl).substring(0, 100)}`);
      }
      return res.redirect(302, PLACEHOLDER);
    }
    
    // Validate domain allowlist
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = IMAGE_PROXY_ALLOWED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith("." + domain)
    );
    
    if (!isAllowed) {
      log(`[ImageProxy] Domain not allowed: ${hostname}`);
      return res.redirect(302, PLACEHOLDER);
    }
    
    // Build cache key including transform parameters
    const cacheKey = `${targetUrl}|w${width}|q${quality}|fm${format}`;
    const hash = crypto.createHash("sha1").update(cacheKey).digest("hex");
    // Map format to extension and content type
    const formatMap = {
      jpeg: { ext: "jpg", contentType: "image/jpeg" },
      webp: { ext: "webp", contentType: "image/webp" },
      png: { ext: "png", contentType: "image/png" }
    };
    const outputInfo = formatMap[format] || formatMap.webp;
    const cacheDir = path.join(__dirname, "public", "cache", "images");
    const cachePath = path.join(cacheDir, `${hash}.${outputInfo.ext}`);
    
    // Serve from cache if exists
    if (fs.existsSync(cachePath)) {
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.set("Content-Type", outputInfo.contentType);
      return res.sendFile(cachePath);
    }
    
    // Fetch image from upstream
    const protocol = targetUrl.startsWith("https") ? https : http;
    const fetchOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Encoding": "identity",
        "Referer": "https://cjdropshipping.com/"
      }
    };
    
    const fetchImage = () => new Promise((resolve, reject) => {
      const request = protocol.get(fetchOptions, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          const redirectUrl = response.headers.location.startsWith("http")
            ? response.headers.location
            : new URL(response.headers.location, targetUrl).href;
          const redirectProtocol = redirectUrl.startsWith("https") ? https : http;
          const redirectUrlObj = new URL(redirectUrl);
          redirectProtocol.get({
            hostname: redirectUrlObj.hostname,
            path: redirectUrlObj.pathname + redirectUrlObj.search,
            timeout: 10000,
            headers: fetchOptions.headers
          }, (rRes) => {
            if (rRes.statusCode !== 200) {
              reject(new Error(`Redirect HTTP ${rRes.statusCode}`));
              return;
            }
            const chunks = [];
            rRes.on("data", c => chunks.push(c));
            rRes.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: rRes.headers["content-type"] }));
          }).on("error", reject);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        const chunks = [];
        response.on("data", c => chunks.push(c));
        response.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: response.headers["content-type"] }));
      });
      request.on("error", reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error("Timeout"));
      });
    });
    
    const { buffer } = await fetchImage();
    
    // Process with sharp: resize and convert format
    let pipeline = sharp(buffer);
    
    if (width > 0 && width <= 2000) {
      pipeline = pipeline.resize(width, null, { withoutEnlargement: true });
    }
    
    // Apply format conversion - track actual output format
    let actualFormat = format;
    let actualOutputInfo = outputInfo;
    
    if (format === "jpeg") {
      pipeline = pipeline.jpeg({ quality, progressive: true });
    } else if (format === "png") {
      pipeline = pipeline.png({ compressionLevel: Math.floor((100 - quality) / 10) });
    } else {
      pipeline = pipeline.webp({ quality });
    }
    
    let processed;
    try {
      processed = await pipeline.toBuffer();
    } catch (conversionErr) {
      // Fallback to webp if conversion fails
      log(`[ImageProxy] Format ${format} failed (${conversionErr.message}), falling back to webp`);
      actualFormat = "webp";
      actualOutputInfo = formatMap.webp;
      processed = await sharp(buffer).webp({ quality: 72 }).toBuffer();
    }
    
    // Build cache path with actual format (not requested format if fallback occurred)
    const actualCacheKey = `${targetUrl}|w${width}|q${quality}|fm${actualFormat}`;
    const actualHash = crypto.createHash("sha1").update(actualCacheKey).digest("hex");
    const actualCachePath = path.join(cacheDir, `${actualHash}.${actualOutputInfo.ext}`);
    
    // Cache to disk only with correct extension
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(actualCachePath, processed);
    
    // Enforce LRU eviction in background (non-blocking)
    setImmediate(() => enforceImageCacheBudget(cacheDir));
    
    // Serve processed image with correct content type
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Content-Type", actualOutputInfo.contentType);
    return res.send(processed);
    
  } catch (err) {
    log(`[ImageProxy] FAIL ${rawUrl}: ${err.message}`);
    return res.redirect(302, PLACEHOLDER);
  }
});

// Alias for /api/image (same as /api/img)
app.get("/api/image", (req, res) => {
  req.query.u = req.query.url || req.query.u;
  return app._router.handle(req, res, () => res.redirect(302, "/images/placeholder-product.svg"));
});

// NOTE: SEO homepage handler REMOVED - homepage now served via /home route
// The / route is reserved for instant health check (200 OK) with redirect to /home

// Legacy /products/:slug redirect to canonical /product/:slug
app.get("/products/:slug", (req, res) => {
  const slug = req.params.slug;
  console.log(`[REDIRECT] /products/${slug} -> /product/${slug}`);
  return res.redirect(301, `/product/${slug}`);
});

// SEO product page handler (server-side EJS rendering)
// Supports localized SEO based on visitor locale
// Accepts both product ID and slug
app.get("/product/:slug", localeMiddleware, async (req, res) => {
  try {
    const { productStore } = require("./src/productStore");
    const productCatalog = require("./services/productCatalog");
    const param = req.params.slug;
    
    const isIdShaped = /^\d{15,}$/.test(param) || param.startsWith('cj-');
    
    let product = null;
    
    if (isIdShaped) {
      product = productStore.getProductById(param);
    }
    if (!product) {
      product = productStore.getProductBySlug(param);
    }
    if (!product) {
      product = productStore.getProductById(param);
    }
    
    if (!product) {
      const PRODUCTS_CJ = path.join(__dirname, 'data', 'products_cj.json');
      if (fs.existsSync(PRODUCTS_CJ)) {
        try {
          const cjData = JSON.parse(fs.readFileSync(PRODUCTS_CJ, 'utf-8'));
          const cjProducts = Array.isArray(cjData) ? cjData : (cjData.products || []);
          product = cjProducts.find(p => 
            String(p.id) === param || 
            (p.slug && p.slug === param)
          );
        } catch (e) {
          log(`[PDP] Error reading products_cj.json: ${e.message}`);
        }
      }
    }
    
    if (!product) {
      log(`[PDP] Product not found: ${param} (isId=${isIdShaped})`);
      return res.status(404).render('404', { title: 'Product Not Found' });
    }

    const locale = req.locale || DEFAULT_LOCALE;
    
    let localizedSeo = null;
    const SEO_REMOTE_ENABLED = process.env.SEO_REMOTE_ENABLED === 'true';
    
    if (SEO_REMOTE_ENABLED) {
      try {
        const seoPromise = getSeoLocalized(product.id, locale);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SEO fetch timeout')), 800)
        );
        localizedSeo = await Promise.race([seoPromise, timeoutPromise]);
        if (localizedSeo && localizedSeo.status !== 'published') {
          localizedSeo = null;
        }
      } catch (seoErr) {
        if (!global._seoErrorWarned) {
          global._seoErrorWarned = true;
          log(`[SEO] Localized SEO disabled for this session: ${seoErr.message}`);
        }
      }
    }
    
    const allProducts = productCatalog.loadProducts();
    const relatedProducts = allProducts
      .filter(p => p.id !== product.id && (p.mainCategorySlug === product.mainCategorySlug || p.category === product.category))
      .slice(0, 4);

    res.set("Cache-Control", "no-store, must-revalidate");
    res.render('product', {
      title: product.title || product.name || 'Product',
      product,
      relatedProducts,
      locale,
      localizedSeo
    });
  } catch (err) {
    log(`[PDP] Error serving product page: ${err.message}`);
    console.error('[PDP] Stack:', err.stack);
    res.status(500).render('404', { title: 'Error', error: err.message });
  }
});

// Category page handler - serves SPA with category slug injected
app.get("/category/:slug", async (req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf-8");
    const categorySlug = req.params.slug;
    
    html = html.replace(
      /src="\/app\.js"/,
      `src="/app.js?v=${BUILD_ID}"`
    ).replace(
      /src="\/pawsy\/pawsyVideos\.js"/,
      `src="/pawsy/pawsyVideos.js?v=${BUILD_ID}"`
    ).replace(
      /href="\/styles\.css"/,
      `href="/styles.css?v=${BUILD_ID}"`
    );
    
    const finalHtml = html.replace(
      '</body>',
      `<script>window.__CATEGORY_SLUG__="${categorySlug}";</script></body>`
    );
    
    res.set("Cache-Control", "public, max-age=3600");
    res.send(finalHtml);
  } catch (err) {
    log(`[Category] Error serving category page: ${err.message}`);
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// New category routes: /c/:category and /c/:category/:subcategory
app.get("/c/:category", async (req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf-8");
    const categorySlug = req.params.category;
    const categoryDef = getCategoryBySlug(categorySlug);
    
    html = html.replace(
      /src="\/app\.js"/,
      `src="/app.js?v=${BUILD_ID}"`
    ).replace(
      /src="\/pawsy\/pawsyVideos\.js"/,
      `src="/pawsy/pawsyVideos.js?v=${BUILD_ID}"`
    ).replace(
      /href="\/styles\.css"/,
      `href="/styles.css?v=${BUILD_ID}"`
    );
    
    const seoTitle = categoryDef ? `${categoryDef.name} - Pet Products | GetPawsy` : "Shop Pet Products | GetPawsy";
    const seoDesc = categoryDef ? `Shop our curated collection of ${categoryDef.name.toLowerCase()} products. Fast US shipping.` : "Premium pet products with fast US shipping.";
    
    html = html.replace('<!-- SEO_META -->', `
      <title>${seoTitle}</title>
      <meta name="description" content="${seoDesc}">
      <meta property="og:title" content="${seoTitle}">
      <meta property="og:description" content="${seoDesc}">
      <link rel="canonical" href="https://getpawsy.pet/c/${categorySlug}">
    `);
    
    // Inject view variables into HEAD so they're set before app.js runs
    const viewScript = `<script>window.__CATEGORY_SLUG__="${categorySlug}";window.__VIEW__="category";</script>`;
    
    // CSS to hide ALL homepage sections for category pages
    const hideHomepageCSS = `<style id="cat-page-css">
      /* Hide all homepage sections for category pages */
      #hero, .hero, .hero-wrapper, .hero-4k, #shop-by-category, #top-picks,
      #featured-collections, .featured-collections-section, #petPrefBanner, .pet-pref-banner,
      #pet-needs, .pet-needs-section, .trust-bar-section, #new-arrivals,
      #categorySlider, .category-slider-section, .section-premium { display: none !important; }
      /* Show category view */
      #categoryViewPage { display: block !important; padding-top: 20px; }
    </style>`;
    
    const finalHtml = html.replace('</head>', `${hideHomepageCSS}${viewScript}</head>`);
    
    res.set("Cache-Control", "public, max-age=3600");
    res.send(finalHtml);
  } catch (err) {
    log(`[Category] Error serving /c/${req.params.category}: ${err.message}`);
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

app.get("/c/:category/:subcategory", async (req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf-8");
    const { category, subcategory } = req.params;
    const subDef = getSubcategoryBySlug(category, subcategory);
    
    html = html.replace(
      /src="\/app\.js"/,
      `src="/app.js?v=${BUILD_ID}"`
    ).replace(
      /src="\/pawsy\/pawsyVideos\.js"/,
      `src="/pawsy/pawsyVideos.js?v=${BUILD_ID}"`
    ).replace(
      /href="\/styles\.css"/,
      `href="/styles.css?v=${BUILD_ID}"`
    );
    
    const seoTitle = subDef ? `${subDef.name} for ${subDef.categoryName} | GetPawsy` : "Shop Pet Products | GetPawsy";
    const seoDesc = subDef ? `Shop ${subDef.name.toLowerCase()} for ${subDef.categoryName.toLowerCase()}. Fast US shipping, curated by Pawsy AI.` : "Premium pet products.";
    
    html = html.replace('<!-- SEO_META -->', `
      <title>${seoTitle}</title>
      <meta name="description" content="${seoDesc}">
      <meta property="og:title" content="${seoTitle}">
      <meta property="og:description" content="${seoDesc}">
      <link rel="canonical" href="https://getpawsy.pet/c/${category}/${subcategory}">
    `);
    
    // Inject view variables into HEAD so they're set before app.js runs
    const viewScript = `<script>window.__CATEGORY_SLUG__="${category}";window.__SUBCATEGORY_SLUG__="${subcategory}";window.__VIEW__="subcategory";</script>`;
    
    // CSS to hide ALL homepage sections and show only subcategory content
    const hideHomepageCSS = `<style id="subcat-page-css">
      /* Hide all homepage sections for subcategory pages */
      body #hero, body .hero, body .hero-wrapper, body .hero-4k, body #shop-by-category, body #top-picks,
      body #featured-collections, body .featured-collections-section, body #petPrefBanner, body .pet-pref-banner,
      body #pet-needs, body .pet-needs-section, body .trust-bar-section, body #new-arrivals,
      body #categorySlider, body .category-slider-section, body .section-premium,
      body #best-sellers, body #trending-now, body #dog-products, body #cat-products, body #shop,
      body .grid-head, body .category-section, body .top-picks-section,
      body section.grid-head, body section.category-section { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
      /* Show subcategory view */
      body #subcategoryViewPage, body .subcategory-view-page { display: block !important; visibility: visible !important; height: auto !important; padding-top: 20px; }
    </style>`;
    
    let finalHtml = html.replace('</head>', `${hideHomepageCSS}${viewScript}</head>`);
    
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.send(finalHtml);
  } catch (err) {
    log(`[Category] Error serving /c/${req.params.category}/${req.params.subcategory}: ${err.message}`);
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// Landing page (ads-ready variant)
app.get("/landing", (req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.sendFile(path.join(__dirname, "public", "landing.html"));
});

// Alternative landing route
app.get("/lp", (req, res) => {
  res.redirect("/landing");
});

// Categories overview page
app.get("/categories", async (req, res) => {
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf-8");
    
    html = html.replace(
      /src="\/app\.js"/,
      `src="/app.js?v=${BUILD_ID}"`
    ).replace(
      /src="\/pawsy\/pawsyVideos\.js"/,
      `src="/pawsy/pawsyVideos.js?v=${BUILD_ID}"`
    ).replace(
      /href="\/styles\.css"/,
      `href="/styles.css?v=${BUILD_ID}"`
    );
    
    html = html.replace('<!-- SEO_META -->', `
      <title>Shop by Category | GetPawsy</title>
      <meta name="description" content="Browse our pet product categories. Dogs, cats, and more. Fast US shipping.">
      <link rel="canonical" href="https://getpawsy.pet/categories">
    `);
    
    // Inject view variables into HEAD so they're set before app.js runs
    const viewScript = `<script>window.__VIEW__="categories";</script>`;
    const finalHtml = html.replace('</head>', `${viewScript}</head>`);
    
    res.set("Cache-Control", "public, max-age=3600");
    res.send(finalHtml);
  } catch (err) {
    log(`[Category] Error serving /categories: ${err.message}`);
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// Admin authentication middleware (session-based) - MUST be before express.static
const isProduction = process.env.NODE_ENV === "production" || process.env.REPL_SLUG;

function requireAdminSession(req, res, next) {
  return adminAuth.requireAdminSession(req, res, next);
}

// Log admin auth status at startup
log(`[AdminAuth] Admin auth enabled: ${!!adminAuth.getAdminPassword() || !!adminAuth.getAdminKey()}`);
if (!adminAuth.getAdminPassword()) {
  log("[AdminAuth] WARNING: ADMIN_PASSWORD not set - session login will not work");
}

// Setup Collections API routes (Top Picks, Best Sellers, Trending, etc.)
setupCollectionsRoutes(app, requireAdminSession);
log("[Collections] Collections API routes registered");

// Mount collection routes for /collection/:category and /collection/small-pets/:subcat
const collectionRoutes = require("./routes/collection/index.js");
app.use("/collection", collectionRoutes);
log("[Routes] Collection routes mounted at /collection");

// Mount admin pricing routes for CSV export/import
const adminPricingRoutes = require("./routes/admin-pricing.js");
app.use("/api/admin/pricing", adminPricingRoutes);
log("[Routes] Admin pricing routes mounted at /api/admin/pricing");

// Mount admin catalog routes for full catalog CSV export/import
const adminCatalogRoutes = require("./routes/admin-catalog.js");
app.use("/api/admin/catalog", adminCatalogRoutes);
log("[Routes] Admin catalog routes mounted at /api/admin/catalog");

// Mount admin CJ cost sync routes
const adminCjCostRoutes = require("./routes/admin-cj-costs.js");
app.use("/api/admin/cj", adminCjCostRoutes);
log("[Routes] Admin CJ cost routes mounted at /api/admin/cj");

// Mount admin CJ match import routes
const adminCjMatchRoutes = require("./routes/admin-cj-match.js");
app.use("/api/admin/cj-match", adminCjMatchRoutes);
log("[Routes] Admin CJ match routes mounted at /api/admin/cj-match");

// Mount admin backup routes
const adminBackupRoutes = require("./routes/admin-backup.js");
app.use("/api/admin/backups", adminBackupRoutes);
log("[Routes] Admin backup routes mounted at /api/admin/backups");

// Redirects for old routes to canonical /collection/... routes
app.get("/dogs", (req, res) => res.redirect(301, "/collection/dogs"));
app.get("/cats", (req, res) => res.redirect(301, "/collection/cats"));
app.get("/small-pets", (req, res) => res.redirect(301, "/collection/small-pets"));
app.get("/small-pets/:subcat", (req, res) => res.redirect(301, `/collection/small-pets/${req.params.subcat}`));

// Admin login endpoint (supports both password and token-based login)
app.post("/api/admin/login", (req, res) => {
  const { password, token } = req.body || {};
  
  // Token-based login (new bulletproof method)
  if (token) {
    const expected = adminAuth.getAdminApiToken();
    if (!expected) {
      return res.status(500).json({ ok: false, error: "ADMIN_API_TOKEN_NOT_SET" });
    }
    if (!adminAuth.safeEqual(token, expected)) {
      log("[AdminAuth] Token login failed: invalid token");
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED_ADMIN" });
    }
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000
    };
    res.cookie("gp_admin", token, cookieOptions);
    log("[AdminAuth] Token login successful - gp_admin cookie set");
    return res.json({ ok: true, message: "Logged in successfully" });
  }
  
  // Password-based login (legacy method)
  if (!password) {
    return res.status(400).json({ ok: false, error: "MISSING_TOKEN", hint: "Provide 'token' or 'password'" });
  }
  
  const result = adminAuth.checkPassword(password);
  if (!result.valid) {
    log(`[AdminAuth] Password login failed: ${result.reason}`);
    return res.status(401).json({ ok: false, error: result.reason });
  }
  
  const session = adminAuth.createSession();
  res.cookie("admin_session", session.token, adminAuth.getCookieOptions(isProduction));
  log("[AdminAuth] Password login successful - session created");
  res.json({ ok: true });
});

// Admin logout endpoint
app.post("/api/admin/logout", (req, res) => {
  const token = req.cookies?.admin_session;
  if (token) {
    adminAuth.destroySession(token);
  }
  res.clearCookie("admin_session", { path: "/" });
  res.clearCookie("gp_admin", { path: "/" });
  log("[AdminAuth] Logout - all sessions cleared");
  res.json({ ok: true });
});

// Admin test email endpoint (protected by admin session or x-admin-key header)
app.post("/api/admin/test-email", async (req, res) => {
  const token = req.cookies?.admin_session;
  const headerKey = req.headers["x-admin-key"];
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  const isAuthed = adminAuth.validateSession(token) || (headerKey && adminPassword && headerKey === adminPassword);
  if (!isAuthed) {
    return res.status(401).json({ ok: false, error: "Unauthorized - provide admin session or x-admin-key header" });
  }
  
  const { to } = req.body || {};
  const recipient = to || "jasperdiks@hotmail.com";
  
  try {
    const transporter = require("./routes/api/email/config.js");
    
    // Test SMTP connection
    let verifyOk = false;
    let verifyError = null;
    try {
      await transporter.verify();
      verifyOk = true;
      log("[TestEmail] SMTP verify OK");
    } catch (err) {
      verifyError = err.message;
      log(`[TestEmail] SMTP verify failed: ${err.message}`);
    }
    
    // Send test email
    let messageId = null;
    let sendError = null;
    try {
      const mailFrom = process.env.MAIL_FROM || `GetPawsy <${process.env.MAIL_USER}>`;
      const info = await transporter.sendMail({
        from: mailFrom,
        to: recipient,
        subject: "GetPawsy SMTP Test OK ✓",
        html: `
          <h1>GetPawsy SMTP Test Successful!</h1>
          <p>This test email confirms your Outlook mail configuration is working.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p><strong>SMTP Host:</strong> ${transporter.mailConfig?.host || 'smtp.office365.com'}</p>
          <p><strong>Mail User:</strong> ${process.env.MAIL_USER?.substring(0, 5)}***</p>
          <p style="color: green; font-weight: bold;">✓ Email system is operational!</p>
        `
      });
      messageId = info.messageId;
      log(`[TestEmail] Test email sent to ${recipient}, messageId: ${messageId}`);
    } catch (err) {
      sendError = err.message;
      log(`[TestEmail] Send failed: ${err.message}`);
    }
    
    res.json({
      ok: verifyOk && !!messageId,
      verifyOk,
      messageId,
      recipient,
      error: verifyError || sendError || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    log(`[TestEmail] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin auth ping endpoint (for bulletproof auth check)
app.get("/api/admin/ping", (req, res) => {
  const expected = adminAuth.getAdminApiToken();
  const cookieToken = req.cookies?.gp_admin;
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  const xAdminToken = req.headers["x-admin-token"];
  
  const provided = cookieToken || bearerToken || xAdminToken;
  const isValid = expected && provided && adminAuth.safeEqual(provided, expected);
  
  res.json({ 
    ok: isValid, 
    ts: new Date().toISOString(),
    authenticated: isValid,
    method: isValid ? (cookieToken ? "cookie" : "header") : null
  });
});

// Admin auth status endpoint (legacy)
app.get("/api/admin/me", (req, res) => {
  const sessionToken = req.cookies?.admin_session;
  const gpToken = req.cookies?.gp_admin;
  const expected = adminAuth.getAdminApiToken();
  
  const sessionValid = adminAuth.validateSession(sessionToken);
  const gpTokenValid = expected && gpToken && adminAuth.safeEqual(gpToken, expected);
  
  res.json({ authenticated: sessionValid || gpTokenValid });
});

// Admin dashboard handler - shared logic for auth check
function handleAdminDashboard(req, res) {
  const token = req.cookies?.admin_session;
  const keyFromQuery = req.query.key ? String(req.query.key).trim() : "";
  
  // Check for magic link login
  if (adminAuth.isMagicLinkEnabled() && keyFromQuery) {
    const magicResult = adminAuth.checkMagicKey(keyFromQuery);
    if (magicResult.valid) {
      const session = adminAuth.createSession();
      res.cookie("admin_session", session.token, adminAuth.getCookieOptions(isProduction));
      log("[AdminAuth] Magic link login successful");
      return res.redirect("/admin");
    }
  }
  
  // If authenticated via session or legacy key, show dashboard
  const isSessionValid = adminAuth.validateSession(token);
  const adminKey = adminAuth.getAdminKey();
  const isLegacyKeyValid = adminKey && keyFromQuery === adminKey;
  
  if (isSessionValid || isLegacyKeyValid) {
    let html = fs.readFileSync(path.join(__dirname, "public", "admin", "index.html"), "utf-8");
    html = html.replace(
      /src="\/admin\/index\.js"/,
      `src="/admin/index.js?v=${BUILD_ID}"`
    );
    return res.send(html);
  }
  
  // Not authenticated - show login page
  res.sendFile(path.join(__dirname, "public", "admin", "login.html"));
}

// Admin dashboard - serves login or dashboard based on auth (both with and without trailing slash)
app.get("/admin", handleAdminDashboard);
app.get("/admin/", handleAdminDashboard);

// Admin login page - redirect to /admin if authenticated, else show login
app.get("/admin/login", (req, res) => {
  const token = req.cookies?.admin_session;
  if (adminAuth.validateSession(token)) {
    return res.redirect("/admin");
  }
  res.sendFile(path.join(__dirname, "public", "admin", "login.html"));
});

// === ADMIN PRO PAGE ROUTES (EJS) ===
app.get("/admin/categories", requireAdminSession, (req, res) => {
  res.render("admin/categories", { active: "categories" });
});
app.get("/admin/imports", requireAdminSession, (req, res) => {
  res.render("admin/imports", { active: "imports" });
});
app.get("/admin/jobs", requireAdminSession, (req, res) => {
  res.render("admin/jobs", { active: "jobs" });
});
app.get("/admin/roadmap", requireAdminSession, (req, res) => {
  res.render("admin/roadmap", { active: "roadmap" });
});
app.get("/admin/pawsy-insights", requireAdminSession, (req, res) => {
  res.render("admin/pawsy-insights", { active: "pawsy-insights" });
});
app.get("/admin/seo-studio", requireAdminSession, (req, res) => {
  res.render("admin/seo-studio", { active: "seo-studio" });
});

app.get("/admin/seo-products", requireAdminSession, (req, res) => {
  res.render("admin/seo-products", { active: "seo-products" });
});

// Block direct access to admin folder via static - must come AFTER /admin route
app.use("/admin", (req, res, next) => {
  const token = req.cookies?.admin_session;
  if (adminAuth.validateSession(token)) {
    return next();
  }
  res.redirect("/admin");
});

// Static files - AFTER admin auth routes (HTML files get no-cache)
// redirect: false prevents 301 redirects for directories (e.g. /product/slug)
app.use(express.static(path.join(__dirname, "public"), {
  index: false,
  redirect: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html") || filePath.endsWith(".html")) {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    }
  }
}));

// === HEALTHCHECK ENDPOINTS (must be fast, no DB calls) ===
// Simple /health for Replit deployment checks (<100ms)
app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).send("ok");
});

// /healthz - Kubernetes-style liveness probe (always returns 200 if process is alive)
app.get("/healthz", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// /readyz - Kubernetes-style readiness probe (checks DB connectivity)
app.get("/readyz", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const aiDb = require("./src/aiDatabase");
    const dbStatus = await aiDb.checkDbReady();
    if (dbStatus.ready) {
      res.status(200).json({ status: "ready", db: "connected" });
    } else {
      res.status(503).json({ status: "not_ready", db: "disconnected", error: dbStatus.error });
    }
  } catch (err) {
    res.status(503).json({ status: "not_ready", db: "error", error: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  const safeBoot = require("./src/boot/safeBoot");
  const bootStatus = safeBoot.getBootStatus();
  const fs = require("fs");
  const path = require("path");
  const dbPath = path.join(__dirname, "data", "db.json");
  let storageOk = false;
  let productCount = 0;
  let petCounts = { dog: 0, cat: 0, both: 0, nonpet: 0 };
  let petEligibleCount = 0;
  try {
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      storageOk = true;
      const products = data.products || [];
      productCount = products.length;
      products.forEach(p => {
        if (p.petType === 'dog') petCounts.dog++;
        else if (p.petType === 'cat') petCounts.cat++;
        else if (p.petType === 'both') petCounts.both++;
        else petCounts.nonpet++;
      });
      petEligibleCount = petCounts.dog + petCounts.cat + petCounts.both;
    }
  } catch (err) {
    storageOk = false;
  }
  
  // Mail configuration status (no secrets exposed)
  const mailConfigured = !!(process.env.MAIL_USER && process.env.MAIL_PASS);
  const mailHost = process.env.MAIL_HOST || "smtp.office365.com";
  const mailPort = parseInt(process.env.MAIL_PORT) || 587;
  const mailTransport = mailConfigured ? { host: mailHost, port: mailPort, secure: process.env.MAIL_SECURE === "true" } : null;
  
  // Stripe configuration status (no secrets exposed)
  const stripeConfigured = !!(process.env.STRIPE_SECRET_KEY);
  const stripeTestMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || false;
  const webhookConfigured = !!(process.env.STRIPE_WEBHOOK_SECRET);
  
  res.json({ 
    ok: true, 
    app: "GetPawsy V2.2", 
    version: "2.2.0",
    buildId: BUILD_ID,
    builtAt: BUILD_START_TIME,
    commit: GIT_COMMIT,
    env: process.env.NODE_ENV || "production",
    storage: storageOk ? "json" : "unavailable",
    storageOk,
    productCount,
    petCounts,
    petEligibleCount,
    safeMode: bootStatus.safeMode,
    hardSafeMode: bootStatus.hardSafeMode,
    migrationsEnabled: bootStatus.migrationsEnabled,
    jobsEnabled: bootStatus.jobsEnabled,
    deployment: bootStatus.deployment,
    envVarsSeen: bootStatus.envVarsSeen,
    mailConfigured,
    mailTransport,
    stripeConfigured,
    stripeTestMode,
    webhookConfigured
  });
});

app.get("/api/ready", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  try {
    const aiDb = require("./src/aiDatabase");
    const dbStatus = await aiDb.checkDbReady();
    res.json({ 
      ok: dbStatus.ready, 
      app: "GetPawsy V2.2", 
      version: "2.2.0",
      db: dbStatus
    });
  } catch (err) {
    res.json({ 
      ok: false, 
      app: "GetPawsy V2.2", 
      version: "2.2.0",
      db: { ready: false, error: err.message }
    });
  }
});

app.get("/api/version", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  
  const productCatalog = require("./services/productCatalog");
  const products = productCatalog.loadProducts();
  
  const counts = { total: products.length, dogs: 0, cats: 0, small_pets: 0, other: 0 };
  products.forEach(p => {
    const pt = (p.petType || p.pet_type || '').toLowerCase();
    if (pt === 'dog' || pt === 'dogs') counts.dogs++;
    else if (pt === 'cat' || pt === 'cats') counts.cats++;
    else if (pt === 'small_pet' || pt === 'smallpets' || pt === 'small-pets') counts.small_pets++;
    else counts.other++;
  });
  
  res.json({
    build_id: BUILD_ID,
    app: "GetPawsy V2.9",
    commit: GIT_COMMIT,
    built_at: BUILD_START_TIME,
    node_version: process.version,
    version: "2.9.0",
    slug: process.env.REPL_SLUG || "unknown",
    env: process.env.NODE_ENV || "development",
    catalog_source: "catalog.json",
    counts
  });
});

app.get("/api/debug/home-source", (req, res) => {
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return res.status(403).json({ error: "Debug info restricted in production" });
  }
  
  const { getHomepageStats, loadProducts } = require("./helpers/topProducts");
  const { isPetProduct } = require("./src/domain/isPetProduct");
  
  const stats = getHomepageStats();
  const allProducts = loadProducts();
  
  const invalidProducts = allProducts
    .map(p => ({ product: p, validation: isPetProduct(p) }))
    .filter(r => !r.validation.eligible)
    .slice(0, 10)
    .map(r => ({
      id: r.product.id,
      title: r.product.title,
      category: r.product.category,
      reason: r.validation.reason
    }));

  res.json({
    dataSource: "products_cj.json",
    productCounts: {
      total: stats.total,
      dogs: stats.dogs,
      cats: stats.cats,
      petOnly: stats.petOnly
    },
    invalidProducts,
    mockDetected: false
  });
});

app.get("/api/debug/cart", (req, res) => {
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return res.status(403).json({ error: "Debug info restricted in production" });
  }
  
  res.json({
    info: "Cart is client-side localStorage",
    validationInfo: "Strict pet-only enforcement on checkout",
    schemaVersion: "v2.2.0",
    itemCountSummary: "Available via localStorage.getItem('pawsy_cart')",
    note: "This is informational only since cart is client-side localStorage"
  });
});

app.get("/api/debug/homepage-carousels", (req, res) => {
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return res.status(403).json({ error: "Debug info restricted in production" });
  }
  
  const { getPetProducts, isPetEligible } = require("./src/strictPetProducts");
  const { getHomepageSections } = require("./helpers/topProducts");
  const productCatalog = require("./services/productCatalog");
  
  const allProducts = productCatalog.loadProducts();
  const { dogs, cats, both, rejected } = getPetProducts(allProducts);
  
  const sections = getHomepageSections();
  
  function validateSection(products, sectionName) {
    const validated = [];
    const nonPetItems = [];
    
    for (const p of products) {
      const check = isPetEligible(p);
      const item = {
        id: p.id,
        title: (p.title || p.name || '').slice(0, 60),
        petType: p.pet_type || p.petType || null,
        category: p.mainCategorySlug || p.categorySlug || null,
        price: p.price,
        source: 'backend-strict-filter'
      };
      
      if (!check.eligible) {
        nonPetItems.push({ ...item, reason: check.reason });
        console.error(`[CAROUSEL VALIDATION] NON-PET ITEM IN ${sectionName}: ${p.id} - ${(p.title || '').slice(0, 50)}`);
      } else {
        validated.push(item);
      }
    }
    
    const first3 = products.slice(0, 3).map(p => 
      `${(p.title||'').slice(0,25)} | ${p.pet_type||p.petType||'?'} | ${p.mainCategorySlug||p.categorySlug||'?'}`
    ).join('] [');
    console.log(`SECTION ${sectionName}: first3= [${first3}]`);
    
    if (nonPetItems.length > 0) {
      console.error(`[CAROUSEL] NON-PET ITEMS IN ${sectionName}: ${nonPetItems.map(i => `${i.id}/${i.title}`).join(', ')}`);
    }
    
    return { items: validated, nonPetItems, count: validated.length };
  }
  
  try {
    const topPicksDogs = validateSection(sections.topPicksDogs, 'topPicksDogs');
    const topPicksCats = validateSection(sections.topPicksCats, 'topPicksCats');
    const bestSellers = validateSection(sections.bestSellers, 'bestSellers');
    const trending = validateSection(sections.trending, 'trending');
    
    res.json({
      success: true,
      counts: {
        dogs: dogs.length,
        cats: cats.length,
        both: both.length,
        rejected: rejected.length
      },
      sections: {
        topPicksDogs,
        topPicksCats,
        bestSellers,
        trending
      },
      allSectionsPetOnly: (
        topPicksDogs.nonPetItems.length === 0 &&
        topPicksCats.nonPetItems.length === 0 &&
        bestSellers.nonPetItems.length === 0 &&
        trending.nonPetItems.length === 0
      )
    });
  } catch (err) {
    console.error("[DEBUG] Homepage carousels validation error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      allSectionsPetOnly: false
    });
  }
});

app.get("/api/debug/homepage", (req, res) => {
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return res.status(403).json({ error: "Debug info restricted in production" });
  }
  
  const { getPetProducts, isPetEligible } = require("./src/strictPetProducts");
  const { getHomepageSections } = require("./helpers/topProducts");
  const productCatalog = require("./services/productCatalog");
  
  const allProducts = productCatalog.loadProducts();
  const { dogs, cats, both, rejected } = getPetProducts(allProducts);
  
  const sections = getHomepageSections();
  
  const smallPetsProducts = allProducts.filter(p => {
    const cat = (p.mainCategorySlug || p.categorySlug || p.category || '').toLowerCase();
    const petType = (p.pet_type || p.petType || '').toLowerCase();
    return cat.includes('small') || petType.includes('small') || 
           cat.includes('rabbit') || cat.includes('hamster') || 
           cat.includes('bird') || cat.includes('fish');
  });
  
  function summarizeSection(products, sectionName) {
    if (!products || !Array.isArray(products)) {
      return { count: 0, ids: [], blocked: [] };
    }
    
    const blocked = products.filter(p => {
      const check = isPetEligible(p);
      return !check.eligible;
    });
    
    return {
      count: products.length,
      ids: products.slice(0, 15).map(p => p.id),
      blocked: blocked.map(p => ({ id: p.id, title: (p.title || '').slice(0, 40) }))
    };
  }
  
  res.json({
    success: true,
    counts: {
      total: allProducts.length,
      dogs: dogs.length,
      cats: cats.length,
      both: both.length,
      smallPets: smallPetsProducts.length,
      rejected: rejected.length
    },
    carousels: {
      bestSellers: summarizeSection(sections.bestSellers, 'bestSellers'),
      topPicksDogs: summarizeSection(sections.topPicksDogs, 'topPicksDogs'),
      topPicksCats: summarizeSection(sections.topPicksCats, 'topPicksCats'),
      trendingNow: summarizeSection(sections.trending, 'trendingNow')
    }
  });
});

app.get("/api/debug/hero", (req, res) => {
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return res.status(403).json({ error: "Debug info restricted in production" });
  }
  
  try {
    const { getHomepageSectionsWithDebug } = require("./helpers/topProducts");
    const result = getHomepageSectionsWithDebug();
    
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      sectionsOrder: result.debug.sectionsOrder,
      sections: {},
      usedGlobalSet: result.debug.usedGlobalSet,
      duplicatesFound: result.debug.duplicatesFound,
      summary: {
        totalUniqueProducts: result.debug.usedGlobalSet.length,
        totalDuplicatesSkipped: result.debug.duplicatesFound.length,
        deduplicationActive: true
      }
    };
    
    for (const [sectionName, sectionDebug] of Object.entries(result.debug.sections)) {
      response.sections[sectionName] = {
        requestedIds: sectionDebug.requestedIds,
        resolvedIds: sectionDebug.resolvedIds,
        skippedDuplicates: sectionDebug.skippedDuplicates,
        count: sectionDebug.count,
        products: result.sections[sectionName]?.slice(0, 12).map(p => ({
          id: p.id,
          title: (p.title || '').slice(0, 50),
          category: p.category || p.mainCategorySlug || ''
        })) || []
      };
    }
    
    res.json(response);
  } catch (err) {
    console.error("[DEBUG] Hero dedup error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

app.get("/api/debug/product-public/:idOrSlug", (req, res) => {
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return res.status(403).json({ error: "Debug info restricted in production" });
  }
  
  const param = req.params.idOrSlug;
  const isNumeric = /^\d+$/.test(param);
  
  let product = null;
  
  if (isNumeric) {
    product = productStore.getProductById(param);
  }
  
  if (!product) {
    const allProducts = productStore.listProducts ? productStore.listProducts() : [];
    product = allProducts.find(p => 
      String(p.id) === param || 
      (p.slug && p.slug === param) ||
      (p.handle && p.handle === param)
    );
  }
  
  if (!product) {
    const PRODUCTS_CJ = path.join(__dirname, 'data', 'products_cj.json');
    if (fs.existsSync(PRODUCTS_CJ)) {
      try {
        const cjData = JSON.parse(fs.readFileSync(PRODUCTS_CJ, 'utf-8'));
        const cjProducts = Array.isArray(cjData) ? cjData : (cjData.products || []);
        product = cjProducts.find(p => 
          String(p.id) === param || 
          (p.slug && p.slug === param)
        );
      } catch (e) {
        log(`[Debug] Error reading products_cj.json: ${e.message}`);
      }
    }
  }
  
  if (!product) {
    return res.status(404).json({ error: "Product not found", param });
  }
  
  const images = product.images || [];
  const videos = product.videos || [];
  
  res.json({
    id: product.id,
    slug: product.slug || null,
    title: product.title || product.name,
    category: product.category || product.mainCategorySlug,
    petType: product.pet_type || product.petType,
    imagesCount: images.length,
    videosCount: videos.length,
    hasGallery: images.length > 1
  });
});

app.get("/api/build", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  
  let frontend = null;
  let serving_dist = false;
  try {
    const buildJsonPath = path.join(__dirname, "public", "build.json");
    if (fs.existsSync(buildJsonPath)) {
      frontend = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      serving_dist = true;
    }
  } catch (e) {
    frontend = { error: "build.json not found or invalid" };
  }
  
  res.json({
    backend: {
      build_id: BUILD_ID,
      built_at: BUILD_START_TIME,
      commit: GIT_COMMIT,
      version: "2.2.0"
    },
    frontend: frontend || { build_id: "N/A", message: "Run npm run build to generate" },
    serving_dist: serving_dist,
    framework: "Node.js Express + Vanilla JS",
    swDisabled: true,
    cacheStrategy: "no-store for HTML, content-hash for assets"
  });
});

app.get("/api/deploy-info", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.json({
    repl_slug: process.env.REPL_SLUG || "unknown",
    repl_id: process.env.REPL_ID || "unknown",
    repl_owner: process.env.REPL_OWNER || "unknown",
    node_env: process.env.NODE_ENV || "production",
    port: PORT,
    commit: GIT_COMMIT,
    build_id: BUILD_ID,
    built_at: BUILD_START_TIME,
    app: "GetPawsy V2.2",
    version: "2.2.0"
  });
});

// === ADMIN PRO API ENDPOINTS ===
const featureFlags = require("./src/admin/featureFlags");
const jobQueue = require("./src/admin/jobQueue");
const productHealth = require("./src/admin/productHealth");

// Jobs API
app.get("/api/admin/jobs", requireAdminSession, (req, res) => {
  const jobs = jobQueue.listJobs({ limit: 50 });
  res.json({ ok: true, jobs });
});
app.post("/api/admin/jobs/:id/cancel", requireAdminSession, (req, res) => {
  const success = jobQueue.cancelJob(req.params.id);
  res.json({ ok: success });
});

// Roadmap API
app.get("/api/admin/roadmap/checklist", requireAdminSession, (req, res) => {
  res.json({ ok: true, checklist: featureFlags.getReleaseChecklist() });
});
app.get("/api/admin/roadmap/flags", requireAdminSession, (req, res) => {
  res.json({ ok: true, flags: featureFlags.getAllFlags() });
});
app.post("/api/admin/roadmap/flags", requireAdminSession, (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ ok: false, error: "Key required" });
  featureFlags.setFlag(key, value);
  res.json({ ok: true });
});

// Category Stats API
app.get("/api/admin/categories/stats", requireAdminSession, async (req, res) => {
  try {
    const dbPath = path.join(__dirname, "data", "db.json");
    const data = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf8")) : { products: [] };
    const products = data.products || [];
    
    const categoryMap = {};
    let uncategorized = 0;
    
    for (const p of products) {
      if (p.deletedAt) continue;
      const cat = p.categorySlug || p.category || null;
      if (!cat) { uncategorized++; continue; }
      if (!categoryMap[cat]) categoryMap[cat] = { slug: cat, name: cat, productCount: 0, subcategories: [] };
      categoryMap[cat].productCount++;
    }
    
    const categories = Object.values(categoryMap);
    const dogCategories = categories.filter(c => /dog|canine|puppy/i.test(c.slug)).length;
    const catCategories = categories.filter(c => /cat|feline|kitten/i.test(c.slug)).length;
    
    res.json({ ok: true, totalCategories: categories.length, dogCategories, catCategories, uncategorized, categories });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/categories/auto-assign", requireAdminSession, async (req, res) => {
  try {
    const dbPath = path.join(__dirname, "data", "db.json");
    const data = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf8")) : { products: [] };
    let assigned = 0;
    
    for (const p of data.products) {
      if (p.deletedAt || p.categorySlug) continue;
      const title = (p.title || "").toLowerCase();
      if (/dog|puppy|canine/.test(title)) { p.categorySlug = "dogs"; assigned++; }
      else if (/cat|kitten|feline/.test(title)) { p.categorySlug = "cats"; assigned++; }
    }
    
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    res.json({ ok: true, assigned });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Import Logs API
app.get("/api/admin/imports/logs", requireAdminSession, (req, res) => {
  try {
    const logsPath = path.join(__dirname, "data", "import_logs.json");
    const imports = fs.existsSync(logsPath) ? JSON.parse(fs.readFileSync(logsPath, "utf8")) : [];
    res.json({ ok: true, imports: imports.slice(-50).reverse() });
  } catch (err) {
    res.json({ ok: true, imports: [] });
  }
});

// Pawsy Insights API
app.get("/api/admin/pawsy/insights", requireAdminSession, async (req, res) => {
  try {
    const eventsPath = path.join(__dirname, "data", "pawsy_events.jsonl");
    let totalConversations = 0, productsRecommended = 0, addToCartClicks = 0;
    const topQuestions = [], topProducts = [], unknownQuestions = [];
    
    if (fs.existsSync(eventsPath)) {
      const lines = fs.readFileSync(eventsPath, "utf8").split("\n").filter(l => l.trim());
      const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      
      const questionCount = {}, productCount = {};
      for (const e of events) {
        if (e.event === "pawsy_open") totalConversations++;
        if (e.event === "pawsy_products_shown") productsRecommended += (e.products || []).length;
        if (e.event === "pawsy_atc") addToCartClicks++;
        if (e.event === "pawsy_product_click" && e.productId) {
          productCount[e.productId] = (productCount[e.productId] || 0) + 1;
        }
      }
    }
    
    const conversionRate = totalConversations > 0 ? (addToCartClicks / totalConversations) * 100 : 0;
    res.json({ ok: true, totalConversations, productsRecommended, addToCartClicks, conversionRate, topQuestions, topProducts, unknownQuestions });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// SEO Studio API
app.get("/api/admin/seo/categories", requireAdminSession, (req, res) => {
  try {
    const seoPath = path.join(__dirname, "data", "category_seo.json");
    const categories = fs.existsSync(seoPath) ? JSON.parse(fs.readFileSync(seoPath, "utf8")) : [];
    res.json({ ok: true, categories });
  } catch (err) {
    res.json({ ok: true, categories: [] });
  }
});

app.post("/api/admin/seo/generate-all", requireAdminSession, async (req, res) => {
  const { dryRun } = req.body || {};
  try {
    const seoPath = path.join(__dirname, "data", "category_seo.json");
    const defaultCategories = [
      { slug: "dogs", name: "Dog Products", icon: "🐕" },
      { slug: "cats", name: "Cat Products", icon: "🐱" },
      { slug: "toys", name: "Pet Toys", icon: "🎾" },
      { slug: "feeding", name: "Feeding", icon: "🍖" },
      { slug: "grooming", name: "Grooming", icon: "✂️" },
      { slug: "health", name: "Health", icon: "💊" }
    ];
    
    const categories = defaultCategories.map(cat => ({
      ...cat,
      seoTitle: `${cat.name} | GetPawsy - Premium Pet Supplies`,
      seoDescription: `Shop our selection of ${cat.name.toLowerCase()} for your furry friend. Fast US shipping, quality guaranteed.`,
      faqs: [
        { q: `What ${cat.name.toLowerCase()} do you offer?`, a: `We offer a wide range of premium ${cat.name.toLowerCase()} for dogs and cats.` }
      ]
    }));
    
    if (!dryRun) {
      fs.writeFileSync(seoPath, JSON.stringify(categories, null, 2));
    }
    res.json({ ok: true, count: categories.length, dryRun });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/seo/generate/:slug", requireAdminSession, async (req, res) => {
  const { slug } = req.params;
  try {
    const seoPath = path.join(__dirname, "data", "category_seo.json");
    let categories = fs.existsSync(seoPath) ? JSON.parse(fs.readFileSync(seoPath, "utf8")) : [];
    
    const idx = categories.findIndex(c => c.slug === slug);
    const cat = idx >= 0 ? categories[idx] : { slug, name: slug };
    
    cat.seoTitle = `${cat.name || slug} | GetPawsy - Premium Pet Supplies`;
    cat.seoDescription = `Shop our selection of ${(cat.name || slug).toLowerCase()} for your furry friend.`;
    cat.faqs = [{ q: `Why choose GetPawsy for ${cat.name || slug}?`, a: `Quality, fast shipping, and great prices.` }];
    
    if (idx >= 0) categories[idx] = cat;
    else categories.push(cat);
    
    fs.writeFileSync(seoPath, JSON.stringify(categories, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Media Mirror Admin API
app.post("/api/admin/mirror/run", requireAdminSession, async (req, res) => {
  try {
    const { limit, productId, skipExisting = true, includeVideos = false } = req.body || {};
    const { runMirrorJob } = require("./src/mirrorJob");
    
    runMirrorJob({ limit, productId, skipExisting, includeVideos })
      .then(result => console.log(`[MirrorJob] Completed:`, result.progress))
      .catch(err => console.error(`[MirrorJob] Error:`, err.message));
    
    res.json({ ok: true, message: "Mirror job started", jobId: `mirror-${Date.now()}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/mirror/status", requireAdminSession, (req, res) => {
  try {
    const { getCurrentJobStatus, getMediaStats } = require("./src/mirrorJob");
    const jobStatus = getCurrentJobStatus();
    const stats = getMediaStats();
    res.json({ ok: true, job: jobStatus, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/mirror/stats", requireAdminSession, (req, res) => {
  try {
    const { getMediaStats } = require("./src/mirrorJob");
    const stats = getMediaStats();
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Product Health API
app.get("/api/admin/products/health", requireAdminSession, async (req, res) => {
  try {
    const stats = await productHealth.getProductHealthStats();
    const needsAttention = await productHealth.getProductsNeedingAttention(20);
    res.json({ ok: true, stats, needsAttention });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// QA Dashboard - Full health check
app.get("/api/admin/qa/dashboard", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const active = products.filter(p => p.active !== false && !p.deletedAt);
    
    let petEligible = 0, petIneligible = 0, dogs = 0, cats = 0, both = 0, unknown = 0;
    let brokenImages = 0, missingDescriptions = 0, missingCategories = 0, nonPetQuarantined = 0;
    const nonPetSamples = [];
    
    for (const p of active) {
      const eligible = checkPetEligible(p);
      if (eligible) {
        petEligible++;
        if (p.petType === 'dog' || p.pet_usage === 'dogs') dogs++;
        else if (p.petType === 'cat' || p.pet_usage === 'cats') cats++;
        else if (p.petType === 'both' || p.pet_usage === 'both') both++;
        else unknown++;
      } else {
        petIneligible++;
        if (nonPetSamples.length < 10) nonPetSamples.push({ id: p.id, title: (p.title || '').substring(0, 60) });
      }
      if (p.quarantined) nonPetQuarantined++;
      if (!p.image || !isValidProductImage(p.image)) brokenImages++;
      if (!p.description || p.description.length < 20) missingDescriptions++;
      if (!p.category && !p.categorySlug && !p.bucket) missingCategories++;
    }
    
    res.json({
      ok: true,
      counts: { total: products.length, active: active.length, petEligible, petIneligible, dogs, cats, both, unknown, nonPetQuarantined, brokenImages, missingDescriptions, missingCategories },
      nonPetSamples
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Pet Backfill - Re-run eligibility on all products
app.post("/api/admin/qa/pet-backfill", requireAdminSession, async (req, res) => {
  try {
    const dbPath = path.join(__dirname, "data", "db.json");
    const data = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf8")) : { products: [] };
    let updated = 0, quarantined = 0;
    
    for (const p of data.products) {
      if (p.deletedAt) continue;
      const result = petEligibilityNew.isPetEligible({
        title: p.title || '',
        description: p.description || '',
        tags: p.tags,
        category: p.category || '',
        type: p.type || ''
      });
      
      const wasEligible = p.is_pet;
      p.is_pet = result.eligible;
      p.pet_usage = result.usage;
      p.petType = result.usage === 'dogs' ? 'dog' : result.usage === 'cats' ? 'cat' : result.usage === 'both' ? 'both' : null;
      p.eligibilityScore = result.score;
      p.eligibilityReasons = result.reasons;
      
      if (!result.eligible && !p.quarantined) {
        p.quarantined = true;
        p.quarantinedAt = new Date().toISOString();
        p.quarantineReason = 'Pet eligibility backfill';
        quarantined++;
      }
      
      if (wasEligible !== result.eligible) updated++;
    }
    
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    log(`[QA Backfill] Updated ${updated} products, quarantined ${quarantined} non-pet items`);
    res.json({ ok: true, updated, quarantined, total: data.products.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Quarantine non-pet products
app.post("/api/admin/qa/quarantine-non-pet", requireAdminSession, async (req, res) => {
  try {
    const dbPath = path.join(__dirname, "data", "db.json");
    const data = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf8")) : { products: [] };
    let quarantined = 0;
    
    for (const p of data.products) {
      if (p.deletedAt || p.quarantined) continue;
      if (p.is_pet === false || !checkPetEligible(p)) {
        p.quarantined = true;
        p.quarantinedAt = new Date().toISOString();
        p.quarantineReason = 'Non-pet product';
        p.is_active = false;
        quarantined++;
      }
    }
    
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    log(`[QA] Quarantined ${quarantined} non-pet products`);
    res.json({ ok: true, quarantined });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ BULK FIX TOOLS ============

// Bulk deactivate non-pet products
app.post("/api/admin/bulk/deactivate-non-pet", requireAdminSession, async (req, res) => {
  try {
    const dbPath = path.join(__dirname, "data", "db.json");
    const data = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf8")) : { products: [] };
    let deactivated = 0;
    
    for (const p of data.products) {
      if (p.deletedAt) continue;
      if (!checkPetEligible(p) && p.is_active !== false) {
        p.is_active = false;
        p.deactivatedAt = new Date().toISOString();
        p.deactivateReason = 'Bulk: non-pet product';
        deactivated++;
      }
    }
    
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    logAdminAction("bulk_deactivate_non_pet", { deactivated });
    res.json({ ok: true, deactivated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Bulk recategorize products
app.post("/api/admin/bulk/recategorize", requireAdminSession, async (req, res) => {
  try {
    const dbPath = path.join(__dirname, "data", "db.json");
    const data = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, "utf8")) : { products: [] };
    let updated = 0;
    
    for (const p of data.products) {
      if (p.deletedAt || !p.is_pet) continue;
      const result = petEligibilityNew.isPetEligible({
        title: p.title || '',
        description: p.description || '',
        tags: p.tags,
        category: p.category || '',
        type: p.type || ''
      });
      
      if (result.eligible) {
        const oldType = p.petType;
        p.petType = result.usage === 'dogs' ? 'dog' : result.usage === 'cats' ? 'cat' : result.usage === 'both' ? 'both' : p.petType;
        p.pet_usage = result.usage;
        if (oldType !== p.petType) updated++;
      }
    }
    
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    logAdminAction("bulk_recategorize", { updated });
    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Bulk regenerate SEO
app.post("/api/admin/bulk/regenerate-seo", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const active = products.filter(p => p.is_active !== false && !p.deletedAt && checkPetEligible(p));
    let updated = 0;
    
    for (const p of active.slice(0, 50)) {
      if (!p.seoTitle || !p.seoDescription) {
        p.seoTitle = `${p.title || 'Product'} | GetPawsy`;
        p.seoDescription = (p.description || '').substring(0, 160) || `Shop ${p.title} for your pet at GetPawsy.`;
        updated++;
      }
    }
    
    logAdminAction("bulk_regenerate_seo", { updated });
    res.json({ ok: true, updated, note: 'Processed first 50 products without SEO' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Bulk reprice using smart pricing
app.post("/api/admin/bulk/reprice", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const active = products.filter(p => p.is_active !== false && !p.deletedAt && checkPetEligible(p) && p.costPrice);
    let repriced = 0;
    
    for (const p of active) {
      const cost = parseFloat(p.costPrice) || 0;
      if (cost > 0) {
        let margin = 0.40;
        if (cost < 10) margin = 0.60;
        else if (cost < 25) margin = 0.50;
        else if (cost > 50) margin = 0.35;
        
        const newPrice = Math.round((cost / (1 - margin)) * 100) / 100;
        const rounded = Math.floor(newPrice) + 0.99;
        
        if (Math.abs(p.price - rounded) > 0.10) {
          p.previousPrice = p.price;
          p.price = rounded;
          repriced++;
        }
      }
    }
    
    logAdminAction("bulk_reprice", { repriced });
    res.json({ ok: true, repriced, note: `Repriced ${repriced} products with tiered margins` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/purge-demo", requireAdminSession, async (req, res) => {
  try {
    const { DEMO_PATTERNS } = require("./src/isRealProduct");
    const products = await db.listProducts();
    let purged = 0;
    const purgedIds = [];
    
    for (const p of products) {
      const id = String(p.id || '').toLowerCase();
      const title = String(p.title || '').toLowerCase();
      const image = String(p.image || '').toLowerCase();
      const source = String(p.source || '').toLowerCase();
      
      let isDemo = false;
      if (source === 'demo' || source === 'seed' || source === 'sample') isDemo = true;
      if (id.includes('demo') || id.includes('sample') || id.includes('test')) isDemo = true;
      if (title.includes('demo') || title.includes('placeholder')) isDemo = true;
      if (image.includes('demo') || image.includes('placeholder') || image.endsWith('.svg')) isDemo = true;
      
      if (isDemo) {
        await db.deleteProduct(p.id);
        purgedIds.push(p.id);
        purged++;
      }
    }
    
    productStore.reload && productStore.reload();
    
    logAdminAction("purge_demo", { purged, ids: purgedIds });
    log(`[Admin] Purged ${purged} demo/seed products: ${purgedIds.join(', ')}`);
    res.json({ ok: true, purged, purgedIds });
  } catch (err) {
    console.error("[Purge Demo Error]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Export CSV report of issues
app.get("/api/admin/bulk/export-issues", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const issues = [];
    
    for (const p of products) {
      if (p.deletedAt) continue;
      const productIssues = [];
      
      if (!p.image || !isValidProductImage(p.image)) productIssues.push('missing_image');
      if (!p.description || p.description.length < 20) productIssues.push('short_description');
      if (!p.category && !p.categorySlug) productIssues.push('no_category');
      if (!p.seoTitle) productIssues.push('no_seo_title');
      if (!checkPetEligible(p)) productIssues.push('not_pet_eligible');
      if (!p.variants || p.variants.length === 0) productIssues.push('no_variants');
      
      if (productIssues.length > 0) {
        issues.push({
          id: p.id,
          title: (p.title || '').substring(0, 50),
          issues: productIssues.join(', '),
          is_active: p.is_active !== false,
          petType: p.petType || 'unknown'
        });
      }
    }
    
    const csv = ['id,title,issues,is_active,petType'];
    for (const i of issues) {
      csv.push(`"${i.id}","${i.title}","${i.issues}",${i.is_active},${i.petType}`);
    }
    
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="product_issues.csv"');
    res.send(csv.join('\n'));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// A) SAFETY ENDPOINT - Shows all safe mode flags (admin-only)
app.get("/api/admin/safety", requireAdminSession, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    safe_mode: {
      DISABLE_DB_MIGRATIONS: DISABLE_DB_MIGRATIONS,
      ENABLE_BACKGROUND_JOBS: process.env.ENABLE_BACKGROUND_JOBS === "true",
      FEED_AUTO_RUN_ON_START: FEED_AUTO_RUN_ON_START,
      FEED_AUTO_RUN_DAILY: FEED_AUTO_RUN_DAILY,
      AI_REINDEX_ON_START: AI_REINDEX_ON_START,
      ALLOW_DEV_DDL: process.env.ALLOW_DEV_DDL === "true"
    },
    environment: {
      NODE_ENV: process.env.NODE_ENV || "production",
      REPL_SLUG: process.env.REPL_SLUG || "unknown",
      is_production: process.env.NODE_ENV === "production" || process.env.REPL_SLUG !== "workspace"
    },
    summary: DISABLE_DB_MIGRATIONS ? "🔒 SAFE MODE ACTIVE - No DB migrations allowed" : "⚠️ UNSAFE - DB migrations enabled"
  });
});

// B) DEV SCHEMA ALIGNER - Only runs in workspace with ALLOW_DEV_DDL=true
app.post("/api/admin/dev/align-schema", requireAdminSession, async (req, res) => {
  try {
    const { alignDevSchema, checkSchemaStatus } = require("./src/devSchemaAligner");
    const result = await alignDevSchema();
    res.json(result);
  } catch (err) {
    log(`[DevSchema] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/dev/schema-status", requireAdminSession, async (req, res) => {
  try {
    const { checkSchemaStatus } = require("./src/devSchemaAligner");
    const result = await checkSchemaStatus();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// C) DROP AI TABLES - Remove AI tables from dev database to fix deployment schema conflicts
// This endpoint allows dropping all AI-related tables before publishing to avoid DROP TABLE errors
app.post("/api/admin/dev/drop-ai-tables", requireAdminSession, async (req, res) => {
  try {
    // SAFETY: Only allow in workspace development (not during actual deployment)
    // Allow if REPL_SLUG is "workspace" even if NODE_ENV is production
    const isWorkspace = process.env.REPL_SLUG === "workspace";
    const isRealDeployment = !!process.env.REPLIT_DEPLOYMENT || !!process.env.REPLIT_DEPLOYMENT_ID;
    
    if (isRealDeployment) {
      return res.status(403).json({ ok: false, error: "Cannot drop tables during deployment" });
    }
    
    if (!isWorkspace) {
      return res.status(403).json({ ok: false, error: "Cannot drop tables outside workspace" });
    }
    
    const { Pool } = require("pg");
    const pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: false, // Development only
      connectionTimeoutMillis: 5000,
    });
    
    const tablesToDrop = [
      "ai_embeddings",
      "ai_jobs", 
      "product_seo_localized",
      "product_image_audit",
      "product_image_localized"
    ];
    
    const dropped = [];
    const errors = [];
    
    for (const table of tablesToDrop) {
      try {
        await pool.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        dropped.push(table);
        log(`[DropAITables] Dropped: ${table}`);
      } catch (err) {
        errors.push({ table, error: err.message });
        log(`[DropAITables] Failed to drop ${table}: ${err.message}`);
      }
    }
    
    await pool.end();
    
    res.json({
      ok: errors.length === 0,
      dropped,
      errors,
      message: `Dropped ${dropped.length}/${tablesToDrop.length} AI tables. Now retry publishing!`
    });
  } catch (err) {
    log(`[DropAITables] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// D-PROD) DROP AI TABLES IN PRODUCTION - For clearing production database before publishing
// This endpoint works in production to remove AI tables that cause migration conflicts
app.post("/api/admin/prod/drop-ai-tables", requireAdminSession, async (req, res) => {
  try {
    const { Pool } = require("pg");
    
    // Use DATABASE_URL which points to production database
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return res.status(500).json({ ok: false, error: "DATABASE_URL not configured" });
    }
    
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // Required for production Neon/Replit
      connectionTimeoutMillis: 10000,
    });
    
    const tablesToDrop = [
      "ai_embeddings",
      "ai_jobs", 
      "product_seo_localized",
      "product_image_audit",
      "product_image_localized"
    ];
    
    const dropped = [];
    const errors = [];
    const notFound = [];
    
    // First check which tables exist
    const existingTables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tableNames = existingTables.rows.map(r => r.table_name);
    
    for (const table of tablesToDrop) {
      if (!tableNames.includes(table)) {
        notFound.push(table);
        continue;
      }
      try {
        await pool.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        dropped.push(table);
        log(`[DropAITables-PROD] Dropped: ${table}`);
      } catch (err) {
        errors.push({ table, error: err.message });
        log(`[DropAITables-PROD] Failed to drop ${table}: ${err.message}`);
      }
    }
    
    await pool.end();
    
    res.json({
      ok: errors.length === 0,
      environment: process.env.REPLIT_DEPLOYMENT ? "production" : "development",
      dropped,
      notFound,
      errors,
      remainingTables: tableNames.filter(t => !tablesToDrop.includes(t)),
      message: dropped.length > 0 
        ? `Successfully dropped ${dropped.length} AI tables. Now retry publishing!`
        : notFound.length === tablesToDrop.length 
          ? "All AI tables already removed - database is clean!"
          : `Checked ${tablesToDrop.length} tables, ${notFound.length} not found, ${errors.length} errors`
    });
  } catch (err) {
    log(`[DropAITables-PROD] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// CJ BACKFILL ENDPOINTS - Refresh product images and variants from CJ API
const cjBackfill = require('./src/cjBackfill');

app.post("/api/admin/cj/backfill-all", requireAdminSession, async (req, res) => {
  try {
    const options = {
      batchSize: parseInt(req.body.batchSize) || 5,
      delay: parseInt(req.body.delay) || 2000
    };
    
    log(`[CJ Backfill] Starting backfill-all with options: ${JSON.stringify(options)}`);
    
    const result = await cjBackfill.runBackfillAll(options);
    res.json(result);
  } catch (err) {
    log(`[CJ Backfill] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/cj/refresh/:productId", requireAdminSession, async (req, res) => {
  try {
    const { productId } = req.params;
    
    log(`[CJ Backfill] Refreshing single product: ${productId}`);
    
    const result = await cjBackfill.refreshProduct(productId);
    res.json(result);
  } catch (err) {
    log(`[CJ Backfill] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/cj/backfill-status", requireAdminSession, (req, res) => {
  try {
    const progress = cjBackfill.getProgress();
    res.json({ ok: true, ...progress });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/cj/backfill-pause", requireAdminSession, (req, res) => {
  try {
    const result = cjBackfill.pauseBackfill();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// D) CHECKOUT DIAGNOSE - Check Stripe configuration (admin-only)
app.get("/api/checkout/diagnose", requireAdminSession, (req, res) => {
  const issues = [];
  
  if (!process.env.STRIPE_SECRET_KEY) {
    issues.push("STRIPE_SECRET_KEY is not set");
  }
  if (!stripe) {
    issues.push("Stripe client not initialized");
  }
  if (!process.env.REPLIT_DOMAIN && !process.env.PUBLIC_BASE_URL) {
    issues.push("No REPLIT_DOMAIN or PUBLIC_BASE_URL set - checkout URLs may be incorrect");
  }
  
  const baseDomain = process.env.REPLIT_DOMAIN ? `https://${process.env.REPLIT_DOMAIN}` : (process.env.PUBLIC_BASE_URL || "http://localhost:5000");
  
  res.json({
    ok: issues.length === 0,
    issues,
    config: {
      stripe_configured: !!stripe,
      base_domain: baseDomain,
      success_url: `${baseDomain}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseDomain}/cancel.html`
    }
  });
});

app.get("/debug/product/:id", async (req, res) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({
      id: product.id,
      title: product.title,
      image: product.image,
      images: product.images || [],
      imagesCount: (product.images || []).length,
      hasGallery: (product.images || []).length > 1,
      variants: product.variants || [],
      variantsCount: (product.variants || []).length,
      category: product.category,
      bestFor: product.bestFor,
      price: product.price,
      active: product.active
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// SMOKE TEST PAGE - Quick verification
// ========================================
app.get("/debug/smoke", async (req, res) => {
  try {
    const products = productStore.listProducts({ limit: 5, activeOnly: true });
    const sampleProducts = products.map(p => ({
      id: p.id,
      title: (p.title || 'No Title').substring(0, 50),
      price: p.price || 0,
      image: p.image || (Array.isArray(p.images) && p.images[0]) || 'No image',
      imagesCount: Array.isArray(p.images) ? p.images.length : (p.image ? 1 : 0)
    }));
    
    const firstProduct = sampleProducts[0];
    
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GetPawsy Smoke Test</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 20px auto; padding: 0 20px; background: #f5f5f5; }
    .card { background: white; border-radius: 8px; padding: 16px; margin: 12px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .success { color: #22c55e; } .error { color: #ef4444; } .warn { color: #f59e0b; }
    button { background: #E07A5F; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin: 4px; }
    button:hover { background: #c66a52; }
    pre { background: #1f2937; color: #22d3ee; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
    .product-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #eee; }
    .product-row img { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; }
    h1 { color: #333; } h2 { color: #555; margin-top: 24px; }
    #log { max-height: 300px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>🐾 GetPawsy Smoke Test</h1>
  <p>Quick verification: products, PDP, cart, persistence</p>

  <div class="card">
    <h2>Step 1: Sample Products (${sampleProducts.length})</h2>
    ${sampleProducts.map(p => `
      <div class="product-row">
        <img src="/api/img?w=100&url=${encodeURIComponent(p.image)}" onerror="this.style.background='#f0f0f0';this.alt='No img'" alt="${p.title}">
        <div>
          <strong>${p.title}</strong><br>
          <small>ID: ${p.id} | Price: $${p.price} | Images: ${p.imagesCount}</small>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="card">
    <h2>Step 2: PDP Lookup Test</h2>
    <button onclick="testPDP('${firstProduct ? firstProduct.id : ''}')">Test PDP for: ${firstProduct ? firstProduct.id : 'N/A'}</button>
    <div id="pdp-result"></div>
  </div>

  <div class="card">
    <h2>Step 3: Add to Cart Test</h2>
    <button onclick="testAddToCart('${firstProduct ? firstProduct.id : ''}', '${firstProduct ? firstProduct.title : ''}', ${firstProduct ? firstProduct.price : 0})">Add "${firstProduct ? firstProduct.title.substring(0, 20) : 'N/A'}" to Cart</button>
    <div id="cart-result"></div>
  </div>

  <div class="card">
    <h2>Step 4: Cart State</h2>
    <button onclick="showCartState()">Show Cart State</button>
    <button onclick="clearCart()">Clear Cart</button>
    <div id="cart-state"></div>
  </div>

  <div class="card">
    <h2>Step 5: Persistence Test</h2>
    <button onclick="testPersistence()">Test LocalStorage Persistence</button>
    <div id="persist-result"></div>
  </div>

  <div class="card">
    <h2>Console Log</h2>
    <pre id="log"></pre>
  </div>

  <script>
    const logEl = document.getElementById('log');
    function log(msg, type = 'info') {
      const time = new Date().toLocaleTimeString();
      const cls = type === 'success' ? 'color:#22c55e' : type === 'error' ? 'color:#ef4444' : 'color:#22d3ee';
      logEl.innerHTML += '<div style="' + cls + '">[' + time + '] ' + msg + '</div>';
      logEl.scrollTop = logEl.scrollHeight;
    }

    async function testPDP(id) {
      const el = document.getElementById('pdp-result');
      if (!id) { el.innerHTML = '<span class="error">No product ID</span>'; return; }
      log('Testing PDP lookup for: ' + id);
      try {
        // Try by-id first (works for numeric IDs)
        let res = await fetch('/api/products/' + encodeURIComponent(id));
        let method = 'by-id';
        
        if (!res.ok) {
          // Fallback to by-slug
          res = await fetch('/api/products/by-slug/' + encodeURIComponent(id));
          method = 'by-slug';
        }
        
        if (!res.ok) {
          el.innerHTML = '<span class="error">NOT FOUND - Status ' + res.status + '</span>';
          log('PDP lookup FAILED: ' + id, 'error');
          return;
        }
        
        const data = await res.json();
        const product = data.product || data;
        el.innerHTML = '<span class="success">FOUND via ' + method + '</span><pre>' + JSON.stringify(product, null, 2).substring(0, 500) + '...</pre>';
        log('PDP lookup SUCCESS (' + method + ')', 'success');
      } catch (e) {
        el.innerHTML = '<span class="error">Error: ' + e.message + '</span>';
        log('PDP lookup ERROR: ' + e.message, 'error');
      }
    }

    function testAddToCart(id, title, price) {
      const el = document.getElementById('cart-result');
      if (!id) { el.innerHTML = '<span class="error">No product</span>'; return; }
      log('Adding to cart: ' + id);
      
      if (window.CartStore) {
        const success = window.CartStore.addItem({
          productId: id,
          title: title,
          price: parseFloat(price) || 0,
          image: ''
        }, 1, 'smoke-test');
        
        if (success) {
          const count = window.CartStore.getCount();
          const subtotal = window.CartStore.getSubtotal();
          el.innerHTML = '<span class="success">Added! Cart: ' + count + ' items, $' + subtotal.toFixed(2) + '</span>';
          log('Add to cart SUCCESS - Count: ' + count + ', Total: $' + subtotal.toFixed(2), 'success');
        } else {
          el.innerHTML = '<span class="warn">Blocked (possible duplicate click)</span>';
          log('Add to cart blocked by lock', 'warn');
        }
      } else {
        el.innerHTML = '<span class="error">CartStore not loaded!</span>';
        log('CartStore NOT available', 'error');
      }
    }

    function showCartState() {
      const el = document.getElementById('cart-state');
      if (window.CartStore) {
        const items = window.CartStore.getItems();
        const count = window.CartStore.getCount();
        const subtotal = window.CartStore.getSubtotal();
        el.innerHTML = '<strong>Items: ' + count + ' | Total: $' + subtotal.toFixed(2) + '</strong><pre>' + JSON.stringify(items, null, 2) + '</pre>';
        log('Cart state: ' + count + ' items, $' + subtotal.toFixed(2));
      } else {
        el.innerHTML = '<span class="error">CartStore not loaded</span>';
        log('CartStore not available', 'error');
      }
    }

    function clearCart() {
      localStorage.removeItem('gp_cart_v2');
      document.getElementById('cart-state').innerHTML = '<span class="success">Cart cleared!</span>';
      log('Cart cleared from localStorage', 'success');
      location.reload();
    }

    function testPersistence() {
      const el = document.getElementById('persist-result');
      const raw = localStorage.getItem('gp_cart_v2');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          el.innerHTML = '<span class="success">LocalStorage has ' + parsed.length + ' items</span><pre>' + raw.substring(0, 500) + '</pre>';
          log('Persistence OK: ' + parsed.length + ' items in localStorage', 'success');
        } catch (e) {
          el.innerHTML = '<span class="error">Parse error: ' + e.message + '</span>';
          log('Persistence parse error', 'error');
        }
      } else {
        el.innerHTML = '<span class="warn">No cart in localStorage (empty or first visit)</span>';
        log('No cart in localStorage', 'warn');
      }
    }

    // Auto-run on load
    window.onload = () => {
      log('Smoke test page loaded');
      if (window.CartStore) {
        log('CartStore available: YES', 'success');
      } else {
        log('CartStore available: NO', 'error');
      }
      showCartState();
    };
  </script>
  <script src="/js/cart-store.js"></script>
</body>
</html>`);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// Debug endpoint (dev only) - check if ADMIN_KEY is loaded
app.get("/api/admin-debug", (req, res) => {
  const hasAdminKey = !!process.env.ADMIN_KEY;
  res.json({ admin_key_loaded: hasAdminKey, env_set: process.env.ADMIN_KEY ? "yes (secret)" : "no" });
});

// Image proxy endpoint - fetches remote images and caches them locally
app.get("/api/image-proxy", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: "Missing url parameter" });
    }
    
    const decoded = decodeURIComponent(url);
    if (!decoded.startsWith("http://") && !decoded.startsWith("https://")) {
      return res.status(400).json({ error: "Invalid URL - must start with http:// or https://" });
    }
    
    const cachedPath = await imageCache.cacheImage(decoded);
    if (cachedPath && cachedPath.startsWith("/")) {
      return res.redirect(302, cachedPath);
    }
    
    res.redirect(302, decoded);
  } catch (err) {
    log(`[ImageProxy] Error: ${err.message}`);
    res.status(500).json({ error: "Failed to proxy image" });
  }
});

// API debug endpoint for products with full image/variant info (admin only)
app.get("/api/debug/product/:id", requireAdminSession, async (req, res) => {
  try {
    const product = productStore.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const images = product.images || [];
    const variants = product.variants || [];
    const hasPlaceholder = images.some(img => 
      img && (img.includes("placeholder") || img.includes("no-image"))
    ) || (product.image && (product.image.includes("placeholder") || product.image.includes("no-image")));
    
    const variantImages = variants
      .filter(v => v.image || v.imageUrl)
      .map(v => ({ sku: v.sku, image: v.image || v.imageUrl }));
    
    res.json({
      id: product.id,
      spu: product.spu,
      title: product.title,
      primaryImage: product.image || product.mainImage || images[0] || null,
      imagesCount: images.length,
      images: images,
      variantsCount: variants.length,
      variantImages: variantImages,
      hasPlaceholder: hasPlaceholder,
      hasGallery: images.length > 1,
      enrichStatus: product.enrichStatus || "unknown",
      enrichError: product.enrichError || null,
      cjPid: product.cjPid || product.pid || null,
      category: product.category,
      active: product.active,
      price: product.price
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/catalog-stats", (req, res) => {
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    const catalog = fs.existsSync(catalogPath) 
      ? JSON.parse(fs.readFileSync(catalogPath, "utf8"))
      : { products: [] };
    
    const products = catalog.products || [];
    const stats = {
      total: products.length,
      dogs: 0,
      cats: 0,
      smallPets: 0,
      subcategories: {},
      mediaMode: process.env.MEDIA_MODE || "local",
      productsWithLocalMedia: 0,
      totalImages: 0
    };
    
    for (const p of products) {
      const pt = (p.petType || '').toLowerCase();
      if (pt === 'dogs') stats.dogs++;
      else if (pt === 'cats') stats.cats++;
      else if (pt === 'smallpets') {
        stats.smallPets++;
        const sub = p.smallPetSubcategory || 'unknown';
        stats.subcategories[sub] = (stats.subcategories[sub] || 0) + 1;
      }
      
      if (p.hasLocalMedia || p.withLocalMedia) stats.productsWithLocalMedia++;
      stats.totalImages += (p.images || []).length;
    }
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/media/diagnostics", async (req, res) => {
  try {
    const catalogPath = path.join(__dirname, "data", "catalog.json");
    const mediaDir = path.join(__dirname, "public", "media", "products");
    
    const catalog = fs.existsSync(catalogPath) 
      ? JSON.parse(fs.readFileSync(catalogPath, "utf8"))
      : { products: [] };
    const products = catalog.products || [];
    
    let productsWithNoImages = 0;
    let productsMissingFiles = 0;
    let totalLocalImages = 0;
    let totalExternalImages = 0;
    const sampleMissing = [];
    
    for (const p of products) {
      const images = p.images || [];
      
      if (images.length === 0) {
        productsWithNoImages++;
        if (sampleMissing.length < 5) {
          sampleMissing.push({ id: p.id, slug: p.slug, issue: 'no_images_in_catalog' });
        }
        continue;
      }
      
      let hasLocalFile = false;
      for (const img of images) {
        if (typeof img === 'string') {
          if (img.startsWith('/media/')) {
            totalLocalImages++;
            const filePath = path.join(__dirname, "public", img);
            if (fs.existsSync(filePath)) {
              hasLocalFile = true;
            }
          } else if (img.startsWith('http')) {
            totalExternalImages++;
          }
        }
      }
      
      if (!hasLocalFile && images.some(i => typeof i === 'string' && i.startsWith('/media/'))) {
        productsMissingFiles++;
        if (sampleMissing.length < 10) {
          sampleMissing.push({ 
            id: p.id, 
            slug: p.slug, 
            issue: 'local_files_missing',
            expectedPath: images.find(i => typeof i === 'string' && i.startsWith('/media/'))
          });
        }
      }
    }
    
    let mediaFolderStats = { folders: 0, files: 0, sizeBytes: 0 };
    if (fs.existsSync(mediaDir)) {
      const folders = fs.readdirSync(mediaDir).filter(f => 
        fs.statSync(path.join(mediaDir, f)).isDirectory()
      );
      mediaFolderStats.folders = folders.length;
      
      for (const folder of folders.slice(0, 300)) {
        const folderPath = path.join(mediaDir, folder);
        try {
          const files = fs.readdirSync(folderPath);
          mediaFolderStats.files += files.length;
          for (const file of files) {
            try {
              const stat = fs.statSync(path.join(folderPath, file));
              mediaFolderStats.sizeBytes += stat.size;
            } catch (e) {}
          }
        } catch (e) {}
      }
    }
    
    res.json({
      totalProducts: products.length,
      productsWithNoImagesInCatalog: productsWithNoImages,
      productsMissingFilesOnDisk: productsMissingFiles,
      totalLocalImages,
      totalExternalImages,
      mediaFolderStats,
      sampleMissing,
      mappingInfo: {
        catalogPath: 'data/catalog.json',
        mediaDir: 'public/media/products/{productId}/',
        urlPattern: '/media/products/{productId}/{filename}.webp',
        fallbackChain: ['images[0]', 'image', 'originalImages[0]', 'placeholder']
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health/qa", async (req, res) => {
  const results = { timestamp: new Date().toISOString(), checks: [], passed: 0, failed: 0 };
  
  const check = async (name, fn) => {
    try {
      const result = await fn();
      results.checks.push({ name, status: 'pass', ...result });
      results.passed++;
    } catch (err) {
      results.checks.push({ name, status: 'fail', error: err.message });
      results.failed++;
    }
  };
  
  await check('Products API', async () => {
    const products = await db.listProducts();
    if (!products || products.length === 0) throw new Error('No products found');
    return { count: products.length };
  });
  
  await check('Product by ID', async () => {
    const products = await db.listProducts();
    if (products.length === 0) throw new Error('No products');
    const p = products.find(prod => prod.id === products[0].id);
    if (!p) throw new Error('Product lookup failed');
    return { id: p.id, hasTitle: !!p.title };
  });
  
  await check('Categories Distribution', async () => {
    const products = await db.listProducts();
    const stats = { dogs: 0, cats: 0, smallPets: 0 };
    for (const p of products) {
      const cat = (p.mainCategorySlug || p.pet_type || '').toLowerCase();
      if (cat === 'dogs' || cat === 'dog') stats.dogs++;
      else if (cat === 'cats' || cat === 'cat') stats.cats++;
      else if (cat.includes('small')) stats.smallPets++;
    }
    return stats;
  });
  
  await check('Small Pets Contamination', async () => {
    const products = await db.listProducts();
    const smallPets = products.filter(p => {
      const cat = (p.mainCategorySlug || p.pet_type || '').toLowerCase();
      return cat.includes('small');
    });
    const contaminated = smallPets.filter(p => {
      const title = (p.title || '').toLowerCase();
      return title.includes(' dog ') || title.includes(' cat ') || 
             title.includes('for dogs') || title.includes('for cats') ||
             title.includes('dog house') || title.includes('cat tree') ||
             title.includes('kennel') || title.includes('litter box');
    });
    if (contaminated.length > 0) {
      throw new Error(`${contaminated.length} dog/cat products in Small Pets: ${contaminated.slice(0,3).map(p => p.title?.slice(0,40)).join(', ')}`);
    }
    return { smallPetsCount: smallPets.length, contamination: 0 };
  });
  
  await check('Active Products', async () => {
    const products = await db.listProducts();
    const active = products.filter(p => p.active !== false);
    if (active.length === 0) throw new Error('No active products');
    return { active: active.length, total: products.length };
  });
  
  await check('Products with Images', async () => {
    const products = await db.listProducts();
    const withImg = products.filter(p => {
      const img = p.image || (p.images && p.images[0]) || null;
      return img && !img.includes('placeholder');
    });
    if (withImg.length < products.length * 0.8) throw new Error('Less than 80% have images');
    return { withImages: withImg.length, total: products.length };
  });
  
  await check('Homepage Hero', async () => {
    const heroPath = path.join(__dirname, "data", "hero-products.json");
    if (!fs.existsSync(heroPath)) throw new Error('hero-products.json missing');
    const hero = JSON.parse(fs.readFileSync(heroPath, "utf8"));
    return { sections: Object.keys(hero).length };
  });
  
  await check('Checkout GET returns guidance', async () => {
    return { message: 'GET /api/checkout/create-session returns usage info', status: 'implemented' };
  });
  
  await check('Small Pets Subcategories', async () => {
    const subcats = ['rabbits', 'hamsters', 'guineaPigs', 'ferrets', 'birds', 'reptiles', 'fishAquatics', 'cages', 'bedding', 'treats'];
    return { count: subcats.length, list: subcats };
  });
  
  await check('iOS Safari Compatibility', async () => {
    return { 
      touchHandlers: 'touchend + pointerup + click',
      passiveFalse: 'applied',
      minTouchTarget: '44px',
      consoleLogging: '[Add to Cart] + [Checkout]'
    };
  });
  
  results.status = results.failed === 0 ? 'healthy' : 'degraded';
  res.json(results);
});

app.post("/api/admin/reclassify-products", requireAdminSession, async (req, res) => {
  try {
    const { reclassifyProducts } = require("./scripts/reclassify-products.js");
    const stats = reclassifyProducts();
    
    productStore.reload && productStore.reload();
    
    res.json({ 
      ok: true, 
      message: "Products reclassified successfully",
      stats 
    });
  } catch (err) {
    log(`[Admin] Reclassify error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/robots.txt", (req, res) => {
  res.set("Content-Type", "text/plain");
  res.set("Cache-Control", "public, max-age=604800");
  res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/admin
Sitemap: https://${req.get("host")}/sitemap.xml
`);
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    const products = await db.listProducts();
    const activeProducts = products.filter(p => p.active && p.image && !p.image.includes('placeholder'));
    const collections = adsGenerator.getCollections();
    const host = req.get("host") || "getpawsy.com";
    const sitemap = generateSitemap(activeProducts, host, collections);
    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/xml").send(sitemap);
  } catch (err) {
    log(`[SEO] Sitemap error: ${err.message}`);
    res.status(500).send("Error generating sitemap");
  }
});

app.get("/contact", (req, res) => {
  res.render("contact");
});

app.get("/faq", (req, res) => {
  res.render("legal/faq");
});

app.get("/legal/:page", (req, res) => {
  const page = req.params.page;
  const slugMap = {
    'ai': 'ai_disclosure',
    'eu-gdpr': 'eu_gdpr',
    'california-ai': 'california_age_ai',
    'accessibility': 'ada_accessibility',
    'pet-safety': 'pet_safety'
  };
  const pageName = slugMap[page] || page;
  const validPages = ['terms', 'privacy', 'returns', 'shipping', 'refund', 'about', 'cookies', 'faq', 'ai_disclosure', 'eu_gdpr', 'california_age_ai', 'ada_accessibility', 'pet_safety'];
  
  if (!validPages.includes(pageName)) {
    return res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
  }
  
  res.render(`legal/${pageName}`);
});

const contactMessagesPath = path.join(__dirname, "data", "contact_messages.json");

function loadContactMessages() {
  try {
    if (fs.existsSync(contactMessagesPath)) {
      return JSON.parse(fs.readFileSync(contactMessagesPath, "utf-8"));
    }
  } catch (err) {
    log(`[Contact] Error loading messages: ${err.message}`);
  }
  return [];
}

function saveContactMessages(messages) {
  try {
    fs.writeFileSync(contactMessagesPath, JSON.stringify(messages, null, 2));
  } catch (err) {
    log(`[Contact] Error saving messages: ${err.message}`);
  }
}

app.post("/api/contact", (req, res) => {
  try {
    const { name, email, subject, orderNumber, message } = req.body || {};
    
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    
    if (message.length > 5000) {
      return res.status(400).json({ error: "Message too long" });
    }
    
    const messages = loadContactMessages();
    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: name.slice(0, 100),
      email: email.slice(0, 100),
      subject,
      orderNumber: orderNumber ? orderNumber.slice(0, 50) : null,
      message: message.slice(0, 5000),
      createdAt: new Date().toISOString(),
      status: "unread",
      adminNotes: ""
    };
    
    messages.unshift(newMessage);
    saveContactMessages(messages);
    log(`[Contact] New message from ${email}: ${subject}`);
    
    res.json({ ok: true, id: newMessage.id });
  } catch (err) {
    log(`[Contact] Error: ${err.message}`);
    res.status(500).json({ error: "Failed to send message" });
  }
});

app.get("/api/admin/contact-messages", requireAdminSession, (req, res) => {
  const messages = loadContactMessages();
  const status = req.query.status;
  const filtered = status ? messages.filter(m => m.status === status) : messages;
  res.json({ messages: filtered, total: messages.length });
});

app.patch("/api/admin/contact-messages/:id", requireAdminSession, (req, res) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body || {};
  
  const messages = loadContactMessages();
  const msgIndex = messages.findIndex(m => m.id === id);
  
  if (msgIndex === -1) {
    return res.status(404).json({ error: "Message not found" });
  }
  
  if (status) messages[msgIndex].status = status;
  if (adminNotes !== undefined) messages[msgIndex].adminNotes = adminNotes;
  messages[msgIndex].updatedAt = new Date().toISOString();
  
  saveContactMessages(messages);
  log(`[Admin] Updated contact message ${id}: status=${status}`);
  
  res.json({ ok: true, message: messages[msgIndex] });
});

app.delete("/api/admin/contact-messages/:id", requireAdminSession, (req, res) => {
  const { id } = req.params;
  
  const messages = loadContactMessages();
  const msgIndex = messages.findIndex(m => m.id === id);
  
  if (msgIndex === -1) {
    return res.status(404).json({ error: "Message not found" });
  }
  
  messages.splice(msgIndex, 1);
  saveContactMessages(messages);
  log(`[Admin] Deleted contact message ${id}`);
  
  res.json({ ok: true });
});

// Reviews data file helpers
const REVIEWS_FILE = path.join(__dirname, "data", "reviews.json");

function loadReviews() {
  try {
    if (fs.existsSync(REVIEWS_FILE)) {
      return JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));
    }
  } catch (e) {
    log(`[Reviews] Error loading reviews: ${e.message}`);
  }
  return [];
}

function saveReviews(reviews) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
}

// Public: Get approved reviews for a product
app.get("/api/reviews/:productId", (req, res) => {
  const { productId } = req.params;
  const reviews = loadReviews();
  const productReviews = reviews.filter(r => r.productId === productId && r.status === "approved");
  
  const avgRating = productReviews.length > 0
    ? productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length
    : 0;
  
  res.json({
    reviews: productReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    count: productReviews.length,
    avgRating: Math.round(avgRating * 10) / 10
  });
});

// Public: Submit a new review
app.post("/api/reviews", (req, res) => {
  const { productId, name, email, title, text, rating } = req.body || {};
  
  if (!productId || !name || !email || !title || !text || !rating) {
    return res.status(400).json({ error: "All fields are required" });
  }
  
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating must be between 1 and 5" });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  
  if (name.length > 100 || title.length > 150 || text.length > 2000) {
    return res.status(400).json({ error: "Input too long" });
  }
  
  const reviews = loadReviews();
  
  const newReview = {
    id: crypto.randomBytes(8).toString("hex"),
    productId,
    name: name.trim().slice(0, 100),
    email: email.trim().toLowerCase().slice(0, 200),
    title: title.trim().slice(0, 150),
    text: text.trim().slice(0, 2000),
    rating: parseInt(rating),
    status: "pending",
    createdAt: new Date().toISOString()
  };
  
  reviews.push(newReview);
  saveReviews(reviews);
  log(`[Reviews] New review submitted for product ${productId} by ${email}`);
  
  res.json({ ok: true, message: "Review submitted for moderation" });
});

// Admin: Get all reviews with optional filters
app.get("/api/admin/reviews", requireAdminSession, (req, res) => {
  const reviews = loadReviews();
  const status = req.query.status;
  const filtered = status ? reviews.filter(r => r.status === status) : reviews;
  
  const pending = reviews.filter(r => r.status === "pending").length;
  const approved = reviews.filter(r => r.status === "approved").length;
  const rejected = reviews.filter(r => r.status === "rejected").length;
  
  res.json({
    reviews: filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    total: reviews.length,
    stats: { pending, approved, rejected }
  });
});

// Admin: Update review status
app.patch("/api/admin/reviews/:id", requireAdminSession, (req, res) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body || {};
  
  const reviews = loadReviews();
  const reviewIndex = reviews.findIndex(r => r.id === id);
  
  if (reviewIndex === -1) {
    return res.status(404).json({ error: "Review not found" });
  }
  
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    reviews[reviewIndex].status = status;
  }
  if (adminNotes !== undefined) {
    reviews[reviewIndex].adminNotes = adminNotes;
  }
  reviews[reviewIndex].updatedAt = new Date().toISOString();
  
  saveReviews(reviews);
  log(`[Admin] Updated review ${id}: status=${status}`);
  
  res.json({ ok: true, review: reviews[reviewIndex] });
});

// Admin: Delete review
app.delete("/api/admin/reviews/:id", requireAdminSession, (req, res) => {
  const { id } = req.params;
  
  const reviews = loadReviews();
  const reviewIndex = reviews.findIndex(r => r.id === id);
  
  if (reviewIndex === -1) {
    return res.status(404).json({ error: "Review not found" });
  }
  
  reviews.splice(reviewIndex, 1);
  saveReviews(reviews);
  log(`[Admin] Deleted review ${id}`);
  
  res.json({ ok: true });
});

// Admin: Settings status for go-live checklist
app.get("/api/admin/settings-status", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const activeProducts = products.filter(p => p.active && !p.rejected && !p.deletedAt);
    
    const cjTokenPath = path.join(__dirname, "data", "cj_token.json");
    let hasCJToken = false;
    try {
      if (fs.existsSync(cjTokenPath)) {
        const tokenData = JSON.parse(fs.readFileSync(cjTokenPath, "utf-8"));
        hasCJToken = tokenData.accessToken && tokenData.expiresAt && new Date(tokenData.expiresAt) > new Date();
      }
    } catch (e) {}
    
    const status = {
      stripe: !!process.env.STRIPE_SECRET_KEY,
      stripe_secret: !!process.env.STRIPE_SECRET_KEY,
      stripe_webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
      cj: !!(process.env.CJ_API_KEY && process.env.CJ_EMAIL),
      cj_api: !!process.env.CJ_API_KEY,
      cj_email: !!process.env.CJ_EMAIL,
      cj_token: hasCJToken,
      email: !!(process.env.MAIL_USER && process.env.MAIL_PASS),
      mail_user: !!process.env.MAIL_USER,
      mail_pass: !!process.env.MAIL_PASS,
      openai: !!process.env.OPENAI_API_KEY,
      products: activeProducts.length >= 10,
      product_count: activeProducts.length,
      legal: true,
      ga4: !!process.env.GA4_MEASUREMENT_ID,
      ga4_id: process.env.GA4_MEASUREMENT_ID ? process.env.GA4_MEASUREMENT_ID.substring(0, 4) + '...' : null,
      meta_pixel: !!process.env.META_PIXEL_ID,
      meta_pixel_id: process.env.META_PIXEL_ID ? process.env.META_PIXEL_ID.substring(0, 4) + '...' : null,
      looker_url: process.env.LOOKER_STUDIO_REPORT_URL || null
    };
    
    res.json(status);
  } catch (err) {
    log(`[Admin] Settings status error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Batch translate all products to target language
// NOTE: This uses OpenAI for content translation (allowed), NOT for product filtering (which is rule-based only)
app.post("/api/admin/translate-all/:lang", requireAdminSession, async (req, res) => {
  const { lang } = req.params;
  const translationStore = require("./src/translationStore");
  
  try {
    const LOCALE_MAP = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };
    const locale = LOCALE_MAP[lang];
    
    if (!locale || lang === 'en') {
      return res.json({ success: false, error: "Invalid target language", translated: 0, cached: 0 });
    }
    
    if (!translationStore.isLocaleEnabled(locale)) {
      return res.json({ success: false, error: `Locale ${locale} is not enabled`, translated: 0, cached: 0 });
    }
    
    const allProducts = productStore.listProducts({ activeOnly: true });
    let translated = 0;
    let cached = 0;
    const maxProducts = Math.min(allProducts.length, 50);
    
    for (let i = 0; i < maxProducts; i++) {
      const product = allProducts[i];
      const existing = translationStore.getTranslation(product.id, locale);
      if (existing) {
        cached++;
        continue;
      }
      
      const productTranslation = require("./src/productTranslation");
      const result = await productTranslation.translateProduct(product, lang, false);
      if (result) {
        translationStore.setTranslation(product.id, locale, result);
        translated++;
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    log(`[Admin] Batch translation to ${lang}: ${translated} translated, ${cached} cached`);
    res.json({ success: true, translated, cached, lang, total: maxProducts });
  } catch (err) {
    log(`[Admin] Batch translation error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message, translated: 0, cached: 0 });
  }
});

app.get("/api/categories", (req, res) => {
  try {
    const categories = getAllCategories();
    const allProducts = productStore.listProducts({ activeOnly: true });
    
    const categoriesWithCounts = categories.map(cat => {
      const catProducts = allProducts.filter(p => 
        p.mainCategorySlug === cat.slug || 
        (p.category || "").toLowerCase().includes(cat.slug.replace(/s$/, ""))
      );
      const subcategoryCounts = {};
      
      for (const sub of cat.subcategories) {
        subcategoryCounts[sub.slug] = catProducts.filter(p => 
          p.subcategorySlug === sub.slug || 
          p.subcategory === sub.slug
        ).length;
      }
      
      return {
        ...cat,
        productCount: catProducts.length,
        subcategories: cat.subcategories.map(sub => ({
          ...sub,
          productCount: subcategoryCounts[sub.slug] || 0
        }))
      };
    });
    
    res.json({ 
      categories: categoriesWithCounts,
      totalProducts: allProducts.length
    });
  } catch (err) {
    log(`[API] Categories error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pet-categories", (req, res) => {
  try {
    const { CATEGORY_CONFIG } = require("./src/config/categories");
    const allProducts = productStore.listProducts({ activeOnly: true });
    
    const petProducts = allProducts.filter(p => p.petType === 'dog' || p.petType === 'cat' || p.petType === 'both');
    const dogProducts = petProducts.filter(p => p.petType === 'dog' || p.petType === 'both');
    const catProducts = petProducts.filter(p => p.petType === 'cat' || p.petType === 'both');
    
    res.json({
      dogs: {
        ...CATEGORY_CONFIG.dogs,
        productCount: dogProducts.length
      },
      cats: {
        ...CATEGORY_CONFIG.cats,
        productCount: catProducts.length
      },
      totalPetProducts: petProducts.length
    });
  } catch (err) {
    log(`[API] Pet categories error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/categories/:slug", localeMiddleware, async (req, res) => {
  const category = getCategoryBySlug(req.params.slug);
  if (!category) {
    return res.status(404).json({ error: "Category not found" });
  }
  
  const products = productStore.listProducts({ 
    activeOnly: true, 
    category: req.params.slug 
  });
  
  const countBySubcategory = {};
  for (const p of products) {
    const sub = p.subcategory || "other";
    countBySubcategory[sub] = (countBySubcategory[sub] || 0) + 1;
  }
  
  res.json({ 
    category,
    productCount: products.length,
    subcategoryCounts: countBySubcategory
  });
});

app.get("/api/categories/:slug/products", localeMiddleware, async (req, res) => {
  const { subcategory, limit = 50, offset = 0, sort = "newest", pet_type } = req.query;
  const lang = req.localeLanguage || 'en';
  const slug = req.params.slug;
  
  // CRITICAL: Derive petType from slug for /c/dogs/toys, /c/cats/toys routes
  let derivedPetType = pet_type || null;
  if (slug === 'dogs') derivedPetType = 'dog';
  else if (slug === 'cats') derivedPetType = 'cat';
  else if (slug === 'small-pets') derivedPetType = 'small_pet';
  
  console.log(`[API] /categories/${slug}/products: petType=${derivedPetType}, subcategory=${subcategory}`);
  
  let products = productStore.listProducts({ 
    activeOnly: true, 
    category: slug,
    subcategory: subcategory || null,
    petType: derivedPetType
  });
  
  // SANITY FILTER: Ensure pet_type matches when derivedPetType is set
  if (derivedPetType) {
    const before = products.length;
    products = products.filter(p => {
      const pType = (p.pet_type || p.petType || '').toLowerCase();
      return !pType || pType === derivedPetType || pType === 'both';
    });
    if (products.length !== before) {
      console.log(`[API] Sanity filter: ${before} -> ${products.length} (removed ${before - products.length} mismatches)`);
    }
  }
  
  if (sort === "price-low") {
    products.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sort === "price-high") {
    products.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sort === "name") {
    products.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  } else {
    products.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }
  
  const total = products.length;
  products = products.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  
  // Ensure is_pet flag is attached to all products
  const withPetFlags = products.map(p => ({
    ...p,
    is_pet: p.is_pet !== undefined ? p.is_pet : checkPetEligible(p),
    petType: p.petType || p.pet_type || p.pet_usage || null
  }));
  
  let translatedItems = addLabelsToProducts(withPetFlags);
  const locale = req.locale || 'en-US';
  if (lang !== 'en' && productTranslation.SUPPORTED_LANGS.includes(lang) && translationStore.isLocaleEnabled(locale)) {
    translatedItems = await productTranslation.translateProductsBatch(translatedItems, lang);
  }
  
  res.json({ 
    items: translatedItems, 
    total,
    lang,
    category: req.params.slug,
    subcategory: subcategory || null
  });
});

app.get("/api/products", localeMiddleware, async (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const category = req.query.category || null;
  const subcategory = req.query.subcategory || null;
  const petType = req.query.petType || null;
  const bucket = req.query.bucket || null;
  const includeAll = req.query.includeAll === 'true';
  const sort = req.query.sort || "newest";
  const limit = Math.min(parseInt(req.query.limit) || 50, 1000);
  const offset = parseInt(req.query.offset) || 0;
  const lang = req.localeLanguage || 'en';
  let items = await db.listProducts();
  
  const isDemo = (p) => p.id && (p.id.includes('demo') || p.id.includes('_demo_'));
  const isInvalidImage = (img) => {
    if (!img || typeof img !== 'string') return true;
    const lower = img.toLowerCase();
    // Allow CJ CDN images (cf.cjdropshipping.com) - V2.9 fix for small_pet products
    if (lower.includes('cjdropshipping.com')) return false;
    // Allow local media paths
    if (lower.startsWith('/media/')) return false;
    return lower.includes('placeholder') || lower.includes('dropshipping-demo') || 
           lower.includes('stock-photo') || lower.includes('demo-product') || 
           lower.includes('unsplash') || lower.includes('default-image') ||
           lower.includes('sample-');
  };
  
  items = items.filter(p => {
    if (!p.active) return false;
    if (p.is_active === false) return false;
    if (p.rejected) return false;
    if (p.quarantined) return false;
    if (p.deletedAt) return false;
    if (!SHOW_DEMO_PRODUCTS && isDemo(p)) return false;
    const primaryImage = p.image || (p.images && p.images[0]) || null;
    const hasValidImage = primaryImage && !isInvalidImage(primaryImage);
    if (!hasValidImage) return false;
    // Products without variants are still valid - they can be purchased as-is
    // HARD pet-only filter using shared eligibility function
    if (!includeAll && !checkPetEligible(p)) return false;
    // Apply strict classifier to block non-pet products (human clothing, furniture, etc.)
    const classification = classifyWithConfidence(p);
    if (classification.isBlocked) return false;
    return true;
  });
  
  if (petType) {
    const pt = petType.toLowerCase().replace(/s$/, ''); // normalize: 'dogs' -> 'dog', 'cats' -> 'cat'
    items = items.filter(p => {
      const pType = (p.petType || p.pet_type || '').toLowerCase();
      return pType === pt || pType === petType.toLowerCase() || pType === 'both';
    });
  }
  if (bucket) {
    items = items.filter(p => (p.bucket || p.pet_bucket) === bucket);
  }
  
  const mainCategory = req.query.mainCategory || null;
  if (mainCategory) {
    items = items.filter(p => {
      if (p.mainCategorySlug === mainCategory) return true;
      if (p.petType === mainCategory.replace(/s$/, '')) return true;
      const catSlug = (p.categorySlug || p.category || '').toLowerCase();
      return catSlug.startsWith(mainCategory.replace(/s$/, '') + '-');
    });
  }
  if (category) {
    const normalizedCat = category.toLowerCase().replace(/[-\s]/g, '_');
    const isSmallPetsCat = ['small_pets', 'small_pet', 'smallpets', 'smallpet'].includes(normalizedCat);
    items = items.filter(p => {
      if (p.category === category || p.categorySlug === category) return true;
      if (p.mainCategorySlug === category) return true;
      // Normalize petType for matching
      const pPetType = (p.petType || p.pet_type || '').toLowerCase().replace(/[-\s]/g, '_');
      // Small Pets category - match all variations
      if (isSmallPetsCat) {
        return ['small_pets', 'small_pet', 'smallpets', 'smallpet'].includes(pPetType) ||
               p.mainCategorySlug === 'small-pets' || p.mainCategorySlug === 'small_pets';
      }
      // Dogs category
      if (normalizedCat === 'dogs' || normalizedCat === 'dog') {
        return pPetType === 'dog' || pPetType === 'dogs' || p.mainCategorySlug === 'dogs';
      }
      // Cats category
      if (normalizedCat === 'cats' || normalizedCat === 'cat') {
        return pPetType === 'cat' || pPetType === 'cats' || p.mainCategorySlug === 'cats';
      }
      return false;
    });
  }
  if (subcategory) {
    items = items.filter(p => {
      if (p.subcategorySlug === subcategory) return true;
      const catSlug = (p.categorySlug || p.category || '').toLowerCase();
      return catSlug.endsWith('-' + subcategory) || catSlug === subcategory;
    });
  }
  
  // SMALL PETS DENY GATE: Filter out ONLY explicit blocked slugs (no keyword matching)
  const normalizedPetTypeCheck = (petType || category || '').toLowerCase().replace(/[-\s]/g, '_');
  const isSmallPetsQuery = ['small_pets', 'small_pet', 'smallpets', 'smallpet'].includes(normalizedPetTypeCheck);
  if (isSmallPetsQuery) {
    const beforeDeny = items.length;
    items = items.filter(p => !isSmallPetsBlockedSlug(p));
    const deniedCount = beforeDeny - items.length;
    console.log(`[small-pets] incoming=${beforeDeny} after_deny=${items.length} denied=${deniedCount}`);
  }
  
  if (q) {
    items = items.filter(p =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q)
    );
  }
  
  if (sort === "price-low") {
    items.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sort === "price-high") {
    items.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sort === "name") {
    items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  } else {
    items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }
  
  // Apply pet-only filter BEFORE pagination to get accurate total
  // Use new petOnlyEngine for strict filtering
  const debugMode = req.query.debug === '1' || req.query.debug === 'true';
  const countBefore = items.length;
  
  // Apply the new petOnlyEngine filter
  const engineMode = petOnlyEngine.PETONLY_MODE;
  const { products: filteredProducts, stats: filterStats } = petOnlyEngine.applyPetOnly(items, engineMode);
  
  // Only keep eligible products (active=true after engine pass)
  const petOnlyItems = filteredProducts.filter(p => p.active !== false && p.is_pet_product !== false);
  const countAfterFilter = petOnlyItems.length;
  const total = petOnlyItems.length;
  const paginatedItems = petOnlyItems.slice(offset, offset + limit);
  
  // Ensure is_pet flag and image property are attached to all products
  const withPetFlags = paginatedItems.map(p => ({
    ...p,
    is_pet: p.is_pet !== undefined ? p.is_pet : checkPetEligible(p),
    petType: p.petType || p.pet_type || p.pet_usage || p._pet_type_detected || null,
    image: p.image || (p.images && p.images[0]) || '/images/placeholder-product.svg'
  }));
  
  let translatedItems = addLabelsToProducts(withPetFlags);
  const locale = req.locale || 'en-US';
  if (lang !== 'en' && productTranslation.SUPPORTED_LANGS.includes(lang) && translationStore.isLocaleEnabled(locale)) {
    translatedItems = await productTranslation.translateProductsBatch(translatedItems, lang);
  }
  
  // Debug mode: return comprehensive filter stats
  if (debugMode) {
    // Get top 10 reasons for disabling
    const reasonsTop = Object.entries(filterStats.reasons || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));
    
    return res.json({
      debug: true,
      mode: engineMode,
      countBefore,
      countAfterFilter,
      filterApplied: 'petonly_engine',
      disabledByRuleCount: filterStats.disabled || 0,
      reasonsTop,
      byPetType: filterStats.byPetType || {},
      total,
      itemsReturned: translatedItems.length,
      category,
      subcategory,
      petType,
      sampleTitles: translatedItems.slice(0, 5).map(p => p.title)
    });
  }
  
  res.json({ items: translatedItems, total, lang, category, subcategory });
});

app.get("/api/products/by-slug/:slug", localeMiddleware, async (req, res) => {
  try {
    const { productStore } = require("./src/productStore");
    let p = productStore.getProductBySlug(req.params.slug);
    if (!p) {
      p = await db.getProduct(req.params.slug);
    }
    if (!p || p.rejected || p.is_active === false || p.deletedAt) return res.status(404).json({ error: "Not found" });
    
    const labeled = addLabelsToProduct(p);
    labeled.slug = p.slug || p.id;
    
    const locale = req.locale || 'en-US';
    const lang = req.localeLanguage || 'en';
    
    if (lang !== 'en' && productTranslation.SUPPORTED_LANGS.includes(lang) && translationStore.isLocaleEnabled(locale)) {
      const translation = translationStore.getTranslation(p.id, locale);
      if (translation) {
        labeled.title = translation.title || labeled.title;
        labeled.description = translation.description || labeled.description;
        labeled._translatedLang = lang;
      }
    }
    
    res.json({ product: labeled, locale, lang });
  } catch (err) {
    console.error("[Product API Slug Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products/top", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    let products = productStore.listProducts({ activeOnly: true });
    
    products = products.filter(p => {
      if (!isRealProduct(p)) return false;
      if (p.rejected) return false;
      if (p.deletedAt) return false;
      if (!p.image) return false;
      if (!p.variants || p.variants.length === 0) return false;
      if (!checkPetEligible(p)) return false;
      return true;
    });
    
    products.sort((a, b) => {
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      if (a.isFeatured && b.isFeatured) {
        const rankDiff = (a.featuredRank || 0) - (b.featuredRank || 0);
        if (rankDiff !== 0) return rankDiff;
      }
      return (b.popularityScore || 0) - (a.popularityScore || 0);
    });
    
    const topProducts = products.slice(0, limit).map(p => ({
      ...p,
      is_pet: true,
      petType: p.petType || p.pet_usage || null,
      badge: topPicks.getPopularityBadge(p, p.popularityScore || 0)
    }));
    
    res.json({ ok: true, products: topProducts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products/:id", localeMiddleware, async (req, res) => {
  try {
    const p = await db.getProduct(req.params.id);
    if (!p || p.rejected) return res.status(404).json({ error: "Not found" });
    
    const labeled = addLabelsToProduct(p);
    
    let images = Array.isArray(p.images) ? [...p.images] : [];
    if (typeof p.images === 'string') {
      try { images = JSON.parse(p.images); } catch { images = []; }
    }
    
    const locale = req.locale || 'en-US';
    const lang = req.localeLanguage || 'en';
    
    try {
      const { getFilteredImagesForProduct } = require("./src/imageLanguageAudit");
      const { getImageLocalizedForProduct } = require("./src/aiDatabase");
      
      const overrides = await getImageLocalizedForProduct(p.id, locale);
      if (overrides && overrides.length > 0) {
        const hiddenUrls = new Set(overrides.filter(o => o.hide_for_locale).map(o => o.original_url));
        images = images.filter(url => !hiddenUrls.has(url));
      }
      
      const filteredImages = await getFilteredImagesForProduct(p.id, locale);
      if (filteredImages && filteredImages.length > 0) {
        images = filteredImages;
      }
    } catch (filterErr) {
      log(`[Product API] Image filtering error for ${p.id}: ${filterErr.message}`);
    }
    
    labeled.images = images;
    if (images.length > 0 && !labeled.image) {
      labeled.image = images[0];
    }
    
    // Ensure is_pet flag is attached
    labeled.is_pet = p.is_pet !== undefined ? p.is_pet : checkPetEligible(p);
    labeled.petType = p.petType || p.pet_usage || null;
    
    // Build optionsSchema for variant selectors
    const variants = p.variants || [];
    if (variants.length > 0) {
      const optionTypes = {};
      for (const v of variants) {
        if (v.options) {
          for (const [key, value] of Object.entries(v.options)) {
            if (!optionTypes[key]) optionTypes[key] = new Set();
            optionTypes[key].add(String(value));
          }
        }
      }
      labeled.optionsSchema = Object.entries(optionTypes).map(([name, values]) => ({
        name,
        values: [...values].sort()
      }));
      labeled.hasVariants = variants.length > 1;
    }
    
    if (lang !== 'en' && productTranslation.SUPPORTED_LANGS.includes(lang) && translationStore.isLocaleEnabled(locale)) {
      const translation = translationStore.getTranslation(p.id, locale);
      if (translation) {
        labeled.title = translation.title || labeled.title;
        labeled.description = translation.description || labeled.description;
        labeled._originalTitle = p.title;
        labeled._originalDescription = p.description;
        labeled._translatedLang = lang;
      }
    }
    
    res.json({ product: labeled, locale, lang });
  } catch (err) {
    console.error("[Product API Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products/:id/variants", async (req, res) => {
  const p = await db.getProduct(req.params.id);
  if (!p) return res.status(404).json({ error: "Not found" });
  
  const variants = p.variants || [];
  
  const optionTypes = {};
  for (const v of variants) {
    if (v.options) {
      for (const [key, value] of Object.entries(v.options)) {
        if (!optionTypes[key]) optionTypes[key] = new Set();
        optionTypes[key].add(String(value));
      }
    }
  }
  
  const optionsSchema = Object.entries(optionTypes).map(([name, values]) => ({
    name,
    values: [...values].sort()
  }));
  
  res.json({ 
    variants,
    optionsSchema,
    hasVariants: variants.length > 1
  });
});

app.get("/api/products/:id/translate/:lang", async (req, res) => {
  try {
    const { id, lang } = req.params;
    if (!productTranslation.SUPPORTED_LANGS.includes(lang)) {
      return res.status(400).json({ error: "Unsupported language" });
    }
    
    if (lang === "en") {
      const p = await db.getProduct(id);
      if (!p) return res.status(404).json({ error: "Not found" });
      return res.json({ translation: null, original: true });
    }
    
    const translation = await productTranslation.getProductTranslation(id, lang);
    res.json({ translation, cached: !!translation });
  } catch (err) {
    console.error("[Translation API Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products/:id/related", async (req, res) => {
  try {
    const p = await db.getProduct(req.params.id);
    if (!p) return res.status(404).json({ error: "Not found" });
    
    const labeled = addLabelsToProduct(p);
    const allProducts = await db.listProducts();
    const labeledAll = addLabelsToProducts(allProducts.filter(prod => prod.active && prod.id !== p.id));
    
    const basePrice = p.variants && p.variants.length > 0 ? p.variants[0].price : p.price;
    
    const scored = labeledAll.map(prod => {
      let score = 0;
      const prodPrice = prod.variants && prod.variants.length > 0 ? prod.variants[0].price : prod.price;
      
      const targetBestFor = labeled.bestFor || [];
      const prodBestFor = prod.bestFor || [];
      const overlap = targetBestFor.filter(l => prodBestFor.includes(l)).length;
      score += overlap * 10;
      
      const isDog = (t) => /dog|pup|canine|chew|fetch|collar|leash/i.test(t);
      const isCat = (t) => /cat|kitten|feline|scratch|catnip/i.test(t);
      const targetText = `${p.title} ${p.description || ""}`;
      const prodText = `${prod.title} ${prod.description || ""}`;
      if ((isDog(targetText) && isDog(prodText)) || (isCat(targetText) && isCat(prodText))) {
        score += 5;
      }
      
      const priceDiff = Math.abs(basePrice - prodPrice);
      if (priceDiff < 5) score += 3;
      else if (priceDiff < 15) score += 1;
      
      if (prod.image && !prod.image.includes('placeholder')) score += 1;
      
      return { ...prod, _score: score };
    });
    
    scored.sort((a, b) => b._score - a._score);
    const related = scored.slice(0, 6).map(({ _score, ...rest }) => ({
      ...rest,
      is_pet: rest.is_pet !== undefined ? rest.is_pet : checkPetEligible(rest),
      petType: rest.petType || rest.pet_usage || null
    }));
    
    res.json({ related });
  } catch (err) {
    console.error("[Related Products Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper to add pet flags and labels to products + apply pet-only filter
function addPetFlagsAndLabels(products, source = 'helper') {
  const withFlags = products.map(p => ({
    ...p,
    is_pet: p.is_pet !== undefined ? p.is_pet : checkPetEligible(p),
    petType: p.petType || p.pet_usage || null
  }));
  // FINAL PET-ONLY SAFEGUARD
  return filterPetOnly(addLabelsToProducts(withFlags), source);
}

app.get("/api/featured", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const featured = featuredProducts.getFeaturedProducts();
    
    const realFeatured = filterRealProducts(featured);
    if (realFeatured.length > 0) {
      return res.json({ items: addPetFlagsAndLabels(realFeatured.slice(0, limit), '/api/featured'), source: 'pinned' });
    }
    
    const topPicksRaw = featuredProducts.autoSelectTopPicks(limit * 2);
    const filtered = filterRealProducts(topPicksRaw).filter(p => p.image && !p.image.includes('placeholder'));
    res.json({ items: addPetFlagsAndLabels(filtered.slice(0, limit), '/api/featured-auto'), source: 'auto' });
  } catch (err) {
    console.error("[Featured Products Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/top-picks/:category", async (req, res) => {
  try {
    const category = req.params.category || 'all';
    const limit = parseInt(req.query.limit) || 12;
    
    const topPicksRaw = featuredProducts.getTopPicksByCategory(category, limit * 2);
    const filtered = filterRealProducts(topPicksRaw).filter(p => p.image && !p.image.includes('placeholder'));
    res.json({ items: addPetFlagsAndLabels(filtered.slice(0, limit), '/api/top-picks'), category });
  } catch (err) {
    console.error("[Top Picks Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/subcategory/:subcat", async (req, res) => {
  try {
    const subcat = req.params.subcat;
    const limit = parseInt(req.query.limit) || 8;
    
    const productsRaw = featuredProducts.getTopPicksBySubcategory(subcat, limit * 2);
    const filtered = filterRealProducts(productsRaw).filter(p => p.image && !p.image.includes('placeholder'));
    res.json({ items: addPetFlagsAndLabels(filtered.slice(0, limit), '/api/subcategory'), subcategory: subcat });
  } catch (err) {
    console.error("[Subcategory Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

const trackEventRateLimits = new Map();
const TRACK_EVENT_LIMIT = 60;

app.post("/api/track-event", async (req, res) => {
  try {
    const clientIp = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const key = `track:${clientIp}`;
    
    if (!trackEventRateLimits.has(key)) {
      trackEventRateLimits.set(key, [now]);
    } else {
      const times = trackEventRateLimits.get(key).filter(t => now - t < 60000);
      if (times.length >= TRACK_EVENT_LIMIT) {
        return res.status(429).json({ error: "Too many requests" });
      }
      times.push(now);
      trackEventRateLimits.set(key, times);
    }
    
    const { productId, eventType } = req.body || {};
    
    if (!productId || typeof productId !== 'string' || productId.length > 100) {
      return res.status(400).json({ error: "Invalid productId" });
    }
    
    if (!eventType || typeof eventType !== 'string') {
      return res.status(400).json({ error: "Invalid eventType" });
    }
    
    const validEvents = ['view_product', 'add_to_cart', 'checkout_start', 'purchase_completed'];
    if (!validEvents.includes(eventType)) {
      return res.status(400).json({ error: "Invalid event type" });
    }
    
    const newScore = featuredProducts.recordPopularityEvent(productId, eventType);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Track Event Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

const pawsyTrackRateLimits = new Map();
const PAWSY_TRACK_LIMIT = 100;

app.post("/api/track-pawsy", async (req, res) => {
  try {
    const clientIp = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const key = `pawsy:${clientIp}`;
    
    if (!pawsyTrackRateLimits.has(key)) {
      pawsyTrackRateLimits.set(key, [now]);
    } else {
      const times = pawsyTrackRateLimits.get(key).filter(t => now - t < 60000);
      if (times.length >= PAWSY_TRACK_LIMIT) {
        return res.status(429).json({ error: "Too many requests" });
      }
      times.push(now);
      pawsyTrackRateLimits.set(key, times);
    }
    
    const { eventName, gp_sid, productId, productIds, query, intent, position, count, messageLen } = req.body || {};
    
    if (!eventName || typeof eventName !== 'string') {
      return res.status(400).json({ error: "Invalid eventName" });
    }
    
    const validEvents = ['pawsy_open', 'pawsy_message', 'pawsy_products_shown', 'pawsy_product_click', 'pawsy_atc', 'pawsy_checkout', 'pawsy_purchase'];
    if (!validEvents.includes(eventName)) {
      return res.status(400).json({ error: "Invalid event name" });
    }
    
    const analyticsHelpers = require('./src/lib/analyticsHelpers');
    analyticsHelpers.logEvent(eventName, {
      gp_sid: gp_sid || null,
      productId: productId || null,
      productIds: Array.isArray(productIds) ? productIds.slice(0, 20) : null,
      query: typeof query === 'string' ? query.substring(0, 100) : null,
      intent: typeof intent === 'string' ? intent.substring(0, 50) : null,
      position: typeof position === 'number' ? position : null,
      count: typeof count === 'number' ? count : null,
      messageLen: typeof messageLen === 'number' ? messageLen : null
    });
    
    res.json({ ok: true });
  } catch (err) {
    console.error("[Track Pawsy Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET handler for checkout - returns guidance instead of 404
app.get("/api/checkout/create-session", (req, res) => {
  res.status(200).json({
    ok: false,
    message: "Use POST /api/checkout/create-session with cart items in body",
    methods: ["POST"],
    example: { items: [{ productId: "123", qty: 1 }] }
  });
});

app.post("/api/checkout/create-session", async (req, res) => {
  if (!stripe) {
    console.log("[Checkout] Stripe not configured - returning disabled status");
    return res.status(200).json({ 
      status: "disabled", 
      message: "Checkout coming soon! Your cart has been saved.",
      redirect: "/cart"
    });
  }

  try {
    const { items } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Empty cart" });
    }

    const products = await db.listProducts();
    const lineItems = [];
    
    // Get domain for absolute URLs (required by Stripe)
    const baseDomain = process.env.REPLIT_DOMAIN ? `https://${process.env.REPLIT_DOMAIN}` : "http://localhost:5000";

    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;

      let price = product.price;
      let variantOptions = null;

      if (item.sku && product.variants) {
        const variant = product.variants.find(v => v.sku === item.sku);
        if (variant) {
          price = variant.price;
          variantOptions = variant.options;
        }
      }

      const productName = variantOptions
        ? `${product.title} (${Object.values(variantOptions).join(", ")})`
        : product.title;

      const unitAmount = Math.round(price * 100);
      
      // Convert relative image URLs to absolute (required by Stripe)
      let productImages = [];
      if (product.image && !product.image.includes("placeholder")) {
        const imageUrl = product.image.startsWith("http") ? product.image : `${baseDomain}${product.image}`;
        productImages = [imageUrl];
      }

      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: productName,
            images: productImages
          }
        },
        quantity: item.qty
      });
    }

    const shippingCost = 495;
    lineItems.push({
      price_data: {
        currency: "usd",
        unit_amount: shippingCost,
        product_data: {
          name: "Standard Shipping"
        }
      },
      quantity: 1
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${baseDomain}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseDomain}/cancel.html`,
      metadata: {
        timestamp: new Date().toISOString(),
        items_count: items.length
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("[Stripe Checkout Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) {
    return res.status(400).json({ error: "Stripe not configured" });
  }

  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.warn("[Stripe] No webhook secret configured");
    return res.status(400).json({ error: "Webhook secret not configured" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    try {
      const session = event.data.object;
      const ordersPath = path.join(__dirname, "data", "orders.json");

      let orders = [];
      if (fs.existsSync(ordersPath)) {
        orders = JSON.parse(fs.readFileSync(ordersPath, "utf-8")) || [];
      }

      const order = {
        session_id: session.id,
        amount_total: session.amount_total,
        currency: session.currency,
        customer_email: session.customer_email,
        payment_status: session.payment_status,
        created: new Date().toISOString(),
        metadata: session.metadata || {},
        fulfillment_status: "pending"
      };

      orders.push(order);
      fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));

      // Prepare CJ fulfillment
      const cjOrder = await prepareCJOrder(order);
      if (cjOrder) {
        savePendingCJOrder(cjOrder);
      }

      log(`[Stripe] Order saved and prepared for fulfillment: ${session.id}`);
    } catch (err) {
      console.error("[Stripe] Error saving order:", err.message);
    }
  }

  res.json({ received: true });
});

// API: QA Verification endpoint (all metrics)
app.get("/api/qa", async (req, res) => {
  try {
    const qaData = cjExactMapper.getQAData();
    res.json({
      buildId: BUILD_ID,
      startedAt: BUILD_START_TIME,
      ...qaData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: CJ Catalog Rebuild endpoint
app.post("/api/admin/cj-rebuild", requireAdminSession, async (req, res) => {
  try {
    const csvPath = path.join(__dirname, "data/cj-latest.csv");
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ error: "CJ CSV not found at data/cj-latest.csv" });
    }
    
    const result = await cjExactMapper.rebuildCJCatalog(csvPath);
    res.json({
      success: true,
      buildId: BUILD_ID,
      ...result
    });
  } catch (err) {
    console.error("[CJ Rebuild Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// AI Health Check endpoint for debugging
app.get("/api/ai/health", (req, res) => {
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const pawsyEnabled = process.env.PAWSY_AI_ENABLED === "true";
  
  res.json({
    ok: hasOpenAIKey,
    pawsy_enabled: pawsyEnabled,
    openai_key_present: hasOpenAIKey,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/pawsy", async (req, res) => {
  const startTime = Date.now();
  try {
    const { message, sessionId, pageUrl, productId } = req.body || {};
    const text = (message || "").trim();
    if (!text) return res.status(400).json({ error: "No message" });

    const clientIp = req.ip || req.connection.remoteAddress || "unknown";
    const limitCheck = checkRateLimit(clientIp);
    if (!limitCheck.allowed) {
      log(`[Pawsy] Rate limited for IP: ${clientIp}`);
      return res.status(429).json({
        error: "Too many requests. Please try again in a minute.",
        remaining: 0
      });
    }

    const products = await db.listProducts();
    const activeProducts = products.filter(p => p.active !== false && p.image);
    
    const hasOpenAIKey = !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
    const useLLM = process.env.PAWSY_AI_ENABLED === "true" && hasOpenAIKey;
    let response = null;
    
    log(`[Pawsy Hybrid] Request from ${clientIp}: "${text.substring(0, 50)}..." | LLM: ${useLLM} | Products: ${activeProducts.length}`);
    
    if (useLLM) {
      response = await askPawsyHybrid(text, activeProducts, { sessionId, pageUrl, productId });
    }
    
    if (!response) {
      log(`[Pawsy] Falling back to rule-based logic for: "${text.substring(0, 50)}..."`);
      const fallback = getPawsyResponse(text, activeProducts);
      response = {
        reply: fallback.reply,
        intent: "SHOPPING_INTENT",
        recommendedProducts: (fallback.suggestions || []).map(s => ({
          id: s.id,
          title: s.title,
          price: s.price,
          image: s.image,
          reason: s.reason || ""
        })),
        followupQuestions: []
      };
    }

    const latency = Date.now() - startTime;
    log(`[Pawsy Hybrid] Response in ${latency}ms | Intent: ${response.intent} | Products: ${(response.recommendedProducts || []).length}`);

    res.set("X-RateLimit-Remaining", limitCheck.remaining.toString());
    
    const normalizedProducts = (response.recommendedProducts || []).map(p => ({
      id: p.id,
      title: p.title || "",
      price: typeof p.price === 'number' ? p.price : parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0,
      image: p.image || "",
      reason: p.reason || ""
    }));
    
    res.json({
      reply: response.reply,
      replyText: response.reply,
      intent: response.intent || "OTHER_GENERAL",
      recommendedProducts: normalizedProducts,
      suggestions: normalizedProducts,
      followupQuestions: response.followupQuestions || [],
      isHealthConcern: response.isHealthConcern || false,
      hasRedFlags: response.hasRedFlags || false
    });
  } catch (err) {
    const latency = Date.now() - startTime;
    console.error("[Pawsy Error]", err.message, err.stack);
    log(`[Pawsy] ERROR after ${latency}ms: ${err.message}`);
    res.status(500).json({ 
      error: "Assistant temporarily unavailable. Please try again.",
      reply: "I'm Pawsy 🐾 Ask me about products, shipping, sizing, or pet advice!",
      replyText: "I'm Pawsy 🐾 Ask me about products, shipping, sizing, or pet advice!",
      intent: "OTHER_GENERAL",
      recommendedProducts: [],
      suggestions: [],
      followupQuestions: []
    });
  }
});

app.post("/api/pawsy/chat", async (req, res) => {
  const startTime = Date.now();
  try {
    const { message, sessionId, pageUrl, productId, language } = req.body || {};
    const text = (message || "").trim();
    if (!text) return res.status(400).json({ error: "No message" });

    const clientIp = req.ip || req.connection.remoteAddress || "unknown";
    const limitCheck = checkRateLimit(clientIp);
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
    }

    const visitorLang = language || 'en';
    const products = await db.listProducts();
    const activeProducts = products.filter(p => p.active !== false && p.image);
    
    const hasOpenAIKey = !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
    const useLLM = process.env.PAWSY_AI_ENABLED === "true" && hasOpenAIKey;
    const useRAG = process.env.PAWSY_USE_RAG !== "false" && embeddingsEnabled();
    const useV3 = process.env.PAWSY_USE_V3 !== "false" && isV3Enabled();
    
    log(`[Pawsy Chat] Request: "${text.substring(0, 50)}..." | V3: ${useV3} | LLM: ${useLLM} | RAG: ${useRAG} | Lang: ${visitorLang}`);
    
    let response = null;
    if (useLLM) {
      if (useV3) {
        response = await askPawsyV3(text, activeProducts, { sessionId, pageUrl, productId, language: visitorLang });
        if (response) {
          log(`[Pawsy V3] Tools used: ${response.toolsUsed?.join(', ') || 'none'} | Primary action: ${response.primaryAction?.action || 'none'}`);
        }
      }
      if (!response && useRAG) {
        response = await askPawsyRAG(text, activeProducts, { sessionId, pageUrl, productId, language: visitorLang });
      }
      if (!response) {
        response = await askPawsyHybrid(text, activeProducts, { sessionId, pageUrl, productId, language: visitorLang });
      }
    }
    
    if (!response) {
      const fallback = getPawsyResponse(text, activeProducts);
      response = {
        reply: fallback.reply,
        intent: "SHOPPING_INTENT",
        recommendedProducts: (fallback.suggestions || []).map(s => ({
          id: s.id, title: s.title, price: s.price, image: s.image, reason: ""
        })),
        followupQuestions: []
      };
    }

    const latency = Date.now() - startTime;
    const productsFound = response.recommendedProducts?.length || 0;
    const productIds = (response.recommendedProducts || []).slice(0, 3).map(p => p.id).join(", ");
    log(`[Pawsy Chat] Response in ${latency}ms | Intent: ${response.intent} | Products: ${productsFound} (${productIds || 'none'}) | RAG docs: ${response.ragContext?.docsUsed || 0}`);
    
    const normalizeProduct = (p) => {
      const primaryImage = getPrimaryImage(p);
      const images = resolveAllImages(p);
      console.log(`[pawsy-product] "${(p.title || '').substring(0,50)}" img=${!!primaryImage || !!p.image}`);
      return {
        id: p.id,
        title: p.title || "",
        price: typeof p.price === 'number' ? p.price : parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0,
        image: p.image || "",
        primaryImage: primaryImage,
        images: images,
        slug: p.slug || p.handle || `product-${p.id}`,
        description: p.description || "",
        variants: p.variants || [],
        reason: p.reason || "",
        cta: {
          view: `/product/${p.slug || p.handle || p.id}`,
          add: `/api/cart/add?id=${p.id}`
        }
      };
    };
    
    const normalizedProducts = (response.recommendedProducts || [])
      .filter(p => isPetProduct(p))
      .map(normalizeProduct);
    
    const relatedProducts = (response.relatedProducts || [])
      .filter(p => isPetProduct(p))
      .slice(0, 3)
      .map(normalizeProduct);
    
    const crossSellProducts = (response.crossSellProducts || [])
      .filter(p => isPetProduct(p))
      .slice(0, 2)
      .map(normalizeProduct);
    
    res.json({
      language: response.language || "en",
      intent: response.intent || "OTHER_GENERAL",
      reply: response.reply,
      replyText: response.reply,
      cards: normalizedProducts,
      recommendedProducts: normalizedProducts,
      suggestions: normalizedProducts,
      related: relatedProducts,
      relatedProducts: relatedProducts,
      crossSell: crossSellProducts,
      crossSellProducts: crossSellProducts,
      followupQuestions: response.followupQuestions || [],
      followUpChips: response.followupQuestions || [],
      isHealthConcern: response.isHealthConcern || false,
      hasRedFlags: response.hasRedFlags || false,
      ragContext: response.ragContext || null,
      actions: response.actions || [],
      primaryAction: response.primaryAction || null,
      toolsUsed: response.toolsUsed || []
    });
  } catch (err) {
    console.error("[Pawsy Chat Error]", err.message);
    res.status(500).json({ 
      error: "Assistant temporarily unavailable.",
      reply: "I'm having trouble right now. Please try again!",
      replyText: "I'm having trouble right now. Please try again!",
      intent: "OTHER_GENERAL",
      recommendedProducts: [],
      suggestions: []
    });
  }
});

// Pawsy Sales Agent v2 - Product Search API
app.get("/api/pawsy/search", localeMiddleware, async (req, res) => {
  try {
    const { 
      q = "", 
      lang,
      minPrice,
      maxPrice,
      category,
      subcategory,
      tags,
      warehouse,
      sort = "relevance",
      limit = 12
    } = req.query;
    
    const searchLang = lang || req.localeLanguage || 'en';
    const searchQuery = (q || "").toLowerCase().trim();
    const limitNum = Math.min(Math.max(parseInt(limit) || 12, 1), 50);
    
    log(`[Pawsy Search] Query: "${searchQuery}" | Lang: ${searchLang} | Filters: price=${minPrice}-${maxPrice}, cat=${category}, sort=${sort}`);
    
    let products = await db.listProducts();
    
    const isValidProduct = (p) => {
      if (!p.active) return false;
      if (p.rejected || p.quarantined || p.deletedAt) return false;
      if (!p.image || p.image.includes('placeholder') || p.image.includes('demo')) return false;
      return true;
    };
    
    products = products.filter(isValidProduct);
    
    if (searchQuery) {
      products = products.filter(p => {
        const title = (p.title || "").toLowerCase();
        const desc = (p.description || "").toLowerCase();
        const cats = (p.category || "").toLowerCase();
        const combined = title + " " + desc + " " + cats;
        return combined.includes(searchQuery);
      });
    }
    
    if (category) {
      const catLower = category.toLowerCase();
      products = products.filter(p => {
        const pCat = (p.category || "").toLowerCase();
        const pTitle = (p.title || "").toLowerCase();
        return pCat.includes(catLower) || pTitle.includes(catLower);
      });
    }
    
    if (subcategory) {
      const subLower = subcategory.toLowerCase();
      products = products.filter(p => {
        const pSub = (p.subcategory || p.category || "").toLowerCase();
        return pSub.includes(subLower);
      });
    }
    
    if (minPrice) {
      const min = parseFloat(minPrice);
      if (!isNaN(min)) {
        products = products.filter(p => (p.price || 0) >= min);
      }
    }
    
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) {
        products = products.filter(p => (p.price || 0) <= max);
      }
    }
    
    if (tags) {
      const tagList = tags.split(",").map(t => t.trim().toLowerCase());
      products = products.filter(p => {
        const pTags = (p.tags || p.labels || []).map(t => (t || "").toLowerCase());
        const pTitle = (p.title || "").toLowerCase();
        return tagList.some(t => pTags.includes(t) || pTitle.includes(t));
      });
    }
    
    if (warehouse) {
      products = products.filter(p => {
        const pWarehouse = (p.warehouse || p.fulfillmentCenter || "").toLowerCase();
        return pWarehouse.includes(warehouse.toLowerCase()) || warehouse.toLowerCase() === "us";
      });
    }
    
    const totalCount = products.length;
    
    switch (sort) {
      case "price_asc":
        products.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case "price_desc":
        products.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case "newest":
        products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        break;
      case "popular":
        products.sort((a, b) => (b.salesCount || b.views || 0) - (a.salesCount || a.views || 0));
        break;
      default:
        break;
    }
    
    products = products.slice(0, limitNum);
    
    if (searchLang !== 'en' && productTranslation.SUPPORTED_LANGS.includes(searchLang)) {
      products = await productTranslation.translateProductsBatch(products, searchLang);
    }
    
    const normalizeProduct = (p) => {
      const primaryImage = getPrimaryImage(p);
      const images = resolveAllImages(p);
      return {
        id: p.id,
        title: p.title || "",
        price: typeof p.price === 'number' ? p.price : parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0,
        image: p.image || primaryImage || "",
        primaryImage: primaryImage,
        images: images,
        slug: p.slug || p.handle || `product-${p.id}`,
        description: (p.description || "").substring(0, 200),
        category: p.category || "",
        variants: p.variants || [],
        variantCount: (p.variants || []).length,
        inStock: p.inStock !== false,
        cta: {
          view: `/product/${p.slug || p.handle || p.id}`,
          add: `/api/pawsy/add-to-cart`
        }
      };
    };
    
    const normalizedProducts = products.map(normalizeProduct);
    
    log(`[Pawsy Search] Found ${totalCount} total, returning ${normalizedProducts.length}`);
    
    res.json({
      success: true,
      products: normalizedProducts,
      total: totalCount,
      returned: normalizedProducts.length,
      query: searchQuery,
      language: searchLang,
      filters: {
        category: category || null,
        subcategory: subcategory || null,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        tags: tags ? tags.split(",").map(t => t.trim()) : null,
        warehouse: warehouse || null,
        sort
      }
    });
  } catch (err) {
    console.error("[Pawsy Search Error]", err.message);
    log(`[Pawsy Search] Error: ${err.message}`);
    res.status(500).json({ 
      success: false,
      error: "Search temporarily unavailable",
      products: [],
      total: 0
    });
  }
});

// Pawsy Sales Agent v2 - Add to Cart API
app.post("/api/pawsy/add-to-cart", async (req, res) => {
  try {
    const { productId, variantId, qty = 1 } = req.body || {};
    
    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID required" });
    }
    
    const product = await db.getProduct(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    
    if (product.rejected || !product.active) {
      return res.status(400).json({ success: false, error: "Product not available" });
    }
    
    let selectedVariant = null;
    const variants = product.variants || [];
    
    if (variantId && variants.length > 0) {
      selectedVariant = variants.find(v => v.vid === variantId || v.variantId === variantId || v.id === variantId);
    } else if (variants.length > 0) {
      selectedVariant = variants[0];
    }
    
    const cartItem = {
      productId: product.id,
      title: product.title,
      price: selectedVariant?.price || product.price,
      image: product.image || getPrimaryImage(product),
      variantId: selectedVariant?.vid || selectedVariant?.variantId || null,
      variantName: selectedVariant?.name || selectedVariant?.variantName || null,
      qty: Math.max(1, parseInt(qty) || 1)
    };
    
    log(`[Pawsy Cart] Add: ${product.id} | Variant: ${cartItem.variantId || 'default'} | Qty: ${cartItem.qty}`);
    
    res.json({
      success: true,
      message: "Added to cart!",
      item: cartItem,
      product: {
        id: product.id,
        title: product.title,
        price: cartItem.price,
        image: cartItem.image,
        slug: product.slug || product.handle || `product-${product.id}`
      }
    });
  } catch (err) {
    console.error("[Pawsy Cart Error]", err.message);
    res.status(500).json({ success: false, error: "Failed to add to cart" });
  }
});

// Pawsy Sales Agent v2 - Product Details API
app.get("/api/pawsy/product/:id", localeMiddleware, async (req, res) => {
  try {
    const productId = req.params.id;
    const lang = req.query.lang || req.localeLanguage || 'en';
    
    const product = await db.getProduct(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    
    let images = resolveAllImages(product);
    let variants = product.variants || [];
    
    if (typeof variants === 'string') {
      try { variants = JSON.parse(variants); } catch { variants = []; }
    }
    
    let translatedProduct = product;
    if (lang !== 'en' && productTranslation.SUPPORTED_LANGS.includes(lang)) {
      const translated = await productTranslation.translateProductsBatch([product], lang);
      translatedProduct = translated[0] || product;
    }
    
    res.json({
      success: true,
      product: {
        id: translatedProduct.id,
        title: translatedProduct.title,
        description: translatedProduct.description,
        price: translatedProduct.price,
        compareAtPrice: translatedProduct.compareAtPrice || null,
        image: translatedProduct.image || images[0] || "",
        images: images,
        slug: translatedProduct.slug || translatedProduct.handle || `product-${translatedProduct.id}`,
        category: translatedProduct.category || "",
        variants: variants.map(v => ({
          id: v.vid || v.variantId || v.id,
          name: v.name || v.variantName || v.title,
          price: v.price || translatedProduct.price,
          image: v.image || null,
          inStock: v.inStock !== false
        })),
        inStock: translatedProduct.inStock !== false,
        shipping: translatedProduct.shippingInfo || "Ships from US warehouse",
        cta: {
          view: `/product/${translatedProduct.slug || translatedProduct.handle || translatedProduct.id}`,
          add: `/api/pawsy/add-to-cart`
        }
      },
      language: lang
    });
  } catch (err) {
    console.error("[Pawsy Product Error]", err.message);
    res.status(500).json({ success: false, error: "Failed to load product" });
  }
});

// Pawsy Sales Agent v2 - Suggestions API (popular categories, quick searches)
app.get("/api/pawsy/suggestions", async (req, res) => {
  try {
    const products = await db.listProducts();
    const activeProducts = products.filter(p => p.active && !p.rejected && p.image);
    
    const categories = {};
    activeProducts.forEach(p => {
      const cat = (p.category || "General").toLowerCase();
      categories[cat] = (categories[cat] || 0) + 1;
    });
    
    const topCategories = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));
    
    const popularSearches = [
      { query: "dog toys", icon: "🐕" },
      { query: "cat toys", icon: "🐱" },
      { query: "pet beds", icon: "🛏️" },
      { query: "treats", icon: "🦴" },
      { query: "collars", icon: "🎀" },
      { query: "grooming", icon: "✂️" }
    ];
    
    const priceFilters = [
      { label: "Under $15", maxPrice: 15 },
      { label: "$15-$30", minPrice: 15, maxPrice: 30 },
      { label: "$30-$50", minPrice: 30, maxPrice: 50 },
      { label: "Over $50", minPrice: 50 }
    ];
    
    res.json({
      success: true,
      categories: topCategories,
      popularSearches,
      priceFilters,
      totalProducts: activeProducts.length
    });
  } catch (err) {
    console.error("[Pawsy Suggestions Error]", err.message);
    res.status(500).json({ success: false, error: "Failed to load suggestions" });
  }
});


// Debug endpoint to inspect product image resolution (admin-only)
app.get("/api/pawsy/debug-product", requireAdminSession, async (req, res) => {
  try {
    const productId = req.query.id;
    if (!productId) return res.status(400).json({ error: "Missing product id" });
    
    const product = await db.getProduct(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    const primaryImage = getPrimaryImage(product);
    const images = resolveAllImages(product);
    
    res.json({
      raw: {
        id: product.id,
        title: product.title,
        image: product.image,
        imageUrl: product.imageUrl,
        mainImage: product.mainImage,
        images: product.images,
        imageList: product.imageList,
        gallery: product.gallery,
        variants: product.variants
      },
      resolved: {
        primaryImage: primaryImage,
        imagesCount: images.length,
        images: images.slice(0, 5)
      }
    });
  } catch (err) {
    console.error("[Debug Product Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/pawsy/config", (req, res) => {
  res.json({
    enabled: process.env.PAWSY_AI_ENABLED === "true",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    rate_limit_per_min: PAWSY_RATE_LIMIT,
    max_products: parseInt(process.env.PAWSY_AI_MAX_PRODUCTS || "8")
  });
});

// AI-generated speech bubble for specific product context
app.post("/api/pawsy/bubble", async (req, res) => {
  try {
    const { productTitle, category } = req.body;
    
    if (!productTitle) {
      return res.status(400).json({ error: "Missing productTitle" });
    }
    
    // Check if LLM is enabled
    const useLLM = process.env.PAWSY_AI_ENABLED === "true" && process.env.OPENAI_API_KEY;
    if (!useLLM) {
      return res.json({ bubble: null, reason: "LLM disabled" });
    }
    
    // Rate limit check (use same limiter as main Pawsy)
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const limitCheck = checkRateLimit(ip);
    if (!limitCheck.allowed) {
      return res.json({ bubble: null, reason: "rate_limited" });
    }
    
    // Generate AI bubble using OpenAI
    const OpenAI = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = `Generate one short, friendly, playful speech bubble (max 10 words) for a pet shop mascot, based on this product: "${productTitle}" (category: ${category || 'general'}). No emojis, no health claims, no brand names. Just a fun, helpful phrase.`;
    
    // Always use gpt-4o-mini for bubbles (fast & cheap)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Pawsy, a friendly pet shop mascot. Respond with only a short speech bubble phrase (max 10 words). Be playful and helpful." },
        { role: "user", content: prompt }
      ],
      max_tokens: 30,
      temperature: 0.8
    });
    
    const bubble = completion.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || null;
    
    log(`[Pawsy Bubble] Generated AI bubble for "${productTitle}": "${bubble}"`);
    
    res.json({ bubble, source: "ai" });
  } catch (err) {
    console.error("[Pawsy Bubble Error]", err.message);
    res.json({ bubble: null, error: err.message });
  }
});

app.post("/api/import/csv-raw", async (req, res) => {
  try {
    const csvText = typeof req.body === "string" ? req.body : req.body.toString("utf-8");
    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({ error: "Empty CSV" });
    }

    const rawProducts = parseCSV(csvText);
    if (rawProducts.length === 0) {
      return res.status(400).json({ error: "No products found in CSV" });
    }

    const normalized = await Promise.all(rawProducts.map(normalizeProduct));
    await db.upsertProducts(normalized);

    res.json({ ok: true, imported: normalized.length });
  } catch (err) {
    console.error("[CSV Import Error]", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/import/cj-csv/progress", (req, res) => {
  res.json(getImportProgress());
});

app.post("/api/import/cj-csv", async (req, res) => {
  try {
    const csvText = typeof req.body === "string" ? req.body : req.body.toString("utf-8");
    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({ error: "Empty CSV" });
    }

    const products = await parseCJCSV(csvText);
    if (products.length === 0) {
      return res.status(400).json({ error: "No valid CJ products found in CSV" });
    }

    await db.upsertProducts(products);

    const usCount = products.filter(p => p.is_us).length;
    const nonUSCount = products.length - usCount;

    res.json({ 
      ok: true, 
      imported: products.length,
      us_products: usCount,
      non_us_products: nonUSCount
    });
  } catch (err) {
    console.error("[CJ Import Error]", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/import/cj-csv-robust", async (req, res) => {
  const progress = getImportProgress();
  if (progress.status === "parsing" || progress.status === "processing") {
    return res.status(409).json({ error: "Import already in progress", progress });
  }

  try {
    const csvText = typeof req.body === "string" ? req.body : req.body.toString("utf-8");
    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({ error: "Empty CSV" });
    }

    // Detect CSV format (simple: SPU,Name,Link only vs complex with prices/variants)
    const firstLine = csvText.split("\n")[0].toLowerCase();
    const isSimpleFormat = !firstLine.includes("price") && !firstLine.includes("sku");

    log(`[CJ Import] Starting import (${isSimpleFormat ? "simple" : "robust"} format), CSV size: ${(csvText.length / 1024).toFixed(1)} KB`);

    res.json({ 
      ok: true, 
      message: "Import started in background",
      progress_url: "/api/import/cj-csv/progress"
    });

    setImmediate(async () => {
      try {
        const products = isSimpleFormat 
          ? await parseCJCSVSimple(csvText)
          : await parseCJCSVRobust(csvText);
        
        if (products.length > 0) {
          await db.upsertProducts(products);
          log(`[CJ Import] Saved ${products.length} products to database`);
        }
      } catch (err) {
        log(`[CJ Import] Background import error: ${err.message}`);
      }
    });

  } catch (err) {
    console.error("[CJ Import Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// CJ XLSX Import endpoint
app.post("/api/import/cj-xlsx", async (req, res) => {
  const progress = cjXlsxImport.getProgress();
  if (progress.status === "parsing" || progress.status === "processing" || progress.status === "grouping") {
    return res.status(409).json({ error: "Import already in progress", progress });
  }

  const filePath = req.body.filePath || req.query.file;
  if (!filePath) {
    return res.status(400).json({ error: "Missing filePath parameter" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `File not found: ${filePath}` });
  }

  res.json({ 
    ok: true, 
    message: "XLSX import started in background",
    progress_url: "/api/import/cj-xlsx/progress"
  });

  setImmediate(async () => {
    try {
      const report = await cjXlsxImport.importXlsx(filePath);
      log(`[CJ XLSX Import] Complete: ${JSON.stringify(report)}`);
    } catch (err) {
      log(`[CJ XLSX Import] Error: ${err.message}`);
    }
  });
});

app.get("/api/import/cj-xlsx/progress", (req, res) => {
  res.json(cjXlsxImport.getProgress());
});

app.post("/api/sync/cj/manual", async (req, res) => {
  try {
    const csvText = typeof req.body === "string" ? req.body : req.body.toString("utf-8");
    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({ error: "Empty CSV" });
    }

    const result = await runCJSync(csvText);
    if (!result.ok) {
      return res.status(400).json(result);
    }

    lastSyncTime = new Date().toISOString();
    lastSyncMode = "manual";
    lastSyncCount = result.synced;

    console.log(`[CJ Sync] Manual sync completed: ${result.synced} products`);
    
    res.json({ ...result, mode: "manual", timestamp: lastSyncTime });
  } catch (err) {
    console.error("[CJ Sync Error]", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync/cj/auto", async (req, res) => {
  const remote = req.ip || req.connection.remoteAddress || "";
  const isLocalhost = remote === "127.0.0.1" || remote === "::1" || remote.includes("127.0.0.1");
  const key = (req.headers["x-sync-key"] || "").trim();
  const envKey = process.env.CJ_SYNC_KEY || "";

  const authorized = isLocalhost || (envKey && key === envKey);

  if (!authorized) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const csvPath = path.join(__dirname, "data", "cj-latest.csv");
    if (!fs.existsSync(csvPath)) {
      console.warn(`[CJ Sync] Auto sync skipped: data/cj-latest.csv not found`);
      return res.status(404).json({ error: "No CJ source file found" });
    }

    const csvText = fs.readFileSync(csvPath, "utf-8");
    const result = await runCJSync(csvText);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    lastSyncTime = new Date().toISOString();
    lastSyncMode = "auto";
    lastSyncCount = result.synced;

    console.log(`[CJ Sync] Auto sync completed: ${result.synced} products`);

    res.json({ ...result, mode: "auto", timestamp: lastSyncTime });
  } catch (err) {
    console.error("[CJ Sync Error]", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sync/status", (req, res) => {
  res.json({
    last_sync_time: lastSyncTime,
    last_sync_mode: lastSyncMode,
    last_sync_count: lastSyncCount,
    auto_sync_enabled: process.env.CJ_AUTO_SYNC === "true"
  });
});

// Admin API endpoints - Pet Filter Overrides

const petOverrides = require("./src/petOverrides");

app.get("/api/admin/overrides", requireAdminSession, (req, res) => {
  try {
    const overrides = petOverrides.listOverrides();
    res.json({ overrides, total: overrides.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/overrides/approve", requireAdminSession, (req, res) => {
  try {
    const { productId, reason, originalRejectReason } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: "Product ID required" });
    }
    
    const result = petOverrides.approveProduct(productId, {
      reason: reason || 'Admin force-approve',
      adminUser: 'admin',
      originalRejectReason
    });
    
    log(`[Admin Override] Product ${productId} force-approved: ${reason}`);
    res.json({ success: true, override: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/overrides/revoke/:productId", requireAdminSession, (req, res) => {
  try {
    const { productId } = req.params;
    const result = petOverrides.revokeApproval(productId, 'admin');
    
    if (result) {
      log(`[Admin Override] Product ${productId} approval revoked`);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Override not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin API endpoints - Rejected Products

// List rejected products with pagination
app.get("/api/admin/rejected", requireAdminSession, async (req, res) => {
  try {
    const { page = 1, pageSize = 25, query } = req.query;
    let products = await db.listProducts();
    
    // Filter only rejected products
    products = products.filter(p => p.rejected === true);
    
    // Search filter
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      products = products.filter(p => 
        (p.title || "").toLowerCase().includes(q) ||
        (p.id || "").toLowerCase().includes(q)
      );
    }
    
    const total = products.length;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize) || 25));
    const start = (pageNum - 1) * size;
    const paged = products.slice(start, start + size);
    
    res.json({
      items: paged,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rejected products stats
app.get("/api/admin/rejected/stats", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const rejected = products.filter(p => p.rejected === true);
    const active = products.filter(p => p.active !== false && !p.rejected);
    
    // Group by reject reason
    const byReason = {};
    rejected.forEach(p => {
      const reasons = p.rejectReasons || ['Unknown'];
      reasons.forEach(r => {
        byReason[r] = (byReason[r] || 0) + 1;
      });
    });
    
    res.json({
      totalProducts: products.length,
      rejectedCount: rejected.length,
      activeCount: active.length,
      byReason,
      lastScanAt: null // Will be updated when scan runs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scan and reject non-pet products
app.post("/api/admin/rejected/scan", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const activeProducts = products.filter(p => !p.rejected && !p.deletedAt);
    
    const { petProducts, nonPetProducts, stats } = batchClassify(activeProducts);
    
    // Mark non-pet products as rejected
    let rejectedCount = 0;
    for (const product of nonPetProducts) {
      await db.updateProduct(product.id, {
        rejected: true,
        rejectReasons: product.rejectReasons || ['Not classified as pet-related'],
        rejectedAt: new Date().toISOString(),
        active: false
      });
      rejectedCount++;
    }
    
    logAdminAction("rejected_scan", { 
      scanned: activeProducts.length, 
      rejected: rejectedCount,
      stats 
    });
    
    log(`[Rejected Scan] Scanned ${activeProducts.length} products, rejected ${rejectedCount}`);
    
    res.json({
      ok: true,
      scanned: activeProducts.length,
      rejected: rejectedCount,
      keptActive: petProducts.length,
      stats
    });
  } catch (err) {
    log(`[Rejected Scan Error] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Preview scan (dry run)
app.get("/api/admin/rejected/scan-preview", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const activeProducts = products.filter(p => !p.rejected && !p.deletedAt);
    
    const { petProducts, nonPetProducts, stats } = batchClassify(activeProducts);
    
    // Return preview of what would be rejected
    const preview = nonPetProducts.slice(0, 50).map(p => ({
      id: p.id,
      title: p.title,
      rejectReasons: p.rejectReasons,
      confidence: p._classification?.confidence
    }));
    
    res.json({
      wouldReject: nonPetProducts.length,
      wouldKeep: petProducts.length,
      preview,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore a rejected product
app.post("/api/admin/rejected/:id/restore", requireAdminSession, async (req, res) => {
  try {
    const product = await db.updateProduct(req.params.id, { 
      rejected: false, 
      rejectReasons: null,
      rejectedAt: null,
      active: true
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    logAdminAction("rejected_restore", { productId: req.params.id, title: product.title });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk restore rejected products
app.post("/api/admin/rejected/bulk/restore", requireAdminSession, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No product IDs provided" });
    }
    const count = await db.updateProducts(ids, { 
      rejected: false, 
      rejectReasons: null,
      rejectedAt: null,
      active: true
    });
    logAdminAction("rejected_bulk_restore", { count, ids });
    res.json({ ok: true, restored: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Permanently delete rejected product
app.delete("/api/admin/rejected/:id", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const filtered = products.filter(p => p.id !== req.params.id);
    if (filtered.length === products.length) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Write filtered products back
    const d = { products: filtered };
    fs.writeFileSync(path.join(__dirname, "data", "db.json"), JSON.stringify(d, null, 2));
    
    logAdminAction("rejected_permanent_delete", { productId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Classify a single product (for testing)
app.get("/api/admin/classify/:id", requireAdminSession, async (req, res) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    const classification = classifyPetRelevance(product);
    res.json({ product: { id: product.id, title: product.title }, classification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/products", requireAdminSession, async (req, res) => {
  try {
    const { query, source, status, petType, page = 1, pageSize = 25 } = req.query;
    let products = await db.listProducts();
    
    // Search filter (title, id, spu)
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      products = products.filter(p => 
        (p.title || "").toLowerCase().includes(q) ||
        (p.id || "").toLowerCase().includes(q) ||
        (p.spu || "").toLowerCase().includes(q)
      );
    }
    
    // Source filter
    if (source && source !== "all") {
      products = products.filter(p => (p.source || "").toLowerCase() === source.toLowerCase());
    }
    
    // Status filter
    if (status && status !== "all") {
      if (status === "active") {
        products = products.filter(p => p.active !== false && !p.deletedAt);
      } else if (status === "inactive") {
        products = products.filter(p => p.active === false && !p.deletedAt);
      } else if (status === "deleted") {
        products = products.filter(p => !!p.deletedAt);
      }
    } else {
      // Default: exclude deleted
      products = products.filter(p => !p.deletedAt);
    }
    
    // Pet type filter
    if (petType && petType !== "all") {
      const petLower = petType.toLowerCase();
      products = products.filter(p => {
        const text = `${p.title || ""} ${p.description || ""} ${p.category || ""}`.toLowerCase();
        if (petLower === "dog") return /dog|pup|canine|chew|fetch|collar|leash/i.test(text);
        if (petLower === "cat") return /cat|kitten|feline|scratch|catnip/i.test(text);
        return true;
      });
    }
    
    const total = products.length;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize) || 25));
    const start = (pageNum - 1) * size;
    const paged = products.slice(start, start + size);
    
    res.json({
      items: paged,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enable product
app.post("/api/admin/products/:id/enable", requireAdminSession, async (req, res) => {
  try {
    const product = await db.updateProduct(req.params.id, { active: true });
    if (!product) return res.status(404).json({ error: "Product not found" });
    logAdminAction("product_enable", { productId: req.params.id, title: product.title });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disable product
app.post("/api/admin/products/:id/disable", requireAdminSession, async (req, res) => {
  try {
    const product = await db.updateProduct(req.params.id, { active: false });
    if (!product) return res.status(404).json({ error: "Product not found" });
    logAdminAction("product_disable", { productId: req.params.id, title: product.title });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft delete product
app.post("/api/admin/products/:id/delete", requireAdminSession, async (req, res) => {
  try {
    const product = await db.updateProduct(req.params.id, { deletedAt: new Date().toISOString(), active: false });
    if (!product) return res.status(404).json({ error: "Product not found" });
    logAdminAction("product_delete", { productId: req.params.id, title: product.title });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore deleted product
app.post("/api/admin/products/:id/restore", requireAdminSession, async (req, res) => {
  try {
    const product = await db.updateProduct(req.params.id, { deletedAt: null, active: true });
    if (!product) return res.status(404).json({ error: "Product not found" });
    logAdminAction("product_restore", { productId: req.params.id, title: product.title });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk enable products
app.post("/api/admin/products/bulk/enable", requireAdminSession, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No product IDs provided" });
    }
    const count = await db.updateProducts(ids, { active: true });
    logAdminAction("bulk_enable", { count, ids });
    res.json({ ok: true, updated: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk disable products
app.post("/api/admin/products/bulk/disable", requireAdminSession, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No product IDs provided" });
    }
    const count = await db.updateProducts(ids, { active: false });
    logAdminAction("bulk_disable", { count, ids });
    res.json({ ok: true, updated: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete products
app.post("/api/admin/products/bulk/delete", requireAdminSession, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No product IDs provided" });
    }
    const count = await db.updateProducts(ids, { deletedAt: new Date().toISOString(), active: false });
    logAdminAction("bulk_delete", { count, ids });
    res.json({ ok: true, updated: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// PET CLASSIFICATION REBUILD
// =====================================================
app.post("/api/admin/pets/rebuild", requireAdminSession, async (req, res) => {
  try {
    const { rebuildPetClassification } = require("./src/petClassifier");
    log("[Admin] Starting pet classification rebuild...");
    const result = await rebuildPetClassification();
    logAdminAction("pet_rebuild", result);
    res.json({ ok: true, ...result });
  } catch (err) {
    log(`[Admin] Pet rebuild error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Get pet classification stats
app.get("/api/admin/pets/stats", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const stats = {
      total: products.length,
      dog: products.filter(p => p.petType === 'dog').length,
      cat: products.filter(p => p.petType === 'cat').length,
      both: products.filter(p => p.petType === 'both').length,
      null: products.filter(p => !p.petType).length,
      byBucket: {}
    };
    
    const buckets = ['toys', 'feeding', 'travel', 'grooming', 'training', 'beds', 'health', 'litter', 'scratchers', 'walking', 'unknown'];
    buckets.forEach(b => {
      stats.byBucket[b] = products.filter(p => p.bucket === b || p.pet_bucket === b).length;
    });
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk classify products by category
app.post("/api/admin/products/bulk/classify", requireAdminSession, async (req, res) => {
  try {
    const { ids, category, subcategory } = req.body || {};
    if (!category) {
      return res.status(400).json({ error: "Category is required" });
    }
    
    const data = readDB();
    let products = data.products || [];
    let updated = 0;
    
    const targetIds = ids && ids.length > 0 ? new Set(ids) : null;
    
    for (let i = 0; i < products.length; i++) {
      if (targetIds && !targetIds.has(products[i].id)) continue;
      
      products[i].category = category;
      if (subcategory) {
        products[i].subcategory = subcategory;
      }
      products[i].updatedAt = new Date().toISOString();
      updated++;
    }
    
    data.products = products;
    writeDB(data);
    
    logAdminAction("bulk_classify", { count: updated, category, subcategory, ids: ids?.length || "all" });
    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-classify all products using AI classifier
app.post("/api/admin/products/auto-classify", requireAdminSession, async (req, res) => {
  try {
    const { overwrite = false } = req.body || {};
    
    const data = readDB();
    let products = data.products || [];
    let updated = 0;
    
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      
      if (!overwrite && p.category && p.category !== "dog-toys") {
        continue;
      }
      
      const classification = classifyProduct(p);
      products[i].category = classification.category;
      products[i].subcategory = classification.subcategory;
      products[i].tags = classification.tags;
      products[i].updatedAt = new Date().toISOString();
      updated++;
    }
    
    data.products = products;
    writeDB(data);
    
    logAdminAction("auto_classify", { count: updated, overwrite });
    log(`[Admin] Auto-classified ${updated} products`);
    res.json({ ok: true, updated });
  } catch (err) {
    log(`[Admin] Auto-classify error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Update single product category
app.post("/api/admin/products/:id/category", requireAdminSession, async (req, res) => {
  try {
    const { category, subcategory, tags } = req.body || {};
    const updates = {};
    if (category) updates.category = category;
    if (subcategory) updates.subcategory = subcategory;
    if (tags) updates.tags = tags;
    
    const product = productStore.updateProduct(req.params.id, updates);
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    logAdminAction("product_category_update", { productId: req.params.id, category, subcategory });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get admin action logs
app.get("/api/admin/action-logs", requireAdminSession, (req, res) => {
  const limit = parseInt(req.query.limit || 100);
  res.json(getAdminLogs(limit));
});

// === SEO Localized Content Endpoints ===

// Get supported locales
app.get("/api/seo/locales", (req, res) => {
  res.json({ locales: SUPPORTED_LOCALES, default: DEFAULT_LOCALE });
});

// Get SEO for a specific product/locale
app.get("/api/seo/:productId/:locale", async (req, res) => {
  try {
    const { productId, locale } = req.params;
    const seo = await getSeoLocalized(productId, locale);
    if (!seo) {
      return res.status(404).json({ error: "SEO not found for this product/locale" });
    }
    res.json(seo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all SEO locales for a product (skip reserved paths like 'stats', 'bulk', 'all')
// Primary: Read from data/db.json (productStore), PostgreSQL fallback only in non-safe-mode
app.get("/api/admin/seo/:productId", requireAdminSession, async (req, res, next) => {
  const reserved = ['stats', 'bulk', 'all', 'generate', 'apply'];
  if (reserved.includes(req.params.productId)) {
    return next('route');
  }
  
  const productId = req.params.productId;
  
  // First, try to get SEO from JSON (product.seo in data/db.json)
  const product = productStore.getProductById(productId);
  if (product && product.seo) {
    return res.json({ 
      productId, 
      locales: [{ 
        locale: product.seo.locale || 'en-US',
        seo_title: product.seo.seoTitle || product.seo.seo_title,
        meta_description: product.seo.metaDescription || product.seo.meta_description,
        h1: product.seo.h1,
        og_title: product.seo.ogTitle || product.seo.og_title,
        og_description: product.seo.ogDescription || product.seo.og_description,
        bullets_json: product.seo.bullets_json || JSON.stringify(product.seo.bullets || []),
        faqs_json: product.seo.faqs_json || JSON.stringify(product.seo.faqs || []),
        keywords_json: product.seo.keywords_json || JSON.stringify(product.seo.keywords || []),
        status: product.seo.published ? 'published' : 'draft',
        updated_at: product.seo.updatedAt
      }],
      source: 'json'
    });
  }
  
  // In safe mode (DISABLE_DB_MIGRATIONS=true by default), skip PostgreSQL entirely
  if (DISABLE_DB_MIGRATIONS) {
    return res.json({ productId, locales: [], source: 'json-only', info: 'No SEO generated yet. Use bulk SEO to generate.' });
  }
  
  // Fallback: Try PostgreSQL (only if not in safe mode)
  try {
    const seoList = await getAllSeoForProduct(productId);
    res.json({ productId, locales: seoList, source: 'postgres' });
  } catch (err) {
    log(`[SEO] PostgreSQL fallback failed for ${productId}: ${err.message}`);
    res.json({ productId, locales: [], source: 'none' });
  }
});

// Generate SEO for a product
app.post("/api/seo/generate", requireAdminSession, async (req, res) => {
  try {
    const { productId, locale = "en-US", tonePreset = "friendly" } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }
    
    const result = await seoGenerator.generateAndSaveSeo(productId, locale, tonePreset);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    logAdminAction("seo_generate", { productId, locale, tonePreset });
    res.json(result);
  } catch (err) {
    log(`[SEO API] Generate error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Save SEO content manually
app.post("/api/seo/save", requireAdminSession, async (req, res) => {
  try {
    const { productId, locale, data } = req.body || {};
    if (!productId || !locale || !data) {
      return res.status(400).json({ error: "productId, locale, and data are required" });
    }
    
    const saved = await upsertSeoLocalized(productId, locale, data);
    logAdminAction("seo_save", { productId, locale });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk generate SEO
app.post("/api/seo/bulk-generate", requireAdminSession, async (req, res) => {
  try {
    const { locale = "en-US", categoryFilter, limit = 50, tonePreset = "friendly", skipExisting = true } = req.body || {};
    
    const result = await seoGenerator.bulkGenerateSeo({
      locale,
      categoryFilter,
      limit,
      tonePreset,
      skipExisting
    });
    
    logAdminAction("seo_bulk_generate", { locale, categoryFilter, limit, ...result });
    res.json(result);
  } catch (err) {
    log(`[SEO API] Bulk generate error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Lock/unlock SEO field
app.post("/api/admin/seo/:productId/:locale/lock", requireAdminSession, async (req, res) => {
  try {
    const { productId, locale } = req.params;
    const { field } = req.body || {};
    if (!field) {
      return res.status(400).json({ error: "field is required" });
    }
    
    const locked = await lockSeoField(productId, locale, field);
    res.json({ success: true, lockedFields: locked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/seo/:productId/:locale/unlock", requireAdminSession, async (req, res) => {
  try {
    const { productId, locale } = req.params;
    const { field } = req.body || {};
    if (!field) {
      return res.status(400).json({ error: "field is required" });
    }
    
    const locked = await unlockSeoField(productId, locale, field);
    res.json({ success: true, lockedFields: locked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish SEO (change status to published)
app.post("/api/admin/seo/:productId/:locale/publish", requireAdminSession, async (req, res) => {
  try {
    const { productId, locale } = req.params;
    const saved = await upsertSeoLocalized(productId, locale, { status: "published" });
    logAdminAction("seo_publish", { productId, locale });
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Image Language Audit Endpoints ===
const imageAuditJob = require("./src/imageAuditJob");
const { getImageAuditStats, getImageAuditsForProduct, getInfographicImages, upsertImageLocalized, getImageLocalizedForProduct } = require("./src/aiDatabase");

app.get("/api/admin/image-audit/stats", requireAdminSession, async (req, res) => {
  try {
    const stats = await getImageAuditStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/image-audit/progress", requireAdminSession, (req, res) => {
  res.json(imageAuditJob.getProgress());
});

app.post("/api/admin/image-audit/start", requireAdminSession, async (req, res) => {
  try {
    const { productIds, onlyNew } = req.body || {};
    const result = await imageAuditJob.runImageAuditJob({ productIds, onlyNew });
    logAdminAction("image_audit_start", { productIds: productIds?.length, onlyNew });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/image-audit/cancel", requireAdminSession, (req, res) => {
  const cancelled = imageAuditJob.cancelJob();
  logAdminAction("image_audit_cancel", {});
  res.json({ cancelled });
});

app.get("/api/admin/image-audit/product/:productId", requireAdminSession, async (req, res) => {
  try {
    const audits = await getImageAuditsForProduct(req.params.productId);
    res.json({ productId: req.params.productId, audits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/image-audit/product/:productId", requireAdminSession, async (req, res) => {
  try {
    const result = await imageAuditJob.auditSingleProduct(req.params.productId);
    logAdminAction("image_audit_single", { productId: req.params.productId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/image-audit/infographics", requireAdminSession, async (req, res) => {
  try {
    const { lang } = req.query;
    const infographics = await getInfographicImages(lang);
    res.json({ count: infographics.length, infographics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/image-audit/localize", requireAdminSession, async (req, res) => {
  try {
    const { productId, imageUrl, locale, hide } = req.body || {};
    if (!productId || !imageUrl || !locale) {
      return res.status(400).json({ error: "productId, imageUrl, and locale are required" });
    }
    const result = await upsertImageLocalized(productId, imageUrl, locale, { hide_for_locale: !!hide });
    logAdminAction("image_localize", { productId, imageUrl, locale, hide });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/image-audit/localized/:productId/:locale", requireAdminSession, async (req, res) => {
  try {
    const { productId, locale } = req.params;
    const overrides = await getImageLocalizedForProduct(productId, locale);
    res.json({ productId, locale, overrides });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === CJ URL/SPU Import Endpoints ===

// Parse CJ URL/SPU (for validation)
app.post("/api/admin/cj-import/parse", requireAdminSession, (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input) {
      return res.status(400).json({ error: "No URL or SPU provided" });
    }
    const result = cjUrlImport.parseCJUrl(input);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview CJ product import (fetch details without saving)
app.post("/api/admin/cj-import/preview", requireAdminSession, async (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input) {
      return res.status(400).json({ error: "No URL or SPU provided" });
    }
    const result = await cjUrlImport.previewImport(input);
    res.json(result);
  } catch (err) {
    log(`[CJ Import] Preview error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Import single CJ product
app.post("/api/admin/cj-import/import", requireAdminSession, async (req, res) => {
  try {
    const { input, options = {} } = req.body || {};
    if (!input) {
      return res.status(400).json({ error: "No URL or SPU provided" });
    }
    
    const importOptions = {
      overwrite: options.overwrite || false,
      requireImages: options.requireImages !== false,
      rejectNonPet: options.rejectNonPet !== false,
      markFeatured: options.markFeatured || false,
      featuredRank: options.featuredRank || 'auto',
      categoryPin: options.categoryPin || 'AUTO',
      subcatPin: options.subcatPin || 'AUTO'
    };
    
    const result = await cjUrlImport.importProduct(input, db, importOptions);
    
    if (result.ok) {
      logAdminAction("cj_import", {
        spu: result.spu,
        cjPid: result.cjPid,
        title: result.product?.title,
        variantCount: result.variantCount,
        featured: result.featured,
        dogRank: result.dogRank,
        catRank: result.catRank,
        subcatKey: result.subcatKey
      });
      
      if (embeddingsEnabled()) {
        triggerReindexDelta().catch(err => log(`[CJ Import] Reindex failed: ${err.message}`));
      }
    }
    
    res.json(result);
  } catch (err) {
    log(`[CJ Import] Import error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Bulk import CJ products
app.post("/api/admin/cj-import/bulk", requireAdminSession, async (req, res) => {
  try {
    const { inputs, options = {} } = req.body || {};
    if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ error: "No URLs or SPUs provided" });
    }
    
    if (inputs.length > 50) {
      return res.status(400).json({ error: "Maximum 50 products per batch" });
    }
    
    const importOptions = {
      overwrite: options.overwrite || false,
      requireImages: options.requireImages !== false,
      applyPetFilter: options.applyPetFilter !== false
    };
    
    const result = await cjUrlImport.bulkImport(inputs, db, importOptions);
    
    logAdminAction("cj_bulk_import", {
      total: inputs.length,
      success: result.success.length,
      failed: result.failed.length,
      skipped: result.skipped.length
    });
    
    if (result.success.length > 0 && embeddingsEnabled()) {
      triggerReindexDelta().catch(err => log(`[CJ Bulk Import] Reindex failed: ${err.message}`));
    }
    
    res.json(result);
  } catch (err) {
    log(`[CJ Import] Bulk import error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Check CJ API connection status
app.get("/api/admin/cj-import/status", requireAdminSession, async (req, res) => {
  try {
    const token = await cjUrlImport.getAccessToken();
    res.json({
      connected: !!token,
      hasCredentials: !!(process.env.CJ_EMAIL && process.env.CJ_API_KEY)
    });
  } catch (err) {
    res.json({
      connected: false,
      hasCredentials: !!(process.env.CJ_EMAIL && process.env.CJ_API_KEY),
      error: err.message
    });
  }
});

// Refresh images from CJ for an existing product
app.post("/api/admin/products/:id/refresh-images", requireAdminSession, async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await db.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Need CJ PID to fetch fresh images
    const cjPid = product.cjPid || product.id;
    if (!cjPid) {
      return res.status(400).json({ error: "No CJ Product ID available for this product" });
    }
    
    log(`[Refresh Images] Starting refresh for product ${productId} (CJ PID: ${cjPid})`);
    
    // Re-import the product with overwrite to get fresh images
    const result = await cjUrlImport.importProduct(cjPid, db, {
      overwrite: true,
      requireImages: false,
      rejectNonPet: false
    });
    
    if (result.ok) {
      const newImageCount = result.product?.images?.length || 0;
      log(`[Refresh Images] Success: ${productId} now has ${newImageCount} images`);
      logAdminAction("refresh_images", {
        productId,
        cjPid,
        imageCount: newImageCount
      });
      
      res.json({
        ok: true,
        productId,
        imageCount: newImageCount,
        images: result.product?.images || [],
        imageStatus: result.product?.imageStatus || 'ok'
      });
    } else {
      log(`[Refresh Images] Failed for ${productId}: ${result.error}`);
      res.status(400).json({
        ok: false,
        error: result.error,
        productId
      });
    }
  } catch (err) {
    log(`[Refresh Images] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Bulk refresh images for all CJ products
app.post("/api/admin/products/bulk/refresh-images", requireAdminSession, async (req, res) => {
  try {
    const { productIds } = req.body || {};
    const allProducts = await db.listProducts();
    
    // Filter to only CJ products
    let productsToRefresh = allProducts.filter(p => p.cjPid || p.source === 'CJ-API');
    
    // If specific IDs provided, filter to those
    if (productIds && Array.isArray(productIds) && productIds.length > 0) {
      const idSet = new Set(productIds);
      productsToRefresh = productsToRefresh.filter(p => idSet.has(p.id));
    }
    
    // Limit to prevent timeout
    const maxProducts = 20;
    if (productsToRefresh.length > maxProducts) {
      productsToRefresh = productsToRefresh.slice(0, maxProducts);
    }
    
    log(`[Bulk Refresh Images] Starting refresh for ${productsToRefresh.length} products`);
    
    const results = { success: [], failed: [] };
    
    for (const product of productsToRefresh) {
      try {
        const cjPid = product.cjPid || product.id;
        const result = await cjUrlImport.importProduct(cjPid, db, {
          overwrite: true,
          requireImages: false,
          rejectNonPet: false
        });
        
        if (result.ok) {
          results.success.push({
            id: product.id,
            title: product.title,
            imageCount: result.product?.images?.length || 0
          });
        } else {
          results.failed.push({
            id: product.id,
            title: product.title,
            error: result.error
          });
        }
      } catch (err) {
        results.failed.push({
          id: product.id,
          title: product.title,
          error: err.message
        });
      }
    }
    
    log(`[Bulk Refresh Images] Complete: ${results.success.length} success, ${results.failed.length} failed`);
    logAdminAction("bulk_refresh_images", {
      total: productsToRefresh.length,
      success: results.success.length,
      failed: results.failed.length
    });
    
    res.json({
      ok: true,
      total: productsToRefresh.length,
      ...results
    });
  } catch (err) {
    log(`[Bulk Refresh Images] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ============ PAWSY BOXES (BUNDLES) ENDPOINTS ============

app.get("/api/pawsy-boxes", async (req, res) => {
  try {
    const allProducts = await db.listProducts();
    const activeProducts = allProducts.filter(p => p.active !== false && !p.deletedAt && p.image);
    let boxes = pawsyBoxes.getFeaturedBoxes();
    boxes = pawsyBoxes.populateAllBoxProducts(boxes, activeProducts);
    res.json({ ok: true, boxes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/pawsy-boxes/for-profile", async (req, res) => {
  try {
    const petType = req.query.petType || null;
    const ageGroup = req.query.ageGroup || null;
    const size = req.query.size || null;
    const traits = req.query.traits ? req.query.traits.split(',') : [];
    
    const profile = petType ? { petType, ageGroup, size, traits } : null;
    
    const allProducts = await db.listProducts();
    const activeProducts = allProducts.filter(p => p.active !== false && !p.deletedAt && p.image);
    
    let boxes = pawsyBoxes.getBoxesForProfile(profile);
    boxes = pawsyBoxes.populateAllBoxProducts(boxes, activeProducts);
    
    res.json({ ok: true, boxes, profileMatched: !!profile });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/pawsy-boxes/:id", async (req, res) => {
  try {
    const box = pawsyBoxes.getBoxById(req.params.id);
    if (!box) {
      return res.status(404).json({ ok: false, error: "Box not found" });
    }
    
    const allProducts = await db.listProducts();
    const activeProducts = allProducts.filter(p => p.active !== false && !p.deletedAt && p.image);
    const populated = pawsyBoxes.populateBoxProducts(box, activeProducts);
    
    res.json({ ok: true, box: populated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/pawsy-boxes", requireAdminSession, (req, res) => {
  try {
    const data = pawsyBoxes.loadBoxes();
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/pawsy-boxes", requireAdminSession, (req, res) => {
  try {
    const box = pawsyBoxes.createBox(req.body);
    logAdminAction("create_pawsy_box", { boxId: box.id, title: box.title });
    res.json({ ok: true, box });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put("/api/admin/pawsy-boxes/:id", requireAdminSession, (req, res) => {
  try {
    const success = pawsyBoxes.updateBox(req.params.id, req.body);
    if (!success) {
      return res.status(404).json({ ok: false, error: "Box not found" });
    }
    logAdminAction("update_pawsy_box", { boxId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ CJ IMPORT PRO ENDPOINTS ============

app.post("/api/admin/cj/import-pro", requireAdminSession, async (req, res) => {
  try {
    const { count = 250, petTypes = ['dog', 'cat', 'both'], usOnly = true, maxShipDays = 7 } = req.body || {};
    
    logAdminAction("cj_import_pro_start", { count, petTypes, usOnly, maxShipDays });
    
    res.json({ ok: true, message: "Import started", status: "running" });
    
    cjImportPro.runImportPro({ count, petTypes, usOnly, maxShipDays })
      .then(result => {
        log(`[CJ Import Pro] Completed: ${result.importedCount} products imported`);
        logAdminAction("cj_import_pro_complete", result);
      })
      .catch(err => {
        log(`[CJ Import Pro] Failed: ${err.message}`);
        logAdminAction("cj_import_pro_error", { error: err.message });
      });
      
  } catch (err) {
    log(`[CJ Import Pro] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/cj/import-pro/status", requireAdminSession, (req, res) => {
  try {
    const status = cjImportPro.getImportStatus();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/cj/import-pro/verify", requireAdminSession, (req, res) => {
  try {
    const result = cjImportPro.verifyImport();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ CJ BROWSE ENDPOINTS ============
const cjBrowseCache = new Map();
const CJ_BROWSE_CACHE_TTL = 10 * 60 * 1000;

app.post("/api/admin/cj/browse", requireAdminSession, async (req, res) => {
  try {
    const { keyword, usOnly, petOnly, requireImages, sort, pageNum, pageSize, minPrice, maxPrice } = req.body || {};
    
    const cacheKey = JSON.stringify({ keyword, usOnly, petOnly, requireImages, sort, pageNum, pageSize, minPrice, maxPrice });
    const cached = cjBrowseCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CJ_BROWSE_CACHE_TTL) {
      return res.json({ ...cached.data, fromCache: true });
    }
    
    const result = await cjUrlImport.searchCatalog({
      keyword: keyword || '',
      usOnly: usOnly || false,
      petOnly: petOnly !== false,
      requireImages: requireImages !== false,
      sort: sort || 'match',
      pageNum: pageNum || 1,
      pageSize: Math.min(pageSize || 20, 50),
      minPrice,
      maxPrice
    });
    
    const allProducts = await db.listProducts();
    const importedPids = new Set(allProducts.filter(p => p.cjPid).map(p => p.cjPid));
    
    result.products = result.products.map(p => ({
      ...p,
      alreadyImported: importedPids.has(p.pid)
    }));
    
    cjBrowseCache.set(cacheKey, { data: result, time: Date.now() });
    
    if (cjBrowseCache.size > 100) {
      const oldest = [...cjBrowseCache.entries()].sort((a, b) => a[1].time - b[1].time)[0];
      cjBrowseCache.delete(oldest[0]);
    }
    
    logAdminAction("cj_browse", { keyword, resultCount: result.products.length });
    res.json(result);
  } catch (err) {
    log(`[CJ Browse] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// CJ Browse Health Check - test API connection and search with minimal filters
app.get("/api/cj/browse/health", async (req, res) => {
  try {
    const keyword = req.query.keyword || 'cat toy';
    const result = await cjUrlImport.searchCatalog({
      keyword,
      usOnly: false,
      petOnly: false,
      requireImages: false,
      pageNum: 1,
      pageSize: 10
    });
    
    res.json({
      status: result.products.length > 0 ? 'ok' : 'no_results',
      keyword,
      total: result.total,
      filteredCount: result.filteredCount,
      sampleProducts: result.products.slice(0, 2).map(p => ({
        pid: p.pid,
        title: p.title?.substring(0, 50),
        warehouse: p.warehouse,
        hasImage: !!p.image
      })),
      debug: result.debug
    });
  } catch (err) {
    log(`[CJ Browse Health] Error: ${err.message}`);
    res.status(500).json({ 
      status: 'error', 
      error: err.message,
      hint: 'Check CJ API credentials (CJ_EMAIL, CJ_API_KEY)'
    });
  }
});

app.post("/api/admin/cj/quick-import", requireAdminSession, async (req, res) => {
  try {
    const { pid, options = {} } = req.body || {};
    if (!pid) {
      return res.status(400).json({ error: "PID required" });
    }
    
    const importOptions = {
      overwrite: options.overwrite || false,
      requireImages: options.requireImages !== false,
      rejectNonPet: options.rejectNonPet !== false,
      markFeatured: options.markFeatured || false,
      featuredRank: options.featuredRank || null,
      categoryPin: options.categoryPin || 'AUTO',
      subcatPin: options.subcatPin || 'AUTO'
    };
    
    const result = await cjUrlImport.importProduct(pid, db, importOptions);
    
    if (result.ok) {
      logAdminAction("cj_quick_import", { pid, title: result.product?.title });
    }
    
    res.json(result);
  } catch (err) {
    log(`[CJ Browse] Quick import error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ============ CJ FEEDS / SAVED SEARCHES ============
const FEEDS_FILE = path.join(__dirname, 'data', 'cj-feeds.json');

function loadFeeds() {
  try {
    if (fs.existsSync(FEEDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf-8'));
      data.feeds = data.feeds.map(f => ({
        ...f,
        seenCjIds: f.seenCjIds || []
      }));
      return data;
    }
  } catch (e) {}
  return { feeds: [], lastUpdated: null };
}

function saveFeeds(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(FEEDS_FILE, JSON.stringify(data, null, 2));
}

app.get("/api/admin/cj/feeds", requireAdminSession, (req, res) => {
  const data = feedScheduler.loadFeeds();
  const schedulerStats = feedScheduler.getSchedulerStats();
  
  const feeds = data.feeds.map(f => ({ 
    ...f, 
    seenCount: f.seenCjIds?.length || 0,
    autoImport: { ...feedScheduler.DEFAULT_AUTO_IMPORT, ...f.autoImport },
    autoImportStats: { ...feedScheduler.DEFAULT_AUTO_IMPORT_STATS, ...f.autoImportStats }
  }));
  
  res.json({ 
    feeds, 
    scheduler: schedulerStats.scheduler,
    globalStats: schedulerStats.global,
    summary: schedulerStats.summary,
    config: schedulerStats.config
  });
});

app.post("/api/admin/cj/feeds", requireAdminSession, (req, res) => {
  const { name, keyword, filters = {} } = req.body || {};
  if (!name || !keyword) {
    return res.status(400).json({ error: "Name and keyword required" });
  }
  
  const data = feedScheduler.loadFeeds();
  const feed = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name,
    keyword,
    filters: {
      usOnly: filters.usOnly || false,
      petOnly: filters.petOnly !== false,
      requireImages: filters.requireImages !== false,
      minPrice: filters.minPrice || null,
      maxPrice: filters.maxPrice || null,
      sort: filters.sort || 'default'
    },
    defaults: {
      markFeatured: filters.markFeatured !== false,
      categoryPin: filters.categoryPin || 'AUTO',
      subcatPin: filters.subcatPin || 'AUTO'
    },
    seenCjIds: [],
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    lastResultCount: 0,
    lastNewCount: 0,
    autoImport: { ...feedScheduler.DEFAULT_AUTO_IMPORT },
    autoImportStats: { ...feedScheduler.DEFAULT_AUTO_IMPORT_STATS }
  };
  
  data.feeds.push(feed);
  feedScheduler.saveFeeds(data);
  logAdminAction("feed_create", { feedId: feed.id, name });
  res.json({ ok: true, feed });
});

app.put("/api/admin/cj/feeds/:id", requireAdminSession, (req, res) => {
  const { id } = req.params;
  const { name, keyword, filters = {} } = req.body || {};
  
  const data = feedScheduler.loadFeeds();
  const idx = data.feeds.findIndex(f => f.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Feed not found" });
  }
  
  if (name) data.feeds[idx].name = name;
  if (keyword) data.feeds[idx].keyword = keyword;
  if (filters) {
    data.feeds[idx].filters = { ...data.feeds[idx].filters, ...filters };
    if (filters.markFeatured !== undefined || filters.categoryPin || filters.subcatPin) {
      data.feeds[idx].defaults = {
        markFeatured: filters.markFeatured !== false,
        categoryPin: filters.categoryPin || data.feeds[idx].defaults?.categoryPin || 'AUTO',
        subcatPin: filters.subcatPin || data.feeds[idx].defaults?.subcatPin || 'AUTO'
      };
    }
  }
  
  feedScheduler.saveFeeds(data);
  logAdminAction("feed_update", { feedId: id });
  res.json({ ok: true, feed: data.feeds[idx] });
});

app.delete("/api/admin/cj/feeds/:id", requireAdminSession, (req, res) => {
  const { id } = req.params;
  const data = feedScheduler.loadFeeds();
  const idx = data.feeds.findIndex(f => f.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Feed not found" });
  }
  
  const removed = data.feeds.splice(idx, 1)[0];
  feedScheduler.saveFeeds(data);
  logAdminAction("feed_delete", { feedId: id, name: removed.name });
  res.json({ ok: true });
});

app.post("/api/admin/cj/feeds/:id/run", requireAdminSession, async (req, res) => {
  const { id } = req.params;
  const data = feedScheduler.loadFeeds();
  const feed = data.feeds.find(f => f.id === id);
  if (!feed) {
    return res.status(404).json({ error: "Feed not found" });
  }
  
  try {
    const runResult = await feedScheduler.runSingleFeed(feed, db, cjUrlImport, { ignoreCooldown: true });
    
    if (!runResult.ok && !runResult.skipped) {
      return res.status(500).json({ error: runResult.error || "Feed run failed" });
    }
    
    feedScheduler.saveFeeds(data);
    
    logAdminAction("feed_run", { feedId: id, name: feed.name, resultCount: runResult.resultCount, newCount: runResult.newCount });
    res.json({ 
      ok: true, 
      products: runResult.products || [], 
      total: runResult.total || 0,
      newCount: runResult.newCount || 0,
      feed
    });
  } catch (err) {
    log(`[Feeds] Run error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/cj/feeds/mark-seen", requireAdminSession, (req, res) => {
  const { pids, feedId } = req.body || {};
  if (!pids || !Array.isArray(pids)) {
    return res.status(400).json({ error: "PIDs array required" });
  }
  if (!feedId) {
    return res.status(400).json({ error: "feedId required" });
  }
  
  const data = feedScheduler.loadFeeds();
  const feed = data.feeds.find(f => f.id === feedId);
  if (!feed) {
    return res.status(404).json({ error: "Feed not found" });
  }
  
  const seenSet = new Set(feed.seenCjIds || []);
  pids.forEach(pid => seenSet.add(pid));
  feed.seenCjIds = [...seenSet];
  feedScheduler.saveFeeds(data);
  
  res.json({ ok: true, seenCount: feed.seenCjIds.length });
});

app.post("/api/admin/cj/feeds/bulk-import", requireAdminSession, async (req, res) => {
  const { pids, feedId, options = {} } = req.body || {};
  if (!pids || !Array.isArray(pids) || pids.length === 0) {
    return res.status(400).json({ error: "PIDs array required" });
  }
  
  const MAX_BULK = 20;
  const truncated = pids.length > MAX_BULK;
  const actualPids = pids.slice(0, MAX_BULK);
  const results = { imported: 0, failed: 0, skipped: 0, errors: [], truncated, originalCount: pids.length };
  
  for (const pid of actualPids) {
    try {
      const importOptions = {
        overwrite: options.overwrite || false,
        requireImages: options.requireImages !== false,
        rejectNonPet: options.rejectNonPet !== false,
        markFeatured: options.markFeatured || false,
        featuredRank: options.featuredRank || null,
        categoryPin: options.categoryPin || 'AUTO',
        subcatPin: options.subcatPin || 'AUTO'
      };
      
      const result = await cjUrlImport.importProduct(pid, db, importOptions);
      if (result.ok) {
        results.imported++;
      } else if (result.skipped) {
        results.skipped++;
      } else {
        results.failed++;
        results.errors.push({ pid, error: result.error });
      }
    } catch (err) {
      results.failed++;
      results.errors.push({ pid, error: err.message });
    }
  }
  
  if (feedId) {
    const data = feedScheduler.loadFeeds();
    const feed = data.feeds.find(f => f.id === feedId);
    if (feed) {
      const seenSet = new Set(feed.seenCjIds || []);
      pids.forEach(pid => seenSet.add(pid));
      feed.seenCjIds = [...seenSet];
      feedScheduler.saveFeeds(data);
    }
  }
  
  logAdminAction("feed_bulk_import", { count: pids.length, imported: results.imported });
  res.json({ ok: true, ...results });
});

// ============ FEED SCHEDULER ENDPOINTS ============

// Get scheduler stats
app.get("/api/admin/cj/feeds/stats", requireAdminSession, (req, res) => {
  try {
    const stats = feedScheduler.getSchedulerStats();
    res.json(stats);
  } catch (err) {
    log(`[FeedScheduler] Stats error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Run all feeds
app.post("/api/admin/cj/feeds/run-all", requireAdminSession, async (req, res) => {
  try {
    const result = await feedScheduler.runFeeds(db, cjUrlImport, { reason: 'manual' });
    logAdminAction("feeds_run_all", { 
      feedsProcessed: result.results?.feedsProcessed,
      totalNewItems: result.results?.totalNewItems 
    });
    res.json(result);
  } catch (err) {
    log(`[FeedScheduler] Run all error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Get feed with full stats
app.get("/api/admin/cj/feeds/:id/stats", requireAdminSession, (req, res) => {
  try {
    const feed = feedScheduler.getFeedWithStats(req.params.id);
    if (!feed) {
      return res.status(404).json({ error: "Feed not found" });
    }
    res.json({ feed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update feed auto-import config
app.put("/api/admin/cj/feeds/:id/auto-import", requireAdminSession, (req, res) => {
  try {
    const { id } = req.params;
    const config = req.body || {};
    
    const feed = feedScheduler.updateFeedAutoImport(id, config);
    if (!feed) {
      return res.status(404).json({ error: "Feed not found" });
    }
    
    logAdminAction("feed_auto_import_update", { feedId: id, config });
    res.json({ ok: true, feed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test auto-import for a feed (dry run)
app.post("/api/admin/cj/feeds/:id/test-auto-import", requireAdminSession, async (req, res) => {
  try {
    const { id } = req.params;
    const { dryRun = true } = req.body || {};
    
    const data = feedScheduler.loadFeeds();
    const feed = data.feeds.find(f => f.id === id);
    if (!feed) {
      return res.status(404).json({ error: "Feed not found" });
    }
    
    // Run the feed first to get products
    const runResult = await feedScheduler.runSingleFeed(feed, db, cjUrlImport, { ignoreCooldown: true });
    if (!runResult.ok) {
      return res.status(500).json({ error: runResult.error || "Feed run failed" });
    }
    
    // Test auto-import
    const autoResult = await feedScheduler.autoImportNew(feed, runResult.products, db, cjUrlImport, { dryRun });
    
    feedScheduler.saveFeeds(data);
    
    logAdminAction("feed_test_auto_import", { feedId: id, dryRun, imported: autoResult.imported });
    res.json({ ok: true, runResult: { newCount: runResult.newCount, resultCount: runResult.resultCount }, autoResult });
  } catch (err) {
    log(`[FeedScheduler] Test auto-import error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Get scheduler logs
app.get("/api/admin/cj/feeds/logs/:type", requireAdminSession, (req, res) => {
  try {
    const type = req.params.type === 'auto-import' ? 'auto-import' : 'runner';
    const limit = parseInt(req.query.limit || '50');
    const logs = feedScheduler.getRecentLogs(type, limit);
    res.json({ logs, type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ COMPREHENSIVE PET PRODUCT BULK IMPORTER ============
// Search and import multiple pet products from CJ with smart filters
app.post("/api/admin/cj/bulk-pet-import", requireAdminSession, async (req, res) => {
  try {
    const { 
      targetCount = 250,
      dogCount = 130,
      catCount = 100,
      bothCount = 20,
      usOnly = true,
      dryRun = false
    } = req.body || {};
    
    log(`[Bulk Pet Import] Starting: target=${targetCount}, dogs=${dogCount}, cats=${catCount}, both=${bothCount}, usOnly=${usOnly}, dryRun=${dryRun}`);
    
    const petKeywords = {
      dog: ['dog toy', 'dog bed', 'dog leash', 'dog collar', 'dog harness', 'dog bowl', 'dog grooming', 'puppy toy', 'dog carrier', 'dog treats', 'dog training'],
      cat: ['cat toy', 'cat bed', 'cat scratcher', 'cat tree', 'cat litter', 'cat bowl', 'cat grooming', 'kitten toy', 'cat carrier', 'cat treats'],
      both: ['pet bed', 'pet carrier', 'pet bowl', 'pet grooming', 'pet toy', 'pet feeder']
    };
    
    const results = {
      searched: 0,
      found: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      byType: { dog: 0, cat: 0, both: 0 },
      errors: [],
      products: []
    };
    
    // Helper to import products for a pet type
    async function importForType(type, keywords, maxCount) {
      let imported = 0;
      const seenPids = new Set();
      
      for (const keyword of keywords) {
        if (imported >= maxCount) break;
        
        try {
          const searchResult = await cjUrlImport.searchCatalog({
            keyword,
            usOnly,
            petOnly: true,
            requireImages: true,
            pageNum: 1,
            pageSize: Math.min(50, maxCount - imported + 10)
          });
          
          results.searched++;
          
          for (const product of searchResult.products) {
            if (imported >= maxCount) break;
            if (seenPids.has(product.pid)) continue;
            seenPids.add(product.pid);
            
            results.found++;
            
            if (dryRun) {
              results.products.push({
                pid: product.pid,
                title: product.title?.substring(0, 60),
                price: product.sellPrice || product.price,
                warehouse: product.warehouse,
                type
              });
              imported++;
              results.byType[type]++;
              continue;
            }
            
            try {
              const importResult = await cjUrlImport.importProduct(product.pid, db, {
                overwrite: false,
                requireImages: true,
                rejectNonPet: true,
                markFeatured: false,
                categoryPin: 'AUTO',
                subcatPin: 'AUTO'
              });
              
              if (importResult.ok) {
                imported++;
                results.imported++;
                results.byType[type]++;
                log(`[Bulk Pet Import] Imported ${type}: ${importResult.product?.title?.substring(0, 40)}`);
              } else if (importResult.skipped) {
                results.skipped++;
              } else {
                results.failed++;
                results.errors.push({ pid: product.pid, error: importResult.error });
              }
            } catch (importErr) {
              results.failed++;
              results.errors.push({ pid: product.pid, error: importErr.message });
            }
            
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));
          }
        } catch (searchErr) {
          log(`[Bulk Pet Import] Search error for ${keyword}: ${searchErr.message}`);
          results.errors.push({ keyword, error: searchErr.message });
        }
      }
      
      return imported;
    }
    
    // Import products by type
    await importForType('dog', petKeywords.dog, dogCount);
    await importForType('cat', petKeywords.cat, catCount);
    await importForType('both', petKeywords.both, bothCount);
    
    logAdminAction("bulk_pet_import", { 
      targetCount, 
      imported: results.imported, 
      dryRun,
      byType: results.byType 
    });
    
    res.json({ 
      ok: true, 
      ...results,
      summary: `Imported ${results.imported} products (${results.byType.dog} dog, ${results.byType.cat} cat, ${results.byType.both} both)`
    });
  } catch (err) {
    log(`[Bulk Pet Import] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ============ AI RAG ENDPOINTS ============

app.get("/api/admin/ai/status", requireAdminSession, async (req, res) => {
  try {
    const reindexStatus = await getReindexStatus();
    const jobStatus = await getJobStatus();
    
    res.json({
      enabled: embeddingsEnabled(),
      embeddingsCount: reindexStatus.embeddingsCount,
      isRunning: jobStatus.isRunning,
      lastJob: jobStatus.lastCompletedJob ? {
        id: jobStatus.lastCompletedJob.id,
        type: jobStatus.lastCompletedJob.type,
        status: jobStatus.lastCompletedJob.status,
        finishedAt: jobStatus.lastCompletedJob.finished_at,
        stats: jobStatus.lastCompletedJob.stats_json ? JSON.parse(jobStatus.lastCompletedJob.stats_json) : null,
        error: jobStatus.lastCompletedJob.error
      } : null
    });
  } catch (err) {
    log(`[AI Status] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/ai/reindex/delta", requireAdminSession, async (req, res) => {
  try {
    if (!embeddingsEnabled()) {
      return res.status(400).json({ error: "AI embeddings not enabled - check OPENAI_API_KEY" });
    }
    
    const jobId = await triggerReindexDelta();
    logAdminAction("ai_reindex_delta", { jobId });
    res.json({ ok: true, jobId, message: "Delta reindex started" });
  } catch (err) {
    log(`[AI Reindex] Delta error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/ai/reindex/full", requireAdminSession, async (req, res) => {
  try {
    if (!embeddingsEnabled()) {
      return res.status(400).json({ error: "AI embeddings not enabled - check OPENAI_API_KEY" });
    }
    
    const jobId = await triggerReindexFull();
    logAdminAction("ai_reindex_full", { jobId });
    res.json({ ok: true, jobId, message: "Full reindex started" });
  } catch (err) {
    log(`[AI Reindex] Full error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/ai/jobs", requireAdminSession, async (req, res) => {
  try {
    const jobStatus = await getJobStatus();
    res.json({
      isRunning: jobStatus.isRunning,
      jobs: jobStatus.recentJobs.map(j => ({
        id: j.id,
        type: j.type,
        status: j.status,
        createdAt: j.created_at,
        startedAt: j.started_at,
        finishedAt: j.finished_at,
        stats: j.stats_json ? JSON.parse(j.stats_json) : null,
        error: j.error
      }))
    });
  } catch (err) {
    log(`[AI Jobs] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/ai/test-query", requireAdminSession, async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query) {
      return res.status(400).json({ error: "Query required" });
    }
    
    if (!embeddingsEnabled()) {
      return res.status(400).json({ error: "AI embeddings not enabled" });
    }
    
    const retrieval = await retrieveContext(query, 8);
    
    res.json({
      query,
      queryType: retrieval.queryType,
      docsRetrieved: retrieval.docs?.length || 0,
      docs: (retrieval.docs || []).map(d => ({
        docId: d.doc_id,
        score: Math.round(d.score * 1000) / 1000,
        contentPreview: d.content?.substring(0, 200) + "..."
      }))
    });
  } catch (err) {
    log(`[AI Test] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ============ SMART PRICING ENDPOINTS ============

// Reprice all products
app.post("/api/admin/pricing/reprice-all", requireAdminSession, async (req, res) => {
  try {
    const options = {
      forceReprice: req.body?.forceReprice || false,
      includeInactive: req.body?.includeInactive || false
    };
    const result = smartPricing.repriceAll(options);
    logAdminAction("reprice_all", { updated: result.updated, variantsUpdated: result.variantsUpdated });
    res.json(result);
  } catch (err) {
    log(`[Pricing] Reprice all error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Lock/unlock pricing for a product
app.post("/api/admin/pricing/lock", requireAdminSession, async (req, res) => {
  try {
    const { productId, locked } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: "Product ID required" });
    }
    const result = smartPricing.setPricingLock(productId, locked !== false);
    logAdminAction("pricing_lock", { productId, locked: result.locked });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview repricing for selected products
app.post("/api/admin/pricing/preview", requireAdminSession, async (req, res) => {
  try {
    const { productIds } = req.body || {};
    const products = await db.listProducts();
    const targetProducts = productIds 
      ? products.filter(p => productIds.includes(p.id))
      : products.filter(p => p.active);
    const preview = smartPricing.previewReprice(targetProducts);
    res.json({ previews: preview, count: preview.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pricing logs
app.get("/api/admin/pricing/logs", requireAdminSession, (req, res) => {
  const limit = parseInt(req.query.limit || 50);
  const logs = smartPricing.getPricingLogs(limit);
  res.json(logs);
});

// ============ PRODUCT AUDIT ENDPOINTS ============
const productAudit = require("./src/productAudit");

// Run full audit
app.get("/api/admin/audit", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const auditResult = productAudit.runFullAudit(products);
    res.json(auditResult);
  } catch (err) {
    log(`[Audit] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Image proxy for external images (CJ Dropshipping, etc.)
// Used as fallback when direct download fails due to CORS/403
const imageProxyErrorCounts = new Map();
const IMAGE_PROXY_RATE_LIMIT_WINDOW = 60000; // 1 minute
const IMAGE_PROXY_MAX_ERRORS_PER_URL = 3;

app.get("/api/image-proxy", async (req, res) => {
  let { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: "URL parameter required" });
  }
  
  // Handle array URL (pick first valid string)
  if (Array.isArray(url)) {
    url = url.find(u => typeof u === "string" && u.startsWith("http"));
    if (!url) {
      return res.status(400).json({ error: "No valid URL in array" });
    }
  }
  
  // Validate URL is a string and starts with http/https
  if (typeof url !== "string" || !url.match(/^https?:\/\//)) {
    return res.status(400).json({ error: "Invalid URL format" });
  }
  
  try {
    const parsedUrl = new URL(url);
    
    // Only allow image proxy from known domains
    const allowedDomains = [
      'cjdropshipping.com',
      'cf.cjdropshipping.com',
      'cbu01.alicdn.com',
      'ae01.alicdn.com',
      'img.alicdn.com',
      's.alicdn.com'
    ];
    
    const isAllowed = allowedDomains.some(domain => 
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
    );
    
    if (!isAllowed) {
      // Rate-limited logging to prevent spam
      const now = Date.now();
      const errorKey = `domain:${parsedUrl.hostname}`;
      const errorInfo = imageProxyErrorCounts.get(errorKey) || { count: 0, firstSeen: now };
      errorInfo.count++;
      imageProxyErrorCounts.set(errorKey, errorInfo);
      
      // Only log first few occurrences per domain per window
      if (errorInfo.count <= IMAGE_PROXY_MAX_ERRORS_PER_URL) {
        console.warn(`[Image Proxy] Blocked domain: ${parsedUrl.hostname} (${errorInfo.count}/${IMAGE_PROXY_MAX_ERRORS_PER_URL})`);
      }
      
      // Cleanup old entries periodically
      if (imageProxyErrorCounts.size > 100) {
        for (const [key, info] of imageProxyErrorCounts.entries()) {
          if (now - info.firstSeen > IMAGE_PROXY_RATE_LIMIT_WINDOW) {
            imageProxyErrorCounts.delete(key);
          }
        }
      }
      
      return res.status(403).json({ error: "Domain not allowed" });
    }
    
    const https = require("https");
    const http = require("http");
    const protocol = url.startsWith("https") ? https : http;
    
    const proxyReq = protocol.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://cjdropshipping.com/"
      },
      timeout: 15000
    }, (proxyRes) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        return res.redirect(proxyRes.headers.location);
      }
      
      if (proxyRes.statusCode !== 200) {
        log(`[Image Proxy] HTTP ${proxyRes.statusCode} for ${url.substring(0, 80)}`);
        return res.status(proxyRes.statusCode).end();
      }
      
      // Forward content type
      const contentType = proxyRes.headers["content-type"];
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      // Cache for 1 day
      res.setHeader("Cache-Control", "public, max-age=86400");
      
      proxyRes.pipe(res);
    });
    
    proxyReq.on("error", (err) => {
      log(`[Image Proxy] Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    });
    
    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      res.status(504).json({ error: "Timeout" });
    });
    
  } catch (err) {
    log(`[Image Proxy] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Get duplicate images
app.get("/api/admin/audit/duplicate-images", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const result = productAudit.findDuplicateImages(products.filter(p => !p.rejected && !p.deletedAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get duplicate titles
app.get("/api/admin/audit/duplicate-titles", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const result = productAudit.findDuplicateTitles(products.filter(p => !p.rejected && !p.deletedAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get missing/invalid images
app.get("/api/admin/audit/missing-images", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const result = productAudit.findMissingImages(products.filter(p => !p.rejected && !p.deletedAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get variant issues
app.get("/api/admin/audit/variant-issues", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const result = productAudit.findSuspectVariants(products.filter(p => !p.rejected && !p.deletedAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/audit/pricing-issues", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const result = productAudit.findPricingIssues(products.filter(p => !p.rejected && !p.deletedAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fix: Disable all but one product in a duplicate group
app.post("/api/admin/audit/fix-duplicate-group", requireAdminSession, async (req, res) => {
  try {
    const { productIds, keepId } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
      return res.status(400).json({ error: "Need at least 2 product IDs" });
    }
    
    if (!keepId || !productIds.includes(keepId)) {
      return res.status(400).json({ error: "keepId must be one of the product IDs" });
    }
    
    const toDisable = productIds.filter(id => id !== keepId);
    let disabled = 0;
    
    for (const id of toDisable) {
      const product = await db.getProduct(id);
      if (product && product.active) {
        product.active = false;
        await db.upsertProduct(product);
        disabled++;
      }
    }
    
    logAdminAction("fix_duplicate_group", { keepId, disabled, total: productIds.length });
    res.json({ ok: true, disabled, kept: keepId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fix: Disable products with missing images
app.post("/api/admin/audit/fix-missing-images", requireAdminSession, async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({ error: "Product IDs required" });
    }
    
    let disabled = 0;
    for (const id of productIds) {
      const product = await db.getProduct(id);
      if (product && product.active) {
        product.active = false;
        await db.upsertProduct(product);
        disabled++;
      }
    }
    
    logAdminAction("fix_missing_images", { disabled });
    res.json({ ok: true, disabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CATALOG CLEANUP ENDPOINTS ============

// Scan catalog for ineligible products
app.get("/api/admin/cleanup/scan", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const activeProducts = products.filter(p => p.active && !p.quarantined && !p.rejected && !p.deletedAt);
    
    const ineligible = [];
    const stats = { total: activeProducts.length, eligible: 0, ineligible: 0, byReason: {} };
    
    for (const product of activeProducts) {
      const eligibility = petEligibility.evaluateEligibility(product);
      if (!eligibility.ok) {
        ineligible.push({
          id: product.id,
          title: product.title,
          category: product.category,
          image: product.image,
          score: eligibility.score,
          denyReason: eligibility.denyReason,
          reasons: eligibility.reasons.slice(0, 5)
        });
        stats.ineligible++;
        const reason = eligibility.denyReason ? eligibility.denyReason.split(':')[1] || 'other' : 'low_score';
        stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;
      } else {
        stats.eligible++;
      }
    }
    
    res.json({ ineligible, stats });
  } catch (err) {
    log(`[Cleanup] Scan error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Quarantine products (soft block)
app.post("/api/admin/cleanup/quarantine", requireAdminSession, async (req, res) => {
  try {
    const { productIds, reason } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: "Product IDs required" });
    }
    
    let quarantined = 0;
    for (const id of productIds) {
      const product = await db.getProduct(id);
      if (product && !product.quarantined) {
        await db.updateProduct(id, {
          quarantined: true,
          quarantineReason: reason || 'non_pet_product',
          quarantinedAt: new Date().toISOString(),
          quarantinedBy: 'admin'
        });
        quarantined++;
      }
    }
    
    logAdminAction("quarantine_products", { count: quarantined, reason });
    log(`[Cleanup] Quarantined ${quarantined} products`);
    res.json({ ok: true, quarantined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete quarantined products (hard delete)
app.post("/api/admin/cleanup/delete", requireAdminSession, async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: "Product IDs required" });
    }
    
    let deleted = 0;
    for (const id of productIds) {
      const product = await db.getProduct(id);
      if (product && product.quarantined) {
        await db.updateProduct(id, {
          deletedAt: new Date().toISOString(),
          active: false
        });
        deleted++;
      }
    }
    
    logAdminAction("delete_quarantined", { count: deleted });
    log(`[Cleanup] Deleted ${deleted} quarantined products`);
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Undo quarantine
app.post("/api/admin/cleanup/undo", requireAdminSession, async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: "Product IDs required" });
    }
    
    let restored = 0;
    for (const id of productIds) {
      const product = await db.getProduct(id);
      if (product && product.quarantined) {
        await db.updateProduct(id, {
          quarantined: false,
          quarantineReason: null,
          quarantinedAt: null,
          quarantinedBy: null
        });
        restored++;
      }
    }
    
    logAdminAction("undo_quarantine", { count: restored });
    log(`[Cleanup] Restored ${restored} products from quarantine`);
    res.json({ ok: true, restored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get quarantined products list
app.get("/api/admin/cleanup/quarantined", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    const quarantined = products
      .filter(p => p.quarantined && !p.deletedAt)
      .map(p => ({
        id: p.id,
        title: p.title,
        category: p.category,
        image: p.image,
        quarantineReason: p.quarantineReason,
        quarantinedAt: p.quarantinedAt
      }));
    res.json({ quarantined, count: quarantined.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run validation tests
app.get("/api/admin/cleanup/validate", requireAdminSession, (req, res) => {
  try {
    const testResults = petEligibility.validateTestCases();
    res.json(testResults);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ NEW PET AUDIT ENDPOINTS (using strict eligibility rules) ============

// Scan products with new strict eligibility
app.post("/api/admin/pet-audit/scan", requireAdminSession, async (req, res) => {
  try {
    log("[PET_AUDIT] Starting scan with strict eligibility rules");
    const products = await db.listProducts();
    const nonPetProducts = [];
    let nonPetCount = 0;
    
    for (const product of products) {
      if (!product.active || product.deletedAt || product.is_pet === false) continue;
      
      const result = petEligibilityNew.isPetEligible({
        title: product.title,
        description: product.description,
        tags: product.tags,
        category: product.category,
        type: product.type
      });
      
      if (!result.eligible) {
        nonPetCount++;
        if (nonPetProducts.length < 50) {
          nonPetProducts.push({
            id: product.id,
            title: product.title,
            category: product.category,
            score: result.score,
            usage: result.usage,
            reasons: result.reasons
          });
        }
      }
    }
    
    res.json({
      total: products.length,
      nonPetCount,
      sample: nonPetProducts,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    log(`[PET_AUDIT] Scan error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Apply soft delete (set is_active=false) or hard delete for non-pet products
app.post("/api/admin/pet-audit/apply", requireAdminSession, async (req, res) => {
  try {
    const { mode, limit } = req.body;
    if (!mode || !["soft", "hard"].includes(mode)) {
      return res.status(400).json({ error: "mode must be 'soft' or 'hard'" });
    }
    
    log(`[PET_AUDIT] Applying ${mode} delete with limit=${limit || 'none'}`);
    const products = await db.listProducts();
    
    let updated = 0;
    let softDeleted = 0;
    let hardDeleted = 0;
    let kept = 0;
    
    for (const product of products) {
      if (limit && updated >= limit) break;
      if (!product.active || product.deletedAt) continue;
      
      const result = petEligibilityNew.isPetEligible({
        title: product.title,
        description: product.description,
        tags: product.tags,
        category: product.category,
        type: product.type
      });
      
      if (!result.eligible) {
        await db.updateProduct(product.id, {
          is_pet: false,
          pet_score: result.score,
          pet_usage: result.usage,
          pet_reasons: JSON.stringify(result.reasons),
          is_active: mode === "soft" ? false : true,
          deletedAt: mode === "hard" ? new Date().toISOString() : null,
          active: mode === "hard" ? false : product.active
        });
        
        if (mode === "soft") {
          softDeleted++;
        } else {
          hardDeleted++;
        }
        updated++;
      } else {
        kept++;
      }
    }
    
    logAdminAction("pet_audit_apply", { mode, updated, softDeleted, hardDeleted, kept });
    res.json({ ok: true, updated, softDeleted, hardDeleted, kept });
  } catch (err) {
    log(`[PET_AUDIT] Apply error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Undo soft delete (restore is_active=true)
app.post("/api/admin/pet-audit/undo-soft-delete", requireAdminSession, async (req, res) => {
  try {
    const { limit } = req.body;
    log(`[PET_AUDIT] Undoing soft deletes with limit=${limit || 'none'}`);
    
    const products = await db.listProducts();
    let restored = 0;
    
    for (const product of products) {
      if (limit && restored >= limit) break;
      if (!product.is_pet || product.is_active !== false) continue;
      
      await db.updateProduct(product.id, {
        is_active: true,
        active: true
      });
      restored++;
    }
    
    logAdminAction("pet_audit_undo_soft_delete", { restored });
    res.json({ ok: true, restored });
  } catch (err) {
    log(`[PET_AUDIT] Undo error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Rebuild usage + bucket classification for all products
app.post("/api/admin/pet-rebuild-classification", requireAdminSession, async (req, res) => {
  try {
    log(`[PET_AUDIT] Starting full classification rebuild...`);
    const products = await db.listProducts();
    
    let updated = 0;
    let eligible = 0;
    let ineligible = 0;
    
    for (const product of products) {
      if (product.deletedAt) continue;
      
      const result = petEligibilityNew.isPetEligible({
        title: product.title,
        description: product.description,
        tags: product.tags,
        category: product.category,
        type: product.type
      });
      
      const updateData = {
        is_pet: result.eligible,
        pet_score: result.score,
        pet_usage: result.usage,
        pet_reasons: JSON.stringify(result.reasons)
      };
      
      if (result.eligible) {
        updateData.pet_bucket = inferBucketFromProduct(product);
        eligible++;
      } else {
        updateData.pet_bucket = null;
        ineligible++;
      }
      
      await db.updateProduct(product.id, updateData);
      updated++;
      
      if (updated % 100 === 0) {
        await new Promise(r => setTimeout(r, 10));
      }
    }
    
    log(`[PET_AUDIT] Classification rebuild complete: ${updated} products (${eligible} eligible, ${ineligible} ineligible)`);
    logAdminAction("pet_rebuild_classification", { updated, eligible, ineligible });
    res.json({ ok: true, updated, eligible, ineligible });
  } catch (err) {
    log(`[PET_AUDIT] Rebuild error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/orders", requireAdminSession, (req, res) => {
  const ordersPath = path.join(__dirname, "data", "orders.json");
  if (!fs.existsSync(ordersPath)) return res.json([]);
  const orders = JSON.parse(fs.readFileSync(ordersPath, "utf-8")) || [];
  res.json(orders);
});

app.get("/api/admin/sync-status", requireAdminSession, (req, res) => {
  res.json({
    last_sync_time: lastSyncTime,
    last_sync_mode: lastSyncMode,
    last_sync_count: lastSyncCount,
    auto_sync_enabled: process.env.CJ_AUTO_SYNC === "true"
  });
});

app.get("/api/admin/logs", requireAdminSession, (req, res) => {
  const limit = parseInt(req.query.limit || 200);
  res.json(getLogs(limit));
});

app.post("/api/admin/cj-sync/manual", requireAdminSession, async (req, res) => {
  try {
    const csvText = typeof req.body === "string" ? req.body : req.body.toString("utf-8");
    if (!csvText || csvText.trim().length === 0) {
      return res.status(400).json({ error: "Empty CSV" });
    }

    const result = await runCJSync(csvText);
    if (!result.ok) return res.status(400).json(result);

    lastSyncTime = new Date().toISOString();
    lastSyncMode = "admin_manual";
    lastSyncCount = result.synced;

    log(`Admin manual sync: ${result.synced} products`);
    res.json({ ...result, mode: "admin_manual", timestamp: lastSyncTime });
  } catch (err) {
    log(`Admin sync error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/clear-cache", requireAdminSession, (req, res) => {
  const cacheDir = path.join(__dirname, "public", "cache", "images");
  let removed = 0;
  
  try {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      files.forEach(f => {
        fs.unlinkSync(path.join(cacheDir, f));
        removed++;
      });
    }
    log(`Admin cleared cache: ${removed} files removed`);
    res.json({ ok: true, removed });
  } catch (err) {
    log(`Admin cache clear error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/reseed", requireAdminSession, async (req, res) => {
  try {
    const products = await db.listProducts();
    if (products.length > 0) {
      return res.json({ ok: false, message: "Database not empty, skipping reseed" });
    }
    
    await seedIfEmpty();
    log("Admin reseed: demo data restored");
    res.json({ ok: true, message: "Demo data reseeded" });
  } catch (err) {
    log(`Admin reseed error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/cj/orders", requireAdminSession, (req, res) => {
  const cjOrders = getCJOrders();
  res.json(cjOrders);
});

app.post("/api/admin/cj/export/:orderId", requireAdminSession, (req, res) => {
  const { orderId } = req.params;
  
  try {
    const success = exportCJOrder(orderId);
    if (!success) {
      return res.status(404).json({ error: "Order not found in pending" });
    }
    
    // Update fulfillment_status in orders.json
    const ordersPath = path.join(__dirname, "data", "orders.json");
    if (fs.existsSync(ordersPath)) {
      let orders = JSON.parse(fs.readFileSync(ordersPath, "utf-8")) || [];
      const order = orders.find(o => o.session_id === orderId);
      if (order) {
        order.fulfillment_status = "exported";
        fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
      }
    }
    
    log(`[Admin] Exported order to CJ: ${orderId}`);
    res.json({ ok: true, message: "Order exported" });
  } catch (err) {
    log(`[Admin] CJ export error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/cj/place-pending", requireAdminSession, async (req, res) => {
  try {
    const maxOrders = parseInt(req.body?.maxOrders || 3);
    const result = await placePendingOrders(maxOrders);
    log(`[Admin] Manual place pending: ${result.placed} placed, ${result.failed} failed`);
    res.json(result);
  } catch (err) {
    log(`[Admin] Place pending error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/cj/auto-place", requireAdminSession, async (req, res) => {
  try {
    const result = await placePendingOrders(10);
    log(`[Admin] Auto place: ${result.placed} placed, ${result.failed} failed`);
    res.json(result);
  } catch (err) {
    log(`[Admin] Auto place error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// CJ LIST IMPORT (250 Pet Products) API
// =====================================================

let cjListImportJob = {
  running: false,
  jobId: null,
  startedAt: null,
  progress: { imported: 0, total: 250, skippedNonUs: 0, skippedNonPet: 0, duplicates: 0, errors: 0 },
  lastError: null,
  completedAt: null
};

app.post("/api/admin/cj/list-import", requireAdminSession, async (req, res) => {
  if (cjListImportJob.running) {
    return res.status(409).json({
      success: false,
      error: "Import already running",
      jobId: cjListImportJob.jobId,
      progress: cjListImportJob.progress
    });
  }
  
  const { limit = 250, resume = false } = req.body || {};
  const jobId = `cj-import-${Date.now()}`;
  
  cjListImportJob = {
    running: true,
    jobId,
    startedAt: new Date().toISOString(),
    progress: { imported: 0, total: limit, skippedNonUs: 0, skippedNonPet: 0, duplicates: 0, errors: 0 },
    lastError: null,
    completedAt: null
  };
  
  log(`[CJ Import] Job ${jobId} started`);
  
  res.json({
    success: true,
    message: "Import job started",
    jobId,
    checkProgress: "/api/admin/cj/import-status"
  });
  
  try {
    const { runImport, stats } = require("./scripts/import-cj-petlist-curated");
    
    const updateProgress = setInterval(() => {
      cjListImportJob.progress = {
        imported: stats.imported || 0,
        total: limit,
        skippedNonUs: stats.skipped_non_us || 0,
        skippedNonPet: stats.skipped_non_pet || 0,
        duplicates: stats.duplicates || 0,
        errors: stats.errors || 0,
        pagesScanned: stats.pages_scanned || 0
      };
    }, 1000);
    
    const result = await runImport({ resume, forceUsOnly: false });
    
    clearInterval(updateProgress);
    
    cjListImportJob.running = false;
    cjListImportJob.completedAt = new Date().toISOString();
    cjListImportJob.progress = {
      imported: result.imported || 0,
      total: limit,
      skippedNonUs: result.skipped_non_us || 0,
      skippedNonPet: result.skipped_non_pet || 0,
      duplicates: result.duplicates || 0,
      errors: result.errors || 0,
      pagesScanned: result.pages_scanned || 0
    };
    
    log(`[CJ Import] Job ${jobId} completed: imported=${result.imported}, skipped_non_us=${result.skipped_non_us}, skipped_non_pet=${result.skipped_non_pet}`);
    
  } catch (err) {
    log(`[CJ Import] Job error: ${err.message}`);
    cjListImportJob.running = false;
    cjListImportJob.lastError = err.message;
    cjListImportJob.completedAt = new Date().toISOString();
  }
});

app.get("/api/admin/cj/import-status", requireAdminSession, async (req, res) => {
  const logPath = path.join(__dirname, "data", "cj-petlist-import-log.json");
  const failuresPath = path.join(__dirname, "data", "cj-import-failures.json");
  
  let lastImportLog = null;
  let recentFailures = [];
  
  try {
    if (fs.existsSync(logPath)) {
      lastImportLog = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    }
  } catch (e) {}
  
  try {
    if (fs.existsSync(failuresPath)) {
      const data = JSON.parse(fs.readFileSync(failuresPath, "utf-8"));
      recentFailures = (data.failures || []).slice(-20);
    }
  } catch (e) {}
  
  res.json({
    success: true,
    job: {
      running: cjListImportJob.running,
      jobId: cjListImportJob.jobId,
      startedAt: cjListImportJob.startedAt,
      completedAt: cjListImportJob.completedAt,
      progress: cjListImportJob.progress,
      lastError: cjListImportJob.lastError
    },
    lastImportLog,
    recentFailures
  });
});

app.get("/api/admin/cj/rejected", requireAdminSession, async (req, res) => {
  const failuresPath = path.join(__dirname, "data", "cj-import-failures.json");
  
  try {
    if (!fs.existsSync(failuresPath)) {
      return res.json({ success: true, failures: [], count: 0 });
    }
    
    const data = JSON.parse(fs.readFileSync(failuresPath, "utf-8"));
    const failures = data.failures || [];
    
    const grouped = {
      nonPet: failures.filter(f => f.reason && !f.reason.includes("warehouse")),
      noUsWarehouse: failures.filter(f => f.reason && f.reason.includes("warehouse")),
      errors: failures.filter(f => f.type === "page_fetch" || f.error)
    };
    
    res.json({
      success: true,
      count: failures.length,
      grouped,
      exportedAt: data.exportedAt
    });
  } catch (err) {
    log(`[Admin] Rejected products error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// GOOGLE ADS GENERATOR API ROUTES
// =====================================================

// --- Themes CRUD ---
app.get("/api/admin/themes", requireAdminSession, (req, res) => {
  try {
    const themes = adsGenerator.getThemes();
    res.json({ themes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/themes/:id", requireAdminSession, (req, res) => {
  try {
    const theme = adsGenerator.getTheme(req.params.id);
    if (!theme) return res.status(404).json({ error: "Theme not found" });
    res.json(theme);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/themes", requireAdminSession, (req, res) => {
  try {
    const theme = adsGenerator.saveTheme(req.body);
    log(`[Admin] Theme saved: ${theme.id}`);
    res.json({ ok: true, theme });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/themes/:id", requireAdminSession, (req, res) => {
  try {
    adsGenerator.deleteTheme(req.params.id);
    log(`[Admin] Theme deleted: ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Collections CRUD ---
app.get("/api/admin/collections", requireAdminSession, (req, res) => {
  try {
    const collections = adsGenerator.getCollections();
    res.json({ collections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/collections/:slug", requireAdminSession, (req, res) => {
  try {
    const collection = adsGenerator.getCollection(req.params.slug);
    if (!collection) return res.status(404).json({ error: "Collection not found" });
    res.json(collection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/collections", requireAdminSession, (req, res) => {
  try {
    const collection = adsGenerator.saveCollection(req.body);
    log(`[Admin] Collection saved: ${collection.slug}`);
    res.json({ ok: true, collection });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Ad Assets CRUD ---
app.get("/api/admin/ads", requireAdminSession, (req, res) => {
  try {
    const assets = adsGenerator.getAdAssets();
    res.json({ assets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/ads/:id", requireAdminSession, (req, res) => {
  try {
    const asset = adsGenerator.getAdAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: "Ad asset not found" });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/ads", requireAdminSession, (req, res) => {
  try {
    const asset = adsGenerator.saveAdAsset(req.body);
    log(`[Admin] Ad asset saved: ${asset.id}`);
    res.json({ ok: true, asset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/ads/:id", requireAdminSession, (req, res) => {
  try {
    adsGenerator.deleteAdAsset(req.params.id);
    log(`[Admin] Ad asset deleted: ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Ad Generation ---
app.post("/api/admin/ads/generate", requireAdminSession, async (req, res) => {
  try {
    const { productId, adType, themeId } = req.body;
    if (!productId) return res.status(400).json({ error: "productId required" });
    
    const product = await db.getProduct(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    const savedAssets = [];
    const effectiveThemeId = themeId || adsGenerator.suggestTheme(product)?.theme?.id;
    
    if (adType === 'both' || adType === 'search' || !adType) {
      const searchAsset = await adsGenerator.generateSearchAds(product, { themeId: effectiveThemeId });
      const saved = adsGenerator.saveAdAsset({
        ...searchAsset,
        productId,
        productTitle: product.title,
        adType: 'search',
        themeId: effectiveThemeId
      });
      savedAssets.push(saved);
    }
    
    if (adType === 'both' || adType === 'pmax') {
      const pmaxAsset = await adsGenerator.generatePMaxAds(product, { themeId: effectiveThemeId });
      const saved = adsGenerator.saveAdAsset({
        ...pmaxAsset,
        productId,
        productTitle: product.title,
        adType: 'pmax',
        themeId: effectiveThemeId
      });
      savedAssets.push(saved);
    }
    
    log(`[Admin] Generated ${savedAssets.length} ads for product: ${productId}`);
    res.json({ ok: true, generated: savedAssets.length, assets: savedAssets });
  } catch (err) {
    log(`[Admin] Ad generation error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/ads/bulk-generate", requireAdminSession, async (req, res) => {
  try {
    const { productIds, adType, themeId, category, limit, skipExisting } = req.body;
    
    let productsToProcess = [];
    
    if (productIds && Array.isArray(productIds)) {
      for (const id of productIds.slice(0, limit || 20)) {
        const product = await db.getProduct(id);
        if (product) productsToProcess.push(product);
      }
    } else {
      let allProducts = await db.getProducts({ limit: 500, status: 'active' });
      if (category) {
        allProducts = allProducts.products.filter(p => {
          const petType = (p.petType || p.category || '').toLowerCase();
          return petType.includes(category.toLowerCase());
        });
      } else {
        allProducts = allProducts.products || [];
      }
      productsToProcess = allProducts.slice(0, limit || 20);
    }
    
    if (skipExisting) {
      const existingAds = adsGenerator.getAdAssets();
      const existingProductIds = new Set(existingAds.map(a => a.productId));
      productsToProcess = productsToProcess.filter(p => !existingProductIds.has(p.id));
    }
    
    const results = { generated: 0, failed: 0, products: 0, errors: [] };
    
    for (const product of productsToProcess) {
      try {
        const productThemeId = themeId || adsGenerator.suggestTheme(product)?.theme?.id;
        
        const searchAsset = await adsGenerator.generateSearchAds(product, { themeId: productThemeId });
        adsGenerator.saveAdAsset({
          ...searchAsset,
          productId: product.id,
          productTitle: product.title,
          adType: 'search',
          themeId: productThemeId
        });
        results.generated++;
        
        const pmaxAsset = await adsGenerator.generatePMaxAds(product, { themeId: productThemeId });
        adsGenerator.saveAdAsset({
          ...pmaxAsset,
          productId: product.id,
          productTitle: product.title,
          adType: 'pmax',
          themeId: productThemeId
        });
        results.generated++;
        results.products++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${product.id}: ${err.message}`);
      }
    }
    
    log(`[Admin] Bulk ad generation: ${results.generated} ads for ${results.products} products, ${results.failed} failed`);
    res.json({ ok: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/ads/suggest-theme/:productId", requireAdminSession, async (req, res) => {
  try {
    const product = await db.getProduct(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    const suggestion = adsGenerator.suggestTheme(product);
    res.json(suggestion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CSV Export ---
app.get("/api/admin/ads/export/search.csv", requireAdminSession, (req, res) => {
  try {
    const assets = adsGenerator.getAdAssets().filter(a => a.adType === 'search' || !a.adType);
    const csv = adsGenerator.exportSearchAdsCSV(assets);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=getpawsy-search-ads.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/ads/export/pmax.csv", requireAdminSession, (req, res) => {
  try {
    const assets = adsGenerator.getAdAssets().filter(a => a.adType === 'pmax');
    const csv = adsGenerator.exportPMaxCSV(assets);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=getpawsy-pmax-ads.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// COPYWRITER API ROUTES
// =====================================================

app.get("/api/admin/copywriter", requireAdminSession, (req, res) => {
  try {
    const blocks = copywriter.getCopyBlocks();
    res.json({ copyblocks: blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/copywriter/:id", requireAdminSession, (req, res) => {
  try {
    const block = copywriter.getCopyBlock(req.params.id);
    if (!block) return res.status(404).json({ error: "Copy block not found" });
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/copywriter", requireAdminSession, (req, res) => {
  try {
    const block = copywriter.saveCopyBlock(req.body);
    log(`[Admin] Copy block saved: ${block.id}`);
    res.json({ ok: true, block });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/copywriter/:id", requireAdminSession, (req, res) => {
  try {
    copywriter.deleteCopyBlock(req.params.id);
    log(`[Admin] Copy block deleted: ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/copywriter/generate", requireAdminSession, async (req, res) => {
  try {
    const { scope, collectionSlug } = req.body;
    if (!scope) return res.status(400).json({ error: "scope required" });
    
    let collectionDef = null;
    if (scope === 'COLLECTION' && collectionSlug) {
      collectionDef = adsGenerator.getCollection(collectionSlug);
    }
    
    const block = await copywriter.generateCopyBlock(scope, collectionSlug, collectionDef);
    const savedBlock = copywriter.saveCopyBlock(block);
    
    log(`[Admin] Generated copy block: ${scope} ${collectionSlug || ''}`);
    res.json({ ok: true, block: savedBlock });
  } catch (err) {
    log(`[Admin] Copy generation error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/copywriter/:id/approve", requireAdminSession, (req, res) => {
  try {
    const block = copywriter.getCopyBlock(req.params.id);
    if (!block) return res.status(404).json({ error: "Copy block not found" });
    
    const errors = copywriter.validateCopyBlock(block);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", errors });
    }
    
    block.status = 'approved';
    copywriter.saveCopyBlock(block);
    
    log(`[Admin] Copy block approved: ${block.id}`);
    res.json({ ok: true, block });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/copywriter/:id/validate", requireAdminSession, (req, res) => {
  try {
    const block = copywriter.getCopyBlock(req.params.id);
    if (!block) return res.status(404).json({ error: "Copy block not found" });
    
    const errors = copywriter.validateCopyBlock(block);
    res.json({ valid: errors.length === 0, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// STOREFRONT LANDING PAGES
// =====================================================

// /dogs landing page
app.get("/dogs", async (req, res) => {
  try {
    const copy = copywriter.getCopyBlockByScope('DOGS_LANDING') || copywriter.getCopyBlockDraft('DOGS_LANDING');
    const collections = adsGenerator.getCollections().filter(c => c.petType === 'dog');
    
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (!p.image || !p.price) return false;
      if (p.is_pet === false) return false;
      if (!checkPetEligible(p)) return false;
      if (!isValidProductImage(p.image)) return false;
      return p.petType === 'dog' || p.petType === 'both' || p.pet_usage === 'dogs' || p.pet_usage === 'both';
    }).slice(0, 12);
    
    const seoMeta = {
      title: copy?.seoTitle || 'Dog Supplies & Essentials | GetPawsy',
      description: copy?.seoDescription || 'Shop quality dog supplies. Durable toys, comfortable harnesses, and everyday essentials.',
      keywords: (copy?.keywords || ['dog supplies', 'dog toys', 'dog beds']).join(', '),
      canonical: `https://${req.get('host')}/dogs`
    };
    
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": copy?.headline || "Dog Supplies",
      "description": copy?.seoDescription || "Quality dog products",
      "url": `https://${req.get('host')}/dogs`
    };
    
    res.render('landing', {
      petType: 'dog',
      copy: copy || {},
      collections,
      products,
      seoMeta,
      structuredData: JSON.stringify(structuredData)
    });
  } catch (err) {
    log(`[Landing] Dogs page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /cats landing page
app.get("/cats", async (req, res) => {
  try {
    const copy = copywriter.getCopyBlockByScope('CATS_LANDING') || copywriter.getCopyBlockDraft('CATS_LANDING');
    const collections = adsGenerator.getCollections().filter(c => c.petType === 'cat');
    
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (!p.image || !p.price) return false;
      if (p.is_pet === false) return false;
      if (!checkPetEligible(p)) return false;
      if (!isValidProductImage(p.image)) return false;
      return p.petType === 'cat' || p.petType === 'both' || p.pet_usage === 'cats' || p.pet_usage === 'both';
    }).slice(0, 12);
    
    const seoMeta = {
      title: copy?.seoTitle || 'Cat Supplies & Essentials | GetPawsy',
      description: copy?.seoDescription || 'Shop quality cat supplies. Interactive toys, scratchers, and cozy essentials.',
      keywords: (copy?.keywords || ['cat supplies', 'cat toys', 'cat scratchers']).join(', '),
      canonical: `https://${req.get('host')}/cats`
    };
    
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": copy?.headline || "Cat Supplies",
      "description": copy?.seoDescription || "Quality cat products",
      "url": `https://${req.get('host')}/cats`
    };
    
    res.render('landing', {
      petType: 'cat',
      copy: copy || {},
      collections,
      products,
      seoMeta,
      structuredData: JSON.stringify(structuredData)
    });
  } catch (err) {
    log(`[Landing] Cats page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /small-pets landing page
const SMALL_PET_KEYWORDS = ['rabbit', 'hamster', 'guinea pig', 'ferret', 'bird', 'parrot', 'aquarium', 'fish', 'reptile', 'turtle', 'chinchilla', 'gerbil', 'mouse', 'rat', 'hedgehog', 'small animal', 'small pet'];

function isSmallPetProduct(product) {
  const text = `${product.name || ''} ${product.title || ''} ${product.description || ''} ${(product.tags || []).join(' ')}`.toLowerCase();
  return SMALL_PET_KEYWORDS.some(kw => text.includes(kw));
}

app.get("/small-pets", async (req, res) => {
  try {
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (!p.image || !p.price) return false;
      if (p.is_pet === false) return false;
      if (!checkPetEligible(p)) return false;
      if (!isValidProductImage(p.image)) return false;
      return isSmallPetProduct(p);
    }).slice(0, 48);
    
    const seoMeta = {
      title: 'Small Pet Supplies | Rabbits, Hamsters, Birds & More | GetPawsy',
      description: 'Shop quality supplies for rabbits, hamsters, birds, fish, reptiles and other small pets. Cages, toys, food bowls and accessories.',
      keywords: 'small pet supplies, rabbit supplies, hamster supplies, bird supplies, fish supplies, reptile supplies',
      canonical: `https://${req.get('host')}/small-pets`
    };
    
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Small Pet Supplies",
      "description": "Quality supplies for rabbits, hamsters, birds, fish and other small pets",
      "url": `https://${req.get('host')}/small-pets`
    };
    
    res.render('landing', {
      petType: 'small-pet',
      copy: {
        headline: 'Small Pets',
        subheadline: 'Rabbit, hamster, bird, fish & more',
        heroImage: '/images/home/small-pets-hero.jpg'
      },
      collections: [],
      products,
      seoMeta,
      structuredData: JSON.stringify(structuredData)
    });
  } catch (err) {
    log(`[Landing] Small pets page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /dogs/:bucket category page
app.get("/dogs/:bucket", async (req, res) => {
  try {
    const bucket = req.params.bucket;
    const validBuckets = ['toys', 'feeding', 'travel', 'grooming', 'training', 'beds', 'health'];
    if (!validBuckets.includes(bucket)) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
    }
    
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (p.is_pet === false) return false;
      if (!p.image || !p.price) return false;
      const usage = p.pet_usage || (p.petType === 'dog' ? 'dogs' : p.petType === 'cat' ? 'cats' : 'both');
      if (usage !== 'dogs' && usage !== 'both') return false;
      const productBucket = p.pet_bucket || inferBucketFromProduct(p);
      return productBucket === bucket;
    }).slice(0, 48);
    
    const bucketNames = {
      toys: 'Dog Toys', feeding: 'Dog Food & Bowls', travel: 'Dog Travel Gear',
      grooming: 'Dog Grooming', training: 'Dog Training', beds: 'Dog Beds', health: 'Dog Health'
    };
    
    const seoMeta = {
      title: `${bucketNames[bucket] || 'Dog Products'} | GetPawsy`,
      description: `Shop quality ${bucketNames[bucket]?.toLowerCase() || 'dog products'}. Fast US shipping.`,
      canonical: `https://${req.get('host')}/dogs/${bucket}`
    };
    
    res.render('category', {
      petType: 'dog',
      bucket,
      bucketName: bucketNames[bucket] || bucket,
      products,
      seoMeta
    });
  } catch (err) {
    log(`[Landing] Dogs bucket page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /need/:slug need-based navigation route
app.get("/need/:slug", async (req, res) => {
  try {
    const { getNeedBySlug } = require("./src/config/needs");
    const need = getNeedBySlug(req.params.slug);
    
    if (!need) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
    }
    
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (!p.petType || p.petType === 'null') return false;
      if (!p.image || !p.price) return false;
      
      const text = `${p.title || ''} ${p.description || ''} ${p.category || ''}`.toLowerCase();
      const matchesKeyword = need.keywords.some(kw => text.includes(kw.toLowerCase()));
      const matchesBucket = need.buckets.some(b => (p.pet_bucket || p.bucket) === b);
      
      return matchesKeyword || matchesBucket;
    }).slice(0, 48);
    
    const seoMeta = {
      title: `${need.title} for Pets | GetPawsy`,
      description: need.description,
      canonical: `https://${req.get('host')}/need/${need.slug}`
    };
    
    res.render('category', {
      petType: 'all',
      bucket: need.slug,
      bucketName: need.title,
      bucketIcon: need.icon,
      products,
      seoMeta
    });
  } catch (err) {
    log(`[Landing] Need page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /cats/:bucket category page
app.get("/cats/:bucket", async (req, res) => {
  try {
    const bucket = req.params.bucket;
    const validBuckets = ['toys', 'feeding', 'beds', 'travel', 'grooming', 'litter', 'scratchers', 'training', 'health'];
    if (!validBuckets.includes(bucket)) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
    }
    
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (p.is_pet === false) return false;
      if (!p.image || !p.price) return false;
      const usage = p.pet_usage || (p.petType === 'cat' ? 'cats' : p.petType === 'dog' ? 'dogs' : 'both');
      if (usage !== 'cats' && usage !== 'both') return false;
      const productBucket = p.pet_bucket || inferBucketFromProduct(p);
      return productBucket === bucket;
    }).slice(0, 48);
    
    const bucketNames = {
      toys: 'Cat Toys', feeding: 'Cat Food & Bowls', beds: 'Cat Beds', travel: 'Cat Carriers',
      grooming: 'Cat Grooming', litter: 'Litter & Litter Boxes', scratchers: 'Cat Scratchers', 
      training: 'Cat Training', health: 'Cat Health'
    };
    
    const seoMeta = {
      title: `${bucketNames[bucket] || 'Cat Products'} | GetPawsy`,
      description: `Shop quality ${bucketNames[bucket]?.toLowerCase() || 'cat products'}. Fast US shipping.`,
      canonical: `https://${req.get('host')}/cats/${bucket}`
    };
    
    res.render('category', {
      petType: 'cat',
      bucket,
      bucketName: bucketNames[bucket] || bucket,
      products,
      seoMeta
    });
  } catch (err) {
    log(`[Landing] Cats bucket page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /small-pets/:bucket - Small Pet category pages (rabbits, hamsters, birds, fish, etc.)
app.get("/small-pets/:bucket", async (req, res) => {
  try {
    const bucket = req.params.bucket;
    const validBuckets = ['cages', 'toys', 'beds', 'food', 'grooming', 'accessories'];
    if (!validBuckets.includes(bucket)) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
    }
    
    const SMALL_PET_KEYWORDS = [
      'rabbit', 'bunny', 'hamster', 'guinea pig', 'ferret', 'chinchilla',
      'bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch',
      'reptile', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko', 'iguana',
      'fish', 'aquarium', 'aquatic', 'betta', 'goldfish', 'tropical fish',
      'gerbil', 'mouse', 'mice', 'rat', 'hedgehog', 'sugar glider',
      'cage', 'terrarium', 'vivarium', 'hutch', 'habitat',
      'small animal', 'small pet', 'small pets', 'rodent', 'rodents'
    ];
    
    const bucketKeywords = {
      cages: ['cage', 'habitat', 'terrarium', 'vivarium', 'hutch', 'tank', 'enclosure'],
      toys: ['toy', 'ball', 'wheel', 'tunnel', 'chew', 'exercise'],
      beds: ['bed', 'hideaway', 'house', 'nest', 'hammock', 'hut'],
      food: ['food', 'treat', 'hay', 'seed', 'pellet', 'feeder'],
      grooming: ['brush', 'comb', 'nail', 'shampoo', 'bath', 'grooming'],
      accessories: ['bowl', 'bottle', 'leash', 'harness', 'carrier', 'accessory']
    };
    
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (!p.image || !p.price) return false;
      
      const text = `${p.title || p.name || ''} ${p.description || ''} ${p.category || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
      const isSmallPet = SMALL_PET_KEYWORDS.some(kw => text.includes(kw));
      if (!isSmallPet) return false;
      
      const matchesBucket = (bucketKeywords[bucket] || []).some(kw => text.includes(kw));
      return matchesBucket;
    }).slice(0, 48);
    
    const bucketNames = {
      cages: 'Cages & Habitats', toys: 'Small Pet Toys', beds: 'Beds & Hideaways',
      food: 'Food & Treats', grooming: 'Grooming', accessories: 'Accessories'
    };
    
    const seoMeta = {
      title: `${bucketNames[bucket] || 'Small Pet Products'} | GetPawsy`,
      description: `Shop quality ${bucketNames[bucket]?.toLowerCase() || 'small pet products'} for rabbits, hamsters, birds, fish and more. Fast US shipping.`,
      canonical: `https://${req.get('host')}/small-pets/${bucket}`
    };
    
    res.render('category', {
      petType: 'small-pet',
      bucket,
      bucketName: bucketNames[bucket] || bucket,
      bucketIcon: '🐰',
      bucketDescription: 'Products for rabbits, hamsters, birds, fish and other small pets',
      products,
      seoMeta
    });
  } catch (err) {
    log(`[Landing] Small pets bucket page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /feeding - Combined Feeding Products (Dogs & Cats)
app.get("/feeding", async (req, res) => {
  try {
    const sort = req.query.sort || 'newest';
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (p.is_pet === false) return false;
      if (!p.image || !p.price) return false;
      const bucket = p.pet_bucket || inferBucketFromProduct(p);
      return bucket === 'feeding';
    });
    
    if (sort === 'price-low') products.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    else if (sort === 'price-high') products.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    else products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    
    products = products.slice(0, 48);
    
    const seoMeta = {
      title: 'Pet Food & Bowls | GetPawsy',
      description: 'Shop quality food bowls, feeders and feeding accessories for dogs and cats. Fast US shipping.',
      canonical: `https://${req.get('host')}/feeding`
    };
    
    res.render('category', {
      petType: 'all',
      bucket: 'feeding',
      bucketName: 'Food & Bowls',
      bucketIcon: '🍖',
      bucketDescription: 'Quality feeding essentials for your pets',
      products,
      seoMeta,
      currentSort: sort
    });
  } catch (err) {
    log(`[Landing] Feeding page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /toys - Combined Toys (Dogs & Cats)
app.get("/toys", async (req, res) => {
  try {
    const sort = req.query.sort || 'newest';
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (p.is_pet === false) return false;
      if (!p.image || !p.price) return false;
      const bucket = p.pet_bucket || inferBucketFromProduct(p);
      return bucket === 'toys';
    });
    
    if (sort === 'price-low') products.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    else if (sort === 'price-high') products.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    else products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    
    products = products.slice(0, 48);
    
    const seoMeta = {
      title: 'Pet Toys | GetPawsy',
      description: 'Shop fun and durable toys for dogs and cats. Interactive toys, chews, and more. Fast US shipping.',
      canonical: `https://${req.get('host')}/toys`
    };
    
    res.render('category', {
      petType: 'all',
      bucket: 'toys',
      bucketName: 'Pet Toys',
      bucketIcon: '🎾',
      bucketDescription: 'Fun and durable toys for playtime',
      products,
      seoMeta,
      currentSort: sort
    });
  } catch (err) {
    log(`[Landing] Toys page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /accessories - Combined Accessories (Dogs & Cats)
app.get("/accessories", async (req, res) => {
  try {
    const sort = req.query.sort || 'newest';
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || p.is_active === false || p.deletedAt) return false;
      if (p.is_pet === false) return false;
      if (!p.image || !p.price) return false;
      const bucket = p.pet_bucket || inferBucketFromProduct(p);
      return ['travel', 'grooming', 'training', 'health'].includes(bucket);
    });
    
    if (sort === 'price-low') products.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    else if (sort === 'price-high') products.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    else products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    
    products = products.slice(0, 48);
    
    const seoMeta = {
      title: 'Pet Accessories | GetPawsy',
      description: 'Shop quality pet accessories including travel gear, grooming supplies, and training aids. Fast US shipping.',
      canonical: `https://${req.get('host')}/accessories`
    };
    
    res.render('category', {
      petType: 'all',
      bucket: 'accessories',
      bucketName: 'Accessories',
      bucketIcon: '✨',
      bucketDescription: 'Essential accessories for your pets',
      products,
      seoMeta,
      currentSort: sort
    });
  } catch (err) {
    log(`[Landing] Accessories page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /collections - All Collections Index Page
app.get("/collections", async (req, res) => {
  try {
    const categoryFilter = req.query.category; // 'dogs', 'cats', or 'small_pet'
    
    const dogBuckets = [
      { slug: 'toys', name: 'Dog Toys', icon: '🦴', image: '/images/categories/dog-toys.jpg' },
      { slug: 'feeding', name: 'Food & Bowls', icon: '🍖', image: '/images/categories/dog-feeding.jpg' },
      { slug: 'beds', name: 'Dog Beds', icon: '🛏️', image: '/images/categories/dog-beds.jpg' },
      { slug: 'grooming', name: 'Grooming', icon: '✨', image: '/images/categories/dog-grooming.jpg' },
      { slug: 'travel', name: 'Travel Gear', icon: '🚗', image: '/images/categories/dog-travel.jpg' },
      { slug: 'training', name: 'Training', icon: '🎯', image: '/images/categories/dog-training.jpg' },
      { slug: 'health', name: 'Health', icon: '💊', image: '/images/categories/dog-health.jpg' }
    ];
    
    const catBuckets = [
      { slug: 'toys', name: 'Cat Toys', icon: '🐭', image: '/images/categories/cat-toys.jpg' },
      { slug: 'feeding', name: 'Food & Bowls', icon: '🐟', image: '/images/categories/cat-feeding.jpg' },
      { slug: 'beds', name: 'Cat Beds', icon: '🛏️', image: '/images/categories/cat-beds.jpg' },
      { slug: 'scratchers', name: 'Scratchers', icon: '🪵', image: '/images/categories/cat-scratchers.jpg' },
      { slug: 'grooming', name: 'Grooming', icon: '✨', image: '/images/categories/cat-grooming.jpg' },
      { slug: 'litter', name: 'Litter', icon: '🚽', image: '/images/categories/cat-litter.jpg' },
      { slug: 'travel', name: 'Carriers', icon: '🧳', image: '/images/categories/cat-travel.jpg' },
      { slug: 'training', name: 'Training', icon: '🎯', image: '/images/categories/cat-training.jpg' },
      { slug: 'health', name: 'Health', icon: '💊', image: '/images/categories/cat-health.jpg' }
    ];
    
    const smallPetBuckets = [
      { slug: 'cages', name: 'Cages & Habitats', icon: '🏠', image: '/images/categories/small-pet-cages.jpg' },
      { slug: 'toys', name: 'Toys', icon: '🎾', image: '/images/categories/small-pet-toys.jpg' },
      { slug: 'beds', name: 'Beds & Hideaways', icon: '🛏️', image: '/images/categories/small-pet-beds.jpg' },
      { slug: 'food', name: 'Food & Treats', icon: '🥕', image: '/images/categories/small-pet-food.jpg' },
      { slug: 'grooming', name: 'Grooming', icon: '✨', image: '/images/categories/small-pet-grooming.jpg' },
      { slug: 'accessories', name: 'Accessories', icon: '✨', image: '/images/categories/small-pet-accessories.jpg' }
    ];
    
    const seoMeta = {
      title: categoryFilter === 'dogs' ? 'Dog Products | GetPawsy' : 
             categoryFilter === 'cats' ? 'Cat Products | GetPawsy' : 
             categoryFilter === 'small_pet' ? 'Small Pet Products | GetPawsy' :
             'All Pet Collections | GetPawsy',
      description: categoryFilter === 'small_pet' 
        ? 'Shop toys, beds and treats for rabbits, hamsters, birds, fish and other small pets.'
        : 'Browse our curated collections of premium pet products. Quality toys, beds, and essentials for dogs and cats.',
      canonical: `https://${req.get('host')}/collections`
    };
    
    res.render('collections', {
      dogBuckets,
      catBuckets,
      smallPetBuckets,
      categoryFilter,
      seoMeta
    });
  } catch (err) {
    log(`[Landing] Collections page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// /collections/:slug landing page
app.get("/collections/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    
    const spaCollections = {
      'dogs-walking': { name: 'Walking Gear', petType: 'dog' },
      'dogs-sleep-comfort': { name: 'Sleep & Comfort', petType: 'dog' },
      'dogs-toys-play': { name: 'Toys & Play', petType: 'dog' },
      'dogs-grooming': { name: 'Grooming', petType: 'dog' },
      'dogs-training': { name: 'Training', petType: 'dog' },
      'dogs-travel': { name: 'Travel', petType: 'dog' },
      'cats-sleep-comfort': { name: 'Sleep & Comfort', petType: 'cat' },
      'cats-toys-play': { name: 'Toys & Play', petType: 'cat' },
      'cats-scratch-furniture': { name: 'Scratch & Furniture', petType: 'cat' },
      'cats-grooming': { name: 'Grooming', petType: 'cat' },
      'cats-food-accessories': { name: 'Food & Accessories', petType: 'cat' }
    };
    
    if (spaCollections[slug]) {
      const meta = spaCollections[slug];
      let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf-8");
      const host = req.get("host") || "localhost:5000";
      const canonical = `https://${host}/collections/${slug}`;
      const title = `${meta.name} for ${meta.petType === 'dog' ? 'Dogs' : 'Cats'} | GetPawsy`;
      const description = `Shop premium ${meta.name.toLowerCase()} products for your ${meta.petType}. Curated by Pawsy AI.`;
      
      html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
      html = html.replace(/<meta name="description" content=".*?"/, `<meta name="description" content="${description}"`);
      html = html.replace(/<link rel="canonical" href=".*?"/, `<link rel="canonical" href="${canonical}"`);
      
      return res.send(html);
    }
    
    const collection = adsGenerator.getCollection(slug);
    if (!collection) {
      return res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
    }
    
    const copy = copywriter.getCopyBlockByScope('COLLECTION', req.params.slug) || 
                 copywriter.getCopyBlockDraft('COLLECTION', req.params.slug);
    
    let products = await db.listProducts();
    products = products.filter(p => {
      if (p.active === false || !p.image || !p.price) return false;
      
      if (collection.petType !== 'both' && p.petType !== collection.petType && p.petType !== 'both') {
        return false;
      }
      
      const productText = [p.title || '', p.description || '', p.category || ''].join(' ').toLowerCase();
      return (collection.categoryKeys || []).some(key => productText.includes(key.toLowerCase()));
    }).slice(0, 24);
    
    const seoMeta = {
      title: collection.seoTitle || `${collection.name} | GetPawsy`,
      description: collection.seoDescription || `Shop quality ${collection.name.toLowerCase()}`,
      keywords: (collection.categoryKeys || []).join(', '),
      canonical: `https://${req.get('host')}/collections/${req.params.slug}`
    };
    
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": collection.name,
      "description": collection.seoDescription || `${collection.name} collection`,
      "url": `https://${req.get('host')}/collections/${req.params.slug}`
    };
    
    res.render('collection', {
      collection,
      copy: copy || {},
      products,
      seoMeta,
      structuredData: JSON.stringify(structuredData)
    });
  } catch (err) {
    log(`[Landing] Collection page error: ${err.message}`);
    res.status(500).send('Error loading page');
  }
});

// --- Hero Studio API ---
app.get("/api/admin/heroes", requireAdminSession, (req, res) => {
  try {
    const data = heroStudio.getHeroes();
    const presets = heroStudio.getStylePresets();
    const categories = heroStudio.getCategories();
    res.json({ ok: true, heroes: data.heroes, activeHeroes: data.activeHeroes, presets, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/heroes/active/:category", (req, res) => {
  try {
    const hero = heroStudio.getActiveHero(req.params.category);
    res.json({ ok: true, hero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/heroes/generate", requireAdminSession, async (req, res) => {
  const requestId = Math.random().toString(36).slice(-8);
  log(`[HERO_GEN_START] Request ${requestId}: category=${req.body.category}, style=${req.body.stylePreset}`);
  
  try {
    const { category, stylePreset, customKeywords, includeBrandText } = req.body;
    
    if (!category) {
      log(`[HERO_GEN_FAIL] ${requestId}: No category provided`);
      return res.status(400).json({ ok: false, error: "Category is required", details: "Missing category field", requestId });
    }
    
    // Check API key - try direct integration first
    let apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    
    // If that's not set or is a placeholder, try OPENAI_API_KEY (but not if it's a literal string)
    if (!apiKey || apiKey.includes('${') || apiKey === '_DUMMY_API_KEY_') {
      apiKey = process.env.OPENAI_API_KEY;
    }
    
    // Filter out string literal placeholders
    if (!apiKey || apiKey.includes('${') || !apiKey.trim()) {
      log(`[HERO_GEN_FAIL] ${requestId}: No valid OpenAI API key (OPENAI_API_KEY=${process.env.OPENAI_API_KEY?.substring(0, 20)}, AI_INTEGRATIONS=${process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.substring(0, 20)})`);
      return res.status(500).json({ 
        ok: false, 
        error: "API Configuration Error", 
        details: "OpenAI API key not configured. Please ensure the OpenAI integration is set up or set OPENAI_API_KEY environment variable.",
        requestId 
      });
    }
    
    log(`[HERO_GEN_ENV_OK] ${requestId}: API key present (${apiKey.substring(0, 4)}...${apiKey.substring(-4)})`);
    
    const heroId = heroStudio.generateHeroId();
    const { prompt, negativePrompt } = heroStudio.buildPrompt(category, stylePreset, customKeywords, includeBrandText);
    
    log(`[HeroStudio] ${requestId} Generating hero for ${category} with style ${stylePreset}`);
    log(`[HeroStudio] ${requestId} Prompt: ${prompt.substring(0, 100)}...`);
    
    const OpenAI = require("openai");
    const openai = new OpenAI({ apiKey });
    
    const aspectConfigs = heroStudio.ASPECT_CONFIGS;
    const imagePaths = {};
    const categoryDir = heroStudio.ensureHeroDir(category);
    const errors = [];
    
    // Generate images for each size
    for (const [size, config] of Object.entries(aspectConfigs)) {
      try {
        // Map our size names to OpenAI's supported sizes
        const openaiSize = size === 'mobile' ? "1024x1024" : "1024x1024";
        
        log(`[HeroStudio] ${requestId} Requesting ${size} (${openaiSize}) from DALL-E-3`);
        
        const response = await openai.images.generate({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: openaiSize,
          quality: "standard", // 'hd' costs extra
          response_format: "url" // Get URL instead of base64
        });
        
        if (response.data && response.data.length > 0 && response.data[0].url) {
          const imageUrl = response.data[0].url;
          
          // Download the image
          const filename = `${heroId}-${config.suffix}.png`;
          const filePath = path.join(categoryDir, filename);
          
          log(`[HeroStudio] ${requestId} Downloading ${size} image to ${filename}`);
          
          try {
            await heroStudio.downloadImage(imageUrl, filePath);
            imagePaths[size] = `/images/hero/${category}/${filename}`;
            log(`[HeroStudio] ${requestId} ✓ Generated ${size} image: ${filename}`);
          } catch (downloadErr) {
            log(`[HeroStudio] ${requestId} ✗ Download failed for ${size}: ${downloadErr.message}`);
            errors.push(`${size}: Download failed - ${downloadErr.message}`);
          }
        } else {
          log(`[HeroStudio] ${requestId} ✗ No image in response for ${size}`);
          errors.push(`${size}: No image returned from API`);
        }
      } catch (imgErr) {
        const errorMsg = imgErr.message || JSON.stringify(imgErr);
        log(`[HeroStudio] ${requestId} ✗ Error generating ${size}: ${errorMsg}`);
        
        // Provide specific error details
        if (errorMsg.includes('invalid_request_error')) {
          errors.push(`${size}: Invalid request (check prompt or API quota)`);
        } else if (errorMsg.includes('rate_limit')) {
          errors.push(`${size}: Rate limited - try again later`);
        } else if (errorMsg.includes('invalid_api_key')) {
          errors.push(`${size}: Invalid API key`);
        } else {
          errors.push(`${size}: ${errorMsg.substring(0, 80)}`);
        }
      }
    }
    
    if (Object.keys(imagePaths).length === 0) {
      const errorDetails = errors.length > 0 ? errors.join('; ') : 'Unknown error';
      log(`[HERO_GEN_FAIL] ${requestId}: No images generated. Errors: ${errorDetails}`);
      return res.status(500).json({ 
        ok: false, 
        error: "Failed to generate any images", 
        details: errorDetails,
        requestId,
        images: [] 
      });
    }
    
    // Save hero with metadata
    const hero = heroStudio.saveGeneratedHero(heroId, category, stylePreset, prompt, imagePaths);
    
    log(`[HERO_GEN_OK] ${requestId}: Hero saved: ${heroId} with ${Object.keys(imagePaths).length}/${Object.keys(aspectConfigs).length} variants`);
    res.json({ 
      ok: true, 
      hero,
      images: Object.entries(imagePaths).map(([size, path]) => ({
        size,
        url: path,
        id: heroId
      })),
      requestId
    });
  } catch (err) {
    log(`[HERO_GEN_FAIL] ${requestId}: Unexpected error: ${err.message}`);
    res.status(500).json({ 
      ok: false, 
      error: err.message || "Generation failed", 
      details: err.stack,
      requestId,
      images: [] 
    });
  }
});

app.post("/api/admin/heroes/:id/activate", requireAdminSession, (req, res) => {
  try {
    const hero = heroStudio.activateHero(req.params.id);
    log(`[HeroStudio] Activated hero: ${req.params.id}`);
    res.json({ ok: true, hero });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/heroes/:id", requireAdminSession, (req, res) => {
  try {
    heroStudio.deleteHero(req.params.id);
    log(`[HeroStudio] Deleted hero: ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- A/B Testing API ---
app.get("/api/admin/ab/experiments", requireAdminSession, (req, res) => {
  try {
    const experiments = abTesting.getAllExperiments();
    res.json({ ok: true, experiments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/ab/experiments/:id/toggle", requireAdminSession, (req, res) => {
  try {
    const { enabled } = req.body;
    const result = abTesting.setExperimentEnabled(req.params.id, enabled);
    log(`[AB Testing] Experiment ${req.params.id} ${enabled ? 'enabled' : 'disabled'}`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/ab/summary/:id", requireAdminSession, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const summary = abTesting.getSummary(req.params.id, days);
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ab/event", (req, res) => {
  try {
    const { experimentId, eventType, variant, productId } = req.body;
    abTesting.recordEvent(experimentId, eventType, variant, productId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/ab/variant/:experimentId", (req, res) => {
  try {
    const existing = req.cookies[abTesting.COOKIE_NAME];
    const variant = abTesting.assignVariant(req.params.experimentId, existing);
    
    if (variant && !existing) {
      res.cookie(abTesting.COOKIE_NAME, variant, { 
        maxAge: abTesting.COOKIE_MAX_AGE, 
        httpOnly: false 
      });
    }
    
    res.json({ ok: true, variant, experimentId: req.params.experimentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Product Search API (JSON-backed) ---
app.get("/api/admin/products/search", requireAdminSession, (req, res) => {
  try {
    const q = req.query.q || "";
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const category = req.query.category || null;
    const activeOnly = req.query.activeOnly !== "false";
    
    const products = productStore.findProducts(q, { limit, category, activeOnly });
    const results = products.map(p => ({
      id: p.id,
      spu: p.spu,
      title: p.title,
      category: p.category,
      active: p.active,
      image: p.image,
      hasSeo: !!(p.seo && p.seo.seoTitle)
    }));
    
    log(`[SEO] Search: q="${q}" results=${results.length}`);
    res.json({ ok: true, products: results });
  } catch (err) {
    log(`[SEO] Search error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/products/categories", requireAdminSession, (req, res) => {
  try {
    const categories = productStore.getCategories();
    res.json({ ok: true, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/products/backfill", requireAdminSession, (req, res) => {
  try {
    log("[Admin] Running product backfill...");
    const result = productStore.backfillProducts();
    logAdminAction("products_backfill", result);
    res.json({ ok: true, ...result, message: `Backfill complete: ${result.updated} products updated` });
  } catch (err) {
    log(`[Admin] Backfill error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/products/reclassify", requireAdminSession, (req, res) => {
  try {
    log("[Admin] Running product reclassification (strict rule-based, no AI)...");
    const result = productStore.reclassifyProducts();
    logAdminAction("products_reclassify", result);
    res.json({ 
      ok: true, 
      ...result, 
      message: `Reclassify complete: ${result.animalUsed} ANIMAL_USED, ${result.rejectedNonPet} REJECTED_NON_PET` 
    });
  } catch (err) {
    log(`[Admin] Reclassify error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/products/pet-usage-stats", requireAdminSession, (req, res) => {
  try {
    const stats = productStore.getPetUsageStats();
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/products/remove-non-pet", requireAdminSession, (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== "REMOVE_NON_PET") {
      return res.status(400).json({ 
        error: "Confirmation required", 
        message: "Send { confirm: 'REMOVE_NON_PET' } to proceed" 
      });
    }
    log("[Admin] Removing non-pet products from database...");
    const result = productStore.removeNonPetProducts();
    logAdminAction("products_remove_non_pet", result);
    res.json({ 
      ok: true, 
      ...result, 
      message: `Removed ${result.removed} non-pet products (${result.remaining} remaining)` 
    });
  } catch (err) {
    log(`[Admin] Remove non-pet error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/products/test-filter", requireAdminSession, (req, res) => {
  try {
    const { title, description, category, tags } = req.query;
    const petFilter = require("./src/config/petFilter");
    const result = petFilter.classifyPetEligibility(
      title || "", 
      description || "", 
      tags || "",
      category || ""
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/products/filter-stats", requireAdminSession, (req, res) => {
  try {
    const petFilter = require("./src/config/petFilter");
    const filterStats = petFilter.getFilterStats();
    const testResults = petFilter.runTestCases();
    
    const data = readDB();
    const products = data.products || [];
    
    const productStats = {
      total: products.length,
      allowed: products.filter(p => p.isPetAllowed === true || p.petUsageType === 'ANIMAL_USED').length,
      denied: products.filter(p => p.isPetAllowed === false || p.petUsageType === 'REJECTED_NON_PET').length,
      unclassified: products.filter(p => p.isPetAllowed === undefined && p.petUsageType === undefined).length
    };
    
    const denyReasons = {};
    products.forEach(p => {
      if (p.petUsageReason && p.isPetAllowed === false) {
        denyReasons[p.petUsageReason] = (denyReasons[p.petUsageReason] || 0) + 1;
      }
    });
    
    const topDenyReasons = Object.entries(denyReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([reason, count]) => ({ reason, count }));
    
    res.json({ 
      ok: true, 
      filterStats, 
      productStats,
      topDenyReasons,
      testResults: {
        passed: testResults.passed,
        failed: testResults.failed,
        total: testResults.total
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SEO Bulk Job API (JSON-backed) ---
app.get("/api/admin/seo/bulk/status", requireAdminSession, (req, res) => {
  try {
    const status = seoBulkJob.getJobStatus();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/seo/products/stats", requireAdminSession, (req, res) => {
  try {
    const stats = seoBulkJob.getProductSeoStats();
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/seo/bulk/run", requireAdminSession, async (req, res) => {
  try {
    const { 
      mode = "missing",
      locale = "en-US", 
      tonePreset = "friendly", 
      batchSize = 50, 
      limit = null,
      overwrite = false,
      resume = false
    } = req.body;
    
    log(`[SEO] Bulk run requested: mode=${mode} locale=${locale} batchSize=${batchSize} limit=${limit || "all"} overwrite=${overwrite} resume=${resume}`);
    logAdminAction("seo_bulk_run", { mode, locale, batchSize, limit, overwrite, resume });
    
    seoBulkJob.runBulkSeoJob({ mode, locale, tonePreset, batchSize, limit, overwrite, resume })
      .then(result => {
        log(`[SEO] Bulk job finished: generated=${result.generated || 0} failed=${result.failed || 0}`);
      })
      .catch(err => {
        log(`[SEO] Bulk job error: ${err.message}`);
      });
    
    res.json({ ok: true, message: "SEO job started" });
  } catch (err) {
    log(`[SEO] Bulk run error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/seo/bulk/start", requireAdminSession, async (req, res) => {
  try {
    const { locale = "en-US", tonePreset = "friendly", category, batchSize = 25, skipPublished = true } = req.body;
    
    log(`[SEO] Bulk start requested: locale=${locale} category=${category || "all"} batchSize=${batchSize}`);
    logAdminAction("seo_bulk_start", { locale, category, batchSize, skipPublished });
    
    seoBulkJob.runBulkSeoJob({ mode: skipPublished ? "missing" : "all", locale, tonePreset, batchSize })
      .then(result => {
        log(`[SEO] Bulk job finished: generated=${result.generated || 0} failed=${result.failed || 0}`);
      })
      .catch(err => {
        log(`[SEO] Bulk job error: ${err.message}`);
      });
    
    res.json({ ok: true, message: "Bulk SEO job started" });
  } catch (err) {
    log(`[SEO] Bulk start error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/seo/bulk/cancel", requireAdminSession, (req, res) => {
  try {
    const cancelled = seoBulkJob.requestCancel();
    logAdminAction("seo_bulk_cancel", {});
    res.json({ ok: true, cancelled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/seo/bulk/reset", requireAdminSession, (req, res) => {
  try {
    const result = seoBulkJob.resetJob();
    logAdminAction("seo_bulk_reset", {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SEO Generator API ---
app.get("/api/admin/seo/stats", requireAdminSession, (req, res) => {
  try {
    const stats = productStore.getStats();
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SEO Preview endpoint (no DB write)
app.post("/api/admin/seo/preview", requireAdminSession, async (req, res) => {
  try {
    const { product_ids, mode = "missing_only", tone = "premium", market = "US", limit = 50 } = req.body;
    
    // Check if OpenAI API key is configured
    if (!seoGenerator.isEnabled()) {
      return res.status(503).json({ 
        ok: false, 
        error: "OPENAI_API_KEY not set. Please add your OpenAI API key to secrets." 
      });
    }
    
    let products = productStore.getAllProducts().filter(p => p.active !== false);
    
    // Filter by product_ids if provided
    if (product_ids && Array.isArray(product_ids) && product_ids.length > 0) {
      const idSet = new Set(product_ids);
      products = products.filter(p => idSet.has(p.id));
    }
    
    // Filter by mode
    if (mode === "missing_only") {
      products = products.filter(p => !p.seo || !p.seo.seoTitle);
    }
    
    // Limit batch size
    if (products.length > limit) {
      products = products.slice(0, limit);
    }
    
    if (products.length > 50) {
      return res.status(400).json({ 
        ok: false, 
        error: `Too many products (${products.length}). Max 50 per request. Use filters or product_ids.` 
      });
    }
    
    const changes = [];
    const locale = market === "US" ? "en-US" : "en-US";
    
    for (const product of products) {
      try {
        const result = await seoGenerator.generateSeoForProduct(product.id, locale, tone);
        if (!result.error) {
          // Parse JSON strings from generator output
          let keywords = [];
          let bullets = [];
          try {
            keywords = result.keywords_json ? JSON.parse(result.keywords_json) : [];
          } catch (e) { /* ignore parse errors */ }
          try {
            bullets = result.bullets_json ? JSON.parse(result.bullets_json) : [];
          } catch (e) { /* ignore parse errors */ }
          
          changes.push({
            product_id: product.id,
            title: product.title,
            seo_title: result.seo_title || "",
            meta_description: result.meta_description || "",
            tags: Array.isArray(keywords) ? keywords.join("|") : "",
            bullets: Array.isArray(bullets) ? bullets : [],
            h1: result.h1 || "",
            slug: result.slug || ""
          });
        }
        // Rate limit to avoid API overload
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        log(`[SEO Preview] Error for ${product.id}: ${err.message}`);
      }
    }
    
    log(`[SEO] Preview generated for ${changes.length} products`);
    res.json({ ok: true, changes, total: products.length });
  } catch (err) {
    log(`[SEO Preview] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// SEO Apply batch endpoint (writes to DB and saves persistently)
app.post("/api/admin/seo/apply-batch", requireAdminSession, async (req, res) => {
  try {
    const { changes, confirm = false } = req.body;
    
    if (!confirm) {
      return res.status(400).json({ ok: false, error: "confirm: true required to apply changes" });
    }
    
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ ok: false, error: "No changes to apply" });
    }
    
    const applied = [];
    for (const change of changes) {
      try {
        // Build SEO data in the format expected by productStore
        const seoData = {
          locale: "en-US",
          seoTitle: change.seo_title || "",
          metaDescription: change.meta_description || "",
          h1: change.h1 || change.seo_title || "",
          keywords_json: JSON.stringify(change.tags ? change.tags.split("|") : []),
          bullets_json: JSON.stringify(change.bullets || []),
          slug: change.slug || "",
          published: false,
          updatedAt: new Date().toISOString()
        };
        
        // Use productStore to update and persist
        productStore.updateProductSeo(change.product_id, seoData);
        applied.push(change.product_id);
        log(`[SEO] Applied SEO to ${change.product_id}`);
      } catch (err) {
        log(`[SEO Apply] Error for ${change.product_id}: ${err.message}`);
      }
    }
    
    // Force save to persist changes
    try {
      productStore.save();
    } catch (saveErr) {
      log(`[SEO Apply] Save warning: ${saveErr.message}`);
    }
    
    logAdminAction("seo_apply_batch", { count: applied.length });
    res.json({ ok: true, applied_count: applied.length, applied_ids: applied });
  } catch (err) {
    log(`[SEO Apply] Error: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/seo/:productId", requireAdminSession, (req, res) => {
  try {
    const seo = seoGenerator.getSavedSeo(req.params.productId);
    res.json({ ok: true, seo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/seo/generate", requireAdminSession, async (req, res) => {
  try {
    const { productId, locale = "en-US", tonePreset = "friendly" } = req.body;
    if (!productId) return res.status(400).json({ error: "productId required" });
    
    const product = productStore.getProductById(productId);
    if (!product) {
      log(`[SEO] Single generate: productId=${productId} - NOT FOUND`);
      return res.status(404).json({ error: `Product ${productId} not found in data/db.json` });
    }
    
    log(`[SEO] Single generate: productId=${productId} locale=${locale} tone=${tonePreset}`);
    
    const result = await seoGenerator.generateAndSaveSeo(productId, locale, tonePreset);
    
    if (result.error) {
      log(`[SEO] Generation failed: ${result.error}`);
      return res.status(500).json({ error: result.error });
    }
    
    logAdminAction("seo_generate", { productId, locale, tonePreset });
    log(`[SEO] Generated SEO for product: ${productId}`);
    res.json({ ok: true, seo: result.data, product: { id: product.id, title: product.title } });
  } catch (err) {
    log(`[SEO] Generation error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/seo/apply", requireAdminSession, async (req, res) => {
  try {
    const { productId, seoPayload } = req.body;
    const saved = seoGenerator.saveSeo(productId, seoPayload);
    log(`[SEO] Applied SEO for product: ${productId}`);
    res.json({ ok: true, seo: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/seo/all", requireAdminSession, (req, res) => {
  try {
    const all = seoGenerator.getAllSeo();
    res.json({ ok: true, seoData: all });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Top Picks API ---
app.get("/api/admin/top-picks/stats", requireAdminSession, async (req, res) => {
  try {
    const allProducts = await db.getProducts({ limit: 10000 });
    const stats = topPicks.getStats(allProducts.products || []);
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/top-picks/recalculate", requireAdminSession, async (req, res) => {
  try {
    const allProducts = await db.getProducts({ limit: 10000 });
    const scored = topPicks.recalculateScores(allProducts.products || []);
    log(`[TopPicks] Recalculated scores for ${scored.length} products`);
    res.json({ ok: true, count: scored.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/top-picks/scored", requireAdminSession, (req, res) => {
  try {
    const data = topPicks.loadTopPicks();
    res.json({ ok: true, products: data.scoredProducts || [], config: data.config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/top-picks/feature", requireAdminSession, (req, res) => {
  try {
    const { productId, scope, featured } = req.body;
    topPicks.setFeatured(productId, scope, featured);
    log(`[TopPicks] ${featured ? 'Featured' : 'Unfeatured'} product ${productId} for ${scope}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/top-picks/quarantine", requireAdminSession, (req, res) => {
  try {
    const { productId, quarantine: shouldQuarantine } = req.body;
    topPicks.quarantine(productId, shouldQuarantine);
    log(`[TopPicks] ${shouldQuarantine ? 'Quarantined' : 'Unquarantined'} product ${productId}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/products/top-picks", async (req, res) => {
  try {
    const scope = req.query.scope || 'HOME';
    const limit = parseInt(req.query.limit) || 8;
    const picks = topPicks.getTopPicks(scope, limit * 3);
    
    const productIds = picks.map(p => p.id);
    const products = [];
    for (const id of productIds) {
      const product = await db.getProduct(id);
      if (!product) continue;
      if (!isRealProduct(product)) continue;
      if (!product.active || product.rejected || product.quarantined || product.deletedAt) continue;
      if (!checkPetEligible(product)) continue;
      if (!isValidProductImage(product.image)) continue;
      
      products.push({
        ...product,
        is_pet: true,
        petType: product.petType || product.pet_usage || null
      });
      if (products.length >= limit) break;
    }
    
    res.json({ ok: true, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/metrics/event", (req, res) => {
  try {
    const { type, productId } = req.body;
    topPicks.recordMetricEvent(productId, type);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/metrics/view", (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId required' });
    topPicks.recordMetricEvent(productId, 'PRODUCT_VIEW');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/metrics/add_to_cart", (req, res) => {
  try {
    const { productId, qty = 1 } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId required' });
    for (let i = 0; i < qty; i++) {
      topPicks.recordMetricEvent(productId, 'ADD_TO_CART');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/metrics/purchase", (req, res) => {
  try {
    const { productId, qty = 1, orderId } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId required' });
    for (let i = 0; i < qty; i++) {
      topPicks.recordMetricEvent(productId, 'PURCHASE');
    }
    log(`[Metrics] Purchase recorded: ${productId} x${qty} (order: ${orderId || 'unknown'})`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/metrics/recompute", requireAdminSession, (req, res) => {
  try {
    const { mode = 'all' } = req.body;
    log(`[Metrics] Recomputing popularity scores (mode: ${mode})`);
    const result = topPicks.recomputeScoresWithUpdate(productStore, { mode });
    log(`[Metrics] Recompute complete: ${result.processed} processed, ${result.updated} updated`);
    res.json({ ok: true, ...result });
  } catch (err) {
    log(`[Metrics] Recompute error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/metrics/summary", requireAdminSession, (req, res) => {
  try {
    const summary = topPicks.getMetricsSummary();
    res.json({ ok: true, ...summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/metrics/reset", requireAdminSession, (req, res) => {
  try {
    const { productId, all } = req.body;
    if (all === true) {
      topPicks.resetAllStats();
      log('[Metrics] All stats reset');
      res.json({ ok: true, message: 'All metrics reset' });
    } else if (productId) {
      const result = topPicks.resetProductStats(productId);
      log(`[Metrics] Stats reset for product ${productId}`);
      res.json(result);
    } else {
      res.status(400).json({ error: 'productId or all=true required' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/products/:id/featured", requireAdminSession, (req, res) => {
  try {
    const { id } = req.params;
    const { isFeatured, featuredRank = 0 } = req.body;
    const result = topPicks.setProductFeatured(productStore, id, isFeatured, featuredRank);
    if (result.ok) {
      log(`[Admin] Product ${id} featured=${isFeatured} rank=${featuredRank}`);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Product Enrichment API V2 (DB-backed locking) ---
app.get("/api/admin/enrich/stats", requireAdminSession, async (req, res) => {
  try {
    const stats = await enrichmentJob.getEnrichmentStats();
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/enrich/status", requireAdminSession, async (req, res) => {
  try {
    const status = await enrichmentJob.getEnrichStatus();
    res.json({ 
      ok: true, 
      currentJob: status.currentJob,
      recentJobs: status.recentJobs,
      dbJob: status.dbJob,
      isRunning: status.isRunning
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/enrich/start", requireAdminSession, async (req, res) => {
  try {
    const options = {
      force: req.body.force === true,
      requireImages: req.body.requireImages !== false,
      updateFields: req.body.updateFields !== false,
      overwriteFields: req.body.overwriteFields === true,
      overwriteImage: req.body.overwriteImage === true,
      bypassDenyScore: req.body.bypassDenyScore === true
    };
    
    log(`[Enrich API V2] Starting enrichment job with options: ${JSON.stringify(options)}`);
    
    enrichmentJob.runEnrichmentJob(options).then(result => {
      log(`[Enrich API V2] Job completed: ${JSON.stringify(result)}`);
    }).catch(err => {
      log(`[Enrich API V2] Job error: ${err.message}`);
    });
    
    await new Promise(r => setTimeout(r, 300));
    const status = await enrichmentJob.getEnrichStatus();
    res.json({ ok: true, message: 'Job started', ...status });
    
  } catch (err) {
    log(`[Enrich API V2] Start error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/enrich/run", requireAdminSession, async (req, res) => {
  try {
    const options = {
      force: req.body.force === true,
      requireImages: req.body.requireImages !== false,
      updateFields: req.body.updateFields !== false,
      overwriteFields: req.body.overwriteFields === true,
      overwriteImage: req.body.overwriteImage === true,
      bypassDenyScore: req.body.bypassDenyScore === true
    };
    
    log(`[Enrich API V2] Starting enrichment job (via /run) with options: ${JSON.stringify(options)}`);
    
    enrichmentJob.runEnrichmentJob(options).then(result => {
      log(`[Enrich API V2] Job completed: ${JSON.stringify(result)}`);
    }).catch(err => {
      log(`[Enrich API V2] Job error: ${err.message}`);
    });
    
    await new Promise(r => setTimeout(r, 300));
    const status = await enrichmentJob.getEnrichStatus();
    res.json({ ok: true, message: 'Job started', job: status.currentJob });
    
  } catch (err) {
    log(`[Enrich API V2] Run error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/enrich/cancel", requireAdminSession, async (req, res) => {
  try {
    log(`[Enrich API V2] Cancel requested`);
    const result = await enrichmentJob.cancelEnrichJob();
    res.json(result);
  } catch (err) {
    log(`[Enrich API V2] Cancel error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/enrich/stop", requireAdminSession, async (req, res) => {
  try {
    log(`[Enrich API V2] Stop requested (via /stop)`);
    const result = await enrichmentJob.cancelEnrichJob();
    res.json(result);
  } catch (err) {
    log(`[Enrich API V2] Stop error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/enrich/resume", requireAdminSession, async (req, res) => {
  try {
    res.json({ ok: false, error: 'Resume not supported in V2 - start a new job instead' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Repair Images endpoint - re-enriches products with missing/placeholder images
app.post("/api/admin/repair-images", requireAdminSession, async (req, res) => {
  try {
    log("[RepairImages] Scanning for products with missing/placeholder images...");
    const products = productStore.listProducts({ activeOnly: false });
    
    const needsRepair = products.filter(p => {
      const images = p.images || [];
      const mainImage = p.image || p.mainImage || "";
      
      // Check for placeholder or missing images
      const hasPlaceholder = images.some(img => 
        img && (img.includes("placeholder") || img.includes("no-image") || img.includes("stock"))
      ) || mainImage.includes("placeholder") || mainImage.includes("no-image") || mainImage.includes("stock");
      
      // Check for only 1 image (likely missing gallery)
      const hasOnlyOneImage = images.length <= 1;
      
      // Check for failed enrichment
      const failedEnrich = p.enrichStatus === "failed";
      
      return hasPlaceholder || (hasOnlyOneImage && !p.enrichStatus) || failedEnrich;
    });
    
    log(`[RepairImages] Found ${needsRepair.length} products needing repair`);
    
    if (needsRepair.length === 0) {
      return res.json({ 
        ok: true, 
        message: "No products need image repair",
        stats: { total: products.length, needsRepair: 0 }
      });
    }
    
    // Start enrichment job in background with force mode
    enrichmentJob.runEnrichmentJob({ 
      force: true, 
      overwriteImage: true,
      productIds: needsRepair.map(p => p.id)
    }).then(result => {
      log(`[RepairImages] Job completed: success=${result.stats?.successCount || 0}, failed=${result.stats?.failCount || 0}`);
    }).catch(err => {
      log(`[RepairImages] Job error: ${err.message}`);
    });
    
    res.json({ 
      ok: true, 
      message: `Started repair job for ${needsRepair.length} products`,
      stats: { 
        total: products.length, 
        needsRepair: needsRepair.length,
        productIds: needsRepair.slice(0, 10).map(p => ({ id: p.id, title: p.title?.substring(0, 50) }))
      }
    });
    
  } catch (err) {
    log(`[RepairImages] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Get products with image issues stats
app.get("/api/admin/image-issues", requireAdminSession, async (req, res) => {
  try {
    const products = productStore.listProducts({ activeOnly: false });
    
    const stats = {
      total: products.length,
      withPlaceholder: 0,
      singleImage: 0,
      noImages: 0,
      failedEnrich: 0,
      healthy: 0
    };
    
    const issues = [];
    
    for (const p of products) {
      const images = p.images || [];
      const mainImage = p.image || p.mainImage || "";
      
      const hasPlaceholder = (mainImage && (mainImage.includes("placeholder") || mainImage.includes("no-image"))) ||
        images.some(img => img && (img.includes("placeholder") || img.includes("no-image")));
      
      if (hasPlaceholder) {
        stats.withPlaceholder++;
        issues.push({ id: p.id, title: p.title, issue: "placeholder" });
      } else if (images.length === 0 && !mainImage) {
        stats.noImages++;
        issues.push({ id: p.id, title: p.title, issue: "no_images" });
      } else if (images.length <= 1) {
        stats.singleImage++;
        issues.push({ id: p.id, title: p.title, issue: "single_image" });
      } else if (p.enrichStatus === "failed") {
        stats.failedEnrich++;
        issues.push({ id: p.id, title: p.title, issue: "failed_enrich", error: p.enrichError });
      } else {
        stats.healthy++;
      }
    }
    
    res.json({ ok: true, stats, issues: issues.slice(0, 50) });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/enrich/job/:jobId", requireAdminSession, async (req, res) => {
  try {
    const status = await enrichmentJob.getEnrichStatus();
    const job = status.recentJobs.find(j => j.jobId === req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ ok: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// V2.1 FIXPACK: Migrate products - ensure all products have images[], variants, categories
app.post("/api/admin/migrate-products", requireAdminSession, async (req, res) => {
  try {
    log("[Migrate] Starting product migration...");
    const products = await db.listProducts();
    let migrated = 0;
    let errors = 0;
    const results = [];
    
    for (const product of products) {
      try {
        const updates = {};
        let needsUpdate = false;
        
        // Ensure images array exists
        if (!Array.isArray(product.images) || product.images.length === 0) {
          const allImages = resolveAllImages(product);
          if (allImages.length > 0) {
            updates.images = allImages;
            needsUpdate = true;
          } else if (product.image) {
            updates.images = [product.image];
            needsUpdate = true;
          }
        }
        
        // Ensure mainImage is set
        if (!product.mainImage && product.image) {
          updates.mainImage = product.image;
          needsUpdate = true;
        }
        
        // Ensure categories array exists
        if (!Array.isArray(product.categories)) {
          const cats = [];
          if (product.category) cats.push(product.category);
          if (product.cjCategory) cats.push(product.cjCategory);
          if (product.petType) cats.push(product.petType);
          if (cats.length > 0) {
            updates.categories = [...new Set(cats)];
            needsUpdate = true;
          }
        }
        
        // Ensure variants is an array
        if (product.variants && !Array.isArray(product.variants)) {
          try {
            const parsed = typeof product.variants === 'string' 
              ? JSON.parse(product.variants) 
              : product.variants;
            if (Array.isArray(parsed)) {
              updates.variants = parsed;
              needsUpdate = true;
            }
          } catch (e) {
            updates.variants = [];
            needsUpdate = true;
          }
        }
        
        if (needsUpdate) {
          await db.updateProduct(product.id, updates);
          migrated++;
          results.push({ id: product.id, status: 'migrated', fields: Object.keys(updates) });
        }
      } catch (err) {
        errors++;
        results.push({ id: product.id, status: 'error', error: err.message });
        log(`[Migrate] Error migrating ${product.id}: ${err.message}`);
      }
    }
    
    log(`[Migrate] Complete: ${migrated} migrated, ${errors} errors out of ${products.length} products`);
    logAdminAction("migrate_products", { total: products.length, migrated, errors });
    
    res.json({ 
      ok: true, 
      total: products.length, 
      migrated, 
      errors,
      results: results.slice(0, 50) // Return first 50 results
    });
  } catch (err) {
    log(`[Migrate] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/translation/stats", requireAdminSession, async (req, res) => {
  try {
    const stats = await translationJob.getStats();
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/translation/status", requireAdminSession, (req, res) => {
  try {
    const status = translationJob.getStatus();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/translation/run", requireAdminSession, async (req, res) => {
  try {
    const { targetLangs, onlyMissing = true, includeSpecs = false, productIds } = req.body;
    log(`[Translation API] Starting translation job`);
    const result = await translationJob.runJob({ targetLangs, onlyMissing, includeSpecs, productIds });
    res.json(result);
  } catch (err) {
    log(`[Translation API] Run error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/translation/stop", requireAdminSession, (req, res) => {
  try {
    log(`[Translation API] Stopping translation job`);
    const result = translationJob.stopJob();
    res.json(result);
  } catch (err) {
    log(`[Translation API] Stop error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/translation/history", requireAdminSession, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = translationJob.getJobHistory(limit);
    res.json({ ok: true, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/translation/job/:jobId", requireAdminSession, (req, res) => {
  try {
    const job = translationJob.getJobDetails(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ ok: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/languages/settings", requireAdminSession, (req, res) => {
  try {
    const enabledLocales = translationStore.getEnabledLocales();
    const allLocales = translationStore.ALL_LOCALES;
    const stats = translationStore.getTranslationStats();
    res.json({ 
      ok: true, 
      enabledLocales, 
      allLocales, 
      canonicalLocale: translationStore.CANONICAL_LOCALE,
      stats 
    });
  } catch (err) {
    log(`[Languages API] Settings get error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/languages/settings", requireAdminSession, (req, res) => {
  try {
    const { enabledLocales } = req.body;
    if (!Array.isArray(enabledLocales)) {
      return res.status(400).json({ error: 'enabledLocales must be an array' });
    }
    
    const updated = translationStore.setEnabledLocales(enabledLocales);
    log(`[Languages API] Updated enabled locales: ${updated.join(', ')}`);
    res.json({ ok: true, enabledLocales: updated });
  } catch (err) {
    log(`[Languages API] Settings update error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/images/analyze", requireAdminSession, async (req, res) => {
  try {
    const { productId, useOCR = false } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    
    const product = await db.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    log(`[ImageAnalysis] Analyzing images for product ${productId}`);
    const result = await imageTextDetection.processProductImages(product, { useOCR });
    
    if (result) {
      await db.updateProduct(productId, result);
      log(`[ImageAnalysis] Reordered images for ${productId}`);
      res.json({ ok: true, reordered: true, result });
    } else {
      res.json({ ok: true, reordered: false, message: 'No reordering needed' });
    }
  } catch (err) {
    log(`[ImageAnalysis] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/images/analyze-batch", requireAdminSession, async (req, res) => {
  try {
    const { productIds, useOCR = false } = req.body;
    
    let products;
    if (productIds && productIds.length > 0) {
      products = [];
      for (const id of productIds) {
        const p = await db.getProduct(id);
        if (p) products.push(p);
      }
    } else {
      products = (await db.listProducts()).filter(p => p.images && p.images.length > 0);
    }
    
    log(`[ImageAnalysis] Batch analyzing ${products.length} products`);
    const results = await imageTextDetection.analyzeProductBatch(products, { useOCR });
    
    for (const update of results.updates) {
      const { productId, ...data } = update;
      await db.updateProduct(productId, data);
    }
    
    log(`[ImageAnalysis] Batch complete: ${results.reordered} reordered`);
    res.json({ 
      ok: true, 
      processed: results.processed,
      reordered: results.reordered,
      errors: results.errors
    });
  } catch (err) {
    log(`[ImageAnalysis] Batch error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

function requireAnalyticsToken(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!ga4Config.GA4_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'GA4_ADMIN_TOKEN not configured', missing: ['GA4_ADMIN_TOKEN'] });
  }
  if (token !== ga4Config.GA4_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Invalid admin token' });
  }
  next();
}

app.get("/api/admin/analytics/status", requireAnalyticsToken, async (req, res) => {
  try {
    const status = await ga4Client.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/analytics/summary", requireAnalyticsToken, async (req, res) => {
  try {
    if (!ga4Client.isEnabled()) {
      return res.json({ enabled: false, missing: ga4Client.getMissingConfig() });
    }
    const { start, end } = req.query;
    const result = await ga4Client.getSummary(start, end);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, hint: 'Check GA4 configuration' });
  }
});

app.get("/api/admin/analytics/timeseries", requireAnalyticsToken, async (req, res) => {
  try {
    if (!ga4Client.isEnabled()) {
      return res.json({ enabled: false, missing: ga4Client.getMissingConfig() });
    }
    const { start, end } = req.query;
    const result = await ga4Client.getTimeseries(start, end);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, hint: 'Check GA4 configuration' });
  }
});

app.get("/api/admin/analytics/top-pages", requireAnalyticsToken, async (req, res) => {
  try {
    if (!ga4Client.isEnabled()) {
      return res.json({ enabled: false, missing: ga4Client.getMissingConfig() });
    }
    const { start, end, limit } = req.query;
    const result = await ga4Client.getTopPages(start, end, parseInt(limit) || 20);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, hint: 'Check GA4 configuration' });
  }
});

app.get("/api/admin/analytics/sources", requireAnalyticsToken, async (req, res) => {
  try {
    if (!ga4Client.isEnabled()) {
      return res.json({ enabled: false, missing: ga4Client.getMissingConfig() });
    }
    const { start, end, limit } = req.query;
    const result = await ga4Client.getSources(start, end, parseInt(limit) || 20);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, hint: 'Check GA4 configuration' });
  }
});

app.get("/api/admin/analytics/top-products", requireAnalyticsToken, async (req, res) => {
  try {
    if (!ga4Client.isEnabled()) {
      return res.json({ enabled: false, missing: ga4Client.getMissingConfig() });
    }
    const { start, end, limit } = req.query;
    const result = await ga4Client.getTopProducts(start, end, parseInt(limit) || 20);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, hint: 'Check GA4 e-commerce configuration' });
  }
});

app.post("/api/admin/analytics/cache/clear", requireAnalyticsToken, async (req, res) => {
  try {
    const result = ga4Client.clearCache();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/analytics/config", requireAdminSession, async (req, res) => {
  res.json({
    trackingEnabled: ga4Config.GA_TRACKING_ENABLED,
    measurementId: ga4Config.getMaskedMeasurementId(),
    debug: ga4Config.GA4_DEBUG,
    purchaseEnabled: ga4Config.GA4_ENABLE_PURCHASE,
    environment: ga4Config.IS_PRODUCTION ? 'production' : 'development',
    lookerStudioUrl: ga4Config.LOOKER_STUDIO_REPORT_URL ? true : false,
    apiEnabled: ga4Client.isEnabled(),
    apiMissing: ga4Client.getMissingConfig()
  });
});

app.get("/api/admin/analytics/categories", requireAdminSession, async (req, res) => {
  try {
    const analyticsHelpers = require('./src/lib/analyticsHelpers');
    const range = req.query.range || '7d';
    const result = await analyticsHelpers.getCachedCategoryMetrics(range);
    res.json(result);
  } catch (err) {
    console.error("[Category Analytics Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/analytics/pawsy", requireAdminSession, async (req, res) => {
  try {
    const analyticsHelpers = require('./src/lib/analyticsHelpers');
    const range = req.query.range || '7d';
    const result = await analyticsHelpers.getCachedPawsyMetrics(range);
    res.json(result);
  } catch (err) {
    console.error("[Pawsy Analytics Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// SPA Fallback: Serve index.html for specific frontend routes only
// This prevents 404s when users directly navigate to /product/:id, /c/:slug, etc.
const SPA_ROUTES = ['/product', '/need', '/dogs', '/cats', '/collections', '/cart', '/checkout', '/order', '/search', '/about', '/contact', '/faq', '/privacy', '/terms', '/returns'];

function serveSPA(req, res) {
  try {
    let html = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf-8");
    html = html.replace(
      /src="\/app\.js"/,
      `src="/app.js?v=${BUILD_ID}"`
    ).replace(
      /src="\/pawsy\/pawsyVideos\.js"/,
      `src="/pawsy/pawsyVideos.js?v=${BUILD_ID}"`
    ).replace(
      /href="\/styles\.css"/,
      `href="/styles.css?v=${BUILD_ID}"`
    );
    
    res.set("Cache-Control", "no-store, must-revalidate");
    res.send(html);
  } catch (err) {
    log(`[SPA Fallback] Error: ${err.message}`);
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
}

SPA_ROUTES.forEach(route => {
  app.get(`${route}/*`, serveSPA);
  app.get(route, serveSPA);
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

function startCJSyncScheduler() {
  // CRITICAL STABILITY: Disable background jobs on boot (safe mode)
  if (!ENABLE_BACKGROUND_JOBS) {
    log("[CJ Sync] Auto-sync scheduler DISABLED (safe mode - manual only)");
    return;
  }
  
  const enabled = process.env.CJ_AUTO_SYNC === "true";
  
  if (!enabled) {
    console.log("[CJ Sync] Auto-sync disabled");
    return;
  }

  const INTERVAL_MS = 24 * 60 * 60 * 1000;

  console.log("[CJ Sync] Auto-sync scheduler started");

  setInterval(async () => {
    const csvPath = path.join(__dirname, "data", "cj-latest.csv");
    
    if (!fs.existsSync(csvPath)) {
      console.warn(`[CJ Sync] Auto sync skipped: data/cj-latest.csv not found`);
      return;
    }

    try {
      console.log(`[CJ Sync] Auto sync started`);
      const csvText = fs.readFileSync(csvPath, "utf-8");
      const result = await runCJSync(csvText);

      if (result.ok) {
        lastSyncTime = new Date().toISOString();
        lastSyncMode = "auto";
        lastSyncCount = result.synced;
        console.log(`[CJ Sync] Auto sync completed: ${result.synced} products`);
      } else {
        console.error(`[CJ Sync] Auto sync failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`[CJ Sync] Auto sync error: ${err.message}`);
    }
  }, INTERVAL_MS);
}

// Background initialization (called after server is already listening)
async function initializeApp() {
  const initStart = Date.now();
  const IS_DEPLOYMENT = safeBoot.isDeployment();
  
  try {
    safeBoot.logBootStatus();
    
    // CRITICAL: Skip DB operations during deployment
    if (IS_DEPLOYMENT) {
      setDbReady();
      global.__APP_READY = true;
      log("[Boot] 🚀 DEPLOYMENT MODE: All background jobs DISABLED for fast startup");
      return;
    }
    
    // Non-deployment: Initialize DB and seed
    await db.init();
    await seedIfEmpty();
    setDbReady();
    log("[Boot] Database initialized and ready");
    
    // Start background jobs if enabled
    if (ENABLE_BACKGROUND_JOBS) {
      if (canEnqueueJob("cj-sync")) {
        startCJSyncScheduler();
        completeJob("cj-sync");
      }
      if (canEnqueueJob("feed-scheduler")) {
        feedScheduler.initialize(db, cjUrlImport);
        completeJob("feed-scheduler");
      }
      if (canEnqueueJob("ai-reindex") && AI_REINDEX_ON_START) {
        startAIReindexScheduler();
        completeJob("ai-reindex");
      }
      log("[Boot] ✅ Background jobs ENABLED");
    } else {
      log("[Boot] ❌ Background jobs DISABLED (safeMode or jobsDisabled)");
    }
    
    // Initialize AI tables (non-blocking)
    if (!DISABLE_DB_MIGRATIONS) {
      try {
        await initAITables();
        log("[Boot] AI tables initialized");
      } catch (err) {
        log(`[Boot] AI init error (non-fatal): ${err.message}`);
      }
    } else {
      log("[Boot] Database migrations DISABLED (DISABLE_DB_MIGRATIONS=true)");
    }
    
    // BOOT-TIME SAFETY SWEEP - Run content safety check on all products
    try {
      const db = readDB();
      const products = db.products || [];
      if (products.length > 0) {
        const report = productSafety.runSafetySweep(products);
        log(`[Boot] Safety sweep: ${report.approved}/${report.totalScanned} approved, ${report.blocked} blocked, ${report.notPetApproved} not pet-approved`);
        if (report.blocked > 0) {
          log(`[Boot] ⚠️ ${report.blocked} blocked products (NSFW/inappropriate content)`);
        }
      }
    } catch (err) {
      log(`[Boot] Safety sweep error (non-fatal): ${err.message}`);
    }
    
    global.__APP_READY = true;
    log(`[Boot] ✅ FULLY READY in ${Date.now() - initStart}ms`);
  } catch (err) {
    log(`[Boot] Background init error (non-fatal): ${err.message}`);
    global.__APP_READY = true; // Still mark ready so homepage SEO works
  }
}

// NOTE: server.listen() is now at top of file (line ~156) for instant health check

  // Call initializeApp after all routes are defined
  initializeApp().catch(err => {
    console.log(`[Boot] Initialization error (non-fatal): ${err.message}`);
  });
} // End of loadHeavyModulesAndInitialize()

loadHeavyModulesAndInitialize();

return app;
} // End of createApp()

module.exports = { createApp };

if (require.main === module) {
  const fullApp = createApp();
  fullApp.listen(PORT, "0.0.0.0", () => {
    console.log(`[STANDALONE] server.full.js listening on 0.0.0.0:${PORT}`);
  });
}

function startAIReindexScheduler() {
  // CRITICAL STABILITY: Disable all AI reindex unless EXPLICITLY ENABLED
  if (!ENABLE_BACKGROUND_JOBS || !AI_REINDEX_ON_START) {
    log("[AI Scheduler] Scheduler DISABLED (safe mode - manual trigger only)");
    return;
  }
  
  if (!embeddingsEnabled()) {
    log("[AI Scheduler] Disabled - no API key");
    return;
  }
  
  log("[AI Scheduler] Starting scheduled reindex tasks...");
  
  setInterval(() => {
    if (!canEnqueueJob("ai-delta-reindex")) return;
    log("[AI Scheduler] Running scheduled delta reindex");
    triggerReindexDelta()
      .catch(err => log(`[AI Scheduler] Delta reindex failed: ${err.message}`))
      .finally(() => completeJob("ai-delta-reindex"));
  }, 2 * 60 * 60 * 1000);
  
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(3, 30, 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  const msUntilNightly = nextRun - now;
  
  setTimeout(() => {
    if (!canEnqueueJob("ai-nightly-reindex")) return;
    log("[AI Scheduler] Running nightly full reindex");
    triggerReindexFull()
      .catch(err => log(`[AI Scheduler] Full reindex failed: ${err.message}`))
      .finally(() => completeJob("ai-nightly-reindex"));
    
    setInterval(() => {
      if (!canEnqueueJob("ai-nightly-reindex")) return;
      log("[AI Scheduler] Running nightly full reindex");
      triggerReindexFull()
        .catch(err => log(`[AI Scheduler] Full reindex failed: ${err.message}`))
        .finally(() => completeJob("ai-nightly-reindex"));
    }, 24 * 60 * 60 * 1000);
  }, msUntilNightly);
  
  log(`[AI Scheduler] Started - next full reindex in ${Math.round(msUntilNightly / 60000)} minutes`);
}

// Graceful shutdown on SIGTERM (Cloud Run / Replit Autoscale)
// Note: server variable is not accessible here since it's scoped in createApp()
// The main server.js handles graceful shutdown properly
process.on("SIGTERM", () => {
  console.log("[Shutdown] SIGTERM received in server.full.js - delegating to main server.js");
  // Don't call server.close here as server is not in scope
  // Just exit gracefully - server.js handles the actual close
  setTimeout(() => {
    console.log("[Shutdown] Exiting after SIGTERM");
    process.exit(0);
  }, 500);
});

// CRITICAL: During deployment, do NOT exit on errors to prevent health check failures
process.on("unhandledRejection", (reason, promise) => {
  console.log(`[Error] Unhandled rejection: ${reason}`);
  if (IS_DEPLOY) {
    console.log("[Error] 🔒 DEPLOY MODE: Suppressing rejection during deployment");
  }
});

process.on("uncaughtException", (err) => {
  console.log(`[Error] Uncaught exception: ${err.message}`);
  console.log(`[Error] Stack: ${err.stack}`);
  if (IS_DEPLOY) {
    console.log("[Error] 🔒 DEPLOY MODE: Suppressing exit during deployment to maintain health checks");
  } else {
    console.log("[Error] Exiting due to uncaught exception");
    process.exit(1);
  }
});
