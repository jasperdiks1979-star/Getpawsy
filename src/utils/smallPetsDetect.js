/**
 * SMALL PETS DETECTION LOGIC
 * Identifies rabbits, hamsters, guinea pigs, and other small pets.
 */

const SMALL_PET_KEYWORDS = {
  rabbit: ['rabbit', 'bunny', 'bunnies'],
  hamster: ['hamster'],
  guinea_pig: ['guinea pig', 'guinea-pig', 'guinea'],
  other: ['chinchilla', 'ferret', 'mouse', 'mice', 'rat', 'rats', 'rodent', 'rodents', 'small pet', 'small-pet', 'small animal', 'small-animal']
};

const EXCLUSIONS = {
  mouse: ['cat toy', 'cat teaser', 'for cats', 'cat nip', 'catnip'],
  hamster: ['graphic', 't-shirt', 'tshirt', 'shirt', 'clothing']
};

function detectSmallPet(product) {
  const title = (product.title || product.name || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const tags = Array.isArray(product.tags) ? product.tags.join(' ').toLowerCase() : (product.tags || '').toLowerCase();
  const type = (product.type || '').toLowerCase();
  const category = (product.category || product.mainCategorySlug || '').toLowerCase();
  
  const combinedText = `${title} ${description} ${tags} ${type} ${category}`;
  
  let detectedType = null;
  let confidence = 0;
  
  // Priority: rabbit > hamster > guinea_pig > other
  const order = ['rabbit', 'hamster', 'guinea_pig', 'other'];
  
  for (const petType of order) {
    const keywords = SMALL_PET_KEYWORDS[petType];
    const matches = keywords.filter(kw => combinedText.includes(kw));
    
    if (matches.length > 0) {
      // Check Exclusions
      if (petType === 'other' && (combinedText.includes('mouse') || combinedText.includes('mice'))) {
        if (EXCLUSIONS.mouse.some(ex => combinedText.includes(ex))) continue;
      }
      
      if (petType === 'hamster' && EXCLUSIONS.hamster.some(ex => combinedText.includes(ex))) {
        // Only exclude if no other pet-related terms are present
        const hasCage = combinedText.includes('cage') || combinedText.includes('house') || combinedText.includes('bed');
        if (!hasCage) continue;
      }
      
      detectedType = petType;
      confidence = matches.length;
      break;
    }
  }
  
  return {
    isSmallPet: detectedType !== null,
    smallPetType: detectedType,
    confidence
  };
}

module.exports = {
  detectSmallPet
};
