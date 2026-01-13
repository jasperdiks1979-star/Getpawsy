#!/usr/bin/env node
/**
 * NO-FALLBACK BUILD CHECK
 * 
 * This script runs at build time and FAILS if any fallback product patterns are detected.
 * It scans the codebase for forbidden patterns that would introduce mock/demo products.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FORBIDDEN_PATTERNS = [
  'defaultProducts',
  'staticProducts',
  'demoProducts', 
  'mockProducts',
  'fallbackProducts',
  'seedProducts',
  'testProducts'
];

const EXCLUDED_PATHS = [
  'node_modules',
  '.git',
  'attached_assets',
  'qa-reports',
  'scripts/check-no-fallback.mjs',
  'src/contracts/noFallbackContract.js',
  'tests/',
  '*.log',
  '*.md'
];

const SUSPICIOUS_FALLBACK_PATTERNS = [
  /\|\|\s*\[\s*\{[^}]*title[^}]*\}/,
  /\?\s*\[\s*\{[^}]*title[^}]*\}\s*\]/,
  /return\s+\[\s*\{[^}]*id:\s*['"]demo/i,
  /return\s+\[\s*\{[^}]*id:\s*['"]mock/i,
  /return\s+\[\s*\{[^}]*id:\s*['"]test/i
];

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║         NO-FALLBACK CONTRACT BUILD CHECK               ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');

let violations = [];

for (const pattern of FORBIDDEN_PATTERNS) {
  try {
    const excludeArgs = EXCLUDED_PATHS.map(p => `--glob '!${p}'`).join(' ');
    const cmd = `rg -l "${pattern}" ${excludeArgs} --type js --type json 2>/dev/null || true`;
    const result = execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
    
    if (result) {
      const files = result.split('\n').filter(f => f.trim());
      for (const file of files) {
        if (file.includes('sampleProducts') && (file.includes('debug') || file.includes('report'))) {
          continue;
        }
        
        const lineCmd = `rg -n "${pattern}" "${file}" 2>/dev/null || true`;
        const lineResult = execSync(lineCmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
        
        if (lineResult) {
          const lines = lineResult.split('\n').filter(l => {
            const lower = l.toLowerCase();
            return !lower.includes('sample') && 
                   !lower.includes('debug') && 
                   !lower.includes('report') &&
                   !lower.includes('// forbidden') &&
                   !lower.includes('// allowed');
          });
          
          if (lines.length > 0) {
            violations.push({
              pattern,
              file,
              lines: lines.slice(0, 3)
            });
          }
        }
      }
    }
  } catch (err) {
  }
}

const jsFiles = [
  'server.js',
  'helpers/topProducts.js',
  'src/collectionsApi.js',
  'src/productStore.js'
];

for (const jsFile of jsFiles) {
  const filePath = path.join(ROOT, jsFile);
  if (!fs.existsSync(filePath)) continue;
  
  const content = fs.readFileSync(filePath, 'utf-8');
  
  for (const regex of SUSPICIOUS_FALLBACK_PATTERNS) {
    const match = content.match(regex);
    if (match) {
      violations.push({
        pattern: 'Inline fallback array',
        file: jsFile,
        lines: [match[0].substring(0, 80) + '...']
      });
    }
  }
}

const productSourcePath = path.join(ROOT, 'data/products_cj.json');
if (!fs.existsSync(productSourcePath)) {
  console.error('❌ CRITICAL: Primary product source missing: data/products_cj.json');
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(productSourcePath, 'utf-8'));
  const products = data.products || data;
  
  if (!Array.isArray(products) || products.length === 0) {
    console.error('❌ CRITICAL: Product source is empty or invalid');
    process.exit(1);
  }
  
  console.log(`✅ Product source validated: ${products.length} products in products_cj.json`);
} catch (err) {
  console.error(`❌ CRITICAL: Failed to parse product source: ${err.message}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.log('');
  console.log('❌ FORBIDDEN FALLBACK PATTERNS DETECTED:');
  console.log('');
  
  for (const v of violations) {
    console.log(`  File: ${v.file}`);
    console.log(`  Pattern: ${v.pattern}`);
    for (const line of v.lines) {
      console.log(`    > ${line}`);
    }
    console.log('');
  }
  
  console.log('BUILD FAILED: Remove fallback patterns before deploying.');
  process.exit(1);
}

console.log('');
console.log('✅ NO-FALLBACK CHECK PASSED');
console.log('   - No forbidden product fallback patterns found');
console.log('   - Primary product source (products_cj.json) is valid');
console.log('');

process.exit(0);
