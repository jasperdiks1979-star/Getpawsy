const { importFromXLSX, generateImportReport } = require('../src/cjImportFixed');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('Starting CJ Product Import (Fixed)...\n');
  
  const xlsxPath = path.join(__dirname, '../attached_assets/CJ-Product-CSV_1765565665320.xlsx');
  
  if (!fs.existsSync(xlsxPath)) {
    console.error('XLSX file not found:', xlsxPath);
    process.exit(1);
  }

  const result = await importFromXLSX(xlsxPath, { usOnly: false });
  
  console.log('\n=== IMPORT RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  const dbPath = path.join(__dirname, '../data/db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  
  console.log('\n=== IMPORT REPORT ===');
  const report = generateImportReport(db);
  console.log('Total CJ Products:', report.totalProducts);
  console.log('Total Variants:', report.totalVariants);
  console.log('Products without variants:', report.productsWithoutVariants.length);
  console.log('Products without images:', report.productsWithoutImages.length);
  
  if (report.top20ByVariants.length > 0) {
    console.log('\nTop 10 products by variant count:');
    report.top20ByVariants.slice(0, 10).forEach((p, i) => {
      console.log(`  ${i+1}. ${p.spu}: ${p.variants} variants - ${p.title.substring(0, 50)}`);
    });
  }

  if (report.warnings) {
    console.log('\nWarnings:', report.warnings);
  }

  console.log('\nDone!');
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
