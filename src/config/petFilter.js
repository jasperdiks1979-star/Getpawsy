/**
 * STRICT PET-ONLY FILTERING v4 (Bulletproof)
 * No AI - Pure rule-based filtering
 * 3-Layer enforcement: Import → Storage → Storefront
 * 
 * CRITICAL: PET_CORE keyword is REQUIRED
 * Pet apparel ALLOWED, human apparel BLOCKED
 */

const PET_CORE = [
  "pet", "pets",
  "dog", "dogs", "puppy", "puppies", "canine",
  "cat", "cats", "kitten", "kittens", "feline"
];

const PET_FUNCTIONAL = [
  "leash", "collar", "harness", "muzzle",
  "crate", "kennel", "carrier", "pet carrier", "pet backpack", "pet stroller",
  "car seat cover", "pet car seat", "dog car seat", "cat car seat", "car hammock", "pet hammock", "seat protector", "pet car mat", "dog car mat", "car mats",
  "dog bed", "cat bed", "pet bed",
  "litter", "cat litter", "litter box", "cat litter box", "litter scoop",
  "scratching", "scratcher", "scratching post", "cat tree", "cat tower", "cat condo", "catnip",
  "feeder", "slow feeder", "pet bowl", "dog bowl", "cat bowl", "water fountain", "pet fountain", "automatic feeder",
  "grooming", "pet brush", "deshedding", "pet shampoo", "pet wipes", "nail clipper", "nail trimmer",
  "training pad", "pee pad", "puppy pad", "poop bag", "waste bag",
  "chew", "chew toy", "squeaky", "fetch", "tug", "rope toy", "ball toy",
  "interactive cat toy", "teaser wand", "cat wand", "laser toy",
  "pet gate", "dog gate", "cat gate", "playpen",
  "pet blanket", "dog blanket", "cat blanket",
  "dog coat", "pet coat", "dog jacket", "pet jacket", "dog sweater", "pet sweater",
  "dog hoodie", "pet hoodie", "dog raincoat", "pet raincoat", "dog shoes", "dog booties",
  "dog pajamas", "pet pajamas", "dog costume", "pet costume", "dog bandana", "pet bandana",
  "cat costume", "cat bandana"
];

const PET_APPAREL_FUNCTIONAL = [
  "dog coat", "pet coat", "dog jacket", "pet jacket", "dog sweater", "pet sweater",
  "dog hoodie", "pet hoodie", "dog raincoat", "pet raincoat", "dog shoes", "dog booties",
  "dog pajamas", "pet pajamas", "dog costume", "pet costume", "dog bandana", "pet bandana",
  "cat costume", "cat bandana", "dog vest", "pet vest", "dog clothes", "pet clothes",
  "cat clothes", "puppy clothes", "kitten clothes"
];

const HARD_DENY = [
  "women", "woman", "men", "man", "lady", "ladies", "gentleman", "boy", "girl", "kids", "baby", "toddler",
  "bra", "lingerie", "bikini", "swimsuit", "underwear",
  "ring", "necklace", "bracelet", "earring", "earrings", "jewelry", "jewellery", "pendant", "anklet", "brooch", "gold", "silver", "gemstone", "diamond",
  "keychain", "key ring", "keyring", "key holder", "key chain",
  "makeup", "cosmetic", "cosmetics", "lipstick", "perfume", "fragrance", "skincare", "serum", "cream", "moisturizer", "cleanser", "mascara", "foundation",
  "phone", "iphone", "android", "case", "charger", "cable", "adapter", "power bank", "earbud", "earbuds", "headphone", "headphones", "bluetooth", "smartwatch", "tablet", "laptop",
  "phone stand", "car mount", "airpods",
  "kitchen", "kitchen tool", "tool", "mug", "cup", "glass", "beer", "beer glass", "wine", "wine glass", "bottle", "coffee", "tea",
  "cookware", "spoon", "fork", "plate", "dispenser", "sponge", "cleaning", "foaming", "cutlery", "knife", "tumbler", "cooking",
  "decor", "decoration", "poster", "canvas", "wall art", "wall decor", "wall decal", "sticker", "decals", "ornament", "figurine", "scrapbook", "diy", "craft",
  "notebook", "journal", "planner", "stationery", "souvenir", "gift",
  "doormat", "door mat", "bath mat", "kitchen mat",
  "herbal", "medicine", "supplement", "vitamin", "detox", "weight loss",
  "adult", "erotic", "sex", "sexy", "vibrator", "weapon",
  "cat lover", "dog lover", "pet lover", "cat mom", "dog mom", "dog dad", "cat lady", "fur mama", "fur baby", "pet parent",
  "cat print", "dog print", "paw print", "cat pattern", "dog pattern",
  "cat themed", "dog themed", "pet themed",
  "kawaii", "cute cat", "cute dog", "become your",
  "car accessory", "motor", "bike", "motorcycle",
  "statue", "sculpture", "figurine"
];

