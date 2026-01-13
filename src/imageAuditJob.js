const { log } = require("./logger");
const { db } = require("./db");
const { analyzeImageText, auditProductImages } = require("./imageLanguageAudit");
const { getImageAuditStats, getImageAuditsForProduct } = require("./aiDatabase");

let isRunning = false;
let progress = {
  status: 'idle',
  total: 0,
  processed: 0,
  currentProduct: null,
  startedAt: null,
  errors: []
};

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
        if (Array.isArray(parsed)) {
          urls.push(...parsed.filter(v => typeof v === 'string'));
        } else if (parsed && typeof parsed === 'string') {
          urls.push(parsed);
        }
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

async function runImageAuditJob(options = {}) {
  if (isRunning) {
    log("[ImageAuditJob] Already running, skipping");
    return { error: "Job already running" };
  }
  
  isRunning = true;
  progress = {
    status: 'running',
    total: 0,
    processed: 0,
    currentProduct: null,
    startedAt: new Date().toISOString(),
    errors: []
  };
  
  try {
    const products = await db.listProducts();
    const activeProducts = products.filter(p => p.active !== false);
    
    let toProcess = activeProducts;
    if (options.productIds && Array.isArray(options.productIds)) {
      toProcess = activeProducts.filter(p => options.productIds.includes(p.id));
    }
    
    if (options.onlyNew) {
      const audited = new Set();
      for (const p of toProcess) {
        const existing = await getImageAuditsForProduct(p.id);
        if (existing && existing.length > 0) {
          audited.add(p.id);
        }
      }
      toProcess = toProcess.filter(p => !audited.has(p.id));
    }
    
    progress.total = toProcess.length;
    log(`[ImageAuditJob] Starting audit for ${toProcess.length} products`);
    
    for (const product of toProcess) {
      if (!isRunning) {
        log("[ImageAuditJob] Job cancelled");
        break;
      }
      
      progress.currentProduct = product.id;
      
      try {
        const images = resolveAllImages(product);
        
        const httpImages = images.filter(url => url.startsWith('http'));
        if (httpImages.length > 0) {
          await auditProductImages(product.id, httpImages.slice(0, 10));
        }
        
        progress.processed++;
      } catch (err) {
        log(`[ImageAuditJob] Error processing ${product.id}: ${err.message}`);
        progress.errors.push({ productId: product.id, error: err.message });
      }
    }
    
    progress.status = 'completed';
    progress.currentProduct = null;
    log(`[ImageAuditJob] Completed. Processed ${progress.processed} products, ${progress.errors.length} errors`);
    
    const stats = await getImageAuditStats();
    return { success: true, processed: progress.processed, errors: progress.errors.length, stats };
    
  } catch (err) {
    log(`[ImageAuditJob] Job failed: ${err.message}`);
    progress.status = 'failed';
    progress.error = err.message;
    return { error: err.message };
  } finally {
    isRunning = false;
  }
}

function cancelJob() {
  if (isRunning) {
    isRunning = false;
    progress.status = 'cancelled';
    log("[ImageAuditJob] Job cancellation requested");
    return true;
  }
  return false;
}

function getProgress() {
  return { ...progress };
}

async function auditSingleProduct(productId) {
  const product = await db.getProduct(productId);
  if (!product) {
    return { error: "Product not found" };
  }
  
  const images = resolveAllImages(product);
  const httpImages = images.filter(url => url.startsWith('http'));
  
  if (httpImages.length === 0) {
    return { productId, images: [], message: "No HTTP images found" };
  }
  
  log(`[ImageAuditJob] Auditing ${httpImages.length} images for product ${productId}`);
  const results = await auditProductImages(productId, httpImages.slice(0, 10));
  
  return { productId, results };
}

module.exports = {
  runImageAuditJob,
  cancelJob,
  getProgress,
  auditSingleProduct
};
