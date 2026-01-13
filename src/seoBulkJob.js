const { log } = require("./logger");
const { productStore } = require("./productStore");
const seoGenerator = require("./seoGenerator");
const fs = require("fs");
const path = require("path");

const JOB_STATE_FILE = path.join(__dirname, "..", "data", "seo_job_state.json");

const DEFAULT_JOB_STATE = {
  running: false,
  cancelRequested: false,
  status: "idle",
  mode: null,
  progress: 0,
  total: 0,
  processed: 0,
  generated: 0,
  skipped: 0,
  failed: 0,
  errors: [],
  cursor: 0,
  batchSize: 50,
  batchNumber: 0,
  startedAt: null,
  finishedAt: null,
  lastProcessedAt: null,
  currentProduct: null,
  locale: "en-US",
  tonePreset: "friendly",
  overwrite: false,
  retryCount: 0,
  lastError: null,
  estimatedTimeRemaining: null
};

let jobState = { ...DEFAULT_JOB_STATE };
let jobMutex = false;

function loadJobState() {
  try {
    if (fs.existsSync(JOB_STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(JOB_STATE_FILE, "utf-8"));
      if (saved.running && saved.status === "running") {
        saved.status = "interrupted";
        saved.running = false;
      }
      return { ...DEFAULT_JOB_STATE, ...saved };
    }
  } catch (err) {
    log(`[SEO Job] Failed to load job state: ${err.message}`);
  }
  return { ...DEFAULT_JOB_STATE };
}

