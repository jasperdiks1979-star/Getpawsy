#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const XLSX_PATH = 'attached_assets/cj_products_with_images.xlsx';
const DB_PATH = 'data/db.json';
const CACHE_DIR = 'public/cache/images';

function getImageFiles() {
  const images = fs.readdirSync(CACHE_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .sort();
  
  return images.map((f, idx) => ({
    filename: f,
    index: idx,
    path: `/cache/images/${f}`
  }));
}

function parseXlsx() {
  console.log(`Reading XLSX: ${XLSX_PATH}`);
  
  const workbook = XLSX.readFile(XLSX_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  let headerRow = rawData[1] || rawData[0];
  let dataStartRow = rawData[1] ? 2 : 1;
  
  const headers = headerRow.map((h, i) => {
    const str = String(h || '').trim().toLowerCase();
    return { index: i, name: str };
  });
  
  const findCol = (patterns) => {
    for (const p of patterns) {
      const pLower = p.toLowerCase();
      const found = headers.find(h => h.name === pLower || h.name.includes(pLower));
      if (found) return found.index;
    }
    return -1;
  };
  
  const cols = {
    spu: findCol(['spu']),
    name: findCol(['product', 'lists']),
    price: findCol(['price']),
    shipping: findCol(['shipping from'])
  };
  
  console.log(`Column mapping: spu=${cols.spu}, name=${cols.name}`);
  
  // Parse rows and keep track of original row index
  const products = [];
  for (let i = dataStartRow; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.every(c => !c)) continue;
    
    const spu = String(row[cols.spu] || '').trim();
    const name = String(row[cols.name] || '').trim();
    const shipping = String(row[cols.shipping] || '').toLowerCase();
    const isUS = shipping.includes('us') || shipping.includes('united states') || shipping === '';
    
    if (!spu) continue;
    
    products.push({
      excelRow: i,
      spu,
      name,
      isUS
    });
  }
  
  return products;
}

function mapImagesToProducts(excelProducts, images) {
  console.log(`\nMatching ${excelProducts.length} Excel products with ${images.length} images...`);
  
  // Filter US products
  const usProducts = excelProducts.filter(p => p.isUS);
  console.log(`US products: ${usProducts.length}`);
  
  // Map images to products sequentially
  const mapping = {};
  
  usProducts.forEach((product, idx) => {
    if (idx < images.length) {
      const img = images[idx];
      mapping[product.spu] = {
        imagePath: img.path,
        imageFile: img.filename,
        excelRow: product.excelRow,
        productIndex: idx
      };
    }
  });
  
  console.log(`Successfully mapped ${Object.keys(mapping).length} products to images`);
  return mapping;
}

function updateDatabase(mapping) {
  console.log(`\nUpdating database: ${DB_PATH}`);
  
  let db = { products: [], categories: [] };
  if (fs.existsSync(DB_PATH)) {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  }
  
  const products = db.products || [];
  let updated = 0;
  
  // Find CJ products and update with mapped images
  for (const product of products) {
    const spu = product.spu || product.id?.replace('cj-', '').toUpperCase();
    
    if (mapping[spu]) {
      const img = mapping[spu];
      product.image = img.imagePath;
      product.images = [img.imagePath];
      product.active = true;
      product.imageSource = 'real_cj';
      product.mappedAt = new Date().toISOString();
      
      // Update variants
      if (product.variants) {
        product.variants.forEach(v => {
          v.image = img.imagePath;
        });
      }
      
      updated++;
    }
  }
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`Updated ${updated} products with correct images`);
  
  return updated;
}

function main() {
  console.log('='.repeat(60));
  console.log('Product-Image Mapping Optimizer');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Get available images
    console.log('\n[Step 1] Loading cached images...');
    const images = getImageFiles();
    console.log(`Found ${images.length} cached images`);
    
    // Step 2: Parse XLSX
    console.log('\n[Step 2] Parsing XLSX structure...');
    const excelProducts = parseXlsx();
    console.log(`Parsed ${excelProducts.length} products from XLSX`);
    
    // Step 3: Create mapping
    console.log('\n[Step 3] Creating image-to-product mapping...');
    const mapping = mapImagesToProducts(excelProducts, images);
    
    // Step 4: Update database
    console.log('\n[Step 4] Updating database...');
    const updated = updateDatabase(mapping);
    
    console.log('\n' + '='.repeat(60));
    console.log('COMPLETE!');
    console.log(`  ✓ Mapped ${updated} products to real CJ images`);
    console.log(`  ✓ Database: ${DB_PATH}`);
    console.log('='.repeat(60));
    
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
