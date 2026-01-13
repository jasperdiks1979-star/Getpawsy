/**
 * CJ URL/SPU Import Module - Enhanced Version
 * Import individual products from CJ Dropshipping by URL, SPU, PID, CJCT, or CJYD
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { log } = require('./logger');
const petEligibility = require('./petEligibility');
const { classifyProduct: classifyProductCategory } = require('./categoryClassifier');

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const CACHE_DIR = path.join(__dirname, '..', 'public', 'cache', 'images');
const TOKEN_CACHE = path.join(__dirname, '..', 'data', 'cj-token.json');
const IMPORT_LOG = path.join(__dirname, '..', 'data', 'cj-import-log.json');

const CJ_EMAIL = process.env.CJ_EMAIL;
const CJ_API_KEY = process.env.CJ_API_KEY;

const TIMEOUT = 30000;

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

/**
 * Normalize image URL from CJ API response
 * Handles various formats: protocol-relative, missing protocol, query params, etc.
 */
function normalizeImageUrl(rawUrl, baseUrl = 'https://cf.cjdropshipping.com') {
  if (!rawUrl || typeof rawUrl !== 'string') {
    log(`[CJ Image] normalizeImageUrl: Invalid input - ${typeof rawUrl}: ${JSON.stringify(rawUrl)}`);
    return null;
  }
  
  let url = rawUrl.trim();
  
  // Log raw input for debugging
  log(`[CJ Image] Normalizing raw URL: "${url.substring(0, 100)}..."`);
  
  // Handle protocol-relative URLs (//example.com/image.jpg)
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  
  // Handle relative URLs (/path/to/image.jpg)
  if (url.startsWith('/') && !url.startsWith('//')) {
    url = baseUrl + url;
  }
  
  // Handle URLs without protocol (example.com/image.jpg)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // Check if it looks like a domain
    if (url.match(/^[a-z0-9.-]+\.[a-z]{2,}\//i)) {
      url = 'https://' + url;
    } else {
      // Assume it's a path
      url = baseUrl + '/' + url;
    }
  }
  
  // Validate URL and reject non-http(s) schemes
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      log(`[CJ Image] Invalid protocol: ${parsed.protocol} - rejecting`);
      return null;
    }
    log(`[CJ Image] Normalized URL: "${url.substring(0, 100)}..."`);
    return url;
  } catch (e) {
    log(`[CJ Image] Invalid URL after normalization: "${url}" - ${e.message}`);
    return null;
  }
}

/**
 * Validate image URL with HEAD request, fallback to GET+Range if HEAD blocked
 * Returns { valid: boolean, statusCode: number, contentType: string, error: string, method: string }
 */
function validateImageUrl(url, sourceField = 'unknown') {
  return new Promise(async (resolve) => {
    if (!url) {
      return resolve({ valid: false, error: 'No URL provided', sourceField });
    }
    
    const normalizedUrl = normalizeImageUrl(url);
    if (!normalizedUrl) {
      log(`[CJ ImageValidate] INVALID URL FORMAT - source: ${sourceField}, raw: ${url}`);
      return resolve({ valid: false, error: 'Invalid URL format', sourceField });
    }
    
    log(`[CJ ImageValidate] Checking: ${normalizedUrl} (source: ${sourceField})`);
    
    // Try HEAD first
    const headResult = await tryRequest(normalizedUrl, 'HEAD', sourceField);
    if (headResult.valid) {
      log(`[CJ ImageValidate] HEAD OK: ${normalizedUrl} -> HTTP ${headResult.statusCode}`);
      return resolve(headResult);
    }
    
    // HEAD failed - try GET with Range header (some CDNs block HEAD)
    if (headResult.statusCode === 403 || headResult.statusCode === 405 || headResult.error?.includes('timeout')) {
      log(`[CJ ImageValidate] HEAD blocked (${headResult.statusCode || headResult.error}), trying GET+Range...`);
      const getResult = await tryRequest(normalizedUrl, 'GET', sourceField, { 'Range': 'bytes=0-2048' });
      if (getResult.valid) {
        log(`[CJ ImageValidate] GET+Range OK: ${normalizedUrl} -> HTTP ${getResult.statusCode}`);
        return resolve(getResult);
      }
      log(`[CJ ImageValidate] GET+Range FAILED: ${normalizedUrl} -> ${getResult.statusCode || getResult.error}`);
      return resolve(getResult);
    }
    
    log(`[CJ ImageValidate] FAILED: ${normalizedUrl} -> HTTP ${headResult.statusCode || headResult.error} (source: ${sourceField})`);
    return resolve(headResult);
  });
}

function tryRequest(normalizedUrl, method, sourceField, extraHeaders = {}) {
  return new Promise((resolve) => {
    const protocol = normalizedUrl.startsWith('https') ? https : http;
    const urlObj = new URL(normalizedUrl);
    
    const options = {
      method,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.cjdropshipping.com/',
        'Connection': 'keep-alive',
        ...extraHeaders
      }
    };
    
    const req = protocol.request(options, (res) => {
      // Consume body for GET requests
      if (method === 'GET') {
        res.on('data', () => {});
        res.on('end', () => {});
      }
      
      const contentType = res.headers['content-type'] || '';
      const isImage = contentType.includes('image') || contentType.includes('octet-stream');
      const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode);
      
      if ((res.statusCode === 200 || res.statusCode === 206) && isImage) {
        resolve({ valid: true, statusCode: res.statusCode, contentType, url: normalizedUrl, method, sourceField });
      } else if (isRedirect && res.headers.location) {
        resolve({ valid: true, statusCode: res.statusCode, redirect: res.headers.location, url: normalizedUrl, method, sourceField });
      } else if (res.statusCode === 200 || res.statusCode === 206) {
        resolve({ valid: true, statusCode: res.statusCode, contentType, url: normalizedUrl, method, sourceField, warning: 'Non-image content-type' });
      } else {
        resolve({ valid: false, statusCode: res.statusCode, error: `HTTP ${res.statusCode}`, url: normalizedUrl, method, sourceField });
      }
    });
    
    req.on('error', (err) => {
      resolve({ valid: false, error: err.message, url: normalizedUrl, method, sourceField });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ valid: false, error: 'Timeout', url: normalizedUrl, method, sourceField });
    });
    
    req.end();
  });
}

/**
 * Pick valid product images with validation (HEAD + GET fallback)
 * Returns { mainUrl, galleryUrls[], validationResults }
 */
