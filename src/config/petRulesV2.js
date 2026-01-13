/**
 * Pet Eligibility Rules V2 - Strict Whitelist/Blacklist System
 * HARD DENY > Scoring > Threshold check
 * 
 * Score system:
 * - HARD_DENY match → immediately reject (score = -999)
 * - Each CORE_ALLOW keyword → +3 points
 * - Each STRONG_SIGNAL keyword → +2 points
 * - Minimum 2 strong signals + score >= 6 → eligible
 */

// ============ PET TYPES ============
const PET_TYPES = {
  DOG: 'DOG',
  CAT: 'CAT',
  BOTH: 'BOTH',
  UNKNOWN: 'UNKNOWN'
};

// ============ PET CATEGORIES ============
const PET_CATEGORIES = {
  TOYS: 'TOYS',
  BEDS: 'BEDS',
  FOOD_TREATS: 'FOOD_TREATS',
  GROOMING: 'GROOMING',
  TRAVEL: 'TRAVEL',
  FEEDING: 'FEEDING',
  LITTER: 'LITTER',
  SCRATCHERS: 'SCRATCHERS',
  HEALTH_WELLNESS: 'HEALTH_WELLNESS',
  APPAREL_PET: 'APPAREL_PET',
  COLLARS_LEASHES: 'COLLARS_LEASHES',
  TRAINING: 'TRAINING',
  FURNITURE: 'FURNITURE',
  OTHER_PET: 'OTHER_PET'
};

// ============ HARD DENY KEYWORDS (INSTANT REJECT) ============
const HARD_DENY = [
  // Jewelry
  'ring', 'necklace', 'earrings', 'earring', 'bracelet', 'pendant', 'jewelry', 'jewellery',
  'stud', 'dangle', 'hoop', 'charm', 'brooch', 'anklet', 'cufflink',
  
  // Human apparel
  "women's", "men's", 'womens', 'mens', 'ladies', 'lady', 'lingerie', 'bikini', 'bra',
  'dress', 'blouse', 'skirt', 'pants', 'jeans', 'shorts', 'trousers',
  'hoodie', 'sweater', 'cardigan', 'jacket', 'coat', 'blazer', 'vest',
  'shoes', 'sandals', 'boots', 'heels', 'sneakers', 'slippers',
  'handbag', 'purse', 'wallet', 'clutch', 'tote', 'backpack',
  'sunglasses', 'glasses', 'watch', 'scarf', 'hat', 'cap', 'beanie',
  
  // Adult/Sensitive
  'adult', 'sex', 'nude', 'explicit', 'erotic', 'lingerie', 'intimate',
  'beer', 'wine', 'alcohol', 'vodka', 'whiskey', 'cigarette', 'vape', 'tobacco',
  'firearm', 'weapon', 'gun', 'knife', 'sword',
  
  // Electronics (non-pet)
  'phone case', 'iphone', 'samsung', 'earbuds', 'headphones', 'headphone',
  'charger', 'usb', 'bluetooth', 'speaker', 'powerbank',
  
  // Kitchen/Home (non-pet)
  'kitchen tool', 'cookware', 'bakeware', 'dinnerware', 'tableware',
  'mug', 'cup', 'glass', 'plate', 'bowl set', 'cutlery', 'utensil',
  'opener', 'corkscrew', 'grater', 'peeler', 'mixer', 'blender',
  
  // Human toys
  'lego', 'doll', 'action figure', 'barbie', 'puzzle', 'board game',
  
  // Cosmetics
  'makeup', 'cosmetic', 'lipstick', 'mascara', 'foundation', 'perfume',
  'skincare', 'serum', 'moisturizer', 'lotion', 'cream', 'sunscreen',
  
  // Decoration (human)
  'figurine', 'statue', 'ornament', 'wall art', 'poster', 'canvas',
  'vase', 'candle', 'lamp', 'chandelier', 'curtain', 'rug', 'carpet',
  
  // Fashion indicators
  'fashion', 'trendy', 'stylish', 'chic', 'elegant', 'vintage',
  'retro', 'boho', 'gothic', 'punk', 'preppy'
];

// ============ CORE ALLOW KEYWORDS (+3 points each) ============
const CORE_ALLOW = [
  // Pet types
  'dog', 'puppy', 'canine', 'cat', 'kitten', 'feline', 'pet',
  
  // Walking & restraint
  'leash', 'collar', 'harness', 'muzzle', 'lead',
  
  // Housing
  'crate', 'carrier', 'kennel', 'pet bed', 'dog bed', 'cat bed',
  'dog house', 'cat house', 'pet house',
  
  // Toys
  'chew toy', 'squeaky toy', 'tug toy', 'fetch toy', 'puzzle toy',
  'dog toy', 'cat toy', 'pet toy', 'catnip', 'feather wand',
  
  // Grooming
  'pet brush', 'dog brush', 'cat brush', 'deshedding', 'pet shampoo',
  'nail clipper', 'pet grooming', 'fur remover',
  
  // Litter (cats)
  'litter box', 'cat litter', 'litter tray', 'scooper', 'litter mat',
  
  // Scratching (cats)
  'scratching post', 'scratcher', 'cat tree', 'scratch pad',
  
  // Feeding
  'pet bowl', 'dog bowl', 'cat bowl', 'slow feeder', 'automatic feeder',
  'water fountain', 'pet feeder', 'food bowl', 'water bowl',
  
  // Training
  'training pad', 'pee pad', 'puppy pad', 'potty', 'clicker',
  'pet gate', 'dog gate', 'pet door',
  
  // Health
  'flea', 'tick', 'dewormer', 'pet vitamin', 'pet supplement',
  'dental chew', 'pet treat', 'dog treat', 'cat treat',
  
  // Travel
  'pet stroller', 'car seat cover', 'pet backpack', 'travel bowl',
  
  // Pet apparel (for animals!)
  'dog coat', 'dog jacket', 'dog sweater', 'cat costume', 'pet costume',
  'dog raincoat', 'pet raincoat', 'dog shirt', 'dog dress'
];

