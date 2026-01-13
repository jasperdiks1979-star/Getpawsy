/**
 * STRICT PET PRODUCT PREDICATE v1.0
 * 
 * Single source of truth for determining if a product is pet-related.
 * Used for homepage filtering, cart validation, and API responses.
 */

const PET_CATEGORIES = [
  'dogs', 'cats', 'dog', 'cat', 'pets', 'pet',
  'dog-toys', 'cat-toys', 'dog-beds', 'cat-beds',
  'dog-food', 'cat-food', 'dog-treats', 'cat-treats',
  'dog-grooming', 'cat-grooming', 'dog-accessories', 'cat-accessories',
  'dog-clothing', 'cat-clothing', 'dog-harnesses', 'cat-carriers',
  'dog-bowls', 'cat-bowls', 'dog-leashes', 'cat-collars',
  'dog-crates', 'cat-trees', 'dog-kennels', 'cat-scratchers'
];

const PET_KEYWORDS = [
  'dog', 'cat', 'puppy', 'kitten', 'canine', 'feline',
  'pet', 'pup', 'kitty', 'pooch', 'furry', 'paw',
  'collar', 'leash', 'harness', 'kennel', 'crate', 'carrier',
  'bowl', 'feeder', 'treat', 'chew', 'toy', 'bed', 'blanket',
  'grooming', 'brush', 'shampoo', 'nail', 'clipper',
  'litter', 'scratching', 'catnip', 'fetch', 'ball', 'squeaky'
];

const NON_PET_BLOCKLIST = [
  'sticker', 'tattoo', 'poster', 'wall art', 'phone case',
  'human clothing', 'adult clothing', 'jewelry', 'watch',
  'electronics', 'computer', 'phone', 'tablet', 'camera',
  'furniture', 'human bedding', 'curtain', 'rug', 'carpet',
  'kitchen', 'cooking', 'bathroom', 'office', 'school'
];

function isPetProduct(product, options = {}) {
  if (!product) return { eligible: false, reason: 'No product provided' };
  
  const { strict = true, context = 'unknown' } = options;
  
  if (product.is_pet_product === false) {
    return { eligible: false, reason: 'Explicitly marked as non-pet' };
  }
  
  if (product.blocked_reason) {
    return { eligible: false, reason: `Blocked: ${product.blocked_reason}` };
  }
  
  const id = product.id || product.cjProductId || product.cjPid;
  const hasCjId = id && (String(id).startsWith('cj-') || /^\d{15,}$/.test(String(id)));
  
  if (!hasCjId) {
    return { eligible: false, reason: 'Missing valid CJ product ID' };
  }
  
  if (product.is_pet_product === true) {
    return { eligible: true, reason: 'Explicitly marked as pet product', petType: product.pet_type };
  }
  
  if (product.pet_type && ['dog', 'cat', 'both'].includes(product.pet_type)) {
    return { eligible: true, reason: 'Has valid pet_type', petType: product.pet_type };
  }
  
  const category = (product.category || product.categorySlug || '').toLowerCase();
  const mainCategory = (product.mainCategorySlug || '').toLowerCase();
  
  if (PET_CATEGORIES.some(c => category.includes(c) || mainCategory.includes(c))) {
    return { eligible: true, reason: 'In pet category', petType: inferPetType(category) };
  }
  
  const title = (product.title || product.name || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const text = `${title} ${description}`;
  
  for (const blocked of NON_PET_BLOCKLIST) {
    if (text.includes(blocked.toLowerCase())) {
      return { eligible: false, reason: `Contains blocked term: ${blocked}` };
    }
  }
  
  const petKeywordMatches = PET_KEYWORDS.filter(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(text);
  });
  
  if (petKeywordMatches.length >= (strict ? 2 : 1)) {
    return { 
      eligible: true, 
      reason: `Matched pet keywords: ${petKeywordMatches.join(', ')}`,
      petType: inferPetType(text)
    };
  }
  
  return { eligible: false, reason: 'No pet-related markers found' };
}

function inferPetType(text) {
  const lower = text.toLowerCase();
  const hasDog = /\b(dog|puppy|canine|pup|pooch)\b/.test(lower);
  const hasCat = /\b(cat|kitten|feline|kitty)\b/.test(lower);
  
  if (hasDog && hasCat) return 'both';
  if (hasDog) return 'dog';
  if (hasCat) return 'cat';
  return null;
}

function assertPetOnly(products, context = 'unknown') {
  if (!Array.isArray(products)) {
    console.error(`[PET ASSERTION] ${context}: products is not an array`);
    return [];
  }
  
  const results = products.map(p => ({
    product: p,
    result: isPetProduct(p, { context })
  }));
  
  const eligible = results.filter(r => r.result.eligible);
  const rejected = results.filter(r => !r.result.eligible);
  
  if (rejected.length > 0) {
    const isDev = process.env.NODE_ENV !== 'production';
    
    if (isDev) {
      console.error(`[PET ASSERTION] ${context}: ${rejected.length} non-pet products detected!`);
      rejected.slice(0, 5).forEach(r => {
        console.error(`  - ${r.product.id}: ${r.result.reason}`);
      });
      throw new Error(`[PET ASSERTION] ${rejected.length} non-pet products in ${context}`);
    } else {
      console.error(`[PET ASSERTION] CRITICAL: ${rejected.length} non-pet products filtered in ${context}`);
    }
  }
  
  return eligible.map(r => r.product);
}

module.exports = {
  isPetProduct,
  assertPetOnly,
  inferPetType,
  PET_CATEGORIES,
  PET_KEYWORDS,
  NON_PET_BLOCKLIST
};