async function pickValidProductImages(cjProduct) {
  const imageData = collectAllImages(cjProduct);
  const pid = cjProduct.pid || cjProduct.productId || 'unknown';
  
  log(`[CJ ImagePicker] PID ${pid}: Starting validation. Raw candidates: main=${!!imageData.mainImage}, gallery=${imageData.galleryImages.length}`);
  
  const result = {
    mainUrl: null,
    galleryUrls: [],
    validationResults: {
      mainCandidates: [],
      galleryCandidates: [],
      validCount: 0,
      invalidCount: 0
    }
  };
  
  // Build main image candidate list with source tracking
  const mainCandidates = [];
  if (imageData.mainImage) mainCandidates.push({ url: imageData.mainImage, source: imageData.mainImageSource || 'mainImage' });
  for (let i = 0; i < Math.min(3, imageData.galleryImages.length); i++) {
    const url = imageData.galleryImages[i];
    if (url && url !== imageData.mainImage) {
      mainCandidates.push({ url, source: `gallery[${i}]` });
    }
  }
  
  log(`[CJ ImagePicker] PID ${pid}: Validating ${mainCandidates.length} main image candidates...`);
  
  // Validate main image candidates until we find a valid one
  for (const { url, source } of mainCandidates) {
    log(`[CJ ImagePicker] PID ${pid}: Trying main candidate from "${source}": ${url}`);
    const validation = await validateImageUrl(url, source);
    result.validationResults.mainCandidates.push({
      url: url.substring(0, 120),
      source,
      ...validation
    });
    
    if (validation.valid) {
      result.mainUrl = url;
      result.validationResults.validCount++;
      log(`[CJ ImagePicker] PID ${pid}: MAIN IMAGE FOUND from "${source}" -> HTTP ${validation.statusCode}`);
      break;
    } else {
      result.validationResults.invalidCount++;
      log(`[CJ ImagePicker] PID ${pid}: Main candidate FAILED from "${source}" -> ${validation.error || 'HTTP ' + validation.statusCode}`);
    }
  }
  
  // Validate gallery images (skip the main one)
  const galleryCandidates = imageData.galleryImages
    .filter(url => url !== result.mainUrl)
    .slice(0, 12);
  
  for (let i = 0; i < galleryCandidates.length; i++) {
    const url = galleryCandidates[i];
    const validation = await validateImageUrl(url, `gallery[${i}]`);
    result.validationResults.galleryCandidates.push({
      url: url.substring(0, 120),
      source: `gallery[${i}]`,
      ...validation
    });
    
    if (validation.valid) {
      result.galleryUrls.push(url);
      result.validationResults.validCount++;
    } else {
      result.validationResults.invalidCount++;
    }
  }
  
  log(`[CJ ImagePicker] PID ${pid}: FINAL - main=${!!result.mainUrl}, gallery=${result.galleryUrls.length}, valid=${result.validationResults.validCount}, invalid=${result.validationResults.invalidCount}`);
  
  if (!result.mainUrl) {
    log(`[CJ ImagePicker] PID ${pid}: WARNING - No valid main image found! Raw fields: ${JSON.stringify(imageData.rawFields)}`);
  }
  
  return result;
}

/**
 * Extract URL(s) from a field value that might be:
 * - A single URL string
 * - A JSON string containing an array of URLs (e.g., "[\"url1\",\"url2\"]")
 * - An actual array of URLs
 * Returns an array of URL strings
 */
function extractUrls(value) {
  if (!value) return [];
  
  // Already an array
  if (Array.isArray(value)) {
    return value.filter(u => typeof u === 'string' && u.length > 0);
  }
  
  // Must be a string
  if (typeof value !== 'string') return [];
  
  const trimmed = value.trim();
  
  // Check if it looks like a JSON array string (starts with "[")
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        log(`[CJ Image] Parsed JSON array from string, found ${parsed.length} URLs`);
        return parsed.filter(u => typeof u === 'string' && u.length > 0);
      }
    } catch (e) {
      // Not valid JSON, treat as single URL
      log(`[CJ Image] Failed to parse as JSON array: ${e.message}`);
    }
  }
  
  // Single URL string
  return [trimmed];
}

/**
 * Collect all images from CJ product response
 * Returns { mainImage, galleryImages, variantImages }
 */
function collectAllImages(cjProduct) {
  const result = {
    mainImage: null,
    mainImageSource: null,
    galleryImages: [],
    variantImages: {},
    rawFields: {}
  };
  
  // Log all raw image fields for debugging
  const imageFields = [
    'productImage', 'bigImage', 'productImageSet', 'productImageSetStr',
    'image', 'images', 'mainImage', 'thumbImage', 'smallImage'
  ];
  
  for (const field of imageFields) {
    if (cjProduct[field] !== undefined) {
      result.rawFields[field] = cjProduct[field];
      const rawStr = JSON.stringify(cjProduct[field]);
      log(`[CJ Image] Raw field '${field}': ${rawStr.substring(0, 200)}${rawStr.length > 200 ? '...' : ''}`);
    }
  }
  
  // Collect all gallery/main image sources - use extractUrls for robust parsing
  const gallerySources = [];
  
  // productImage might be a single URL or JSON array string
  const productImageUrls = extractUrls(cjProduct.productImage);
  if (productImageUrls.length > 0) {
    gallerySources.push(...productImageUrls.map(u => ({ url: u, source: 'productImage' })));
  }
  
  // bigImage 
  const bigImageUrls = extractUrls(cjProduct.bigImage);
  if (bigImageUrls.length > 0) {
    gallerySources.push(...bigImageUrls.map(u => ({ url: u, source: 'bigImage' })));
  }
  
  // mainImage field
  const mainImageUrls = extractUrls(cjProduct.mainImage);
  if (mainImageUrls.length > 0) {
    gallerySources.push(...mainImageUrls.map(u => ({ url: u, source: 'mainImage' })));
  }
  
  // image field
  const imageUrls = extractUrls(cjProduct.image);
  if (imageUrls.length > 0) {
    gallerySources.push(...imageUrls.map(u => ({ url: u, source: 'image' })));
  }
  
  // thumbImage
  const thumbImageUrls = extractUrls(cjProduct.thumbImage);
  if (thumbImageUrls.length > 0) {
    gallerySources.push(...thumbImageUrls.map(u => ({ url: u, source: 'thumbImage' })));
  }
  
  // productImageSet (array)
  if (Array.isArray(cjProduct.productImageSet)) {
    gallerySources.push(...cjProduct.productImageSet.map(u => ({ url: u, source: 'productImageSet' })));
  }
  
  // productImageSetStr (comma-separated string OR JSON array string)
  if (typeof cjProduct.productImageSetStr === 'string') {
    const setStr = cjProduct.productImageSetStr.trim();
    let urls = [];
    if (setStr.startsWith('[')) {
      urls = extractUrls(setStr);
    } else {
      urls = setStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    gallerySources.push(...urls.map(u => ({ url: u, source: 'productImageSetStr' })));
  }
  
  // images array
  if (Array.isArray(cjProduct.images)) {
    gallerySources.push(...cjProduct.images.map(u => ({ url: u, source: 'images' })));
  }
  
  // Normalize and dedupe, pick first valid as main
  const seenUrls = new Set();
  
  for (const { url, source } of gallerySources) {
    const normalized = normalizeImageUrl(url);
    if (normalized && !seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      if (!result.mainImage) {
        result.mainImage = normalized;
        result.mainImageSource = source;
        log(`[CJ Image] Selected main image from '${source}': ${normalized.substring(0, 80)}...`);
      } else {
        result.galleryImages.push(normalized);
      }
    }
  }
  
  // Variant images - store under BOTH vid and variantSku for flexible lookup
  if (Array.isArray(cjProduct.variants)) {
    for (const variant of cjProduct.variants) {
      const vid = variant.vid;
      const variantSku = variant.variantSku;
      const variantId = variant.variantId;
      
      if (!vid && !variantSku && !variantId) continue;
      
      const variantImgFields = ['variantImage', 'image', 'variantImg', 'thumbImage'];
      let normalizedImg = null;
      
      for (const field of variantImgFields) {
        if (variant[field]) {
          log(`[CJ Image] Variant vid=${vid} sku=${variantSku} field '${field}': ${JSON.stringify(variant[field]).substring(0, 100)}`);
        }
        // Use extractUrls to handle potential JSON strings
        const urls = extractUrls(variant[field]);
        if (urls.length > 0) {
          const normalized = normalizeImageUrl(urls[0]);
          if (normalized) {
            normalizedImg = normalized;
            break;
          }
        }
      }
      
      // Store under all available keys for flexible lookup
      if (normalizedImg) {
        if (vid) result.variantImages[vid] = normalizedImg;
        if (variantSku) result.variantImages[variantSku] = normalizedImg;
        if (variantId) result.variantImages[variantId] = normalizedImg;
      }
    }
  }
  
  log(`[CJ Image] Collected: main=${!!result.mainImage} (from ${result.mainImageSource}), gallery=${result.galleryImages.length}, variants=${Object.keys(result.variantImages).length}`);
  
  return result;
}

function logImportAction(action) {
  try {
    ensureDir(path.dirname(IMPORT_LOG));
    let logs = [];
    if (fs.existsSync(IMPORT_LOG)) {
      logs = JSON.parse(fs.readFileSync(IMPORT_LOG, 'utf8'));
    }
    logs.push({ ...action, timestamp: new Date().toISOString() });
    if (logs.length > 500) logs = logs.slice(-400);
    fs.writeFileSync(IMPORT_LOG, JSON.stringify(logs, null, 2));
  } catch (e) {}
}

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

  log('[CJ Import] Requesting new access token...');
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

  log('[CJ Import] Access token obtained and cached');
  return token;
}

