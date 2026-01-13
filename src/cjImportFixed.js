const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CACHE_DIR = path.join(__dirname, '../public/cache/images');
const DB_PATH = path.join(__dirname, '../data/db.json');

const MARKUP = 2.2;
const BATCH_SIZE = 20;
const IMAGE_TIMEOUT = 12000;

let progress = {
  status: 'idle',
  phase: '',
  total: 0,
  processed: 0,
  uniqueSpus: 0,
  variants: 0,
  cachedImages: 0,
  failedImages: 0,
  errors: [],
  warnings: [],
  startTime: null,
  columnMapping: {}
};

function getProgress() {
  return { ...progress };
}

function resetProgress() {
  progress = {
    status: 'idle',
    phase: '',
    total: 0,
    processed: 0,
    uniqueSpus: 0,
    variants: 0,
    cachedImages: 0,
    failedImages: 0,
    errors: [],
    warnings: [],
    startTime: null,
    columnMapping: {}
  };
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[CJ-Import-Fixed ${ts}] ${msg}`);
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function detectCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('toy') && n.includes('dog')) return 'dog-toys';
  if (n.includes('toy') && n.includes('cat')) return 'cat-toys';
  if (n.includes('toy')) return n.includes('cat') || n.includes('kitten') ? 'cat-toys' : 'dog-toys';
  if (n.includes('bed') || n.includes('cushion') || n.includes('mat') || n.includes('sofa')) return 'beds';
  if (n.includes('bowl') || n.includes('feeder') || n.includes('water') || n.includes('food')) return 'feeding';
  if (n.includes('collar') || n.includes('leash') || n.includes('harness')) return 'collars';
  if (n.includes('brush') || n.includes('groom') || n.includes('nail') || n.includes('comb')) return 'grooming';
  if (n.includes('scratch') || n.includes('post') || n.includes('tree')) return 'scratchers';
  if (n.includes('train') || n.includes('clicker') || n.includes('treat')) return 'training';
  if (n.includes('carrier') || n.includes('travel') || n.includes('bag') || n.includes('crate')) return 'travel';
  if (n.includes('cat') || n.includes('kitten') || n.includes('feline')) return 'cat-toys';
  if (n.includes('dog') || n.includes('puppy') || n.includes('canine')) return 'dog-toys';
  return 'supplies';
}

function roundPrice(cost) {
  if (!cost || isNaN(cost) || cost <= 0) return 9.99;
  const price = cost * MARKUP;
  return Math.floor(price) + 0.99;
}

function generateDescription(title, category) {
  if (!title) return 'Quality pet product for your furry friend.';
  const t = title.toLowerCase();
  if (t.includes('toy')) return `Fun and engaging ${title.toLowerCase()} to keep your pet entertained. Durable and safe for daily play.`;
  if (t.includes('bed') || t.includes('mat')) return `Comfortable ${title.toLowerCase()} for your pet's rest. Soft materials for maximum relaxation.`;
  if (t.includes('bowl') || t.includes('feeder')) return `Practical ${title.toLowerCase()} for easy feeding. Easy to clean and maintain.`;
  if (t.includes('collar') || t.includes('leash')) return `Durable ${title.toLowerCase()} for safe walks. Comfortable fit for your pet.`;
  return `High-quality ${title}. Perfect for pet owners who want the best for their companions.`;
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

function hashUrl(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

async function downloadImage(url, spu, sku) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') {
      return reject(new Error('Invalid URL'));
    }
    
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      return reject(new Error('URL must start with http'));
    }

    const hash = hashUrl(cleanUrl);
    const ext = cleanUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
    const filename = `${sanitizeFilename(spu)}_${sanitizeFilename(sku)}_${hash}.${ext}`;
    const filepath = path.join(CACHE_DIR, filename);

    if (fs.existsSync(filepath)) {
      return resolve(`/cache/images/${filename}`);
    }

    const protocol = cleanUrl.startsWith('https') ? https : http;
    
    const request = protocol.get(cleanUrl, { timeout: IMAGE_TIMEOUT }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadImage(res.headers.location, spu, sku).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('image')) {
        return reject(new Error('Not an image'));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          fs.writeFileSync(filepath, Buffer.concat(chunks));
          resolve(`/cache/images/${filename}`);
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function detectColumns(headers) {
  const mapping = {
    spu: -1,
    sku: -1,
    name: -1,
    link: -1,
    skuImage: -1,
    productImage: -1,
    price: -1,
    warehouse: -1,
    spec1Name: -1,
    spec1Value: -1,
    spec2Name: -1,
    spec2Value: -1,
    spec3Name: -1,
    spec3Value: -1
  };

  headers.forEach((h, i) => {
    const hl = (h || '').toString().toLowerCase().trim();
    
    if (hl === 'spu' || hl.includes('spu')) mapping.spu = i;
    if (hl === 'sku' && !hl.includes('image') && !hl.includes('price')) mapping.sku = i;
    if (hl.includes('product') && hl.includes('name') || hl === 'lists' || hl.includes('title')) mapping.name = i;
    if (hl.includes('link') || hl.includes('url')) mapping.link = i;
    if (hl.includes('sku') && hl.includes('image')) mapping.skuImage = i;
    if (hl.includes('product') && hl.includes('image') && !hl.includes('sku')) mapping.productImage = i;
    if ((hl.includes('unit price') || hl.includes('price')) && hl.includes('discount') && !hl.includes('original')) mapping.price = i;
    if (hl.includes('ship') && hl.includes('from') || hl.includes('warehouse')) mapping.warehouse = i;
    if (hl === 'specification attribute 1') mapping.spec1Name = i;
    if (hl === 'specification attribute value 1') mapping.spec1Value = i;
    if (hl === 'specification attribute 2') mapping.spec2Name = i;
    if (hl === 'specification attribute value 2') mapping.spec2Value = i;
    if (hl === 'specification attribute 3') mapping.spec3Name = i;
    if (hl === 'specification attribute value 3') mapping.spec3Value = i;
  });

  return mapping;
}

function parsePrice(val) {
  if (!val) return 0;
  const str = val.toString().trim();
  const match = str.match(/[\d.]+/);
  if (match) return parseFloat(match[0]);
  return 0;
}

async function importFromXLSX(xlsxPath, options = {}) {
  resetProgress();
  progress.status = 'running';
  progress.phase = 'Loading XLSX file';
  progress.startTime = new Date().toISOString();
  ensureCacheDir();

  log(`Starting import from: ${xlsxPath}`);

  if (!fs.existsSync(xlsxPath)) {
    progress.status = 'error';
    progress.errors.push(`File not found: ${xlsxPath}`);
    return { success: false, error: 'File not found' };
  }

  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawData.length < 2) {
    progress.status = 'error';
    progress.errors.push('No data rows found');
    return { success: false, error: 'No data rows' };
  }

  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const row = rawData[i];
    if (row && row.some(c => c && c.toString().toLowerCase().includes('spu'))) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = rawData[headerRowIndex];
  const colMap = detectColumns(headers);
  progress.columnMapping = colMap;

  log(`Column mapping: SPU=${colMap.spu}, SKU=${colMap.sku}, Name=${colMap.name}, SKU Image=${colMap.skuImage}`);

  if (colMap.spu < 0) {
    progress.status = 'error';
    progress.errors.push('No SPU column found');
    return { success: false, error: 'No SPU column' };
  }

  progress.phase = 'Grouping products by SPU';
  const dataRows = rawData.slice(headerRowIndex + 1);
  progress.total = dataRows.length;

  const productsBySPU = new Map();
  const imagesBySPU = new Map();
  let skippedRows = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length === 0) {
      skippedRows++;
      continue;
    }

    const spu = (row[colMap.spu] || '').toString().trim();
    if (!spu) {
      skippedRows++;
      continue;
    }

    const sku = colMap.sku >= 0 ? (row[colMap.sku] || '').toString().trim() : `${spu}-V${i}`;
    const warehouse = colMap.warehouse >= 0 ? (row[colMap.warehouse] || '').toString().trim().toUpperCase() : '';
    
    const isUS = warehouse.includes('US') || warehouse.includes('USA') || warehouse === '';
    if (options.usOnly && !isUS && warehouse !== '') {
      skippedRows++;
      continue;
    }

    if (!productsBySPU.has(spu)) {
      const name = colMap.name >= 0 ? (row[colMap.name] || '').toString().trim() : '';
      const link = colMap.link >= 0 ? (row[colMap.link] || '').toString().trim() : '';
      
      productsBySPU.set(spu, {
        spu,
        name: name || `Product ${spu}`,
        link,
        variants: [],
        images: []
      });
      imagesBySPU.set(spu, new Set());
    }

    const product = productsBySPU.get(spu);
    const imageSet = imagesBySPU.get(spu);

    const variantOpts = {};
    if (colMap.spec1Name >= 0 && colMap.spec1Value >= 0) {
      const specName = (row[colMap.spec1Name] || '').toString().trim();
      const specValue = (row[colMap.spec1Value] || '').toString().trim();
      if (specName && specValue) variantOpts[specName] = specValue;
    }
    if (colMap.spec2Name >= 0 && colMap.spec2Value >= 0) {
      const specName = (row[colMap.spec2Name] || '').toString().trim();
      const specValue = (row[colMap.spec2Value] || '').toString().trim();
      if (specName && specValue) variantOpts[specName] = specValue;
    }
    if (colMap.spec3Name >= 0 && colMap.spec3Value >= 0) {
      const specName = (row[colMap.spec3Name] || '').toString().trim();
      const specValue = (row[colMap.spec3Value] || '').toString().trim();
      if (specName && specValue) variantOpts[specName] = specValue;
    }

    const priceRaw = colMap.price >= 0 ? parsePrice(row[colMap.price]) : 5;
    const skuImageUrl = colMap.skuImage >= 0 ? (row[colMap.skuImage] || '').toString().trim() : '';

    const existingVariant = product.variants.find(v => v.sku === sku);
    if (!existingVariant) {
      product.variants.push({
        sku,
        priceRaw,
        options: Object.keys(variantOpts).length > 0 ? variantOpts : null,
        imageUrl: skuImageUrl || null,
        cachedImage: null
      });

      if (skuImageUrl && skuImageUrl.startsWith('http')) {
        imageSet.add(skuImageUrl);
      }
    }

    progress.processed = i + 1;
  }

  log(`Parsed ${productsBySPU.size} unique products from ${progress.total} rows (${skippedRows} skipped)`);
  progress.uniqueSpus = productsBySPU.size;

  progress.phase = 'Caching images (per SPU)';
  const products = Array.from(productsBySPU.values());
  let totalVariants = 0;
  let imagesTotal = 0;
  let imagesCached = 0;
  let imagesFailed = 0;

  for (const product of products) {
    totalVariants += product.variants.length;
    
    for (const variant of product.variants) {
      if (variant.imageUrl) {
        imagesTotal++;
        try {
          const cached = await downloadImage(variant.imageUrl, product.spu, variant.sku);
          variant.cachedImage = cached;
          imagesCached++;

          if (!product.images.includes(cached)) {
            product.images.push(cached);
          }
        } catch (err) {
          imagesFailed++;
          log(`Image failed for ${product.spu}/${variant.sku}: ${err.message}`);
          progress.warnings.push(`Image failed: ${product.spu}/${variant.sku}`);
        }
      }
    }

    progress.cachedImages = imagesCached;
    progress.failedImages = imagesFailed;
  }

  progress.variants = totalVariants;
  log(`Cached ${imagesCached}/${imagesTotal} images (${imagesFailed} failed)`);

  progress.phase = 'Building final products';
  const finalProducts = [];

  for (const p of products) {
    if (p.variants.length === 0) {
      progress.warnings.push(`Product ${p.spu} has no variants, skipping`);
      continue;
    }

    const category = detectCategory(p.name);
    const firstVariant = p.variants[0];
    const mainImage = p.images.length > 0 ? p.images[0] : '/cache/images/placeholder.jpg';

    const variants = p.variants.map(v => ({
      sku: v.sku,
      price: roundPrice(v.priceRaw),
      options: v.options,
      image: v.cachedImage || mainImage
    }));

    const basePrice = variants.length > 0 ? 
      Math.min(...variants.map(v => v.price)) : 
      roundPrice(firstVariant.priceRaw);

    finalProducts.push({
      id: p.spu,
      spu: p.spu,
      title: p.name,
      description: generateDescription(p.name, category),
      price: basePrice,
      image: mainImage,
      images: p.images.length > 0 ? p.images : [mainImage],
      variants,
      source: 'CJ',
      warehouse: 'usa',
      is_us: true,
      shipping_fee: 0,
      category,
      active: true,
      link: p.link || ''
    });
  }

  progress.phase = 'Saving to database';
  log(`Built ${finalProducts.length} products with ${totalVariants} total variants`);

  let db = { products: [], orders: [] };
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
      log(`Warning: Could not parse existing db.json, starting fresh`);
    }
  }

  const existingNonCJ = (db.products || []).filter(p => p.source !== 'CJ');
  const existingCJMap = new Map();
  for (const p of (db.products || []).filter(p => p.source === 'CJ')) {
    existingCJMap.set(p.spu, p);
  }

  for (const newProduct of finalProducts) {
    existingCJMap.set(newProduct.spu, newProduct);
  }

  db.products = [...existingNonCJ, ...existingCJMap.values()];

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  log(`Saved ${db.products.length} total products to database`);

  progress.status = 'completed';
  progress.phase = 'Done';

  return {
    success: true,
    productsImported: finalProducts.length,
    variantsTotal: totalVariants,
    imagesCached,
    imagesFailed,
    warnings: progress.warnings
  };
}

