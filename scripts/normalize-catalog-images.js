#!/usr/bin/env node
/**
 * Catalog Image Normalizer
 * 
 * Applies canonical image schema to all products:
 * - product.thumbnail : string | null
 * - product.images    : string[]
 * - product.mainImage : string | null (alias of thumbnail)
 * 
 * Generates a report at /public/debug/catalog-image-report.json
 */

const fs = require('fs');
const path = require('path');
const { normalizeCatalog, normalizeProduct, parseImages, isValidUrl } = require('../server/catalog/normalizeCatalog');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'public', 'debug', 'catalog-image-report.json');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('[ERROR] Catalog not found at:', CATALOG_PATH);
    process.exit(1);
  }
  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function saveCatalog(catalog) {
  ensureDir(BACKUP_DIR);
  const backupPath = path.join(BACKUP_DIR, `catalog-pre-image-normalize-${Date.now()}.json`);
  const currentData = fs.readFileSync(CATALOG_PATH, 'utf-8');
  fs.writeFileSync(backupPath, currentData);
  console.log('[BACKUP] Created at:', backupPath);
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log('[SAVED] Catalog updated');
}

function generateReport(products) {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalProducts: 0,
      productsWithImages: 0,
      productsMissingImages: 0,
      productsNormalized: 0,
      invalidUrlsRemoved: 0
    },
    missingImagesSample: [],
    imageStats: {
      singleImage: 0,
      multipleImages: 0,
      noImages: 0
    }
  };

  for (const p of products) {
    report.summary.totalProducts++;
    
    const imageCount = Array.isArray(p.images) ? p.images.length : 0;
    
    if (imageCount > 0) {
      report.summary.productsWithImages++;
      if (imageCount === 1) {
        report.imageStats.singleImage++;
      } else {
        report.imageStats.multipleImages++;
      }
    } else {
      report.summary.productsMissingImages++;
      report.imageStats.noImages++;
      if (report.missingImagesSample.length < 20) {
        report.missingImagesSample.push({
          id: p.id || p.product_id,
          slug: p.slug || 'no-slug',
          title: (p.title || 'No title').substring(0, 50)
        });
      }
    }
    
    if (p.thumbnail) {
      report.summary.productsNormalized++;
    }
  }

  return report;
}

function run() {
  console.log('='.repeat(60));
  console.log('CATALOG IMAGE NORMALIZER');
  console.log('='.repeat(60));
  
  const catalog = loadCatalog();
  const products = catalog.products || [];
  
  console.log(`[INFO] Loaded ${products.length} products`);
  
  const { products: normalizedProducts, changedCount, warnings } = normalizeCatalog(products);
  
  console.log(`[INFO] Changed: ${changedCount} products`);
  console.log(`[INFO] Warnings: ${warnings.length}`);
  
  if (warnings.length > 0 && warnings.length <= 20) {
    warnings.forEach(w => console.log('  - ' + w));
  } else if (warnings.length > 20) {
    warnings.slice(0, 20).forEach(w => console.log('  - ' + w));
    console.log(`  ... and ${warnings.length - 20} more`);
  }
  
  catalog.products = normalizedProducts;
  saveCatalog(catalog);
  
  const report = generateReport(normalizedProducts);
  report.summary.productsNormalized = changedCount;
  
  ensureDir(path.dirname(REPORT_PATH));
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log('[REPORT] Saved to:', REPORT_PATH);
  
  console.log('\n='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total products:        ${report.summary.totalProducts}`);
  console.log(`With images:           ${report.summary.productsWithImages}`);
  console.log(`Missing images:        ${report.summary.productsMissingImages}`);
  console.log(`Normalized (changed):  ${changedCount}`);
  console.log('');
  console.log('Image distribution:');
  console.log(`  Single image:        ${report.imageStats.singleImage}`);
  console.log(`  Multiple images:     ${report.imageStats.multipleImages}`);
  console.log(`  No images:           ${report.imageStats.noImages}`);
  
  if (report.missingImagesSample.length > 0) {
    console.log('\nProducts missing images (sample):');
    report.missingImagesSample.forEach(p => {
      console.log(`  - ${p.slug}: ${p.title}`);
    });
  }
  
  console.log('\nDone!');
}

run();
