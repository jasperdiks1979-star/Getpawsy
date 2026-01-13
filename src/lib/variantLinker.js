/**
 * CJ Variant Linking Module
 * Provides a normalized variant model for all products with CJ Dropshipping integration
 * 
 * PRODUCT SCHEMA:
 * {
 *   id: string,               // Internal product ID
 *   cjProductId: string|null, // CJ SPU/PID (REQUIRED for CJ fulfillment)
 *   ...
 * }
 * 
 * VARIANT SCHEMA:
 * {
 *   id: string,               // Unique variant ID (cjVariantId or productId::default)
 *   cjVariantId: string|null, // CJ VID (REQUIRED for CJ fulfillment)
 *   sku: string,              // SKU for CJ ordering (cjSku or productId)
 *   cjSku: string|null,       // CJ-specific SKU (null for default variants)
 *   title: string,            // Display name
 *   price: number,            // Variant price
 *   comparePrice: number|null,// Original/compare price
 *   image: string|null,       // Variant-specific image
 *   options: object,          // { Color: 'Red', Size: 'Large' }
 *   available: boolean,       // In stock
 *   stock: number,            // Stock quantity
 *   warehouses: array,        // Warehouse stock breakdown
 *   preferredWarehouse: string|null, // Best warehouse for fulfillment
 *   isDefault: boolean        // True for auto-generated default variants
 * }
 * 
 * OPTIONS SCHEMA:
 * [
 *   { name: 'Color', values: ['Red', 'Blue', 'Green'] },
 *   { name: 'Size', values: ['S', 'M', 'L', 'XL'] }
 * ]
 */

const PREFERRED_WAREHOUSES = (process.env.CJ_PREFERRED_WAREHOUSES || 'US,USA').split(',').map(s => s.trim().toUpperCase());
const ALLOW_NON_US = process.env.CJ_ALLOW_NON_US === 'true';

// Common color names for extraction
const COLORS = [
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
  'brown', 'gray', 'grey', 'beige', 'navy', 'teal', 'gold', 'silver', 'rose',
  'cream', 'coral', 'turquoise', 'khaki', 'maroon', 'olive', 'tan', 'burgundy'
];

// Common size names for extraction
const SIZES = [
  'xs', 'xxs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', '4xl',
  'small', 'medium', 'large', 'extra large', 'one size', 'standard'
];

/**
 * Check if a SKU looks like a CJ dropshipping SKU
 * @param {string} sku 
 * @returns {boolean}
 */
function isCJSku(sku) {
  if (!sku) return false;
  // CJ SKUs often start with CJ or have format like CJXXX...
  return /^CJ[A-Z0-9]{5,}/i.test(sku) || /^[A-Z]{2,4}\d{6,}[A-Z0-9]*$/i.test(sku);
}

/**
 * Extract options (Color, Size) from variant title
 * @param {string} title - Variant title like "Hand-knitted Cat Hat Black And White"
 * @returns {object} - { Color: 'Black And White', Size: 'M' }
 */
