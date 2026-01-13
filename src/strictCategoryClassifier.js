/**
 * STRICT CATEGORY CLASSIFIER v2.0
 * Deterministic classifier with confidence scores and HARD EXCLUDE rules.
 * Prevents dog/cat products from appearing in Small Pets.
 */

const DOG_ONLY_KEYWORDS = [
  'dog', 'dogs', 'puppy', 'puppies', 'canine', 'pup', 'pooch', 'hound',
  'doggy', 'doggo', 'k9', 'woof', 'bark', 'anti-bark',
  'dog bed', 'dog bowl', 'dog toy', 'dog treat', 'dog food', 'dog house',
  'dog coat', 'dog jacket', 'dog sweater', 'dog ramp', 'dog gate',
  'dog kennel', 'dog crate', 'dog carrier', 'dog leash', 'dog harness',
  'dog collar', 'dog muzzle', 'dog training', 'dog grooming'
];

const CAT_ONLY_KEYWORDS = [
  'cat', 'cats', 'kitten', 'kittens', 'feline', 'kitty', 'meow',
  'cat tree', 'cat tower', 'cat condo', 'cat cave', 'cat perch',
  'cat bed', 'cat bowl', 'cat toy', 'cat treat', 'cat food', 'cat house',
  'litter', 'litter box', 'scratching', 'scratcher', 'scratch post', 'sisal',
  'catnip', 'cat nip', 'feather wand', 'laser pointer', 'cat carrier',
  'cat collar', 'cat harness', 'cat grooming'
];

