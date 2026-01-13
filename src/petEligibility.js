/**
 * Pet Eligibility Classifier V3
 * STRICT RULE-BASED filtering (NO AI): ONLY products physically used by animals
 * Rejects all animal-themed human products and non-pet items
 * 
 * NOTE: Primary filtering now done via petFilter.js (PET_CORE + HARD_DENY)
 */

const petFilter = require('./config/petFilter');

// ============ PET USAGE TYPES ============
const PET_USAGE_TYPES = {
  ANIMAL_USED: 'ANIMAL_USED',           // Product is physically used BY the animal - ALLOWED
  REJECTED_NON_PET: 'REJECTED_NON_PET'  // Not a real pet product - BLOCKED
};

// ============ STRICT CJ CATEGORY WHITELIST ============
// ONLY these CJ categories are allowed - product must be in one of these
const CJ_CATEGORY_WHITELIST = [
  'pet supplies', 'pet toys', 'pet beds', 'pet feeding', 'pet bowls',
  'pet grooming', 'pet health', 'pet training', 'pet carriers',
  'pet scratching', 'pet litter', 'pet toilets', 'pet leashes',
  'pet collars', 'pet harnesses', 'dog supplies', 'cat supplies',
  'dog toys', 'cat toys', 'dog beds', 'cat beds', 'dog bowls',
  'cat bowls', 'dog grooming', 'cat grooming', 'dog health', 'cat health',
  'dog training', 'cat training', 'dog carriers', 'cat carriers',
  'cat trees', 'scratchers', 'litter boxes', 'pet clothes', 'dog clothes',
  'cat clothes', 'pet accessories'
];

// ============ STRICT CATEGORY DENYLIST ============
// Products in these categories are ALWAYS rejected
const CJ_CATEGORY_DENYLIST = [
  'jewelry', 'ring', 'necklace', 'bracelet', 'earring', 'pendant',
  'apparel', 'clothing', 'dress', 'shirt', 'pants', 'jeans', 'skirt',
  'women', 'men', 'fashion', 'beauty', 'makeup', 'skincare', 'cosmetics',
  'home decor', 'decoration', 'ornament', 'figurine', 'statue',
  'kitchenware', 'cookware', 'tableware', 'dinnerware',
  'electronics', 'phone', 'gadget', 'computer', 'audio',
  'stationery', 'office', 'school', 'craft', 'diy', 'sewing',
  'furniture', 'bedding', 'curtains', 'rugs', 'carpets',
  'toys', 'games', 'puzzles', 'dolls' // human toys
];

// ============ ANIMAL-THEMED HUMAN PRODUCT INDICATORS ============
// These indicate the product is FOR HUMANS but has animal decoration
const ANIMAL_THEMED_INDICATORS = [
  'cute cat', 'cute dog', 'kawaii cat', 'kawaii dog', 'kawaii pet',
  'cat print', 'dog print', 'paw print', 'cat pattern', 'dog pattern',
  'cat earrings', 'dog earrings', 'cat ring', 'cat necklace', 'dog necklace',
  'cat charm', 'dog charm', 'paw charm', 'cat pendant', 'dog pendant',
  'cat keychain', 'dog keychain', 'paw keychain',
  'cat lover', 'dog lover', 'pet lover', 'cat mom', 'dog mom', 'dog dad',
  'cat lady', 'fur mama', 'fur baby', 'pet parent',
  'cat eye glasses', 'cat eye sunglasses', 'puppy love',
  'become your', 'animal theme', 'pet theme',
  'cat shape', 'dog shape', 'paw shape', 'animal shape',
  'cat decoration', 'dog decoration', 'cat ornament', 'dog ornament',
  'cat figurine', 'dog figurine', 'cat statue', 'dog statue',
  'stud earrings', 'dangle earrings', 'hoop earrings', 'drop earrings',
  'women\'s', 'men\'s', 'lady', 'girl', 'boy', 'woman', 'man'
];

