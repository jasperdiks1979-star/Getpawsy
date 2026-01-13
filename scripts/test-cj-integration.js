#!/usr/bin/env node
/**
 * CJ Integration Tests - Standalone
 * Run: node scripts/test-cj-integration.js
 */

const { normalizeProductVariants, validateVariantForCart, findVariantById } = require('../src/lib/variantLinker');
const { validateProductMapping } = require('../src/lib/cjSchema');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
    passed++;
  } catch (err) {
    console.log('✗', name);
    console.log('  Error:', err.message);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    },
    toHaveLength(len) {
      if (!Array.isArray(actual) || actual.length !== len) 
        throw new Error(`Expected length ${len}, got ${actual?.length}`);
    },
    toContain(str) {
      if (!actual || !actual.includes(str)) 
        throw new Error(`Expected "${actual}" to contain "${str}"`);
    }
  };
}

console.log('\n=== CJ Integration Tests ===\n');

// Test normalizeProductVariants
test('normalizeProductVariants - creates default variant for product without variants', () => {
  const product = { id: '12345', title: 'Test', price: 29.99 };
  const normalized = normalizeProductVariants(product);
  expect(normalized.variants).toHaveLength(1);
  expect(normalized.variants[0].isDefault).toBe(true);
  expect(normalized.defaultVariantId).toBe('12345::default');
});

test('normalizeProductVariants - preserves existing CJ variants', () => {
  const product = {
    id: '1996064726721794050',
    price: 49.99,
    variants: [
      { id: 'var1', cjSku: 'CJSKU001', title: 'Small', price: 49.99 },
      { id: 'var2', cjSku: 'CJSKU002', title: 'Large', price: 59.99 }
    ]
  };
  const normalized = normalizeProductVariants(product);
  expect(normalized.variants).toHaveLength(2);
  expect(normalized.hasRealVariants).toBe(true);
});

test('normalizeProductVariants - adds cjVariantId from cjSku', () => {
  const product = {
    id: 'test',
    variants: [{ id: 'v1', cjSku: 'CJSKU123', title: 'Test', price: 10 }]
  };
  const normalized = normalizeProductVariants(product);
  expect(normalized.variants[0].cjVariantId).toBe('CJSKU123');
});

// Test validateVariantForCart
test('validateVariantForCart - validates existing variant by id', () => {
  const product = {
    id: 'prod123',
    cjProductId: 'CJ-SPU-123',  // Required for CJ fulfillment
    variants: [
      { id: 'var-red', sku: 'SKU-R', cjVariantId: 'CJ1', price: 25.99, available: true }
    ]
  };
  const result = validateVariantForCart(product, 'var-red');
  expect(result.valid).toBe(true);
  expect(result.variant.id).toBe('var-red');
});

test('validateVariantForCart - validates variant by sku', () => {
  const product = {
    id: 'prod123',
    cjProductId: 'CJ-SPU-123',  // Required for CJ fulfillment
    variants: [
      { id: 'var1', sku: 'SKU-BLUE', cjVariantId: 'CJ2', price: 29.99, available: true }
    ]
  };
  const result = validateVariantForCart(product, 'SKU-BLUE');
  expect(result.valid).toBe(true);
});

test('validateVariantForCart - rejects out of stock variant', () => {
  const product = {
    id: 'prod123',
    variants: [
      { id: 'var-oos', sku: 'OOS', price: 25.99, available: false }
    ]
  };
  const result = validateVariantForCart(product, 'var-oos');
  expect(result.valid).toBe(false);
  expect(result.error).toContain('out of stock');
});

test('validateVariantForCart - auto-selects single variant', () => {
  const product = {
    id: 'single',
    cjProductId: 'CJ-SPU-SINGLE',  // Required for CJ fulfillment
    variants: [
      { id: 'single::default', sku: 'SINGLE', cjVariantId: 'CJVAR-SINGLE', price: 19.99, available: true, isDefault: true }
    ]
  };
  const result = validateVariantForCart(product, null);
  expect(result.valid).toBe(true);
  expect(result.variant.id).toBe('single::default');
});

test('validateVariantForCart - requires selection for multi-variant', () => {
  const product = {
    id: 'multi',
    variants: [
      { id: 'v1', sku: 'S1', price: 10, available: true },
      { id: 'v2', sku: 'S2', price: 12, available: true }
    ]
  };
  const result = validateVariantForCart(product, null);
  expect(result.valid).toBe(false);
  expect(result.error).toContain('select');
});

test('validateVariantForCart - returns 404 for null product', () => {
  const result = validateVariantForCart(null, 'any');
  expect(result.valid).toBe(false);
  expect(result.errorCode).toBe(404);
});

test('validateVariantForCart - returns cjReady status', () => {
  const product = {
    id: 'test',
    cjProductId: 'CJ-SPU-123',
    variants: [
      { id: 'v1', cjVariantId: 'CJ-VID-1', price: 10, available: true }
    ]
  };
  const result = validateVariantForCart(product, 'v1');
  expect(result.valid).toBe(true);
  expect(result.cjReady).toBe(true);
});

test('validateVariantForCart - rejects product without cjProductId when strict', () => {
  // Temporarily set strict mode
  process.env.CJ_REQUIRE_MAPPING = 'true';
  const product = {
    id: 'test',
    cjProductId: null,
    variants: [
      { id: 'v1', price: 10, available: true }
    ]
  };
  const result = validateVariantForCart(product, 'v1');
  expect(result.valid).toBe(false);
  expect(result.errorCode).toBe(409);
  // Reset
  delete process.env.CJ_REQUIRE_MAPPING;
});

// Test findVariantById
test('findVariantById - finds by id', () => {
  const product = {
    variants: [{ id: 'id1', sku: 'sku1', cjSku: 'cj1' }]
  };
  const v = findVariantById(product, 'id1');
  expect(v.id).toBe('id1');
});

test('findVariantById - finds by cjSku', () => {
  const product = {
    variants: [{ id: 'id1', sku: 'sku1', cjSku: 'cj1' }]
  };
  const v = findVariantById(product, 'cj1');
  expect(v.id).toBe('id1');
});

// Test validateProductMapping
test('validateProductMapping - passes valid product', () => {
  const product = {
    id: 'test',
    cjProductId: 'CJ-SPU-123',
    variants: [{ id: 'v1', cjVariantId: 'CJ-VID-1', sku: 'SKU1', available: true }],
    options: []
  };
  const result = validateProductMapping(product);
  expect(result.valid).toBe(true);
});

test('validateProductMapping - warns about missing cjProductId', () => {
  const product = {
    id: 'test',
    variants: [{ id: 'v1', sku: 'SKU1', available: true, isDefault: true }]
  };
  const result = validateProductMapping(product);
  const hasCjError = result.errors.some(e => e.includes('cjProductId'));
  expect(hasCjError).toBe(true);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
}