/**
 * Detect input type and extract identifier
 * Supports: CJ URL (all patterns), SPU, PID, CJCT*, CJYD*, SKU codes, numeric IDs
 */
function parseCJInput(input) {
  if (!input || typeof input !== 'string') {
    return { ok: false, error: 'Empty input', inputType: null, hint: 'Paste a CJ product URL or ID' };
  }

  const trimmed = input.trim();
  
  // CJCT or CJYD or CJMC format (e.g., CJCT25677400001, CJYD12345, CJMC1234567)
  // These are SKU/SPU codes, NOT PIDs - must use SPU search first
  if (/^CJCT[0-9]+$/i.test(trimmed)) {
    return { ok: true, id: trimmed.toUpperCase(), inputType: 'CJCT', queryMethod: 'spu_first', displayType: 'CJ Tracking ID (SKU)' };
  }
  if (/^CJYD[0-9]+$/i.test(trimmed)) {
    return { ok: true, id: trimmed.toUpperCase(), inputType: 'CJYD', queryMethod: 'spu_first', displayType: 'CJ Shipping ID (SKU)' };
  }
  if (/^CJMC[0-9]+$/i.test(trimmed)) {
    return { ok: true, id: trimmed.toUpperCase(), inputType: 'CJMC', queryMethod: 'spu_first', displayType: 'CJ Product SKU' };
  }
  if (/^CJ[A-Z]{0,2}[0-9]+$/i.test(trimmed)) {
    return { ok: true, id: trimmed.toUpperCase(), inputType: 'CJ-ID', queryMethod: 'spu_first', displayType: 'CJ SKU Code' };
  }
  
  // SKU format (letters + numbers, common pattern)
  if (/^[A-Z]{2,6}[0-9]{4,12}$/i.test(trimmed)) {
    return { ok: true, id: trimmed.toUpperCase(), inputType: 'sku', queryMethod: 'spu', displayType: 'SKU Code' };
  }

  // Pure numeric (could be PID or SPU)
  if (/^[0-9]{10,25}$/.test(trimmed)) {
    return { ok: true, id: trimmed, inputType: 'numeric', queryMethod: 'both', displayType: 'Product ID' };
  }
  
  // Shorter numeric (6-9 digits) - also try as PID
  if (/^[0-9]{6,9}$/.test(trimmed)) {
    return { ok: true, id: trimmed, inputType: 'short-numeric', queryMethod: 'both', displayType: 'Short ID' };
  }

  // Alphanumeric SPU format
  if (/^[A-Za-z0-9_-]{8,30}$/.test(trimmed) && !trimmed.includes('http')) {
    return { ok: true, id: trimmed, inputType: 'spu', queryMethod: 'spu', displayType: 'SPU Code' };
  }

  // URL parsing - support many CJ URL patterns
  if (trimmed.includes('cjdropshipping.com') || trimmed.includes('cj.com') || trimmed.startsWith('http')) {
    try {
      // Pattern: -p-{id}.html (most common)
      const p1 = trimmed.match(/-p-([A-Za-z0-9_-]+)\.html/i);
      if (p1) {
        return { ok: true, id: p1[1], inputType: 'url-p-pattern', queryMethod: 'pid', displayType: 'URL (-p- pattern)' };
      }
      
      // Pattern: product-{id}.html
      const p1b = trimmed.match(/product-([A-Za-z0-9_-]+)\.html/i);
      if (p1b) {
        return { ok: true, id: p1b[1], inputType: 'url-product-pattern', queryMethod: 'both', displayType: 'URL (product- pattern)' };
      }

      // Pattern: /product-detail/{id} or /product/{id}
      const p2 = trimmed.match(/\/product(?:-detail)?\/([A-Za-z0-9_-]+)(?:\.html)?/i);
      if (p2) {
        return { ok: true, id: p2[1], inputType: 'url-product', queryMethod: 'both', displayType: 'URL (/product/)' };
      }
      
      // Pattern: /detail/{id} or /item/{id}
      const p3 = trimmed.match(/\/(?:detail|item)\/([A-Za-z0-9_-]+)/i);
      if (p3) {
        return { ok: true, id: p3[1], inputType: 'url-detail', queryMethod: 'both', displayType: 'URL (/detail/)' };
      }

      // Query params - check multiple param names
      const urlObj = new URL(trimmed);
      const paramNames = ['pid', 'spu', 'id', 'productId', 'sku', 'product_id', 'itemId'];
      for (const pname of paramNames) {
        const val = urlObj.searchParams.get(pname);
        if (val && val.length >= 5) {
          return { ok: true, id: val, inputType: 'url-query', queryMethod: 'both', displayType: `URL (?${pname}=)` };
        }
      }
      
      // Hash fragment (some sites use #pid=xxx)
      if (urlObj.hash) {
        const hashMatch = urlObj.hash.match(/(?:pid|id|spu)=([A-Za-z0-9_-]+)/i);
        if (hashMatch) {
          return { ok: true, id: hashMatch[1], inputType: 'url-hash', queryMethod: 'both', displayType: 'URL (hash)' };
        }
      }

      // Last path segment fallback
      const segments = urlObj.pathname.split('/').filter(s => s.length > 5);
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i].replace(/\.html$/i, '');
        if (/^[A-Za-z0-9_-]{8,30}$/.test(seg)) {
          return { ok: true, id: seg, inputType: 'url-path', queryMethod: 'both', displayType: 'URL (path segment)' };
        }
      }

      return { 
        ok: false, 
        error: 'Could not extract product ID from URL', 
        inputType: 'url',
        hint: 'Try copying the product page URL directly, or use the SPU/PID from the product page'
      };
    } catch (e) {
      return { ok: false, error: `Invalid URL: ${e.message}`, inputType: 'url', hint: 'Check the URL format' };
    }
  }

  return { 
    ok: false, 
    error: 'Unrecognized input format', 
    inputType: 'unknown',
    hint: 'Enter a CJ product URL, SPU, PID, SKU, or CJCT/CJYD code'
  };
}

/**
 * Fetch product by PID
 */
