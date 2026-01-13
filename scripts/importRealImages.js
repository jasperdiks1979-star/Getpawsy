#!/usr/bin/env node

const { importXlsx, getProgress } = require('../src/cjXlsxImport.js');
const path = require('path');

const xlsxFile = path.join(__dirname, '../attached_assets/CJ-Product-CSV_1765565665320.xlsx');

console.log(`Importing real CJ images from XLSX: ${xlsxFile}`);
console.log('This will download actual product images from Column 13 (SKU Image)...\n');

importXlsx(xlsxFile)
  .then(report => {
    console.log('\n========== IMPORT COMPLETE ==========');
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('\nERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
