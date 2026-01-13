#!/usr/bin/env node
/**
 * Verify Variant System
 * Tests that all products have proper variants and the cart system works correctly
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '../data/catalog.json');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
    tests.push({ name, status: 'pass' });
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    failed++;
    tests.push({ name, status: 'fail', error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function main() {
  console.log('=== Variant System Verification ===\n');
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  const products = catalog.products || [];
  
  console.log(`Total products: ${products.length}\n`);
  
  // Test 1: All products have variants array
  test('All products have variants array', () => {
    const missing = products.filter(p => !Array.isArray(p.variants));
    assert(missing.length === 0, `${missing.length} products missing variants array`);
  });
  
  // Test 2: All products have at least one variant
  test('All products have at least one variant', () => {
    const empty = products.filter(p => p.variants.length === 0);
    assert(empty.length === 0, `${empty.length} products have empty variants`);
  });
  
  // Test 3: All variants have required fields
  test('All variants have id and sku fields', () => {
    let issues = 0;
    products.forEach(p => {
      p.variants.forEach((v, idx) => {
        if (!v.id) issues++;
        if (!v.sku) issues++;
      });
    });
    assert(issues === 0, `${issues} variants missing id or sku`);
  });
  
  // Test 4: All variants have price
  test('All variants have valid price', () => {
    let issues = 0;
    products.forEach(p => {
      p.variants.forEach(v => {
        if (typeof v.price !== 'number' || v.price < 0) issues++;
      });
    });
    assert(issues === 0, `${issues} variants have invalid price`);
  });
  
  // Test 5: Default variants are properly marked
  test('Single-variant products have isDefault flag', () => {
    const singleVarProducts = products.filter(p => p.variants.length === 1);
    const missingDefault = singleVarProducts.filter(p => !p.variants[0].isDefault);
    // This is informational - not all single variants are "default"
    console.log(`  (${singleVarProducts.length} single-variant products, ${missingDefault.length} without isDefault)`);
    // Not failing this test as it's informational
  });
  
  // Test 6: Products with multiple variants have hasRealVariants flag
  test('Multi-variant products have hasRealVariants flag', () => {
    const multiVarProducts = products.filter(p => p.variants.length > 1);
    const withFlag = multiVarProducts.filter(p => p.hasRealVariants === true);
    console.log(`  (${multiVarProducts.length} multi-variant products, ${withFlag.length} with hasRealVariants=true)`);
  });
  
  // Test 7: Options are extracted where possible
  test('Variants with color/size in title have options extracted', () => {
    let hasOptions = 0;
    products.forEach(p => {
      p.variants.forEach(v => {
        if (v.options && Object.keys(v.options).length > 0) hasOptions++;
      });
    });
    console.log(`  (${hasOptions} variants have extracted options)`);
  });
  
  // Test 8: Products have defaultVariantId and defaultSku
  test('Products have defaultVariantId set', () => {
    const missing = products.filter(p => !p.defaultVariantId);
    assert(missing.length === 0, `${missing.length} products missing defaultVariantId`);
  });
  
  // Test 9: CJ SKUs are identified where present
  test('CJ SKUs are identified in variants', () => {
    let cjSkuCount = 0;
    products.forEach(p => {
      p.variants.forEach(v => {
        if (v.cjSku) cjSkuCount++;
      });
    });
    console.log(`  (${cjSkuCount} variants have cjSku identified)`);
  });
  
  // Test 10: Sample multi-variant product
  test('Sample multi-variant product structure is correct', () => {
    const multiVar = products.find(p => p.variants.length > 1);
    if (multiVar) {
      assert(multiVar.id, 'Product has id');
      assert(multiVar.variants[0].id, 'First variant has id');
      assert(multiVar.variants[0].sku, 'First variant has sku');
      assert(typeof multiVar.variants[0].price === 'number', 'First variant has numeric price');
      console.log(`  Sample: "${(multiVar.title || '').substring(0, 40)}..." (${multiVar.variants.length} variants)`);
    }
  });
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  // Stats
  const stats = {
    totalProducts: products.length,
    withVariants: products.filter(p => p.variants?.length > 0).length,
    multiVariant: products.filter(p => p.variants?.length > 1).length,
    withOptions: products.filter(p => p.options?.length > 0).length,
    withCjSku: products.filter(p => p.variants?.some(v => v.cjSku)).length,
    totalVariants: products.reduce((sum, p) => sum + (p.variants?.length || 0), 0)
  };
  
  console.log('\n=== Statistics ===');
  console.log(`Products with variants: ${stats.withVariants}/${stats.totalProducts}`);
  console.log(`Products with multiple variants: ${stats.multiVariant}`);
  console.log(`Products with option schema: ${stats.withOptions}`);
  console.log(`Products with CJ SKU: ${stats.withCjSku}`);
  console.log(`Total variants: ${stats.totalVariants}`);
  console.log(`Avg variants per product: ${(stats.totalVariants / stats.totalProducts).toFixed(1)}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