async function getProductByPid(token, pid) {
  const url = `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(pid)}`;
  log(`[CJ Import] Fetching by PID: ${pid}`);
  
  const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
  
  if (res.statusCode !== 200) {
    throw new Error(`API error: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  log(`[CJ Import] PID query response code: ${data.code}`);
  
  if (data.code === 200 && data.data) {
    return data.data;
  }
  
  return null;
}

/**
 * Fetch product variants by PID
 */
async function getProductVariants(token, pid) {
  const url = `${CJ_API_BASE}/product/variant/query?pid=${encodeURIComponent(pid)}`;
  log(`[CJ Import] Fetching variants for: ${pid}`);
  
  try {
    const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
    
    if (res.statusCode !== 200) return [];
    
    const data = JSON.parse(res.body);
    if (data.code === 200 && data.data) {
      return Array.isArray(data.data) ? data.data : [data.data];
    }
  } catch (e) {
    log(`[CJ Import] Variant fetch error: ${e.message}`);
  }
  
  return [];
}

/**
 * Search product by SPU or name
 */
async function searchProduct(token, query) {
  const url = `${CJ_API_BASE}/product/list?pageNum=1&pageSize=20`;
  log(`[CJ Import] Searching by SKU: ${query}`);
  
  const res = await httpsRequest('POST', url, { 'CJ-Access-Token': token }, {
    productSku: query
  });
  
  if (res.statusCode !== 200) {
    throw new Error(`Search error: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  
  if (data.code === 200 && data.data?.list?.length > 0) {
    const exact = data.data.list.find(p => 
      p.pid === query || p.productSku === query || p.productId === query
    );
    return exact || data.data.list[0];
  }
  
  return null;
}

/**
 * Search product by name/keyword
 */
async function searchProductByName(token, keyword, options = {}) {
  const url = `${CJ_API_BASE}/product/list?pageNum=${options.pageNum || 1}&pageSize=${options.pageSize || 20}`;
  log(`[CJ Import] Searching by keyword: ${keyword}`);
  
  const body = { productNameEn: keyword };
  if (options.categoryId) body.categoryId = options.categoryId;
  if (options.createFrom) body.createFrom = options.createFrom;
  
  const res = await httpsRequest('POST', url, { 'CJ-Access-Token': token }, body);
  
  if (res.statusCode !== 200) {
    throw new Error(`Keyword search error: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  
  if (data.code === 200 && data.data?.list?.length > 0) {
    return {
      products: data.data.list,
      total: data.data.total || data.data.list.length,
      pageNum: options.pageNum || 1,
      pageSize: options.pageSize || 20
    };
  }
  
  return { products: [], total: 0, pageNum: 1, pageSize: 20 };
}

/**
 * Normalize warehouse filter - maps UI value to CJ warehouse codes
 */
function normalizeWarehouseFilter(warehouse) {
  if (!warehouse) return [];
  const w = String(warehouse).toUpperCase().trim();
  // CJ uses various codes for US warehouses
  if (w === 'US' || w === 'USA') {
    return ['US', 'USA', 'US-CA', 'US-NJ', 'US-TX', 'USCA', 'USNJ', 'USTX', 'CJ-US'];
  }
  return [w];
}

/**
 * Check if product is from US warehouse
 */
function isUSWarehouse(product) {
  const codes = normalizeWarehouseFilter('US');
  const warehouse = (product.createFrom || '').toUpperCase().trim();
  // Also check variants for US warehouse availability
  if (codes.some(c => warehouse.includes(c))) return true;
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      const vw = (v.createFrom || '').toUpperCase().trim();
      if (codes.some(c => vw.includes(c))) return true;
    }
  }
  return false;
}

/**
 * Search CJ catalog with full filters (for Browse Tab)
 * Features smart fallback when filters return 0 results
 * Note: CJ API /product/list uses GET method with query params
 */
async function searchCatalog(options = {}) {
  const token = await getAccessToken();
  const pageNum = options.pageNum || 1;
  const pageSize = Math.max(10, Math.min(options.pageSize || 20, 200));
  
  // Build URL with query parameters (CJ API requires GET)
  const params = new URLSearchParams();
  params.set('pageNum', pageNum.toString());
  params.set('pageSize', pageSize.toString());
  if (options.keyword) params.set('productNameEn', options.keyword);
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.minPrice) params.set('startPrice', options.minPrice.toString());
  if (options.maxPrice) params.set('endPrice', options.maxPrice.toString());
  
  const url = `${CJ_API_BASE}/product/list?${params.toString()}`;
  
  // Debug object to track filtering
  const debug = {
    requestedFilters: {
      keyword: options.keyword || null,
      usOnly: !!options.usOnly,
      petOnly: !!options.petOnly,
      requireImages: !!options.requireImages,
      minPrice: options.minPrice || null,
      maxPrice: options.maxPrice || null
    },
    apiParams: Object.fromEntries(params),
    rawCount: 0,
    afterUsFilter: 0,
    afterPetFilter: 0,
    afterImageFilter: 0,
    fallbackUsed: null,
    warehousesFound: []
  };
  
  log(`[CJ Browse] Searching catalog: ${JSON.stringify(options)}`);
  log(`[CJ Browse] API URL: ${url}`);
  
  // Use GET method (CJ API v2 /product/list requires GET)
  const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
  
  if (res.statusCode !== 200) {
    throw new Error(`Catalog search error: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  
  if (data.code !== 200 || !data.data?.list) {
    log(`[CJ Browse] API returned code ${data.code}: ${data.message || 'No data'}`);
    return { products: [], total: 0, pageNum, pageSize, rawTotal: 0, debug };
  }
  
  let products = data.data.list;
  const rawTotal = data.data.total || products.length;
  debug.rawCount = products.length;
  
  // Collect warehouse codes found for debugging
  const warehouseSet = new Set();
  products.forEach(p => {
    if (p.createFrom) warehouseSet.add(p.createFrom);
  });
  debug.warehousesFound = Array.from(warehouseSet);
  
  // Helper to apply filters with counts
  function applyFilters(prods, usOnly, petOnly, requireImages) {
    let filtered = prods;
    
    if (usOnly) {
      filtered = filtered.filter(p => isUSWarehouse(p));
    }
    
    if (petOnly) {
      filtered = filtered.filter(p => isPetRelated(p));
    }
    
    if (requireImages) {
      filtered = filtered.filter(p => p.productImage || p.bigImage);
    }
    
    return filtered;
  }
  
  // Smart fallback logic - try progressively relaxed filters
  const originalFilters = {
    usOnly: !!options.usOnly,
    petOnly: !!options.petOnly,
    requireImages: !!options.requireImages
  };
  
  // Fallback chain: full filters -> drop petOnly -> drop usOnly -> drop requireImages -> no filters
  const fallbackChain = [
    { ...originalFilters, name: 'original' },
    { ...originalFilters, petOnly: false, name: 'no_pet_filter' },
    { ...originalFilters, usOnly: false, name: 'no_us_filter' },
    { ...originalFilters, petOnly: false, usOnly: false, name: 'no_pet_us_filter' },
    { ...originalFilters, requireImages: false, name: 'no_image_filter' },
    { usOnly: false, petOnly: false, requireImages: false, name: 'no_filters' }
  ];
  
  let finalProducts = [];
  let usedFallback = null;
  
  for (const fb of fallbackChain) {
    const filtered = applyFilters(products, fb.usOnly, fb.petOnly, fb.requireImages);
    if (filtered.length > 0) {
      finalProducts = filtered;
      usedFallback = fb.name === 'original' ? null : fb.name;
      break;
    }
  }
  
  debug.fallbackUsed = usedFallback;
  debug.afterUsFilter = applyFilters(products, true, false, false).length;
  debug.afterPetFilter = applyFilters(products, false, true, false).length;
  debug.afterImageFilter = applyFilters(products, false, false, true).length;
  
  // Apply sorting
  if (options.sort === 'lowCost') {
    finalProducts.sort((a, b) => (parseFloat(a.sellPrice) || 0) - (parseFloat(b.sellPrice) || 0));
  } else if (options.sort === 'highMargin') {
    finalProducts.sort((a, b) => (parseFloat(b.sellPrice) || 0) - (parseFloat(a.sellPrice) || 0));
  }
  
  log(`[CJ Browse] Results: raw=${debug.rawCount}, final=${finalProducts.length}, fallback=${usedFallback || 'none'}`);
  
  return {
    products: finalProducts.map(p => ({
      pid: p.pid,
      spu: p.productSku,
      title: p.productNameEn || p.productName,
      image: p.productImage || p.bigImage,
      costPrice: parseFloat(p.sellPrice) || 0,
      category: p.categoryName,
      warehouse: p.createFrom || 'CN',
      isPetRelated: isPetRelated(p),
      petType: detectPetType(p)
    })),
    total: rawTotal,
    pageNum,
    pageSize,
    rawTotal,
    filteredCount: finalProducts.length,
    debug
  };
}

/**
 * Unified product fetch with multiple fallback strategies
 * Supports: pid, spu, spu_first, both
 * - pid: Try PID query only
 * - spu: Try SPU/SKU search only
 * - spu_first: Try SPU search first, then PID (for CJCT/CJMC codes)
 * - both: Try PID first, then SPU
 */
async function fetchProduct(inputId, queryMethod = 'both') {
  const token = await getAccessToken();
  let product = null;
  let usedEndpoint = null;
  
  log(`[CJ Import] Fetching product: ${inputId} (method: ${queryMethod})`);
  
  // For spu_first: Try SPU search first (better for CJCT/CJMC codes)
  if (queryMethod === 'spu_first' || queryMethod === 'spu') {
    try {
      product = await searchProduct(token, inputId);
      if (product) {
        usedEndpoint = 'searchProduct';
        log(`[CJ Import] Found via SPU search: ${product.pid || product.productSku}`);
      }
    } catch (e) {
      log(`[CJ Import] SPU search failed: ${e.message}`);
    }
    
    // For spu_first: Also try as PID fallback
    if (!product && queryMethod === 'spu_first') {
      try {
        product = await getProductByPid(token, inputId);
        if (product) {
          usedEndpoint = 'getProductByPid (fallback)';
          log(`[CJ Import] Found via PID fallback`);
        }
      } catch (e) {
        log(`[CJ Import] PID fallback failed: ${e.message}`);
      }
    }
  }
  
  // For pid or both: Try PID query first
  if (!product && (queryMethod === 'pid' || queryMethod === 'both')) {
    try {
      product = await getProductByPid(token, inputId);
      if (product) {
        usedEndpoint = 'getProductByPid';
        log(`[CJ Import] Found via PID query`);
      }
    } catch (e) {
      log(`[CJ Import] PID query failed: ${e.message}`);
    }
  }
  
  // For both: Also try SPU search as fallback
  if (!product && queryMethod === 'both') {
    try {
      product = await searchProduct(token, inputId);
      if (product) {
        usedEndpoint = 'searchProduct';
        log(`[CJ Import] Found via search fallback`);
      }
    } catch (e) {
      log(`[CJ Import] Search failed: ${e.message}`);
    }
  }
  
  if (!product) {
    logImportAction({
      action: 'fetch_failed',
      input: inputId,
      queryMethod,
      error: 'Product not found in CJ database'
    });
    throw new Error(`Product not found: ${inputId}. Verify this is a valid CJ product ID (PID/SPU).`);
  }
  
  // Fetch variants separately using the product's actual PID
  const pid = product.pid || product.productId;
  if (pid) {
    try {
      const variants = await getProductVariants(token, pid);
      if (variants.length > 0) {
        product.variants = variants;
        log(`[CJ Import] Fetched ${variants.length} variants for PID: ${pid}`);
      }
    } catch (e) {
      log(`[CJ Import] Variant fetch error: ${e.message}`);
    }
  }
  
  return { product, usedEndpoint };
}

/**
 * Download image to cache with robust error handling
 * Handles redirects, 403, and various network errors
 */
function downloadImage(url, localPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (!url) {
      log(`[CJ Image] downloadImage: No URL provided`);
      return reject(new Error('No URL provided'));
    }
    
    // Normalize URL first
    const normalizedUrl = normalizeImageUrl(url);
    if (!normalizedUrl) {
      log(`[CJ Image] downloadImage: Invalid URL - ${url}`);
      return reject(new Error(`Invalid URL: ${url}`));
    }
    
    // Prevent infinite redirects
    if (redirectCount > 5) {
      log(`[CJ Image] downloadImage: Too many redirects for ${url}`);
      return reject(new Error('Too many redirects'));
    }
    
    ensureDir(CACHE_DIR);
    const fullPath = path.join(CACHE_DIR, localPath);
    
    // Check if already cached
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      if (stats.size > 100) {
        log(`[CJ Image] Already cached: ${localPath}`);
        return resolve(localPath);
      }
      // File exists but too small, remove it
      fs.unlinkSync(fullPath);
    }
    
    log(`[CJ Image] Downloading: ${normalizedUrl.substring(0, 80)}...`);
    
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
        'Connection': 'keep-alive',
        'Referer': 'https://cjdropshipping.com/'
      }
    };
    
    const req = protocol.get(options, (res) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, normalizedUrl).href;
        log(`[CJ Image] Redirect ${res.statusCode} -> ${redirectUrl.substring(0, 80)}...`);
        return downloadImage(redirectUrl, localPath, redirectCount + 1).then(resolve).catch(reject);
      }
      
      // Handle 403/401 - might need proxy fallback
      if (res.statusCode === 403 || res.statusCode === 401) {
        log(`[CJ Image] Access denied (${res.statusCode}) for ${normalizedUrl.substring(0, 80)}`);
        return reject(new Error(`Access denied (HTTP ${res.statusCode}) - may need proxy`));
      }
      
      // Handle other errors
      if (res.statusCode !== 200) {
        log(`[CJ Image] HTTP ${res.statusCode} for ${normalizedUrl.substring(0, 80)}`);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      // Check content type
      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('image') && !contentType.includes('octet-stream')) {
        log(`[CJ Image] Unexpected content-type: ${contentType}`);
      }
      
      const file = fs.createWriteStream(fullPath);
      res.pipe(file);
      
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(fullPath);
        if (stats.size < 100) {
          fs.unlinkSync(fullPath);
          log(`[CJ Image] Downloaded file too small (${stats.size} bytes), rejected`);
          return reject(new Error('Downloaded file too small'));
        }
        log(`[CJ Image] Downloaded successfully: ${localPath} (${stats.size} bytes)`);
        resolve(localPath);
      });
      
      file.on('error', (err) => {
        fs.unlink(fullPath, () => {});
        log(`[CJ Image] File write error: ${err.message}`);
        reject(err);
      });
    });
    
    req.on('error', (err) => {
      log(`[CJ Image] Request error: ${err.message}`);
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      log(`[CJ Image] Timeout for ${normalizedUrl.substring(0, 80)}`);
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Download image with fallback to proxy if direct download fails
 */
async function downloadImageWithFallback(url, localPath, proxyBaseUrl = null) {
  // Normalize URL first
  const normalizedUrl = normalizeImageUrl(url);
  if (!normalizedUrl) {
    throw new Error(`Invalid URL: ${url}`);
  }
  
  try {
    return await downloadImage(normalizedUrl, localPath);
  } catch (directError) {
    log(`[CJ Image] Direct download failed: ${directError.message}`);
    
    // Try proxy fallback for 403/401/timeout errors
    const shouldTryProxy = directError.message.includes('403') || 
                          directError.message.includes('401') ||
                          directError.message.includes('Access denied') ||
                          directError.message.includes('timeout') ||
                          directError.message.includes('Timeout');
    
    if (shouldTryProxy) {
      // Use localhost proxy if no proxyBaseUrl provided (same server)
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(normalizedUrl)}`;
      log(`[CJ Image] Trying local proxy fallback for: ${normalizedUrl.substring(0, 60)}...`);
      
      // Download via internal fetch to the proxy endpoint
      try {
        const http = require('http');
        return await new Promise((resolve, reject) => {
          const fullPath = path.join(CACHE_DIR, localPath);
          ensureDir(CACHE_DIR);
          
          // Make request to local proxy
          const req = http.get(`http://localhost:5000${proxyUrl}`, { timeout: 20000 }, (res) => {
            if (res.statusCode !== 200) {
              return reject(new Error(`Proxy returned HTTP ${res.statusCode}`));
            }
            
            const file = fs.createWriteStream(fullPath);
            res.pipe(file);
            
            file.on('finish', () => {
              file.close();
              const stats = fs.statSync(fullPath);
              if (stats.size < 100) {
                fs.unlinkSync(fullPath);
                return reject(new Error('Proxy downloaded file too small'));
              }
              log(`[CJ Image] Proxy download successful: ${localPath} (${stats.size} bytes)`);
              resolve(localPath);
            });
            
            file.on('error', (err) => {
              fs.unlink(fullPath, () => {});
              reject(err);
            });
          });
          
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Proxy timeout'));
          });
        });
      } catch (proxyError) {
        log(`[CJ Image] Proxy fallback also failed: ${proxyError.message}`);
        throw new Error(`Image download failed (direct: ${directError.message}, proxy: ${proxyError.message})`);
      }
    }
    
    throw directError;
  }
}

