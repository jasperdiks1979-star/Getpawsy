/**
 * Admin Pricing & CSV Export/Import Routes
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { requireAdminSession } = require('../src/adminAuth');
const { computeSuggestedPrice, validatePrice, normalizePrice, getRoundingRule } = require('../server/pricing/pricing-engine');
const { isExcludedProduct, getExcludedReason } = require('../server/utils/excludedProducts');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const AUDIT_LOG_PATH = path.join(__dirname, '..', 'data', 'price-audit.json');

// Multer setup for CSV file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

function loadCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    return data.products || data || [];
  } catch (err) {
    console.error('[Admin Pricing] Failed to load catalog:', err.message);
    return [];
  }
}

function saveCatalog(products) {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    if (data.products) {
      data.products = products;
    } else {
      return fs.writeFileSync(CATALOG_PATH, JSON.stringify(products, null, 2));
    }
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('[Admin Pricing] Failed to save catalog:', err.message);
    return false;
  }
}

function loadAuditLog() {
  try {
    if (fs.existsSync(AUDIT_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, 'utf-8'));
    }
  } catch (err) {}
  return [];
}

function appendAuditLog(entries) {
  const log = loadAuditLog();
  log.push(...entries);
  const recent = log.slice(-10000);
  fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(recent, null, 2));
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function parseCSVLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Helper to check if a product is a valid pet product for repricing
function isValidPetProduct(product) {
  if (!product) return false;
  if (product.active === false) return false;
  if (product.blocked === true) return false;
  
  // Check exclusion rules
  if (isExcludedProduct(product)) return false;
  
  // Must have a valid pet type
  const petType = (product.pet_type || product.petType || '').toLowerCase();
  if (!['dog', 'cat', 'small_pet', 'both'].includes(petType)) {
    // Allow if it has pet-related category
    const category = (product.mainCategorySlug || product.category || '').toLowerCase();
    const petCategories = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'small-pet'];
    if (!petCategories.some(c => category.includes(c))) {
      return false;
    }
  }
  
  return true;
}

router.get('/products/export.csv', requireAdminSession, (req, res) => {
  try {
    const products = loadCatalog();
    
    const headers = [
      'product_id', 'slug', 'title', 'category_slug', 'pet_type', 'subcategory',
      'variant_id', 'variant_sku', 'variant_title',
      'cost', 'price', 'old_price', 'suggested_price', 'multiplier', 'rounding_rule',
      'active', 'cj_product_url', 'image_url'
    ];
    
    const rows = [headers.join(',')];
    
    for (const product of products) {
      const baseCost = parseFloat(product.costPrice) || 0;
      const basePrice = parseFloat(product.price) || 0;
      const categorySlug = product.mainCategorySlug || product.categories?.[0] || '';
      const suggested = computeSuggestedPrice({ cost: baseCost, categorySlug });
      
      const cjUrl = product.id ? `https://cjdropshipping.com/product/${product.id}` : '';
      const imageUrl = product.images?.[0] || product.originalImages?.[0] || '';
      
      if (!product.variants || product.variants.length === 0) {
        const row = [
          escapeCSV(product.id),
          escapeCSV(product.slug),
          escapeCSV(product.title),
          escapeCSV(categorySlug),
          escapeCSV(product.pet_type || product.petType || ''),
          escapeCSV(product.subcategorySlug || ''),
          '', '', '',
          baseCost.toFixed(2),
          basePrice.toFixed(2),
          (parseFloat(product.oldPrice) || 0).toFixed(2),
          suggested.suggestedPrice?.toFixed(2) || '',
          suggested.multiplier?.toFixed(2) || '',
          escapeCSV(suggested.roundingRule || ''),
          product.active !== false ? 'true' : 'false',
          escapeCSV(cjUrl),
          escapeCSV(imageUrl)
        ];
        rows.push(row.join(','));
      } else {
        for (const variant of product.variants) {
          const varCost = parseFloat(variant.costPrice) || baseCost;
          const varPrice = parseFloat(variant.price) || basePrice;
          const varSuggested = computeSuggestedPrice({ cost: varCost, categorySlug });
          
          const row = [
            escapeCSV(product.id),
            escapeCSV(product.slug),
            escapeCSV(product.title),
            escapeCSV(categorySlug),
            escapeCSV(product.pet_type || product.petType || ''),
            escapeCSV(product.subcategorySlug || ''),
            escapeCSV(variant.vid || variant.id || ''),
            escapeCSV(variant.variantSku || variant.sku || ''),
            escapeCSV(variant.variantName || variant.title || ''),
            varCost.toFixed(2),
            varPrice.toFixed(2),
            (parseFloat(product.oldPrice) || 0).toFixed(2),
            varSuggested.suggestedPrice?.toFixed(2) || '',
            varSuggested.multiplier?.toFixed(2) || '',
            escapeCSV(varSuggested.roundingRule || ''),
            product.active !== false ? 'true' : 'false',
            escapeCSV(cjUrl),
            escapeCSV(imageUrl)
          ];
          rows.push(row.join(','));
        }
      }
    }
    
    const csv = rows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="getpawsy-products-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
    
    console.log(`[Admin Pricing] Exported ${products.length} products, ${rows.length - 1} rows`);
  } catch (err) {
    console.error('[Admin Pricing] Export error:', err);
    res.status(500).json({ error: 'Export failed', message: err.message });
  }
});

// Helper function to find column index (case-insensitive, supports multiple names)
function findColumnIndex(headers, ...names) {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  for (const name of names) {
    const idx = lowerHeaders.indexOf(name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

// Helper to safely coerce a value to string, handling large numeric IDs
function safeString(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// Helper to safely parse numeric values (handles string or number input)
function safeNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim().replace(/[€$£,]/g, '');
  const num = parseFloat(str);
  return isFinite(num) ? num : null;
}

// Helper to safely parse boolean values
function safeBoolean(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  const str = String(val).toLowerCase().trim();
  if (['true', '1', 'yes', 'active', 'on'].includes(str)) return true;
  if (['false', '0', 'no', 'inactive', 'off'].includes(str)) return false;
  return null;
}

// Helper to strip UTF-8 BOM and detect delimiter
function preprocessCSV(csvData) {
  let bomStripped = false;
  let data = csvData;
  
  // Strip UTF-8 BOM (EF BB BF or \uFEFF)
  if (data.charCodeAt(0) === 0xFEFF) {
    data = data.slice(1);
    bomStripped = true;
  } else if (data.startsWith('\xEF\xBB\xBF')) {
    data = data.slice(3);
    bomStripped = true;
  }
  
  // Auto-detect delimiter from first line
  const firstLine = data.split(/\r?\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  
  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semicolonCount) {
    delimiter = '\t';
  }
  
  return { data, bomStripped, delimiter };
}

// CSV Import endpoint - supports both multipart/form-data and raw text/csv
router.post('/products/import', requireAdminSession, upload.single('file'), express.text({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    // Fix mode evaluation: normalize to lowercase, explicit mode param takes precedence
    const rawMode = (req.query.mode || '').toLowerCase().trim();
    const mode = rawMode === 'apply' ? 'apply' : (req.query.dryRun === '0' ? 'apply' : 'dryrun');
    console.log(`[CSV Import] Mode: ${mode} (raw: ${req.query.mode}, dryRun: ${req.query.dryRun})`);
    
    // Get CSV data from either file upload or raw body
    let csvData = null;
    let fileName = 'unknown';
    let fileBytes = 0;
    
    if (req.file && req.file.buffer) {
      csvData = req.file.buffer.toString('utf-8');
      fileName = req.file.originalname || 'uploaded.csv';
      fileBytes = req.file.size || req.file.buffer.length;
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      csvData = req.body;
      fileName = 'raw-body.csv';
      fileBytes = req.body.length;
    }
    
    console.log(`[CSV Import] Received: ${fileName}, ${fileBytes} bytes`);
    
    if (!csvData || csvData.trim().length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No CSV data provided', 
        hint: 'Upload a file or send raw CSV text',
        rowsParsed: 0,
        rowsValid: 0
      });
    }
    
    // Preprocess: strip BOM and detect delimiter
    const { data: cleanData, bomStripped, delimiter } = preprocessCSV(csvData);
    console.log(`[CSV Import] BOM stripped: ${bomStripped}, Delimiter: "${delimiter === '\t' ? 'TAB' : delimiter}"`);
    
    const lines = cleanData.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ 
        ok: false, 
        error: 'CSV must have header and at least one data row',
        rowsParsed: 0,
        rowsValid: 0
      });
    }
    
    const headers = parseCSVLine(lines[0], delimiter);
    console.log(`[CSV Import] Headers: ${headers.slice(0, 8).join(', ')}${headers.length > 8 ? '...' : ''} (${headers.length} columns)`);
    
    // Detect catalog CSV and reject with helpful message
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    const catalogHeaders = ['is_pet_product', 'sub_category', 'tags', 'variants', 'cj_spu'];
    const hasCatalogHeaders = catalogHeaders.some(h => lowerHeaders.includes(h));
    if (hasCatalogHeaders) {
      return res.status(400).json({
        ok: false,
        error: 'This is a Catalog CSV, not a Pricing CSV',
        message: 'Use Admin → Catalog Import for full catalog CSVs',
        hint: 'Pricing CSV should only have columns: product_id, variant_id, price, compare_at_price, currency',
        detectedCatalogHeaders: catalogHeaders.filter(h => lowerHeaders.includes(h)),
        rowsParsed: 0,
        rowsValid: 0
      });
    }
    
    // Find columns (case-insensitive, multiple name support)
    const productIdIdx = findColumnIndex(headers, 'product_id', 'id', 'productid', 'spu');
    const variantIdIdx = findColumnIndex(headers, 'variant_id', 'variantid', 'vid');
    const skuIdx = findColumnIndex(headers, 'sku', 'variant_sku', 'variantsku');
    const priceIdx = findColumnIndex(headers, 'suggested_price', 'price', 'new_price', 'newprice', 'sell_price', 'sellprice');
    const costIdx = findColumnIndex(headers, 'cost', 'costprice', 'cost_price');
    const activeIdx = findColumnIndex(headers, 'active', 'status', 'enabled');
    const categoryIdx = findColumnIndex(headers, 'category_slug', 'category', 'categoryslug');
    const petTypeIdx = findColumnIndex(headers, 'pet_type', 'pettype', 'pet');
    const subcategoryIdx = findColumnIndex(headers, 'subcategory', 'subcategory_slug');
    const titleIdx = findColumnIndex(headers, 'title', 'name', 'product_name');
    const imageIdx = findColumnIndex(headers, 'image_url', 'image', 'images');
    
    if (productIdIdx === -1 && skuIdx === -1) {
      return res.status(400).json({ 
        ok: false,
        error: 'Invalid CSV format', 
        message: 'CSV must have either product_id/id or sku column',
        detectedColumns: headers,
        rowsParsed: 0,
        rowsValid: 0
      });
    }
    
    const products = loadCatalog();
    const productMap = new Map(products.map(p => [safeString(p.id), p]));
    const skuMap = new Map();
    
    // Build SKU lookup map
    for (const product of products) {
      if (product.variants) {
        for (const v of product.variants) {
          const sku = v.variantSku || v.sku;
          if (sku) skuMap.set(safeString(sku).toLowerCase(), { product, variant: v });
        }
      }
    }
    
    const updates = [];
    const errors = [];
    const warnings = [];
    let rowsParsed = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], delimiter);
      const rowNum = i + 1;
      rowsParsed++;
      
      // Use safeString for all ID fields to handle large numeric IDs as strings
      const productId = productIdIdx >= 0 ? safeString(cols[productIdIdx]) : '';
      // variant_id is optional - empty string is valid (fallback to product-level update)
      const variantId = variantIdIdx >= 0 ? safeString(cols[variantIdIdx]) : '';
      // sku is optional
      const sku = skuIdx >= 0 ? safeString(cols[skuIdx]) : '';
      
      let product = null;
      let variant = null;
      
      // Try to find by product ID first - accepts numeric, UUID, or cj_ prefixed IDs
      // Valid formats: 123456789, cj_123456789, UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
      if (productId) {
        product = productMap.get(productId);
      }
      
      // Fall back to SKU lookup if product not found
      if (!product && sku) {
        const skuMatch = skuMap.get(sku.toLowerCase());
        if (skuMatch) {
          product = skuMatch.product;
          variant = skuMatch.variant;
        }
      }
      
      if (!product) {
        if (productId || sku) {
          errors.push({ row: rowNum, column: 'product_id', error: `Product not found: ${productId || sku}` });
        }
        continue;
      }
      
      // If variantId specified and non-empty, find that variant; otherwise update product-level
      if (variantId && product.variants) {
        variant = product.variants.find(v => safeString(v.vid || v.id) === variantId);
        // If variant specified but not found, warn but continue (update product-level)
        if (!variant) {
          warnings.push({ row: rowNum, warning: `Variant ${variantId} not found, updating product-level` });
        }
      }
      
      const update = { row: rowNum, productId: product.id, variantId: variant?.vid || variant?.id || null, changes: [] };
      
      if (priceIdx >= 0 && safeString(cols[priceIdx])) {
        const newPrice = safeNumber(cols[priceIdx]);
        const cost = costIdx >= 0 ? safeNumber(cols[costIdx]) || 0 : safeNumber(product.costPrice) || 0;
        
        if (newPrice === null) {
          errors.push({ row: rowNum, column: 'price', error: 'Invalid price value: ' + cols[priceIdx] });
          continue;
        }
        
        const validation = validatePrice({ cost, newPrice });
        if (!validation.valid) {
          errors.push({ row: rowNum, column: 'price', error: validation.errors.join('; ') });
          continue;
        }
        if (validation.warnings.length > 0) {
          warnings.push({ row: rowNum, warnings: validation.warnings });
        }
        
        let oldPrice;
        if (variant) {
          oldPrice = parseFloat(variant.price) || parseFloat(product.price) || 0;
          update.changes.push({ field: 'variant_price', oldValue: oldPrice, newValue: newPrice, variantId: variant.vid || variant.id });
        } else {
          oldPrice = parseFloat(product.price) || 0;
          update.changes.push({ field: 'product_price', oldValue: oldPrice, newValue: newPrice });
        }
      }
      
      if (activeIdx >= 0 && safeString(cols[activeIdx])) {
        const newActive = safeBoolean(cols[activeIdx]);
        const oldActive = product.active !== false;
        if (newActive !== null && newActive !== oldActive) {
          update.changes.push({ field: 'active', oldValue: oldActive, newValue: newActive });
        }
      }
      
      if (categoryIdx >= 0 && safeString(cols[categoryIdx])) {
        const newCat = safeString(cols[categoryIdx]);
        if (newCat !== product.mainCategorySlug) {
          update.changes.push({ field: 'category_slug', oldValue: product.mainCategorySlug, newValue: newCat });
        }
      }
      
      if (petTypeIdx >= 0 && safeString(cols[petTypeIdx])) {
        const newPetType = safeString(cols[petTypeIdx]);
        if (newPetType !== (product.pet_type || product.petType)) {
          update.changes.push({ field: 'pet_type', oldValue: product.pet_type || product.petType, newValue: newPetType });
        }
      }
      
      if (subcategoryIdx >= 0 && safeString(cols[subcategoryIdx])) {
        const newSub = safeString(cols[subcategoryIdx]);
        if (newSub !== product.subcategorySlug) {
          update.changes.push({ field: 'subcategory', oldValue: product.subcategorySlug, newValue: newSub });
        }
      }
      
      if (update.changes.length > 0) {
        updates.push(update);
      }
    }
    
    const rowsValid = updates.length;
    console.log(`[CSV Import] Parsed rows: ${rowsParsed}, valid: ${rowsValid}, errors: ${errors.length}`);
    
    if (mode === 'dryrun') {
      return res.json({
        ok: true,
        mode: 'dryrun',
        rowsParsed,
        rowsValid,
        total_rows: lines.length - 1,
        matched_products: updates.length,
        bomStripped,
        delimiter: delimiter === '\t' ? 'TAB' : delimiter,
        updates_preview: updates.slice(0, 200),
        sampleChanges: updates.slice(0, 10).map(u => ({ productId: u.productId, changes: u.changes })),
        errors: errors.slice(0, 100),
        warnings: warnings.slice(0, 100),
        summary: {
          total_changes: updates.reduce((acc, u) => acc + u.changes.length, 0),
          price_updates: updates.filter(u => u.changes.some(c => c.field.includes('price'))).length,
          active_updates: updates.filter(u => u.changes.some(c => c.field === 'active')).length,
          category_updates: updates.filter(u => u.changes.some(c => c.field.includes('category') || c.field.includes('pet_type'))).length
        }
      });
    }
    
    const auditEntries = [];
    let appliedCount = 0;
    
    for (const update of updates) {
      const product = productMap.get(safeString(update.productId));
      if (!product) continue;
      
      for (const change of update.changes) {
        if (change.field === 'product_price') {
          product.price = change.newValue;
          auditEntries.push({
            timestamp: new Date().toISOString(),
            productId: update.productId,
            variantId: null,
            field: 'price',
            oldValue: change.oldValue,
            newValue: change.newValue,
            source: 'csv_import'
          });
        } else if (change.field === 'variant_price') {
          const variant = product.variants?.find(v => (v.vid || v.id) === change.variantId);
          if (variant) {
            variant.price = change.newValue;
            auditEntries.push({
              timestamp: new Date().toISOString(),
              productId: update.productId,
              variantId: change.variantId,
              field: 'price',
              oldValue: change.oldValue,
              newValue: change.newValue,
              source: 'csv_import'
            });
          }
        } else if (change.field === 'active') {
          product.active = change.newValue;
        } else if (change.field === 'category_slug') {
          product.mainCategorySlug = change.newValue;
        } else if (change.field === 'pet_type') {
          product.pet_type = change.newValue;
          product.petType = change.newValue;
        } else if (change.field === 'subcategory') {
          product.subcategorySlug = change.newValue;
        }
        appliedCount++;
      }
      
      product.updatedAt = new Date().toISOString();
    }
    
    const saved = saveCatalog(products);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save catalog' });
    }
    
    if (auditEntries.length > 0) {
      appendAuditLog(auditEntries);
    }
    
    console.log(`[Admin Pricing] Applied ${appliedCount} changes to ${updates.length} products`);
    
    return res.json({
      mode: 'apply',
      success: true,
      updated_products: updates.length,
      total_changes: appliedCount,
      audit_entries: auditEntries.length,
      bomStripped,
      delimiter: delimiter === '\t' ? 'TAB' : delimiter,
      errors: errors.slice(0, 100)
    });
    
  } catch (err) {
    console.error('[Admin Pricing] Import error:', err);
    res.status(500).json({ error: 'Import failed', message: err.message });
  }
});

// Auto-reprice endpoint - NOW FILTERS TO PET PRODUCTS ONLY
router.post('/pricing/reprice', requireAdminSession, (req, res) => {
  try {
    const mode = req.query.mode || 'dryrun';
    const products = loadCatalog();
    
    const updates = [];
    const skipped = [];
    
    for (const product of products) {
      // SAFETY: Only reprice valid pet products
      if (!isValidPetProduct(product)) {
        const reason = getExcludedReason(product) || 'Not a valid pet product';
        skipped.push({ id: product.id, title: product.title?.slice(0, 50), reason });
        continue;
      }
      
      const categorySlug = product.mainCategorySlug || product.categories?.[0] || '';
      
      if (!product.variants || product.variants.length === 0) {
        const cost = parseFloat(product.costPrice) || 0;
        if (cost <= 0) continue;
        
        const currentPrice = parseFloat(product.price) || 0;
        const suggested = computeSuggestedPrice({ cost, categorySlug });
        
        if (suggested.suggestedPrice && Math.abs(suggested.suggestedPrice - currentPrice) >= 0.01) {
          updates.push({
            productId: product.id,
            variantId: null,
            title: product.title,
            cost,
            currentPrice,
            suggestedPrice: suggested.suggestedPrice,
            multiplier: suggested.multiplier,
            roundingRule: suggested.roundingRule
          });
        }
      } else {
        for (const variant of product.variants) {
          const cost = parseFloat(variant.costPrice) || parseFloat(product.costPrice) || 0;
          if (cost <= 0) continue;
          
          const currentPrice = parseFloat(variant.price) || parseFloat(product.price) || 0;
          const suggested = computeSuggestedPrice({ cost, categorySlug });
          
          if (suggested.suggestedPrice && Math.abs(suggested.suggestedPrice - currentPrice) >= 0.01) {
            updates.push({
              productId: product.id,
              variantId: variant.vid || variant.id,
              title: `${product.title} - ${variant.variantName || variant.title || ''}`,
              cost,
              currentPrice,
              suggestedPrice: suggested.suggestedPrice,
              multiplier: suggested.multiplier,
              roundingRule: suggested.roundingRule
            });
          }
        }
      }
    }
    
    if (mode === 'dryrun') {
      return res.json({
        mode: 'dryrun',
        total_products: products.length,
        products_to_update: updates.length,
        skipped_non_pet: skipped.length,
        preview: updates.slice(0, 200),
        skipped_preview: skipped.slice(0, 20),
        summary: {
          avg_price_change: updates.length > 0 
            ? (updates.reduce((acc, u) => acc + (u.suggestedPrice - u.currentPrice), 0) / updates.length).toFixed(2)
            : 0,
          increases: updates.filter(u => u.suggestedPrice > u.currentPrice).length,
          decreases: updates.filter(u => u.suggestedPrice < u.currentPrice).length
        }
      });
    }
    
    const productMap = new Map(products.map(p => [p.id, p]));
    const auditEntries = [];
    
    for (const update of updates) {
      const product = productMap.get(update.productId);
      if (!product) continue;
      
      if (update.variantId) {
        const variant = product.variants?.find(v => (v.vid || v.id) === update.variantId);
        if (variant) {
          variant.price = update.suggestedPrice;
          auditEntries.push({
            timestamp: new Date().toISOString(),
            productId: update.productId,
            variantId: update.variantId,
            field: 'price',
            oldValue: update.currentPrice,
            newValue: update.suggestedPrice,
            source: 'auto_reprice'
          });
        }
      } else {
        product.price = update.suggestedPrice;
        auditEntries.push({
          timestamp: new Date().toISOString(),
          productId: update.productId,
          variantId: null,
          field: 'price',
          oldValue: update.currentPrice,
          newValue: update.suggestedPrice,
          source: 'auto_reprice'
        });
      }
      
      product.updatedAt = new Date().toISOString();
    }
    
    const saved = saveCatalog(products);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save catalog' });
    }
    
    if (auditEntries.length > 0) {
      appendAuditLog(auditEntries);
    }
    
    console.log(`[Admin Pricing] Auto-repriced ${updates.length} products (skipped ${skipped.length} non-pet)`);
    
    return res.json({
      mode: 'apply',
      success: true,
      updated_count: updates.length,
      skipped_count: skipped.length,
      audit_entries: auditEntries.length
    });
    
  } catch (err) {
    console.error('[Admin Pricing] Reprice error:', err);
    res.status(500).json({ error: 'Reprice failed', message: err.message });
  }
});

router.get('/pricing/audit', requireAdminSession, (req, res) => {
  try {
    const log = loadAuditLog();
    const limit = parseInt(req.query.limit) || 100;
    const recent = log.slice(-limit).reverse();
    res.json({ total: log.length, entries: recent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

router.get('/catalog/scan', requireAdminSession, (req, res) => {
  try {
    const products = loadCatalog();
    
    const collections = {
      cats: 0,
      dogs: 0,
      small_pets: 0,
      accessories: 0,
      unknown: 0
    };
    
    const exclusionReasons = {};
    let totalActive = 0;
    let totalBlocked = 0;
    let totalExcluded = 0;
    
    for (const product of products) {
      if (product.blocked) {
        totalBlocked++;
        continue;
      }
      
      if (isExcludedProduct(product)) {
        totalExcluded++;
        const reason = product.exclusionReason || 'unknown';
        exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
        continue;
      }
      
      if (product.active !== false) {
        totalActive++;
        
        const petType = (product.pet_type || product.petType || '').toLowerCase();
        const category = (product.mainCategorySlug || product.category || '').toLowerCase();
        
        if (petType === 'cat' || category.includes('cat')) {
          collections.cats++;
        } else if (petType === 'dog' || category.includes('dog')) {
          collections.dogs++;
        } else if (petType === 'small_pet' || category.includes('small-pet') || category.includes('small_pet')) {
          collections.small_pets++;
        } else if (category.includes('accessor')) {
          collections.accessories++;
        } else {
          collections.unknown++;
        }
      }
    }
    
    const topReasons = Object.entries(exclusionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([reason, count]) => ({ reason, count }));
    
    res.json({
      total_products: products.length,
      total_active: totalActive,
      total_blocked: totalBlocked,
      total_excluded: totalExcluded,
      collections,
      top_exclusion_reasons: topReasons,
      health: {
        cats_ok: collections.cats > 0,
        dogs_ok: collections.dogs > 0,
        small_pets_ok: collections.small_pets > 0
      }
    });
  } catch (err) {
    console.error('[Admin Pricing] Catalog scan error:', err);
    res.status(500).json({ error: 'Catalog scan failed', message: err.message });
  }
});

// Catalog Import endpoint - for updating product metadata (pet_type, category, active status)
// NOTE: Only updates existing products, does not create new ones. Validates against exclusion rules.
router.post('/catalog/import', requireAdminSession, upload.single('file'), express.text({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const rawMode = (req.query.mode || '').toLowerCase().trim();
    const mode = rawMode === 'apply' ? 'apply' : 'dryrun';
    console.log(`[Catalog Import] Mode: ${mode}`);
    
    let csvData = null;
    if (req.file && req.file.buffer) {
      csvData = req.file.buffer.toString('utf-8');
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      csvData = req.body;
    }
    
    if (!csvData || csvData.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'No CSV data provided' });
    }
    
    const { data: cleanData, bomStripped, delimiter } = preprocessCSV(csvData);
    const lines = cleanData.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length < 2) {
      return res.status(400).json({ ok: false, error: 'CSV must have header and at least one data row' });
    }
    
    const headers = parseCSVLine(lines[0], delimiter);
    const productIdIdx = findColumnIndex(headers, 'product_id', 'id', 'productid', 'spu');
    const titleIdx = findColumnIndex(headers, 'title', 'name', 'product_name');
    const petTypeIdx = findColumnIndex(headers, 'pet_type', 'pettype', 'pet');
    const categoryIdx = findColumnIndex(headers, 'category_slug', 'category', 'categoryslug', 'maincategoryslug');
    const subcategoryIdx = findColumnIndex(headers, 'subcategory', 'subcategory_slug');
    const activeIdx = findColumnIndex(headers, 'active', 'status', 'enabled');
    const imageIdx = findColumnIndex(headers, 'image_url', 'image', 'images');
    
    if (productIdIdx === -1) {
      return res.status(400).json({ 
        ok: false, 
        error: 'CSV must have product_id or id column',
        detectedColumns: headers
      });
    }
    
    const products = loadCatalog();
    const productMap = new Map(products.map(p => [safeString(p.id), p]));
    
    const updates = [];
    const errors = [];
    const excluded = [];
    let matched = 0;
    let skippedNotFound = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], delimiter);
      const rowNum = i + 1;
      
      const productId = productIdIdx >= 0 ? safeString(cols[productIdIdx]) : '';
      if (!productId) {
        errors.push({ row: rowNum, error: 'Missing product_id' });
        continue;
      }
      
      const product = productMap.get(productId);
      if (!product) {
        skippedNotFound++;
        continue;
      }
      
      // Validate product is not excluded by safety rules
      const exclusionReason = getExcludedReason(product);
      if (exclusionReason) {
        excluded.push({ row: rowNum, productId, reason: exclusionReason });
        continue;
      }
      
      matched++;
      const changes = {};
      
      // Normalize pet_type - only accept valid pet types
      if (petTypeIdx >= 0 && cols[petTypeIdx]) {
        let petType = safeString(cols[petTypeIdx]).toLowerCase();
        if (['dog', 'dogs'].includes(petType)) petType = 'dog';
        else if (['cat', 'cats'].includes(petType)) petType = 'cat';
        else if (['small-pets', 'small pets', 'small_pets', 'small-pet'].includes(petType)) petType = 'small_pet';
        else if (petType === 'both') petType = 'both';
        else petType = null; // Invalid pet_type - ignore
        
        if (petType && petType !== (product.pet_type || product.petType)) {
          changes.pet_type = petType;
        }
      }
      
      if (categoryIdx >= 0 && cols[categoryIdx]) {
        const cat = safeString(cols[categoryIdx]);
        if (cat && cat !== product.mainCategorySlug) {
          changes.mainCategorySlug = cat;
        }
      }
      
      if (subcategoryIdx >= 0 && cols[subcategoryIdx]) {
        const subcat = safeString(cols[subcategoryIdx]);
        if (subcat && subcat !== product.subcategorySlug) {
          changes.subcategorySlug = subcat;
        }
      }
      
      if (activeIdx >= 0 && cols[activeIdx]) {
        const active = safeBoolean(cols[activeIdx]);
        if (active !== null && active !== (product.active !== false)) {
          changes.active = active;
        }
      }
      
      if (titleIdx >= 0 && cols[titleIdx]) {
        const title = safeString(cols[titleIdx]);
        if (title && title !== product.title) {
          changes.title = title;
        }
      }
      
      // Handle image_url
      if (imageIdx >= 0 && cols[imageIdx]) {
        const imageUrl = safeString(cols[imageIdx]);
        if (imageUrl && imageUrl.startsWith('http')) {
          const currentImage = product.images?.[0] || '';
          if (imageUrl !== currentImage) {
            changes.image_url = imageUrl;
          }
        }
      }
      
      if (Object.keys(changes).length > 0) {
        updates.push({ productId, changes });
      }
    }
    
    if (mode === 'dryrun') {
      return res.json({
        ok: true,
        mode: 'dryrun',
        total_rows: lines.length - 1,
        matched,
        skipped_not_found: skippedNotFound,
        excluded_by_safety: excluded.length,
        updates_count: updates.length,
        updates_preview: updates.slice(0, 50),
        excluded_preview: excluded.slice(0, 20),
        errors: errors.slice(0, 100),
        bomStripped,
        delimiter: delimiter === '\t' ? 'TAB' : delimiter
      });
    }
    
    // Apply mode
    let updated = 0;
    for (const update of updates) {
      const product = productMap.get(update.productId);
      if (!product) continue;
      
      for (const [key, value] of Object.entries(update.changes)) {
        if (key === 'image_url') {
          // Add to images array
          if (!product.images) product.images = [];
          if (!product.images.includes(value)) {
            product.images.unshift(value);
          }
        } else {
          product[key] = value;
        }
      }
      updated++;
    }
    
    if (updated > 0) {
      saveCatalog(products);
      console.log(`[Catalog Import] Applied ${updated} updates, ${excluded.length} excluded by safety`);
    }
    
    res.json({
      ok: true,
      mode: 'apply',
      updated,
      excluded_count: excluded.length,
      total_changes: updates.reduce((acc, u) => acc + Object.keys(u.changes).length, 0)
    });
    
  } catch (err) {
    console.error('[Catalog Import] Error:', err);
    res.status(500).json({ ok: false, error: 'Catalog import failed', message: err.message });
  }
});

module.exports = router;
