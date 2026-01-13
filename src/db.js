const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");
const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const PRODUCTS_CJ_PATH = path.join(__dirname, "..", "data", "products_cj.json");

function ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ products: [] }, null, 2));
}

function read() {
  ensureFile();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function write(data) {
  ensureFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function loadCatalogProducts() {
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
      const products = data.products || [];
      if (products.length > 0) {
        console.log('[db] Loaded', products.length, 'products from catalog.json');
        return products.map(p => ({
          ...p,
          petType: p.petType || p.pet_type
        }));
      }
    } catch (e) {
      console.warn('[db] Error reading catalog.json:', e.message);
    }
  }
  
  if (fs.existsSync(PRODUCTS_CJ_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(PRODUCTS_CJ_PATH, 'utf-8'));
      const products = data.products || [];
      console.log('[db] Fallback: loaded', products.length, 'products from products_cj.json');
      return products.map(p => ({
        ...p,
        petType: p.petType || p.pet_type
      }));
    } catch (e) {
      console.warn('[db] Error reading products_cj.json:', e.message);
    }
  }
  
  return [];
}

const db = {
  async init() { ensureFile(); },

  async listProducts() {
    const catalogProducts = loadCatalogProducts();
    if (catalogProducts.length > 0) {
      return catalogProducts;
    }
    const d = read();
    if (d.products && d.products.length > 0) {
      return d.products;
    }
    return [];
  },

  async getProduct(id) {
    // Check db.json first
    const d = read();
    let product = (d.products || []).find(p => p.id === id);
    if (product) return product;
    
    // Fallback: check products_cj.json (API-only mode)
    if (fs.existsSync(PRODUCTS_CJ_PATH)) {
      try {
        const cjData = JSON.parse(fs.readFileSync(PRODUCTS_CJ_PATH, 'utf-8'));
        // Handle both formats: {products: [...]} and direct array [...]
        const cjProducts = Array.isArray(cjData) ? cjData : (cjData.products || []);
        product = cjProducts.find(p => String(p.id) === String(id) || String(p.cj_pid) === String(id));
        if (product) return product;
      } catch (e) {
        console.warn('[db] Error reading products_cj.json:', e.message);
      }
    }
    
    return null;
  },

  async upsertProducts(items) {
    const d = read();
    const byId = new Map((d.products || []).map(p => [p.id, p]));
    for (const it of items) byId.set(it.id, it);
    d.products = Array.from(byId.values());
    write(d);
    return d.products;
  },

  async updateProduct(id, updates) {
    const d = read();
    const idx = (d.products || []).findIndex(p => p.id === id);
    if (idx === -1) return null;
    d.products[idx] = { ...d.products[idx], ...updates };
    write(d);
    return d.products[idx];
  },

  async updateProducts(ids, updates) {
    const d = read();
    let count = 0;
    for (const id of ids) {
      const idx = (d.products || []).findIndex(p => p.id === id);
      if (idx !== -1) {
        d.products[idx] = { ...d.products[idx], ...updates };
        count++;
      }
    }
    write(d);
    return count;
  }
};

module.exports = { db };
