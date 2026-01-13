const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { getToken } = require("./cjApi");

const CJ_API_BASE = process.env.CJ_API_BASE || "https://developers.cjdropshipping.com";
const DEBUG = process.env.CJ_DEBUG === "true";
const PRODUCTS_FILE = path.join(__dirname, "..", "data", "products.json");
const SYNC_STATUS_FILE = path.join(__dirname, "..", "data", "cj-inventory-sync.json");

let syncInProgress = false;
let lastSyncResult = null;

function httpsRequest(method, url, headers = {}, body = null) {
  const https = require("https");
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "GetPawsy/1.0",
          ...headers
        },
        timeout: 15000
      };

      const req = https.request(urlObj, options, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function fetchProductInventory(token, productId) {
  const endpoints = [
    `${CJ_API_BASE}/api/product/query?pid=${productId}`,
    `${CJ_API_BASE}/api/product/getProductStock?productId=${productId}`,
    `${CJ_API_BASE}/api/product/stock?pid=${productId}`
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await httpsRequest("GET", endpoint, {
        "CJ-Access-Token": token
      });

      if (res.statusCode === 200) {
        try {
          const data = JSON.parse(res.body);
          if (data.result === true || data.code === 200) {
            const productData = data.data || data;
            
            let stock = 0;
            if (productData.stockQuantity !== undefined) {
              stock = productData.stockQuantity;
            } else if (productData.stock !== undefined) {
              stock = productData.stock;
            } else if (productData.variants && Array.isArray(productData.variants)) {
              stock = productData.variants.reduce((sum, v) => sum + (v.stock || v.stockQuantity || 0), 0);
            }
            
            return { success: true, stock, source: endpoint };
          }
        } catch (e) {}
      }
    } catch (err) {
      if (DEBUG) log(`[CJ Sync] Error fetching ${productId}: ${err.message}`);
    }
  }

  return { success: false, stock: null };
}

async function syncInventory(options = {}) {
  if (syncInProgress) {
    return { 
      ok: false, 
      error: "Sync already in progress",
      status: getSyncStatus()
    };
  }

  syncInProgress = true;
  const startTime = Date.now();
  const results = {
    started: new Date().toISOString(),
    total: 0,
    updated: 0,
    failed: 0,
    outOfStock: 0,
    backInStock: 0,
    changes: [],
    errors: []
  };

  try {
    const token = await getToken();
    if (!token) {
      syncInProgress = false;
      return { ok: false, error: "CJ API authentication failed" };
    }

    if (!fs.existsSync(PRODUCTS_FILE)) {
      syncInProgress = false;
      return { ok: false, error: "Products file not found" };
    }

    const productsData = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
    const products = productsData.products || [];
    
    const cjProducts = products.filter(p => p.cjProductId && p.active !== false);
    results.total = cjProducts.length;

    log(`[CJ Sync] Starting inventory sync for ${cjProducts.length} products`);

    const batchSize = options.batchSize || 10;
    const delayMs = options.delayMs || 500;

    for (let i = 0; i < cjProducts.length; i += batchSize) {
      const batch = cjProducts.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (product) => {
        try {
          const result = await fetchProductInventory(token, product.cjProductId);
          
          if (result.success && result.stock !== null) {
            const oldStock = product.stock || 0;
            const newStock = result.stock;
            
            if (oldStock !== newStock) {
              const productIndex = products.findIndex(p => p.id === product.id);
              if (productIndex !== -1) {
                products[productIndex].stock = newStock;
                products[productIndex].lastStockSync = new Date().toISOString();
                
                results.updated++;
                results.changes.push({
                  id: product.id,
                  name: product.name?.slice(0, 50),
                  oldStock,
                  newStock
                });

                if (oldStock > 0 && newStock === 0) {
                  results.outOfStock++;
                } else if (oldStock === 0 && newStock > 0) {
                  results.backInStock++;
                }
              }
            }
          } else {
            results.failed++;
            if (results.errors.length < 20) {
              results.errors.push({
                id: product.id,
                cjProductId: product.cjProductId,
                error: "Failed to fetch stock"
              });
            }
          }
        } catch (err) {
          results.failed++;
          if (results.errors.length < 20) {
            results.errors.push({
              id: product.id,
              error: err.message
            });
          }
        }
      }));

      if (i + batchSize < cjProducts.length) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    productsData.products = products;
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(productsData, null, 2));

    results.completed = new Date().toISOString();
    results.durationMs = Date.now() - startTime;

    saveSyncStatus(results);
    lastSyncResult = results;

    log(`[CJ Sync] Completed: ${results.updated} updated, ${results.outOfStock} now OOS, ${results.failed} failed`);

    syncInProgress = false;
    return { ok: true, results };

  } catch (err) {
    syncInProgress = false;
    log(`[CJ Sync] Fatal error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

function saveSyncStatus(results) {
  try {
    const dir = path.dirname(SYNC_STATUS_FILE);
    fs.mkdirSync(dir, { recursive: true });
    
    let history = [];
    if (fs.existsSync(SYNC_STATUS_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(SYNC_STATUS_FILE, "utf-8"));
        history = data.history || [];
      } catch (e) {}
    }

    history.unshift({
      ...results,
      changes: results.changes.slice(0, 50)
    });
    history = history.slice(0, 20);

    fs.writeFileSync(SYNC_STATUS_FILE, JSON.stringify({
      lastSync: results.completed,
      lastResult: {
        total: results.total,
        updated: results.updated,
        failed: results.failed,
        outOfStock: results.outOfStock,
        backInStock: results.backInStock,
        durationMs: results.durationMs
      },
      history
    }, null, 2));
  } catch (e) {
    log(`[CJ Sync] Error saving status: ${e.message}`);
  }
}

function getSyncStatus() {
  try {
    if (fs.existsSync(SYNC_STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SYNC_STATUS_FILE, "utf-8"));
      return {
        ...data,
        inProgress: syncInProgress
      };
    }
  } catch (e) {}
  
  return {
    lastSync: null,
    lastResult: null,
    history: [],
    inProgress: syncInProgress
  };
}

function getOutOfStockProducts() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) return [];
    
    const productsData = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
    const products = productsData.products || [];
    
    return products
      .filter(p => p.active !== false && (p.stock === 0 || p.stock === undefined))
      .map(p => ({
        id: p.id,
        name: p.name?.slice(0, 60),
        slug: p.slug,
        cjProductId: p.cjProductId,
        lastStockSync: p.lastStockSync
      }));
  } catch (e) {
    return [];
  }
}

module.exports = {
  syncInventory,
  getSyncStatus,
  getOutOfStockProducts
};
