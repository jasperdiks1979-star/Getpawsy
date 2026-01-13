const PET_REASONS = {
  dog: {
    toys: [
      "Pawsy picked this because it keeps pups entertained for hours.",
      "Perfect for dogs who love to play fetch and chew.",
      "Great for active dogs who need mental stimulation."
    ],
    feeding: [
      "Pawsy chose this for healthier, mess-free mealtimes.",
      "Designed to slow down fast eaters and aid digestion.",
      "Perfect for dogs who deserve premium mealtime comfort."
    ],
    beds: [
      "Pawsy selected this for cozy, supportive rest.",
      "Ideal for dogs who love to curl up and snooze.",
      "Premium comfort for your pup's beauty sleep."
    ],
    grooming: [
      "Pawsy recommends this for a shiny, healthy coat.",
      "Gentle grooming that dogs actually enjoy.",
      "Professional results at home for your furry friend."
    ],
    travel: [
      "Pawsy picked this for safe, stress-free adventures.",
      "Perfect for dogs who love car rides and outings.",
      "Keep your pup secure and comfortable on the go."
    ],
    training: [
      "Pawsy chose this to make training fun and effective.",
      "Great for positive reinforcement and bonding.",
      "Helps build good habits with your best friend."
    ],
    health: [
      "Pawsy selected this for your dog's wellbeing.",
      "Supports a healthy, happy lifestyle for pups.",
      "Premium care for dogs who deserve the best."
    ],
    default: [
      "Pawsy handpicked this for happy, healthy dogs.",
      "Quality tested and approved for your furry friend.",
      "Made with love for dogs who deserve the best."
    ]
  },
  cat: {
    toys: [
      "Pawsy chose this to satisfy your cat's hunting instincts.",
      "Perfect for curious cats who love to pounce and play.",
      "Keeps indoor cats entertained and active."
    ],
    feeding: [
      "Pawsy picked this for whisker-friendly mealtimes.",
      "Designed for cats who deserve premium dining.",
      "Elevates mealtime for picky feline foodies."
    ],
    beds: [
      "Pawsy selected this for the ultimate cat nap spot.",
      "Cozy comfort for cats who love to lounge.",
      "Perfect for felines who appreciate luxury."
    ],
    scratchers: [
      "Pawsy recommends this to save your furniture.",
      "Satisfies natural scratching instincts safely.",
      "Premium scratching that cats can't resist."
    ],
    litter: [
      "Pawsy chose this for a cleaner, fresher home.",
      "Easy maintenance for happy cats and owners.",
      "Premium litter solutions for discerning cats."
    ],
    grooming: [
      "Pawsy picked this for a sleek, healthy coat.",
      "Gentle care that cats actually tolerate.",
      "Professional grooming results at home."
    ],
    health: [
      "Pawsy selected this for feline wellness.",
      "Supports a healthy, happy cat lifestyle.",
      "Premium care for your beloved companion."
    ],
    default: [
      "Pawsy handpicked this for curious, happy cats.",
      "Feline-approved quality for your furry friend.",
      "Crafted with love for cats who rule the house."
    ]
  },
  both: {
    default: [
      "Pawsy chose this for dogs and cats alike.",
      "Multi-pet household approved and tested.",
      "Quality care for all your furry friends."
    ]
  }
};

const TRAIT_MODIFIERS = {
  active: "perfect for active pets who love to play",
  anxious: "gentle and calming for sensitive pets",
  indoor: "ideal for indoor pets who need enrichment",
  outdoor: "great for adventurous outdoor pets",
  sensitive: "hypoallergenic and gentle on sensitive skin"
};

const SIZE_MODIFIERS = {
  small: "sized just right for small breeds",
  medium: "perfect fit for medium-sized pets",
  large: "built sturdy for large breeds"
};

const AGE_MODIFIERS = {
  puppy: "safe and suitable for puppies",
  kitten: "kitten-safe and appropriately sized",
  adult: "designed for adult pets in their prime",
  senior: "gentle and supportive for senior pets"
};