/**
 * Detect pet type from product info
 */
function detectPetType(product) {
  const text = `${product.productNameEn || ''} ${product.categoryName || ''} ${product.description || ''}`.toLowerCase();
  
  const dogKeywords = ['dog', 'puppy', 'canine', 'pup ', 'doggy', 'pooch'];
  const catKeywords = ['cat', 'kitten', 'feline', 'kitty', 'meow'];
  
  const hasDog = dogKeywords.some(k => text.includes(k));
  const hasCat = catKeywords.some(k => text.includes(k));
  
  if (hasDog && hasCat) return 'BOTH';
  if (hasDog) return 'DOG';
  if (hasCat) return 'CAT';
  return 'UNKNOWN';
}

/**
 * Detect subcategory
 */
function detectSubcategory(product) {
  const text = `${product.productNameEn || ''} ${product.categoryName || ''} ${product.description || ''}`.toLowerCase();
  
  const subcatMap = {
    DOG_CHEW: ['chew', 'treat', 'dental', 'bone', 'bully', 'rawhide'],
    DOG_FETCH: ['ball', 'fetch', 'frisbee', 'throw', 'launcher'],
    DOG_TUG: ['tug', 'rope', 'pull toy'],
    DOG_TRAINING: ['training', 'clicker', 'treat pouch'],
    DOG_WALK: ['leash', 'harness', 'collar', 'walk', 'lead'],
    DOG_BEDS: ['bed', 'mat', 'cushion', 'crate', 'blanket'],
    CAT_PLAY: ['toy', 'feather', 'mouse', 'teaser', 'interactive', 'laser'],
    CAT_SCRATCH: ['scratch', 'post', 'scratcher', 'cardboard'],
    CAT_LITTER: ['litter', 'box', 'scoop', 'pan'],
    CAT_BEDS: ['bed', 'hammock', 'cave', 'perch', 'tree'],
    CAT_GROOM: ['brush', 'groom', 'comb', 'nail', 'deshed']
  };
  
  for (const [subcat, keywords] of Object.entries(subcatMap)) {
    if (keywords.some(k => text.includes(k))) {
      return subcat;
    }
  }
  
  const petType = detectPetType(product);
  if (petType === 'DOG') return 'DOG_OTHER';
  if (petType === 'CAT') return 'CAT_OTHER';
  return null;
}

