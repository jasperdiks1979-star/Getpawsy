/**
 * CJ CSV EXACT MAPPER - Deterministic SPU/SKU/Variant/Image Mapping
 * 
 * Features:
 * 1. CSV column discovery with debug output
 * 2. Image parsing (URL lists in cells)
 * 3. Product/Variant grouping rules (no leakage)
 * 4. Options mapping (variants properly created)
 * 5. Validation: block demo/placeholder images + duplicates audit
 * 6. Output to API/DB + idempotent rebuild
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '../public/cache/images');
const DB_PATH = path.join(__dirname, '../data/db.json');
const MARKUP = 2.2;
const IMAGE_TIMEOUT = 15000;

// ============================================================
// 1) CSV COLUMN DISCOVERY
// ============================================================

const COLUMN_PATTERNS = {
  spu: [/^spu$/i, /product\s*id/i, /item\s*id/i],
  sku: [/^sku$/i, /variant\s*id/i, /item\s*sku/i],
  title: [/product\s*name/i, /^title$/i, /^name$/i, /item\s*name/i],
  description: [/^desc(ription)?$/i, /product\s*desc/i],
  price: [/sell\s*price/i, /^price$/i, /variant\s*price/i, /unit\s*price/i],
  variantImage: [/variant\s*image/i, /sku\s*image/i, /option\s*image/i],
  productImage: [/product\s*image/i, /main\s*image/i, /^image$/i],
  productImages: [/^images$/i, /product\s*images/i, /image\s*list/i, /gallery/i, /all\s*images/i],
  warehouse: [/warehouse/i, /location/i, /stock\s*location/i],
  color: [/^color$/i, /^colour$/i],
  size: [/^size$/i],
  style: [/^style$/i],
  material: [/^material$/i],
  type: [/^type$/i],
  specAttr1: [/specification\s*attribute\s*1/i, /spec\s*attr\s*1/i],
  specAttr2: [/specification\s*attribute\s*2/i, /spec\s*attr\s*2/i],
  specAttr3: [/specification\s*attribute\s*3/i, /spec\s*attr\s*3/i],
  specVal1: [/value\s*1/i, /spec\s*val\s*1/i],
  specVal2: [/value\s*2/i, /spec\s*val\s*2/i],
  specVal3: [/value\s*3/i, /spec\s*val\s*3/i],
  productLink: [/product\s*link/i, /^url$/i, /product\s*url/i]
};

function discoverColumns(headers) {
  const mapping = {};
  const headerLog = [];
  
  console.log('\n[CJ-Mapper] === CSV COLUMN DISCOVERY ===');
  console.log('[CJ-Mapper] Header row:');
  
  headers.forEach((h, idx) => {
    const clean = (h || '').toString().trim();
    headerLog.push({ index: idx, column: clean });
    console.log(`  [${idx}] "${clean}"`);
  });
  
  // Match each pattern
  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (const pattern of patterns) {
      const idx = headers.findIndex(h => pattern.test((h || '').toString().trim()));
      if (idx !== -1 && mapping[field] === undefined) {
        mapping[field] = idx;
        break;
      }
    }
  }
  
  console.log('\n[CJ-Mapper] === MAPPING SUMMARY ===');
  console.log(JSON.stringify(mapping, null, 2));
  
  // Validate essential fields
  const essential = ['spu', 'sku', 'title', 'price'];
  const missing = essential.filter(f => mapping[f] === undefined);
  if (missing.length > 0) {
    throw new Error(`[CJ-Mapper] Missing essential columns: ${missing.join(', ')}`);
  }
  
  // Image column fallback: if no variantImage, try productImage
  if (mapping.variantImage === undefined && mapping.productImage !== undefined) {
    console.log('[CJ-Mapper] Warning: No variant image column, using product image');
    mapping.variantImage = mapping.productImage;
  }
  
  if (mapping.variantImage === undefined) {
    throw new Error('[CJ-Mapper] Missing image column (variantImage or productImage)');
  }
  
  return { mapping, headerLog };
}

// ============================================================
// 2) IMAGE PARSING
// ============================================================

function parseImageList(cell) {
  if (!cell || typeof cell !== 'string') return [];
  
  // Split on common delimiters
  const parts = cell.split(/[|,;\s]+/).map(s => s.trim().replace(/^["']+|["']+$/g, ''));
  
  // Filter valid image URLs/paths
  return parts.filter(p => {
    if (!p) return false;
    const lower = p.toLowerCase();
    return (
      lower.startsWith('http') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp') ||
      lower.endsWith('.gif') ||
      lower.includes('/cache/images/')
    );
  });
}

// ============================================================
// 5) IMAGE VALIDATION (block demo/placeholder)
// ============================================================

const INVALID_IMAGE_PATTERNS = [
  'demo', 'placeholder', 'stock', 'dropship', 'unsplash', 
  'sample', 'gift for them', 'best gift', 'pexels', 'pixabay',
  'example.com', 'test.jpg', 'dummy'
];

function isValidImage(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return false;
  const lower = imagePath.toLowerCase();
  return !INVALID_IMAGE_PATTERNS.some(p => lower.includes(p));
}

// ============================================================
// 4) OPTIONS MAPPING
// ============================================================

function extractOptions(row, mapping) {
  const options = [];
  
  // Try CJ-style specification attributes first
  if (mapping.specAttr1 !== undefined && mapping.specVal1 !== undefined) {
    const attr1 = (row[mapping.specAttr1] || '').toString().trim();
    const val1 = (row[mapping.specVal1] || '').toString().trim();
    if (attr1 && val1) options.push({ name: attr1, value: val1 });
    
    if (mapping.specAttr2 !== undefined && mapping.specVal2 !== undefined) {
      const attr2 = (row[mapping.specAttr2] || '').toString().trim();
      const val2 = (row[mapping.specVal2] || '').toString().trim();
      if (attr2 && val2) options.push({ name: attr2, value: val2 });
    }
    
    if (mapping.specAttr3 !== undefined && mapping.specVal3 !== undefined) {
      const attr3 = (row[mapping.specAttr3] || '').toString().trim();
      const val3 = (row[mapping.specVal3] || '').toString().trim();
      if (attr3 && val3) options.push({ name: attr3, value: val3 });
    }
  }
  
  // Otherwise use standard option columns
  if (options.length === 0) {
    const optionFields = ['color', 'size', 'style', 'material', 'type'];
    for (const field of optionFields) {
      if (mapping[field] !== undefined) {
        const val = (row[mapping[field]] || '').toString().trim();
        if (val) {
          options.push({ 
            name: field.charAt(0).toUpperCase() + field.slice(1), 
            value: val 
          });
        }
      }
    }
  }
  
  return options;
}

function buildDisplayLabel(options, price) {
  if (options.length === 0) return `$${price.toFixed(2)}`;
  const optStr = options.map(o => o.value).join(' / ');
  return `${optStr} - $${price.toFixed(2)}`;
}

// ============================================================
// IMAGE CACHING
// ============================================================

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
}

function getCachedPath(url, sku) {
  const ext = path.extname(url).split('?')[0] || '.jpg';
  const hash = hashUrl(url);
  const safeSku = sanitizeFilename(sku);
  return `/cache/images/${safeSku}_${hash}${ext}`;
}

async function downloadImage(url, localPath) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(__dirname, '../public', localPath);
    
    // Check if already cached
    if (fs.existsSync(fullPath)) {
      return resolve(localPath);
    }
    
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: IMAGE_TIMEOUT }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        return downloadImage(res.headers.location, localPath).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
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

// ============================================================
// CATEGORY DETECTION
// ============================================================

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

function generateDescription(title, category) {
  if (!title) return 'Quality pet product for your furry friend.';
  const t = title.toLowerCase();
  if (t.includes('toy')) return `Fun and engaging ${title.toLowerCase()}. Durable and safe for daily play.`;
  if (t.includes('bed') || t.includes('mat')) return `Comfortable ${title.toLowerCase()} for your pet. Soft materials for relaxation.`;
  if (t.includes('bowl') || t.includes('feeder')) return `Practical ${title.toLowerCase()} for easy feeding.`;
  if (t.includes('collar') || t.includes('leash')) return `Durable ${title.toLowerCase()} for safe walks.`;
  return `High-quality ${title}. Perfect for pet owners.`;
}

function roundPrice(cost) {
  if (!cost || isNaN(cost) || cost <= 0) return 9.99;
  const price = parseFloat(cost) * MARKUP;
  return Math.floor(price) + 0.99;
}

// ============================================================
// 3) PRODUCT/VARIANT GROUPING (NO LEAKAGE)
// ============================================================

async function parseAndGroup(csvContent) {
  const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) throw new Error('CSV has no data rows');
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const { mapping, headerLog } = discoverColumns(headers);
  
  console.log(`\n[CJ-Mapper] Processing ${lines.length - 1} rows...`);
  
  // Group by SPU - STRICT: no global state
  const productsBySPU = {};
  const stats = {
    totalRows: 0,
    validVariants: 0,
    invalidImages: 0,
    duplicateSkus: 0
  };
  
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (row.length < 3) continue;
    
    stats.totalRows++;
    
    // Extract per-row values (NO globals)
    const spu = (row[mapping.spu] || '').toString().trim();
    const sku = (row[mapping.sku] || '').toString().trim();
    const title = (row[mapping.title] || '').toString().trim();
    const rawPrice = parseFloat(row[mapping.price]) || 0;
    const price = roundPrice(rawPrice);
    
    // Per-row image extraction (CRITICAL: no leakage)
    const variantImageRaw = parseImageList(row[mapping.variantImage] || '')[0] || '';
    const productImageRaw = mapping.productImage !== undefined 
      ? parseImageList(row[mapping.productImage] || '')[0] || ''
      : variantImageRaw;
    const galleryRaw = mapping.productImages !== undefined
      ? parseImageList(row[mapping.productImages] || '')
      : [];
    
    // Validate image
    let variantImage = variantImageRaw;
    if (!isValidImage(variantImage)) {
      // Try gallery fallback
      variantImage = galleryRaw.find(img => isValidImage(img)) || '';
    }
    
    if (!variantImage) {
      stats.invalidImages++;
      console.log(`[CJ-Mapper] Row ${i}: No valid image for SKU ${sku}`);
      continue;
    }
    
    if (!spu || !sku) {
      console.log(`[CJ-Mapper] Row ${i}: Missing SPU/SKU`);
      continue;
    }
    
    // Extract options PER ROW
    const options = extractOptions(row, mapping);
    
    // Initialize product if new SPU
    if (!productsBySPU[spu]) {
      productsBySPU[spu] = {
        spu,
        title,
        description: generateDescription(title, detectCategory(title)),
        category: detectCategory(title),
        productImage: productImageRaw,
        galleryImages: [],
        variants: {},
        warehouse: (row[mapping.warehouse] || 'USA').toString().trim()
      };
    }
    
    const product = productsBySPU[spu];
    
    // Add gallery images
    galleryRaw.forEach(img => {
      if (isValidImage(img) && !product.galleryImages.includes(img)) {
        product.galleryImages.push(img);
      }
    });
    
    // Check duplicate SKU
    if (product.variants[sku]) {
      stats.duplicateSkus++;
      continue;
    }
    
    // Add variant
    product.variants[sku] = {
      sku,
      price,
      options,
      displayLabel: buildDisplayLabel(options, price),
      imageRaw: variantImage
    };
    
    stats.validVariants++;
  }
  
  console.log(`\n[CJ-Mapper] === GROUPING STATS ===`);
  console.log(`Total rows: ${stats.totalRows}`);
  console.log(`Valid variants: ${stats.validVariants}`);
  console.log(`Invalid images skipped: ${stats.invalidImages}`);
  console.log(`Duplicate SKUs skipped: ${stats.duplicateSkus}`);
  console.log(`Unique SPUs: ${Object.keys(productsBySPU).length}`);
  
  return { productsBySPU, mapping, stats };
}

function parseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ============================================================
// 5) DUPLICATE AUDIT
// ============================================================

function auditDuplicateImages(products) {
  const imageCount = {};
  
  products.forEach(p => {
    if (p.image) {
      imageCount[p.image] = (imageCount[p.image] || []);
      imageCount[p.image].push(p.spu);
    }
  });
  
  const topReused = Object.entries(imageCount)
    .filter(([_, spus]) => spus.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([path, spus]) => ({ path, count: spus.length, spus: spus.slice(0, 5) }));
  
  console.log(`\n[CJ-Mapper] === DUPLICATE IMAGE AUDIT ===`);
  topReused.forEach(r => {
    console.log(`  ${r.path}: ${r.count} products`);
  });
  
  // Mark suspect products (>5 uses)
  const suspectImages = topReused.filter(r => r.count > 5).map(r => r.path);
  const suspectProducts = products.filter(p => suspectImages.includes(p.image));
  
  return { topReused, suspectProducts, suspectImages };
}

// ============================================================
// 6) REBUILD FUNCTION
// ============================================================

async function rebuildCJCatalog(csvPath) {
  console.log('\n[CJ-Mapper] ========================================');
  console.log('[CJ-Mapper] STARTING CJ CATALOG REBUILD');
  console.log('[CJ-Mapper] ========================================\n');
  
  ensureCacheDir();
  
  // Read CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  // Parse and group
  const { productsBySPU, mapping, stats } = await parseAndGroup(csvContent);
  
  // Convert to product array and cache images
  const products = [];
  const spuList = Object.keys(productsBySPU);
  
  console.log(`\n[CJ-Mapper] Processing ${spuList.length} products...`);
  
  for (const spu of spuList) {
    const pData = productsBySPU[spu];
    const variantList = Object.values(pData.variants);
    
    if (variantList.length === 0) {
      console.log(`[CJ-Mapper] SPU ${spu}: No valid variants, skipping`);
      continue;
    }
    
    // Cache variant images
    const variants = [];
    let mainImage = null;
    
    for (const v of variantList) {
      let cachedPath = null;
      
      if (v.imageRaw.startsWith('http')) {
        try {
          cachedPath = getCachedPath(v.imageRaw, v.sku);
          await downloadImage(v.imageRaw, cachedPath);
        } catch (err) {
          console.log(`[CJ-Mapper] Failed to cache image for ${v.sku}: ${err.message}`);
          cachedPath = null;
        }
      } else if (v.imageRaw.startsWith('/cache/')) {
        cachedPath = v.imageRaw;
      }
      
      if (!cachedPath) continue;
      
      if (!mainImage) mainImage = cachedPath;
      
      variants.push({
        sku: v.sku,
        price: v.price,
        options: v.options.reduce((acc, o) => {
          acc[o.name] = o.value;
          return acc;
        }, {}),
        image: cachedPath
      });
    }
    
    if (variants.length === 0 || !mainImage) {
      console.log(`[CJ-Mapper] SPU ${spu}: No cached images, skipping`);
      continue;
    }
    
    // Build gallery
    const gallery = [mainImage];
    variants.forEach(v => {
      if (v.image && !gallery.includes(v.image)) {
        gallery.push(v.image);
      }
    });
    
    products.push({
      id: spu,
      spu,
      title: pData.title,
      description: pData.description,
      price: variants[0].price,
      image: mainImage,
      images: gallery,
      variants,
      source: 'CJ',
      warehouse: pData.warehouse.toLowerCase(),
      is_us: pData.warehouse.toLowerCase().includes('us'),
      shipping_fee: 0,
      category: pData.category,
      active: true
    });
  }
  
  // Run duplicate audit
  const auditResult = auditDuplicateImages(products);
  
  // Mark suspect products inactive
  if (auditResult.suspectProducts.length > 0) {
    console.log(`\n[CJ-Mapper] Marking ${auditResult.suspectProducts.length} suspect products inactive`);
    auditResult.suspectProducts.forEach(p => {
      const prod = products.find(pr => pr.spu === p.spu);
      if (prod) {
        prod.active = false;
        prod.suspect = true;
      }
    });
  }
  
  // Save to database (replace CJ products only)
  let dbData = { products: [], orders: [], carts: {} };
  if (fs.existsSync(DB_PATH)) {
    try {
      dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
      console.log('[CJ-Mapper] Warning: Could not parse existing db.json');
    }
  }
  
  // Keep non-CJ products, replace CJ
  const nonCJProducts = (dbData.products || []).filter(p => p.source !== 'CJ');
  dbData.products = [...nonCJProducts, ...products];
  
  fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));
  
  const activeCount = products.filter(p => p.active).length;
  const inactiveCount = products.filter(p => !p.active).length;
  const suspectCount = products.filter(p => p.suspect).length;
  
  console.log('\n[CJ-Mapper] ========================================');
  console.log('[CJ-Mapper] REBUILD COMPLETE');
  console.log(`[CJ-Mapper] Total products: ${products.length}`);
  console.log(`[CJ-Mapper] Active: ${activeCount}`);
  console.log(`[CJ-Mapper] Inactive: ${inactiveCount}`);
  console.log(`[CJ-Mapper] Suspect (duplicate images): ${suspectCount}`);
  console.log('[CJ-Mapper] ========================================\n');
  
  return {
    success: true,
    mapping,
    stats: {
      ...stats,
      totalProducts: products.length,
      activeProducts: activeCount,
      inactiveProducts: inactiveCount,
      suspectProducts: suspectCount
    },
    topReusedImages: auditResult.topReused,
    sampleProducts: products.slice(0, 5).map(p => ({
      spu: p.spu,
      title: p.title,
      mainImage: p.image,
      variantCount: p.variants.length,
      firstVariant: p.variants[0] ? {
        sku: p.variants[0].sku,
        options: p.variants[0].options,
        image: p.variants[0].image
      } : null
    }))
  };
}

// ============================================================
// QA ENDPOINT DATA
// ============================================================

function getQAData() {
  if (!fs.existsSync(DB_PATH)) {
    return { error: 'Database not found' };
  }
  
  const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const products = dbData.products || [];
  const cjProducts = products.filter(p => p.source === 'CJ');
  
  const activeProducts = cjProducts.filter(p => p.active !== false);
  const inactiveProducts = cjProducts.filter(p => p.active === false);
  const suspectProducts = cjProducts.filter(p => p.suspect === true);
  
  // Image audit
  const imageCount = {};
  activeProducts.forEach(p => {
    if (p.image) {
      imageCount[p.image] = (imageCount[p.image] || 0) + 1;
    }
  });
  
  const topReused = Object.entries(imageCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));
  
  return {
    totalCJProducts: cjProducts.length,
    activeProducts: activeProducts.length,
    inactiveProducts: inactiveProducts.length,
    suspectProducts: suspectProducts.length,
    topReusedImages: topReused,
    sampleProducts: activeProducts.slice(0, 5).map(p => ({
      spu: p.spu,
      title: p.title,
      mainImage: p.image,
      variantCount: (p.variants || []).length,
      firstVariant: p.variants && p.variants[0] ? {
        sku: p.variants[0].sku,
        options: p.variants[0].options,
        image: p.variants[0].image
      } : null
    }))
  };
}

module.exports = {
  discoverColumns,
  parseImageList,
  isValidImage,
  extractOptions,
  parseAndGroup,
  auditDuplicateImages,
  rebuildCJCatalog,
  getQAData
};
