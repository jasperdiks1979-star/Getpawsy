#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const CSV_PATH = 'attached_assets/CJ-Product-light-SPU-list_1765542506850.csv';
const DB_PATH = 'data/db.json';
const CACHE_DIR = 'public/cache/images';
const PROGRESS_FILE = 'data/scrape_progress.json';
const TIMEOUT = 20000;
const DELAY_MS = 1500;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
}

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
}

function parseCSV() {
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const products = new Map();
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].match(/(".*?"|[^,]+)/g);
    if (!parts || parts.length < 3) continue;
    
    const spu = parts[0].replace(/"/g, '').trim();
    const name = parts[1].replace(/"/g, '').trim();
    const link = parts[2].replace(/"/g, '').trim();
    
    if (!spu || !link || !link.includes('cjdropshipping.com')) continue;
    
    if (!products.has(spu)) {
      products.set(spu, { spu, name, link });
    }
  }
  
  log(`Parsed ${products.size} unique products from CSV`);
  return Array.from(products.values());
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const opts = {
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    };
    
    const req = protocol.get(url, opts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function extractImageFromHtml(html) {
  const patterns = [
    /<meta\s+property="og:image"\s+content="([^"]+)"/i,
    /<meta\s+content="([^"]+)"\s+property="og:image"/i,
    /class="[^"]*product[^"]*image[^"]*"[^>]*src="([^"]+\.(?:jpg|jpeg|png|webp))"/i,
    /src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*class="[^"]*main/i,
    /data-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i,
    /<img[^>]+src="(https:\/\/cbu01\.alicdn\.com[^"]+)"/i,
    /<img[^>]+src="(https:\/\/[^"]+cjdropshipping[^"]+\.(?:jpg|jpeg|png|webp))"/i,
    /background-image:\s*url\(['"]?(https:\/\/[^'"]+\.(?:jpg|jpeg|png|webp))['"]?\)/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      let url = match[1];
      if (url.startsWith('//')) url = 'https:' + url;
      if (url.includes('cjdropshipping') || url.includes('alicdn') || url.includes('cbu01')) {
        return url;
      }
    }
  }
  
  const imgMatches = html.match(/<img[^>]+src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi) || [];
  for (const imgTag of imgMatches.slice(0, 10)) {
    const srcMatch = imgTag.match(/src="([^"]+)"/);
    if (srcMatch && srcMatch[1]) {
      const src = srcMatch[1];
      if (!src.includes('logo') && !src.includes('icon') && !src.includes('avatar') && 
          !src.includes('banner') && !src.includes('sprite') && src.length > 30) {
        return src.startsWith('//') ? 'https:' + src : src;
      }
    }
  }
  
  return null;
}

function downloadImage(url, localPath) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(CACHE_DIR, localPath);
    
    if (fs.existsSync(fullPath)) {
      return resolve(localPath);
    }
    
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: TIMEOUT }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 && res.headers.location) {
        return downloadImage(res.headers.location, localPath).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      const file = fs.createWriteStream(fullPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
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
      reject(new Error('Timeout'));
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completed: {}, failed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function scrapeProduct(product, progress) {
  const { spu, name, link } = product;
  
  if (progress.completed[spu]) {
    return { spu, image: progress.completed[spu], cached: true };
  }
  
  try {
    log(`Fetching: ${spu} - ${name.substring(0, 40)}...`);
    const html = await fetchPage(link);
    
    const imageUrl = extractImageFromHtml(html);
    if (!imageUrl) {
      log(`  No image found for ${spu}`);
      progress.failed.push({ spu, reason: 'no_image' });
      saveProgress(progress);
      return null;
    }
    
    const ext = path.extname(imageUrl.split('?')[0]) || '.jpg';
    const filename = `cj_scraped_${sanitize(spu)}_${hashUrl(imageUrl)}${ext}`;
    
    log(`  Downloading: ${imageUrl.substring(0, 60)}...`);
    await downloadImage(imageUrl, filename);
    
    const localPath = `/cache/images/${filename}`;
    progress.completed[spu] = localPath;
    saveProgress(progress);
    
    log(`  Saved: ${filename}`);
    return { spu, name, image: localPath };
    
  } catch (err) {
    log(`  Error ${spu}: ${err.message}`);
    progress.failed.push({ spu, reason: err.message });
    saveProgress(progress);
    return null;
  }
}

async function updateDatabase(scrapedProducts) {
  let dbData = { products: [], orders: [], carts: {} };
  if (fs.existsSync(DB_PATH)) {
    dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  }
  
  const spuToImage = new Map();
  scrapedProducts.forEach(p => {
    if (p && p.image) spuToImage.set(p.spu, p.image);
  });
  
  let updated = 0;
  dbData.products = dbData.products.map(product => {
    const spu = product.spu || product.id;
    if (spuToImage.has(spu)) {
      product.image = spuToImage.get(spu);
      if (product.variants) {
        product.variants = product.variants.map(v => ({
          ...v,
          image: spuToImage.get(spu)
        }));
      }
      updated++;
    }
    return product;
  });
  
  fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));
  log(`Updated ${updated} products in database`);
}

async function main() {
  ensureDir(CACHE_DIR);
  ensureDir('data');
  
  const products = parseCSV();
  const progress = loadProgress();
  
  const alreadyDone = Object.keys(progress.completed).length;
  log(`Progress: ${alreadyDone}/${products.length} already scraped`);
  
  const results = [];
  let count = 0;
  
  for (const product of products) {
    count++;
    
    if (progress.completed[product.spu]) {
      results.push({ spu: product.spu, name: product.name, image: progress.completed[product.spu] });
      continue;
    }
    
    const result = await scrapeProduct(product, progress);
    if (result) results.push(result);
    
    if (count % 10 === 0) {
      log(`Progress: ${count}/${products.length}`);
    }
    
    await sleep(DELAY_MS);
  }
  
  log(`\nScraping complete!`);
  log(`Success: ${results.filter(r => r && r.image).length}`);
  log(`Failed: ${progress.failed.length}`);
  
  await updateDatabase(results);
  
  log('\nDone! Restart the server to see updated images.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