// ============ STRICT ANIMAL-USED INDICATORS ============
// Product MUST contain at least one of these to be considered ANIMAL_USED
const ANIMAL_USED_INDICATORS = [
  // Feeding & drinking
  'pet bowl', 'dog bowl', 'cat bowl', 'food bowl', 'water bowl',
  'feeder', 'slow feeder', 'automatic feeder', 'water fountain', 'pet fountain',
  'feeding mat', 'food mat', 'placemat',
  // Sleeping & resting
  'pet bed', 'dog bed', 'cat bed', 'pet cushion', 'dog cushion', 'cat cushion',
  'pet mat', 'dog mat', 'cat mat', 'pet blanket', 'dog blanket', 'cat blanket',
  'pet house', 'dog house', 'cat house', 'kennel', 'crate',
  // Walking & restraint
  'leash', 'lead', 'harness', 'collar', 'pet strap', 'dog strap',
  'walking', 'walk', 'poop bag', 'waste bag', 'poo bag',
  // Toys
  'chew toy', 'dog toy', 'cat toy', 'pet toy', 'squeaky', 'squeak',
  'fetch', 'ball toy', 'rope toy', 'tug toy', 'interactive toy',
  'puzzle toy', 'treat toy', 'catnip', 'feather toy', 'wand toy',
  'laser toy', 'mouse toy', 'teaser',
  // Grooming
  'pet brush', 'dog brush', 'cat brush', 'grooming brush', 'deshedding',
  'pet comb', 'dog comb', 'cat comb', 'nail clipper', 'nail trimmer',
  'pet shampoo', 'dog shampoo', 'cat shampoo', 'pet soap',
  'grooming glove', 'grooming tool', 'fur remover', 'lint roller',
  // Litter & toilet
  'litter', 'litter box', 'litter tray', 'litter scoop', 'litter mat',
  'potty', 'pee pad', 'puppy pad', 'training pad', 'toilet',
  // Cat furniture
  'cat tree', 'cat tower', 'scratching post', 'scratcher', 'scratch pad',
  'cat condo', 'climbing', 'cat shelf', 'cat perch', 'cat hammock',
  // Health & care
  'flea', 'tick', 'pet medicine', 'pet vitamin', 'pet supplement',
  'dental chew', 'dental stick', 'pet treat', 'dog treat', 'cat treat',
  // Carriers & travel
  'pet carrier', 'dog carrier', 'cat carrier', 'pet bag', 'pet backpack',
  'pet stroller', 'travel bowl', 'travel cage',
  // Clothing (for animals)
  'dog coat', 'dog jacket', 'dog sweater', 'dog shirt', 'dog dress',
  'cat coat', 'cat jacket', 'cat sweater', 'pet coat', 'pet jacket',
  'pet raincoat', 'dog raincoat', 'pet costume', 'dog costume',
  // Training
  'training', 'clicker', 'whistle', 'pet gate', 'dog gate',
  // Identification
  'pet tag', 'dog tag', 'cat tag', 'id tag', 'pet id'
];

// ============ STRICT DENY KEYWORDS ============
// ANY product with these keywords is REJECTED - no exceptions
const DENY_KEYWORDS = [
  // Jewelry & accessories (STRICT - per user request)
  'ring', 'necklace', 'jewelry', 'pendant', 'bracelet', 'earrings', 'charm', 'brooch',
  'anklet', 'cufflink', 'watch band', 'tiara', 'keychain', 'key ring', 'keyring',
  // Clothing & apparel (STRICT - per user request)
  'sweater', 'shirt', 'hoodie', 'dress', 'pants', 'shoes', 'sandal', 'sandals',
  'bra', 'lingerie', 'jeans', 'skirt', 'blouse', 'shorts', 'swimsuit', 'swimwear',
  'tshirt', 't-shirt', 'bikini', 'underwear', 'apparel', 'clothing',
  // Home & kitchen (STRICT - per user request)
  'mug', 'glass', 'cup', 'kitchen', 'pillow', 'blanket', 'phone case',
  'sticker', 'poster', 'decor', 'decoration', 'ornament',
  'kitchen knife', 'cutting board', 'pot', 'pan', 'cookware', 'bakeware',
  'curtain', 'tablecloth', 'pillow case', 'bed sheet',
  // Beauty & personal care
  'beauty', 'skincare', 'makeup', 'wig', 'eyelash', 'nail art', 'lipstick',
  'mascara', 'foundation', 'eyeshadow', 'hair extension', 'cosmetics',
  // Crafts & DIY
  'scrapbook', 'diy', 'craft', 'mold', 'carbon steel', 
  'sewing', 'embroidery', 'cross stitch', 'knitting',
  'resin mold', 'silicone mold', 'cake mold', 'chocolate mold',
  // Electronics
  'phone holder', 'car mount', 'earphone', 'headphone', 'speaker bluetooth',
  // Adult content
  'cosplay', 'costume', 'maid outfit', 'sexy dress', 'sexy costume', 
  'adult toy', 'erotic', 'vibrator',
  // False positives - animal themed human products
  'cat eye glasses', 'cat eye sunglasses', 'puppy love', 'doggy style',
  'cat lover', 'dog lover', 'pet lover', 'cat mom', 'dog mom', 'dog dad',
  'cat lady', 'fur mama', 'fur baby', 'pet parent',
  'figurine', 'statue', 'sculpture'
];

