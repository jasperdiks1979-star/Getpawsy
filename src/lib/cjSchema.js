/**
 * CJ Dropshipping Canonical Schema & Validation
 * Single source of truth for product/variant structure
 * 
 * PRODUCT SCHEMA:
 * {
 *   id: string,               // Internal product ID
 *   cjProductId: string,      // CJ SPU/PID (REQUIRED for fulfillment)
 *   title: string,
 *   slug: string,
 *   price: number,
 *   variants: Variant[],
 *   options: Option[],
 *   ...
 * }
 * 
 * VARIANT SCHEMA:
 * {
 *   id: string,               // Unique variant ID
 *   cjVariantId: string,      // CJ VID (REQUIRED for fulfillment)
 *   sku: string,              // Display SKU
 *   title: string,
 *   price: number,
 *   comparePrice: number|null,
 *   image: string|null,
 *   options: { Color?: string, Size?: string, ... },
 *   available: boolean,
 *   stock: number,
 *   warehouses: WarehouseStock[],
 *   preferredWarehouse: string|null
 * }
 * 
 * WAREHOUSE STOCK SCHEMA:
 * {
 *   warehouseId: string,
 *   countryCode: string,
 *   name: string,
 *   stock: number,
 *   cjStock: number,
 *   factoryStock: number
 * }
 */

const PREFERRED_WAREHOUSES = (process.env.CJ_PREFERRED_WAREHOUSES || 'US,USA').split(',').map(s => s.trim().toUpperCase());
const ALLOW_NON_US = process.env.CJ_ALLOW_NON_US === 'true';

/**
 * Normalize a CJ API product response to canonical schema
 * @param {object} cjProduct - Raw CJ API product data
 * @param {array} cjVariants - Raw CJ API variants
 * @param {object} cjInventory - Raw CJ API inventory data
 * @returns {object} Normalized product with canonical fields
 */
function normalizeCJProduct(cjProduct, cjVariants = [], cjInventory = {}) {
  if (!cjProduct?.pid) {
    return { error: 'Missing CJ product ID (pid)' };
  }

  const inventoryByVid = buildInventoryMap(cjInventory);
  
  const variants = (cjVariants || []).map(v => normalizeCJVariant(v, inventoryByVid));
  
  if (variants.length === 0) {
    variants.push(createDefaultVariant(cjProduct, cjInventory));
  }

  const options = buildOptionsFromVariants(variants);

  return {
    cjProductId: cjProduct.pid,
    cjSku: cjProduct.productSku || null,
    title: cjProduct.productNameEn || cjProduct.productName || '',
    description: cjProduct.description || cjProduct.productDescEn || '',
    image: cjProduct.productImage || null,
    images: cjProduct.productImageSet || [cjProduct.productImage].filter(Boolean),
    weight: parseFloat(cjProduct.productWeight) || 0,
    categoryId: cjProduct.categoryId || null,
    categoryName: cjProduct.categoryName || null,
    variants,
    options,
    hasRealVariants: variants.length > 1 || variants.some(v => v.cjVariantId !== null),
    defaultVariantId: variants[0]?.id || null
  };
}

/**
 * Normalize a CJ variant to canonical schema
 * @param {object} cjVariant - Raw CJ variant data
 * @param {Map} inventoryMap - VID -> inventory data map
 * @returns {object} Normalized variant
 */
function normalizeCJVariant(cjVariant, inventoryMap = new Map()) {
  const vid = cjVariant.vid || cjVariant.variantId || null;
  const inventory = inventoryMap.get(vid) || [];
  
  const warehouses = inventory.map(inv => ({
    warehouseId: inv.countryCode || 'UNKNOWN',
    countryCode: inv.countryCode || 'CN',
    name: inv.areaEn || inv.countryNameEn || inv.countryCode || 'Unknown',
    stock: inv.totalInventory || inv.totalInventoryNum || 0,
    cjStock: inv.cjInventory || inv.cjInventoryNum || 0,
    factoryStock: inv.factoryInventory || inv.factoryInventoryNum || 0
  }));

  const preferredWarehouse = selectPreferredWarehouse(warehouses);
  const totalStock = warehouses.reduce((sum, w) => sum + w.stock, 0);

  const options = {};
  if (cjVariant.variantProperty) {
    try {
      const props = typeof cjVariant.variantProperty === 'string' 
        ? JSON.parse(cjVariant.variantProperty) 
        : cjVariant.variantProperty;
      for (const prop of (Array.isArray(props) ? props : [])) {
        if (prop.propName && prop.propValue) {
          options[normalizeOptionName(prop.propName)] = prop.propValue;
        }
      }
    } catch (e) {}
  }

  if (cjVariant.variantNameEn && Object.keys(options).length === 0) {
    Object.assign(options, extractOptionsFromTitle(cjVariant.variantNameEn));
  }

  return {
    id: vid || cjVariant.variantSku || `cj-${Date.now()}`,
    cjVariantId: vid,
    sku: cjVariant.variantSku || vid || null,
    title: cjVariant.variantNameEn || cjVariant.variantName || 'Standard',
    price: parseFloat(cjVariant.variantSellPrice) || parseFloat(cjVariant.sellPrice) || 0,
    costPrice: parseFloat(cjVariant.variantPrice) || parseFloat(cjVariant.price) || 0,
    comparePrice: null,
    image: cjVariant.variantImage || null,
    options,
    available: totalStock > 0 || (preferredWarehouse !== null),
    stock: totalStock,
    warehouses,
    preferredWarehouse,
    isDefault: false
  };
}

