#!/usr/bin/env node
/**
 * CJ Pet Products Import Script
 * Imports pet products from CJ Dropshipping API with strict pet-only filtering
 * and biases toward small pet products.
 */

const fs = require('fs');
const path = require('path');

const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const TOKEN_CACHE = path.join(__dirname, '..', 'data', 'cj-token.json');
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const IMPORT_LOG_PATH = path.join(__dirname, '..', 'data', 'cj-import-log.json');

const CJ_EMAIL = process.env.CJ_EMAIL;
const CJ_API_KEY = process.env.CJ_API_KEY;

const TARGET_TOTAL = 250;
const TARGET_SMALL_PETS = 80;

const SMALL_PET_KEYWORDS = [
  'rabbit', 'bunny', 'guinea pig', 'hamster', 'gerbil', 'mouse', 'rat',
  'ferret', 'chinchilla', 'hedgehog', 'bird', 'parrot', 'parakeet', 'budgie',
  'cockatiel', 'canary', 'finch', 'fish', 'aquarium', 'betta', 'goldfish',
  'reptile', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko', 'iguana',
  'terrarium', 'vivarium', 'cage', 'hutch', 'small animal', 'small pet',
  'bird cage', 'bird seed', 'bird feeder', 'aquarium filter', 'fish tank',
  'hamster wheel', 'hamster ball', 'guinea pig cage', 'rabbit hutch'
];

const DOG_KEYWORDS = [
  'dog', 'puppy', 'canine', 'k9', 'pup', 'doggy', 'doggo', 'woof', 'bark',
  'dog bed', 'dog bowl', 'dog toy', 'dog treat', 'dog leash', 'dog harness',
  'dog collar', 'dog crate', 'dog carrier', 'dog food', 'dog grooming'
];

const CAT_KEYWORDS = [
  'cat', 'kitten', 'feline', 'kitty', 'meow',
  'cat tree', 'cat tower', 'cat bed', 'cat toy', 'litter', 'scratching post',
  'catnip', 'cat collar', 'cat carrier', 'cat food', 'cat grooming'
];

const EXCLUDED_TERMS = [
  'human', 't-shirt', 'tshirt', 'shirt', 'dress', 'pants', 'jewelry',
  'sticker', 'poster', 'wall art', 'phone case', 'laptop', 'car',
  'furniture', 'curtain', 'rug', 'kitchen', 'bathroom', 'office',
  'makeup', 'cosmetic', 'adult', 'sexy', 'lingerie', 'tool', 'weapon'
];

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function httpsRequest(method, url, headers = {}, body = null) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      method,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GetPawsy/1.0',
        ...headers
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
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

  log('Requesting new CJ access token...');
  const res = await httpsRequest('POST', `${CJ_API_BASE}/authentication/getAccessToken`, {}, {
    email: CJ_EMAIL,
    password: CJ_API_KEY
  });

  if (res.statusCode !== 200) {
    throw new Error(`Auth failed: HTTP ${res.statusCode}`);
  }

  const data = JSON.parse(res.body);
  if (!data.data?.accessToken) {
    throw new Error(`Auth failed: ${data.message || 'No token'}`);
  }

  const token = data.data.accessToken;
  fs.mkdirSync(path.dirname(TOKEN_CACHE), { recursive: true });
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify({
    accessToken: token,
    expiry: Date.now() + 86400000,
    created: new Date().toISOString()
  }, null, 2));

  log('Access token obtained');
  return token;
}

async function searchProducts(token, keyword, pageNum = 1, pageSize = 50) {
  const params = new URLSearchParams();
  params.set('pageNum', pageNum.toString());
  params.set('pageSize', pageSize.toString());
  if (keyword) params.set('productNameEn', keyword);
  
  const url = `${CJ_API_BASE}/product/list?${params.toString()}`;
  
  const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
  
  if (res.statusCode !== 200) {
    log(`Search failed for "${keyword}": HTTP ${res.statusCode}`);
    return { products: [], total: 0 };
  }

  const data = JSON.parse(res.body);
  
  if (data.code === 200 && data.data?.list) {
    return {
      products: data.data.list,
      total: data.data.total || data.data.list.length
    };
  }
  
  return { products: [], total: 0 };
}

async function getProductDetail(token, pid) {
  const url = `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(pid)}`;
  
  try {
    const res = await httpsRequest('GET', url, { 'CJ-Access-Token': token });
    
    if (res.statusCode !== 200) {
      log(`  Detail fetch failed for ${pid}: HTTP ${res.statusCode}`);
      return null;
    }

    const data = JSON.parse(res.body);
    
    if (data.code === 200 && data.data) {
      return data.data;
    }
  } catch (e) {
    log(`  Detail fetch error for ${pid}: ${e.message}`);
  }
  
  return null;
}

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
    log(`  Variant fetch error for ${pid}: ${e.message}`);
  }
  
  return [];
}

