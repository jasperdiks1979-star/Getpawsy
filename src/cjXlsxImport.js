const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CACHE_DIR = path.join(__dirname, '../public/cache/images');
const DB_PATH = path.join(__dirname, '../data/db.json');
const CJ_API_KEY = process.env.CJ_API_KEY || '';

const MARKUP = 2.2;
const BATCH_SIZE = 50;
const IMAGE_TIMEOUT = 15000;

let progress = {
  status: 'idle',
  total: 0,
  processed: 0,
  usRows: 0,
  uniqueSpus: 0,
  cachedImages: 0,
  failedImages: 0,
  errors: [],
  startTime: null
};

function getProgress() {
  return { ...progress };
}

function resetProgress() {
  progress = {
    status: 'idle',
    total: 0,
    processed: 0,
    usRows: 0,
    uniqueSpus: 0,
    cachedImages: 0,
    failedImages: 0,
    errors: [],
    startTime: null
  };
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[CJ-XLSX ${ts}] ${msg}`);
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
  const price = cost * MARKUP;
  return Math.floor(price) + 0.99;
}

async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') {
      return reject(new Error('Invalid URL'));
    }
    
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      return reject(new Error('URL must start with http'));
    }

    const protocol = cleanUrl.startsWith('https') ? https : http;
    const filepath = path.join(CACHE_DIR, filename);

    if (fs.existsSync(filepath)) {
      return resolve(`/cache/images/${filename}`);
    }

    const request = protocol.get(cleanUrl, { timeout: IMAGE_TIMEOUT }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadImage(res.headers.location, filename).then(resolve).catch(reject);
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

function parseXlsx(filePath) {
  log(`Reading XLSX: ${filePath}`);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  if (rawData.length < 3) {
    throw new Error('XLSX has too few rows');
  }
  
  log(`Raw rows: ${rawData.length}`);
  
  let headerRow = rawData[1];
  let dataStartRow = 2;
  
  if (!headerRow || headerRow.every(c => !c)) {
    headerRow = rawData[0];
    dataStartRow = 1;
  }
  
  const headers = headerRow.map((h, i) => {
    const str = String(h || '').trim().toLowerCase();
    return { index: i, name: str, original: String(h || '') };
  });
  
  log(`Headers found: ${headers.filter(h => h.name).map(h => h.original).join(', ')}`);
  
  const findCol = (patterns, exact = false) => {
    for (const p of patterns) {
      const pLower = p.toLowerCase();
      const found = headers.find(h => {
        if (exact) {
          return h.name === pLower;
        }
        return h.name.includes(pLower);
      });
      if (found) return found.index;
    }
    return -1;
  };
  
  const cols = {
    name: findCol(['lists', 'products name', 'product name', 'name', 'title']),
    spu: findCol(['spu'], true),
    sku: findCol(['sku'], true),
    link: findCol(['product link', 'link']),
    price: findCol(['product unit price after discount', 'sku unit price after discount', 'price after discount', 'unit price']),
    shipping: findCol(['shipping from', 'warehouse', 'ship from']),
    shippingMethod: findCol(['shipping method', 'method']),
    deliveryTime: findCol(['delivery time', 'delivery']),
    spec1: findCol(['specification attribute 1', 'spec 1', 'attribute 1']),
    spec1Val: findCol(['specification attribute value 1', 'spec value 1', 'value 1']),
    spec2: findCol(['specification attribute 2', 'spec 2', 'attribute 2']),
    spec2Val: findCol(['specification attribute value 2', 'spec value 2', 'value 2']),
    skuImage: findCol(['sku image'], true),
    image: findCol(['product image', 'image url', 'img url', 'picture url'])
  };
  
  log(`Column mapping: name=${cols.name}, spu=${cols.spu}, sku=${cols.sku}, skuImage=${cols.skuImage}, price=${cols.price}, shipping=${cols.shipping}, image=${cols.image}`);
  
  const rows = [];
  for (let i = dataStartRow; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.every(c => !c)) continue;
    
    const getValue = (colIdx) => colIdx >= 0 && row[colIdx] !== undefined ? String(row[colIdx]).trim() : '';
    const getNumber = (colIdx) => {
      const val = getValue(colIdx);
      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
      return isNaN(num) ? 0 : num;
    };
    
    rows.push({
      name: getValue(cols.name),
      spu: getValue(cols.spu),
      sku: getValue(cols.sku),
      link: getValue(cols.link),
      price: getNumber(cols.price),
      shipping: getValue(cols.shipping),
      shippingMethod: getValue(cols.shippingMethod),
      deliveryTime: getValue(cols.deliveryTime),
      spec1: getValue(cols.spec1),
      spec1Val: getValue(cols.spec1Val),
      spec2: getValue(cols.spec2),
      spec2Val: getValue(cols.spec2Val),
      image: getValue(cols.image),
      skuImage: getValue(cols.skuImage)
    });
  }
  
  log(`Parsed ${rows.length} data rows`);
  return rows;
}

function extractImageUrl(row) {
  if (row.image && row.image.startsWith('http')) {
    return row.image;
  }
  
  if (row.skuImage && row.skuImage.startsWith('http')) {
    return row.skuImage;
  }
  
  return null;
}

async function fetchCjProductDetail(spu, token) {
  if (!token) {
    return null;
  }
  
  try {
    const response = await new Promise((resolve, reject) => {
      const postData = JSON.stringify({ productSpu: spu });
      const options = {
        hostname: 'developers.cjdropshipping.com',
        port: 443,
        path: '/api2.0/v1/product/query',
        method: 'POST',
        headers: {
          'CJ-Access-Token': token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      
      req.write(postData);
      req.end();
    });
    
    if (response.code === 200 && response.data) {
      return response.data;
    }
    
    if (response.message) {
      log(`CJ API error for ${spu}: ${response.message}`);
    }
  } catch (err) {
    log(`CJ API request failed for ${spu}: ${err.message}`);
  }
  
  return null;
}

async function fetchCjProductImages(productLink, cjToken) {
  if (!productLink) return [];
  
  const pidMatch = productLink.match(/\/product\/([A-Z0-9]+)/i);
  if (!pidMatch) return [];
  
  const pid = pidMatch[1];
  
  try {
    const response = await new Promise((resolve, reject) => {
      const url = `https://developers.cjdropshipping.com/api2.0/v1/product/query?pid=${pid}`;
      const options = {
        headers: {
          'CJ-Access-Token': cjToken || process.env.CJ_API_KEY || '',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      };
      
      https.get(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
    
    if (response.data && response.data.productImage) {
      const images = Array.isArray(response.data.productImage) 
        ? response.data.productImage 
        : [response.data.productImage];
      return images.filter(img => img && img.startsWith('http'));
    }
  } catch (err) {
    log(`CJ API failed for ${pid}: ${err.message}`);
  }
  
  return [];
}

async function importXlsx(filePath, options = {}) {
  resetProgress();
  progress.status = 'parsing';
  progress.startTime = Date.now();
  
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  
  let rows;
  try {
    rows = parseXlsx(filePath);
  } catch (err) {
    progress.status = 'error';
    progress.errors.push(`Parse error: ${err.message}`);
    throw err;
  }
  
  progress.total = rows.length;
  
  const usRows = rows.filter(r => {
    const ship = (r.shipping || '').toLowerCase();
    return ship.includes('us') || ship.includes('united states') || ship === '';
  });
  
  progress.usRows = usRows.length;
  log(`US warehouse rows: ${usRows.length} / ${rows.length}`);
  
  progress.status = 'grouping';
  const spuGroups = {};
  
  for (const row of usRows) {
    const spu = row.spu || row.sku || `gen-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    if (!spuGroups[spu]) {
      spuGroups[spu] = {
        spu,
        name: row.name,
        link: row.link,
        rows: []
      };
    }
    spuGroups[spu].rows.push(row);
  }
  
  const spuList = Object.values(spuGroups);
  progress.uniqueSpus = spuList.length;
  log(`Unique SPUs: ${spuList.length}`);
  
  progress.status = 'processing';
  const products = [];
  
  const cjToken = CJ_API_KEY;
  if (cjToken) {
    log(`Using CJ API key for image fetching`);
  } else {
    log(`No CJ_API_KEY set - products will be imported without images`);
  }
  
  for (let i = 0; i < spuList.length; i++) {
    const group = spuList[i];
    progress.processed = i + 1;
    
    try {
      const name = group.name || `Product ${group.spu}`;
      const category = detectCategory(name);
      
      const variants = group.rows.map((row, idx) => {
        let optionName = 'Default';
        if (row.spec1Val) {
          optionName = row.spec1Val;
          if (row.spec2Val) optionName += ` / ${row.spec2Val}`;
        }
        
        const cost = row.price || 5;
        const salePrice = roundPrice(cost);
        
        return {
          sku: row.sku || `${group.spu}-${idx}`,
          name: optionName,
          price: salePrice,
          cost: cost,
          stock: 100
        };
      });
      
      const basePrice = variants.length > 0 ? Math.min(...variants.map(v => v.price)) : 9.99;
      
      let images = [];
      let mainImage = null;
      
      for (const row of group.rows) {
        const imgUrl = extractImageUrl(row);
        if (imgUrl) {
          const ext = imgUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
          const filename = `cj-${group.spu}-${images.length}.${ext}`.replace(/[^a-zA-Z0-9.-]/g, '_');
          
          try {
            const localPath = await downloadImage(imgUrl, filename);
            images.push(localPath);
            progress.cachedImages++;
          } catch (err) {
            progress.failedImages++;
            log(`Image failed: ${imgUrl} - ${err.message}`);
          }
        }
      }
      
      if (images.length === 0 && cjToken) {
        log(`Trying CJ API for ${group.spu}...`);
        const productDetail = await fetchCjProductDetail(group.spu, cjToken);
        
        if (productDetail) {
          let cjImages = [];
          
          if (productDetail.productImage) {
            cjImages = Array.isArray(productDetail.productImage) 
              ? productDetail.productImage 
              : productDetail.productImage.split(';').filter(u => u.startsWith('http'));
          }
          
          if (productDetail.productImageSet && Array.isArray(productDetail.productImageSet)) {
            cjImages = [...cjImages, ...productDetail.productImageSet.filter(u => u && u.startsWith('http'))];
          }
          
          for (let j = 0; j < Math.min(cjImages.length, 3); j++) {
            const imgUrl = cjImages[j];
            if (!imgUrl) continue;
            const ext = imgUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
            const filename = `cj-${group.spu}-${j}.${ext}`.replace(/[^a-zA-Z0-9.-]/g, '_');
            
            try {
              const localPath = await downloadImage(imgUrl, filename);
              images.push(localPath);
              progress.cachedImages++;
            } catch (err) {
              progress.failedImages++;
            }
          }
          
          if (productDetail.productNameEn && !group.name) {
            group.name = productDetail.productNameEn;
          }
        }
      }
      
      mainImage = images.length > 0 ? images[0] : '/img/placeholder.svg';
      const isActive = images.length > 0;
      
      const description = `Premium quality ${name.toLowerCase()}. ${category.includes('dog') ? 'Perfect for your canine companion.' : category.includes('cat') ? 'Ideal for your feline friend.' : 'Great for all pets.'} Fast US shipping available.`;
      
      products.push({
        id: `cj-${group.spu}`,
        title: name,
        description: description,
        category: category,
        price: basePrice,
        image: mainImage,
        images: images,
        variants: variants,
        source: 'CJ',
        spu: group.spu,
        warehouse: 'US',
        currency: 'USD',
        cjLink: group.link,
        shippingMethod: group.rows[0]?.shippingMethod || '',
        deliveryTime: group.rows[0]?.deliveryTime || '7-15 days',
        active: isActive,
        importedAt: new Date().toISOString()
      });
      
      if (!isActive) {
        progress.errors.push(`${group.spu}: No valid images - marked inactive`);
      }
      
    } catch (err) {
      progress.errors.push(`${group.spu}: ${err.message}`);
      log(`Error processing ${group.spu}: ${err.message}`);
    }
    
    if (i > 0 && i % BATCH_SIZE === 0) {
      log(`Progress: ${i}/${spuList.length} products processed`);
    }
  }
  
  progress.status = 'saving';
  log(`Saving ${products.length} products to database...`);
  
  let db = { products: [], categories: [] };
  try {
    if (fs.existsSync(DB_PATH)) {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (err) {
    log(`DB read error: ${err.message}`);
  }
  
  const existingIds = new Set(db.products.map(p => p.id));
  let updated = 0;
  let added = 0;
  
  for (const product of products) {
    const existingIdx = db.products.findIndex(p => p.id === product.id || p.spu === product.spu);
    if (existingIdx >= 0) {
      db.products[existingIdx] = { ...db.products[existingIdx], ...product };
      updated++;
    } else {
      db.products.push(product);
      added++;
    }
  }
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  
  progress.status = 'complete';
  
  const activeCount = products.filter(p => p.active).length;
  const inactiveCount = products.filter(p => !p.active).length;
  
  const report = {
    status: 'success',
    totalRows: rows.length,
    usRows: usRows.length,
    uniqueSpus: spuList.length,
    productsCreated: added,
    productsUpdated: updated,
    activeProducts: activeCount,
    inactiveProducts: inactiveCount,
    cachedImages: progress.cachedImages,
    failedImages: progress.failedImages,
    errors: progress.errors.slice(0, 10),
    duration: `${((Date.now() - progress.startTime) / 1000).toFixed(1)}s`
  };
  
  log(`Import complete: ${JSON.stringify(report)}`);
  return report;
}

module.exports = {
  importXlsx,
  getProgress,
  resetProgress
};
