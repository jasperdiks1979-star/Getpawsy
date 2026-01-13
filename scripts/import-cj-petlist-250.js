#!/usr/bin/env node
/**
 * CJ Pet List Import Script
 * Imports 250 pet products from CJ Pet Supplies category (US warehouse only)
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const LOG_PATH = path.join(__dirname, '..', 'data', 'cj-petlist-import.json');

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const CJ_EMAIL = process.env.CJ_EMAIL;
const CJ_PASSWORD = process.env.CJ_PASSWORD;
const CJ_API_KEY = process.env.CJ_API_KEY;
const TOKEN_CACHE_PATH = path.join(__dirname, '..', 'data', 'cj-token.json');

const TARGET_COUNT = 250;
const PAGE_SIZE = 50;

const PET_KEYWORDS = [
  'dog', 'puppy', 'cat', 'kitten', 'pet', 'canine', 'feline',
  'leash', 'collar', 'harness', 'bowl', 'feeder', 'bed', 'toy',
  'grooming', 'brush', 'shampoo', 'treat', 'chew', 'litter',
  'scratching', 'scratcher', 'catnip', 'carrier', 'crate', 'kennel'
];

const DENY_KEYWORDS = [
  'jeans', 'pants', 'dress', 'shirt', 'skirt', 'lingerie', 'bikini',
  'sexy', 'adult', 'phone', 'computer', 'laptop', 'jewelry', 'ring',
  'necklace', 'earring', 'fashion', 'wig', 'makeup', 'cosmetic'
];

const CATEGORY_MAP = {
  'toys': { keywords: ['toy', 'ball', 'chew', 'squeaky', 'plush', 'fetch', 'rope', 'teaser', 'mouse', 'feather'], slug: 'toys-play' },
  'beds': { keywords: ['bed', 'cushion', 'mat', 'blanket', 'sleeping', 'hammock', 'cave'], slug: 'sleep-comfort' },
  'feeding': { keywords: ['bowl', 'feeder', 'water', 'food', 'fountain', 'slow feeder', 'dish'], slug: 'feeding' },
  'grooming': { keywords: ['brush', 'comb', 'shampoo', 'nail', 'grooming', 'bath', 'clipper'], slug: 'grooming' },
  'walking': { keywords: ['leash', 'harness', 'collar', 'lead', 'walking', 'vest'], slug: 'walking' },
  'training': { keywords: ['training', 'treat', 'clicker', 'potty', 'pad', 'pee'], slug: 'training' },
  'health': { keywords: ['supplement', 'vitamin', 'dental', 'health', 'medicine'], slug: 'health-wellness' },
  'litter': { keywords: ['litter', 'box', 'scoop', 'tray', 'toilet'], slug: 'litter' },
  'scratchers': { keywords: ['scratcher', 'scratch', 'sisal', 'post', 'cardboard'], slug: 'scratchers' },
  'travel': { keywords: ['carrier', 'crate', 'bag', 'backpack', 'travel', 'transport'], slug: 'travel' }
};

const stats = {
  imported: 0,
  skipped_non_us: 0,
  skipped_non_pet: 0,
  duplicates: 0,
  errors: 0,
  pages_scanned: 0,
  start_time: null,
  end_time: null
};

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    return { products: [] };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function loadTokenCache() {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, 'utf8'));
      if (data.expiry && data.expiry > Date.now()) {
        return data.accessToken || data.token;
      }
    }
  } catch (e) {}
  return null;
}

function saveTokenCache(token) {
  const dir = path.dirname(TOKEN_CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify({
    token,
    expiry: Date.now() + 86400000,
    saved_at: new Date().toISOString()
  }));
}

async function httpRequest(method, url, headers = {}, body = null) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 30000
    };
    const req = https.request(urlObj, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getToken() {
  const cached = loadTokenCache();
  if (cached) return cached;
  
  const password = CJ_PASSWORD || CJ_API_KEY;
  if (!CJ_EMAIL || !password) {
    throw new Error('Missing CJ_EMAIL or CJ_PASSWORD/CJ_API_KEY');
  }
  
  log(`Authenticating with CJ API (email: ${CJ_EMAIL.substring(0, 3)}...)`);
  
  const res = await httpRequest('POST', `${CJ_API_BASE}/authentication/getAccessToken`, {}, {
    email: CJ_EMAIL,
    password: password
  });
  
  if (res.statusCode === 200) {
    const data = JSON.parse(res.body);
    if (data.code === 200 && data.data?.accessToken) {
      saveTokenCache(data.data.accessToken);
      log('CJ token obtained successfully');
      return data.data.accessToken;
    }
    log(`CJ auth response: code=${data.code}, message=${data.message}`);
  }
  throw new Error(`Failed to get CJ token: HTTP ${res.statusCode}`);
}

const SEARCH_KEYWORDS = [
  'hamster cage', 'guinea pig house', 'rabbit hutch', 'bird cage', 'reptile terrarium',
  'fish tank', 'turtle dock', 'parrot toy', 'chinchilla wheel', 'gerbil tunnel',
  'small animal bedding', 'rabbit food', 'guinea pig treats', 'hamster wheel', 'bird perch'
];

let keywordIndex = 0;

async function fetchProductList(token, pageNum) {
  const keyword = SEARCH_KEYWORDS[keywordIndex % SEARCH_KEYWORDS.length];
  if (pageNum === 1 || pageNum % 3 === 0) {
    keywordIndex++;
  }
  
  const params = new URLSearchParams({
    page: pageNum.toString(),
    size: PAGE_SIZE.toString(),
    countryCode: 'US',
    keyWord: keyword,
    features: 'enable_category,enable_description'
  });
  
  const url = `${CJ_API_BASE}/product/listV2?${params}`;
  log(`Fetching: ${url} (keyword: ${keyword})`);
  const res = await httpRequest('GET', url, { 'CJ-Access-Token': token });
  
  if (res.statusCode !== 200) {
    throw new Error(`API error: ${res.statusCode}`);
  }
  
  const data = JSON.parse(res.body);
  if (data.code !== 200) {
    throw new Error(`CJ error: ${data.message}`);
  }
  
  const content = data.data?.content?.[0]?.productList || [];
  const total = data.data?.totalRecords || 0;
  
  return { list: content, total, keyword };
}

async function fetchProductDetail(token, pid) {
  const url = `${CJ_API_BASE}/product/query?pid=${pid}`;
  const res = await httpRequest('GET', url, { 'CJ-Access-Token': token });
  
  if (res.statusCode === 200) {
    const data = JSON.parse(res.body);
    if (data.code === 200 && data.data) {
      return data.data;
    }
  }
  return null;
}

function isUSWarehouse(product) {
  const warehouse = (product.createFrom || product.sourceFrom || '').toUpperCase();
  const usCodes = ['US', 'USA', 'US-CA', 'US-NJ', 'US-TX', 'USCA', 'USNJ'];
  return usCodes.some(c => warehouse.includes(c));
}

function isPetProduct(product) {
  const textParts = [
    product.nameEn || '',
    product.productNameEn || '',
    product.productName || '',
    product.categoryName || '',
    product.threeCategoryName || '',
    product.twoCategoryName || '',
    product.oneCategoryName || '',
    product.description || ''
  ];
  
  const text = textParts.join(' ').toLowerCase();
  
  if (!text || text.trim().length < 5) {
    return true;
  }
  
  for (const deny of DENY_KEYWORDS) {
    if (text.includes(deny)) return false;
  }
  
  for (const pet of PET_KEYWORDS) {
    if (text.includes(pet)) return true;
  }
  
  return text.includes('pet') || text.includes('dog') || text.includes('cat');
}

function detectPetType(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('dog') || t.includes('puppy') || t.includes('canine')) return 'dogs';
  if (t.includes('cat') || t.includes('kitten') || t.includes('feline')) return 'cats';
  if (t.includes('pet')) return 'dogs';
  return 'dogs';
}

function detectCategory(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  
  for (const [_, cfg] of Object.entries(CATEGORY_MAP)) {
    if (cfg.keywords.some(kw => text.includes(kw))) {
      return cfg.slug;
    }
  }
  return 'accessories';
}

function generateSlug(title) {
  return (title || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function transformProduct(cjProduct) {
  const title = cjProduct.nameEn || cjProduct.productNameEn || cjProduct.productName || 'Pet Product';
  const petType = detectPetType(title);
  const category = detectCategory(title, cjProduct.description || '');
  
  const images = [];
  if (cjProduct.bigImage) images.push(cjProduct.bigImage);
  if (cjProduct.productImage) images.push(cjProduct.productImage);
  if (Array.isArray(cjProduct.productImageSet)) {
    images.push(...cjProduct.productImageSet.filter(Boolean));
  }
  
  const uniqueImages = [...new Set(images)].slice(0, 8);
  const productId = cjProduct.id || cjProduct.pid;
  
  return {
    id: `cj-${productId}`,
    cjProductId: productId,
    cjSpu: cjProduct.sku || cjProduct.spu || cjProduct.productSku || null,
    title: title,
    slug: generateSlug(title),
    description: cjProduct.description || '',
    price: parseFloat(cjProduct.sellPrice || cjProduct.productPrice || 0),
    compareAtPrice: parseFloat(cjProduct.productPrice || 0) * 1.3,
    image: uniqueImages[0] || '/images/placeholder.jpg',
    images: uniqueImages,
    category: category,
    categorySlug: category,
    mainCategorySlug: petType,
    subcategorySlug: category,
    tags: ['cj', 'pet', petType, `warehouse-${(cjProduct.createFrom || 'unknown').toLowerCase()}`],
    active: true,
    inStock: true,
    warehouse: cjProduct.createFrom || 'CN',
    source: 'cj-petlist-import',
    importedAt: new Date().toISOString(),
    variants: Array.isArray(cjProduct.variants) ? cjProduct.variants.map(v => ({
      id: v.vid,
      name: v.variantNameEn || v.variantKey || 'Default',
      price: parseFloat(v.variantSellPrice || v.variantPrice || cjProduct.sellPrice || 0),
      sku: v.variantSku || null,
      inStock: true
    })) : []
  };
}

async function runImport() {
  log(`IMPORT_START {target:${TARGET_COUNT}}`);
  stats.start_time = new Date().toISOString();
  
  const db = loadDb();
  const existingIds = new Set((db.products || []).map(p => p.cjProductId || p.id));
  
  let token;
  try {
    token = await getToken();
    log('CJ token obtained');
  } catch (e) {
    log(`TOKEN_ERROR: ${e.message}`);
    stats.errors++;
    return stats;
  }
  
  let pageNum = 1;
  const newProducts = [];
  
  while (stats.imported < TARGET_COUNT && pageNum <= 50) {
    try {
      log(`Fetching page ${pageNum}...`);
      const result = await fetchProductList(token, pageNum);
      stats.pages_scanned++;
      
      const products = result.list || [];
      if (products.length === 0) {
        log(`No more products at page ${pageNum}`);
        break;
      }
      
      for (const p of products) {
        if (stats.imported >= TARGET_COUNT) break;
        
        const pid = p.id || p.pid;
        if (!pid) continue;
        
        if (existingIds.has(pid) || existingIds.has(`cj-${pid}`)) {
          stats.duplicates++;
          continue;
        }
        
        const usOnly = process.env.CJ_US_ONLY === 'true';
        if (usOnly && !isUSWarehouse(p)) {
          stats.skipped_non_us++;
          continue;
        }
        
        if (!isPetProduct(p)) {
          stats.skipped_non_pet++;
          continue;
        }
        
        try {
          const detail = await fetchProductDetail(token, pid);
          const product = transformProduct(detail || p);
          
          newProducts.push(product);
          existingIds.add(pid);
          existingIds.add(`cj-${pid}`);
          stats.imported++;
          
          if (stats.imported % 25 === 0) {
            log(`IMPORT_PROGRESS {imported:${stats.imported}, page:${pageNum}}`);
          }
        } catch (e) {
          log(`Product error ${pid}: ${e.message}`);
          stats.errors++;
        }
        
        await new Promise(r => setTimeout(r, 100));
      }
      
      pageNum++;
      await new Promise(r => setTimeout(r, 500));
      
    } catch (e) {
      log(`Page ${pageNum} error: ${e.message}`);
      stats.errors++;
      pageNum++;
    }
  }
  
  if (newProducts.length > 0) {
    db.products = [...(db.products || []), ...newProducts];
    saveDb(db);
    log(`Saved ${newProducts.length} products to database`);
  }
  
  stats.end_time = new Date().toISOString();
  
  log(`IMPORT_DONE {imported:${stats.imported}, skipped_non_us:${stats.skipped_non_us}, skipped_non_pet:${stats.skipped_non_pet}, duplicates:${stats.duplicates}, errors:${stats.errors}, pages_scanned:${stats.pages_scanned}}`);
  
  fs.writeFileSync(LOG_PATH, JSON.stringify(stats, null, 2));
  
  return stats;
}

if (require.main === module) {
  runImport()
    .then(s => {
      console.log('\nImport complete:', s);
      process.exit(s.errors > 10 ? 1 : 0);
    })
    .catch(e => {
      console.error('Import failed:', e);
      process.exit(1);
    });
}

module.exports = { runImport, stats };
