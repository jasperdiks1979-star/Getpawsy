/**
 * Smart Pricing Engine for GetPawsy
 * Calculates optimal retail prices based on cost, shipping, and category
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const PRICING_LOG = path.join(__dirname, '..', 'data', 'pricing-log.json');

const MARGIN_TIERS = [
  { maxCost: 6, multiplier: 2.70 },
  { maxCost: 10, multiplier: 2.30 },
  { maxCost: 15, multiplier: 2.00 },
  { maxCost: 25, multiplier: 1.75 },
  { maxCost: 40, multiplier: 1.55 },
  { maxCost: 70, multiplier: 1.40 },
  { maxCost: 120, multiplier: 1.30 },
  { maxCost: Infinity, multiplier: 1.22 }
];

const SUBCAT_MODIFIERS = {
  DOG_CHEW: 0.08,
  DOG_TUG: 0.08,
  CAT_PLAY: 0.08,
  DOG_BEDS: -0.05,
  CAT_BEDS: -0.05,
  DOG_WALK: 0.03,
  CAT_GROOM: 0.02,
  DOG_TRAINING: 0.02
};

const MIN_PROFIT = 3.50;
const MAX_MULTIPLIER_CAP = 3.2;
const MIN_SALE_PRICE = 3.99;

/**
 * Calculate the optimal sale price for a product variant
 */
function computeSalePrice({ costPrice, shippingCost = null, subcatKey = null, petType = null, warehouseUS = false, profile = 'default' }) {
  const cost = parseFloat(costPrice);
  
  if (isNaN(cost) || cost <= 0) {
    return { price: 9.99, needsPricingData: true, reason: 'Invalid cost price' };
  }
  
  // Calculate base cost with shipping buffer
  const shipping = parseFloat(shippingCost) || 0;
  const shippingBuffer = warehouseUS 
    ? Math.max(0.60, cost * 0.05)
    : Math.max(1.00, cost * 0.08);
  
  const baseCost = cost + shipping + (shipping > 0 ? 0 : shippingBuffer);
  
  // Get tier multiplier
  let multiplier = 1.22;
  for (const tier of MARGIN_TIERS) {
    if (baseCost <= tier.maxCost) {
      multiplier = tier.multiplier;
      break;
    }
  }
  
  // Apply subcategory modifier
  const subcatModifier = SUBCAT_MODIFIERS[subcatKey] || 0;
  const clampedModifier = Math.max(-0.08, Math.min(0.12, subcatModifier));
  multiplier += clampedModifier;
  
  // Calculate raw price
  let rawPrice = baseCost * multiplier;
  
  // Ensure minimum profit
  if (rawPrice < baseCost + MIN_PROFIT) {
    rawPrice = baseCost + MIN_PROFIT;
  }
  
  // Cap at max multiplier
  if (rawPrice > baseCost * MAX_MULTIPLIER_CAP) {
    rawPrice = baseCost * MAX_MULTIPLIER_CAP;
  }
  
  // Round to .99
  let salePrice = Math.floor(rawPrice) + 0.99;
  
  // Enforce minimum
  if (salePrice < MIN_SALE_PRICE) {
    salePrice = MIN_SALE_PRICE;
  }
  
  // Calculate margin
  const margin = ((salePrice - baseCost) / salePrice * 100).toFixed(1);
  const profit = (salePrice - baseCost).toFixed(2);
  
  return {
    price: parseFloat(salePrice.toFixed(2)),
    baseCost: parseFloat(baseCost.toFixed(2)),
    multiplier: parseFloat(multiplier.toFixed(2)),
    margin: parseFloat(margin),
    profit: parseFloat(profit),
    needsPricingData: false
  };
}

/**
 * Simple version that returns just the price number
 */
function computeSalePriceSimple(params) {
  const result = computeSalePrice(params);
  return result.price || 9.99;
}

/**
 * Reprice a single product's variants
 */
function repriceProduct(product, options = {}) {
  if (!product || !product.variants) {
    return { updated: false, reason: 'No variants' };
  }
  
  if (product.pricingLocked && !options.forceReprice) {
    return { updated: false, reason: 'Pricing locked' };
  }
  
  const updates = [];
  let hasUpdates = false;
  
  for (const variant of product.variants) {
    if (variant.priceSource === 'manual' && !options.forceReprice) {
      continue;
    }
    
    const costPrice = variant.costPrice || 0;
    if (costPrice <= 0) {
      variant.needsPricingData = true;
      continue;
    }
    
    const result = computeSalePrice({
      costPrice,
      shippingCost: variant.shippingCost,
      subcatKey: product.subcatKey,
      petType: product.petType,
      warehouseUS: variant.warehouse === 'US' || product.warehouse === 'US'
    });
    
    if (!result.needsPricingData) {
      const oldPrice = variant.salePrice || variant.price;
      const delta = result.price - (oldPrice || 0);
      
      variant.salePrice = result.price;
      variant.price = result.price;
      variant.priceSource = 'auto';
      variant.needsPricingData = false;
      
      updates.push({
        sku: variant.sku,
        oldPrice,
        newPrice: result.price,
        delta: parseFloat(delta.toFixed(2)),
        margin: result.margin
      });
      
      hasUpdates = true;
    } else {
      variant.needsPricingData = true;
    }
  }
  
  if (hasUpdates) {
    // Update product price range
    const prices = product.variants.map(v => v.salePrice || v.price).filter(p => p > 0);
    if (prices.length > 0) {
      product.priceFrom = Math.min(...prices);
      product.priceTo = Math.max(...prices);
      product.price = product.priceFrom;
    }
    product.pricingUpdatedAt = new Date().toISOString();
  }
  
  return {
    updated: hasUpdates,
    productId: product.id,
    variantsUpdated: updates.length,
    updates
  };
}

