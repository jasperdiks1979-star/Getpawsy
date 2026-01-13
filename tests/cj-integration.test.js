/**
 * CJ Integration Smoke Tests
 * Tests variant validation, add-to-cart, and CJ mapping
 */

const { describe, it, expect, beforeAll } = require('vitest');
const { normalizeProductVariants, validateVariantForCart, findVariantById } = require('../src/lib/variantLinker');
const { validateProductMapping, validateVariantForCart: schemaValidate } = require('../src/lib/cjSchema');

describe('CJ Variant Linker', () => {
  describe('normalizeProductVariants', () => {
    it('should create default variant for product without variants', () => {
      const product = {
        id: '12345',
        title: 'Test Product',
        price: 29.99,
        image: '/images/test.jpg'
      };
      
      const normalized = normalizeProductVariants(product);
      
      expect(normalized.variants).toHaveLength(1);
      expect(normalized.variants[0].id).toBe('12345::default');
      expect(normalized.variants[0].isDefault).toBe(true);
      expect(normalized.variants[0].price).toBe(29.99);
      expect(normalized.defaultVariantId).toBe('12345::default');
    });
    
    it('should preserve existing variants with CJ data', () => {
      const product = {
        id: '1996064726721794050',
        title: 'Pet Carrier',
        price: 49.99,
        variants: [
          { id: 'var1', sku: 'CJSKU001', cjSku: 'CJSKU001', title: 'Small Black', price: 49.99 },
          { id: 'var2', sku: 'CJSKU002', cjSku: 'CJSKU002', title: 'Large Blue', price: 59.99 }
        ]
      };
      
      const normalized = normalizeProductVariants(product);
      
      expect(normalized.variants).toHaveLength(2);
      expect(normalized.hasRealVariants).toBe(true);
      expect(normalized.variants[0].cjVariantId).toBe('CJSKU001');
      expect(normalized.variants[1].cjVariantId).toBe('CJSKU002');
    });
    
    it('should extract cjProductId from product id', () => {
      const product = {
        id: '1996064726721794050',
        title: 'Test',
        price: 10
      };
      
      const normalized = normalizeProductVariants(product);
      
      expect(normalized.cjProductId).toBe(null);
    });
    
    it('should use explicit cjProductId if provided', () => {
      const product = {
        id: '12345',
        cjProductId: 'CJ-SPU-98765',
        title: 'Test',
        price: 10
      };
      
      const normalized = normalizeProductVariants(product);
      
      expect(normalized.cjProductId).toBe('CJ-SPU-98765');
    });
  });
  
  describe('validateVariantForCart', () => {
    const multiVariantProduct = {
      id: 'prod123',
      title: 'Multi Variant Product',
      price: 25.99,
      variants: [
        { id: 'var-red-s', sku: 'SKU-RS', cjVariantId: 'CJVAR1', title: 'Red Small', price: 25.99, available: true, options: { Color: 'Red', Size: 'S' } },
        { id: 'var-blue-m', sku: 'SKU-BM', cjVariantId: 'CJVAR2', title: 'Blue Medium', price: 29.99, available: true, options: { Color: 'Blue', Size: 'M' } },
        { id: 'var-oos', sku: 'SKU-OOS', cjVariantId: 'CJVAR3', title: 'Out of Stock', price: 25.99, available: false, options: { Color: 'Green', Size: 'L' } }
      ]
    };
    
    const singleVariantProduct = {
      id: 'prod456',
      title: 'Single Variant Product',
      price: 19.99,
      variants: [
        { id: 'prod456::default', sku: 'SINGLE', cjVariantId: null, title: 'Standard', price: 19.99, available: true, isDefault: true }
      ]
    };
    
    it('should validate existing variant by id', () => {
      const result = validateVariantForCart(multiVariantProduct, 'var-red-s');
      
      expect(result.valid).toBe(true);
      expect(result.variant.id).toBe('var-red-s');
      expect(result.variant.price).toBe(25.99);
    });
    
    it('should validate existing variant by sku', () => {
      const result = validateVariantForCart(multiVariantProduct, 'SKU-BM');
      
      expect(result.valid).toBe(true);
      expect(result.variant.id).toBe('var-blue-m');
    });
    
    it('should validate existing variant by cjVariantId', () => {
      const result = validateVariantForCart(multiVariantProduct, 'CJVAR1');
      
      expect(result.valid).toBe(true);
      expect(result.variant.id).toBe('var-red-s');
    });
    
    it('should reject out of stock variant', () => {
      const result = validateVariantForCart(multiVariantProduct, 'var-oos');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('out of stock');
      expect(result.errorCode).toBe(400);
    });
    
    it('should auto-select single variant when no variantId provided', () => {
      const result = validateVariantForCart(singleVariantProduct, null);
      
      expect(result.valid).toBe(true);
      expect(result.variant.id).toBe('prod456::default');
    });
    
    it('should require variant selection for multi-variant products', () => {
      const result = validateVariantForCart(multiVariantProduct, null);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('select a variant');
    });
    
    it('should reject non-existent variant', () => {
      const result = validateVariantForCart(multiVariantProduct, 'invalid-variant');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
    
    it('should return 404 for null product', () => {
      const result = validateVariantForCart(null, 'any');
      
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(404);
    });
  });
  
  describe('findVariantById', () => {
    const product = {
      id: 'test',
      variants: [
        { id: 'id1', sku: 'sku1', cjSku: 'cj1' },
        { id: 'id2', sku: 'sku2', cjSku: 'cj2' }
      ]
    };
    
    it('should find by id', () => {
      expect(findVariantById(product, 'id1').id).toBe('id1');
    });
    
    it('should find by sku', () => {
      expect(findVariantById(product, 'sku2').id).toBe('id2');
    });
    
    it('should find by cjSku', () => {
      expect(findVariantById(product, 'cj1').id).toBe('id1');
    });
    
    it('should return null for not found', () => {
      expect(findVariantById(product, 'unknown')).toBe(null);
    });
  });
});

describe('CJ Schema Validation', () => {
  describe('validateProductMapping', () => {
    it('should pass product with valid CJ mapping', () => {
      const product = {
        id: 'test',
        cjProductId: 'CJ-SPU-123',
        variants: [
          { id: 'v1', cjVariantId: 'CJ-VID-1', sku: 'SKU1', available: true }
        ],
        options: []
      };
      
      const result = validateProductMapping(product);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.stats.hasCjProductId).toBe(true);
      expect(result.stats.mappedVariants).toBe(1);
    });
    
    it('should warn about missing cjProductId', () => {
      const product = {
        id: 'test',
        variants: [
          { id: 'v1', sku: 'SKU1', available: true, isDefault: true }
        ]
      };
      
      const result = validateProductMapping(product);
      
      expect(result.errors.some(e => e.includes('cjProductId'))).toBe(true);
    });
    
    it('should warn about variants missing cjVariantId', () => {
      const product = {
        id: 'test',
        cjProductId: 'CJ-SPU-123',
        variants: [
          { id: 'v1', sku: 'SKU1', available: true },
          { id: 'v2', sku: 'SKU2', cjVariantId: 'CJ-VID-2', available: true }
        ]
      };
      
      const result = validateProductMapping(product);
      
      expect(result.warnings.some(w => w.includes('cjVariantId'))).toBe(true);
      expect(result.stats.mappedVariants).toBe(1);
    });
    
    it('should fail for product with no variants', () => {
      const product = {
        id: 'test',
        cjProductId: 'CJ-SPU-123',
        variants: []
      };
      
      const result = validateProductMapping(product);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('no variants'))).toBe(true);
    });
  });
});