function saveJobState() {
  try {
    const dataDir = path.dirname(JOB_STATE_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(JOB_STATE_FILE, JSON.stringify(jobState, null, 2));
  } catch (err) {
    log(`[SEO Job] Failed to save job state: ${err.message}`);
  }
}

jobState = loadJobState();

function getJobStatus() {
  const stats = getProductSeoStats();
  return { 
    ...jobState,
    stats
  };
}

function getProductSeoStats() {
  try {
    const products = productStore.listProducts({ activeOnly: true });
    let total = products.length;
    let withSeo = 0;
    let missingSeo = 0;
    let failedSeo = 0;
    let partialSeo = 0;
    
    for (const p of products) {
      const hasSeoTitle = p.seo?.seoTitle || p.seo_title;
      const hasMetaDesc = p.seo?.metaDescription || p.meta_description;
      const seoStatus = p.seo?.seoStatus || p.seoStatus;
      
      if (seoStatus === "failed") {
        failedSeo++;
      } else if (hasSeoTitle && hasMetaDesc) {
        withSeo++;
      } else if (hasSeoTitle || hasMetaDesc) {
        partialSeo++;
      } else {
        missingSeo++;
      }
    }
    
    return { total, withSeo, missingSeo, failedSeo, partialSeo };
  } catch (err) {
    log(`[SEO Job] Stats error: ${err.message}`);
    return { total: 0, withSeo: 0, missingSeo: 0, failedSeo: 0, partialSeo: 0 };
  }
}

function requestCancel() {
  if (jobState.running) {
    jobState.cancelRequested = true;
    jobState.status = "cancelling";
    saveJobState();
    log(`[SEO Job] Cancel requested`);
    return true;
  }
  return false;
}

function resetJob() {
  if (jobState.running) {
    return { error: "Cannot reset while job is running" };
  }
  jobState = { ...DEFAULT_JOB_STATE };
  saveJobState();
  log(`[SEO Job] Job state reset`);
  return { success: true };
}

function getProductsForMode(mode, overwrite = false) {
  const allProducts = productStore.listProducts({ activeOnly: true });
  
  // ═══════════════════════════════════════════════════════════════════
  // SEO V2 GUARDS: Comprehensive filtering before SEO generation
  // - Must be pet-approved (petOnlyEngine)
  // - Must be valid pet product (productNormalize)
  // - Must have valid price
  // - Must have resolved image
  // ═══════════════════════════════════════════════════════════════════
  const { isPetApproved, PETONLY_MODE } = require('./lib/petOnlyEngine');
  const { isValidPetProduct, resolveImage } = require('./lib/productNormalize');
  
  const petApprovedProducts = allProducts.filter(p => {
    // Guard 1: Must be active
    if (p.active === false) {
      log(`[SEO Job] Skipping inactive product ${p.id}`);
      return false;
    }
    
    // Guard 2: Pet-only lockdown check
    const check = isPetApproved(p, PETONLY_MODE);
    if (!check.approved) {
      log(`[SEO Job] Skipping non-pet product ${p.id}: ${check.reason}`);
      return false;
    }
    
    // Guard 3: Additional pet validation
    if (!isValidPetProduct(p)) {
      log(`[SEO Job] Skipping invalid pet product ${p.id}: failed isValidPetProduct`);
      return false;
    }
    
    // Guard 4: Must have valid price
    const price = Number(p.price);
    if (!Number.isFinite(price) || price <= 0) {
      log(`[SEO Job] Skipping product without valid price ${p.id}`);
      return false;
    }
    
    // Guard 5: Must have resolved image
    const img = resolveImage(p);
    if (!img) {
      log(`[SEO Job] Skipping product without image ${p.id}`);
      return false;
    }
    
    return true;
  });
  
  log(`[SEO Job] Pet-only filter: ${allProducts.length} -> ${petApprovedProducts.length} products (${allProducts.length - petApprovedProducts.length} skipped)`);
  
  switch (mode) {
    case "all":
      if (overwrite) {
        return petApprovedProducts;
      }
      return petApprovedProducts.filter(p => {
        const hasSeo = p.seo?.seoTitle || p.seo_title;
        const isPublished = p.seo?.published === true;
        return !isPublished;
      });
      
    case "missing":
      return petApprovedProducts.filter(p => {
        const hasSeoTitle = p.seo?.seoTitle || p.seo_title;
        const hasMetaDesc = p.seo?.metaDescription || p.meta_description;
        return !hasSeoTitle || !hasMetaDesc;
      });
      
    case "failed":
      return petApprovedProducts.filter(p => {
        const seoStatus = p.seo?.seoStatus || p.seoStatus;
        return seoStatus === "failed";
      });
      
    case "resume":
      if (overwrite) {
        return petApprovedProducts;
      }
      return petApprovedProducts.filter(p => {
        const hasSeo = p.seo?.seoTitle || p.seo_title;
        const isPublished = p.seo?.published === true;
        return !isPublished;
      });
      
    default:
      return petApprovedProducts;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBulkSeoJob(options = {}) {
  const { 
    mode: optMode = "missing",
    locale: optLocale = "en-US", 
    tonePreset: optTonePreset = "friendly",
    batchSize: optBatchSize = 50,
    limit = null,
    overwrite: optOverwrite = false,
    resume = false
  } = options;

  if (jobMutex) {
    log(`[SEO Job] Already running - blocked by mutex`);
    return { error: "Another SEO job is already running" };
  }

  if (!seoGenerator.isEnabled()) {
    log(`[SEO Job] Blocked - SEO generator not enabled (no API key)`);
    return { error: "SEO generator not enabled - no API key configured" };
  }

  jobMutex = true;
  
  let products;
  let startCursor = 0;
  let effectiveMode = optMode;
  let effectiveLocale = optLocale;
  let effectiveTonePreset = optTonePreset;
  let effectiveBatchSize = optBatchSize;
  let effectiveOverwrite = optOverwrite;
  
  if (resume && jobState.status === "interrupted" && jobState.cursor > 0) {
    effectiveMode = jobState.mode || optMode;
    effectiveLocale = jobState.locale || optLocale;
    effectiveTonePreset = jobState.tonePreset || optTonePreset;
    effectiveBatchSize = jobState.batchSize || optBatchSize;
    effectiveOverwrite = jobState.overwrite !== undefined ? jobState.overwrite : optOverwrite;
    
    products = getProductsForMode(effectiveMode, effectiveOverwrite);
    startCursor = jobState.cursor;
    log(`[SEO Job] Resuming from cursor ${startCursor} with locale=${effectiveLocale} tone=${effectiveTonePreset}`);
  } else {
    products = getProductsForMode(effectiveMode, effectiveOverwrite);
    startCursor = 0;
  }
  
  if (limit && limit > 0 && limit < products.length) {
    products = products.slice(0, limit);
  }
  
  jobState = {
    running: true,
    cancelRequested: false,
    status: "running",
    mode: effectiveMode,
    progress: startCursor,
    total: products.length,
    processed: startCursor,
    generated: resume ? (jobState.generated || 0) : 0,
    skipped: resume ? (jobState.skipped || 0) : 0,
    failed: resume ? (jobState.failed || 0) : 0,
    errors: resume ? (jobState.errors || []).slice(-50) : [],
    cursor: startCursor,
    batchSize: effectiveBatchSize,
    batchNumber: Math.floor(startCursor / effectiveBatchSize),
    startedAt: resume && jobState.startedAt ? jobState.startedAt : new Date().toISOString(),
    finishedAt: null,
    lastProcessedAt: null,
    currentProduct: null,
    locale: effectiveLocale,
    tonePreset: effectiveTonePreset,
    overwrite: effectiveOverwrite,
    retryCount: 0,
    lastError: null,
    estimatedTimeRemaining: null
  };
  
  saveJobState();

  log(`[SEO Job] Start: mode=${effectiveMode} locale=${effectiveLocale} total=${products.length} batchSize=${effectiveBatchSize} resume=${resume} cursor=${startCursor}`);

  if (products.length === 0) {
    jobState.running = false;
    jobState.status = "completed";
    jobState.finishedAt = new Date().toISOString();
    jobMutex = false;
    saveJobState();
    log(`[SEO Job] Finished: no products to process`);
    return { success: true, message: "No products to process", ...getJobStatus() };
  }

  const startTime = Date.now();
  let consecutiveErrors = 0;
  let baseDelay = 500;

  try {
    for (let i = startCursor; i < products.length; i++) {
      if (jobState.cancelRequested) {
        jobState.status = "cancelled";
        log(`[SEO Job] Cancelled at ${i}/${products.length}`);
        break;
      }

      const product = products[i];
      jobState.cursor = i;
      jobState.progress = i + 1;
      jobState.processed = i + 1;
      jobState.batchNumber = Math.floor(i / effectiveBatchSize);
      jobState.currentProduct = { id: product.id, title: product.title?.substring(0, 50) };
      
      const elapsed = Date.now() - startTime;
      const avgTimePerProduct = elapsed / (i - startCursor + 1);
      const remaining = products.length - i - 1;
      jobState.estimatedTimeRemaining = Math.round((remaining * avgTimePerProduct) / 1000);

      if (i % 10 === 0) {
        saveJobState();
        log(`[SEO Job] Progress: ${i + 1}/${products.length} (batch ${jobState.batchNumber + 1})`);
      }

      try {
        const result = await seoGenerator.generateAndSaveSeo(product.id, effectiveLocale, effectiveTonePreset);
        
        if (result.error) {
          jobState.failed++;
          consecutiveErrors++;
          
          productStore.updateProduct(product.id, { seoStatus: "failed", seoError: result.error });
          
          if (jobState.errors.length < 100) {
            jobState.errors.push({ 
              productId: product.id, 
              title: product.title?.substring(0, 40),
              error: result.error,
              timestamp: new Date().toISOString()
            });
          }
          
          jobState.lastError = result.error;
          log(`[SEO Job] Failed for ${product.id}: ${result.error}`);
        } else {
          jobState.generated++;
          consecutiveErrors = 0;
          
          productStore.updateProduct(product.id, { seoStatus: "done", seoError: null });
          
          log(`[SEO Job] Generated SEO for ${product.id}`);
        }
      } catch (err) {
        jobState.failed++;
        consecutiveErrors++;
        
        productStore.updateProduct(product.id, { seoStatus: "failed", seoError: err.message });
        
        if (jobState.errors.length < 100) {
          jobState.errors.push({ 
            productId: product.id, 
            title: product.title?.substring(0, 40),
            error: err.message,
            timestamp: new Date().toISOString()
          });
        }
        
        jobState.lastError = err.message;
        log(`[SEO Job] Error for ${product.id}: ${err.message}`);
        
        if (err.message.includes("429") || err.message.includes("rate limit")) {
          const backoffDelay = Math.min(baseDelay * Math.pow(2, consecutiveErrors), 60000);
          log(`[SEO Job] Rate limited, backing off for ${backoffDelay}ms`);
          await sleep(backoffDelay);
        }
      }

      jobState.lastProcessedAt = new Date().toISOString();
      
      await new Promise(resolve => setImmediate(resolve));
      
      let delay = baseDelay;
      if (consecutiveErrors > 0) {
        delay = Math.min(baseDelay * Math.pow(1.5, consecutiveErrors), 10000);
      }
      
      if ((i + 1) % effectiveBatchSize === 0 && i < products.length - 1) {
        delay = Math.max(delay, 2000);
        log(`[SEO Job] Batch ${jobState.batchNumber + 1} complete, pausing ${delay}ms`);
      }
      
      await sleep(delay);
      
      if (consecutiveErrors >= 10) {
        log(`[SEO Job] Too many consecutive errors (${consecutiveErrors}), pausing for 30s`);
        await sleep(30000);
        consecutiveErrors = 5;
      }
    }

    if (jobState.status !== "cancelled") {
      jobState.status = "completed";
    }
    
    jobState.running = false;
    jobState.finishedAt = new Date().toISOString();
    jobState.currentProduct = null;
    jobState.cursor = products.length;

    const durationMs = new Date(jobState.finishedAt) - new Date(jobState.startedAt);
    log(`[SEO Job] Finished: generated=${jobState.generated} failed=${jobState.failed} skipped=${jobState.skipped} duration=${Math.round(durationMs / 1000)}s`);

    saveJobState();
    
    return { success: true, ...getJobStatus() };

  } catch (err) {
    log(`[SEO Job] Fatal error: ${err.message}`);
    jobState.running = false;
    jobState.status = "error";
    jobState.finishedAt = new Date().toISOString();
    jobState.lastError = err.message;
    if (jobState.errors.length < 100) {
      jobState.errors.push({ error: err.message, timestamp: new Date().toISOString() });
    }
    saveJobState();
    return { error: err.message, ...getJobStatus() };
  } finally {
    jobMutex = false;
  }
}

module.exports = {
  runBulkSeoJob,
  getJobStatus,
  requestCancel,
  resetJob,
  getProductSeoStats,
  getProductsForMode
};
