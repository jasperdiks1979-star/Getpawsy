/**
 * Pet-Only Filter - Deterministic classification for pet products
 * Blocks non-pet items (clothing, jeans, lingerie, fashion, electronics)
 */

// Hard-block keywords (case-insensitive) - items matching these are REJECTED
const HARD_BLOCK_KEYWORDS = {
  clothing: ['jeans', 'pants', 'trousers', 'bra', 'lingerie', 'sexy', 'bikini', 'swimsuit', 'corset', 'underwear', 'panties', 'bodysuit', 'lace', 'deep-v'],
  fashion: ['dress', 'skirt', 'blouse', 'fashion', 'runway', 'streetwear', 'apparel', 'garment', 'outfit'],
  adult: ['adult', 'erotic', 'adult'],
  electronics: ['phone case', 'ipad', 'laptop', 'computer', 'keyboard', 'mouse', 'monitor', 'tablet'],
};

// Positive keywords for pets (case-insensitive) - scored per match
const PET_KEYWORDS = {
  dog: ['dog', 'puppy', 'canine', 'leash', 'collar', 'harness', 'muzzle', 'crate', 'kennel', 'training', 'chew', 'treat', 'grooming', 'shampoo', 'brush', 'poop bag', 'fetch', 'tug', 'bowl', 'feeder', 'paw', 'bark', 'wag'],
  cat: ['cat', 'kitten', 'feline', 'litter', 'scratching', 'scratcher', 'catnip', 'laser', 'wand', 'carrier', 'litter box', 'meow', 'paw', 'whisker'],
  general: ['pet', 'pets', 'vet', 'veterinary', 'kibble', 'feeder', 'water fountain', 'bed', 'blanket', 'toy', 'nail clipper', 'grooming', 'harness', 'leash', 'treat', 'food'],
};

/**
 * Classifies product pet relevancy
 * @param {string} title - Product title
 * @param {string} description - Product description
 * @param {string} category - Product category
 * @returns {{decision: 'ACCEPT'|'REJECT', score: number, reasons: string[], matchedKeywords: string[]}}
 */
function classifyPetRelevance(title, description, category) {
  const fullText = `${title} ${description} ${category}`.toLowerCase();
  const reasons = [];
  const matchedKeywords = [];
  let petScore = 0;

  // HARD BLOCK - reject if contains any hard-block keywords
  for (const [blockType, keywords] of Object.entries(HARD_BLOCK_KEYWORDS)) {
    for (const keyword of keywords) {
      if (fullText.includes(keyword.toLowerCase())) {
        reasons.push(`Hard-blocked (${blockType}): "${keyword}"`);
        matchedKeywords.push(keyword);
        return {
          decision: 'REJECT',
          score: 0,
          reasons,
          matchedKeywords,
        };
      }
    }
  }

  // SOFT SCORING - count pet keyword matches
  for (const [petType, keywords] of Object.entries(PET_KEYWORDS)) {
    for (const keyword of keywords) {
      if (fullText.includes(keyword.toLowerCase())) {
        petScore += 1;
        matchedKeywords.push(keyword);
      }
    }
  }

  if (petScore > 0) {
    reasons.push(`Pet-relevant: ${petScore} keyword match${petScore !== 1 ? 'es' : ''}`);
    return {
      decision: 'ACCEPT',
      score: petScore,
      reasons,
      matchedKeywords,
    };
  }

  // NO PET KEYWORDS - reject as non-pet
  reasons.push('No pet-related keywords found');
  return {
    decision: 'REJECT',
    score: 0,
    reasons,
    matchedKeywords: [],
  };
}

/**
 * Apply pet filter to a product
 * @param {object} product - Product object
 * @returns {object} Product with rejection fields if rejected
 */
function applyPetFilter(product) {
  const classification = classifyPetRelevance(
    product.title || '',
    product.description || '',
    product.category || ''
  );

  if (classification.decision === 'REJECT') {
    return {
      ...product,
      active: false,
      rejected: true,
      rejectReasons: classification.reasons,
      rejectMatchedKeywords: classification.matchedKeywords,
    };
  }

  return {
    ...product,
    rejected: false,
    rejectReasons: [],
    rejectMatchedKeywords: [],
  };
}

module.exports = {
  classifyPetRelevance,
  applyPetFilter,
  HARD_BLOCK_KEYWORDS,
  PET_KEYWORDS,
};
