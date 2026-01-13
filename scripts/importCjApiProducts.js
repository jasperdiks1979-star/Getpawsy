#!/usr/bin/env node
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { applyPetFilter } = require('../src/petFilter');

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const DB_PATH = 'data/db.json';
const CACHE_DIR = 'public/cache/images';
const TOKEN_CACHE = 'data/cj-token.json';
const PROGRESS_FILE = 'data/cj_api_import_progress.json';

const CJ_EMAIL = process.env.CJ_EMAIL;
const CJ_API_KEY = process.env.CJ_API_KEY;

const TIMEOUT = 30000;
const DELAY_MS = 500;
const MARKUP = 2.2;

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
  return (str || '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25);
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
        log('Using cached access token');
        return cached.accessToken;
      }
    } catch (e) {}
  }

  if (!CJ_EMAIL || !CJ_API_KEY) {
    throw new Error('Missing CJ_EMAIL or CJ_API_KEY environment variables');
  }

  log('Requesting new access token...');
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
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify({
    accessToken: token,
    expiry: Date.now() + 86400000,
    created: new Date().toISOString()
  }, null, 2));

  log('Access token obtained and cached');
  return token;
}

async function fetchProductList(token, pageNum = 1, pageSize = 20) {
  const url = `${CJ_API_BASE}/product/list?pageNum=${pageNum}&pageSize=${pageSize}`;
  
  const res = await httpsRequest('GET', url, {
    'CJ-Access-Token': token
  });

  if (res.statusCode !== 200) {
    throw new Error(`Product list failed: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  if (data.code !== 200) {
    throw new Error(`API error: ${data.message || 'Unknown error'}`);
  }

  return data.data?.list || [];
}

async function fetchProductDetail(token, productId) {
  const url = `${CJ_API_BASE}/product/query?pid=${productId}`;
  
  const res = await httpsRequest('GET', url, {
    'CJ-Access-Token': token
  });

  if (res.statusCode !== 200) {
    return null;
  }

  const data = JSON.parse(res.body);
  return data.data || null;
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

function detectCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('toy') && n.includes('dog')) return 'dog-toys';
  if (n.includes('toy') && n.includes('cat')) return 'cat-toys';
  if (n.includes('toy')) return n.includes('cat') ? 'cat-toys' : 'dog-toys';
  if (n.includes('bed') || n.includes('cushion') || n.includes('mat')) return 'beds';
  if (n.includes('bowl') || n.includes('feeder') || n.includes('food')) return 'feeding';
  if (n.includes('collar') || n.includes('leash') || n.includes('harness')) return 'collars';
  if (n.includes('brush') || n.includes('groom') || n.includes('nail')) return 'grooming';
  if (n.includes('scratch') || n.includes('tree')) return 'scratchers';
  if (n.includes('carrier') || n.includes('travel') || n.includes('bag')) return 'travel';
  if (n.includes('cat') || n.includes('kitten')) return 'cat-toys';
  if (n.includes('dog') || n.includes('puppy')) return 'dog-toys';
  return 'supplies';
}

function roundPrice(cost, fallbackCost = null) {
  const primary = parseFloat(cost);
  const fallback = parseFloat(fallbackCost);
  
  let basePrice = 0;
  if (!isNaN(primary) && primary > 0) {
    basePrice = primary;
  } else if (!isNaN(fallback) && fallback > 0) {
    basePrice = fallback;
  }
  
  if (basePrice <= 0) return 19.99;
  
  const price = basePrice * MARKUP;
  if (price < 10) return 9.99;
  if (price > 500) return Math.floor(price / 10) * 10 - 0.01;
  return Math.floor(price) + 0.99;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchProductDetail(token, pid) {
  try {
    const url = `${CJ_API_BASE}/product/query?pid=${pid}`;
    const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
    if (res.statusCode !== 200) return null;
    
    const data = JSON.parse(res.body);
    if (data.code !== 200) return null;
    
    return data.data;
  } catch (e) {
    log(`  Error fetching detail for ${pid}: ${e.message}`);
    return null;
  }
}

function normalizeVariantOptions(variant, productKeyEn) {
  const options = {};
  const COLORS = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'pink', 'purple', 'orange', 'brown', 'gray', 'grey', 'beige', 'navy', 'gold', 'silver'];
  const SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', 'small', 'medium', 'large'];
  
  const isColor = (str) => COLORS.includes(str.toLowerCase());
  const isSize = (str) => SIZES.includes(str.toLowerCase()) || /^\d{1,3}$/.test(str);
  
  if (variant.variantKey && Array.isArray(variant.variantKey)) {
    const optionTypes = (productKeyEn || 'Type').replace(/[\[\]"]/g, '').split(/[,\/]+/).map(s => s.trim()).filter(Boolean);
    variant.variantKey.forEach((value, index) => {
      const optionName = optionTypes[index] || `Option${index + 1}`;
      options[optionName] = String(value);
    });
  } else if (variant.variantNameEn) {
    const parts = variant.variantNameEn.split(/[\s\/\-]+/).filter(Boolean);
    if (parts.length === 1) {
      options['Type'] = parts[0];
    } else if (parts.length === 2) {
      if (isColor(parts[0])) {
        options['Color'] = parts[0];
        options['Size'] = parts[1];
      } else if (isSize(parts[0])) {
        options['Size'] = parts[0];
        options['Color'] = parts[1];
      } else {
        options['Option1'] = parts[0];
        options['Option2'] = parts[1];
      }
    } else {
      parts.forEach((part, i) => {
        if (isColor(part)) options['Color'] = part;
        else if (isSize(part)) options['Size'] = part;
        else options[`Option${i + 1}`] = part;
      });
    }
  }
  
  if (Object.keys(options).length === 0) {
    options['Type'] = 'Standard';
  }
  
  return options;
}

async function processProduct(token, product) {
  const pid = product.pid || product.productId;
  const name = product.productNameEn || product.productName || 'Unknown Product';
  const imageUrl = product.productImage || product.bigImage || '';
  
  if (!imageUrl) {
    log(`  No image for ${pid}`);
    return null;
  }

  try {
    const detail = await fetchProductDetail(token, pid);
    const productKeyEn = detail?.productKeyEn || product.productKeyEn || null;
    const cjVariants = detail?.variants || product.variants || [];
    
    const ext = path.extname(imageUrl.split('?')[0]) || '.jpg';
    const filename = `cj_api_${sanitize(pid)}_${hashUrl(imageUrl)}${ext}`;
    
    await downloadImage(imageUrl, filename);
    const localPath = `/cache/images/${filename}`;
    
    const price = roundPrice(product.sellPrice, product.productPrice);
    
    const variants = [];
    if (cjVariants && cjVariants.length > 0) {
      for (const v of cjVariants) {
        const vImageUrl = v.variantImage || imageUrl;
        let vLocalPath = localPath;
        
        if (vImageUrl !== imageUrl) {
          const vExt = path.extname(vImageUrl.split('?')[0]) || '.jpg';
          const vFilename = `cj_api_${sanitize(v.variantSku || v.vid)}_${hashUrl(vImageUrl)}${vExt}`;
          try {
            await downloadImage(vImageUrl, vFilename);
            vLocalPath = `/cache/images/${vFilename}`;
          } catch (e) {}
        }
        
        const options = normalizeVariantOptions(v, productKeyEn);
        
        variants.push({
          sku: v.variantSku || v.vid || `${pid}-${variants.length}`,
          cj_vid: v.vid || null,
          cj_sku: v.variantSku || null,
          price: roundPrice(v.variantSellPrice, v.variantPrice || price),
          cost: parseFloat(v.variantSellPrice) || parseFloat(product.sellPrice) || 0,
          inventory: parseInt(v.variantStock) || 100,
          options,
          image: vLocalPath
        });
      }
    }
    
    if (variants.length === 0) {
      variants.push({
        sku: `${pid}-STD`,
        cj_vid: null,
        cj_sku: product.productSku || null,
        price,
        cost: parseFloat(product.sellPrice) || 0,
        inventory: 100,
        options: { Type: 'Standard' },
        image: localPath
      });
    }
    
    return {
      id: pid,
      spu: pid,
      title: name,
      description: product.productDescEn || product.description || `High-quality ${name}`,
      price,
      image: localPath,
      images: [localPath],
      variants,
      source: 'CJ-API',
      category: detectCategory(name),
      active: true
    };
    
  } catch (err) {
    log(`  Error processing ${pid}: ${err.message}`);
    return null;
  }
}

async function fetchPetProducts(token, keyword, maxPages = 10) {
  const products = [];
  const pageSize = 20;
  
  for (let page = 1; page <= maxPages; page++) {
    const url = `${CJ_API_BASE}/product/list?pageNum=${page}&pageSize=${pageSize}&productNameEn=${encodeURIComponent(keyword)}`;
    
    const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
    if (res.statusCode !== 200) break;
    
    const data = JSON.parse(res.body);
    if (data.code !== 200) break;
    
    const list = data.data?.list || [];
    if (list.length === 0) break;
    
    products.push(...list);
    log(`  ${keyword}: page ${page} - ${list.length} products`);
    
    if (list.length < pageSize) break;
    await sleep(DELAY_MS);
  }
  
  return products;
}

async function main() {
  ensureDir(CACHE_DIR);
  ensureDir('data');
  
  log('=== CJ API Pet Product Import ===');
  
  const token = await getAccessToken();
  log('Authenticated successfully');
  
  const allProducts = [];
  const petKeywords = ['dog', 'cat', 'pet', 'puppy', 'kitten'];
  
  log('Searching for pet products...');
  
  for (const keyword of petKeywords) {
    log(`Searching: "${keyword}"...`);
    const products = await fetchPetProducts(token, keyword, 5);
    allProducts.push(...products);
    await sleep(DELAY_MS);
  }
  
  // Deduplicate by PID
  const seen = new Set();
  const uniqueProducts = allProducts.filter(p => {
    const pid = p.pid || p.productId;
    if (seen.has(pid)) return false;
    seen.add(pid);
    return true;
  });
  
  log(`Total unique pet products: ${uniqueProducts.length}`);
  
  const processedProducts = [];
  let count = 0;
  
  for (const product of uniqueProducts) {
    count++;
    log(`Processing ${count}/${uniqueProducts.length}: ${(product.productNameEn || product.productName || '').substring(0, 40)}...`);
    
    const processed = await processProduct(token, product);
    if (processed) {
      processedProducts.push(processed);
    }
    
    if (count % 10 === 0) {
      await sleep(DELAY_MS);
    }
  }
  
  log(`\nSuccessfully processed: ${processedProducts.length} products`);
  
  // Apply pet filter
  const filteredProducts = [];
  const rejectedProducts = [];
  
  for (const product of processedProducts) {
    const filtered = applyPetFilter(product);
    if (filtered.rejected) {
      rejectedProducts.push(filtered);
    } else {
      filteredProducts.push(filtered);
    }
  }
  
  let dbData = { products: [], orders: [], carts: {} };
  if (fs.existsSync(DB_PATH)) {
    try {
      dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {}
  }
  
  const nonApiProducts = (dbData.products || []).filter(p => p.source !== 'CJ-API');
  dbData.products = [...nonApiProducts, ...filteredProducts, ...rejectedProducts];
  
  fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));
  
  // Save rejected products report
  const rejectedReport = rejectedProducts.map(p => ({
    id: p.id,
    spu: p.spu,
    title: p.title,
    price: p.price,
    image: p.image,
    reasons: p.rejectReasons || [],
    matchedKeywords: p.rejectMatchedKeywords || [],
  }));
  fs.writeFileSync('data/rejected-products.json', JSON.stringify(rejectedReport, null, 2));
  
  log(`\n=== Import Complete ===`);
  log(`Total products in DB: ${dbData.products.length}`);
  log(`CJ API ACCEPTED: ${filteredProducts.length}`);
  log(`CJ API REJECTED: ${rejectedProducts.length}`);
  log(`Other products: ${nonApiProducts.length}`);
  
  if (rejectedProducts.length > 0) {
    log('\n=== Top Rejected Items ===');
    rejectedProducts.slice(0, 10).forEach(p => {
      log(`  REJECT: ${p.title.substring(0, 60)}`);
      log(`    Reasons: ${(p.rejectReasons || []).join('; ')}`);
    });
  }
  
  log('\nRejected products saved to data/rejected-products.json');
  log('Restart the server to see the new products.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
