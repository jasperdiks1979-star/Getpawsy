#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('=== PDP Verification Report ===\n');

const activeProducts = db.products.filter(p => !p.rejected && p.active !== false);
console.log(`Total Active Products: ${activeProducts.length}`);

const withMultipleImages = activeProducts.filter(p => p.images && p.images.length > 1);
console.log(`Products with >1 gallery image: ${withMultipleImages.length}`);

const totalGalleryImages = activeProducts.reduce((sum, p) => sum + (p.images?.length || 0), 0);
console.log(`Total gallery images: ${totalGalleryImages}`);

const withVariants = activeProducts.filter(p => p.variants && p.variants.length > 0);
console.log(`Products with variants: ${withVariants.length}`);

const totalVariants = activeProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
console.log(`Total variants: ${totalVariants}`);

const optionStats = { Color: 0, Size: 0, Type: 0, Style: 0, Material: 0 };
activeProducts.forEach(p => {
  if (!p.variants) return;
  p.variants.forEach(v => {
    if (!v.options) return;
    Object.keys(v.options).forEach(key => {
      const k = key.toLowerCase();
      if (k === 'color' || k === 'colour') optionStats.Color++;
      else if (k === 'size') optionStats.Size++;
      else if (k === 'type') optionStats.Type++;
      else if (k === 'style') optionStats.Style++;
      else if (k === 'material') optionStats.Material++;
    });
  });
});
console.log(`\nOption types distribution:`);
Object.entries(optionStats).forEach(([k, v]) => console.log(`  ${k}: ${v} occurrences`));

let standardOnly = 0;
let duplicateStandard = 0;

activeProducts.forEach(p => {
  if (!p.variants || p.variants.length <= 1) return;
  
  const labels = p.variants.map(v => {
    if (!v.options) return 'Standard';
    const vals = Object.values(v.options).filter(x => x && x !== 'undefined');
    return vals.length > 0 ? vals.join(' / ') : 'Standard';
  });
  
  if (labels.every(l => l === 'Standard')) {
    standardOnly++;
  }
  
  const standardCount = labels.filter(l => l === 'Standard').length;
  if (standardCount > 1) {
    duplicateStandard++;
  }
});

console.log(`\nVariant Quality Checks:`);
console.log(`  Products with only "Standard" variants: ${standardOnly}`);
console.log(`  Products with duplicate "Standard": ${duplicateStandard}`);

const samples = withMultipleImages
  .filter(p => p.variants && p.variants.length > 1)
  .filter(p => {
    if (!p.variants[0]?.options) return false;
    const keys = Object.keys(p.variants[0].options).map(k => k.toLowerCase());
    return keys.includes('color') || keys.includes('colour') || keys.includes('size');
  })
  .slice(0, 5);

console.log(`\n=== 5 Sample PDPs with Gallery + Variants ===\n`);
samples.forEach((p, i) => {
  const colorCount = new Set(p.variants.map(v => v.options?.Color || v.options?.Colour).filter(Boolean)).size;
  const sizeCount = new Set(p.variants.map(v => v.options?.Size).filter(Boolean)).size;
  
  console.log(`${i + 1}. ${p.title}`);
  console.log(`   URL: /product/${p.slug || p.id}`);
  console.log(`   Gallery: ${p.images?.length || 0} images`);
  console.log(`   Variants: ${p.variants.length} (${colorCount} colors, ${sizeCount} sizes)`);
  console.log(`   Price range: $${Math.min(...p.variants.map(v => v.price))} - $${Math.max(...p.variants.map(v => v.price))}`);
  console.log('');
});

fs.writeFileSync(
  path.join(__dirname, '..', 'qa-reports', 'pdp-verification.md'),
  `# PDP Verification Report
  
Generated: ${new Date().toISOString()}

## Summary
- Active Products: ${activeProducts.length}
- Products with >1 image: ${withMultipleImages.length}
- Total gallery images: ${totalGalleryImages}
- Products with variants: ${withVariants.length}
- Total variants: ${totalVariants}

## Option Types
${Object.entries(optionStats).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Quality Checks
- Products with only "Standard" variants: ${standardOnly}
- Products with duplicate "Standard": ${duplicateStandard}

## Sample PDPs

${samples.map((p, i) => `### ${i + 1}. ${p.title}
- URL: \`/product/${p.slug || p.id}\`
- Gallery: ${p.images?.length || 0} images
- Variants: ${p.variants.length}
- Price: $${Math.min(...p.variants.map(v => v.price))} - $${Math.max(...p.variants.map(v => v.price))}
`).join('\n')}
`
);

console.log('Report saved to qa-reports/pdp-verification.md');