const SMALL_PET_KEYWORDS = {
  rabbits: ['rabbit', 'bunny', 'bunnies', 'hutch', 'rabbit cage', 'rabbit food', 'hay rack'],
  guinea_pigs: ['guinea pig', 'guinea-pig', 'guinea', 'cavy', 'cavies'],
  hamsters: ['hamster', 'hamster wheel', 'hamster cage', 'hamster ball', 'syrian hamster', 'dwarf hamster'],
  birds: ['bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 'perch', 'bird cage', 'bird seed', 'bird food', 'aviary'],
  fish_aquatics: ['fish', 'aquarium', 'aquatic', 'betta', 'goldfish', 'tropical fish', 'fish tank', 'fish food', 'filter', 'pump', 'aquascape'],
  reptiles: ['reptile', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko', 'iguana', 'terrarium', 'vivarium', 'heat lamp', 'uvb'],
  cages_habitats: ['cage', 'habitat', 'enclosure', 'terrarium', 'vivarium', 'hutch'],
  bedding_cleaning: ['bedding', 'substrate', 'wood shavings', 'hay', 'straw', 'cleaning'],
  food_treats: ['pellets', 'seeds', 'hay', 'mealworms', 'treats', 'nutrition'],
  toys_enrichment: ['exercise wheel', 'tunnels', 'hideout', 'chew toys', 'enrichment', 'playground']
};

const SMALL_PET_EXCLUSIONS = [
  'dog', 'dogs', 'puppy', 'puppies', 'canine', 'pup', 'pooch',
  'cat', 'cats', 'kitten', 'kittens', 'feline', 'kitty',
  'dog kennel', 'dog crate', 'dog house', 'dog carrier',
  'cat tree', 'cat tower', 'cat condo', 'litter box', 'scratching post',
  'dog leash', 'dog harness', 'dog collar', 'cat harness', 'cat collar',
  'dog bed', 'cat bed', 'dog toy', 'cat toy',
  'for dogs', 'for cats', 'for puppies', 'for kittens'
];

const SMALL_PET_ALLOW_TERMS = [
  'rabbit', 'bunny', 'bunnies', 'hamster', 'guinea pig', 'bird', 'parrot', 'fish', 'aquarium', 'reptile', 'turtle',
  'small animal', 'rodent', 'ferret', 'chinchilla', 'gerbil', 'hedgehog', 'cage', 'habitat', 'hutch'
];

const NON_PET_BLOCKLIST = [
  'sticker', 'tattoo', 'poster', 'wall art', 'phone case', 'laptop',
  'human clothing', 't-shirt', 'tshirt', 'shirt', 'dress', 'pants',
  'jewelry', 'watch', 'necklace', 'bracelet', 'ring', 'earring',
  'electronics', 'computer', 'phone', 'tablet', 'camera', 'speaker',
  'furniture', 'human bedding', 'curtain', 'rug', 'carpet', 'couch',
  'kitchen', 'cooking', 'bathroom', 'office', 'school', 'makeup',
  'car parts', 'tools', 'weapons', 'adult', 'sexy', 'lingerie',
  'gaming chair', 'racing chair', 'reclining chair', 'pu leather computer',
  'rocking horse', 'kids desk', 'kids chair', 'bookcase', 'for ages',
  'silicone soft case', 'halloween costume', 'christmas costume',
  'nightclub', 'baby girl', 'girlfriends bracelet', 'cute uniform', 'bunny uniform', 'one-piece bunny',
  'zodiac', 'birth year', 'hetian jade', 'full diamond',
  'faux rex rabbit fur coat', 'rabbit fur coat',
  'rabbit wool socks', 'rabbit-fur chunky', 'rabbit fur socks',
  'retro rabbit wool'
];

const HUMAN_CLOTHING_KEYWORDS = [
  'womens', 'womans', 'mens', 'mans', 'for women', 'for men',
  'wool socks', 'thermal socks', 'chunky knit', 'winter socks',
  'fur coat', 'suit baby', 'costume cute', 'bunny suit',
  'bunny costume', 'rabbit ears',
  'rabbit wool', 'rabbit fur', 'rabbit-fur'
];

function normalizeText(text) {
  if (!text) return '';
  return String(text).toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesWord(text, word) {
  if (!text || !word) return false;
  const normalized = normalizeText(text);
  const wordNorm = normalizeText(word);
  if (wordNorm.includes(' ') || wordNorm.includes('-')) {
    return normalized.includes(wordNorm);
  }
  const regex = new RegExp(`\\b${wordNorm}\\b`, 'i');
  return regex.test(normalized);
}

function countMatches(text, keywords) {
  return keywords.filter(kw => matchesWord(text, kw)).length;
}

function getProductText(product) {
  if (!product) return '';
  const fields = [
    product.title,
    product.name,
    product.description,
    product.category,
    product.categorySlug,
    ...(product.tags || [])
  ];
  return normalizeText(fields.filter(Boolean).join(' '));
}

function classifyWithConfidence(product) {
  const result = {
    primaryCategory: 'unknown',
    subcategory: null,
    smallPetType: null,
    confidence: 0,
    reasons: [],
    isBlocked: false,
    isPetProduct: false,
    dogScore: 0,
    catScore: 0,
    smallPetScore: 0,
    matchedKeywords: []
  };

  if (!product) {
    result.reasons.push('No product provided');
    return result;
  }

  const text = getProductText(product);
  const title = normalizeText(product.title || product.name || '');

  for (const blocked of NON_PET_BLOCKLIST) {
    if (matchesWord(text, blocked)) {
      result.isBlocked = true;
      result.reasons.push(`BLOCKED: ${blocked}`);
      return result;
    }
  }

  const dogScore = countMatches(text, DOG_ONLY_KEYWORDS);
  const catScore = countMatches(text, CAT_ONLY_KEYWORDS);
  
  let smallPetScore = 0;
  let smallPetType = null;
  let smallPetMatches = [];
  
  for (const [type, keywords] of Object.entries(SMALL_PET_KEYWORDS)) {
    const matches = keywords.filter(kw => matchesWord(text, kw));
    if (matches.length > 0) {
      smallPetScore += matches.length;
      smallPetMatches.push(...matches);
      if (!smallPetType || matches.length > (SMALL_PET_KEYWORDS[smallPetType] || []).filter(kw => matchesWord(text, kw)).length) {
        smallPetType = type;
      }
    }
  }

  result.dogScore = dogScore;
  result.catScore = catScore;
  result.smallPetScore = smallPetScore;

  const hasSmallPetExclusion = SMALL_PET_EXCLUSIONS.some(ex => matchesWord(title, ex));

  if (smallPetScore > 0 && !hasSmallPetExclusion) {
    if (dogScore === 0 && catScore === 0) {
      result.primaryCategory = 'small-pets';
      result.smallPetType = smallPetType;
      result.confidence = Math.min(100, smallPetScore * 20);
      result.reasons.push(`Pure small pet: ${smallPetType} (score: ${smallPetScore})`);
      result.matchedKeywords = smallPetMatches.slice(0, 5);
    } else if (smallPetScore > (dogScore + catScore) * 2) {
      result.primaryCategory = 'small-pets';
      result.smallPetType = smallPetType;
      result.confidence = Math.min(80, smallPetScore * 15);
      result.reasons.push(`Small pet dominant: ${smallPetType} (sp:${smallPetScore} > dog:${dogScore}+cat:${catScore})`);
    }
  }

  if (result.primaryCategory === 'unknown') {
    if (dogScore > 0 && catScore === 0) {
      result.primaryCategory = 'dogs';
      result.confidence = Math.min(100, dogScore * 25);
      result.reasons.push(`Dog product (score: ${dogScore})`);
    } else if (catScore > 0 && dogScore === 0) {
      result.primaryCategory = 'cats';
      result.confidence = Math.min(100, catScore * 25);
      result.reasons.push(`Cat product (score: ${catScore})`);
    } else if (dogScore > 0 && catScore > 0) {
      result.primaryCategory = dogScore >= catScore ? 'dogs' : 'cats';
      result.confidence = Math.min(70, Math.max(dogScore, catScore) * 15);
      result.reasons.push(`Mixed dog/cat, primary: ${result.primaryCategory} (dog:${dogScore}, cat:${catScore})`);
    }
  }

  const existingPetType = normalizeText(product.pet_type || product.petType || '');
  if (result.primaryCategory === 'unknown' && existingPetType) {
    if (['dog', 'dogs'].includes(existingPetType)) {
      result.primaryCategory = 'dogs';
      result.confidence = 60;
      result.reasons.push('Fallback: existing pet_type=dog');
    } else if (['cat', 'cats'].includes(existingPetType)) {
      result.primaryCategory = 'cats';
      result.confidence = 60;
      result.reasons.push('Fallback: existing pet_type=cat');
    } else if (['small_pet', 'small-pet', 'small'].includes(existingPetType) && !hasSmallPetExclusion) {
      result.primaryCategory = 'small-pets';
      result.confidence = 50;
      result.reasons.push('Fallback: existing pet_type=small_pet');
    }
  }

  if (result.primaryCategory === 'unknown') {
    const mainCat = normalizeText(product.mainCategorySlug || '');
    if (mainCat.includes('dog')) {
      result.primaryCategory = 'dogs';
      result.confidence = 40;
      result.reasons.push('Fallback: mainCategorySlug contains dog');
    } else if (mainCat.includes('cat')) {
      result.primaryCategory = 'cats';
      result.confidence = 40;
      result.reasons.push('Fallback: mainCategorySlug contains cat');
    } else if ((mainCat.includes('small') || mainCat.includes('bird') || mainCat.includes('fish')) && !hasSmallPetExclusion) {
      result.primaryCategory = 'small-pets';
      result.confidence = 30;
      result.reasons.push('Fallback: mainCategorySlug contains small-pet indicator');
    }
  }

  result.isPetProduct = result.primaryCategory !== 'unknown' && !result.isBlocked;

  return result;
}

function isStrictSmallPet(product) {
  const classification = classifyWithConfidence(product);
  
  if (classification.isBlocked) return false;
  if (classification.primaryCategory !== 'small-pets') return false;
  
  const title = normalizeText(product.title || product.name || '');
  for (const ex of SMALL_PET_EXCLUSIONS) {
    if (matchesWord(title, ex)) {
      return false;
    }
  }
  
  for (const kw of HUMAN_CLOTHING_KEYWORDS) {
    if (matchesWord(title, kw)) {
      return false;
    }
  }
  
  return true;
}

function getSmallPetSubcategory(product) {
  const text = getProductText(product);
  const title = normalizeText(product.title || product.name || '');
  
  const HABITAT_PRIORITY_KEYWORDS = ['hutch', 'cage', 'enclosure', 'habitat', 'playpen', 'run', 'house', 'wooden'];
  const isHabitatProduct = HABITAT_PRIORITY_KEYWORDS.filter(kw => matchesWord(title, kw)).length >= 2;
  
  if (isHabitatProduct) {
    return 'cages_habitats';
  }
  
  const ANIMAL_PRIORITY = ['guinea_pigs', 'hamsters', 'birds', 'fish_aquatics', 'reptiles', 'rabbits'];
  
  for (const type of ANIMAL_PRIORITY) {
    const keywords = SMALL_PET_KEYWORDS[type];
    if (keywords && keywords.some(kw => matchesWord(title, kw))) {
      if (type === 'rabbits') {
        const rabbitAnimalKeywords = ['rabbit food', 'rabbit toy', 'rabbit treats', 'bunny toy', 'bunny treats'];
        if (rabbitAnimalKeywords.some(kw => matchesWord(text, kw))) {
          return 'rabbits';
        }
        continue;
      }
      return type;
    }
  }
  
  const ACCESSORY_TYPES = ['bedding_cleaning', 'food_treats', 'toys_enrichment'];
  for (const type of ACCESSORY_TYPES) {
    const keywords = SMALL_PET_KEYWORDS[type];
    if (keywords && keywords.some(kw => matchesWord(title, kw))) {
      return type;
    }
  }
  
  return 'cages_habitats';
}

function reclassifyProduct(product) {
  const classification = classifyWithConfidence(product);
  
  const updated = {
    ...product,
    classifiedCategory: classification.primaryCategory,
    classificationConfidence: classification.confidence,
    classificationReasons: classification.reasons,
    isPetProduct: classification.isPetProduct,
    isBlocked: classification.isBlocked
  };
  
  if (classification.primaryCategory === 'dogs') {
    updated.pet_type = 'dog';
    updated.petType = 'dog';
    updated.mainCategorySlug = 'dogs';
    updated.category_slug = 'dogs'; // Ensure consistency
  } else if (classification.primaryCategory === 'cats') {
    updated.pet_type = 'cat';
    updated.petType = 'cat';
    updated.mainCategorySlug = 'cats';
    updated.category_slug = 'cats'; // Ensure consistency
  } else if (classification.primaryCategory === 'small-pets') {
    updated.pet_type = 'small_pet';
    updated.petType = 'small_pet';
    updated.mainCategorySlug = 'small-pets';
    updated.category_slug = 'small-pets'; // Ensure consistency
    updated.smallPetSubcategory = getSmallPetSubcategory(product);
  }
  
  return updated;
}

function getClassificationStats(products) {
  const stats = {
    total: products.length,
    dogs: 0,
    cats: 0,
    smallPets: 0,
    unknown: 0,
    blocked: 0,
    smallPetContamination: 0,
    bySmallPetSubcat: {}
  };
  
  for (const p of products) {
    const classification = classifyWithConfidence(p);
    
    if (classification.isBlocked) {
      stats.blocked++;
    } else if (classification.primaryCategory === 'dogs') {
      stats.dogs++;
    } else if (classification.primaryCategory === 'cats') {
      stats.cats++;
    } else if (classification.primaryCategory === 'small-pets') {
      stats.smallPets++;
      const subcat = getSmallPetSubcategory(p);
      stats.bySmallPetSubcat[subcat] = (stats.bySmallPetSubcat[subcat] || 0) + 1;
    } else {
      stats.unknown++;
    }
    
    if (p.mainCategorySlug === 'small-pets' || p.pet_type === 'small_pet') {
      const title = normalizeText(p.title || p.name || '');
      if (SMALL_PET_EXCLUSIONS.slice(0, 14).some(ex => matchesWord(title, ex))) {
        stats.smallPetContamination++;
      }
    }
  }
  
  return stats;
}

module.exports = {
  classifyWithConfidence,
  isStrictSmallPet,
  getSmallPetSubcategory,
  reclassifyProduct,
  getClassificationStats,
  normalizeText,
  DOG_ONLY_KEYWORDS,
  CAT_ONLY_KEYWORDS,
  SMALL_PET_KEYWORDS,
  SMALL_PET_EXCLUSIONS,
  NON_PET_BLOCKLIST
};
