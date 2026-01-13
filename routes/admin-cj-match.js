const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { requireAdminSession } = require('../src/adminAuth');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function loadCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    return data.products || [];
  } catch (err) {
    console.error('[CJ Match] Error loading catalog:', err.message);
    return [];
  }
}

function saveCatalog(products) {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    data.products = products;
    data.updated_at = new Date().toISOString();
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('[CJ Match] Error saving catalog:', err.message);
    return false;
  }
}

function backupCatalog() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'data', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = path.join(backupDir, `catalog-cj-match-${timestamp}.json`);
    fs.copyFileSync(CATALOG_PATH, backupPath);
    return { success: true, path: backupPath };
  } catch (err) {
    console.error('[CJ Match] Backup error:', err.message);
    return { success: false, error: err.message };
  }
}

router.post('/import', requireAdminSession, upload.single('file'), (req, res) => {
  try {
    const dryRun = req.query.dryRun === 'true' || req.body.dryRun === true || req.body.dryRun === 'true';
    
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }
    
    const csvContent = req.file.buffer.toString('utf-8');
    
    let records;
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });
    } catch (parseErr) {
      return res.status(400).json({ ok: false, error: 'CSV parse error', message: parseErr.message });
    }
    
    if (records.length === 0) {
      return res.status(400).json({ ok: false, error: 'CSV is empty or has no valid rows' });
    }
    
    const products = loadCatalog();
    const productByPid = new Map();
    const productBySlug = new Map();
    
    for (const p of products) {
      const pid = String(p.id || p.product_id || '');
      const slug = String(p.slug || '');
      if (pid) productByPid.set(pid, p);
      if (slug) productBySlug.set(slug, p);
    }
    
    const stats = {
      dryRun,
      timestamp: new Date().toISOString(),
      totalRows: records.length,
      matched: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      alreadyHasCj: 0,
      newCjIds: 0
    };
    
    const errors = [];
    const updates = [];
    
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;
      
      const productId = String(row.product_id || '').trim();
      const slug = String(row.slug || '').trim();
      const cjProductId = String(row.cj_product_id || '').trim();
      const cjSpu = String(row.cj_spu || '').trim();
      const cjProductUrl = String(row.cj_product_url || '').trim();
      
      if (!productId && !slug) {
        errors.push({ row: rowNum, error: 'Missing both product_id and slug' });
        stats.failed++;
        continue;
      }
      
      if (!cjProductId && !cjSpu) {
        stats.skipped++;
        continue;
      }
      
      let product = productByPid.get(productId);
      if (!product && slug) {
        product = productBySlug.get(slug);
      }
      
      if (!product) {
        errors.push({ row: rowNum, error: `Product not found: ${productId || slug}` });
        stats.failed++;
        continue;
      }
      
      stats.matched++;
      
      const hadCjBefore = !!(product.cj_product_id || product.cj_spu);
      if (hadCjBefore) {
        stats.alreadyHasCj++;
      }
      
      let changed = false;
      const updateRecord = {
        product_id: product.id || product.product_id,
        slug: product.slug,
        title: (product.title || '').substring(0, 50),
        old_cj_product_id: product.cj_product_id || null,
        old_cj_spu: product.cj_spu || null,
        new_cj_product_id: null,
        new_cj_spu: null
      };
      
      if (cjProductId && cjProductId !== String(product.cj_product_id || '')) {
        updateRecord.new_cj_product_id = cjProductId;
        if (!dryRun) {
          product.cj_product_id = cjProductId;
        }
        changed = true;
      }
      
      if (cjSpu && cjSpu !== String(product.cj_spu || '')) {
        updateRecord.new_cj_spu = cjSpu;
        if (!dryRun) {
          product.cj_spu = cjSpu;
        }
        changed = true;
      }
      
      if (cjProductUrl && cjProductUrl !== String(product.cj_product_url || '')) {
        if (!dryRun) {
          product.cj_product_url = cjProductUrl;
        }
        changed = true;
      }
      
      if (changed) {
        if (!dryRun) {
          product.updated_at = stats.timestamp;
        }
        stats.updated++;
        if (!hadCjBefore) {
          stats.newCjIds++;
        }
        updates.push(updateRecord);
      } else {
        stats.skipped++;
      }
    }
    
    let backupResult = null;
    if (!dryRun && stats.updated > 0) {
      backupResult = backupCatalog();
      saveCatalog(products);
      
      if (global.refreshCatalogCache) {
        global.refreshCatalogCache();
      }
    }
    
    console.log(`[CJ Match] Import (dryRun=${dryRun}): ${stats.totalRows} rows, ${stats.matched} matched, ${stats.updated} updated, ${stats.failed} failed`);
    
    res.json({
      ok: true,
      ...stats,
      updates: updates.slice(0, 100),
      errors: errors.slice(0, 50),
      backupPath: backupResult?.path || null
    });
    
  } catch (err) {
    console.error('[CJ Match] Import error:', err);
    res.status(500).json({ ok: false, error: 'Import failed', message: err.message });
  }
});

router.get('/stats', requireAdminSession, (req, res) => {
  try {
    const products = loadCatalog();
    
    let withCjId = 0;
    let withCjSpu = 0;
    let withBoth = 0;
    let withNeither = 0;
    
    for (const p of products) {
      const hasCjId = !!(p.cj_product_id);
      const hasCjSpu = !!(p.cj_spu);
      
      if (hasCjId && hasCjSpu) withBoth++;
      else if (hasCjId) withCjId++;
      else if (hasCjSpu) withCjSpu++;
      else withNeither++;
    }
    
    res.json({
      ok: true,
      total: products.length,
      withCjId: withCjId + withBoth,
      withCjSpu: withCjSpu + withBoth,
      withBoth,
      withNeither,
      withAnyCj: withCjId + withCjSpu + withBoth
    });
    
  } catch (err) {
    console.error('[CJ Match] Stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