/**
 * Check if product is pet-related
 */
function isPetRelated(product) {
  const petType = detectPetType(product);
  if (petType !== 'UNKNOWN') return true;
  
  const text = `${product.productNameEn || ''} ${product.categoryName || ''}`.toLowerCase();
  const petKeywords = ['pet', 'animal', 'paw', 'fur', 'grooming', 'bowl', 'feeder', 'collar', 'leash', 'toy'];
  
  return petKeywords.some(k => text.includes(k));
}

/**
 * Detect warehouse availability
 */
function detectWarehouse(product) {
  const warehouses = [];
  
  if (product.variants && product.variants.length > 0) {
    for (const v of product.variants) {
      if (v.createFrom && !warehouses.includes(v.createFrom)) {
        warehouses.push(v.createFrom);
      }
    }
  }
  
  if (warehouses.length === 0) {
    if (product.createFrom) warehouses.push(product.createFrom);
    else warehouses.push('CN');
  }
  
  const hasUS = warehouses.some(w => w === 'US' || w === 'USA');
  
  return {
    list: warehouses,
    hasUS,
    primary: hasUS ? 'US' : warehouses[0] || 'CN'
  };
}

/**
 * Preview import - returns product info without saving
 */
async function previewImport(input) {
  const parseResult = parseCJInput(input);
  
  if (!parseResult.ok) {
    logImportAction({ action: 'preview_parse_failed', input, error: parseResult.error });
    return { ok: false, error: parseResult.error, inputType: parseResult.inputType };
  }

  try {
    const { product: cjProduct, usedEndpoint } = await fetchProduct(parseResult.id, parseResult.queryMethod);
    
    const pid = cjProduct.pid || cjProduct.productId;
    const name = cjProduct.productNameEn || cjProduct.productName || 'Unknown Product';
    
    // Use pickValidProductImages for image validation in preview
    const validatedImages = await pickValidProductImages(cjProduct);
    const imageData = collectAllImages(cjProduct);
    
    // Use validated main image if available, otherwise fallback
    const mainImage = validatedImages.mainUrl || imageData.mainImage || '';
    const galleryImages = [mainImage, ...validatedImages.galleryUrls, ...imageData.galleryImages].filter(Boolean);
    const uniqueGallery = [...new Set(galleryImages)].slice(0, 5);
    
    log(`[CJ Preview] Images validated - main: ${mainImage ? 'YES' : 'NO'}, gallery: ${uniqueGallery.length}, validCount: ${validatedImages.validationResults.validCount}, invalidCount: ${validatedImages.validationResults.invalidCount}`);
    
    // Get variant info
    const variants = cjProduct.variants || [];
    let lowestPrice = parseFloat(cjProduct.sellPrice) || parseFloat(cjProduct.productPrice) || 0;
    
    for (const v of variants) {
      const vPrice = parseFloat(v.variantSellPrice) || parseFloat(v.variantPrice) || 0;
      if (vPrice > 0 && vPrice < lowestPrice) lowestPrice = vPrice;
    }
    
    const warehouse = detectWarehouse(cjProduct);
    const petType = detectPetType(cjProduct);
    const subcatKey = detectSubcategory(cjProduct);
    const petRelated = isPetRelated(cjProduct);
    
    // Pet eligibility check
    const eligibility = petEligibility.evaluateEligibility({
      title: name,
      description: cjProduct.productDescEn || cjProduct.description || '',
      categoryName: cjProduct.categoryName,
      variants: variants,
      productImageSet: uniqueGallery
    });
    
    // Determine image status for preview
    let imageStatus = 'ok';
    if (!mainImage) {
      imageStatus = 'missing';
    } else if (!validatedImages.mainUrl && imageData.mainImage) {
      imageStatus = 'unvalidated';
    } else if (validatedImages.validationResults.invalidCount > 0) {
      imageStatus = 'partial';
    }
    
    const previewData = {
      ok: true,
      inputType: parseResult.inputType,
      displayType: parseResult.displayType || parseResult.inputType,
      usedEndpoint,
      cjPid: pid,
      cjSpu: cjProduct.productSku || pid,
      product: {
        title: name,
        description: (cjProduct.productDescEn || cjProduct.description || '').substring(0, 300),
        mainImage,
        galleryImages: uniqueGallery.slice(0, 4),
        costPrice: lowestPrice,
        variantCount: variants.length || 1,
        categoryName: cjProduct.categoryName || 'Uncategorized'
      },
      detection: {
        petType,
        subcatKey,
        isPetRelated: petRelated
      },
      eligibility: {
        ok: eligibility.ok,
        score: eligibility.score,
        reasons: eligibility.reasons,
        denyReason: eligibility.denyReason,
        scopes: eligibility.scopes
      },
      warehouse,
      hasValidImage: !!validatedImages.mainUrl,
      imageStatus,
      imageValidation: {
        mainCandidates: validatedImages.validationResults.mainCandidates,
        galleryCandidates: validatedImages.validationResults.galleryCandidates,
        validCount: validatedImages.validationResults.validCount,
        invalidCount: validatedImages.validationResults.invalidCount
      },
      imageData: {
        rawFields: imageData.rawFields,
        variantImages: imageData.variantImages
      },
      raw: cjProduct
    };
    
    logImportAction({ action: 'preview_success', input, pid, petType, subcatKey, eligibilityOk: eligibility.ok, hasImage: !!mainImage });
    
    return previewData;
  } catch (err) {
    logImportAction({ action: 'preview_failed', input, error: err.message });
    return { ok: false, error: err.message, inputType: parseResult.inputType, inputId: parseResult.id };
  }
}

