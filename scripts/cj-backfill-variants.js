#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/db.json');
const REPORT_PATH = path.join(__dirname, '../qa-reports/cj-variants-report.json');
const REPORT_MD_PATH = path.join(__dirname, '../qa-reports/cj-variants-report.md');

const report = {
  startTime: new Date().toISOString(),
  endTime: null,
  totalProducts: 0,
  productsWithVariants: 0,
  productsWithoutVariants: 0,
  totalVariants: 0,
  productsUpdated: 0,
  variantsAdded: 0,
  skippedNonPet: 0,
  errors: [],
  topProductsByVariants: []
};

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildOptionsSchema(variants) {
  const optionTypes = {};
  
  for (const v of variants) {
    if (v.options) {
      for (const [key, value] of Object.entries(v.options)) {
        if (!optionTypes[key]) {
          optionTypes[key] = new Set();
        }
        optionTypes[key].add(String(value));
      }
    }
  }
  
  return Object.entries(optionTypes).map(([name, values]) => ({
    name,
    values: [...values].sort()
  }));
}

async function main() {
  log('=== CJ Variants Backfill & Report ===');
  ensureDir(path.dirname(REPORT_PATH));
  
  if (!fs.existsSync(DB_PATH)) {
    log('ERROR: No db.json found');
    process.exit(1);
  }
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const products = db.products || [];
  
  report.totalProducts = products.length;
  
  log(`Found ${products.length} products in database`);
  
  const variantCounts = [];
  
  for (const product of products) {
    const variants = product.variants || [];
    const variantCount = variants.length;
    
    if (variantCount > 0) {
      report.productsWithVariants++;
      report.totalVariants += variantCount;
      
      variantCounts.push({
        id: product.id,
        spu: product.spu || product.id,
        title: (product.title || product.name || '').substring(0, 60),
        variantCount,
        optionsSchema: buildOptionsSchema(variants)
      });
    } else {
      report.productsWithoutVariants++;
      
      if (!product.rejected && product.active !== false) {
        product.variants = [{
          id: `${product.id}-STD`,
          sku: `${product.id}-STD`,
          title: 'Standard',
          price: product.price || 19.99,
          options: { Type: 'Standard' },
          image: product.image || null,
          active: true
        }];
        report.productsUpdated++;
        report.variantsAdded++;
      }
    }
    
    if (product.is_pet === false || product.rejected) {
      report.skippedNonPet++;
    }
  }
  
  variantCounts.sort((a, b) => b.variantCount - a.variantCount);
  report.topProductsByVariants = variantCounts.slice(0, 20);
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  log(`Updated ${report.productsUpdated} products with default variants`);
  
  report.endTime = new Date().toISOString();
  
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  log(`JSON report saved to ${REPORT_PATH}`);
  
  const mdReport = generateMarkdownReport(report);
  fs.writeFileSync(REPORT_MD_PATH, mdReport);
  log(`Markdown report saved to ${REPORT_MD_PATH}`);
  
  log('');
  log('=== Summary ===');
  log(`Total Products: ${report.totalProducts}`);
  log(`Products WITH Variants: ${report.productsWithVariants}`);
  log(`Products WITHOUT Variants: ${report.productsWithoutVariants}`);
  log(`Total Variants: ${report.totalVariants}`);
  log(`Products Updated: ${report.productsUpdated}`);
  log(`Non-Pet/Rejected: ${report.skippedNonPet}`);
  
  if (report.topProductsByVariants.length > 0) {
    log('');
    log('=== Top 5 Products by Variant Count ===');
    report.topProductsByVariants.slice(0, 5).forEach((p, i) => {
      log(`  ${i + 1}. ${p.title} (${p.variantCount} variants)`);
    });
  }
}

function generateMarkdownReport(r) {
  let md = `# CJ Variants Report\n\n`;
  md += `**Generated:** ${r.endTime}\n\n`;
  
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Products | ${r.totalProducts} |\n`;
  md += `| Products WITH Variants | ${r.productsWithVariants} |\n`;
  md += `| Products WITHOUT Variants | ${r.productsWithoutVariants} |\n`;
  md += `| Total Variants | ${r.totalVariants} |\n`;
  md += `| Avg Variants/Product | ${(r.totalVariants / Math.max(r.productsWithVariants, 1)).toFixed(1)} |\n`;
  md += `| Products Updated | ${r.productsUpdated} |\n`;
  md += `| Variants Added | ${r.variantsAdded} |\n`;
  md += `| Skipped Non-Pet | ${r.skippedNonPet} |\n`;
  md += `| Errors | ${r.errors.length} |\n\n`;
  
  md += `## Top 20 Products by Variant Count\n\n`;
  md += `| # | SPU | Title | Variants | Options |\n`;
  md += `|---|-----|-------|----------|----------|\n`;
  
  r.topProductsByVariants.forEach((p, i) => {
    const options = (p.optionsSchema || []).map(o => o.name).join(', ') || '-';
    md += `| ${i + 1} | ${p.spu} | ${p.title} | ${p.variantCount} | ${options} |\n`;
  });
  
  if (r.errors.length > 0) {
    md += `\n## Errors\n\n`;
    md += `\`\`\`\n`;
    r.errors.slice(0, 20).forEach(e => {
      md += `${e}\n`;
    });
    md += `\`\`\`\n`;
  }
  
  md += `\n## Commands\n\n`;
  md += `\`\`\`bash\n`;
  md += `npm run cj:backfill-variants  # Run this backfill\n`;
  md += `npm run qa:full               # Full QA suite\n`;
  md += `npm test                      # Run all tests\n`;
  md += `\`\`\`\n`;
  
  return md;
}

main().catch(err => {
  console.error('Fatal error:', err);
  report.errors.push(err.stack || err.message);
  process.exit(1);
});