const APPAREL_WORDS = [
  "shirt", "t-shirt", "tee", "polo", "blouse", "top", "tank top", "cardigan",
  "hoodie", "sweater", "sweatshirt", "jacket", "coat", "dress", "skirt",
  "pants", "jeans", "leggings", "shorts", "shoes", "sneaker", "sneakers",
  "boot", "boots", "sandals", "sandal", "hat", "cap", "beanie", "scarf", "glove", "gloves",
  "pajamas", "pyjama", "pyjamas", "sleepwear", "socks", "sock", "slippers", "slipper"
];

const HUMAN_INTENT_WORDS = [
  "women", "woman", "men", "man", "lady", "ladies", "kids", "baby", "toddler",
  "fashion", "streetwear", "outfit", "casual", "summer", "winter",
  "size chart", "european size", "eu size", "us size", "asian size",
  "plus size", "oversized", "slim fit"
];

const REASON_CODES = {
  HARD_DENY: "deny:hard_keyword",
  HUMAN_APPAREL: "deny:human_apparel",
  HUMAN_APPAREL_NO_PET: "deny:human_apparel_no_pet_core",
  AMBIGUOUS_APPAREL: "deny:ambiguous_apparel",
  NO_PET_CORE: "deny:no_pet_core",
  NOT_FUNCTIONAL: "deny:not_functional_pet_item",
  ELIGIBLE: "eligible"
};

function normalizeText(text) {
  if (!text) return "";
  return String(text).toLowerCase().trim().replace(/\s+/g, " ");
}

function containsAny(text, keywords) {
  const normalized = normalizeText(text);
  for (const kw of keywords) {
    const normalKw = normalizeText(kw);
    if (normalized.includes(normalKw)) {
      return { found: true, keyword: kw };
    }
  }
  return { found: false, keyword: null };
}