/**
 * Convert CJ product to internal format with smart pricing
 * NEVER fails due to image errors - sets image_status field instead
 */
async function convertToProduct(cjProduct, options = {}) {
  const pid = cjProduct.pid || cjProduct.productId;
  const spu = cjProduct.productSku || pid;
  const name = cjProduct.productNameEn || cjProduct.productName || 'Unknown Product';
  
  // Use pickValidProductImages for robust image validation before download
  log(`[CJ Import] Converting product ${pid}: Starting image validation...`);
  const validatedImages = await pickValidProductImages(cjProduct);
  const imageData = collectAllImages(cjProduct);
  
  // Use validated main image URL (falls back to raw if validation fails)
  const mainImageUrl = validatedImages.mainUrl || imageData.mainImage;
  
  log(`[CJ Import] Product ${pid}: validated main=${!!validatedImages.mainUrl}, fallback=${!!imageData.mainImage}, gallery=${validatedImages.galleryUrls.length}`);
  
  // Track image status for admin visibility
  let imageStatus = 'ok';
  let imageWarnings = [];
  
  if (!mainImageUrl) {
    imageStatus = 'missing';
    imageWarnings.push('No valid main image URL found in CJ API response');
    log(`[CJ Import] WARNING: No main image found for ${pid}. Raw fields: ${JSON.stringify(imageData.rawFields)}`);
  } else if (!validatedImages.mainUrl && imageData.mainImage) {
    imageStatus = 'unvalidated';
    imageWarnings.push('Main image URL could not be validated (will attempt download)');
  }

  // Download main image - NEVER fail import, just log warning
  let mainLocalPath = '';
  if (mainImageUrl) {
    const ext = getImageExtension(mainImageUrl);
    const filename = `cj_${sanitize(pid)}_main_${hashUrl(mainImageUrl)}${ext}`;
    try {
      await downloadImageWithFallback(mainImageUrl, filename, options.proxyBaseUrl);
      mainLocalPath = `/cache/images/${filename}`;
      log(`[CJ Import] Main image downloaded: ${mainLocalPath}`);
    } catch (err) {
      log(`[CJ Import] WARNING: Main image download failed: ${err.message} (URL: ${mainImageUrl})`);
      imageStatus = 'download_failed';
      imageWarnings.push(`Main image download failed: ${err.message}`);
    }
  }
  
  // Download gallery images - prioritize validated URLs, fallback to raw if none
  // Store up to 15 gallery images for full product carousel
  const MAX_GALLERY_IMAGES = 15;
  const images = mainLocalPath ? [mainLocalPath] : [];
  const galleryToDownload = validatedImages.galleryUrls.length > 0 
    ? validatedImages.galleryUrls 
    : imageData.galleryImages.filter(url => url !== mainImageUrl);
  
  log(`[CJ Import] Product ${pid}: Downloading up to ${MAX_GALLERY_IMAGES} gallery images from ${galleryToDownload.length} available`);
  
  for (let i = 0; i < Math.min(MAX_GALLERY_IMAGES, galleryToDownload.length); i++) {
    const imgUrl = galleryToDownload[i];
    if (imgUrl) {
      const ext = getImageExtension(imgUrl);
      const filename = `cj_${sanitize(pid)}_${i}_${hashUrl(imgUrl)}${ext}`;
      try {
        await downloadImageWithFallback(imgUrl, filename, options.proxyBaseUrl);
        images.push(`/cache/images/${filename}`);
      } catch (e) {
        log(`[CJ Import] Gallery image ${i} failed: ${e.message}`);
        if (imageStatus === 'ok') {
          imageStatus = 'partial';
          imageWarnings.push(`Gallery image ${i} download failed`);
        }
      }
    }
  }
  
  // Process variants with pricing
  const variants = [];
  const cjVariants = cjProduct.variants || [];
  
  // Import smart pricing if available
  let computeSalePrice;
  try {
    const pricing = require('./smartPricing');
    computeSalePrice = pricing.computeSalePrice;
  } catch (e) {
    computeSalePrice = null;
  }
  
  const warehouse = detectWarehouse(cjProduct);
  const petType = detectPetType(cjProduct);
  const subcatKey = detectSubcategory(cjProduct);
  
  // Use categoryClassifier to get proper subcategorySlug for routing
  const categoryClassification = classifyProductCategory({ 
    title: name, 
    description: cjProduct.productDescEn || cjProduct.description || '' 
  });
  const subcategorySlug = categoryClassification.subcategory || 'accessories';
  const mainCategorySlug = categoryClassification.category || (petType === 'cat' ? 'cats' : 'dogs');
  
  if (cjVariants.length > 0) {
    for (const v of cjVariants) {
      const vid = v.vid;
      const variantSku = v.variantSku;
      const variantId = v.variantId;
      // Use imageData.variantImages with flexible lookup (try all keys)
      const vImageUrl = imageData.variantImages[vid] || 
                        imageData.variantImages[variantSku] || 
                        imageData.variantImages[variantId] ||
                        normalizeImageUrl(v.variantImage) || 
                        mainImageUrl;
      let vLocalPath = mainLocalPath;
      
      if (vImageUrl && vImageUrl !== mainImageUrl) {
        const vExt = getImageExtension(vImageUrl);
        const vFilename = `cj_${sanitize(v.variantSku || v.vid || pid)}_${hashUrl(vImageUrl)}${vExt}`;
        try {
          await downloadImageWithFallback(vImageUrl, vFilename, options.proxyBaseUrl);
          vLocalPath = `/cache/images/${vFilename}`;
          log(`[CJ Import] Variant image downloaded: ${vLocalPath}`);
        } catch (e) {
          log(`[CJ Import] Variant ${vid} image failed: ${e.message}`);
        }
      }
      
      const costPrice = parseFloat(v.variantSellPrice) || parseFloat(v.variantPrice) || parseFloat(cjProduct.sellPrice) || 0;
      let salePrice = costPrice;
      
      if (computeSalePrice && costPrice > 0) {
        salePrice = computeSalePrice({
          costPrice,
          shippingCost: null,
          subcatKey,
          petType,
          warehouseUS: warehouse.hasUS
        });
      } else {
        salePrice = Math.floor(costPrice * 2.2) + 0.99;
        if (salePrice < 9.99) salePrice = 9.99;
      }
      
      // Parse variant options
      const variantOptions = {};
      if (v.variantProperty) variantOptions.Property = v.variantProperty;
      if (v.variantName) variantOptions.Name = v.variantName;
      if (v.variantKey) {
        try {
          const attrs = JSON.parse(v.variantKey);
          Object.assign(variantOptions, attrs);
        } catch (e) {}
      }
      
      variants.push({
        sku: v.variantSku || v.vid || `${pid}-${variants.length}`,
        cjVid: v.vid,
        costPrice: parseFloat(costPrice.toFixed(2)),
        salePrice: parseFloat(salePrice.toFixed(2)),
        price: parseFloat(salePrice.toFixed(2)),
        priceSource: 'auto',
        options: Object.keys(variantOptions).length > 0 ? variantOptions : { Type: 'Default' },
        image: vLocalPath || mainLocalPath,
        warehouse: v.createFrom || warehouse.primary
      });
    }
  }
  
  // Default variant if none
  if (variants.length === 0) {
    const costPrice = parseFloat(cjProduct.sellPrice) || parseFloat(cjProduct.productPrice) || 0;
    let salePrice = costPrice;
    
    if (computeSalePrice && costPrice > 0) {
      salePrice = computeSalePrice({ costPrice, shippingCost: null, subcatKey, petType, warehouseUS: warehouse.hasUS });
    } else {
      salePrice = Math.floor(costPrice * 2.2) + 0.99;
      if (salePrice < 9.99) salePrice = 9.99;
    }
    
    variants.push({
      sku: `${pid}-STD`,
      costPrice: parseFloat(costPrice.toFixed(2)),
      salePrice: parseFloat(salePrice.toFixed(2)),
      price: parseFloat(salePrice.toFixed(2)),
      priceSource: 'auto',
      options: { Type: 'Standard' },
      image: mainLocalPath,
      warehouse: warehouse.primary
    });
  }
  
  // Calculate price range
  const prices = variants.map(v => v.salePrice).filter(p => p > 0);
  const priceFrom = prices.length > 0 ? Math.min(...prices) : 19.99;
  const priceTo = prices.length > 0 ? Math.max(...prices) : priceFrom;
  
  // Log final image status
  if (imageStatus !== 'ok') {
    log(`[CJ Import] Product ${pid} imported with image issues: status=${imageStatus}, warnings=${imageWarnings.join('; ')}`);
  }
  
  return {
    id: pid,
    cjPid: pid,
    cjSpu: spu,
    title: name,
    description: cjProduct.productDescEn || cjProduct.description || `Premium quality ${name}`,
    price: priceFrom,
    priceFrom,
    priceTo,
    image: mainLocalPath || '/placeholder-product.jpg',
    images: images.filter(Boolean),
    variants,
    source: 'CJ-API',
    category: cjProduct.categoryName || 'Pet Supplies',
    mainCategorySlug: mainCategorySlug,
    subcategorySlug: subcategorySlug,
    petType,
    subcatKey,
    warehouse: warehouse.primary,
    warehouseList: warehouse.list,
    active: true,
    pricingProfile: 'default',
    pricingUpdatedAt: new Date().toISOString(),
    importedAt: new Date().toISOString(),
    imageStatus,
    imageWarnings: imageWarnings.length > 0 ? imageWarnings : undefined
  };
}