// ============ HEURISTIC DENY PHRASES ============
// If title contains ANY of these phrases -> REJECT immediately
const HEURISTIC_DENY_PHRASES = [
  'women', 'men', 'fashion', 'clothing', 'european size',
  'lady', 'girl', 'boy', 'woman', 'man',
  "women's", "men's", 'for women', 'for men',
  'become your', 'cute cat', 'cute dog', 'kawaii',
  'stud earrings', 'dangle earrings', 'hoop earrings', 'drop earrings',
  'cat print', 'dog print', 'paw print', 'cat pattern', 'dog pattern',
  'cat earrings', 'dog earrings', 'cat necklace', 'dog necklace',
  'cat charm', 'dog charm', 'paw charm', 'cat pendant', 'dog pendant',
  'cat keychain', 'dog keychain', 'paw keychain',
  'cat decoration', 'dog decoration', 'cat ornament', 'dog ornament',
  'cat figurine', 'dog figurine', 'cat statue', 'dog statue',
  'retro asymmetric', 'high-grade earrings', 'special-interest design'
];

// ============ ALLOW KEYWORDS ============
const ALLOW_KEYWORDS = [
  'dog toy', 'cat toy', 'chew', 'tug', 'leash', 'harness', 'collar',
  'pet bowl', 'feeder', 'litter', 'litter box', 'scratching', 'scratcher', 'cat tree',
  'grooming', 'brush', 'pet shampoo', 'flea', 'tick', 'treats', 'training',
  'kennel', 'crate', 'carrier', 'pet bed', 'poop bag', 'waste bag',
  'puppy pad', 'pee pad', 'water fountain', 'pet clothes',
  'interactive pet toy', 'puzzle toy', 'dental chew'
];

// Pet words + supply words that combine for bonus points
const PET_WORDS = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'canine', 'feline', 'paw'];
const SUPPLY_WORDS = ['toy', 'bed', 'bowl', 'feeder', 'collar', 'leash', 'harness', 'carrier', 'crate', 'treats', 'food', 'brush', 'shampoo', 'grooming'];

// ============ CATEGORY PATTERNS ============
const PET_CATEGORY_ALLOW_PATTERNS = [
  'pet', 'pet supplies', 'dog supplies', 'cat supplies',
  'pet toy', 'dog toy', 'cat toy', 'pet beds', 'pet grooming',
  'pet feeding', 'pet bowls', 'pet collar', 'pet leash', 'pet harness',
  'pet training', 'litter', 'scratcher', 'cat tree', 'carrier', 'crate', 'kennel'
];

const PET_CATEGORY_DENY_PATTERNS = [
  'jewelry', 'apparel', 'women', 'men', 'clothing', 'fashion',
  'beauty', 'makeup', 'health', 'office', 'stationery',
  'craft', 'diy', 'tools', 'adult', 'lingerie',
  'home decor', 'phone', 'electronics'
];

// Exceptions for category deny (pet GPS is okay under electronics)
const CATEGORY_DENY_EXCEPTIONS = {
  'electronics': ['pet gps', 'pet tracker', 'dog gps', 'cat gps'],
  'health': ['pet health', 'dog health', 'cat health', 'pet vitamin', 'pet supplement'],
  'home decor': ['pet mat', 'dog mat', 'cat mat', 'pet rug']
};

