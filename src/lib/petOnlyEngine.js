/**
 * PETONLY ENGINE V2.0 - PET-ONLY LOCKDOWN MODE
 * 
 * Centralized pet-product classification with strict lockdown enforcement.
 * Non-pet products (socks, office chairs, etc.) can NEVER appear in storefront.
 * 
 * MODES:
 * - "strict": All pet products (dog, cat, small pets)
 * - "dogcat": Only dog & cat products (safe mode)
 * 
 * ENV VARS:
 * - PETONLY_MODE: "strict" | "dogcat" (default: "strict")
 * - PETONLY_DEBUG: "true" for verbose logging
 * 
 * A product is pet-approved if ALL are true:
 * - active = true
 * - is_pet_product = true
 * - pet_type is valid (dog, cat, rabbit, guinea_pig, hamster, bird, fish, reptile, ferret, small_pets)
 * - category/sub_category/tags/title must NOT match human/lifestyle/furniture/clothing/office/kids patterns
 * - If ambiguous: default to NOT approved (fail closed)
 */

const PETONLY_MODE = process.env.PETONLY_MODE || 'strict';
const PETONLY_DEBUG = process.env.PETONLY_DEBUG === 'true';

// ═══════════════════════════════════════════════════════════════════════════════
// VALID PET TYPES - Products must have one of these
// ═══════════════════════════════════════════════════════════════════════════════
const VALID_PET_TYPES = [
  'dog', 'dogs', 'cat', 'cats', 'both',
  'rabbit', 'guinea_pig', 'hamster', 'bird', 'fish', 'reptile', 'ferret',
  'small_pets', 'small_pet', 'small-pets', 'small-pet', 'smallpets'
];