function normalizeText(text) {
  return (text || '').toLowerCase().trim();
}

function containsAny(text, keywords) {
  const norm = normalizeText(text);
  return keywords.some(kw => norm.includes(kw.toLowerCase()));
}

function isExcluded(product) {
  const text = `${product.productNameEn || ''} ${product.categoryName || ''}`;
  return containsAny(text, EXCLUDED_TERMS);
}

function isPetProduct(product) {
  const text = `${product.productNameEn || ''} ${product.categoryName || ''} ${product.description || ''}`;
  const norm = normalizeText(text);
  
  const hasDogKeyword = containsAny(text, DOG_KEYWORDS);
  const hasCatKeyword = containsAny(text, CAT_KEYWORDS);
  const hasSmallPetKeyword = containsAny(text, SMALL_PET_KEYWORDS);
  
  return hasDogKeyword || hasCatKeyword || hasSmallPetKeyword;
}

function classifyPetType(product) {
  const text = `${product.productNameEn || ''} ${product.categoryName || ''}`;
  
  const hasSmallPet = containsAny(text, SMALL_PET_KEYWORDS);
  const hasDog = containsAny(text, DOG_KEYWORDS);
  const hasCat = containsAny(text, CAT_KEYWORDS);
  
  if (hasSmallPet && !hasDog && !hasCat) {
    return 'small_pet';
  }
  
  if (hasDog && !hasCat) return 'dog';
  if (hasCat && !hasDog) return 'cat';
  if (hasDog && hasCat) return hasDog > hasCat ? 'dog' : 'cat';
  
  return 'unknown';
}

function isUSWarehouse(product) {
  const warehouse = (product.createFrom || '').toUpperCase();
  const usCodes = ['US', 'USA', 'US-CA', 'US-NJ', 'US-TX', 'USCA', 'USNJ', 'USTX', 'CJ-US'];
  return usCodes.some(code => warehouse.includes(code));
}

function normalizeImageUrl(url) {
  if (!url) return null;
  let normalized = url.trim();
  if (normalized.startsWith('//')) normalized = 'https:' + normalized;
  if (!normalized.startsWith('http')) return null;
  return normalized;
}

function normalizeProduct(cjProduct, variants, petType) {
  const pid = cjProduct.pid || cjProduct.productId;
  const title = cjProduct.productNameEn || cjProduct.name || 'CJ Product';
  const description = cjProduct.description || cjProduct.productDesc || '';
  const sellPrice = parseFloat(cjProduct.sellPrice) || 0;
  const price = calculateRetailPrice(sellPrice);
  
  const images = [];
  const mainImage = normalizeImageUrl(cjProduct.productImage || cjProduct.bigImage);
  if (mainImage) images.push(mainImage);
  
  if (cjProduct.productImageSet && Array.isArray(cjProduct.productImageSet)) {
    for (const img of cjProduct.productImageSet.slice(0, 8)) {
      const url = normalizeImageUrl(img);
      if (url && !images.includes(url)) images.push(url);
    }
  }
  
  const normalizedVariants = [];
  const optionKeys = new Set();
  
  if (variants && variants.length > 0) {
    for (const v of variants) {
      const variantSellPrice = parseFloat(v.variantSellPrice || v.sellPrice || sellPrice) || sellPrice;
      const variantPrice = calculateRetailPrice(variantSellPrice);
      
      const optionValues = {};
      if (v.variantNameEn) {
        const parts = v.variantNameEn.split(/[,;]/);
        for (const part of parts) {
          const [key, val] = part.split(':').map(s => s.trim());
          if (key && val) {
            optionValues[key] = val;
            optionKeys.add(key);
          }
        }
      }
      if (v.variantProperty) {
        try {
          const props = typeof v.variantProperty === 'string' ? JSON.parse(v.variantProperty) : v.variantProperty;
          if (Array.isArray(props)) {
            for (const prop of props) {
              if (prop.propertyName && prop.propertyValue) {
                optionValues[prop.propertyName] = prop.propertyValue;
                optionKeys.add(prop.propertyName);
              }
            }
          }
        } catch (e) {}
      }
      
      const variantImage = normalizeImageUrl(v.variantImage || v.image);
      
      normalizedVariants.push({
        id: v.vid || v.variantId || `${pid}_${normalizedVariants.length}`,
        sku: v.variantSku || v.sku || `${pid}_SKU_${normalizedVariants.length}`,
        price: variantPrice,
        costPrice: variantSellPrice,
        stock: v.variantStock || v.stock || null,
        optionValues,
        image: variantImage,
        variantNameEn: v.variantNameEn || null,
        createFrom: v.createFrom || cjProduct.createFrom || 'CN'
      });
    }
  }
  
  if (normalizedVariants.length === 0) {
    normalizedVariants.push({
      id: `${pid}_default`,
      sku: cjProduct.productSku || `${pid}_SKU`,
      price,
      costPrice: sellPrice,
      stock: null,
      optionValues: {},
      image: images[0] || null,
      variantNameEn: null,
      createFrom: cjProduct.createFrom || 'CN'
    });
  }
  
  return {
    id: `cj_${pid}`,
    cj_id: pid,
    title,
    name: title,
    description,
    price: normalizedVariants[0]?.price || price,
    costPrice: sellPrice,
    currency: 'USD',
    images,
    primaryImageUrl: images[0] || '/images/placeholder-product.svg',
    thumbnailUrl: images[0] || '/images/placeholder-product.svg',
    variants: normalizedVariants,
    optionTypes: Array.from(optionKeys),
    hasVariants: normalizedVariants.length > 1,
    pet_type: petType,
    petType: petType,
    mainCategorySlug: petType === 'dog' ? 'dogs' : petType === 'cat' ? 'cats' : 'small-pets',
    source: 'CJ',
    warehouse: cjProduct.createFrom || 'CN',
    isUS: isUSWarehouse(cjProduct),
    active: true,
    inStock: true,
    hasLocalMedia: false,
    importedAt: new Date().toISOString()
  };
}