function extractOptionsFromTitle(title) {
  if (!title) return {};
  const options = {};
  const titleLower = title.toLowerCase();
  
  // Extract size first (more specific patterns)
  for (const size of SIZES) {
    const regex = new RegExp(`\\b${size}\\b`, 'i');
    if (regex.test(titleLower)) {
      options.Size = size.toUpperCase();
      break;
    }
  }
  
  // Also check for numeric sizes like "S/M/L" or "10cm"
  const sizeMatch = title.match(/\b([XSML]{1,3}L?)\b/i) || 
                    title.match(/\b(\d+(?:\.\d+)?(?:cm|mm|inch|"))\b/i);
  if (sizeMatch && !options.Size) {
    options.Size = sizeMatch[1].toUpperCase();
  }
  
  // Extract color
  const foundColors = [];
  for (const color of COLORS) {
    const regex = new RegExp(`\\b${color}\\b`, 'i');
    if (regex.test(titleLower)) {
      foundColors.push(color.charAt(0).toUpperCase() + color.slice(1));
    }
  }
  
  if (foundColors.length > 0) {
    options.Color = foundColors.join(' And ');
  }
  
  return options;
}

/**
 * Normalize a product to ensure it has variants[] and options[] with CJ mapping
 * @param {object} product - Raw product from catalog
 * @returns {object} - Product with normalized variants and options
 */
function normalizeProductVariants(product) {
  if (!product || !product.id) return product;
  
  const normalized = { ...product };
  
  // Ensure cjProductId is set (SPU)
  if (!normalized.cjProductId) {
    normalized.cjProductId = product.cj_product_id || product.cjSpu || product.spu || null;
  }
  
  // Ensure variants array exists
  if (!Array.isArray(normalized.variants)) {
    normalized.variants = [];
  }
  
  // If product has no variants, create a default variant
  if (normalized.variants.length === 0) {
    normalized.variants = [{
      id: `${product.id}::default`,
      cjVariantId: null,
      sku: product.sku || product.id,
      cjSku: product.cjSku || null,
      title: 'Standard',
      price: product.price || 0,
      comparePrice: product.comparePrice || product.compare_at_price || null,
      image: product.image || product.thumbnail || (product.images?.[0]) || null,
      options: {},
      available: product.stock !== 0,
      stock: product.stock || 0,
      warehouses: [],
      preferredWarehouse: null,
      isDefault: true
    }];
    normalized.hasRealVariants = false;
  } else {
    // Normalize existing variants
    normalized.variants = normalized.variants.map((v, idx) => {
      // Try to extract options from variant title if not set
      let options = v.options || v.optionValues || {};
      if (Object.keys(options).length === 0 && v.title) {
        options = extractOptionsFromTitle(v.title);
      }
      
      // Use sku as cjSku if it looks like a CJ SKU (starts with CJ or has proper format)
      const sku = v.sku || v.cjSku || v.variantSku || `${product.id}::var${idx}`;
      const cjSku = v.cjSku || v.variantSku || (isCJSku(sku) ? sku : null);
      const cjVariantId = v.cjVariantId || v.vid || cjSku;
      
      // Parse warehouses if available
      const warehouses = v.warehouses || [];
      const preferredWarehouse = selectPreferredWarehouse(warehouses);
      const stockValue = v.stock !== undefined ? v.stock : 
        (warehouses.length > 0 ? warehouses.reduce((sum, w) => sum + (w.stock || 0), 0) : undefined);
      
      return {
        id: v.id || sku,
        cjVariantId: cjVariantId,
        sku: sku,
        cjSku: cjSku,
        title: v.title || v.variantNameEn || v.name || `Option ${idx + 1}`,
        price: parseFloat(v.price) || product.price || 0,
        comparePrice: v.comparePrice || v.compare_at_price || product.comparePrice || null,
        image: v.image || v.variantImage || null,
        options: options,
        available: v.available !== false && stockValue !== 0,
        stock: stockValue,
        warehouses: warehouses,
        preferredWarehouse: preferredWarehouse,
        isDefault: false
      };
    });
    normalized.hasRealVariants = normalized.variants.length > 1 || 
      normalized.variants.some(v => v.cjSku !== null || v.cjVariantId !== null);
  }
  
  // Build options schema from variants
  normalized.options = buildOptionsSchema(normalized.variants);
  
  // Set default variant info at product level for quick access
  const defaultVariant = normalized.variants[0];
  normalized.defaultVariantId = defaultVariant?.id || null;
  normalized.defaultSku = defaultVariant?.sku || null;
  
  return normalized;
}

/**
 * Select preferred warehouse based on config
 */
function selectPreferredWarehouse(warehouses) {
  if (!warehouses || warehouses.length === 0) return null;
  
  for (const pref of PREFERRED_WAREHOUSES) {
    const match = warehouses.find(w => 
      w.countryCode?.toUpperCase() === pref && w.stock > 0
    );
    if (match) return match.warehouseId || match.countryCode;
  }
  
  if (ALLOW_NON_US) {
    const anyInStock = warehouses.find(w => w.stock > 0);
    if (anyInStock) return anyInStock.warehouseId || anyInStock.countryCode;
  }
  
  return null;
}

/**
 * Build options schema from variants array
 * @param {array} variants - Array of variants
 * @returns {array} - Options schema [{ name, values }]
 */
function buildOptionsSchema(variants) {
  const optionTypes = {};
  
  for (const v of variants) {
    if (v.options && typeof v.options === 'object') {
      for (const [key, value] of Object.entries(v.options)) {
        if (value) {
          if (!optionTypes[key]) {
            optionTypes[key] = new Set();
          }
          optionTypes[key].add(String(value));
        }
      }
    }
  }
  
  return Object.entries(optionTypes).map(([name, values]) => ({
    name,
    values: [...values].sort()
  }));
}

/**
 * Find variant by selected options
 * @param {object} product - Normalized product
 * @param {object} selectedOptions - { Color: 'Red', Size: 'L' }
 * @returns {object|null} - Matching variant or null
 */
function findVariantByOptions(product, selectedOptions) {
  if (!product?.variants?.length) return null;
  if (!selectedOptions || Object.keys(selectedOptions).length === 0) {
    return product.variants[0];
  }
  
  return product.variants.find(v => {
    if (!v.options) return false;
    return Object.entries(selectedOptions).every(([key, val]) => 
      v.options[key] === val
    );
  }) || null;
}

/**
 * Find variant by ID or SKU
 * @param {object} product - Normalized product
 * @param {string} variantIdOrSku - Variant ID or SKU
 * @returns {object|null} - Matching variant or null
 */
function findVariantById(product, variantIdOrSku) {
  if (!product?.variants?.length || !variantIdOrSku) return null;
  
  return product.variants.find(v => 
    v.id === variantIdOrSku || 
    v.sku === variantIdOrSku || 
    v.cjSku === variantIdOrSku
  ) || null;
}

/**
 * Validate that a variant belongs to a product
 * @param {object} product - Normalized product
 * @param {string} variantId - Variant ID to validate
 * @returns {object} - { valid: boolean, variant: object|null, error: string|null }
 */
function validateVariant(product, variantId) {
  if (!product?.id) {
    return { valid: false, variant: null, error: 'Invalid product' };
  }
  
  if (!variantId) {
    // Auto-select default variant
    if (product.variants?.length > 0) {
      return { 
        valid: true, 
        variant: product.variants[0], 
        error: null 
      };
    }
    return { valid: false, variant: null, error: 'Product has no variants' };
  }
  
  const variant = findVariantById(product, variantId);
  if (!variant) {
    return { 
      valid: false, 
      variant: null, 
      error: `Variant ${variantId} not found for product ${product.id}` 
    };
  }
  
  return { valid: true, variant, error: null };
}

/**
 * Get CJ order payload for a variant
 * @param {object} product - Normalized product
 * @param {object} variant - Variant object
 * @param {number} quantity - Order quantity
 * @returns {object} - CJ order line item payload
 */
function getCJOrderPayload(product, variant, quantity = 1) {
  return {
    vid: variant.cjVariantId || variant.cjSku || variant.sku,
    productId: product.cjProductId,
    quantity: quantity,
    shippingName: product.title || product.name,
    variantName: variant.title,
    unitPrice: variant.price,
    warehouseId: variant.preferredWarehouse || null
  };
}

/**
 * Validate variant for add-to-cart with CJ mapping check
 * @param {object} product - Normalized product
 * @param {string} variantId - Requested variant ID
 * @param {number} quantity - Requested quantity
 * @returns {object} - { valid, variant, error, errorCode }
 */
function validateVariantForCart(product, variantId, quantity = 1) {
  if (!product) {
    return { valid: false, error: 'Product not found', errorCode: 404 };
  }

  const variants = product.variants || [];
  let variant = null;

  if (variantId) {
    variant = variants.find(v => 
      v.id === variantId || 
      v.sku === variantId || 
      v.cjVariantId === variantId ||
      v.cjSku === variantId
    );
  }
  
  // Auto-select first/default variant if none found - NEVER BLOCK add to cart
  if (!variant && variants.length > 0) {
    variant = variants.find(v => v.isDefault) || variants[0];
    console.log(`[Cart] Auto-selecting variant for product ${product.id}:`, variant.id);
  }

  if (!variant) {
    // Only block if truly no variants exist (edge case)
    return { 
      valid: false, 
      error: 'No variants available for this product',
      errorCode: 400
    };
  }

  // Stock checks: WARN only, don't block add-to-cart (actual stock verified at checkout)
  if (variant.available === false) {
    console.log(`[Cart Stock Warning] Variant ${variant.id} marked unavailable`);
  }

  if (variant.stock !== undefined && variant.stock < quantity) {
    console.log(`[Cart Stock Warning] Variant ${variant.id} has ${variant.stock} available, requested ${quantity}`);
  }

  // Warehouse checks: WARN only for cart, actual warehouse verified at checkout/fulfillment
  if (!ALLOW_NON_US && variant.warehouses?.length > 0) {
    const hasUsStock = variant.warehouses.some(w => 
      PREFERRED_WAREHOUSES.includes(w.countryCode?.toUpperCase()) && w.stock > 0
    );
    if (!hasUsStock) {
      console.log(`[Cart Warehouse Warning] Variant ${variant.id} may not ship from US warehouse`);
    }
  }

  // Check CJ mapping for fulfillment readiness
  const hasCjProductId = !!product.cjProductId;
  const hasCjVariantId = !!(variant.cjVariantId || variant.cjSku);
  
  // CJ mapping check: WARN (never block) for cart - UX takes priority
  // Blocking happens at checkout/fulfillment stage where CJ mapping is required
  let cjMappingWarning = null;
  
  if (!hasCjProductId) {
    cjMappingWarning = 'missing_product_cj_id';
    console.log(`[Cart CJ Warning] Product ${product.id} missing cjProductId - may need manual fulfillment`);
  } else if (!hasCjVariantId && !variant.isDefault) {
    cjMappingWarning = 'variant_missing_cj_id';
    console.log(`[Cart CJ Warning] Variant ${variant.id} missing cjVariantId - may need manual fulfillment`);
  }

  return {
    valid: true,
    variant,
    warehouseId: variant.preferredWarehouse || 'default',
    errorCode: null,
    cjReady: hasCjProductId && hasCjVariantId,
    cjMappingWarning
  };
}

/**
 * Check if product requires variant selection
 * @param {object} product - Normalized product
 * @returns {boolean}
 */
function requiresVariantSelection(product) {
  return product?.hasRealVariants === true && product?.variants?.length > 1;
}

module.exports = {
  normalizeProductVariants,
  buildOptionsSchema,
  findVariantByOptions,
  findVariantById,
  validateVariant,
  validateVariantForCart,
  getCJOrderPayload,
  requiresVariantSelection,
  selectPreferredWarehouse,
  PREFERRED_WAREHOUSES,
  ALLOW_NON_US
};