// ============ PET SCOPES ============
const PET_SCOPES = {
  any_pet: { keywords: ['pet', 'dog', 'cat', 'puppy', 'kitten'], categories: ['pet'] },
  dog_toys: { keywords: ['dog toy', 'puppy toy', 'chew toy', 'fetch', 'tug', 'squeaky'], categories: ['dog toy'] },
  dog_walk: { keywords: ['leash', 'harness', 'collar', 'dog walk', 'lead', 'poop bag', 'waste bag'], categories: ['dog walk', 'leash', 'harness', 'collar'] },
  dog_beds: { keywords: ['dog bed', 'pet bed', 'dog mat', 'dog cushion', 'dog house'], categories: ['dog bed', 'pet bed'] },
  dog_grooming: { keywords: ['dog brush', 'dog shampoo', 'grooming', 'deshedding', 'nail clipper', 'dog comb'], categories: ['dog grooming', 'pet grooming'] },
  dog_health: { keywords: ['flea', 'tick', 'dog vitamin', 'dog supplement', 'dental', 'dog health'], categories: ['dog health'] },
  cat_toys: { keywords: ['cat toy', 'catnip', 'wand', 'laser', 'mouse toy', 'feather toy'], categories: ['cat toy'] },
  cat_litter: { keywords: ['litter', 'litter box', 'cat litter', 'litter scoop', 'litter mat'], categories: ['cat litter', 'litter'] },
  cat_furniture: { keywords: ['cat tree', 'scratching post', 'scratcher', 'cat tower', 'cat condo'], categories: ['cat tree', 'cat furniture', 'scratcher'] },
  cat_grooming: { keywords: ['cat brush', 'cat shampoo', 'cat comb', 'cat grooming'], categories: ['cat grooming', 'pet grooming'] },
  cat_health: { keywords: ['cat vitamin', 'cat supplement', 'hairball', 'cat health'], categories: ['cat health'] },
  feeding: { keywords: ['pet bowl', 'feeder', 'water fountain', 'food bowl', 'slow feeder', 'pet food'], categories: ['pet feeding', 'pet bowl'] },
  training: { keywords: ['training', 'training pad', 'potty pad', 'pee pad', 'clicker', 'training treat'], categories: ['pet training', 'training'] },
  travel: { keywords: ['carrier', 'crate', 'travel', 'pet stroller', 'pet carrier', 'travel bowl'], categories: ['pet carrier', 'pet travel', 'crate'] }
};

const PET_EXPLICIT_WORDS = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'canine', 'feline'];

const CONTEXT_AWARE_DENY = ['ring', 'charm', 'pendant'];

/**
 * Check if text contains a deny keyword
 * Context-aware: some keywords like "ring" are only blocked if no explicit pet context
 * Requires explicit pet words (dog, cat, pet) not just generic terms
 * @param {string} text - Text to check
 * @returns {{found: boolean, keyword: string|null}}
 */
function hasDenyKeyword(text) {
  const lower = text.toLowerCase();
  const hasExplicitPetContext = PET_EXPLICIT_WORDS.some(w => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(lower);
  });
  
  for (const keyword of DENY_KEYWORDS) {
    if (lower.includes(keyword)) {
      if (CONTEXT_AWARE_DENY.includes(keyword) && hasExplicitPetContext) {
        continue;
      }
      return { found: true, keyword };
    }
  }
  return { found: false, keyword: null };
}

/**
 * Check if text contains an allow keyword
 * @param {string} text - Text to check
 * @returns {{found: boolean, keywords: string[]}}
 */
function hasAllowKeywords(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const keyword of ALLOW_KEYWORDS) {
    if (lower.includes(keyword)) {
      found.push(keyword);
    }
  }
  return { found: found.length > 0, keywords: found };
}

/**
 * Check if text has a pet word + supply word combination
 * @param {string} text - Text to check
 * @returns {{found: boolean, combos: string[]}}
 */