function calculateRetailPrice(costPrice) {
  if (costPrice <= 0) return 0;
  let multiplier = 1.8;
  if (costPrice < 5) multiplier = 3.5;
  else if (costPrice < 10) multiplier = 3.0;
  else if (costPrice < 20) multiplier = 2.5;
  else if (costPrice < 50) multiplier = 2.2;
  else if (costPrice < 100) multiplier = 2.0;
  return Math.round(costPrice * multiplier * 100 + 99) / 100;
}

function loadExistingCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    return { products: [], buildInfo: {} };
  }
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
}

function saveCatalog(catalog) {
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
}

async function run() {
  log('='.repeat(60));
  log('CJ Pet Products Import Script');
  log(`Target: ${TARGET_TOTAL} products, at least ${TARGET_SMALL_PETS} small pets`);
  log('='.repeat(60));
  
  const token = await getAccessToken();
  
  const catalog = loadExistingCatalog();
  const existingIds = new Set(catalog.products.map(p => p.cj_id || p.id));
  log(`Existing catalog: ${catalog.products.length} products`);
  
  const imported = {
    dog: [],
    cat: [],
    small_pet: [],
    unknown: []
  };
  
  const searchQueue = [
    ...SMALL_PET_KEYWORDS.slice(0, 30),
    ...DOG_KEYWORDS.slice(0, 15),
    ...CAT_KEYWORDS.slice(0, 15)
  ];
  
  let totalImported = 0;
  let smallPetCount = 0;
  const seenPids = new Set();
  
  let productsWithVariants = 0;
  let totalVariantCount = 0;
  
  log('\n--- Phase 1: Small Pet Products ---');
  for (const keyword of SMALL_PET_KEYWORDS.slice(0, 30)) {
    if (smallPetCount >= TARGET_SMALL_PETS) break;
    
    log(`Searching: "${keyword}"`);
    
    for (let page = 1; page <= 3; page++) {
      const { products, total } = await searchProducts(token, keyword, page, 50);
      log(`  Page ${page}: ${products.length} results (total: ${total})`);
      
      if (products.length === 0) break;
      
      for (const p of products) {
        const pid = p.pid || p.productId;
        if (seenPids.has(pid) || existingIds.has(pid) || existingIds.has(`cj_${pid}`)) continue;
        
        if (isExcluded(p)) continue;
        if (!isPetProduct(p)) continue;
        
        const petType = classifyPetType(p);
        if (petType !== 'small_pet') continue;
        
        seenPids.add(pid);
        
        log(`  Fetching details for: ${pid}`);
        const detail = await getProductDetail(token, pid);
        const variants = await getProductVariants(token, pid);
        log(`    Got ${variants.length} variants`);
        
        const productData = detail || p;
        const normalized = normalizeProduct(productData, variants, petType);
        
        if (normalized.hasVariants) {
          productsWithVariants++;
          totalVariantCount += normalized.variants.length;
        }
        
        imported.small_pet.push(normalized);
        smallPetCount++;
        
        await new Promise(r => setTimeout(r, 300));
        
        if (smallPetCount >= TARGET_SMALL_PETS) break;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
  }
  log(`Small pet imports: ${smallPetCount}`);
  
  log('\n--- Phase 2: Dog Products ---');
  const dogTarget = Math.floor((TARGET_TOTAL - smallPetCount) * 0.5);
  let dogCount = 0;
  
  for (const keyword of DOG_KEYWORDS.slice(0, 15)) {
    if (dogCount >= dogTarget) break;
    
    log(`Searching: "${keyword}"`);
    
    for (let page = 1; page <= 2; page++) {
      const { products } = await searchProducts(token, keyword, page, 50);
      log(`  Page ${page}: ${products.length} results`);
      
      if (products.length === 0) break;
      
      for (const p of products) {
        const pid = p.pid || p.productId;
        if (seenPids.has(pid) || existingIds.has(pid) || existingIds.has(`cj_${pid}`)) continue;
        
        if (isExcluded(p)) continue;
        
        const petType = classifyPetType(p);
        if (petType !== 'dog') continue;
        
        seenPids.add(pid);
        
        log(`  Fetching details for: ${pid}`);
        const detail = await getProductDetail(token, pid);
        const variants = await getProductVariants(token, pid);
        log(`    Got ${variants.length} variants`);
        
        const productData = detail || p;
        const normalized = normalizeProduct(productData, variants, petType);
        
        if (normalized.hasVariants) {
          productsWithVariants++;
          totalVariantCount += normalized.variants.length;
        }
        
        imported.dog.push(normalized);
        dogCount++;
        
        await new Promise(r => setTimeout(r, 300));
        
        if (dogCount >= dogTarget) break;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
  }
  log(`Dog imports: ${dogCount}`);
  
  log('\n--- Phase 3: Cat Products ---');
  const catTarget = TARGET_TOTAL - smallPetCount - dogCount;
  let catCount = 0;
  
  for (const keyword of CAT_KEYWORDS.slice(0, 15)) {
    if (catCount >= catTarget) break;
    
    log(`Searching: "${keyword}"`);
    
    for (let page = 1; page <= 2; page++) {
      const { products } = await searchProducts(token, keyword, page, 50);
      log(`  Page ${page}: ${products.length} results`);
      
      if (products.length === 0) break;
      
      for (const p of products) {
        const pid = p.pid || p.productId;
        if (seenPids.has(pid) || existingIds.has(pid) || existingIds.has(`cj_${pid}`)) continue;
        
        if (isExcluded(p)) continue;
        
        const petType = classifyPetType(p);
        if (petType !== 'cat') continue;
        
        seenPids.add(pid);
        
        log(`  Fetching details for: ${pid}`);
        const detail = await getProductDetail(token, pid);
        const variants = await getProductVariants(token, pid);
        log(`    Got ${variants.length} variants`);
        
        const productData = detail || p;
        const normalized = normalizeProduct(productData, variants, petType);
        
        if (normalized.hasVariants) {
          productsWithVariants++;
          totalVariantCount += normalized.variants.length;
        }
        
        imported.cat.push(normalized);
        catCount++;
        
        await new Promise(r => setTimeout(r, 300));
        
        if (catCount >= catTarget) break;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
  }
  log(`Cat imports: ${catCount}`);
  
  totalImported = imported.dog.length + imported.cat.length + imported.small_pet.length;
  
  log('\n--- Summary ---');
  log(`Small Pets: ${imported.small_pet.length}`);
  log(`Dogs: ${imported.dog.length}`);
  log(`Cats: ${imported.cat.length}`);
  log(`Total new: ${totalImported}`);
  log(`Products with variants: ${productsWithVariants}`);
  log(`Total variant SKUs: ${totalVariantCount}`);
  
  if (totalImported > 0) {
    const allNew = [...imported.small_pet, ...imported.dog, ...imported.cat];
    catalog.products = [...catalog.products, ...allNew];
    catalog.buildInfo = catalog.buildInfo || {};
    catalog.buildInfo.lastImport = new Date().toISOString();
    catalog.buildInfo.importStats = {
      smallPets: imported.small_pet.length,
      dogs: imported.dog.length,
      cats: imported.cat.length,
      total: totalImported,
      productsWithVariants,
      totalVariantCount
    };
    
    saveCatalog(catalog);
    log(`\nCatalog saved: ${catalog.products.length} total products`);
    
    const sampleWithVariants = allNew.find(p => p.hasVariants);
    if (sampleWithVariants) {
      log('\n--- Sample Product with Variants ---');
      log(`Title: ${sampleWithVariants.title}`);
      log(`ID: ${sampleWithVariants.id}`);
      log(`Variants: ${sampleWithVariants.variants.length}`);
      log(`Option Types: ${sampleWithVariants.optionTypes.join(', ')}`);
      if (sampleWithVariants.variants[0]) {
        log(`First Variant: ${JSON.stringify(sampleWithVariants.variants[0], null, 2)}`);
      }
    }
  } else {
    log('\nNo new products to import');
  }
  
  log('\n='.repeat(60));
  log('Import complete!');
  log('='.repeat(60));
}

run().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
