const assert = require('assert');

console.log('=== CART ADD TO CART TEST ===\n');

const mockProduct1Variant = {
  id: '123',
  title: 'Single Variant Product',
  price: 29.99,
  image: '/images/test.jpg',
  variants: [{ id: 'v1', price: 29.99 }]
};

const mockProductMultiVariant = {
  id: '456',
  title: 'Multi Variant Product',
  price: 19.99,
  image: '/images/test2.jpg',
  variants: [
    { id: 'v1', price: 19.99, options: { size: 'S' } },
    { id: 'v2', price: 24.99, options: { size: 'M' } },
    { id: 'v3', price: 29.99, options: { size: 'L' } }
  ]
};

const mockProductNoVariants = {
  id: '789',
  title: 'No Variants Product',
  price: 14.99,
  image: '/images/test3.jpg',
  variants: []
};

function resolveVariant(product, selectedOptions, variantId) {
  const variants = product.variants || [];
  
  if (variants.length === 0) {
    return {
      variantId: product.id,
      price: product.price,
      title: product.title,
      autoSelected: true
    };
  }
  
  if (variants.length === 1) {
    const v = variants[0];
    return {
      variantId: v.id || product.id,
      price: v.price || product.price,
      title: v.title || product.title,
      autoSelected: true
    };
  }
  
  if (variantId) {
    const matched = variants.find(v => String(v.id) === String(variantId));
    if (matched) {
      return {
        variantId: matched.id,
        price: matched.price || product.price,
        title: matched.title || product.title,
        autoSelected: false
      };
    }
  }
  
  return null;
}

console.log('TEST 1: Single variant product (auto-select)');
const result1 = resolveVariant(mockProduct1Variant, {}, null);
console.log('Input: product with 1 variant, no selection');
console.log('Output:', JSON.stringify(result1, null, 2));
assert(result1.variantId === 'v1', 'Should auto-select single variant');
assert(result1.autoSelected === true, 'Should be marked as auto-selected');
console.log('✅ PASSED\n');

console.log('TEST 2: Multi variant product WITHOUT selection (BLOCKED)');
const result2 = resolveVariant(mockProductMultiVariant, {}, null);
console.log('Input: product with 3 variants, no selection');
console.log('Output:', result2);
assert(result2 === null, 'Should return null when no variant selected');
console.log('✅ PASSED - Add to cart should be BLOCKED\n');

console.log('TEST 3: Multi variant product WITH selection');
const result3 = resolveVariant(mockProductMultiVariant, {}, 'v2');
console.log('Input: product with 3 variants, variantId=v2 selected');
console.log('Output:', JSON.stringify(result3, null, 2));
assert(result3.variantId === 'v2', 'Should match selected variant');
assert(result3.price === 24.99, 'Should use variant price');
console.log('✅ PASSED\n');

console.log('TEST 4: No variants product (use productId)');
const result4 = resolveVariant(mockProductNoVariants, {}, null);
console.log('Input: product with 0 variants');
console.log('Output:', JSON.stringify(result4, null, 2));
assert(result4.variantId === '789', 'Should use productId as variantId');
assert(result4.autoSelected === true, 'Should be marked as auto-selected');
console.log('✅ PASSED\n');

console.log('=== ALL TESTS PASSED ===');
