#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'cj-mapping-audit-report.json');

function generateAuditReport() {
  console.log('[CJ Audit] Starting CJ mapping audit...');
  
  const catalogData = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalogData.products || catalogData;
  
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalProducts: 0,
      productsWithCjProductId: 0,
      productsMissingCjProductId: 0,
      totalVariants: 0,
      variantsWithCjVariantId: 0,
      variantsMissingCjVariantId: 0,
      fullyMapped: 0,
      partiallyMapped: 0,
      notMapped: 0
    },
    missingProductMapping: [],
    missingVariantMapping: [],
    fullyMappedProducts: []
  };
  
  products.forEach(product => {
    report.summary.totalProducts++;
    
    const hasCjProductId = !!product.cjProductId;
    
    if (hasCjProductId) {
      report.summary.productsWithCjProductId++;
    } else {
      report.summary.productsMissingCjProductId++;
      report.missingProductMapping.push({
        id: product.id,
        slug: product.slug,
        title: (product.title || product.name || '').substring(0, 60),
        missingFields: ['cjProductId']
      });
    }
    
    const variants = product.variants || [];
    let variantsWithCjId = 0;
    let variantsMissingCjId = 0;
    
    variants.forEach(variant => {
      report.summary.totalVariants++;
      
      const hasCjVariantId = !!(variant.cjVariantId || variant.cjSku);
      const isDefaultVariant = variant.isDefault || variant.id?.includes('::default');
      
      if (hasCjVariantId) {
        report.summary.variantsWithCjVariantId++;
        variantsWithCjId++;
      } else if (!isDefaultVariant) {
        report.summary.variantsMissingCjVariantId++;
        variantsMissingCjId++;
        
        report.missingVariantMapping.push({
          productId: product.id,
          productTitle: (product.title || product.name || '').substring(0, 40),
          variantId: variant.id,
          variantTitle: (variant.title || variant.variantNameEn || '').substring(0, 40),
          variantSku: variant.sku,
          missingFields: !variant.cjVariantId ? ['cjVariantId'] : [],
          hasCjProductId: hasCjProductId
        });
      }
    });
    
    if (hasCjProductId && variantsMissingCjId === 0) {
      report.summary.fullyMapped++;
      report.fullyMappedProducts.push(product.id);
    } else if (hasCjProductId || variantsWithCjId > 0) {
      report.summary.partiallyMapped++;
    } else {
      report.summary.notMapped++;
    }
  });
  
  report.missingVariantMapping = report.missingVariantMapping.slice(0, 100);
  report.fullyMappedProducts = report.fullyMappedProducts.slice(0, 50);
  
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  
  console.log('\n=== CJ MAPPING AUDIT REPORT ===');
  console.log(`Generated: ${report.generatedAt}`);
  console.log('\n--- PRODUCT SUMMARY ---');
  console.log(`Total Products: ${report.summary.totalProducts}`);
  console.log(`With cjProductId: ${report.summary.productsWithCjProductId} (${(100 * report.summary.productsWithCjProductId / report.summary.totalProducts).toFixed(1)}%)`);
  console.log(`Missing cjProductId: ${report.summary.productsMissingCjProductId}`);
  console.log('\n--- VARIANT SUMMARY ---');
  console.log(`Total Variants: ${report.summary.totalVariants}`);
  console.log(`With cjVariantId: ${report.summary.variantsWithCjVariantId} (${(100 * report.summary.variantsWithCjVariantId / report.summary.totalVariants).toFixed(1)}%)`);
  console.log(`Missing cjVariantId (non-default): ${report.summary.variantsMissingCjVariantId}`);
  console.log('\n--- MAPPING STATUS ---');
  console.log(`Fully Mapped: ${report.summary.fullyMapped}`);
  console.log(`Partially Mapped: ${report.summary.partiallyMapped}`);
  console.log(`Not Mapped: ${report.summary.notMapped}`);
  
  if (report.missingProductMapping.length > 0) {
    console.log('\n--- PRODUCTS MISSING cjProductId (first 10) ---');
    report.missingProductMapping.slice(0, 10).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.id}: ${p.title}`);
    });
  }
  
  if (report.missingVariantMapping.length > 0) {
    console.log('\n--- VARIANTS MISSING cjVariantId (first 10) ---');
    report.missingVariantMapping.slice(0, 10).forEach((v, i) => {
      console.log(`  ${i + 1}. ${v.productId} / ${v.variantId}: ${v.variantTitle}`);
    });
  }
  
  console.log(`\n[CJ Audit] Full report saved to: ${REPORT_PATH}`);
  
  return report;
}

if (require.main === module) {
  generateAuditReport();
}

module.exports = { generateAuditReport };