function hasPetSupplyCombo(text) {
  const lower = text.toLowerCase();
  const combos = [];
  
  for (const petWord of PET_WORDS) {
    if (lower.includes(petWord)) {
      for (const supplyWord of SUPPLY_WORDS) {
        if (lower.includes(supplyWord)) {
          combos.push(`${petWord}+${supplyWord}`);
        }
      }
    }
  }
  
  return { found: combos.length > 0, combos: [...new Set(combos)] };
}

/**
 * Check category against whitelist patterns
 * @param {string} categoryPath - Category path (e.g., "Pet Supplies > Dog Toys")
 * @returns {{catAllow: boolean, catDeny: boolean, denyReason: string|null}}
 */
function checkCategory(categoryPath) {
  if (!categoryPath) {
    return { catAllow: false, catDeny: false, hasCategory: false, denyReason: null };
  }
  
  const lower = categoryPath.toLowerCase();
  
  // Check for allow patterns first
  let catAllow = false;
  for (const pattern of PET_CATEGORY_ALLOW_PATTERNS) {
    if (lower.includes(pattern)) {
      catAllow = true;
      break;
    }
  }
  
  // Check for deny patterns
  for (const pattern of PET_CATEGORY_DENY_PATTERNS) {
    if (lower.includes(pattern)) {
      // Check for exceptions
      const exceptions = CATEGORY_DENY_EXCEPTIONS[pattern] || [];
      const hasException = exceptions.some(exc => lower.includes(exc));
      
      if (!hasException) {
        return { catAllow: false, catDeny: true, hasCategory: true, denyReason: `deny:category:${pattern}` };
      }
    }
  }
  
  return { catAllow, catDeny: false, hasCategory: true, denyReason: null };
}

/**
 * Detect which pet scopes a product matches
 * @param {Object} product - Product with title, description, category
 * @returns {string[]} - Array of matching scope IDs
 */
function detectScopes(product) {
  const text = `${product.title || ''} ${product.description || ''} ${product.categoryName || product.category || ''}`.toLowerCase();
  const matches = [];
  
  for (const [scopeId, scopeDef] of Object.entries(PET_SCOPES)) {
    let matched = false;
    
    // Check keywords
    for (const keyword of scopeDef.keywords) {
      if (text.includes(keyword)) {
        matched = true;
        break;
      }
    }
    
    // Check categories
    if (!matched) {
      for (const cat of scopeDef.categories) {
        if (text.includes(cat)) {
          matched = true;
          break;
        }
      }
    }
    
    if (matched) {
      matches.push(scopeId);
    }
  }
  
  return matches;
}

/**
 * Check if product scopes match feed's allowed scopes
 * @param {string[]} productScopes - Product's detected scopes
 * @param {string[]} allowedScopes - Feed's allowed scopes
 * @returns {{matches: boolean, reason: string|null}}
 */
function matchesAllowedScopes(productScopes, allowedScopes) {
  if (!allowedScopes || allowedScopes.length === 0 || allowedScopes.includes('any_pet')) {
    return { matches: true, reason: null };
  }
  
  const hasMatch = productScopes.some(scope => allowedScopes.includes(scope));
  
  if (hasMatch) {
    return { matches: true, reason: null };
  }
  
  return { 
    matches: false, 
    reason: `deny:scope_mismatch:product_scopes=[${productScopes.join(',')}],allowed=[${allowedScopes.join(',')}]` 
  };
}

/**
 * Main eligibility evaluation function
 * Now uses petFilter.js as the PRIMARY gate (PET_CORE + HARD_DENY)
 * @param {Object} product - Product object with title, description, categoryName/category, variants, images
 * @param {Object} options - Options including feedScopes
 * @returns {{ok: boolean, score: number, reasons: string[], denyReason: string|null, scopes: string[], isPetAllowed: boolean, petType: string|null}}
 */
