/**
 * Product Enrichment Job Module
 * Bulk updates all products with full CJ product info + ALL images
 * Supports resume, stop, and progress tracking
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { log } = require('./logger');
const { db } = require('./db');

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const CACHE_DIR = path.join(__dirname, '..', 'public', 'cache', 'images');
const TOKEN_CACHE = path.join(__dirname, '..', 'data', 'cj-token.json');
const JOBS_FILE = path.join(__dirname, '..', 'data', 'enrich-jobs.json');

const CJ_EMAIL = process.env.CJ_EMAIL;
const CJ_API_KEY = process.env.CJ_API_KEY;

const TIMEOUT = 30000;
const BATCH_SIZE = 10;
const CONCURRENCY_LIMIT = 1; // Serialized to prevent race conditions
const MAX_GALLERY_IMAGES = 15;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 2000;

let currentJob = null;
let stopRequested = false;

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

// Load/save jobs
function loadJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`[Enrich] Error loading jobs: ${e.message}`);
  }
  return { jobs: [], currentJobId: null };
}

function saveJobs(data) {
  ensureDir(path.dirname(JOBS_FILE));
  fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
}

// Load products from db
async function loadProducts() {
  try {
    return await db.listProducts();
  } catch (e) {
    log(`[Enrich] Error loading products: ${e.message}`);
  }
  return [];
}

// Update product in db
async function updateProduct(productId, updates) {
  try {
    return await db.updateProduct(productId, updates);
  } catch (e) {
    log(`[Enrich] Error updating product ${productId}: ${e.message}`);
    return null;
  }
}

// HTTP request helper
function httpsRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = url.startsWith('https') ? https : http;
    
    const options = {
      method,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GetPawsy/1.0',
        ...headers
      },
      timeout: TIMEOUT
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Get CJ access token
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

  log('[Enrich] Requesting new access token...');
  const res = await httpsRequest('POST', `${CJ_API_BASE}/authentication/getAccessToken`, {}, {
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

  log('[Enrich] Access token obtained and cached');
  return token;
}

// Fetch product by PID
async function getProductByPid(token, pid) {
  const url = `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(pid)}`;
  log(`[Enrich] Fetching by PID: ${pid}`);
  
  const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
  
  if (res.statusCode !== 200) {
    throw new Error(`API error: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  if (data.code === 200 && data.data) {
    return data.data;
  }
  
  return null;
}

// Search product by SPU
async function searchProductBySpu(token, spu) {
  const url = `${CJ_API_BASE}/product/list?pageNum=1&pageSize=20`;
  log(`[Enrich] Searching by SPU: ${spu}`);
  
  const res = await httpsRequest('POST', url, { 'CJ-Access-Token': token }, {
    productSku: spu
  });
  
  if (res.statusCode !== 200) {
    throw new Error(`Search error: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  if (data.code === 200 && data.data?.list?.length > 0) {
    return data.data.list[0];
  }
  
  return null;
}

// Get product variants
async function getProductVariants(token, pid) {
  const url = `${CJ_API_BASE}/product/variant/query?pid=${encodeURIComponent(pid)}`;
  
  try {
    const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
    if (res.statusCode !== 200) return [];
    
    const data = JSON.parse(res.body);
    if (data.code === 200 && data.data) {
      return Array.isArray(data.data) ? data.data : [data.data];
    }
  } catch (e) {
    log(`[Enrich] Variant fetch error: ${e.message}`);
  }
  
  return [];
}

// Normalize image URL
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

// Extract URLs from various formats
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

// Collect all images from CJ product
function collectAllImages(cjProduct) {
  const result = {
    mainImage: null,
    mainImageSource: null,
    galleryImages: [],
    variantImages: {}
  };
  
  if (!cjProduct) return result;
  
  const gallerySources = [];
  
  // Main image fields
  const mainFields = ['productImage', 'bigImage', 'image', 'mainImage', 'productImageUrl'];
  for (const field of mainFields) {
    if (cjProduct[field]) {
      const urls = extractUrls(cjProduct[field]);
      if (urls.length > 0) {
        gallerySources.push(...urls.map(u => ({ url: u, source: field })));
      }
    }
  }
  
  // Gallery fields
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
  
  // Normalize and dedupe
  const seenUrls = new Set();
  
  for (const { url, source } of gallerySources) {
    const normalized = normalizeImageUrl(url);
    if (normalized && !seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      if (!result.mainImage) {
        result.mainImage = normalized;
        result.mainImageSource = source;
      } else {
        result.galleryImages.push(normalized);
      }
    }
  }
  
  // Variant images
  if (Array.isArray(cjProduct.variants)) {
    for (const variant of cjProduct.variants) {
      const vid = variant.vid || variant.variantSku || variant.variantId;
      if (!vid) continue;
      
      const variantImgFields = ['variantImage', 'image', 'variantImg', 'thumbImage'];
      for (const field of variantImgFields) {
        const urls = extractUrls(variant[field]);
        if (urls.length > 0) {
          const normalized = normalizeImageUrl(urls[0]);
          if (normalized) {
            result.variantImages[vid] = normalized;
            if (!seenUrls.has(normalized)) {
              seenUrls.add(normalized);
              result.galleryImages.push(normalized);
            }
            break;
          }
        }
      }
    }
  }
  
  return result;
}

// Download image with retry
async function downloadImageWithRetry(url, localPath, retries = RETRY_COUNT) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await downloadImage(url, localPath);
    } catch (err) {
      if (attempt < retries) {
        log(`[Enrich] Download retry ${attempt + 1}/${retries} for ${url.substring(0, 60)}...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
}

// Download image to cache
function downloadImage(url, localPath) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('No URL provided'));
    
    const normalizedUrl = normalizeImageUrl(url);
    if (!normalizedUrl) return reject(new Error(`Invalid URL: ${url}`));
    
    ensureDir(CACHE_DIR);
    const fullPath = path.join(CACHE_DIR, localPath);
    
    // Check if already cached
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      if (stats.size > 100) {
        return resolve(`/cache/images/${localPath}`);
      }
      fs.unlinkSync(fullPath);
    }
    
    const protocol = normalizedUrl.startsWith('https') ? https : http;
    const urlObj = new URL(normalizedUrl);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://cjdropshipping.com/'
      }
    };
    
    const handleRedirect = (res, redirectCount = 0) => {
      if (redirectCount > 5) {
        return reject(new Error('Too many redirects'));
      }
      
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, normalizedUrl).href;
        
        const newUrlObj = new URL(redirectUrl);
        const newProtocol = redirectUrl.startsWith('https') ? https : http;
        
        newProtocol.get({
          hostname: newUrlObj.hostname,
          path: newUrlObj.pathname + newUrlObj.search,
          timeout: TIMEOUT,
          headers: options.headers
        }, (newRes) => handleResponse(newRes, redirectCount + 1));
        
        return;
      }
      
      handleResponse(res, redirectCount);
    };
    
    const handleResponse = (res, redirectCount) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return handleRedirect(res, redirectCount);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      const file = fs.createWriteStream(fullPath);
      res.pipe(file);
      
      file.on('finish', () => {
        file.close();
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size < 100) {
            fs.unlinkSync(fullPath);
            return reject(new Error('Downloaded file too small'));
          }
          resolve(`/cache/images/${localPath}`);
        } catch (e) {
          reject(e);
        }
      });
      
      file.on('error', (err) => {
        fs.unlink(fullPath, () => {});
        reject(err);
      });
    };
    
    const req = protocol.get(options, (res) => handleRedirect(res, 0));
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

// Determine CJ identifier from product
function getCJIdentifier(product) {
  // Priority: PID > cjPid > SPU > cjSpu > parse from URL
  if (product.cjPid) return { type: 'pid', id: product.cjPid };
  if (product.pid) return { type: 'pid', id: product.pid };
  
  if (product.cjSpu) return { type: 'spu', id: product.cjSpu };
  if (product.spu) return { type: 'spu', id: product.spu };
  
  // Try to extract from cjUrl
  if (product.cjUrl) {
    const pidMatch = product.cjUrl.match(/-p-([A-Za-z0-9_-]+)\.html/i);
    if (pidMatch) return { type: 'pid', id: pidMatch[1] };
    
    const productMatch = product.cjUrl.match(/\/product(?:-detail)?\/([A-Za-z0-9_-]+)/i);
    if (productMatch) return { type: 'pid', id: productMatch[1] };
  }
  
  // Try productId or id as PID
  if (product.productId && /^[0-9]{15,25}$/.test(product.productId)) {
    return { type: 'pid', id: product.productId };
  }
  
  return null;
}

// Enrich a single product
async function enrichProduct(product, token, options = {}) {
  const productId = product.id;
  const startTime = Date.now();
  
  log(`[Enrich] Processing product: ${productId} - ${(product.title || product.name || '').substring(0, 40)}...`);
  
  const result = {
    productId,
    success: false,
    error: null,
    imagesDownloaded: 0,
    fieldsUpdated: [],
    duration: 0
  };
  
  try {
    // Determine CJ identifier
    const cjId = getCJIdentifier(product);
    if (!cjId) {
      result.error = 'No CJ identifier found (no cjPid, cjSpu, or cjUrl)';
      return result;
    }
    
    log(`[Enrich] Using CJ ${cjId.type}: ${cjId.id}`);
    
    // Fetch CJ product
    let cjProduct = null;
    
    if (cjId.type === 'pid') {
      cjProduct = await getProductByPid(token, cjId.id);
      if (!cjProduct) {
        // Try as SPU
        cjProduct = await searchProductBySpu(token, cjId.id);
      }
    } else {
      cjProduct = await searchProductBySpu(token, cjId.id);
      if (!cjProduct) {
        // Try as PID
        cjProduct = await getProductByPid(token, cjId.id);
      }
    }
    
    if (!cjProduct) {
      result.error = `CJ product not found for ${cjId.type}: ${cjId.id}`;
      return result;
    }
    
    // Get variants
    const pid = cjProduct.pid || cjProduct.productId;
    if (pid) {
      const variants = await getProductVariants(token, pid);
      if (variants.length > 0) {
        cjProduct.variants = variants;
      }
    }
    
    // Collect all images
    const imageData = collectAllImages(cjProduct);
    log(`[Enrich] Found images: main=${!!imageData.mainImage}, gallery=${imageData.galleryImages.length}, variants=${Object.keys(imageData.variantImages).length}`);
    
    // Download images
    const downloadedImages = [];
    const productSlug = sanitize(cjProduct.productNameEn || product.title || product.id);
    
    // Download main image
    if (imageData.mainImage) {
      try {
        const ext = getImageExtension(imageData.mainImage);
        const filename = `${productSlug}_main_${hashUrl(imageData.mainImage)}${ext}`;
        const localPath = await downloadImageWithRetry(imageData.mainImage, filename);
        downloadedImages.push(localPath);
        result.imagesDownloaded++;
      } catch (e) {
        log(`[Enrich] Main image download failed: ${e.message}`);
      }
    }
    
    // Download gallery images (up to MAX_GALLERY_IMAGES)
    const galleryLimit = Math.min(imageData.galleryImages.length, MAX_GALLERY_IMAGES);
    for (let i = 0; i < galleryLimit; i++) {
      const imgUrl = imageData.galleryImages[i];
      try {
        const ext = getImageExtension(imgUrl);
        const filename = `${productSlug}_gallery${i + 1}_${hashUrl(imgUrl)}${ext}`;
        const localPath = await downloadImageWithRetry(imgUrl, filename);
        downloadedImages.push(localPath);
        result.imagesDownloaded++;
      } catch (e) {
        log(`[Enrich] Gallery image ${i + 1} download failed: ${e.message}`);
      }
    }
    
    // Check if we have at least one image
    if (downloadedImages.length === 0 && options.requireImages) {
      result.error = 'No images could be downloaded';
      return result;
    }
    
    // Prepare update data
    const updates = {
      enrichStatus: 'success',
      enrichError: null,
      updatedFromCjAt: new Date().toISOString()
    };
    
    // Store original values if not already stored
    if (!product.title_original && product.title) {
      updates.title_original = product.title;
    }
    if (!product.description_original && product.description) {
      updates.description_original = product.description;
    }
    
    // Store CJ raw snapshot
    updates.cj_raw_snapshot = JSON.stringify(cjProduct);
    
    // Update CJ identifiers
    if (cjProduct.pid) {
      updates.cjPid = cjProduct.pid;
      result.fieldsUpdated.push('cjPid');
    }
    if (cjProduct.productSku) {
      updates.cjSpu = cjProduct.productSku;
      result.fieldsUpdated.push('cjSpu');
    }
    
    // Update product fields (only if options allow or fields are empty)
    if (options.updateFields !== false) {
      if (cjProduct.productNameEn && (!product.title || options.overwriteFields)) {
        updates.title = cjProduct.productNameEn;
        result.fieldsUpdated.push('title');
      }
      
      if (cjProduct.description && (!product.description || options.overwriteFields)) {
        updates.description = cjProduct.description;
        result.fieldsUpdated.push('description');
      }
      
      if (cjProduct.categoryName) {
        updates.cjCategory = cjProduct.categoryName;
        result.fieldsUpdated.push('cjCategory');
      }
    }
    
    // Update images
    if (downloadedImages.length > 0) {
      updates.mainImage = downloadedImages[0];
      updates.image = downloadedImages[0]; // Also update legacy field
      updates.images = downloadedImages;
      result.fieldsUpdated.push('mainImage', 'images');
    } else if (!options.requireImages && product.image) {
      // Keep old images if no new ones downloaded
      log(`[Enrich] Keeping old images for ${productId}`);
    }
    
    // Update variants if available
    if (cjProduct.variants && cjProduct.variants.length > 0) {
      updates.variants = cjProduct.variants.map(v => ({
        vid: v.vid,
        sku: v.variantSku || v.sku,
        name: v.variantName || v.name,
        price: v.sellPrice || v.variantSellPrice,
        weight: v.variantWeight,
        image: imageData.variantImages[v.vid] || imageData.variantImages[v.variantSku] || null,
        options: v.variantKey || v.options || null
      }));
      result.fieldsUpdated.push('variants');
    }
    
    // Save updated product
    await updateProduct(productId, updates);
    
    result.success = true;
    result.duration = Date.now() - startTime;
    
    log(`[Enrich] Success: ${productId} - ${result.imagesDownloaded} images, ${result.fieldsUpdated.length} fields updated`);
    
  } catch (err) {
    result.error = err.message;
    result.duration = Date.now() - startTime;
    
    // Mark product as failed
    await updateProduct(productId, {
      enrichStatus: 'failed',
      enrichError: err.message,
      updatedFromCjAt: new Date().toISOString()
    });
    
    log(`[Enrich] Failed: ${productId} - ${err.message}`);
  }
  
  return result;
}

// Process batch with concurrency limit
async function processBatch(products, token, options, jobId) {
  const results = [];
  const queue = [...products];
  const running = [];
  
  while (queue.length > 0 || running.length > 0) {
    // Check if stop requested
    if (stopRequested) {
      log(`[Enrich] Stop requested, aborting batch`);
      break;
    }
    
    // Fill up to concurrency limit
    while (queue.length > 0 && running.length < CONCURRENCY_LIMIT) {
      const product = queue.shift();
      const promise = enrichProduct(product, token, options)
        .then(result => {
          results.push(result);
          return result;
        })
        .catch(err => {
          results.push({
            productId: product.id,
            success: false,
            error: err.message
          });
        });
      running.push(promise);
    }
    
    // Wait for at least one to complete
    if (running.length > 0) {
      await Promise.race(running);
      // Remove completed promises
      for (let i = running.length - 1; i >= 0; i--) {
        const isSettled = await Promise.race([
          running[i].then(() => true).catch(() => true),
          Promise.resolve(false)
        ]);
        if (isSettled) {
          running.splice(i, 1);
        }
      }
    }
  }
  
  // Wait for remaining
  await Promise.all(running);
  
  return results;
}

// Create new job
function createJob(totalProducts, options = {}) {
  const jobId = `enrich_${Date.now()}`;
  const job = {
    jobId,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    total: totalProducts,
    processed: 0,
    successCount: 0,
    failCount: 0,
    lastProductId: null,
    options,
    errors: []
  };
  
  const data = loadJobs();
  data.jobs.push(job);
  data.currentJobId = jobId;
  saveJobs(data);
  
  return job;
}

// Update job progress
function updateJobProgress(jobId, updates) {
  const data = loadJobs();
  const job = data.jobs.find(j => j.jobId === jobId);
  if (job) {
    Object.assign(job, updates);
    saveJobs(data);
  }
  return job;
}

// Get job by ID
function getJob(jobId) {
  const data = loadJobs();
  return data.jobs.find(j => j.jobId === jobId);
}

// Get current job status
function getCurrentJobStatus() {
  const data = loadJobs();
  if (!data.currentJobId) return null;
  
  const job = data.jobs.find(j => j.jobId === data.currentJobId);
  return job || null;
}

// Get last N jobs
function getRecentJobs(limit = 10) {
  const data = loadJobs();
  return data.jobs.slice(-limit).reverse();
}

// Run enrichment job
async function runEnrichmentJob(options = {}) {
  if (currentJob) {
    return { success: false, error: 'A job is already running', jobId: currentJob.jobId };
  }
  
  stopRequested = false;
  
  try {
    // Get token
    const token = await getAccessToken();
    
    // Load products
    let products = await loadProducts();
    
    // Filter to products with CJ identifiers
    const enrichableProducts = products.filter(p => {
      // Skip already processed if not forcing
      if (!options.force && p.enrichStatus === 'success') {
        return false;
      }
      
      // Must have CJ identifier
      return getCJIdentifier(p) !== null;
    });
    
    if (enrichableProducts.length === 0) {
      return { success: false, error: 'No products found with CJ identifiers to enrich' };
    }
    
    log(`[Enrich] Starting job for ${enrichableProducts.length} products`);
    
    // Create job
    currentJob = createJob(enrichableProducts.length, options);
    
    // Process in batches
    for (let i = 0; i < enrichableProducts.length; i += BATCH_SIZE) {
      if (stopRequested) {
        updateJobProgress(currentJob.jobId, {
          status: 'stopped',
          finishedAt: new Date().toISOString()
        });
        break;
      }
      
      const batch = enrichableProducts.slice(i, i + BATCH_SIZE);
      const results = await processBatch(batch, token, options, currentJob.jobId);
      
      // Update job progress
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      const newErrors = results
        .filter(r => !r.success && r.error)
        .map(r => ({
          productId: r.productId,
          error: r.error,
          timestamp: new Date().toISOString()
        }));
      
      const job = getJob(currentJob.jobId);
      const allErrors = [...(job?.errors || []), ...newErrors].slice(-50);
      
      updateJobProgress(currentJob.jobId, {
        processed: Math.min(i + BATCH_SIZE, enrichableProducts.length),
        successCount: (job?.successCount || 0) + successCount,
        failCount: (job?.failCount || 0) + failCount,
        lastProductId: batch[batch.length - 1]?.id,
        errors: allErrors
      });
      
      log(`[Enrich] Batch complete: ${i + batch.length}/${enrichableProducts.length} processed`);
    }
    
    // Mark job complete
    const finalJob = updateJobProgress(currentJob.jobId, {
      status: stopRequested ? 'stopped' : 'completed',
      finishedAt: new Date().toISOString()
    });
    
    const jobId = currentJob.jobId;
    currentJob = null;
    
    return {
      success: true,
      jobId,
      ...finalJob
    };
    
  } catch (err) {
    log(`[Enrich] Job error: ${err.message}`);
    
    if (currentJob) {
      updateJobProgress(currentJob.jobId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        errors: [...(getJob(currentJob.jobId)?.errors || []), {
          productId: 'SYSTEM',
          error: err.message,
          timestamp: new Date().toISOString()
        }]
      });
    }
    
    currentJob = null;
    
    return { success: false, error: err.message };
  }
}

// Resume job
async function resumeJob(jobId) {
  const job = getJob(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }
  
  if (job.status === 'running') {
    return { success: false, error: 'Job is already running' };
  }
  
  if (job.status === 'completed') {
    return { success: false, error: 'Job already completed' };
  }
  
  if (currentJob) {
    return { success: false, error: 'Another job is running' };
  }
  
  stopRequested = false;
  
  try {
    const token = await getAccessToken();
    let products = await loadProducts();
    
    // Get products that need processing (after lastProductId)
    const enrichableProducts = products.filter(p => {
      if (!job.options?.force && p.enrichStatus === 'success') {
        return false;
      }
      return getCJIdentifier(p) !== null;
    });
    
    // Find resume point
    let startIndex = 0;
    if (job.lastProductId) {
      const idx = enrichableProducts.findIndex(p => p.id === job.lastProductId);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }
    
    const remainingProducts = enrichableProducts.slice(startIndex);
    
    if (remainingProducts.length === 0) {
      updateJobProgress(jobId, {
        status: 'completed',
        finishedAt: new Date().toISOString()
      });
      return { success: true, message: 'No more products to process' };
    }
    
    log(`[Enrich] Resuming job ${jobId} from product ${startIndex}, ${remainingProducts.length} remaining`);
    
    currentJob = job;
    updateJobProgress(jobId, { status: 'running' });
    
    // Process remaining
    for (let i = 0; i < remainingProducts.length; i += BATCH_SIZE) {
      if (stopRequested) {
        updateJobProgress(jobId, {
          status: 'stopped',
          finishedAt: new Date().toISOString()
        });
        break;
      }
      
      const batch = remainingProducts.slice(i, i + BATCH_SIZE);
      const results = await processBatch(batch, token, job.options || {}, jobId);
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      const newErrors = results
        .filter(r => !r.success && r.error)
        .map(r => ({
          productId: r.productId,
          error: r.error,
          timestamp: new Date().toISOString()
        }));
      
      const currentJobData = getJob(jobId);
      const allErrors = [...(currentJobData?.errors || []), ...newErrors].slice(-50);
      
      updateJobProgress(jobId, {
        processed: startIndex + i + batch.length,
        successCount: (currentJobData?.successCount || 0) + successCount,
        failCount: (currentJobData?.failCount || 0) + failCount,
        lastProductId: batch[batch.length - 1]?.id,
        errors: allErrors
      });
    }
    
    const finalJob = updateJobProgress(jobId, {
      status: stopRequested ? 'stopped' : 'completed',
      finishedAt: new Date().toISOString()
    });
    
    currentJob = null;
    
    return { success: true, ...finalJob };
    
  } catch (err) {
    log(`[Enrich] Resume error: ${err.message}`);
    
    updateJobProgress(jobId, {
      status: 'failed',
      errors: [...(getJob(jobId)?.errors || []), {
        productId: 'SYSTEM',
        error: err.message,
        timestamp: new Date().toISOString()
      }]
    });
    
    currentJob = null;
    
    return { success: false, error: err.message };
  }
}

// Stop job
function stopJob(jobId) {
  const job = getJob(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }
  
  if (job.status !== 'running') {
    return { success: false, error: 'Job is not running' };
  }
  
  stopRequested = true;
  log(`[Enrich] Stop requested for job ${jobId}`);
  
  return { success: true, message: 'Stop requested' };
}

// Get enrichment stats
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
  resumeJob,
  stopJob,
  getCurrentJobStatus,
  getRecentJobs,
  getJob,
  getEnrichmentStats,
  getCJIdentifier
};
