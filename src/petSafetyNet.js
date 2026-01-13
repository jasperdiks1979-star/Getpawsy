const PET_EXPLICIT_KEYWORDS = [
  'dog', 'puppy', 'pup', 'canine', 'doggy', 'doggo', 'pooch',
  'cat', 'kitten', 'kitty', 'feline',
  'pet', 'pets', 'pet supplies', 'for pets',
  'hamster', 'rabbit', 'bunny', 'bird', 'parrot', 'fish', 'aquarium'
];

const PET_CONTEXTUAL_KEYWORDS = [
  'leash', 'collar', 'harness', 'lead',
  'chew', 'chews', 'treat', 'treats',
  'feeder', 'bowl', 'fountain', 'dispenser',
  'grooming', 'brush', 'comb', 'shampoo', 'nail clipper', 'deshedding',
  'litter', 'scratching', 'scratcher', 'cat tree',
  'carrier', 'crate', 'kennel', 'cage',
  'pee pad', 'potty', 'diaper',
  'stroller', 'pram'
];

const PET_GENERIC_KEYWORDS = [
  'toy', 'toys', 'ball', 'rope', 'squeaky', 'plush',
  'bed', 'blanket', 'cushion', 'mat',
  'training', 'snack'
];

const PET_NEGATIVE_KEYWORDS = [
  'handbag', 'purse', 'wallet', 'clutch', 'tote bag',
  'high heels', 'stiletto', 'pumps shoes', 'sneakers',
  'makeup', 'cosmetic', 'lipstick', 'mascara', 'foundation', 'skincare',
  'necklace', 'earring', 'bracelet', 'jewelry',
  'laptop', 'tablet computer', 'smartphone', 'phone case', 'headphones',
  'cookware', 'kitchen utensil', 'cutting board', 'knife set',
  'office furniture', 'stationery set', 'notebook',
  'power tool', 'garden hose', 'drill set', 'hammer',
  'lingerie', 'bikini', 'underwear',
  'home decor', 'wall art', 'picture frame', 'vase', 'candle holder',
  'tattoo', 'sticker', 'human shoes', 'human socks', 'human hoodie', 'human sweater',
  'bedding', 'quilt', 'curtain', 'watch', 'dress', 'pants', 'bra',
  'stud earrings', 'dangle earrings', 'hoop earrings', 'drop earrings',
  'cat print', 'dog print', 'paw print', 'cat pattern', 'dog pattern',
  'cat earrings', 'dog earrings', 'cat necklace', 'dog necklace',
  'cat charm', 'dog charm', 'paw charm', 'cat pendant', 'dog pendant',
  'cat keychain', 'dog keychain', 'paw keychain',
  'cat decoration', 'dog decoration', 'cat ornament', 'dog ornament',
  'cat figurine', 'dog figurine', 'cat statue', 'dog statue'
];

const PET_NEGATIVE_CONTEXT = [
  'for women', 'for men', 'womens', 'mens', "women's", "men's",
  'for kids', 'for children', 'kids room', 'baby room', 'nursery decor',
  'fashion accessory', 'yoga mat', 'fitness equipment', 'gym equipment',
  'human use', 'not for pets'
];

const PET_CATEGORY_KEYWORDS = ['pet', 'dog', 'cat', 'puppy', 'kitten', 'animal'];

function classifyPetProduct(product) {
  const title = (product.title || product.nameEn || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const categoryPath = (product.categoryPath || product.threeCategoryName || product.twoCategoryName || product.oneCategoryName || '').toLowerCase();
  const tags = (product.tags || []).map(t => t.toLowerCase()).join(' ');
  
  const combinedText = `${title} ${description} ${categoryPath} ${tags}`;
  
  const negativeMatches = PET_NEGATIVE_KEYWORDS.filter(kw => combinedText.includes(kw));
  if (negativeMatches.length > 0) {
    return {
      isPetProduct: false,
      reason: `NEGATIVE_KEYWORD: ${negativeMatches[0]}`,
      confidence: 'high'
    };
  }
  
  const negativeContextMatches = PET_NEGATIVE_CONTEXT.filter(kw => combinedText.includes(kw));
  if (negativeContextMatches.length > 0) {
    return {
      isPetProduct: false,
      reason: `NEGATIVE_CONTEXT: ${negativeContextMatches[0]}`,
      confidence: 'high'
    };
  }
  
  const categoryMatch = PET_CATEGORY_KEYWORDS.some(kw => categoryPath.includes(kw));
  if (categoryMatch) {
    return {
      isPetProduct: true,
      reason: 'PET_CATEGORY_MATCH',
      confidence: 'high'
    };
  }
  
  const explicitMatches = PET_EXPLICIT_KEYWORDS.filter(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(title) || regex.test(description);
  });
  
  if (explicitMatches.length > 0) {
    return {
      isPetProduct: true,
      reason: `EXPLICIT_PET_KEYWORD: ${explicitMatches[0]}`,
      confidence: 'high'
    };
  }
  
  const contextualMatches = PET_CONTEXTUAL_KEYWORDS.filter(kw => combinedText.includes(kw));
  if (contextualMatches.length >= 2) {
    return {
      isPetProduct: true,
      reason: `PET_CONTEXT: ${contextualMatches.slice(0, 3).join(', ')}`,
      confidence: 'high'
    };
  }
  
  if (contextualMatches.length === 1) {
    return {
      isPetProduct: false,
      reason: `NEEDS_REVIEW: single contextual match (${contextualMatches[0]})`,
      confidence: 'low'
    };
  }
  
  const genericMatches = PET_GENERIC_KEYWORDS.filter(kw => combinedText.includes(kw));
  if (genericMatches.length > 0) {
    return {
      isPetProduct: false,
      reason: `NEEDS_REVIEW: generic keyword without pet context (${genericMatches[0]})`,
      confidence: 'low'
    };
  }
  
  return {
    isPetProduct: false,
    reason: 'NO_PET_INDICATORS_FOUND',
    confidence: 'low'
  };
}