function generateImportReport(db) {
  const products = db.products || [];
  const cjProducts = products.filter(p => p.source === 'CJ');

  const report = {
    totalProducts: cjProducts.length,
    totalVariants: 0,
    productsWithoutVariants: [],
    productsWithoutImages: [],
    imageUsageCount: {},
    top20ByVariants: []
  };

  for (const p of cjProducts) {
    const variantCount = (p.variants || []).length;
    report.totalVariants += variantCount;

    if (variantCount === 0) {
      report.productsWithoutVariants.push(p.spu);
    }

    if (!p.image || p.image === '/cache/images/placeholder.jpg') {
      report.productsWithoutImages.push(p.spu);
    }

    for (const v of (p.variants || [])) {
      if (v.image) {
        report.imageUsageCount[v.image] = (report.imageUsageCount[v.image] || 0) + 1;
      }
    }
  }

  report.top20ByVariants = cjProducts
    .map(p => ({ spu: p.spu, title: p.title, variants: (p.variants || []).length }))
    .sort((a, b) => b.variants - a.variants)
    .slice(0, 20);

  const overusedImages = Object.entries(report.imageUsageCount)
    .filter(([img, count]) => count > 10)
    .map(([img, count]) => ({ image: img, count }));

  if (overusedImages.length > 0) {
    report.warnings = [`${overusedImages.length} images used by >10 different variants (possible bug)`];
    report.overusedImages = overusedImages;
  }

  return report;
}

module.exports = {
  importFromXLSX,
  getProgress,
  resetProgress,
  generateImportReport
};