function containsWord(text, word) {
  const normalized = normalizeText(text);
  const normalWord = normalizeText(word);
  const regex = new RegExp(`\\b${normalWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return regex.test(normalized);
}

function containsAnyWord(text, keywords) {
  for (const kw of keywords) {
    if (containsWord(text, kw)) {
      return { found: true, keyword: kw };
    }
  }
  return { found: false, keyword: null };
}

/**
 * Strict Pet Eligibility Check - v4 (Bulletproof)
 * @param {Object} params
 * @returns {{eligible: boolean, reason: string, details: string[], petType: string|null, denyKeyword: string|null}}
 */
function isPetEligible({ title = '', description = '', tags = '', categoryPath = '', options = '', attributes = '' }) {
  const normalizedTitle = normalizeText(title);
  const normalizedDesc = normalizeText(description);
  const normalizedTags = normalizeText(tags);
  const normalizedCategory = normalizeText(categoryPath);
  const normalizedOptions = normalizeText(options);
  const normalizedAttributes = normalizeText(attributes);
  const fullText = `${normalizedTitle} ${normalizedDesc} ${normalizedTags} ${normalizedCategory} ${normalizedOptions} ${normalizedAttributes}`;
  
  const details = [];
  let petType = null;
  let denyKeyword = null;

  // STEP 1: HARD DENY - Immediate rejection
  const hardDenyCheck = containsAny(fullText, HARD_DENY);
  if (hardDenyCheck.found) {
    details.push(`hard_deny:${hardDenyCheck.keyword}`);
    return {
      eligible: false,
      reason: REASON_CODES.HARD_DENY,
      details,
      petType: null,
      denyKeyword: hardDenyCheck.keyword
    };
  }

  // STEP 2: HUMAN APPAREL DETECTION
  const apparelCheck = containsAny(fullText, APPAREL_WORDS);
  if (apparelCheck.found) {
    const humanIntentCheck = containsAny(fullText, HUMAN_INTENT_WORDS);
    const petCoreCheck = containsAnyWord(fullText, PET_CORE);
    const petApparelCheck = containsAny(fullText, PET_APPAREL_FUNCTIONAL);
    
    if (humanIntentCheck.found) {
      details.push(`apparel:${apparelCheck.keyword}`, `human_intent:${humanIntentCheck.keyword}`);
      return {
        eligible: false,
        reason: REASON_CODES.HUMAN_APPAREL,
        details,
        petType: null,
        denyKeyword: humanIntentCheck.keyword
      };
    }
    
    if (!petCoreCheck.found) {
      details.push(`apparel:${apparelCheck.keyword}`, 'no_pet_core');
      return {
        eligible: false,
        reason: REASON_CODES.HUMAN_APPAREL_NO_PET,
        details,
        petType: null,
        denyKeyword: apparelCheck.keyword
      };
    }
    
    if (!petApparelCheck.found) {
      details.push(`apparel:${apparelCheck.keyword}`, `pet_core:${petCoreCheck.keyword}`, 'no_pet_apparel_functional');
      return {
        eligible: false,
        reason: REASON_CODES.AMBIGUOUS_APPAREL,
        details,
        petType: null,
        denyKeyword: apparelCheck.keyword
      };
    }
    
    details.push(`pet_apparel:${petApparelCheck.keyword}`);
  }

  // STEP 3: PET_CORE CHECK - Must contain at least one core pet keyword
  const petCoreCheck = containsAnyWord(fullText, PET_CORE);
  if (!petCoreCheck.found) {
    details.push('no_pet_core');
    return {
      eligible: false,
      reason: REASON_CODES.NO_PET_CORE,
      details,
      petType: null,
      denyKeyword: null
    };
  }
  details.push(`pet_core:${petCoreCheck.keyword}`);

  // STEP 4: PET_FUNCTIONAL CHECK - Must contain at least one functional pet item keyword
  const functionalCheck = containsAny(fullText, PET_FUNCTIONAL);
  if (!functionalCheck.found) {
    details.push('no_functional_keyword');
    return {
      eligible: false,
      reason: REASON_CODES.NOT_FUNCTIONAL,
      details,
      petType: null,
      denyKeyword: null
    };
  }
  details.push(`functional:${functionalCheck.keyword}`);

  // STEP 5: Determine pet type
  const hasDog = /\b(dog|dogs|puppy|puppies|canine)\b/i.test(fullText);
  const hasCat = /\b(cat|cats|kitten|kittens|feline)\b/i.test(fullText);
  
  if (normalizedCategory.includes('dog_') || normalizedCategory.startsWith('dog')) {
    petType = "DOG";
  } else if (normalizedCategory.includes('cat_') || normalizedCategory.startsWith('cat')) {
    petType = "CAT";
  } else if (hasDog && hasCat) {
    petType = "BOTH";
  } else if (hasDog) {
    petType = "DOG";
  } else if (hasCat) {
    petType = "CAT";
  } else {
    petType = "BOTH";
  }

  return {
    eligible: true,
    reason: REASON_CODES.ELIGIBLE,
    details,
    petType,
    denyKeyword: null
  };
}

/**
 * Quick import blocking check
 */
function shouldBlockImport(product) {
  const productId = product.id || product.pid || product.spu || product.productSku;
  
  if (productId && hasAdminOverride(productId)) {
    return {
      blocked: false,
      reason: 'admin_override',
      denyKeyword: null,
      adminOverride: true
    };
  }
  
  const result = isPetEligible({
    title: product.title || product.productNameEn || product.productName || '',
    description: product.description || product.productDescEn || product.productDesc || '',
    tags: Array.isArray(product.tags) ? product.tags.join(' ') : (product.tags || ''),
    categoryPath: product.categoryName || product.category || product.categoryPath || '',
    options: Array.isArray(product.options) ? product.options.map(o => o.name || o).join(' ') : '',
    attributes: Array.isArray(product.attributes) ? product.attributes.map(a => a.name || a.value || a).join(' ') : ''
  });

  return {
    blocked: !result.eligible,
    reason: result.reason,
    denyKeyword: result.denyKeyword
  };
}

/**
 * Check if product has admin override approval
 */
function hasAdminOverride(productId) {
  try {
    const { isOverrideApproved } = require('../petOverrides');
    return isOverrideApproved(productId);
  } catch (e) {
    return false;
  }
}

/**
 * Classify product for storage
 */
function classifyProduct(product) {
  const productId = product.id || product.pid || product.spu || product.productSku;
  
  if (productId && hasAdminOverride(productId)) {
    return {
      type: 'ANIMAL_USED',
      eligible: true,
      isPetAllowed: true,
      reason: 'admin_override',
      details: ['admin_override_approved'],
      petType: 'BOTH',
      denyReason: null,
      adminOverride: true
    };
  }
  
  const result = isPetEligible({
    title: product.title || product.productNameEn || product.productName || '',
    description: product.description || product.productDescEn || product.productDesc || '',
    tags: Array.isArray(product.tags) ? product.tags.join(' ') : (product.tags || ''),
    categoryPath: product.categoryName || product.category || product.categoryPath || product.subcategory || '',
    options: Array.isArray(product.options) ? product.options.map(o => o.name || o).join(' ') : '',
    attributes: Array.isArray(product.attributes) ? product.attributes.map(a => a.name || a.value || a).join(' ') : ''
  });

  const denyReason = result.eligible ? null : `${result.reason}${result.denyKeyword ? `: ${result.denyKeyword}` : ''}`;

  return {
    type: result.eligible ? 'ANIMAL_USED' : 'REJECTED_NON_PET',
    eligible: result.eligible,
    isPetAllowed: result.eligible,
    reason: result.reason,
    details: result.details,
    petType: result.petType,
    denyReason
  };
}

/**
 * Test classification function for debugging
 */
function classifyPetEligibility(title, description, tags, category) {
  return isPetEligible({ title, description, tags, categoryPath: category });
}

/**
 * Get filter statistics
 */
function getFilterStats() {
  return {
    petCoreCount: PET_CORE.length,
    hardDenyCount: HARD_DENY.length,
    petFunctionalCount: PET_FUNCTIONAL.length,
    petApparelFunctionalCount: PET_APPAREL_FUNCTIONAL.length,
    apparelWordsCount: APPAREL_WORDS.length,
    humanIntentWordsCount: HUMAN_INTENT_WORDS.length
  };
}

/**
 * Run test cases to verify filter
 */
function runTestCases() {
  const testCases = [
    { title: "Dog raincoat waterproof", expected: true },
    { title: "Pet sweater for small dogs", expected: true },
    { title: "Dog bandana", expected: true },
    { title: "Cat litter box", expected: true },
    { title: "Pet water fountain", expected: true },
    { title: "Dog leash retractable", expected: true },
    { title: "Cat scratching post", expected: true },
    { title: "Women's hoodie cat print", expected: false },
    { title: "Cat sweater (women)", expected: false },
    { title: "Dog shirt (men)", expected: false },
    { title: "Kitten beer glass", expected: false },
    { title: "Cat ring jewelry", expected: false },
    { title: "Dog doormat", expected: false },
    { title: "Cat keychain", expected: false },
    { title: "Pet lover necklace", expected: false },
    { title: "Fashion hoodie dog print", expected: false }
  ];

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = isPetEligible({ title: tc.title, description: '', tags: '', categoryPath: '' });
    const matches = result.eligible === tc.expected;
    
    if (matches) passed++;
    else failed++;

    results.push({
      title: tc.title,
      expected: tc.expected ? 'ALLOW' : 'REJECT',
      actual: result.eligible ? 'ALLOW' : 'REJECT',
      pass: matches,
      reason: result.reason,
      details: result.details.slice(0, 2)
    });
  }

  return { results, passed, failed, total: testCases.length };
}

module.exports = {
  PET_CORE,
  PET_FUNCTIONAL,
  PET_APPAREL_FUNCTIONAL,
  HARD_DENY,
  APPAREL_WORDS,
  HUMAN_INTENT_WORDS,
  REASON_CODES,
  isPetEligible,
  shouldBlockImport,
  classifyProduct,
  classifyPetEligibility,
  hasAdminOverride,
  getFilterStats,
  runTestCases,
  containsAny,
  containsAnyWord,
  normalizeText
};