function evaluateEligibility(product, options = {}) {
  const { feedScopes = ['any_pet'], strictMode = false } = options;
  
  const title = product.title || product.productNameEn || product.productName || '';
  const description = product.description || product.productDescEn || '';
  const categoryPath = product.categoryName || product.category || '';
  const fullText = `${title} ${description} ${categoryPath}`;
  
  const reasons = [];
  let score = 0;
  let denyReason = null;
  
  // CRITICAL: petFilter.js is the PRIMARY gate (PET_CORE + HARD_DENY)
  const filterResult = petFilter.classifyProduct(product);
  if (!filterResult.eligible) {
    return {
      ok: false,
      score: 0,
      reasons: filterResult.details,
      denyReason: filterResult.denyReason,
      scopes: [],
      blocked: true,
      isPetAllowed: false,
      petType: null
    };
  }
  
  // Product passed petFilter - continue with legacy scoring for backwards compatibility
  reasons.push(...filterResult.details);
  score += 50; // Base score for passing petFilter
  
  // Step 1: Check deny keywords first (-60 points and potential block)
  const denyCheck = hasDenyKeyword(fullText);
  if (denyCheck.found) {
    score -= 60;
    reasons.push(`deny_keyword:${denyCheck.keyword}`);
    denyReason = `deny:keyword:${denyCheck.keyword}`;
  }
  
  // Step 2: Check category whitelist
  const catCheck = checkCategory(categoryPath);
  
  if (catCheck.catDeny) {
    score -= 40;
    reasons.push(catCheck.denyReason);
    if (!denyReason) denyReason = catCheck.denyReason;
    
    // Rule A: Category deny = block
    return {
      ok: false,
      score,
      reasons,
      denyReason,
      scopes: [],
      blocked: true
    };
  }
  
  // Rule C: Has category but NOT in allow list = block (unless in allow keywords)
  if (catCheck.hasCategory && !catCheck.catAllow) {
    // Need to check if has strong allow keywords before blocking
    const allowCheck = hasAllowKeywords(fullText);
    if (!allowCheck.found) {
      reasons.push('category_not_pet_allowed');
      return {
        ok: false,
        score: 0,
        reasons,
        denyReason: 'deny:category_not_allowed',
        scopes: [],
        blocked: true
      };
    }
  }
  
  // Step 3: Score allow keywords (+40 each)
  const allowCheck = hasAllowKeywords(fullText);
  if (allowCheck.found) {
    const bonus = allowCheck.keywords.length * 40;
    score += bonus;
    reasons.push(`allow_keywords:+${bonus}:[${allowCheck.keywords.slice(0, 3).join(',')}]`);
  }
  
  // Step 4: Score pet+supply combos (+20 each)
  const comboCheck = hasPetSupplyCombo(fullText);
  if (comboCheck.found) {
    const bonus = comboCheck.combos.length * 20;
    score += bonus;
    reasons.push(`pet_supply_combo:+${bonus}:[${comboCheck.combos.slice(0, 3).join(',')}]`);
  }
  
  // Step 5: Variants bonus (+10)
  const variants = product.variants || [];
  if (variants.length > 0) {
    score += 10;
    reasons.push('has_variants:+10');
  }
  
  // Step 6: Multiple images bonus (+10)
  const images = product.productImageSet || product.images || [];
  if (images.length >= 2) {
    score += 10;
    reasons.push('multiple_images:+10');
  }
  
  // Step 7: Detect scopes
  const scopes = detectScopes(product);
  
  // Rule D: No category = require score >= 80 + strong allow keyword
  if (!catCheck.hasCategory || (!catCheck.catAllow && !catCheck.catDeny)) {
    if (strictMode || !catCheck.hasCategory) {
      if (score < 80) {
        reasons.push('no_category_requires_score_80');
        return {
          ok: false,
          score,
          reasons,
          denyReason: 'deny:low_score_no_category',
          scopes,
          blocked: false
        };
      }
      if (!allowCheck.found) {
        reasons.push('no_category_requires_allow_keyword');
        return {
          ok: false,
          score,
          reasons,
          denyReason: 'deny:no_allow_keyword_no_category',
          scopes,
          blocked: false
        };
      }
    }
  }
  
  // Step 8: Check scope matching
  const scopeMatch = matchesAllowedScopes(scopes, feedScopes);
  if (!scopeMatch.matches) {
    reasons.push(scopeMatch.reason);
    return {
      ok: false,
      score,
      reasons,
      denyReason: scopeMatch.reason,
      scopes,
      blocked: false
    };
  }
  
  // Final decision: ok = true if score >= 50 AND no deny category hit
  const ok = score >= 50 && !catCheck.catDeny && !denyCheck.found;
  
  return {
    ok,
    score,
    reasons,
    denyReason: ok ? null : (score < 50 ? 'deny:low_score' : denyReason),
    scopes,
    blocked: false
  };
}