function generatePawsyReason(product, petProfile = null) {
  if (product.pawsy_reason && product.pawsy_reason.length > 10) {
    return product.pawsy_reason;
  }

  const petType = (product.petType || 'dog').toLowerCase();
  const bucket = (product.bucket || product.category || 'default').toLowerCase();
  
  let reasons = [];
  
  if (PET_REASONS[petType] && PET_REASONS[petType][bucket]) {
    reasons = PET_REASONS[petType][bucket];
  } else if (PET_REASONS[petType] && PET_REASONS[petType].default) {
    reasons = PET_REASONS[petType].default;
  } else {
    reasons = PET_REASONS.dog.default;
  }
  
  let baseReason = reasons[Math.floor(Math.random() * reasons.length)];
  
  if (petProfile) {
    const modifiers = [];
    
    if (petProfile.traits && petProfile.traits.length) {
      const trait = petProfile.traits[0];
      if (TRAIT_MODIFIERS[trait]) {
        modifiers.push(TRAIT_MODIFIERS[trait]);
      }
    }
    
    if (petProfile.size && SIZE_MODIFIERS[petProfile.size]) {
      modifiers.push(SIZE_MODIFIERS[petProfile.size]);
    }
    
    if (petProfile.ageGroup && AGE_MODIFIERS[petProfile.ageGroup]) {
      modifiers.push(AGE_MODIFIERS[petProfile.ageGroup]);
    }
    
    if (modifiers.length > 0) {
      const modifier = modifiers[0];
      baseReason = baseReason.replace(/\.$/, '') + ' - ' + modifier + '.';
    }
  }
  
  if (baseReason.length > 140) {
    baseReason = baseReason.substring(0, 137) + '...';
  }
  
  return baseReason;
}

function generatePawsyReasonFromKeywords(product) {
  const title = (product.title || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const text = title + ' ' + desc;
  
  const categorySignals = {
    toys: ['toy', 'ball', 'chew', 'plush', 'squeaky', 'interactive', 'teaser', 'feather'],
    feeding: ['bowl', 'feeder', 'water', 'fountain', 'food', 'dish', 'slow'],
    beds: ['bed', 'cushion', 'mat', 'blanket', 'sleeping', 'cozy', 'comfort'],
    grooming: ['brush', 'comb', 'shampoo', 'nail', 'grooming', 'coat', 'fur'],
    scratchers: ['scratcher', 'scratch', 'sisal', 'cardboard', 'post'],
    litter: ['litter', 'box', 'scoop', 'odor'],
    travel: ['carrier', 'travel', 'car', 'seat', 'harness', 'leash', 'collar'],
    training: ['training', 'treat', 'clicker', 'potty', 'puppy pad'],
    health: ['supplement', 'vitamin', 'health', 'dental', 'clean', 'care']
  };
  
  let detectedCategory = 'default';
  for (const [cat, keywords] of Object.entries(categorySignals)) {
    if (keywords.some(kw => text.includes(kw))) {
      detectedCategory = cat;
      break;
    }
  }
  
  const petType = text.includes('cat') || text.includes('kitten') || text.includes('feline') 
    ? 'cat' 
    : text.includes('dog') || text.includes('puppy') || text.includes('canine')
    ? 'dog'
    : 'both';
  
  return generatePawsyReason({ 
    ...product, 
    petType, 
    bucket: detectedCategory 
  });
}

function attachPawsyReason(product, petProfile = null) {
  if (!product) return product;
  
  if (!product.pawsy_reason) {
    product.pawsy_reason = product.petType 
      ? generatePawsyReason(product, petProfile)
      : generatePawsyReasonFromKeywords(product);
  }
  
  return product;
}

function attachPawsyReasons(products, petProfile = null) {
  return products.map(p => attachPawsyReason(p, petProfile));
}

module.exports = {
  generatePawsyReason,
  generatePawsyReasonFromKeywords,
  attachPawsyReason,
  attachPawsyReasons,
  PET_REASONS,
  TRAIT_MODIFIERS,
  SIZE_MODIFIERS,
  AGE_MODIFIERS
};