/**
 * Create a default variant for products without explicit variants
 */
function createDefaultVariant(cjProduct, cjInventory) {
  const totalInventory = (cjInventory.inventories || []).reduce(
    (sum, inv) => sum + (inv.totalInventoryNum || 0), 0
  );

  const warehouses = (cjInventory.inventories || []).map(inv => ({
    warehouseId: inv.countryCode || 'UNKNOWN',
    countryCode: inv.countryCode || 'CN',
    name: inv.areaEn || inv.countryNameEn || 'Unknown',
    stock: inv.totalInventoryNum || 0,
    cjStock: inv.cjInventoryNum || 0,
    factoryStock: inv.factoryInventoryNum || 0
  }));

  return {
    id: `${cjProduct.pid}::default`,
    cjVariantId: null,
    sku: cjProduct.productSku || cjProduct.pid,
    title: 'Standard',
    price: parseFloat(cjProduct.sellPrice) || 0,
    costPrice: parseFloat(cjProduct.price) || 0,
    comparePrice: null,
    image: cjProduct.productImage || null,
    options: {},
    available: totalInventory > 0,
    stock: totalInventory,
    warehouses,
    preferredWarehouse: selectPreferredWarehouse(warehouses),
    isDefault: true
  };
}

/**
 * Build inventory map from CJ inventory response
 */
function buildInventoryMap(cjInventory) {
  const map = new Map();
  
  const variantInventories = cjInventory?.variantInventories || [];
  for (const vi of variantInventories) {
    if (vi.vid && vi.inventory) {
      map.set(vi.vid, vi.inventory);
    }
  }
  
  return map;
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
    if (match) return match.warehouseId;
  }
  
  if (ALLOW_NON_US) {
    const anyInStock = warehouses.find(w => w.stock > 0);
    if (anyInStock) return anyInStock.warehouseId;
  }
  
  return null;
}

/**
 * Build options array from variants
 */
