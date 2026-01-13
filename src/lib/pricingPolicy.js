"use strict";

const MIN_MARGIN_PERCENT = 35;
const DEFAULT_MARKUP = 2.4;
const MIN_PRICE = 9.99;
const MAX_PRICE = 999.99;
const COMPARE_PRICE_MULTIPLIER = 1.35;

const CATEGORY_MARKUPS = {
  "toys": 2.5,
  "feeding": 2.3,
  "grooming": 2.4,
  "beds": 2.2,
  "carriers": 2.0,
  "collars-leashes": 2.5,
  "health": 2.3,
  "clothing": 2.4,
  "training": 2.3,
  "travel": 2.0,
  "accessories": 2.5,
  "cages": 2.0,
  "aquarium": 2.2,
  "reptile": 2.2,
  "bird": 2.3,
  "small-animal": 2.3
};

function roundToNinetyNine(price) {
  return Math.floor(price) + 0.99;
}

function getMarkupForCategory(category) {
  const cat = (category || "").toLowerCase();
  return CATEGORY_MARKUPS[cat] || DEFAULT_MARKUP;
}

function calculateRetailPrice(costPrice, category) {
  const cost = parseFloat(costPrice) || 0;
  
  if (cost <= 0) {
    return MIN_PRICE;
  }
  
  const markup = getMarkupForCategory(category);
  let price = cost * markup;
  
  const minForMargin = cost / (1 - MIN_MARGIN_PERCENT / 100);
  if (price < minForMargin) {
    price = minForMargin;
  }
  
  price = roundToNinetyNine(price);
  
  if (price < MIN_PRICE) price = MIN_PRICE;
  if (price > MAX_PRICE) price = MAX_PRICE;
  
  return price;
}

function calculateComparePrice(retailPrice) {
  const price = parseFloat(retailPrice) || MIN_PRICE;
  
  if (price >= MAX_PRICE) {
    return null;
  }
  
  let compare = price * COMPARE_PRICE_MULTIPLIER;
  compare = roundToNinetyNine(compare);
  
  if (compare <= price) {
    compare = roundToNinetyNine(price * 1.5);
  }
  
  if (compare > MAX_PRICE) {
    compare = MAX_PRICE;
  }
  
  if (compare <= price) {
    return null;
  }
  
  return compare;
}

function calculateMargin(costPrice, retailPrice) {
  const cost = parseFloat(costPrice) || 0;
  const retail = parseFloat(retailPrice) || 0;
  
  if (retail <= 0) return 0;
  
  return Math.round(((retail - cost) / retail) * 100);
}

function validatePricing(product) {
  const issues = [];
  const cost = parseFloat(product.cj_price || product.costPrice || 0);
  const price = parseFloat(product.price || 0);
  const compare = parseFloat(product.compare_at_price || product.comparePrice || 0);
  
  if (price <= 0) {
    issues.push({ type: "critical", message: "Missing or zero price" });
  }
  
  if (price < MIN_PRICE) {
    issues.push({ type: "warning", message: `Price $${price} below minimum $${MIN_PRICE}` });
  }
  
  if (cost > 0) {
    const margin = calculateMargin(cost, price);
    if (margin < MIN_MARGIN_PERCENT) {
      issues.push({ 
        type: "warning", 
        message: `Low margin ${margin}% (min: ${MIN_MARGIN_PERCENT}%)`,
        suggestedPrice: calculateRetailPrice(cost, product.category)
      });
    }
    
    if (margin < 0) {
      issues.push({
        type: "critical",
        message: `Negative margin: selling below cost ($${cost} cost, $${price} price)`
      });
    }
  }
  
  if (compare > 0 && compare <= price) {
    issues.push({
      type: "warning",
      message: `Compare price ($${compare}) not greater than retail ($${price})`,
      suggestedCompare: calculateComparePrice(price)
    });
  }
  
  return {
    valid: issues.filter(i => i.type === "critical").length === 0,
    issues,
    calculated: {
      retailPrice: calculateRetailPrice(cost, product.category),
      comparePrice: calculateComparePrice(price),
      margin: calculateMargin(cost, price)
    }
  };
}

function applyPricingPolicy(product, options = {}) {
  const { dryRun = false, forceRecalculate = false } = options;
  const cost = parseFloat(product.cj_price || product.costPrice || 0);
  const currentPrice = parseFloat(product.price || 0);
  
  const changes = {};
  
  if (forceRecalculate || currentPrice <= 0) {
    const newPrice = calculateRetailPrice(cost, product.category);
    if (newPrice !== currentPrice) {
      changes.price = newPrice;
    }
  } else if (cost > 0) {
    const margin = calculateMargin(cost, currentPrice);
    if (margin < MIN_MARGIN_PERCENT) {
      changes.price = calculateRetailPrice(cost, product.category);
    }
  }
  
  const priceToUse = changes.price || currentPrice;
  const currentCompare = parseFloat(product.compare_at_price || product.comparePrice || 0);
  
  const newCompare = calculateComparePrice(priceToUse);
  
  if (newCompare === null) {
    if (currentCompare > 0) {
      changes.compare_at_price = null;
    }
  } else if (currentCompare <= priceToUse || currentCompare <= 0) {
    if (newCompare !== currentCompare) {
      changes.compare_at_price = newCompare;
    }
  }
  
  if (dryRun) {
    return { wouldChange: Object.keys(changes).length > 0, changes };
  }
  
  const result = {
    ...product,
    ...changes,
    price: changes.price || product.price,
    pricingUpdated: Object.keys(changes).length > 0 ? new Date().toISOString() : undefined
  };
  
  if (Object.hasOwn(changes, "compare_at_price")) {
    if (changes.compare_at_price === null) {
      delete result.compare_at_price;
    } else {
      result.compare_at_price = changes.compare_at_price;
    }
  } else {
    result.compare_at_price = product.compare_at_price;
  }
  
  return result;
}

module.exports = {
  MIN_MARGIN_PERCENT,
  DEFAULT_MARKUP,
  MIN_PRICE,
  MAX_PRICE,
  COMPARE_PRICE_MULTIPLIER,
  CATEGORY_MARKUPS,
  roundToNinetyNine,
  getMarkupForCategory,
  calculateRetailPrice,
  calculateComparePrice,
  calculateMargin,
  validatePricing,
  applyPricingPolicy
};
