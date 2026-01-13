const fs = require('fs');
const path = require('path');
const https = require('https');

const CATALOG_FILE = path.join(process.cwd(), 'data', 'catalog.json');
const COST_CACHE_FILE = path.join(process.cwd(), 'data', 'cj_cost_cache.json');
const AUDIT_FILE = path.join(process.cwd(), 'data', 'cj_cost_audit.jsonl');
const EXPORT_DIR = path.join(process.cwd(), 'public', 'downloads');

const CJ_API_BASE = process.env.CJ_API_BASE || 'https://developers.cjdropshipping.com';
const CJ_API_KEY = process.env.CJ_API_KEY || '';
const MAX_CONCURRENCY = 2;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;

let syncStatus = {
  running: false,
  progress: 0,
  total: 0,
  successes: 0,
  failures: 0,
  lastRun: null,
  errors: []
};

function loadCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) {
    return { products: [], buildInfo: {} };
  }
  return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
}

function saveCatalog(catalog) {
  const tempPath = CATALOG_FILE + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(catalog, null, 2));
  fs.renameSync(tempPath, CATALOG_FILE);
}

function loadCostCache() {
  if (!fs.existsSync(COST_CACHE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(COST_CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCostCache(cache) {
  fs.writeFileSync(COST_CACHE_FILE, JSON.stringify(cache, null, 2));
}

function parsePrice(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;
  const str = String(value).replace(/[^0-9.,]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions = {
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            'CJ-Access-Token': CJ_API_KEY,
            ...options.headers
          },
          timeout: 15000
        };
        
        const req = https.request(urlObj, reqOptions, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode, body: data });
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        
        if (options.body) {
          req.write(JSON.stringify(options.body));
        }
        req.end();
      });
      
      if (response.statusCode === 429) {
        const backoff = Math.pow(2, attempt) * 1000;
        await sleep(backoff);
        continue;
      }
      
      if (response.statusCode >= 500) {
        const backoff = Math.pow(2, attempt) * 1000;
        await sleep(backoff);
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  throw new Error('Max retries exceeded');
}

async function fetchCjProductDetails(cjProductId) {
  if (!CJ_API_KEY) {
    throw new Error('CJ_API_KEY not configured');
  }
  
  const url = `${CJ_API_BASE}/api/product/query?pid=${cjProductId}`;
  const response = await fetchWithRetry(url, { method: 'GET' });
  
  if (response.statusCode !== 200) {
    throw new Error(`CJ API error: ${response.statusCode}`);
  }
  
  const data = JSON.parse(response.body);
  if (!data.result || data.code !== 200) {
    throw new Error(data.message || 'CJ API returned no result');
  }
  
  return data.data;
}

function extractCost(cjData) {
  const costFields = [
    'wholesalePrice', 'wholesale_price',
    'sourcePrice', 'source_price',
    'supplyPrice', 'supply_price',
    'purchasePrice', 'purchase_price',
    'costPrice', 'cost_price',
    'sellPrice', 'sell_price'
  ];
  
  let cost = null;
  let source = null;
  let currency = 'USD';
  
  for (const field of costFields) {
    const value = cjData[field];
    if (value !== undefined && value !== null) {
      const parsed = parsePrice(value);
      if (parsed !== null && parsed > 0) {
        cost = parsed;
        source = field;
        break;
      }
    }
  }
  
  if (cjData.variants && Array.isArray(cjData.variants)) {
    const variantCosts = [];
    for (const variant of cjData.variants) {
      for (const field of costFields) {
        const value = variant[field];
        if (value !== undefined && value !== null) {
          const parsed = parsePrice(value);
          if (parsed !== null && parsed > 0) {
            variantCosts.push({
              vid: variant.vid || variant.variantId || variant.variant_id,
              sku: variant.sku || variant.variantSku,
              cost: parsed,
              source: field
            });
            break;
          }
        }
      }
    }
    if (variantCosts.length > 0) {
      return { cost, source, currency, variantCosts };
    }
  }
  
  if (source === 'sellPrice' || source === 'sell_price') {
    source = 'sellPrice_fallback';
  }
  
  return { cost, source, currency, variantCosts: [] };
}

async function syncAllCjCosts({ dryRun = true, limit = null }) {
  if (syncStatus.running) {
    return { ok: false, error: 'Sync already in progress' };
  }
  
  syncStatus = {
    running: true,
    progress: 0,
    total: 0,
    successes: 0,
    failures: 0,
    lastRun: new Date().toISOString(),
    errors: []
  };
  
  const catalog = loadCatalog();
  const products = catalog.products || [];
  const costCache = loadCostCache();
  
  const productsWithCj = products.filter(p => p.cj_product_id || p.cj_spu);
  syncStatus.total = limit ? Math.min(limit, productsWithCj.length) : productsWithCj.length;
  
  const results = {
    dryRun,
    timestamp: new Date().toISOString(),
    totalProducts: products.length,
    productsWithCj: productsWithCj.length,
    processed: 0,
    updated: 0,
    variantsUpdated: 0,
    failed: 0,
    errors: [],
    csvPath: null
  };
  
  const csvRows = [['product_id', 'cj_product_id', 'cost', 'currency', 'source', 'variants_updated', 'status']];
  
  const toProcess = limit ? productsWithCj.slice(0, limit) : productsWithCj;
  
  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    const cjId = product.cj_product_id || product.cj_spu;
    
    syncStatus.progress = i + 1;
    
    try {
      const cjData = await fetchCjProductDetails(cjId);
      const costInfo = extractCost(cjData);
      
      if (costInfo.cost !== null) {
        if (!dryRun) {
          product.cost = costInfo.cost;
          product.cj_cost_source = costInfo.source;
          product.cj_cost_currency = costInfo.currency;
          product.cj_cost_last_synced = results.timestamp;
          
          if (costInfo.variantCosts.length > 0 && product.variants) {
            for (const vc of costInfo.variantCosts) {
              const variant = product.variants.find(v => 
                v.vid === vc.vid || v.sku === vc.sku || v.cj_sku === vc.sku
              );
              if (variant) {
                variant.cost = vc.cost;
                variant.cj_cost_source = vc.source;
                results.variantsUpdated++;
              }
            }
          }
        }
        
        results.updated++;
        syncStatus.successes++;
        
        csvRows.push([
          product.product_id,
          cjId,
          costInfo.cost,
          costInfo.currency,
          costInfo.source,
          costInfo.variantCosts.length,
          'success'
        ]);
        
        costCache[cjId] = {
          cost: costInfo.cost,
          source: costInfo.source,
          currency: costInfo.currency,
          fetchedAt: results.timestamp,
          rawResponse: cjData
        };
      } else {
        results.failed++;
        syncStatus.failures++;
        results.errors.push({ product_id: product.product_id, error: 'No cost found in CJ response' });
        csvRows.push([product.product_id, cjId, '', '', '', 0, 'no_cost']);
      }
    } catch (error) {
      results.failed++;
      syncStatus.failures++;
      results.errors.push({ product_id: product.product_id, error: error.message });
      syncStatus.errors.push({ product_id: product.product_id, error: error.message });
      csvRows.push([product.product_id, cjId, '', '', '', 0, `error: ${error.message}`]);
    }
    
    results.processed++;
    
    if (i < toProcess.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }
  
  if (!dryRun && results.updated > 0) {
    catalog.buildInfo = catalog.buildInfo || {};
    catalog.buildInfo.lastCjCostSync = results.timestamp;
    catalog.buildInfo.cjCostSyncStats = {
      updated: results.updated,
      variantsUpdated: results.variantsUpdated,
      failed: results.failed
    };
    
    saveCatalog(catalog);
    saveCostCache(costCache);
    
    const auditEntry = {
      timestamp: results.timestamp,
      dryRun,
      processed: results.processed,
      updated: results.updated,
      variantsUpdated: results.variantsUpdated,
      failed: results.failed
    };
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(auditEntry) + '\n');
  }
  
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
  const csvPath = path.join(EXPORT_DIR, 'getpawsy_cj_cost_export.csv');
  const csvContent = csvRows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(csvPath, csvContent);
  results.csvPath = '/downloads/getpawsy_cj_cost_export.csv';
  
  syncStatus.running = false;
  
  return { ok: true, ...results };
}

function getSyncStatus() {
  return { ...syncStatus };
}

module.exports = {
  syncAllCjCosts,
  getSyncStatus,
  fetchCjProductDetails,
  extractCost
};
