#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const XLSX_PATH = 'attached_assets/CJ-Product-CSV_1765565665320.xlsx';
const DB_PATH = 'data/db.json';
const CACHE_DIR = 'public/cache/images';

function log(msg) {
  console.log(`[ImageMapper] ${msg}`);
}

function getExtractedImages() {
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('cj_product_'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/cj_product_(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/cj_product_(\d+)/)?.[1] || '0');
      return numA - numB;
    });
  
  log(`Found ${files.length} extracted cj_product images`);
  return files;
}

function parseXlsxAllRows() {
  log(`Parsing XLSX (ALL rows): ${XLSX_PATH}`);
  
  const workbook = XLSX.readFile(XLSX_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const row = rawData[i];
    if (row && row.some(c => c && c.toString().toLowerCase().includes('spu'))) {
      headerRowIndex = i;
      break;
    }
  }
  
  const headers = rawData[headerRowIndex];
  let spuCol = -1;
  let warehouseCol = -1;
  
  headers.forEach((h, i) => {
    const hl = (h || '').toString().toLowerCase().trim();
    if (hl === 'spu' || hl.includes('spu')) spuCol = i;
    if (hl.includes('ship') && hl.includes('from') || hl.includes('warehouse')) warehouseCol = i;
  });
  
  log(`SPU column: ${spuCol}, Warehouse column: ${warehouseCol}`);
  
  const dataRows = rawData.slice(headerRowIndex + 1);
  const rows = [];
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length === 0 || row.every(c => !c)) continue;
    
    const spu = (row[spuCol] || '').toString().trim();
    const warehouse = warehouseCol >= 0 ? (row[warehouseCol] || '').toString().trim().toUpperCase() : '';
    
    if (!spu) continue;
    
    const isUS = warehouse.includes('US') || warehouse.includes('USA') || warehouse === '';
    
    rows.push({
      absoluteIndex: i,
      spu,
      warehouse,
      isUS
    });
  }
  
  log(`Parsed ${rows.length} total data rows`);
  log(`US warehouse rows: ${rows.filter(r => r.isUS).length}`);
  
  return rows;
}

function createSpuImageMapping(allRows, extractedImages) {
  const spuToImages = new Map();
  let mappedCount = 0;
  let unmappedCount = 0;
  
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    
    if (i < extractedImages.length) {
      const imageFile = extractedImages[i];
      const imagePath = `/cache/images/${imageFile}`;
      
      if (!spuToImages.has(row.spu)) {
        spuToImages.set(row.spu, {
          images: [],
          isUS: row.isUS
        });
      }
      
      spuToImages.get(row.spu).images.push({
        path: imagePath,
        file: imageFile,
        rowIndex: row.absoluteIndex
      });
      mappedCount++;
    } else {
      unmappedCount++;
    }
  }
  
  const usSPUs = Array.from(spuToImages.entries())
    .filter(([_, data]) => data.isUS)
    .reduce((map, [spu, data]) => {
      map.set(spu, data.images);
      return map;
    }, new Map());
  
  log(`Total SPUs: ${spuToImages.size}`);
  log(`US SPUs with images: ${usSPUs.size}`);
  log(`Images mapped: ${mappedCount}, Rows without images: ${unmappedCount}`);
  
  return usSPUs;
}

function updateDatabase(spuToImages) {
  log(`Updating database: ${DB_PATH}`);
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const products = db.products || [];
  let updated = 0;
  let variantsUpdated = 0;
  let notFound = 0;
  
  for (const product of products) {
    if (product.source !== 'CJ') continue;
    
    const spu = product.spu || product.id;
    const images = spuToImages.get(spu);
    
    if (images && images.length > 0) {
      const mainImage = images[0].path;
      const allImagePaths = [...new Set(images.map(img => img.path))];
      
      product.image = mainImage;
      product.images = allImagePaths;
      product.active = true;
      product.imageSource = 'extracted_xlsx';
      product.imageMappedAt = new Date().toISOString();
      
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant, idx) => {
          variant.image = images[idx % images.length].path;
          variantsUpdated++;
        });
      }
      
      updated++;
    } else {
      notFound++;
    }
  }
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  log(`Updated ${updated} products and ${variantsUpdated} variants`);
  log(`Products not found in mapping: ${notFound}`);
  
  return { updated, variantsUpdated, notFound };
}

function validateMapping(db, spuToImages) {
  const cjProducts = (db.products || []).filter(p => p.source === 'CJ');
  const issues = [];
  
  for (const product of cjProducts) {
    const spu = product.spu || product.id;
    const mappedImages = spuToImages.get(spu);
    
    if (!mappedImages) {
      issues.push(`${spu}: No images mapped`);
      continue;
    }
    
    if (product.image && product.image.includes('placeholder')) {
      issues.push(`${spu}: Still has placeholder image`);
    }
    
    const variantCount = (product.variants || []).length;
    const imageCount = mappedImages.length;
    
    if (variantCount > 0 && imageCount === 0) {
      issues.push(`${spu}: ${variantCount} variants but 0 images`);
    }
  }
  
  if (issues.length > 0) {
    log(`Validation issues (${issues.length}):`);
    issues.slice(0, 10).forEach(issue => console.log(`  - ${issue}`));
    if (issues.length > 10) {
      console.log(`  ... and ${issues.length - 10} more`);
    }
  } else {
    log(`Validation passed - no issues found`);
  }
  
  return issues;
}

function generateReport(db, spuToImages) {
  const cjProducts = (db.products || []).filter(p => p.source === 'CJ');
  const withImages = cjProducts.filter(p => p.image && !p.image.includes('placeholder'));
  const withoutImages = cjProducts.filter(p => !p.image || p.image.includes('placeholder'));
  
  console.log('\n' + '='.repeat(60));
  console.log('IMAGE MAPPING REPORT');
  console.log('='.repeat(60));
  console.log(`Total CJ Products: ${cjProducts.length}`);
  console.log(`Products with images: ${withImages.length}`);
  console.log(`Products without images: ${withoutImages.length}`);
  console.log(`US SPUs with mapped images: ${spuToImages.size}`);
  
  if (withoutImages.length > 0 && withoutImages.length <= 10) {
    console.log('\nProducts still missing images:');
    withoutImages.forEach(p => console.log(`  - ${p.spu}: ${p.title?.substring(0, 50)}...`));
  }
  
  const sampleProducts = withImages.slice(0, 5);
  console.log('\nSample mapped products:');
  sampleProducts.forEach(p => {
    console.log(`  - ${p.spu}: ${p.images?.length || 0} images, ${(p.variants || []).length} variants`);
  });
  
  console.log('='.repeat(60));
}

function main() {
  console.log('='.repeat(60));
  console.log('Extracted Image Mapper - CJ Products (Fixed Alignment)');
  console.log('='.repeat(60));
  
  try {
    const extractedImages = getExtractedImages();
    const allRows = parseXlsxAllRows();
    const spuToImages = createSpuImageMapping(allRows, extractedImages);
    const { updated, variantsUpdated, notFound } = updateDatabase(spuToImages);
    
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    validateMapping(db, spuToImages);
    generateReport(db, spuToImages);
    
    console.log('\nSUCCESS!');
    console.log(`  ✓ ${updated} products updated with real images`);
    console.log(`  ✓ ${variantsUpdated} variants updated`);
    if (notFound > 0) {
      console.log(`  ! ${notFound} products had no matching SPU in mapping`);
    }
    
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
