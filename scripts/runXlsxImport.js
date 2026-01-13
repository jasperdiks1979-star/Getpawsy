#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const XLSX_PATH = process.argv[2] || path.join(__dirname, '../attached_assets/CJ-Product-CSV_1765565665320.xlsx');

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`File not found: ${XLSX_PATH}`);
  process.exit(1);
}

console.log(`Starting CJ XLSX Import from: ${XLSX_PATH}`);

const { importXlsx } = require('../src/cjXlsxImport');

importXlsx(XLSX_PATH)
  .then(report => {
    console.log('\n========== IMPORT REPORT ==========');
    console.log(JSON.stringify(report, null, 2));
    console.log('====================================\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Import failed:', err.message);
    process.exit(1);
  });
