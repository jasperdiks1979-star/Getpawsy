/**
 * NO-FALLBACK CONTRACT v1.0
 * 
 * This module enforces that GetPawsy never uses fallback/mock/demo products.
 * All products MUST come from the CJ Dropshipping API and be stored in products_cj.json.
 * 
 * FORBIDDEN PATTERNS:
 * - Hardcoded product arrays (staticProducts, defaultProducts, demoProducts, mockProducts)
 * - Fallback patterns: "products || fallbackArray" or "data?.length ? data : fallback"
 * - Mock JSON files for products in production
 * - Demo/seed data being served to users
 * 
 * ALLOWED:
 * - products_cj.json as the ONLY product source
 * - Empty arrays when no products match filters (show "No products available")
 * - Debug endpoints returning sample data for inspection only
 */

const fs = require('fs');
const path = require('path');

const CONTRACT_VERSION = '1.0.0';
const PRIMARY_PRODUCT_SOURCE = 'data/products_cj.json';

const FORBIDDEN_PATTERNS = [
  'defaultProducts',
  'staticProducts', 
  'demoProducts',
  'mockProducts',
  'fallbackProducts',
  'seedProducts',
  'testProducts'
];

const ALLOWED_EXCEPTIONS = [
  'sampleProducts',
  'qa-reports',
  'attached_assets',
  'node_modules',
  '.git'
];

function validateProductSource() {
  const sourcePath = path.join(process.cwd(), PRIMARY_PRODUCT_SOURCE);
  
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`[NO-FALLBACK CONTRACT] PRIMARY PRODUCT SOURCE MISSING: ${PRIMARY_PRODUCT_SOURCE}`);
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    const products = data.products || data;
    
    if (!Array.isArray(products)) {
      throw new Error('[NO-FALLBACK CONTRACT] Product source must contain an array');
    }
    
    if (products.length === 0) {
      console.warn('[NO-FALLBACK CONTRACT] WARNING: Product source is empty');
    }
    
    return {
      valid: true,
      source: PRIMARY_PRODUCT_SOURCE,
      productCount: products.length,
      contractVersion: CONTRACT_VERSION
    };
  } catch (err) {
    throw new Error(`[NO-FALLBACK CONTRACT] Failed to parse product source: ${err.message}`);
  }
}

function assertNoFallback(products, context = 'unknown') {
  if (!products || !Array.isArray(products)) {
    console.error(`[NO-FALLBACK CONTRACT] VIOLATION in ${context}: products is not an array`);
    return [];
  }
  
  if (products.length === 0) {
    console.log(`[NO-FALLBACK CONTRACT] ${context}: Empty product list (no fallback used)`);
    return [];
  }
  
  const hasValidCjId = products.every(p => {
    const id = p.id || p.cjProductId || p.cjPid;
    return id && (String(id).startsWith('cj-') || /^\d{15,}$/.test(String(id)));
  });
  
  if (!hasValidCjId) {
    const invalidProducts = products.filter(p => {
      const id = p.id || p.cjProductId || p.cjPid;
      return !id || (!String(id).startsWith('cj-') && !/^\d{15,}$/.test(String(id)));
    });
    
    console.error(`[NO-FALLBACK CONTRACT] VIOLATION in ${context}: ${invalidProducts.length} products without valid CJ IDs`);
    
    if (process.env.NODE_ENV === 'production') {
      return products.filter(p => {
        const id = p.id || p.cjProductId || p.cjPid;
        return id && (String(id).startsWith('cj-') || /^\d{15,}$/.test(String(id)));
      });
    } else {
      throw new Error(`[NO-FALLBACK CONTRACT] ${invalidProducts.length} products without valid CJ IDs in ${context}`);
    }
  }
  
  return products;
}

module.exports = {
  CONTRACT_VERSION,
  PRIMARY_PRODUCT_SOURCE,
  FORBIDDEN_PATTERNS,
  ALLOWED_EXCEPTIONS,
  validateProductSource,
  assertNoFallback
};