/**
 * Reprice all products in database
 */
function repriceAll(options = {}) {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const products = db.products || [];
    
    const results = {
      total: products.length,
      updated: 0,
      skipped: 0,
      variantsUpdated: 0,
      errors: [],
      avgDelta: 0
    };
    
    let totalDelta = 0;
    let deltaCount = 0;
    
    for (const product of products) {
      if (!product.active && !options.includeInactive) {
        results.skipped++;
        continue;
      }
      
      try {
        const result = repriceProduct(product, options);
        
        if (result.updated) {
          results.updated++;
          results.variantsUpdated += result.variantsUpdated;
          
          for (const u of result.updates || []) {
            totalDelta += Math.abs(u.delta);
            deltaCount++;
          }
        } else {
          results.skipped++;
        }
      } catch (err) {
        results.errors.push({ productId: product.id, error: err.message });
      }
    }
    
    // Save updated database
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    
    results.avgDelta = deltaCount > 0 ? parseFloat((totalDelta / deltaCount).toFixed(2)) : 0;
    
    // Log the action
    logPricingAction({
      action: 'reprice_all',
      ...results
    });
    
    log(`[Pricing] Repriced ${results.updated} products, ${results.variantsUpdated} variants`);
    
    return results;
  } catch (err) {
    log(`[Pricing] Reprice all error: ${err.message}`);
    return { error: err.message };
  }
}

/**
 * Preview repricing without saving
 */
function previewReprice(products) {
  const previews = [];
  
  for (const product of products) {
    if (!product.variants) continue;
    
    const variantPreviews = [];
    
    for (const variant of product.variants) {
      const costPrice = variant.costPrice || 0;
      if (costPrice <= 0) continue;
      
      const result = computeSalePrice({
        costPrice,
        shippingCost: variant.shippingCost,
        subcatKey: product.subcatKey,
        petType: product.petType,
        warehouseUS: variant.warehouse === 'US' || product.warehouse === 'US'
      });
      
      if (!result.needsPricingData) {
        const oldPrice = variant.salePrice || variant.price || 0;
        
        variantPreviews.push({
          sku: variant.sku,
          costPrice,
          oldPrice,
          newPrice: result.price,
          delta: parseFloat((result.price - oldPrice).toFixed(2)),
          margin: result.margin,
          profit: result.profit
        });
      }
    }
    
    if (variantPreviews.length > 0) {
      previews.push({
        productId: product.id,
        title: product.title,
        variants: variantPreviews
      });
    }
  }
  
  return previews;
}

/**
 * Lock/unlock pricing for a product
 */
function setPricingLock(productId, locked) {
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const product = (db.products || []).find(p => p.id === productId);
    
    if (!product) {
      return { error: 'Product not found' };
    }
    
    product.pricingLocked = locked;
    if (locked) {
      for (const v of product.variants || []) {
        v.priceSource = 'manual';
      }
    }
    
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    
    return { ok: true, productId, locked };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Log pricing action
 */
function logPricingAction(action) {
  try {
    const dir = path.dirname(PRICING_LOG);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let logs = [];
    if (fs.existsSync(PRICING_LOG)) {
      logs = JSON.parse(fs.readFileSync(PRICING_LOG, 'utf8'));
    }
    
    logs.push({ ...action, timestamp: new Date().toISOString() });
    if (logs.length > 200) logs = logs.slice(-150);
    
    fs.writeFileSync(PRICING_LOG, JSON.stringify(logs, null, 2));
  } catch (e) {}
}

/**
 * Get pricing logs
 */
function getPricingLogs(limit = 50) {
  try {
    if (fs.existsSync(PRICING_LOG)) {
      const logs = JSON.parse(fs.readFileSync(PRICING_LOG, 'utf8'));
      return logs.slice(-limit).reverse();
    }
  } catch (e) {}
  return [];
}

module.exports = {
  computeSalePrice: computeSalePriceSimple,
  computeSalePriceDetailed: computeSalePrice,
  repriceProduct,
  repriceAll,
  previewReprice,
  setPricingLock,
  getPricingLogs,
  MARGIN_TIERS,
  SUBCAT_MODIFIERS,
  MIN_PROFIT
};
