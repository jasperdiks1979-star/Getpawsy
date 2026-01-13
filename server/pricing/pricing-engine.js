/**
 * GetPawsy Pricing Engine
 * Handles tiered markup, category overrides, and psychological rounding
 */

const MARKUP_TIERS = [
  { min: 0, max: 10, multiplier: 3.0 },
  { min: 10, max: 30, multiplier: 2.5 },
  { min: 30, max: 80, multiplier: 2.0 },
  { min: 80, max: 150, multiplier: 1.8 },
  { min: 150, max: Infinity, multiplier: 1.5 }
];

const CATEGORY_OVERRIDES = {
  'cages-habitats': { maxMultiplier: 1.8 },
  'small-pets/cages-habitats': { maxMultiplier: 1.8 },
  'toys': { multiplier: 2.5 },
  'food': { multiplier: 2.0 }
};

const MIN_PROFIT_USD = 5;
const MIN_MARGIN_ABOVE_COST = 0.01;

function getTierMultiplier(cost) {
  const costNum = parseFloat(cost) || 0;
  for (const tier of MARKUP_TIERS) {
    if (costNum >= tier.min && costNum < tier.max) {
      return tier.multiplier;
    }
  }
  return MARKUP_TIERS[MARKUP_TIERS.length - 1].multiplier;
}

function computeMultiplier(cost, categorySlug = null) {
  let multiplier = getTierMultiplier(cost);
  
  if (categorySlug) {
    const slug = String(categorySlug).toLowerCase();
    const override = CATEGORY_OVERRIDES[slug];
    if (override) {
      if (override.multiplier) {
        multiplier = override.multiplier;
      }
      if (override.maxMultiplier && multiplier > override.maxMultiplier) {
        multiplier = override.maxMultiplier;
      }
    }
  }
  
  return multiplier;
}

function psychologicalRound(price) {
  const priceNum = parseFloat(price) || 0;
  
  if (priceNum < 100) {
    return Math.floor(priceNum) + 0.99;
  } else if (priceNum < 250) {
    return Math.floor(priceNum) + 0.95;
  } else {
    return Math.round(priceNum / 10) * 10;
  }
}

function getRoundingRule(price) {
  const priceNum = parseFloat(price) || 0;
  if (priceNum < 100) return '.99';
  if (priceNum < 250) return '.95';
  return '.00 (nearest 10)';
}

function computeSuggestedPrice({ cost, categorySlug = null, title = null, petType = null }) {
  const costNum = parseFloat(cost) || 0;
  if (costNum <= 0) return { suggestedPrice: 0, multiplier: 0, roundingRule: 'N/A', error: 'Invalid cost' };
  
  // Normalize category mapping for consistency
  let normalizedCategory = categorySlug;
  if (petType === 'dog' || petType === 'dogs') normalizedCategory = 'dogs';
  else if (petType === 'cat' || petType === 'cats') normalizedCategory = 'cats';
  else if (petType === 'small_pet' || petType === 'small-pets') normalizedCategory = 'small-pets';

  const multiplier = computeMultiplier(costNum, normalizedCategory || categorySlug);
  let rawPrice = costNum * multiplier;
  
  const minPrice = costNum + MIN_PROFIT_USD;
  if (rawPrice < minPrice) {
    rawPrice = minPrice;
  }
  
  const suggestedPrice = psychologicalRound(rawPrice);
  const roundingRule = getRoundingRule(suggestedPrice);
  
  return {
    suggestedPrice: parseFloat(suggestedPrice.toFixed(2)),
    multiplier,
    roundingRule,
    rawPrice: parseFloat(rawPrice.toFixed(2))
  };
}

function validatePrice({ cost, newPrice }) {
  const costNum = parseFloat(cost) || 0;
  const priceNum = parseFloat(newPrice);
  
  const errors = [];
  const warnings = [];
  
  if (isNaN(priceNum)) {
    errors.push('Price must be a valid number');
    return { valid: false, errors, warnings };
  }
  
  if (priceNum <= 0) {
    errors.push('Price must be greater than 0');
  }
  
  if (costNum > 0 && priceNum < costNum + MIN_MARGIN_ABOVE_COST) {
    errors.push(`Price must be at least $${(costNum + MIN_MARGIN_ABOVE_COST).toFixed(2)} (cost + $0.01)`);
  }
  
  if (costNum > 0 && priceNum < costNum + MIN_PROFIT_USD) {
    warnings.push(`Price below recommended minimum profit of $${MIN_PROFIT_USD}`);
  }
  
  const margin = costNum > 0 ? ((priceNum - costNum) / priceNum * 100).toFixed(1) : null;
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    margin: margin ? `${margin}%` : null
  };
}

function normalizePrice(price) {
  let priceNum = parseFloat(price);
  if (isNaN(priceNum)) return null;
  if (priceNum > 5000) {
    priceNum = priceNum / 100;
  } else if (priceNum > 500) {
    priceNum = priceNum / 10;
  }
  return parseFloat(priceNum.toFixed(2));
}

module.exports = {
  computeMultiplier,
  psychologicalRound,
  computeSuggestedPrice,
  validatePrice,
  normalizePrice,
  getRoundingRule,
  MARKUP_TIERS,
  CATEGORY_OVERRIDES,
  MIN_PROFIT_USD,
  MIN_MARGIN_ABOVE_COST
};