// ═══════════════════════════════════════════════════════════════════════════════
// HARD BLACKLIST - LOCKDOWN: Always exclude, no exceptions
// ═══════════════════════════════════════════════════════════════════════════════
const HARD_BLACKLIST = [
  // JEWELRY & ACCESSORIES (human)
  'jewelry', 'earring', 'necklace', 'bracelet', 'ring', 'pendant', 'charm', 'brooch',
  'anklet', 'cufflink', 'tiara', 'hairpin', 'barrette',
  
  // COSMETICS & BEAUTY
  'makeup', 'lipstick', 'mascara', 'eyeshadow', 'foundation', 'blush', 'cosmetic',
  'skincare', 'serum', 'moisturizer', 'perfume', 'cologne', 'nail polish',
  
  // ALCOHOL & TOBACCO
  'wine', 'whiskey', 'vodka', 'beer', 'alcohol', 'liquor', 'champagne', 'shot glass', 'goblet',
  'cigarette', 'vape', 'tobacco', 'cigar', 'hookah',
  
  // HUMAN CLOTHING (LOCKDOWN)
  'womens', 'mens fashion', 'dress shirt', 'human clothing', 'for women', 'for men',
  't-shirt', 'tee shirt', 'polo shirt', 'blouse', 'tank top', 'crop top',
  'jeans', 'trousers', 'slacks', 'shorts', 'skirt', 'dress', 'gown',
  'underwear', 'lingerie', 'bra', 'panties', 'boxer', 'briefs',
  'swimsuit', 'bikini', 'swimwear', 'bathing suit',
  'pajamas', 'sleepwear', 'nightgown', 'robe',
  'socks', 'stockings', 'tights', 'leggings', 'hosiery',
  'handbag', 'purse', 'clutch', 'wallet', 'backpack',
  'high heels', 'stilettos', 'pumps', 'loafers', 'sneakers', 'sandals', 'flip flops',
  
  // OFFICE & FURNITURE (LOCKDOWN)
  'office chair', 'desk chair', 'gaming chair', 'ergonomic chair',
  'office desk', 'computer desk', 'standing desk',
  'filing cabinet', 'bookshelf', 'office supplies', 'stapler', 'paper clip',
  'sofa', 'couch', 'loveseat', 'recliner', 'armchair',
  'dining table', 'coffee table', 'end table', 'nightstand',
  'wardrobe', 'dresser', 'chest of drawers', 'vanity',
  'mattress', 'bed frame', 'headboard',
  
  // KIDS & BABY (non-pet)
  'baby clothes', 'infant wear', 'toddler outfit', 'kids clothing',
  'baby bottle', 'pacifier', 'diaper', 'stroller', 'car seat',
  'baby monitor', 'crib', 'bassinet', 'high chair',
  'action figure', 'barbie', 'lego', 'building blocks',
  
  // ELECTRONICS
  '3d printer', 'e-commerce', 'phone case', 'laptop', 'tablet', 'computer',
  'smartphone', 'iphone', 'android', 'airpods', 'earbuds', 'headphones',
  'gaming console', 'xbox', 'playstation', 'nintendo', 'controller',
  'keyboard', 'mouse pad', 'webcam', 'monitor', 'printer',
  
  // PLUSH/TOYS (non-pet)
  'plush bunny', 'stuffed bunny', 'stuffed rabbit', 'toy doll', 'figure doll', 'action figure',
  'plush toy', 'stuffed animal', 'stuffed toy', 'teddy bear', 'plushie',
  
  // HOME DECOR (without pet context)
  'home decor', 'decoration', 'ornament', 'decorative',
  'wall art', 'canvas print', 'picture frame', 'mirror',
  'curtain', 'drapes', 'blinds', 'rug', 'carpet', 'doormat',
  'throw pillow', 'cushion cover', 'bedding set', 'duvet',
  'vase', 'candle', 'incense', 'diffuser',
  
  // KITCHEN & DINING (human)
  'cookware', 'frying pan', 'saucepan', 'pot', 'wok',
  'knife set', 'cutlery', 'silverware', 'utensils',
  'plates', 'dishes', 'dinnerware', 'glassware', 'mug', 'cup',
  'coffee maker', 'toaster', 'blender', 'mixer',
  
  // SPORTS & OUTDOOR (human)
  'golf club', 'tennis racket', 'basketball', 'football', 'soccer ball',
  'yoga mat', 'dumbbells', 'weights', 'treadmill', 'exercise bike',
  'camping tent', 'sleeping bag', 'hiking boots',
  
  // TOOLS & HARDWARE
  'power drill', 'screwdriver', 'wrench', 'hammer', 'saw',
  'toolbox', 'tool set', 'hardware', 'nuts and bolts',
  
  // AUTOMOTIVE
  'car parts', 'auto accessories', 'car seat cover', 'steering wheel cover',
  'windshield', 'tire', 'motor oil', 'car charger',
  
  // EXPLICIT NON-PET
  'for humans', 'human use', 'adult toy', 'sex toy', 'erotic', 'bdsm',
  'vibrator', 'dildo', 'lingerie set', 'sexy costume',
];

// Terms that indicate human clothing (check for pet context exceptions)
const HUMAN_CLOTHING_TERMS = [
  'hoodie', 'socks', 'shirt', 'clothing', 'apparel', 'shoes', 'sneakers', 'boots',
  'jeans', 'pants', 'skirt', 'blouse', 'jacket'
];

// Pet context terms that allow clothing exceptions
const PET_CLOTHING_CONTEXT = [
  'dog', 'cat', 'pet', 'puppy', 'kitten', 'harness', 'leash', 'collar', 'canine', 'feline'
];

// ═══════════════════════════════════════════════════════════════════════════════
// STRONG PET SIGNALS - Must have at least one
// ═══════════════════════════════════════════════════════════════════════════════
const DOG_SIGNALS = [
  'dog', 'puppy', 'canine', 'doggy', 'doggie', 'pup'
];

const CAT_SIGNALS = [
  'cat', 'kitten', 'feline', 'kitty', 'kitties'
];

const SMALL_PETS_SIGNALS = [
  'hamster', 'guinea pig', 'chinchilla', 'ferret', 'gerbil', 'mouse', 'mice', 'rat'
];

// Rabbit is special - allowed in small pets context but not as "bunny plush"
const RABBIT_SIGNALS = ['rabbit'];