// ============ STRONG SIGNALS (+2 points each) ============
const STRONG_SIGNALS = [
  // General pet terms
  'for dogs', 'for cats', 'for pets', 'pet supplies', 'dog supplies', 'cat supplies',
  'pet accessories', 'dog accessories', 'cat accessories',
  
  // Feeding related
  'kibble', 'pet food', 'dog food', 'cat food', 'feeding mat',
  
  // Comfort
  'orthopaedic', 'calming bed', 'pet cushion', 'pet blanket',
  
  // Cat specific
  'cat tower', 'cat condo', 'cat perch', 'cat hammock', 'cat shelf',
  
  // Dog specific
  'chew', 'fetch', 'rope toy', 'ball toy',
  
  // Care
  'grooming glove', 'lint roller', 'fur', 'paw',
  
  // Travel
  'pet carrier', 'dog carrier', 'cat carrier'
];

// ============ CATEGORY ALLOW PATHS ============
const CATEGORY_ALLOW_PATHS = [
  'pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'kitten',
  'pet supplies', 'dog supplies', 'cat supplies',
  'pet toys', 'dog toys', 'cat toys',
  'pet beds', 'dog beds', 'cat beds',
  'pet grooming', 'pet health', 'pet feeding',
  'pet carriers', 'pet training', 'pet accessories'
];

// ============ CATEGORY DENY PATHS ============
const CATEGORY_DENY_PATHS = [
  'jewelry', 'fashion', 'apparel', 'clothing', 'shoes', 'bags',
  'electronics', 'phone', 'computer', 'audio',
  'home decor', 'decoration', 'furniture', 'kitchen', 'bathroom',
  'beauty', 'makeup', 'skincare', 'cosmetics',
  'toys', 'games', 'puzzles' // human toys - note: "pet toys" is allowed
];

/**
 * Normalize text for matching
 */
function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains any keyword from array
 */
function containsKeyword(text, keywords) {
  const normalized = normalizeText(text);
  return keywords.some(kw => normalized.includes(normalizeText(kw)));
}

/**
 * Count keyword matches
 */
function countMatches(text, keywords) {
  const normalized = normalizeText(text);
  let count = 0;
  const matches = [];
  
  for (const kw of keywords) {
    if (normalized.includes(normalizeText(kw))) {
      count++;
      matches.push(kw);
    }
  }
  
  return { count, matches };
}

/**
 * Detect pet type from text
 */
function detectPetType(text) {
  const normalized = normalizeText(text);
  const hasDog = /\b(dog|puppy|canine|pup)\b/.test(normalized);
  const hasCat = /\b(cat|kitten|feline|kitty)\b/.test(normalized);
  
  if (hasDog && hasCat) return PET_TYPES.BOTH;
  if (hasDog) return PET_TYPES.DOG;
  if (hasCat) return PET_TYPES.CAT;
  return PET_TYPES.UNKNOWN;
}

/**
 * Detect pet category from text
 */
function detectPetCategory(text) {
  const normalized = normalizeText(text);
  
  if (/toy|squeaky|chew|fetch|ball|rope/.test(normalized)) return PET_CATEGORIES.TOYS;
  if (/bed|cushion|mat|blanket|pillow/.test(normalized)) return PET_CATEGORIES.BEDS;
  if (/food|treat|kibble|snack/.test(normalized)) return PET_CATEGORIES.FOOD_TREATS;
  if (/groom|brush|shampoo|nail|comb|deshed/.test(normalized)) return PET_CATEGORIES.GROOMING;
  if (/carrier|stroller|travel|car seat|backpack/.test(normalized)) return PET_CATEGORIES.TRAVEL;
  if (/bowl|feeder|fountain|feeding/.test(normalized)) return PET_CATEGORIES.FEEDING;
  if (/litter|scoop|potty/.test(normalized)) return PET_CATEGORIES.LITTER;
  if (/scratch|tree|tower|condo|post/.test(normalized)) return PET_CATEGORIES.SCRATCHERS;
  if (/health|vitamin|supplement|flea|tick|dental/.test(normalized)) return PET_CATEGORIES.HEALTH_WELLNESS;
  if (/coat|jacket|sweater|costume|raincoat|shirt|dress/.test(normalized)) return PET_CATEGORIES.APPAREL_PET;
  if (/collar|leash|harness|lead|muzzle/.test(normalized)) return PET_CATEGORIES.COLLARS_LEASHES;
  if (/train|pad|gate|door|clicker/.test(normalized)) return PET_CATEGORIES.TRAINING;
  if (/crate|kennel|house/.test(normalized)) return PET_CATEGORIES.FURNITURE;
  
  return PET_CATEGORIES.OTHER_PET;
}