/**
 * Quick eligibility check for filtering
 * @param {Object} product 
 * @param {Object} options 
 * @returns {boolean}
 */
function isEligible(product, options = {}) {
  return evaluateEligibility(product, options).ok;
}

/**
 * STRICT RULE-BASED pet usage type classification (NO AI)
 * Determines if product is ANIMAL_USED or REJECTED_NON_PET
 * @param {Object} product - Product with title, description, categoryName
 * @returns {{type: string, confidence: number, reasons: string[]}}
 */
function classifyPetUsageType(product) {
  const title = (product.title || product.productNameEn || '').toLowerCase();
  const description = (product.description || product.productDescEn || '').toLowerCase();
  const category = (product.categoryName || product.category || '').toLowerCase();
  const fullText = `${title} ${description} ${category}`;
  
  const reasons = [];
  
  // STEP 1: Check HEURISTIC DENY PHRASES first (highest priority)
  for (const phrase of HEURISTIC_DENY_PHRASES) {
    if (title.includes(phrase)) {
      reasons.push(`heuristic_deny:${phrase}`);
      return { 
        type: PET_USAGE_TYPES.REJECTED_NON_PET, 
        confidence: 99,
        reasons
      };
    }
  }
  
  // STEP 2: Check STRICT DENY KEYWORDS
  for (const keyword of DENY_KEYWORDS) {
    if (fullText.includes(keyword)) {
      reasons.push(`deny_keyword:${keyword}`);
      return { 
        type: PET_USAGE_TYPES.REJECTED_NON_PET, 
        confidence: 95,
        reasons
      };
    }
  }
  
  // STEP 3: Check CATEGORY DENYLIST
  for (const denyCat of CJ_CATEGORY_DENYLIST) {
    if (category.includes(denyCat)) {
      reasons.push(`category_deny:${denyCat}`);
      return { 
        type: PET_USAGE_TYPES.REJECTED_NON_PET, 
        confidence: 95,
        reasons 
      };
    }
  }
  
  // STEP 4: Check if in CATEGORY WHITELIST (required for ANIMAL_USED)
  let inWhitelistCategory = false;
  let matchedWhitelistCat = null;
  for (const allowCat of CJ_CATEGORY_WHITELIST) {
    if (category.includes(allowCat)) {
      inWhitelistCategory = true;
      matchedWhitelistCat = allowCat;
      break;
    }
  }
  
  // STEP 5: Check for ANIMAL_USED indicators
  let animalUsedMatches = [];
  for (const indicator of ANIMAL_USED_INDICATORS) {
    if (fullText.includes(indicator)) {
      animalUsedMatches.push(indicator);
    }
  }
  
  // STEP 6: Final classification decision
  // STRICT RULE: Must be in whitelist category OR have strong pet product indicators
  if (inWhitelistCategory) {
    reasons.push(`category_whitelist:${matchedWhitelistCat}`);
    if (animalUsedMatches.length > 0) {
      reasons.push(`animal_used_indicators:[${animalUsedMatches.slice(0, 3).join(',')}]`);
    }
    return {
      type: PET_USAGE_TYPES.ANIMAL_USED,
      confidence: 95,
      reasons
    };
  }
  
  // Has strong pet product indicators (at least 2) = allow
  if (animalUsedMatches.length >= 2) {
    reasons.push('strong_animal_used_match');
    reasons.push(`animal_used_indicators:[${animalUsedMatches.slice(0, 3).join(',')}]`);
    return {
      type: PET_USAGE_TYPES.ANIMAL_USED,
      confidence: 85,
      reasons
    };
  }
  
  // Not in whitelist category and no strong indicators = REJECT
  reasons.push('not_in_whitelist_category');
  if (animalUsedMatches.length > 0) {
    reasons.push(`weak_indicators:[${animalUsedMatches.join(',')}]`);
  }
  return {
    type: PET_USAGE_TYPES.REJECTED_NON_PET,
    confidence: 80,
    reasons
  };
}