function buildOptionsFromVariants(variants) {
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
 * Normalize option name (Color vs colour, Size vs size)
 */
function normalizeOptionName(name) {
  const normalized = String(name).trim();
  const lower = normalized.toLowerCase();
  
  if (lower === 'color' || lower === 'colour' || lower === 'colors') return 'Color';
  if (lower === 'size' || lower === 'sizes') return 'Size';
  if (lower === 'style' || lower === 'styles') return 'Style';
  if (lower === 'material' || lower === 'materials') return 'Material';
  
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Extract options from variant title
 */
function extractOptionsFromTitle(title) {
  if (!title) return {};
  
  const options = {};
  const titleLower = title.toLowerCase();
  
  const colors = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 
    'pink', 'brown', 'gray', 'grey', 'beige', 'navy', 'gold', 'silver'];
  const sizes = ['xs', 'xxs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl',
    'small', 'medium', 'large'];
  
  for (const size of sizes) {
    if (new RegExp(`\\b${size}\\b`, 'i').test(titleLower)) {
      options.Size = size.toUpperCase();
      break;
    }
  }
  
  const foundColors = [];
  for (const color of colors) {
    if (new RegExp(`\\b${color}\\b`, 'i').test(titleLower)) {
      foundColors.push(color.charAt(0).toUpperCase() + color.slice(1));
    }
  }
  if (foundColors.length > 0) {
    options.Color = foundColors.join(' And ');
  }
  
  return options;
}

/**
 * Validate a product has required CJ mapping
 * @param {object} product - Product to validate
 * @returns {object} Validation result with errors/warnings
 */
function validateProductMapping(product) {
  const errors = [];
  const warnings = [];
  
  if (!product) {
    return { valid: false, errors: ['Product is null or undefined'], warnings: [] };
  }

  if (!product.cjProductId && !product.id?.toString().includes('cj')) {
    errors.push('Missing cjProductId (SPU) - cannot fulfill via CJ');
  }

  if (!product.variants || product.variants.length === 0) {
    errors.push('Product has no variants');
  } else {
    let hasValidVariant = false;
    for (let i = 0; i < product.variants.length; i++) {
      const v = product.variants[i];
      
      if (!v.id && !v.sku) {
        errors.push(`Variant ${i}: Missing both id and sku`);
      }
      
      if (!v.cjVariantId && !v.cjSku && !v.isDefault) {
        warnings.push(`Variant ${i} (${v.title || v.id}): Missing cjVariantId`);
      } else {
        hasValidVariant = true;
      }
      
      if (!v.available && (v.stock === undefined || v.stock > 0)) {
        warnings.push(`Variant ${i}: Stock/availability mismatch`);
      }
    }
    
    if (!hasValidVariant && product.variants.length > 0 && !product.variants[0].isDefault) {
      errors.push('No variants have CJ mapping - fulfillment will fail');
    }
  }

  if (!product.options || product.options.length === 0) {
    if (product.hasRealVariants) {
      warnings.push('Product has real variants but no options schema');
    }
  } else {
    for (const opt of product.options) {
      if (!opt.name) {
        warnings.push('Option missing name');
      }
      if (!opt.values || opt.values.length === 0) {
        warnings.push(`Option ${opt.name}: No values defined`);
      }
    }
  }

  const usVariants = product.variants?.filter(v => 
    v.warehouses?.some(w => PREFERRED_WAREHOUSES.includes(w.countryCode?.toUpperCase()) && w.stock > 0)
  ) || [];
  
  if (usVariants.length === 0 && !ALLOW_NON_US) {
    warnings.push('No variants in stock at US warehouse');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      variantCount: product.variants?.length || 0,
      optionCount: product.options?.length || 0,
      hasCjProductId: !!product.cjProductId,
      mappedVariants: product.variants?.filter(v => v.cjVariantId || v.cjSku).length || 0,
      usStockVariants: usVariants.length
    }
  };
}

/**
 * Validate variant for add-to-cart
 * @param {object} product - Product containing the variant
 * @param {string} variantId - Requested variant ID
 * @param {number} quantity - Requested quantity
 * @returns {object} Validation result
 */
function validateVariantForCart(product, variantId, quantity = 1) {
  if (!product) {
    return { 
      valid: false, 
      error: 'Product not found',
      errorCode: 404
    };
  }

  if (!product.cjProductId) {
    return { 
      valid: false, 
      error: 'CJ product mapping missing - cannot fulfill',
      errorCode: 409
    };
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
  } else if (variants.length === 1) {
    variant = variants[0];
  }

  if (!variant) {
    return { 
      valid: false, 
      error: variants.length > 1 
        ? 'Please select a variant (size/color)' 
        : `Variant ${variantId} not found`,
      errorCode: 400
    };
  }

  if (!variant.cjVariantId && !variant.cjSku && !variant.isDefault) {
    return { 
      valid: false, 
      error: 'CJ variant mapping missing',
      errorCode: 409
    };
  }

  if (!variant.available) {
    return { 
      valid: false, 
      error: 'Variant is out of stock',
      errorCode: 400
    };
  }

  if (variant.stock !== undefined && variant.stock < quantity) {
    return { 
      valid: false, 
      error: `Only ${variant.stock} available`,
      errorCode: 400
    };
  }

  if (!ALLOW_NON_US && variant.warehouses?.length > 0) {
    const hasUsStock = variant.warehouses.some(w => 
      PREFERRED_WAREHOUSES.includes(w.countryCode?.toUpperCase()) && w.stock > 0
    );
    if (!hasUsStock) {
      return { 
        valid: false, 
        error: 'Item not available for US shipping',
        errorCode: 400
      };
    }
  }

  return {
    valid: true,
    variant,
    warehouseId: variant.preferredWarehouse || 'default'
  };
}

/**
 * Generate CJ order line item payload
 */
function getCJOrderLineItem(product, variant, quantity = 1) {
  return {
    vid: variant.cjVariantId || variant.cjSku || variant.sku,
    productId: product.cjProductId,
    variantId: variant.cjVariantId || variant.id,
    quantity,
    unitPrice: variant.price,
    variantName: variant.title,
    productName: product.title,
    warehouseId: variant.preferredWarehouse
  };
}

module.exports = {
  normalizeCJProduct,
  normalizeCJVariant,
  validateProductMapping,
  validateVariantForCart,
  getCJOrderLineItem,
  buildOptionsFromVariants,
  PREFERRED_WAREHOUSES,
  ALLOW_NON_US
};