/**
 * Evaluate pet eligibility with scoring system
 * @param {Object} product - Product data
 * @returns {Object} Eligibility result with score, reasons, and audit trail
 */
function evaluatePetEligibility({
  title = '',
  description = '',
  tags = [],
  categoryPath = '',
  imagesAlt = '',
  sku = '',
  vendor = ''
}) {
  // Combine all text for analysis
  const tagsStr = Array.isArray(tags) ? tags.join(' ') : (tags || '');
  const allText = `${title} ${description} ${tagsStr} ${categoryPath} ${imagesAlt} ${vendor}`.toLowerCase();
  
  const audit = {
    analyzedText: allText.substring(0, 500),
    hardDenyMatches: [],
    coreAllowMatches: [],
    strongSignalMatches: [],
    categoryPathAllowed: false,
    categoryPathDenied: false
  };
  
  let score = 0;
  let reasons = [];
  
  // 1. Check HARD DENY first (instant reject)
  const hardDenyResult = countMatches(allText, HARD_DENY);
  audit.hardDenyMatches = hardDenyResult.matches;
  
  if (hardDenyResult.count > 0) {
    // Check for pet-specific override (e.g., "dog coat" should be allowed even with "coat")
    const coreAllowCheck = countMatches(allText, CORE_ALLOW);
    
    // Only allow override if there are strong pet signals AND the hard deny is ambiguous
    const ambiguousDenies = ['coat', 'jacket', 'sweater', 'dress', 'shirt', 'hat', 'boots'];
    const isAmbiguous = hardDenyResult.matches.every(m => ambiguousDenies.includes(m));
    
    if (!isAmbiguous || coreAllowCheck.count < 2) {
      return {
        isPetEligible: false,
        petType: detectPetType(allText),
        petCategory: null,
        petConfidence: 0,
        petRejectionReason: `HARD_DENY: ${hardDenyResult.matches.slice(0, 5).join(', ')}`,
        petAudit: audit,
        score: -999
      };
    }
    
    // Ambiguous case with pet override - continue with reduced score
    score -= 3;
    reasons.push('Ambiguous deny with pet override');
  }
  
  // 2. Check category path
  if (containsKeyword(categoryPath, CATEGORY_DENY_PATHS)) {
    // Check if it's a pet-specific category override
    if (!containsKeyword(categoryPath, CATEGORY_ALLOW_PATHS)) {
      audit.categoryPathDenied = true;
      score -= 5;
      reasons.push('Category path denied');
    }
  }
  
  if (containsKeyword(categoryPath, CATEGORY_ALLOW_PATHS)) {
    audit.categoryPathAllowed = true;
    score += 3;
    reasons.push('Category path allowed');
  }
  
  // 3. Count CORE_ALLOW matches (+3 each)
  const coreResult = countMatches(allText, CORE_ALLOW);
  audit.coreAllowMatches = coreResult.matches;
  score += coreResult.count * 3;
  if (coreResult.count > 0) {
    reasons.push(`Core allow: ${coreResult.matches.slice(0, 5).join(', ')}`);
  }
  
  // 4. Count STRONG_SIGNALS matches (+2 each)
  const signalResult = countMatches(allText, STRONG_SIGNALS);
  audit.strongSignalMatches = signalResult.matches;
  score += signalResult.count * 2;
  if (signalResult.count > 0) {
    reasons.push(`Strong signals: ${signalResult.matches.slice(0, 5).join(', ')}`);
  }
  
  // 5. Calculate confidence (0-100)
  const totalSignals = coreResult.count + signalResult.count;
  const confidence = Math.min(100, Math.round((score / 12) * 100));
  
  // 6. Eligibility decision
  // Eligible if: score >= 6 AND at least 2 strong signals (core + strong)
  const isPetEligible = score >= 6 && totalSignals >= 2;
  
  // Determine pet type and category
  const petType = detectPetType(allText);
  const petCategory = isPetEligible ? detectPetCategory(allText) : null;
  
  return {
    isPetEligible,
    petType,
    petCategory,
    petConfidence: Math.max(0, confidence),
    petRejectionReason: isPetEligible ? null : `Score ${score} < 6 or signals ${totalSignals} < 2`,
    petAudit: audit,
    score,
    reasons
  };
}

module.exports = {
  PET_TYPES,
  PET_CATEGORIES,
  HARD_DENY,
  CORE_ALLOW,
  STRONG_SIGNALS,
  CATEGORY_ALLOW_PATHS,
  CATEGORY_DENY_PATHS,
  evaluatePetEligibility,
  detectPetType,
  detectPetCategory,
  normalizeText,
  containsKeyword,
  countMatches
};