/**
 * Strict eligibility check - ONLY allows ANIMAL_USED products
 * Uses the new petFilter.js with PET_CORE + HARD_DENY logic
 * @param {Object} product
 * @returns {{eligible: boolean, petUsageType: string, reasons: string[], isPetAllowed: boolean, petType: string|null, denyReason: string|null}}
 */
function strictPetEligibility(product) {
  const filterResult = petFilter.classifyProduct(product);
  
  return {
    eligible: filterResult.eligible,
    isPetAllowed: filterResult.isPetAllowed,
    petUsageType: filterResult.type,
    petType: filterResult.petType,
    confidence: filterResult.eligible ? 95 : 0,
    reasons: filterResult.details,
    denyReason: filterResult.denyReason
  };
}

/**
 * Batch evaluate products
 * @param {Object[]} products 
 * @param {Object} options 
 * @returns {{eligible: Object[], blocked: Object[], stats: Object}}
 */
function batchEvaluate(products, options = {}) {
  const eligible = [];
  const blocked = [];
  const stats = {
    total: products.length,
    eligible: 0,
    blocked: 0,
    byReason: {}
  };
  
  for (const product of products) {
    const result = evaluateEligibility(product, options);
    
    if (result.ok) {
      eligible.push({ ...product, _eligibility: result });
      stats.eligible++;
    } else {
      blocked.push({ ...product, _eligibility: result });
      stats.blocked++;
      
      const reason = result.denyReason || 'unknown';
      const category = reason.split(':')[1] || 'other';
      stats.byReason[category] = (stats.byReason[category] || 0) + 1;
    }
  }
  
  return { eligible, blocked, stats };
}

/**
 * Validate test cases - returns sample decisions for verification
 */
function validateTestCases() {
  const testCases = [
    // Should BLOCK
    { title: 'Wrapped Kitten Cute Ring', expected: false },
    { title: 'Cat-eye Leopard-print Jeans', expected: false },
    { title: 'Sexy Cat-themed Set', expected: false },
    { title: 'Scrapbook DIY Carbon Steel Knife Mold', expected: false },
    { title: 'Kitten keychain', expected: false },
    
    // Should ALLOW
    { title: 'Adjustable Dog Harness No Pull', expected: true },
    { title: 'Cat Litter Box Enclosed', expected: true },
    { title: 'Interactive Dog Chew Toy', expected: true },
    { title: 'Pet Collar with Bell', expected: true }
  ];
  
  const results = [];
  let passed = 0;
  let failed = 0;
  
  for (const tc of testCases) {
    const product = { title: tc.title };
    const result = evaluateEligibility(product, { strictMode: false });
    const matches = result.ok === tc.expected;
    
    if (matches) passed++;
    else failed++;
    
    results.push({
      title: tc.title,
      expected: tc.expected ? 'ALLOW' : 'BLOCK',
      actual: result.ok ? 'ALLOW' : 'BLOCK',
      score: result.score,
      pass: matches,
      reasons: result.reasons.slice(0, 3)
    });
  }
  
  return { results, passed, failed, total: testCases.length };
}

module.exports = {
  PET_USAGE_TYPES,
  CJ_CATEGORY_WHITELIST,
  CJ_CATEGORY_DENYLIST,
  ANIMAL_USED_INDICATORS,
  DENY_KEYWORDS,
  HEURISTIC_DENY_PHRASES,
  ALLOW_KEYWORDS,
  PET_WORDS,
  SUPPLY_WORDS,
  PET_CATEGORY_ALLOW_PATTERNS,
  PET_CATEGORY_DENY_PATTERNS,
  PET_SCOPES,
  hasDenyKeyword,
  hasAllowKeywords,
  hasPetSupplyCombo,
  checkCategory,
  detectScopes,
  matchesAllowedScopes,
  evaluateEligibility,
  isEligible,
  batchEvaluate,
  validateTestCases,
  classifyPetUsageType,
  strictPetEligibility
};