/**
 * Full import - saves to database
 */
async function importProduct(input, db, options = {}) {
  const parseResult = parseCJInput(input);
  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error };
  }

  try {
    const { product: cjProduct } = await fetchProduct(parseResult.id, parseResult.queryMethod);
    const product = await convertToProduct(cjProduct, options);
    
    // Check if already exists
    const existing = db.getProduct ? await db.getProduct(product.id) : null;
    if (existing && !options.overwrite) {
      return { ok: false, error: 'Product already exists', spu: product.id, existing };
    }
    
    // STRICT pet eligibility filter with pet_usage_type classification
    const strictCheck = petEligibility.strictPetEligibility({
      title: product.title,
      description: product.description,
      categoryName: cjProduct.categoryName,
      variants: product.variants,
      productImageSet: cjProduct.productImageSet
    });
    
    product.petUsageType = strictCheck.petUsageType;
    product.petUsageConfidence = strictCheck.confidence;
    product.petUsageReasons = strictCheck.reasons;
    
    // ONLY allow ANIMAL_USED products
    if (!strictCheck.eligible) {
      logImportAction({ 
        action: 'import_rejected_strict', 
        input, 
        petUsageType: strictCheck.petUsageType,
        confidence: strictCheck.confidence,
        reasons: strictCheck.reasons.slice(0, 3)
      });
      return { 
        ok: false, 
        error: `Rejected: Product is ${strictCheck.petUsageType} (not ANIMAL_USED)`, 
        spu: product.id, 
        petUsageType: strictCheck.petUsageType,
        reasons: strictCheck.reasons
      };
    }
    
    // Legacy eligibility score (for backward compatibility)
    const eligibility = petEligibility.evaluateEligibility({
      title: product.title,
      description: product.description,
      categoryName: cjProduct.categoryName,
      variants: product.variants,
      productImageSet: cjProduct.productImageSet
    }, { feedScopes: options.feedScopes || ['any_pet'] });
    
    product.eligibilityScore = eligibility.score;
    product.eligibilityScopes = eligibility.scopes;
    
    // Apply featured settings
    if (options.markFeatured) {
      product.featured = true;
      product.featuredRank = options.featuredRank || null;
    }
    
    if (options.categoryPin) {
      if (options.categoryPin === 'DOG' || (options.categoryPin === 'AUTO' && product.petType === 'DOG')) {
        product.featuredDogRank = options.categoryPinRank || null;
      } else if (options.categoryPin === 'CAT' || (options.categoryPin === 'AUTO' && product.petType === 'CAT')) {
        product.featuredCatRank = options.categoryPinRank || null;
      }
    }
    
    if (options.subcatPin && options.subcatPin !== 'NONE') {
      const pinSubcat = options.subcatPin === 'AUTO' ? product.subcatKey : options.subcatPin;
      if (pinSubcat) {
        product.subcatKey = pinSubcat;
        product.subcatRank = options.subcatRank || null;
      }
    }

    // Save to database
    if (db.upsertProduct) {
      await db.upsertProduct(product);
    }
    
    log(`[CJ Import] Successfully imported: ${product.title} (${product.id})`);
    logImportAction({
      action: 'import_success',
      input,
      productId: product.id,
      title: product.title,
      petType: product.petType,
      subcatKey: product.subcatKey,
      variantCount: product.variants.length,
      featured: product.featured || false
    });
    
    return {
      ok: true,
      spu: product.cjSpu,
      cjPid: product.cjPid,
      cjSpu: product.cjSpu,
      product,
      variantCount: product.variants.length,
      featured: product.featured || false,
      featuredRank: product.featuredRank || null,
      dogRank: product.featuredDogRank || null,
      catRank: product.featuredCatRank || null,
      subcatKey: product.subcatKey || null,
      subcatRank: product.subcatRank || null,
      rejected: false,
      detection: {
        petType: product.petType,
        subcatKey: product.subcatKey
      },
      imageStatus: product.imageStatus || 'ok',
      imageWarnings: product.imageWarnings || []
    };
  } catch (err) {
    log(`[CJ Import] Import failed: ${err.message}`);
    logImportAction({ action: 'import_failed', input, error: err.message });
    return { ok: false, error: err.message, inputId: parseResult.id };
  }
}

/**
 * Bulk import from array of URLs/SPUs
 */
async function bulkImport(inputs, db, options = {}) {
  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  for (const input of inputs) {
    try {
      const result = await importProduct(input, db, options);
      if (result.ok) {
        results.success.push(result);
      } else if (result.existing) {
        results.skipped.push({ input, reason: 'Already exists' });
      } else {
        results.failed.push({ input, error: result.error });
      }
    } catch (err) {
      results.failed.push({ input, error: err.message });
    }
  }

  return results;
}

/**
 * Get import logs
 */
function getImportLogs(limit = 50) {
  try {
    if (fs.existsSync(IMPORT_LOG)) {
      const logs = JSON.parse(fs.readFileSync(IMPORT_LOG, 'utf8'));
      return logs.slice(-limit).reverse();
    }
  } catch (e) {}
  return [];
}

module.exports = {
  parseCJInput,
  fetchProduct,
  previewImport,
  importProduct,
  bulkImport,
  getAccessToken,
  detectPetType,
  detectSubcategory,
  isPetRelated,
  isUSWarehouse,
  normalizeWarehouseFilter,
  getImportLogs,
  searchCatalog,
  searchProductByName
};