const UNIVERSAL_PET_SIGNALS = [
  'harness', 'leash', 'collar', 'muzzle',
  'kennel', 'crate', 'cage', 'carrier',
  'litter', 'litter box', 'scoop',
  'feeder', 'bowl', 'water bowl', 'food bowl',
  'grooming', 'brush', 'nail clipper', 'shampoo',
  'chew toy', 'squeaky', 'treat', 'kibble', 'pet food',
  'pet bed', 'pet house', 'scratching post', 'cat tree',
  'dog toy', 'cat toy', 'pet toy'
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeText(product) {
  const parts = [
    product.title || '',
    product.description || '',
    product.category || '',
    product.sub_category || product.subcategory || '',
    product.mainCategorySlug || '',
    product.tags || '',
    product.pet_type || product.petType || ''
  ];
  return parts.join(' ').toLowerCase().trim();
}

function containsAny(haystack, terms) {
  return terms.some(term => haystack.includes(term.toLowerCase()));
}

function containsWord(haystack, word) {
  // Use word boundary that treats hyphen as part of word
  // This prevents "ring" from matching "harness-ring" or "o-ring"
  const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match word that is NOT preceded by hyphen/letter and NOT followed by hyphen/letter
  const regex = new RegExp(`(?<![a-z-])${escaped}(?![a-z-])`, 'i');
  return regex.test(haystack);
}

function containsWordStrict(haystack, word) {
  // Standard word boundary for clothing terms etc
  const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
  return regex.test(haystack);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function classify(product, mode = PETONLY_MODE) {
  const haystack = normalizeText(product);
  const reasons = [];
  
  // Check hard blacklist first - use word boundaries to avoid false positives
  // e.g., "ring" should not match "harness-ring", "bra" should not match "breathable"
  for (const term of HARD_BLACKLIST) {
    // Multi-word terms use substring match, single words use word boundary
    const isMatch = term.includes(' ') 
      ? haystack.includes(term.toLowerCase())
      : containsWord(haystack, term);
    
    if (isMatch) {
      // Check for pet context exceptions - these blacklisted terms are OK if pet context exists
      const petContextTerms = ['pet', 'dog', 'cat', 'puppy', 'kitten', 'canine', 'feline', 'doggy', 'kitty'];
      const hasPetContext = containsAny(haystack, petContextTerms);
      
      // Home decor exceptions for pet memorials
      if (['home decor', 'decoration', 'ornament', 'decorative'].includes(term)) {
        if (containsAny(haystack, ['pet memorial', 'dog memorial', 'cat memorial'])) {
          continue; // Allow pet memorials
        }
      }
      // Plush toy exceptions for pet toys
      if (['plush toy', 'stuffed animal', 'stuffed toy'].includes(term)) {
        if (containsAny(haystack, ['dog toy', 'cat toy', 'pet toy', 'chew toy'])) {
          continue; // Allow pet plush toys
        }
      }
      // Pet stroller/carrier exceptions
      if (['stroller'].includes(term)) {
        if (hasPetContext || containsAny(haystack, ['carrier', 'travel', 'pushchair', 'pram'])) {
          continue; // Allow pet strollers
        }
      }
      // Pet sofa/bed exceptions
      if (['sofa', 'couch', 'loveseat', 'recliner', 'armchair'].includes(term)) {
        if (hasPetContext || containsAny(haystack, ['bed', 'cushion', 'sleep', 'cozy', 'nest', 'calming'])) {
          continue; // Allow pet sofas/beds
        }
      }
      // Pet car seat exceptions
      if (['car seat', 'car seat cover'].includes(term)) {
        if (hasPetContext || containsAny(haystack, ['booster', 'travel', 'carrier', 'safety'])) {
          continue; // Allow pet car seats
        }
      }
      // Pet treadmill exceptions (exercise equipment for dogs)
      if (['treadmill', 'exercise bike'].includes(term)) {
        if (hasPetContext) {
          continue; // Allow pet exercise equipment
        }
      }
      // Pet tire toy exceptions (rubber chew toys)
      if (['tire'].includes(term)) {
        if (hasPetContext || containsAny(haystack, ['toy', 'chew', 'rubber', 'fetch', 'play'])) {
          continue; // Allow tire-shaped pet toys
        }
      }
      // Pet furniture exceptions (end tables that are pet houses)
      if (['end table', 'nightstand', 'coffee table'].includes(term)) {
        if (hasPetContext || containsAny(haystack, ['house', 'crate', 'kennel', 'indoor', 'hideaway'])) {
          continue; // Allow pet furniture that doubles as furniture
        }
      }
      reasons.push(`blacklist:${term}`);
      return { eligible: false, pet_type: 'unknown', reasons, rule: 'hard_blacklist' };
    }
  }
  
  // Check human clothing with pet context exception
  for (const term of HUMAN_CLOTHING_TERMS) {
    if (containsWord(haystack, term)) {
      if (!containsAny(haystack, PET_CLOTHING_CONTEXT)) {
        reasons.push(`human_clothing:${term}`);
        return { eligible: false, pet_type: 'unknown', reasons, rule: 'human_clothing' };
      }
    }
  }
  
  // Detect pet type
  const hasDogSignal = containsAny(haystack, DOG_SIGNALS);
  const hasCatSignal = containsAny(haystack, CAT_SIGNALS);
  const hasSmallPetsSignal = containsAny(haystack, SMALL_PETS_SIGNALS);
  const hasRabbitSignal = containsAny(haystack, RABBIT_SIGNALS);
  const hasUniversalSignal = containsAny(haystack, UNIVERSAL_PET_SIGNALS);
  
  // Determine pet_type
  let pet_type = 'unknown';
  if (hasDogSignal && hasCatSignal) {
    pet_type = 'both';
  } else if (hasDogSignal) {
    pet_type = 'dog';
  } else if (hasCatSignal) {
    pet_type = 'cat';
  } else if (hasSmallPetsSignal || hasRabbitSignal) {
    pet_type = 'small_pets';
  }
  
  // In dogcat mode, reject small pets
  if (mode === 'dogcat') {
    if (pet_type === 'small_pets') {
      reasons.push('mode:dogcat_no_small_pets');
      return { eligible: false, pet_type, reasons, rule: 'dogcat_mode' };
    }
    if (hasRabbitSignal && !hasDogSignal && !hasCatSignal) {
      reasons.push('mode:dogcat_no_rabbit');
      return { eligible: false, pet_type, reasons, rule: 'dogcat_mode' };
    }
  }
  
  // Check for strong pet signals
  const hasStrongSignal = hasDogSignal || hasCatSignal || hasUniversalSignal ||
    (mode === 'strict' && (hasSmallPetsSignal || hasRabbitSignal));
  
  if (!hasStrongSignal) {
    // Check if "pet" alone is present (not enough)
    if (containsWord(haystack, 'pet') || containsWord(haystack, 'pets')) {
      reasons.push('weak_signal:pet_only');
    } else {
      reasons.push('no_pet_signal');
    }
    return { eligible: false, pet_type, reasons, rule: 'no_strong_signal' };
  }
  
  // Special check for rabbit/bunny products
  if (hasRabbitSignal) {
    // Must be in small pets context, not plush
    const isSmallPetsContext = 
      haystack.includes('small pet') || 
      haystack.includes('small-pet') ||
      (product.mainCategorySlug || '').includes('small') ||
      (product.pet_type || product.petType || '').toLowerCase().includes('small');
    
    if (!isSmallPetsContext && !hasDogSignal && !hasCatSignal) {
      // Check for plush/toy context without pet toy
      if (containsAny(haystack, ['plush', 'stuffed', 'doll', 'figure'])) {
        if (!containsAny(haystack, ['dog toy', 'cat toy', 'pet toy', 'chew'])) {
          reasons.push('rabbit_plush_not_pet');
          return { eligible: false, pet_type: 'unknown', reasons, rule: 'rabbit_plush' };
        }
      }
    }
  }
  
  // Product is eligible
  return { eligible: true, pet_type, reasons: ['pass'], rule: 'eligible' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

function applyPetOnly(products, mode = PETONLY_MODE) {
  if (!Array.isArray(products)) return { products: [], stats: {} };
  
  const stats = {
    mode,
    total: products.length,
    eligible: 0,
    disabled: 0,
    reasons: {},
    byPetType: { dog: 0, cat: 0, small_pets: 0, both: 0, unknown: 0 }
  };
  
  const processed = products.map(p => {
    const result = classify(p, mode);
    
    if (result.eligible) {
      stats.eligible++;
      stats.byPetType[result.pet_type] = (stats.byPetType[result.pet_type] || 0) + 1;
      return {
        ...p,
        is_pet_product: true,
        _pet_type_detected: result.pet_type
      };
    } else {
      stats.disabled++;
      // Track reasons
      result.reasons.forEach(r => {
        stats.reasons[r] = (stats.reasons[r] || 0) + 1;
      });
      return {
        ...p,
        active: false,
        is_pet_product: false,
        _disabled_reason: result.reasons.join(', '),
        _disabled_rule: result.rule
      };
    }
  });
  
  if (PETONLY_DEBUG) {
    console.log('[PetOnlyEngine] Stats:', JSON.stringify(stats, null, 2));
  }
  
  return { products: processed, stats };
}

function filterEligibleOnly(products, mode = PETONLY_MODE) {
  if (!Array.isArray(products)) return [];
  return products.filter(p => {
    const result = classify(p, mode);
    return result.eligible;
  });
}

function getDebugStats(products, mode = PETONLY_MODE) {
  const countBefore = products.length;
  const { stats } = applyPetOnly(products, mode);
  
  // Get top 10 reasons
  const reasonsTop = Object.entries(stats.reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));
  
  return {
    mode,
    countBefore,
    countAfterFilter: stats.eligible,
    disabledByRuleCount: stats.disabled,
    filterApplied: 'petonly_engine',
    reasonsTop,
    byPetType: stats.byPetType
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PET-APPROVED CHECK - Single function for lockdown enforcement
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a product is pet-approved for storefront display.
 * This is the SINGLE SOURCE OF TRUTH for pet-only lockdown.
 * 
 * @param {Object} product - The product to check
 * @param {string} mode - 'strict' or 'dogcat'
 * @returns {{ approved: boolean, reason: string|null, pet_type: string }}
 */
function isPetApproved(product, mode = PETONLY_MODE) {
  if (!product) {
    return { approved: false, reason: 'no_product', pet_type: 'unknown' };
  }
  
  // 1. Must be active
  if (product.active === false || product.active === 0 || String(product.active).toLowerCase() === 'false') {
    return { approved: false, reason: 'inactive', pet_type: 'unknown' };
  }
  
  // 2. Must be marked as pet product (if field exists and is false)
  if (product.is_pet_product === false || product.isPetProduct === false) {
    return { approved: false, reason: 'not_pet_product_flag', pet_type: 'unknown' };
  }
  
  // 3. Must not be blocked
  if (product.blocked === true || product.isBlocked === true || product.blocked_reason) {
    return { approved: false, reason: 'blocked', pet_type: 'unknown' };
  }
  
  // 4. Run classification engine
  const result = classify(product, mode);
  
  if (!result.eligible) {
    return { 
      approved: false, 
      reason: result.reasons.join(', '), 
      pet_type: result.pet_type,
      rule: result.rule
    };
  }
  
  // 5. Validate pet_type is in allowed list
  const petType = (product.pet_type || product.petType || result.pet_type || '').toLowerCase().trim();
  const normalizedPetType = petType.replace(/-/g, '_');
  
  // If product has explicit pet_type, validate it
  if (petType && petType !== 'unknown' && !VALID_PET_TYPES.includes(normalizedPetType)) {
    return { approved: false, reason: `invalid_pet_type:${petType}`, pet_type: petType };
  }
  
  // 6. Must have valid image
  const image = product.image || (Array.isArray(product.images) && product.images[0]);
  if (!image || String(image).includes('no-image') || String(image).includes('placeholder')) {
    return { approved: false, reason: 'no_valid_image', pet_type: result.pet_type };
  }
  
  // 7. Must have valid price
  if (!product.price || parseFloat(product.price) <= 0) {
    return { approved: false, reason: 'invalid_price', pet_type: result.pet_type };
  }
  
  return { approved: true, reason: null, pet_type: result.pet_type };
}

/**
 * Get the reason why a product is NOT pet-approved (for logging/debugging).
 * Returns null if product IS approved.
 */
function getNonPetReason(product, mode = PETONLY_MODE) {
  const check = isPetApproved(product, mode);
  return check.approved ? null : check.reason;
}

/**
 * Filter products to only include pet-approved ones.
 * This is the main function for storefront/API filtering.
 */
function filterPetApproved(products, mode = PETONLY_MODE) {
  if (!Array.isArray(products)) return { products: [], stats: {} };
  
  const stats = {
    mode,
    total: products.length,
    approved: 0,
    rejected: 0,
    reasons: {},
    byPetType: { dog: 0, cat: 0, small_pets: 0, both: 0, unknown: 0 }
  };
  
  const approved = products.filter(p => {
    const check = isPetApproved(p, mode);
    
    if (check.approved) {
      stats.approved++;
      stats.byPetType[check.pet_type] = (stats.byPetType[check.pet_type] || 0) + 1;
      return true;
    } else {
      stats.rejected++;
      stats.reasons[check.reason] = (stats.reasons[check.reason] || 0) + 1;
      return false;
    }
  });
  
  return { products: approved, stats };
}

/**
 * Run cleanup job: scan all products and disable non-pet-approved ones.
 * Returns counts and logs reasons.
 */
function runCleanupJob(products, mode = PETONLY_MODE) {
  if (!Array.isArray(products)) return { processed: 0, disabled: 0, alreadyDisabled: 0, approved: 0, reasons: {} };
  
  const results = {
    processed: 0,
    disabled: 0,
    alreadyDisabled: 0,
    approved: 0,
    reasons: {},
    disabledProducts: []
  };
  
  for (const product of products) {
    results.processed++;
    
    // Skip already inactive products
    if (product.active === false) {
      results.alreadyDisabled++;
      continue;
    }
    
    const check = isPetApproved(product, mode);
    
    if (check.approved) {
      results.approved++;
    } else {
      results.disabled++;
      results.reasons[check.reason] = (results.reasons[check.reason] || 0) + 1;
      results.disabledProducts.push({
        id: product.id,
        title: (product.title || '').substring(0, 50),
        reason: check.reason,
        pet_type: check.pet_type
      });
    }
  }
  
  return results;
}

/**
 * Get lockdown status for admin dashboard.
 */
function getLockdownStatus(products, mode = PETONLY_MODE) {
  if (!Array.isArray(products)) {
    return { 
      error: 'No products provided', 
      total: 0, 
      active: 0, 
      petApprovedActive: 0, 
      nonPetActive: 0 
    };
  }
  
  const active = products.filter(p => p.active !== false);
  const { products: approved, stats } = filterPetApproved(active, mode);
  
  // Get top 10 blocked reasons
  const blockedReasonsTop = Object.entries(stats.reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));
  
  return {
    mode,
    lockdownEnabled: true,
    total: products.length,
    active: active.length,
    petApprovedActive: approved.length,
    nonPetActive: active.length - approved.length,
    inactive: products.length - active.length,
    byPetType: stats.byPetType,
    blockedReasonsTop,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  PETONLY_MODE,
  PETONLY_DEBUG,
  VALID_PET_TYPES,
  HARD_BLACKLIST,
  DOG_SIGNALS,
  CAT_SIGNALS,
  SMALL_PETS_SIGNALS,
  UNIVERSAL_PET_SIGNALS,
  normalizeText,
  classify,
  applyPetOnly,
  filterEligibleOnly,
  getDebugStats,
  // New lockdown functions
  isPetApproved,
  getNonPetReason,
  filterPetApproved,
  runCleanupJob,
  getLockdownStatus
};
