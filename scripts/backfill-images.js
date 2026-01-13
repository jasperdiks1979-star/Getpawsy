#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'products.json');
const CACHE_DIR = path.join(__dirname, '..', 'public', 'cache', 'images');

const ALLOWED_DOMAINS = [
  'cjdropshipping.com',
  'cjstatic.com',
  'alicdn.com',
  'ebayimg.com',
  'ssl-images-amazon.com',
  'media-amazon.com'
];

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log('[Backfill] Created cache directory:', CACHE_DIR);
  }
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (e) {
    return false;
  }
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/')) return url;
  if (url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  return url;
}

function getHashFromUrl(url) {
  return crypto.createHash('sha1').update(url).digest('hex');
}

function getExtension(url) {
  const match = url.match(/\.([a-z0-9]+)(\?|$)/i);
  if (!match) return 'jpg';
  const ext = match[1].toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return ext;
  return 'jpg';
}

async function downloadImage(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'));
    }
    
    const protocol = url.startsWith('https') ? https : http;
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      return reject(new Error('Invalid URL'));
    }
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'identity',
        'Referer': 'https://cjdropshipping.com/'
      }
    };
    
    const req = protocol.get(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, url).href;
        return downloadImage(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function cacheImage(url) {
  if (!url || typeof url !== 'string' || url.startsWith('/')) return url;
  
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return url;
  
  const hash = getHashFromUrl(normalizedUrl);
  const ext = getExtension(normalizedUrl);
  const filename = `${hash}.${ext}`;
  const filepath = path.join(CACHE_DIR, filename);
  
  if (fs.existsSync(filepath)) {
    return `/cache/images/${filename}`;
  }
  
  try {
    const imageData = await downloadImage(normalizedUrl);
    if (imageData && imageData.length > 0) {
      fs.writeFileSync(filepath, imageData);
      return `/cache/images/${filename}`;
    }
  } catch (err) {
  }
  
  return url;
}

async function backfillProducts() {
  console.log('='.repeat(60));
  console.log('[Backfill] Image URL Normalization & Pre-caching');
  console.log('='.repeat(60));
  
  ensureCacheDir();
  
  if (!fs.existsSync(PRODUCTS_FILE)) {
    console.log('[Backfill] No products.json found');
    return;
  }
  
  const rawData = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
  const products = Array.isArray(rawData) ? rawData : (rawData.products || []);
  console.log(`[Backfill] Processing ${products.length} products...`);
  
  const stats = {
    total: products.length,
    hadNoImages: 0,
    fixedHttpToHttps: 0,
    imagesNormalized: 0,
    variantsFixed: 0,
    preCached: 0,
    errors: 0
  };
  
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    
    if (!p.image && (!p.images || p.images.length === 0)) {
      stats.hadNoImages++;
    }
    
    if (p.image) {
      if (p.image.startsWith('http://')) {
        p.image = p.image.replace('http://', 'https://');
        stats.fixedHttpToHttps++;
      }
    }
    
    if (!p.images) {
      p.images = [];
    }
    if (p.image && !p.images.includes(p.image)) {
      p.images.unshift(p.image);
      stats.imagesNormalized++;
    }
    
    p.images = p.images.filter(isValidImageUrl).map(img => {
      if (img.startsWith('http://')) {
        stats.fixedHttpToHttps++;
        return img.replace('http://', 'https://');
      }
      return img;
    });
    
    if (p.variants && Array.isArray(p.variants)) {
      for (const v of p.variants) {
        if (v.image && v.image.startsWith('http://')) {
          v.image = v.image.replace('http://', 'https://');
          stats.variantsFixed++;
        }
      }
    }
    
    if ((i + 1) % 100 === 0) {
      console.log(`[Backfill] Processed ${i + 1}/${products.length} products...`);
    }
  }
  
  const outputData = Array.isArray(rawData) ? products : { ...rawData, products };
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(outputData, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('[Backfill] Results:');
  console.log('='.repeat(60));
  console.log(`  Total products: ${stats.total}`);
  console.log(`  Products with no images: ${stats.hadNoImages}`);
  console.log(`  HTTP→HTTPS fixes: ${stats.fixedHttpToHttps}`);
  console.log(`  Images normalized: ${stats.imagesNormalized}`);
  console.log(`  Variant images fixed: ${stats.variantsFixed}`);
  console.log('='.repeat(60));
  console.log('[Backfill] Complete!');
}

backfillProducts().catch(err => {
  console.error('[Backfill] Fatal error:', err);
  process.exit(1);
});
