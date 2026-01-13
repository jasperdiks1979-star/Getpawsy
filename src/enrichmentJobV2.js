/**
 * Product Enrichment Job Module V2
 * DB-backed locking, aggressive yielding, proper cancellation
 * Production-safe for Replit Autoscale/Cloud Run
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { log } = require('./logger');
const { db } = require('./db');

let aiDb = null;
try {
  aiDb = require('./aiDatabase');
} catch (e) {
  log('[EnrichV2] AI Database not available - using fallback mode');
}

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const CACHE_DIR = path.join(__dirname, '..', 'public', 'cache', 'images');
const TOKEN_CACHE = path.join(__dirname, '..', 'data', 'cj-token.json');
const JOBS_FILE = path.join(__dirname, '..', 'data', 'enrich-jobs.json');

const CJ_EMAIL = process.env.CJ_EMAIL;
const CJ_API_KEY = process.env.CJ_API_KEY;

const FETCH_TIMEOUT = 10000;
const BATCH_SIZE = 5;
const YIELD_INTERVAL = 1;
const MAX_GALLERY_IMAGES = 15;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 1000;
const HEARTBEAT_INTERVAL = 5;

let currentDbJobId = null;
let localStopRequested = false;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
}

function getImageExtension(url) {
  if (!url) return '.jpg';
  try {
    const urlPath = url.split('?')[0];
    const ext = path.extname(urlPath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
  } catch (e) {}
  return '.jpg';
}

function sanitize(str) {
  return (str || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25);
}

async function yieldEventLoop() {
  return new Promise(r => setImmediate(r));
}

async function loadProducts() {
  try {
    return await db.listProducts();
  } catch (e) {
    log(`[EnrichV2] Error loading products: ${e.message}`);
  }
  return [];
}

async function updateProduct(productId, updates) {
  try {
    return await db.updateProduct(productId, updates);
  } catch (e) {
    log(`[EnrichV2] Error updating product ${productId}: ${e.message}`);
    return null;
  }
}

function httpsRequestWithTimeout(method, url, headers = {}, body = null, timeout = FETCH_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const controller = { aborted: false };
    const timeoutId = setTimeout(() => {
      controller.aborted = true;
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    try {
      const urlObj = new URL(url);
      const protocol = url.startsWith('https') ? https : http;
      
      const options = {
        method,
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GetPawsy/2.2',
          ...headers
        },
        timeout: timeout
      };

      const req = protocol.request(options, (res) => {
        if (controller.aborted) return;
        let data = '';
        res.on('data', chunk => { if (!controller.aborted) data += chunk; });
        res.on('end', () => {
          clearTimeout(timeoutId);
          if (!controller.aborted) resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on('error', (err) => {
        clearTimeout(timeoutId);
        if (!controller.aborted) reject(err);
      });

      req.on('timeout', () => {
        clearTimeout(timeoutId);
        req.destroy();
        if (!controller.aborted) reject(new Error('Socket timeout'));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}

async function getAccessToken() {
  if (fs.existsSync(TOKEN_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf-8'));
      if (cached.accessToken && cached.expiry > Date.now()) {
        return cached.accessToken;
      }
    } catch (e) {}
  }

  if (!CJ_EMAIL || !CJ_API_KEY) {
    throw new Error('Missing CJ_EMAIL or CJ_API_KEY environment variables');
  }

  log('[EnrichV2] Requesting new access token...');
  const res = await httpsRequestWithTimeout('POST', `${CJ_API_BASE}/authentication/getAccessToken`, {}, {
    email: CJ_EMAIL,
    password: CJ_API_KEY
  });

  if (res.statusCode !== 200) {
    throw new Error(`Auth failed: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  if (!data.data?.accessToken) {
    throw new Error(`Auth failed: ${data.message || 'No token in response'}`);
  }

  const token = data.data.accessToken;
  ensureDir(path.dirname(TOKEN_CACHE));
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify({
    accessToken: token,
    expiry: Date.now() + 86400000,
    created: new Date().toISOString()
  }, null, 2));

  log('[EnrichV2] Access token obtained and cached');
  return token;
}

async function getProductByPid(token, pid) {
  const url = `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(pid)}`;
  
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await httpsRequestWithTimeout('GET', url, { 'CJ-Access-Token': token });
      if (res.statusCode !== 200) {
        if (attempt < RETRY_COUNT) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        throw new Error(`API error: HTTP ${res.statusCode}`);
      }
      const data = JSON.parse(res.body);
      if (data.code === 200 && data.data) {
        return data.data;
      }
      return null;
    } catch (err) {
      if (attempt < RETRY_COUNT) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function searchProductBySpu(token, spu) {
  const url = `${CJ_API_BASE}/product/list?pageNum=1&pageSize=20`;
  
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await httpsRequestWithTimeout('POST', url, { 'CJ-Access-Token': token }, {
        productSku: spu
      });
      if (res.statusCode !== 200) {
        if (attempt < RETRY_COUNT) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        throw new Error(`Search error: HTTP ${res.statusCode}`);
      }
      const data = JSON.parse(res.body);
      if (data.code === 200 && data.data?.list?.length > 0) {
        return data.data.list[0];
      }
      return null;
    } catch (err) {
      if (attempt < RETRY_COUNT) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function searchProductByName(token, productName) {
  const url = `${CJ_API_BASE}/product/list?pageNum=1&pageSize=10`;
  
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await httpsRequestWithTimeout('POST', url, { 'CJ-Access-Token': token }, {
        productNameEn: productName
      });
      if (res.statusCode !== 200) {
        if (attempt < RETRY_COUNT) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        throw new Error(`Search error: HTTP ${res.statusCode}`);
      }
      const data = JSON.parse(res.body);
      if (data.code === 200 && data.data?.list?.length > 0) {
        return data.data.list[0];
      }
      return null;
    } catch (err) {
      if (attempt < RETRY_COUNT) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return null;
}

function normalizeImageUrl(rawUrl, baseUrl = 'https://cf.cjdropshipping.com') {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let url = rawUrl.trim();
  if (url.startsWith('//')) url = 'https:' + url;
  if (url.startsWith('/') && !url.startsWith('//')) url = baseUrl + url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.match(/^[a-z0-9.-]+\.[a-z]{2,}\//i)) {
      url = 'https://' + url;
    } else {
      url = baseUrl + '/' + url;
    }
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return url;
  } catch (e) {
    return null;
  }
}

function extractUrls(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(v => typeof v === 'string');
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(v => typeof v === 'string');
        if (typeof parsed === 'string') return [parsed];
      } catch (e) {}
    }
    if (/^https?:\/\//i.test(trimmed)) return [trimmed];
    if (trimmed.includes(',')) return trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
  return [];
}

function collectAllImages(cjProduct) {
  const result = { mainImage: null, mainImageSource: null, galleryImages: [], variantImages: {} };
  if (!cjProduct) return result;
  
  const gallerySources = [];
  const mainFields = ['productImage', 'bigImage', 'image', 'mainImage', 'productImageUrl'];
  for (const field of mainFields) {
    if (cjProduct[field]) {
      const urls = extractUrls(cjProduct[field]);
      gallerySources.push(...urls.map(u => ({ url: u, source: field })));
    }
  }
  
  if (Array.isArray(cjProduct.productImageSet)) {
    gallerySources.push(...cjProduct.productImageSet.map(u => ({ url: u, source: 'productImageSet' })));
  }
  if (typeof cjProduct.productImageSetStr === 'string') {
    const urls = extractUrls(cjProduct.productImageSetStr);
    gallerySources.push(...urls.map(u => ({ url: u, source: 'productImageSetStr' })));
  }
  if (Array.isArray(cjProduct.images)) {
    gallerySources.push(...cjProduct.images.map(u => ({ url: u, source: 'images' })));
  }
  
  // Extract variant images from CJ variants array
  const variants = cjProduct.variants || cjProduct.variantList || [];
  if (Array.isArray(variants)) {
    for (const variant of variants) {
      const variantKey = variant.vid || variant.variantId || variant.sku || variant.variantSku;
      const variantImageFields = ['variantImage', 'image', 'imageUrl', 'variantImageUrl', 'pic'];
      for (const field of variantImageFields) {
        if (variant[field]) {
          const normalized = normalizeImageUrl(variant[field]);
          if (normalized && variantKey) {
            result.variantImages[variantKey] = normalized;
            // Also add to gallery if unique
            gallerySources.push({ url: variant[field], source: `variant:${variantKey}` });
          }
          break;
        }
      }
    }
  }
  
  const seenUrls = new Set();
  for (const { url, source } of gallerySources) {
    const normalized = normalizeImageUrl(url);
    if (normalized && !seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      if (!result.mainImage) {
        result.mainImage = normalized;
        result.mainImageSource = source;
      } else if (result.galleryImages.length < MAX_GALLERY_IMAGES - 1) {
        result.galleryImages.push(normalized);
      }
    }
  }
  
  return result;
}

function getCJIdentifier(product) {
  if (product.cjPid) return { type: 'pid', value: product.cjPid };
  if (product.pid) return { type: 'pid', value: product.pid };
  if (product.cjSpu) return { type: 'spu', value: product.cjSpu };
  if (product.spu) return { type: 'spu', value: product.spu };
  return null;
}

async function shouldCancel(dbJobId) {
  if (localStopRequested) return true;
  if (!aiDb || !dbJobId) return false;
  try {
    return await aiDb.isEnrichCancelRequested(dbJobId);
  } catch (e) {
    return false;
  }
}

async function enrichProduct(product, token, options) {
  const startTime = Date.now();
  const productId = product.id;
  const result = {
    productId,
    success: false,
    imagesDownloaded: 0,
    fieldsUpdated: [],
    error: null,
    duration: 0
  };

  try {
    const cjId = getCJIdentifier(product);
    if (!cjId) {
      result.error = 'No CJ identifier found';
      return result;
    }

    let cjProduct = null;
    
    // Try primary lookup method first
    if (cjId.type === 'pid') {
      cjProduct = await getProductByPid(token, cjId.value);
    } else {
      cjProduct = await searchProductBySpu(token, cjId.value);
    }
    
    // Fallback: try the other method if primary fails
    if (!cjProduct && cjId.type === 'spu') {
      // Try treating SPU as PID
      cjProduct = await getProductByPid(token, cjId.value);
    }
    
    // Fallback: try name-based search if still not found
    if (!cjProduct && product.title) {
      const searchTerms = product.title
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 3)
        .slice(0, 3)
        .join(' ');
      if (searchTerms.length > 5) {
        cjProduct = await searchProductByName(token, searchTerms);
      }
    }

    if (!cjProduct) {
      result.error = 'Product not found in CJ';
      await updateProduct(productId, {
        enrichStatus: 'failed',
        enrichError: 'Product not found in CJ',
        updatedFromCjAt: new Date().toISOString()
      });
      return result;
    }

    const images = collectAllImages(cjProduct);
    const updates = {};

    if (images.mainImage && (options.overwriteImage || !product.image)) {
      updates.image = images.mainImage;
      result.fieldsUpdated.push('image');
    }

    if (images.galleryImages.length > 0) {
      const allImages = images.mainImage 
        ? [images.mainImage, ...images.galleryImages]
        : images.galleryImages;
      updates.images = allImages.slice(0, MAX_GALLERY_IMAGES);
      result.imagesDownloaded = updates.images.length;
      result.fieldsUpdated.push('images');
    }

    // Save variant images if available
    if (Object.keys(images.variantImages).length > 0) {
      updates.variantImages = images.variantImages;
      result.fieldsUpdated.push('variantImages');
    }

    if (cjProduct.productNameEn && (options.overwriteFields || !product.title)) {
      updates.cjTitle = cjProduct.productNameEn;
      result.fieldsUpdated.push('cjTitle');
    }

    if (cjProduct.description && (options.overwriteFields || !product.description)) {
      updates.cjDescription = cjProduct.description;
      result.fieldsUpdated.push('cjDescription');
    }

    if (cjProduct.pid) {
      updates.cjPid = cjProduct.pid;
      result.fieldsUpdated.push('cjPid');
    }

    updates.enrichStatus = 'success';
    updates.enrichError = null;
    updates.updatedFromCjAt = new Date().toISOString();

    await updateProduct(productId, updates);
    
    result.success = true;
    result.duration = Date.now() - startTime;

  } catch (err) {
    result.error = err.message;
    result.duration = Date.now() - startTime;
    await updateProduct(productId, {
      enrichStatus: 'failed',
      enrichError: err.message,
      updatedFromCjAt: new Date().toISOString()
    });
  }

  return result;
}

function loadJobsFile() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { jobs: [], currentJobId: null };
}

function saveJobsFile(data) {
  ensureDir(path.dirname(JOBS_FILE));
  fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
}

async function runEnrichmentJob(options = {}) {
  localStopRequested = false;
  let dbJobId = null;
  
  if (aiDb) {
    try {
      const lockResult = await aiDb.acquireEnrichLock();
      if (!lockResult.success) {
        return { success: false, error: lockResult.error, jobId: lockResult.jobId };
      }
      dbJobId = lockResult.jobId;
      currentDbJobId = dbJobId;
      log(`[EnrichV2] DB lock acquired, jobId: ${dbJobId}`);
    } catch (e) {
      log(`[EnrichV2] DB lock failed: ${e.message}, proceeding with file-only tracking`);
    }
  }

  const fileJobId = `enrich_${Date.now()}`;
  const stats = { successCount: 0, failCount: 0, processed: 0 };
  
  try {
    const token = await getAccessToken();
    let products = await loadProducts();
    
    const enrichableProducts = products.filter(p => {
      if (!options.force && p.enrichStatus === 'success') return false;
      return getCJIdentifier(p) !== null;
    });

    if (enrichableProducts.length === 0) {
      if (dbJobId && aiDb) {
        await aiDb.releaseEnrichLock(dbJobId, 'done', null, JSON.stringify({ message: 'No products to enrich' }));
      }
      currentDbJobId = null;
      return { success: true, message: 'No products with CJ identifiers to enrich' };
    }

    log(`[EnrichV2] Starting job for ${enrichableProducts.length} products (DB job: ${dbJobId || 'none'})`);
    
    if (dbJobId && aiDb) {
      await aiDb.updateEnrichProgress(dbJobId, 0, enrichableProducts.length);
    }

    const data = loadJobsFile();
    data.jobs.push({
      jobId: fileJobId,
      dbJobId,
      status: 'running',
      startedAt: new Date().toISOString(),
      total: enrichableProducts.length,
      processed: 0,
      successCount: 0,
      failCount: 0,
      options
    });
    data.currentJobId = fileJobId;
    saveJobsFile(data);

    for (let i = 0; i < enrichableProducts.length; i++) {
      if (await shouldCancel(dbJobId)) {
        log(`[EnrichV2] Cancel requested, stopping at product ${i}/${enrichableProducts.length}`);
        break;
      }

      const product = enrichableProducts[i];
      
      try {
        const result = await enrichProduct(product, token, options);
        if (result.success) {
          stats.successCount++;
        } else {
          stats.failCount++;
        }
        stats.processed++;
      } catch (err) {
        stats.failCount++;
        stats.processed++;
        log(`[EnrichV2] Product ${product.id} error: ${err.message}`);
      }

      if (i % YIELD_INTERVAL === 0) {
        await yieldEventLoop();
      }

      if (i % HEARTBEAT_INTERVAL === 0 && dbJobId && aiDb) {
        try {
          await aiDb.updateEnrichProgress(dbJobId, stats.processed, enrichableProducts.length, JSON.stringify(stats));
        } catch (e) {}
      }

      if (i % BATCH_SIZE === BATCH_SIZE - 1) {
        const jobData = loadJobsFile();
        const job = jobData.jobs.find(j => j.jobId === fileJobId);
        if (job) {
          job.processed = stats.processed;
          job.successCount = stats.successCount;
          job.failCount = stats.failCount;
          saveJobsFile(jobData);
        }
        log(`[EnrichV2] Progress: ${stats.processed}/${enrichableProducts.length} (success: ${stats.successCount}, fail: ${stats.failCount})`);
      }
    }

    const cancelled = await shouldCancel(dbJobId);
    const finalStatus = cancelled ? 'cancelled' : 'done';
    
    if (dbJobId && aiDb) {
      await aiDb.releaseEnrichLock(dbJobId, finalStatus, null, JSON.stringify(stats));
    }

    const jobData = loadJobsFile();
    const job = jobData.jobs.find(j => j.jobId === fileJobId);
    if (job) {
      job.status = cancelled ? 'stopped' : 'completed';
      job.finishedAt = new Date().toISOString();
      job.processed = stats.processed;
      job.successCount = stats.successCount;
      job.failCount = stats.failCount;
    }
    jobData.currentJobId = null;
    saveJobsFile(jobData);

    currentDbJobId = null;
    log(`[EnrichV2] Job complete: ${stats.processed} processed, ${stats.successCount} success, ${stats.failCount} failed`);

    return {
      success: true,
      jobId: fileJobId,
      dbJobId,
      ...stats
    };

  } catch (err) {
    log(`[EnrichV2] Job error: ${err.message}`);
    
    if (dbJobId && aiDb) {
      try {
        await aiDb.releaseEnrichLock(dbJobId, 'failed', err.message, JSON.stringify(stats));
      } catch (e) {}
    }

    const jobData = loadJobsFile();
    const job = jobData.jobs.find(j => j.jobId === fileJobId);
    if (job) {
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      job.error = err.message;
    }
    jobData.currentJobId = null;
    saveJobsFile(jobData);

    currentDbJobId = null;
    return { success: false, error: err.message };
  }
}

async function cancelEnrichJob() {
  localStopRequested = true;
  
  if (currentDbJobId && aiDb) {
    try {
      const success = await aiDb.requestEnrichCancel(currentDbJobId);
      log(`[EnrichV2] Cancel requested for DB job ${currentDbJobId}: ${success}`);
      return { success: true, message: 'Cancel requested', jobId: currentDbJobId };
    } catch (e) {
      log(`[EnrichV2] Cancel request error: ${e.message}`);
    }
  }

  if (aiDb) {
    try {
      const running = await aiDb.getRunningEnrichJob();
      if (running) {
        await aiDb.requestEnrichCancel(running.id);
        return { success: true, message: 'Cancel requested', jobId: running.id };
      }
    } catch (e) {}
  }

  return { success: true, message: 'Cancel signal sent (local)' };
}

async function getEnrichStatus() {
  let dbJob = null;
  let recentDbJobs = [];
  
  if (aiDb) {
    try {
      dbJob = await aiDb.getRunningEnrichJob();
      recentDbJobs = await aiDb.getRecentEnrichJobs(10);
    } catch (e) {}
  }

  const fileData = loadJobsFile();
  const currentFileJob = fileData.currentJobId 
    ? fileData.jobs.find(j => j.jobId === fileData.currentJobId)
    : null;

  return {
    isRunning: !!dbJob || !!currentFileJob,
    dbJob,
    currentJob: currentFileJob || (dbJob ? {
      jobId: `db_${dbJob.id}`,
      status: dbJob.status,
      progress: dbJob.progress,
      total: dbJob.total,
      startedAt: dbJob.started_at,
      cancelRequested: dbJob.cancel_requested
    } : null),
    recentJobs: fileData.jobs.slice(-10).reverse(),
    recentDbJobs
  };
}

async function getEnrichmentStats() {
  const products = await loadProducts();
  
  const stats = {
    total: products.length,
    withCjId: 0,
    enriched: 0,
    failed: 0,
    pending: 0,
    withImages: 0,
    withMultipleImages: 0
  };
  
  for (const p of products) {
    if (getCJIdentifier(p)) stats.withCjId++;
    if (p.enrichStatus === 'success') stats.enriched++;
    else if (p.enrichStatus === 'failed') stats.failed++;
    else stats.pending++;
    
    if (p.images && p.images.length > 0) {
      stats.withImages++;
      if (p.images.length > 1) stats.withMultipleImages++;
    }
  }
  
  return stats;
}

module.exports = {
  runEnrichmentJob,
  cancelEnrichJob,
  getEnrichStatus,
  getEnrichmentStats,
  getCJIdentifier
};
