/**
 * CJ Backfill Job System
 * Updates existing products with all images and variants from CJ API
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const PROGRESS_PATH = path.join(__dirname, '..', 'data', 'backfill-progress.json');

let cjUrlImport = null;
let backfillState = {
  running: false,
  paused: false,
  total: 0,
  processed: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  imagesAdded: 0,
  variantsAdded: 0,
  currentProductId: null,
  startedAt: null,
  completedAt: null,
  errors: [],
  logs: []
};

function loadCjImport() {
  if (!cjUrlImport) {
    cjUrlImport = require('./cjUrlImport');
  }
  return cjUrlImport;
}

function getProgress() {
  return { ...backfillState };
}

function saveProgress() {
  try {
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(backfillState, null, 2));
  } catch (e) {
    log(`[CJ Backfill] Failed to save progress: ${e.message}`);
  }
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_PATH)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
      if (data.running && !data.completedAt) {
        backfillState = { ...backfillState, ...data, running: false };
        log(`[CJ Backfill] Recovered interrupted job: ${data.processed}/${data.total}`);
      }
    }
  } catch (e) {
    log(`[CJ Backfill] Failed to load progress: ${e.message}`);
  }
}

function addLog(msg) {
  const entry = `[${new Date().toISOString().substring(11, 19)}] ${msg}`;
  backfillState.logs.push(entry);
  if (backfillState.logs.length > 200) {
    backfillState.logs = backfillState.logs.slice(-150);
  }
  log(`[CJ Backfill] ${msg}`);
}

function dedupeImages(images) {
  const seen = new Set();
  return images.filter(img => {
    if (!img || typeof img !== 'string') return false;
    const normalized = img.split('?')[0].trim().toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function mergeVariants(existing, newVariants) {
  if (!Array.isArray(newVariants) || newVariants.length === 0) {
    return { variants: existing, added: 0 };
  }
  
  const existingByKey = new Map();
  for (const v of existing) {
    const key = v.sku || v.cjVid || JSON.stringify(v.options);
    existingByKey.set(key, v);
  }
  
  let added = 0;
  for (const nv of newVariants) {
    const key = nv.sku || nv.cjVid || JSON.stringify(nv.options);
    if (existingByKey.has(key)) {
      const ev = existingByKey.get(key);
      if (nv.image && !ev.image) {
        ev.image = nv.image;
        added++;
      }
      if (nv.costPrice && !ev.costPrice) {
        ev.costPrice = nv.costPrice;
      }
    } else {
      existing.push(nv);
      added++;
    }
  }
  
  return { variants: existing, added };
}

async function refreshProduct(productId, options = {}) {
  const cj = loadCjImport();
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const products = db.products || [];
  const productIdx = products.findIndex(p => p.id === productId);
  
  if (productIdx === -1) {
    return { ok: false, error: 'Product not found', productId };
  }
  
  const product = products[productIdx];
  const cjId = product.cjPid || product.cjSpu || product.spu || product.id;
  
  if (!cjId) {
    return { ok: false, error: 'No CJ ID found for product', productId };
  }
  
  const result = {
    ok: true,
    productId,
    beforeImages: (product.images || []).length,
    beforeVariants: (product.variants || []).length,
    afterImages: 0,
    afterVariants: 0,
    imagesAdded: 0,
    variantsAdded: 0
  };
  
  try {
    const parseResult = cj.parseCJInput(cjId);
    if (!parseResult.ok) {
      return { ok: false, error: parseResult.error, productId };
    }
    
    const { product: cjProduct } = await cj.fetchProduct(parseResult.id, parseResult.queryMethod);
    const freshProduct = await cj.convertToProduct(cjProduct, options);
    
    const existingImages = product.images || [];
    const newImages = freshProduct.images || [];
    const allImages = dedupeImages([...existingImages, ...newImages]);
    
    const imagesAdded = allImages.length - existingImages.length;
    product.images = allImages;
    if (allImages.length > 0 && !product.image) {
      product.image = allImages[0];
    }
    
    const existingVariants = product.variants || [];
    const { variants: mergedVariants, added: variantsAdded } = mergeVariants(
      existingVariants,
      freshProduct.variants
    );
    product.variants = mergedVariants;
    
    if (freshProduct.priceFrom) product.priceFrom = freshProduct.priceFrom;
    if (freshProduct.priceTo) product.priceTo = freshProduct.priceTo;
    product.lastBackfillAt = new Date().toISOString();
    
    products[productIdx] = product;
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    
    result.afterImages = product.images.length;
    result.afterVariants = product.variants.length;
    result.imagesAdded = imagesAdded;
    result.variantsAdded = variantsAdded;
    
    addLog(`Product ${productId}: +${imagesAdded} images, +${variantsAdded} variants`);
    
  } catch (err) {
    result.ok = false;
    result.error = err.message;
    addLog(`Product ${productId} FAILED: ${err.message}`);
  }
  
  return result;
}

async function runBackfillAll(options = {}) {
  if (backfillState.running) {
    return { ok: false, error: 'Backfill already running', progress: getProgress() };
  }
  
  loadCjImport();
  
  backfillState = {
    running: true,
    paused: false,
    total: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    imagesAdded: 0,
    variantsAdded: 0,
    currentProductId: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    errors: [],
    logs: []
  };
  
  addLog('Starting backfill job...');
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const products = db.products || [];
  
  const eligibleProducts = products.filter(p => {
    if (!p.active) return false;
    const cjId = p.cjPid || p.cjSpu || p.spu;
    return !!cjId;
  });
  
  backfillState.total = eligibleProducts.length;
  addLog(`Found ${eligibleProducts.length} eligible products (active + CJ ID)`);
  saveProgress();
  
  const batchSize = options.batchSize || 5;
  const delayBetweenBatches = options.delay || 2000;
  
  for (let i = 0; i < eligibleProducts.length; i += batchSize) {
    if (backfillState.paused) {
      addLog('Job paused by user');
      saveProgress();
      break;
    }
    
    const batch = eligibleProducts.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (p) => {
        backfillState.currentProductId = p.id;
        
        try {
          const result = await refreshProduct(p.id, options);
          backfillState.processed++;
          
          if (result.ok) {
            if (result.imagesAdded > 0 || result.variantsAdded > 0) {
              backfillState.updated++;
              backfillState.imagesAdded += result.imagesAdded;
              backfillState.variantsAdded += result.variantsAdded;
            } else {
              backfillState.skipped++;
            }
          } else {
            backfillState.failed++;
            backfillState.errors.push({ productId: p.id, error: result.error });
          }
          
          return result;
        } catch (err) {
          backfillState.processed++;
          backfillState.failed++;
          backfillState.errors.push({ productId: p.id, error: err.message });
          return { ok: false, error: err.message, productId: p.id };
        }
      })
    );
    
    saveProgress();
    
    addLog(`Batch ${Math.floor(i / batchSize) + 1}: ${backfillState.processed}/${backfillState.total} (${backfillState.updated} updated, ${backfillState.failed} failed)`);
    
    if (i + batchSize < eligibleProducts.length && !backfillState.paused) {
      await new Promise(r => setTimeout(r, delayBetweenBatches));
    }
  }
  
  backfillState.running = false;
  backfillState.currentProductId = null;
  backfillState.completedAt = new Date().toISOString();
  
  const status = backfillState.failed > backfillState.updated ? 'partial' : 'success';
  addLog(`Backfill complete: ${status} - ${backfillState.updated} updated, ${backfillState.failed} failed, +${backfillState.imagesAdded} images, +${backfillState.variantsAdded} variants`);
  saveProgress();
  
  return {
    ok: true,
    status,
    ...getProgress()
  };
}

function pauseBackfill() {
  if (backfillState.running) {
    backfillState.paused = true;
    addLog('Pause requested');
    return { ok: true, message: 'Backfill will pause after current batch' };
  }
  return { ok: false, error: 'No backfill running' };
}

function resumeBackfill() {
  if (backfillState.paused && !backfillState.running) {
    backfillState.paused = false;
    return { ok: true, message: 'Ready to resume. Start backfill again to continue.' };
  }
  return { ok: false, error: 'No paused backfill to resume' };
}

loadProgress();

module.exports = {
  refreshProduct,
  runBackfillAll,
  getProgress,
  pauseBackfill,
  resumeBackfill
};
