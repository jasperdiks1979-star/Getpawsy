/**
 * STRICT PET PRODUCTS V2.0 - ADULT CONTENT FILTERED
 * 
 * Central module for pet-only product filtering.
 * NO FALLBACKS - if a product doesn't have valid pet indicators, it's excluded.
 * ADULT CONTENT BLOCKED - explicit/adult products are always rejected.
 * 
 * Required fields for homepage eligibility:
 * - petType: "dog" | "cat" | "both" OR
 * - mainCategorySlug: "dogs" | "cats" OR
 * - category containing dog/cat keywords
 * - petApproved === true (alternative flag)
 * - species === "dog" | "cat" (alternative flag)
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// PET-ONLY LOCKDOWN: Use centralized petOnlyEngine as primary filter
// ═══════════════════════════════════════════════════════════════════════════════
let petOnlyEngine = null;
try {
  petOnlyEngine = require('./lib/petOnlyEngine');
} catch (err) {
  console.warn('[StrictPet] Could not load petOnlyEngine:', err.message);
}

const VALID_PET_TYPES = ['dog', 'cat', 'both', 'dogs', 'cats'];
const VALID_PET_CATEGORIES = ['dog', 'cat', 'dogs', 'cats', 'pet', 'pets'];

const DOG_KEYWORDS = ['dog', 'puppy', 'canine', 'pup', 'pooch', 'hound'];
const CAT_KEYWORDS = ['cat', 'kitten', 'feline', 'kitty'];

const PET_CONTEXT_WORDS = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'canine', 'feline', 'paw', 'fur'];

const ADULT_BLOCKLIST = [
  'sexual', 'erotic', 'dildo', 'vibrator', 'masturbat',
  'bdsm', 'fetish', 'bondage', 'dominatrix',
  'panties', 'thong', 'bra set', 'sexy',
  'adult only', 'xxx', 'porn', 'nude', 'naked',
  'intimacy', 'sensual', 'pleasure device',
  'open crotch', 'lace jumpsuit', 'lingerie set'
];

const ADULT_WORD_BOUNDARY = [
  'anal plug', 'anal dilation', 'butt plug'
];

const HUMAN_PRODUCT_BLOCKLIST = [
  'for women', 'for men', 'for him', 'for her', 'for couples',
  'women\'s underwear', 'men\'s underwear', 'ladies underwear',
  'human use', 'personal use', 'body massager',
  'back massager', 'neck massager', 'foot massager',
  'electric massager', 'massage gun', 'massage chair',
  'dog mom', 'cat mom', 'dog dad', 'cat dad', 'dog lover', 'cat lover',
  'pet parent gift', 'dog owner', 'cat owner',
  'gifts for women', 'gifts for men', 'gift for women', 'gift for men'
];

const CONTEXT_SENSITIVE_TERMS = {
  'toy': PET_CONTEXT_WORDS,
  'massage': ['pet', 'dog', 'cat', 'grooming', 'brush'],
  'adult': ['dog', 'cat', 'pet']
};

const PET_KEYWORDS = [
  'dog', 'puppy', 'cat', 'kitten', 'pet', 'leash', 'collar', 'harness',
  'bowl', 'feeder', 'treat', 'chew', 'toy', 'grooming', 'litter', 'scratching',
  'carrier', 'crate', 'kennel', 'aquarium', 'fish tank', 'reptile', 'bird cage',
  'hamster', 'rabbit', 'training', 'poop bag', 'flea', 'tick', 'shampoo',
  'brush', 'nail clipper', 'pet bed', 'dog bed', 'cat bed', 'pet house',
  'dog house', 'cat tree', 'scratching post', 'pet gate', 'dog gate',
  'pet playpen', 'dog crate', 'cat carrier', 'pet stroller', 'dog ramp',
  'pet food', 'dog food', 'cat food', 'pet water', 'automatic feeder'
];

const NON_PET_BLOCKLIST = [
  'tattoo', 'sticker', 'bedding', 'duvet', 'quilt', 'curtain',
  'kitchen', 'cookware', 'faucet', 'lingerie', 'jewelry',
  'phone', 'iphone', 'laptop', 'makeup', 'cosmetic', 'skincare',
  'dress', 'skirt', 'blouse',
  'sneaker', 'heel', 'sandal', 'handbag', 'purse', 'wallet',
  'necklace', 'bracelet', 'earring', 'watch', 'sunglasses',
  'baby clothes', 'kids clothes', 'men clothes', 'women clothes',
  'infant', 'toddler', 'maternity', 'wedding', 'formal wear',
  'office chair', 'bookshelf', 'dining table',
  'coffee table', 'nightstand', 'wardrobe', 'closet',
  'chandelier', 'vase', 'candle', 'picture frame',
  'wall art', 'poster', 'tapestry', 'comforter',
  'sheet set', 'mattress', 'headboard', 'shower curtain', 'bath mat',
  'soap dispenser', 'toothbrush holder', 'toilet brush',
  'car part', 'engine', 'tire', 'wheel rim', 'headlight', 'bumper',
  'power tool', 'drill', 'saw', 'hammer', 'screwdriver', 'wrench',
  'garden hose', 'lawn mower', 'rake', 'shovel', 'wheelbarrow',
  'christmas tree', 'holiday decor', 'party supplies', 'balloon',
  'gift wrap', 'greeting card', 'stationery', 'notebook',
  'luggage', 'suitcase', 'duffel bag', 'gym bag',
  'yoga mat', 'dumbbell', 'weight bench'
];

const PET_SAFE_OVERRIDES = [
  'dog clothes', 'cat clothes', 'pet clothes', 'puppy clothes', 'kitten clothes',
  'dog sweater', 'cat sweater', 'dog hoodie', 'cat costume', 'pet costume',
  'dog stroller', 'pet stroller', 'dog car barrier', 'dog car seat',
  'pet car seat', 'dog ramp', 'pet ramp', 'dog stairs', 'pet stairs',
  'dog bike trailer', 'pet trailer', 'dog backpack carrier',
  'dog couch', 'pet couch', 'dog sofa', 'pet sofa', 'dog bed', 'cat bed',
  'dog playpen', 'pet playpen', 'cat playpen', 'exercise pen', 'play pen',
  'cat treadmill', 'cat wheel', 'exercise wheel', 'cat exercise',
  'pet pillow', 'dog pillow', 'cat pillow', 'pet cushion',
  'dog pen', 'pet pen', 'cat pen', 'puppy pen',
  'dog shirt', 'cat shirt', 'pet shirt', 'dog pants', 'cat pants',
  'dog sweater', 'cat sweater', 'dog hoodie', 'cat hoodie',
  'dog boot', 'dog boots', 'pet boots', 'paw protector',
  'dog towel', 'pet towel', 'grooming towel', 'drying towel',
  'pet backpack', 'dog backpack', 'cat backpack', 'carrier backpack',
  'dog tool', 'grooming tool', 'pet tool', 'nail tool',
  'pet mirror', 'bird mirror', 'parrot mirror',
  'dog rug', 'pet rug', 'pet mat', 'dog mat', 'cat mat',
  'pet blanket', 'dog blanket', 'cat blanket',
  'pet lamp', 'aquarium lamp', 'terrarium lamp', 'heat lamp'
];

function isPetEligible(product) {
  if (!product) return { eligible: false, reason: 'No product', petType: null };
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // PET-ONLY LOCKDOWN: Check centralized petOnlyEngine FIRST - this is the primary filter
  // ═══════════════════════════════════════════════════════════════════════════════
  if (petOnlyEngine && typeof petOnlyEngine.isPetApproved === 'function') {
    const lockdownResult = petOnlyEngine.isPetApproved(product);
    if (!lockdownResult.approved) {
      return { eligible: false, reason: `LOCKDOWN: ${lockdownResult.reason}`, petType: null };
    }
  }
  
  const title = (product.title || product.name || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const category = (product.category || product.categorySlug || '').toLowerCase();
  const tags = (product.tags || []).join(' ').toLowerCase();
  const source = (product.source || '').toLowerCase();
  const allText = `${title} ${description} ${category} ${tags} ${source}`;
  
  // CRITICAL: ADULT CONTENT CHECK - RUNS FIRST, NO EXCEPTIONS
  const adultTerm = ADULT_BLOCKLIST.find(term => {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return regex.test(allText);
  });
  if (adultTerm) {
    return { eligible: false, reason: `ADULT_BLOCKED: "${adultTerm}"`, petType: null };
  }
  
  // HUMAN PRODUCT CHECK - Items for humans, not pets
  const humanTerm = HUMAN_PRODUCT_BLOCKLIST.find(term => {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return regex.test(allText);
  });
  if (humanTerm) {
    return { eligible: false, reason: `HUMAN_PRODUCT: "${humanTerm}"`, petType: null };
  }
  
  // CONTEXT-SENSITIVE TERMS - Block unless in pet context
  for (const [term, validContexts] of Object.entries(CONTEXT_SENSITIVE_TERMS)) {
    if (allText.includes(term)) {
      const hasPetContext = validContexts.some(ctx => allText.includes(ctx));
      if (!hasPetContext) {
        return { eligible: false, reason: `NO_PET_CONTEXT: "${term}" without pet qualifier`, petType: null };
      }
    }
  }
  
  if (product.is_pet_product === false) {
    return { eligible: false, reason: 'Explicitly marked non-pet', petType: null };
  }
  
  if (product.blocked_reason) {
    return { eligible: false, reason: `Blocked: ${product.blocked_reason}`, petType: null };
  }
  
  const hasCjId = product.cjProductId || product.cjPid || product.cj_pid || 
                 (product.id && (product.id.startsWith('cj-') || /^\d{15,}$/.test(product.id)));
  if (!hasCjId) {
    return { eligible: false, reason: 'No CJ product ID', petType: null };
  }
  
  const hasPetSafeOverride = PET_SAFE_OVERRIDES.some(term => allText.includes(term));
  
  if (!hasPetSafeOverride) {
    const blockedTerm = NON_PET_BLOCKLIST.find(term => {
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(title) || regex.test(description);
    });
    
    if (blockedTerm) {
      return { eligible: false, reason: `Blocked term: "${blockedTerm}"`, petType: null };
    }
  }
  
  // CHECK: petApproved flag (explicit approval)
  if (product.petApproved === true) {
    const petType = product.species || product.petType || product.pet_type || 'both';
    return { eligible: true, reason: 'petApproved=true', petType: normalizePetType(petType) };
  }
  
  // CHECK: species field
  const species = (product.species || '').toLowerCase();
  if (species === 'dog' || species === 'cat') {
    return { eligible: true, reason: `species=${species}`, petType: species };
  }
  
  const petType = product.petType || product.pet_type;
  if (petType && VALID_PET_TYPES.includes(petType.toLowerCase())) {
    return { 
      eligible: true, 
      reason: 'Has explicit petType', 
      petType: normalizePetType(petType)
    };
  }
  
  const mainCat = (product.mainCategorySlug || '').toLowerCase();
  if (VALID_PET_CATEGORIES.some(c => mainCat.includes(c))) {
    return { 
      eligible: true, 
      reason: 'mainCategorySlug is pet category', 
      petType: inferPetTypeFromText(mainCat)
    };
  }
  
  if (VALID_PET_CATEGORIES.some(c => category.includes(c))) {
    return { 
      eligible: true, 
      reason: 'category is pet category', 
      petType: inferPetTypeFromText(category)
    };
  }
  
  const hasDogKeyword = DOG_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(title));
  const hasCatKeyword = CAT_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(title));
  
  if (hasDogKeyword && hasCatKeyword) {
    return { eligible: true, reason: 'Title contains both dog and cat keywords', petType: 'both' };
  }
  if (hasDogKeyword) {
    return { eligible: true, reason: 'Title contains dog keywords', petType: 'dog' };
  }
  if (hasCatKeyword) {
    return { eligible: true, reason: 'Title contains cat keywords', petType: 'cat' };
  }
  
  const hasPetKeyword = PET_KEYWORDS.some(kw => {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(title) || regex.test(description);
  });
  
  if (hasPetKeyword) {
    return { eligible: true, reason: 'Contains pet-related keyword', petType: 'both' };
  }
  
  return { eligible: false, reason: 'No pet-related markers found', petType: null };
}

function normalizePetType(petType) {
  const lower = (petType || '').toLowerCase();
  if (lower === 'dogs' || lower === 'dog') return 'dog';
  if (lower === 'cats' || lower === 'cat') return 'cat';
  if (lower === 'both') return 'both';
  return null;
}

function inferPetTypeFromText(text) {
  const lower = text.toLowerCase();
  const hasDog = DOG_KEYWORDS.some(kw => lower.includes(kw));
  const hasCat = CAT_KEYWORDS.some(kw => lower.includes(kw));
  
  if (hasDog && hasCat) return 'both';
  if (hasDog) return 'dog';
  if (hasCat) return 'cat';
  return 'both';
}

function getPetProducts(allProducts) {
  const dogs = [];
  const cats = [];
  const both = [];
  const rejected = [];
  
  for (const product of allProducts) {
    const result = isPetEligible(product);
    
    if (!result.eligible) {
      rejected.push({ product, reason: result.reason });
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[StrictPet] REJECTED: ${product.id} - ${result.reason} - "${(product.title || '').slice(0, 40)}"`);
      }
      continue;
    }
    
    const type = result.petType || 'both';
    if (type === 'dog') {
      dogs.push({ ...product, _petType: 'dog' });
    } else if (type === 'cat') {
      cats.push({ ...product, _petType: 'cat' });
    } else {
      both.push({ ...product, _petType: 'both' });
      dogs.push({ ...product, _petType: 'both' });
      cats.push({ ...product, _petType: 'both' });
    }
  }
  
  console.log(`[StrictPet] getPetProducts() summary:`);
  console.log(`  - Dogs: ${dogs.length}`);
  console.log(`  - Cats: ${cats.length}`);
  console.log(`  - Both: ${both.length}`);
  console.log(`  - Rejected: ${rejected.length}`);
  
  return { dogs, cats, both, rejected };
}

function assertHomepagePetOnly(products, sectionName) {
  if (!Array.isArray(products)) {
    throw new Error(`[HOMEPAGE ASSERTION] ${sectionName}: products is not an array`);
  }
  
  const violations = [];
  
  for (const product of products) {
    const result = isPetEligible(product);
    if (!result.eligible) {
      violations.push({
        id: product.id,
        title: (product.title || '').slice(0, 50),
        reason: result.reason
      });
    }
  }
  
  if (violations.length > 0) {
    const message = `[HOMEPAGE ASSERTION] ${sectionName}: ${violations.length} non-pet products detected!`;
    console.error(message);
    violations.forEach(v => {
      console.error(`  - ${v.id}: ${v.reason} - "${v.title}"`);
    });
    
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(message);
    } else {
      console.error(`[CRITICAL] Non-pet products would have appeared on homepage in ${sectionName}`);
      return products.filter(p => isPetEligible(p).eligible);
    }
  }
  
  return products;
}

function getHomepageSections(allProducts) {
  const { dogs, cats, rejected } = getPetProducts(allProducts);
  
  const sortByScore = (a, b) => {
    const scoreA = (a.featured_score || 0) + (a.popularity_score || 0);
    const scoreB = (b.featured_score || 0) + (b.popularity_score || 0);
    return scoreB - scoreA;
  };
  
  const dogsSorted = dogs.sort(sortByScore);
  const catsSorted = cats.sort(sortByScore);
  
  const topPicksDogs = assertHomepagePetOnly(dogsSorted.slice(0, 12), 'topPicksDogs');
  const topPicksCats = assertHomepagePetOnly(catsSorted.slice(0, 12), 'topPicksCats');
  
  const allPetProducts = [...dogsSorted, ...catsSorted]
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
    .sort(sortByScore);
  
  const bestSellers = assertHomepagePetOnly(
    allPetProducts.filter(p => p.is_best_seller === true).slice(0, 10),
    'bestSellers'
  );
  
  const trending = assertHomepagePetOnly(
    allPetProducts.filter(p => p.is_trending === true).slice(0, 12),
    'trending'
  );
  
  console.log(`[StrictPet] Homepage sections ready:`);
  console.log(`  - Top Picks Dogs: ${topPicksDogs.length}`);
  console.log(`  - Top Picks Cats: ${topPicksCats.length}`);
  console.log(`  - Best Sellers: ${bestSellers.length}`);
  console.log(`  - Trending: ${trending.length}`);
  console.log(`  - REJECTED (not on homepage): ${rejected.length}`);
  
  return {
    topPicksDogs,
    topPicksCats,
    bestSellers,
    trending,
    stats: {
      dogs: dogs.length,
      cats: cats.length,
      rejected: rejected.length
    }
  };
}

module.exports = {
  isPetEligible,
  getPetProducts,
  assertHomepagePetOnly,
  getHomepageSections,
  normalizePetType,
  DOG_KEYWORDS,
  CAT_KEYWORDS,
  PET_KEYWORDS,
  NON_PET_BLOCKLIST,
  PET_SAFE_OVERRIDES,
  VALID_PET_TYPES,
  VALID_PET_CATEGORIES
};