function isStorefrontEligible(product) {
  if (product.hidden_from_storefront === true) return false;
  if (product.needs_review === true) return false;
  if (product.is_pet_product === false) return false;
  if (product.active === false) return false;
  
  const tags = product.tags || [];
  const hasUSWarehouse = tags.includes('us-warehouse') || tags.includes('cj');
  
  return hasUSWarehouse || product.is_pet_product === true;
}

function applyPetClassification(product) {
  const result = classifyPetProduct(product);
  
  if (result.isPetProduct) {
    return {
      ...product,
      is_pet_product: true,
      needs_review: false,
      hidden_from_storefront: false,
      pet_classification_reason: result.reason,
      pet_classification_confidence: result.confidence
    };
  } else {
    return {
      ...product,
      is_pet_product: false,
      needs_review: true,
      hidden_from_storefront: true,
      pet_classification_reason: result.reason,
      pet_classification_confidence: result.confidence
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PET-ONLY LOCKDOWN: Use centralized petOnlyEngine as primary filter
// ═══════════════════════════════════════════════════════════════════════════════
function filterStorefrontProducts(products) {
  try {
    const { filterPetApproved, PETONLY_MODE } = require('./lib/petOnlyEngine');
    const { products: lockdownFiltered } = filterPetApproved(products, PETONLY_MODE);
    return lockdownFiltered.filter(p => isStorefrontEligible(p));
  } catch (err) {
    console.error('[PetSafetyNet] PetOnlyEngine error, falling back:', err.message);
    return products.filter(p => isStorefrontEligible(p));
  }
}

function purgeNonPetProducts(products) {
  const results = {
    total: products.length,
    rejected: 0,
    approved: 0,
    rejectedProducts: []
  };
  
  const processedProducts = products.map(product => {
    const classification = classifyPetProduct(product);
    
    if (classification.isPetProduct) {
      results.approved++;
      return {
        ...product,
        is_pet_product: true,
        status: product.status === 'rejected' ? 'draft' : (product.status || 'active'),
        pet_classification_reason: classification.reason,
        pet_classification_confidence: classification.confidence,
        needs_review: false,
        hidden_from_storefront: false
      };
    } else {
      results.rejected++;
      results.rejectedProducts.push({
        id: product.id,
        title: product.title || product.name,
        reason: classification.reason
      });
      return {
        ...product,
        is_pet_product: false,
        status: 'rejected',
        pet_classification_reason: classification.reason,
        pet_classification_confidence: classification.confidence,
        needs_review: true,
        hidden_from_storefront: true
      };
    }
  });
  
  return { products: processedProducts, results };
}

function petOnlyGuard(product) {
  const classification = classifyPetProduct(product);
  
  if (!classification.isPetProduct) {
    return {
      passed: false,
      reason: classification.reason,
      confidence: classification.confidence
    };
  }
  
  const title = (product.title || product.name || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const hasMinImages = product.images && product.images.length > 0;
  
  if (!hasMinImages) {
    return {
      passed: false,
      reason: 'NO_VALID_IMAGES',
      confidence: 'high'
    };
  }
  
  return {
    passed: true,
    reason: classification.reason,
    confidence: classification.confidence
  };
}

module.exports = {
  classifyPetProduct,
  isStorefrontEligible,
  applyPetClassification,
  filterStorefrontProducts,
  purgeNonPetProducts,
  petOnlyGuard,
  PET_EXPLICIT_KEYWORDS,
  PET_CONTEXTUAL_KEYWORDS,
  PET_GENERIC_KEYWORDS,
  PET_NEGATIVE_KEYWORDS,
  PET_NEGATIVE_CONTEXT
};
