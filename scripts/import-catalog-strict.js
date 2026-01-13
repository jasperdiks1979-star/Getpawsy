const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CATALOG_FILE = path.join(process.cwd(), 'data', 'catalog.json');
const IMPORT_CSV = path.join(process.cwd(), 'data', 'getpawsy_catalog_IMPORT_READY.csv');
const EXCLUDED_LOG = path.join(process.cwd(), 'data', 'getpawsy_catalog_EXCLUDED_LOG.csv');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

const VALID_CATEGORIES = ['Dogs', 'Cats', 'Small Pets'];
const VALID_PET_TYPES = ['dog', 'cat', 'small_pets', 'both', 'unknown'];

function loadExcludedProductIds() {
  if (!fs.existsSync(EXCLUDED_LOG)) return new Set();
  const content = fs.readFileSync(EXCLUDED_LOG, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  const ids = new Set();
  for (const row of records) {
    if (row.product_id) {
      ids.add(row.product_id);
      ids.add(row.product_id.replace('cj_', ''));
    }
  }
  return ids;
}

function isValidJsonArray(str) {
  if (!str || str.trim() === '') return true;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

function isValidBoolean(val) {
  if (typeof val === 'boolean') return true;
  if (typeof val === 'string') {
    return ['true', 'false', '1', '0', 'yes', 'no'].includes(val.toLowerCase());
  }
  return false;
}

function parseBoolean(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    return ['true', '1', 'yes'].includes(val.toLowerCase());
  }
  return false;
}

function isValidISO8601(str) {
  if (!str || str.trim() === '') return true;
  const d = new Date(str);
  return !isNaN(d.getTime()) && str.includes('T');
}

function validateRow(row, rowIndex, excludedIds) {
  const errors = [];
  const productId = row.product_id || '';
  
  if (excludedIds.has(productId) || excludedIds.has(`cj_${productId}`)) {
    return { skip: true, reason: 'excluded' };
  }

  if (!productId) {
    errors.push({ column: 'product_id', message: 'Missing product_id' });
  }

  if (row.images && !isValidJsonArray(row.images)) {
    errors.push({ column: 'images', message: 'Invalid JSON array for images' });
  }

  if (row.variants && !isValidJsonArray(row.variants)) {
    errors.push({ column: 'variants', message: 'Invalid JSON array for variants' });
  }

  if (row.category && !VALID_CATEGORIES.includes(row.category)) {
    errors.push({ column: 'category', message: `Invalid category "${row.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}` });
  }

  if (row.pet_type && !VALID_PET_TYPES.includes(row.pet_type)) {
    errors.push({ column: 'pet_type', message: `Invalid pet_type "${row.pet_type}". Must be one of: ${VALID_PET_TYPES.join(', ')}` });
  }

  if (row.is_pet_product !== undefined && row.is_pet_product !== '' && !isValidBoolean(row.is_pet_product)) {
    errors.push({ column: 'is_pet_product', message: `Invalid boolean "${row.is_pet_product}". Must be true/false` });
  }

  if (row.updated_at && !isValidISO8601(row.updated_at)) {
    errors.push({ column: 'updated_at', message: `Invalid ISO 8601 timestamp "${row.updated_at}"` });
  }

  return { errors, skip: false };
}

function csvRowToProduct(row) {
  const product = {
    product_id: row.product_id,
    slug: row.slug || '',
    title: row.title || '',
    category: row.category || 'Dogs',
    sub_category: row.sub_category || 'general',
    pet_type: row.pet_type || 'unknown',
    is_pet_product: parseBoolean(row.is_pet_product),
    active: parseBoolean(row.active),
    tags: row.tags ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    cj_product_id: row.cj_product_id || '',
    cj_spu: row.cj_spu || '',
    cost: parseFloat(row.cost) || 0,
    price: parseFloat(row.price) || 0,
    currency: row.currency || 'USD',
    image_url: row.image_url || '',
    updated_at: row.updated_at || new Date().toISOString()
  };

  if (row.images) {
    try { product.images = JSON.parse(row.images); } catch { product.images = []; }
  }
  if (row.variants) {
    try { product.variants = JSON.parse(row.variants); } catch { product.variants = []; }
  }
  if (row.description) product.description = row.description;
  if (row.seo_title) product.seo_title = row.seo_title;
  if (row.seo_description) product.seo_description = row.seo_description;
  if (row.highlights) {
    try { product.highlights = JSON.parse(row.highlights); } catch { product.highlights = []; }
  }
  if (row.benefits) {
    try { product.benefits = JSON.parse(row.benefits); } catch { product.benefits = []; }
  }
  if (row.faqs) {
    try { product.faqs = JSON.parse(row.faqs); } catch { product.faqs = []; }
  }

  return product;
}

async function runImport(dryRun = true) {
  console.log(`\n=== Catalog Import ${dryRun ? '(DRY-RUN)' : '(LIVE)'} ===\n`);

  if (!fs.existsSync(IMPORT_CSV)) {
    console.error(`ERROR: Import file not found: ${IMPORT_CSV}`);
    process.exit(1);
  }

  const excludedIds = loadExcludedProductIds();
  console.log(`Loaded ${excludedIds.size} excluded product IDs`);

  const csvContent = fs.readFileSync(IMPORT_CSV, 'utf-8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true, relax_quotes: true });
  console.log(`Parsed ${records.length} rows from CSV`);

  let existingCatalog = { products: [], buildInfo: {} };
  if (fs.existsSync(CATALOG_FILE)) {
    try {
      existingCatalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
    } catch (e) {
      console.warn('Could not parse existing catalog, starting fresh');
    }
  }
  const existingMap = new Map((existingCatalog.products || []).map(p => [p.product_id, p]));

  let validCount = 0;
  let skippedExcluded = 0;
  let errorCount = 0;
  let addedCount = 0;
  let updatedCount = 0;
  const newProducts = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const result = validateRow(row, i + 2, excludedIds);

    if (result.skip) {
      skippedExcluded++;
      continue;
    }

    if (result.errors && result.errors.length > 0) {
      if (errorCount === 0) {
        console.error(`\n❌ VALIDATION FAILED at row ${i + 2}:`);
        for (const err of result.errors) {
          console.error(`   Column: ${err.column} - ${err.message}`);
        }
      }
      errorCount++;
      if (dryRun) {
        console.log(`\nDry-run stopped at first error. Fix row ${i + 2} and retry.`);
        process.exit(1);
      }
      continue;
    }

    const product = csvRowToProduct(row);
    
    if (existingMap.has(product.product_id)) {
      updatedCount++;
    } else {
      addedCount++;
    }
    
    newProducts.push(product);
    validCount++;
  }

  console.log(`\n--- Validation Summary ---`);
  console.log(`Total rows:      ${records.length}`);
  console.log(`Valid:           ${validCount}`);
  console.log(`Skipped (excl):  ${skippedExcluded}`);
  console.log(`Errors:          ${errorCount}`);
  console.log(`To add:          ${addedCount}`);
  console.log(`To update:       ${updatedCount}`);

  if (dryRun) {
    if (errorCount === 0) {
      console.log(`\n✅ Dry-run PASSED. Run with --live to import.`);
    }
    return { success: errorCount === 0, validCount, addedCount, updatedCount, skippedExcluded };
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const backupPath = path.join(BACKUP_DIR, `catalog-pre-import-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(existingCatalog, null, 2));
  console.log(`\nBackup created: ${backupPath}`);

  const newCatalog = {
    products: newProducts,
    buildInfo: {
      ...existingCatalog.buildInfo,
      lastImport: new Date().toISOString(),
      importSource: 'getpawsy_catalog_IMPORT_READY.csv',
      importStats: { added: addedCount, updated: updatedCount, skipped: skippedExcluded }
    }
  };

  const tempPath = CATALOG_FILE + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(newCatalog, null, 2));
  fs.renameSync(tempPath, CATALOG_FILE);
  console.log(`✅ Catalog replaced atomically (${newProducts.length} products)`);

  return { success: true, validCount, addedCount, updatedCount, skippedExcluded };
}

async function rebuildCollections() {
  console.log('\nRebuilding collections...');
  try {
    const collectionsPath = path.join(process.cwd(), 'data', 'collections.json');
    const catalogData = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
    const products = catalogData.products || [];

    const collections = {
      dogs: products.filter(p => p.category === 'Dogs' && p.active && p.is_pet_product).map(p => p.product_id),
      cats: products.filter(p => p.category === 'Cats' && p.active && p.is_pet_product).map(p => p.product_id),
      small_pets: products.filter(p => p.category === 'Small Pets' && p.active && p.is_pet_product).map(p => p.product_id),
      all: products.filter(p => p.active && p.is_pet_product).map(p => p.product_id),
      updated_at: new Date().toISOString()
    };

    fs.writeFileSync(collectionsPath, JSON.stringify(collections, null, 2));
    console.log(`✅ Collections rebuilt: Dogs(${collections.dogs.length}), Cats(${collections.cats.length}), Small Pets(${collections.small_pets.length})`);
  } catch (e) {
    console.error('Failed to rebuild collections:', e.message);
  }
}

async function clearCaches() {
  console.log('\nClearing caches...');
  try {
    const cacheFiles = [
      'data/homepage-cache.json',
      'data/collection-cache.json',
      'data/category-cache.json'
    ];
    for (const file of cacheFiles) {
      const fullPath = path.join(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`  Deleted: ${file}`);
      }
    }
    console.log('✅ Caches cleared');
  } catch (e) {
    console.error('Cache clear error:', e.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes('--live');

  const result = await runImport(!isLive);

  if (isLive && result.success) {
    await rebuildCollections();
    await clearCaches();
    
    console.log('\n=== IMPORT COMPLETE ===');
    console.log(`Added:    ${result.addedCount}`);
    console.log(`Updated:  ${result.updatedCount}`);
    console.log(`Skipped:  ${result.skippedExcluded}`);
    console.log(`Total:    ${result.validCount}`);
  }
}

main().catch(console.error);
