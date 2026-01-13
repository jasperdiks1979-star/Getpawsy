/**
 * UNIFIED PRODUCT CLASSIFIER
 * Single interface for product classification used across homepage carousels,
 * category pages, and search results.
 * 
 * Wraps existing src/lib/productSafety.js and src/petClassifier.js
 * Adds Small Pets category support (rabbit, hamster, bird, fish, etc.)
 */

const path = require('path');

const { isBlockedProduct, isPetApproved, classifyPetRelevance, normalizeText } = require('../src/lib/productSafety');
const { classifyPetType } = require('../src/petClassifier');

const SMALL_PET_KEYWORDS = [
  'rabbit', 'bunny', 'hamster', 'guinea pig', 'ferret', 'chinchilla',
  'bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch',
  'reptile', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko', 'iguana',
  'fish', 'aquarium', 'aquatic', 'betta', 'goldfish', 'tropical fish',
  'gerbil', 'mouse', 'mice', 'rat', 'hedgehog', 'sugar glider',
  'cage', 'terrarium', 'vivarium', 'hutch', 'habitat',
  'small animal', 'small pet', 'small pets', 'rodent', 'rodents',
  'bird cage', 'bird feeder', 'bird seed', 'bird food',
  'fish tank', 'fish food', 'fish bowl'
];

const DOG_KEYWORDS = [
  'dog', 'dogs', 'puppy', 'puppies', 'canine', 'pup', 'pooch', 'hound',
  'leash', 'harness', 'collar', 'muzzle', 'kennel', 'crate',
  'chew', 'kong', 'bark', 'anti-bark',
  'dog bed', 'dog bowl', 'dog toy', 'dog treat', 'dog food',
  'dog coat', 'dog jacket', 'dog sweater', 'dog ramp', 'dog gate'
];

const CAT_KEYWORDS = [
  'cat', 'cats', 'kitten', 'kittens', 'feline', 'kitty',
  'litter', 'litter box', 'scoop', 'scratching', 'scratcher', 'scratch post',
  'cat tree', 'sisal', 'meow', 'catnip',
  'cat bed', 'cat bowl', 'cat toy', 'cat treat', 'cat food',
  'feather wand', 'laser pointer', 'cat cave', 'cat perch', 'cat tower'
];

function matchesWord(text, word) {
  if (!text || !word) return false;
  const normalizedText = normalizeText(text);
  const normalizedWord = normalizeText(word);
  
  if (normalizedWord.includes(' ') || normalizedWord.includes('-')) {
    return normalizedText.includes(normalizedWord);
  }
  
  const regex = new RegExp(`\\b${normalizedWord}\\b`, 'i');
  return regex.test(normalizedText);
}

function countKeywordMatches(text, keywords) {
  if (!text) return 0;
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
    product.mainCategorySlug,
    product.subcategorySlug,
    ...(product.tags || [])
  ];
  return normalizeText(fields.filter(Boolean).join(' '));
}

function hasValidImage(product) {
  if (!product) return false;
  
  if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    const firstImg = product.images[0];
    if (firstImg && typeof firstImg === 'string' && firstImg.length > 0 && !firstImg.includes('placeholder')) {
      return true;
    }
  }
  
  if (product.image && typeof product.image === 'string' && product.image.length > 0 && !product.image.includes('placeholder')) {
    return true;
  }
  
  return false;
}

function classifyProduct(product) {
  const result = {
    primaryPet: 'unknown',
    petTypes: [],
    isPetProduct: false,
    isBlocked: false,
    hasImage: false,
    reasons: []
  };
  
  if (!product) {
    result.reasons.push('No product provided');
    return result;
  }
  
  const blockCheck = isBlockedProduct(product);
  if (blockCheck.blocked) {
    result.isBlocked = true;
    result.reasons = blockCheck.reasons.map(r => r.includes('adult') ? 'adult_content' : r);
    return result;
  }
  
  result.hasImage = hasValidImage(product);
  
  const productText = getProductText(product);
  const title = normalizeText(product.title || product.name || '');
  
  const dogMatches = countKeywordMatches(productText, DOG_KEYWORDS);
  const catMatches = countKeywordMatches(productText, CAT_KEYWORDS);
  const smallPetMatches = countKeywordMatches(productText, SMALL_PET_KEYWORDS);
  
  if (dogMatches > 0) result.petTypes.push('dog');
  if (catMatches > 0) result.petTypes.push('cat');
  if (smallPetMatches > 0) result.petTypes.push('small-pet');
  
  const existingPetType = normalizeText(product.petType || product.pet_type || '');
  if (['dog', 'dogs', 'puppy'].includes(existingPetType)) {
    if (!result.petTypes.includes('dog')) result.petTypes.push('dog');
  }
  if (['cat', 'cats', 'kitten'].includes(existingPetType)) {
    if (!result.petTypes.includes('cat')) result.petTypes.push('cat');
  }
  if (['small', 'small_pet', 'small-pet'].includes(existingPetType)) {
    if (!result.petTypes.includes('small-pet')) result.petTypes.push('small-pet');
  }
  
  const mainCat = normalizeText(product.mainCategorySlug || '');
  if (mainCat.includes('dog')) {
    if (!result.petTypes.includes('dog')) result.petTypes.push('dog');
  }
  if (mainCat.includes('cat')) {
    if (!result.petTypes.includes('cat')) result.petTypes.push('cat');
  }
  if (mainCat.includes('small') || mainCat.includes('bird') || mainCat.includes('fish')) {
    if (!result.petTypes.includes('small-pet')) result.petTypes.push('small-pet');
  }
  
  if (result.petTypes.length === 0) {
    result.primaryPet = 'unknown';
    result.reasons.push('No pet keywords found');
  } else if (result.petTypes.length === 1) {
    result.primaryPet = result.petTypes[0];
    result.reasons.push(`Single pet type detected: ${result.primaryPet}`);
  } else if (result.petTypes.includes('small-pet') && result.petTypes.length === 1) {
    result.primaryPet = 'small-pet';
    result.reasons.push('Small pet product');
  } else if (result.petTypes.includes('dog') && result.petTypes.includes('cat')) {
    result.primaryPet = dogMatches >= catMatches ? 'dog' : 'cat';
    result.reasons.push(`Both dog/cat detected, primary: ${result.primaryPet} (dog:${dogMatches}, cat:${catMatches})`);
  } else if (result.petTypes.includes('dog')) {
    result.primaryPet = 'dog';
    result.reasons.push('Dog product');
  } else if (result.petTypes.includes('cat')) {
    result.primaryPet = 'cat';
    result.reasons.push('Cat product');
  } else {
    result.primaryPet = 'small-pet';
    result.reasons.push('Small pet product');
  }
  
  result.isPetProduct = result.primaryPet !== 'unknown';
  
  if (!result.isPetProduct) {
    const petApproval = isPetApproved(product);
    if (petApproval.approved) {
      result.isPetProduct = true;
      result.primaryPet = petApproval.species === 'dog' ? 'dog' : 
                          petApproval.species === 'cat' ? 'cat' : 
                          petApproval.species === 'both' ? 'dog' : 'unknown';
      result.reasons.push(`Fallback approval: ${petApproval.species}`);
    }
  }
  
  return result;
}

function shouldBlockProduct(product) {
  const classification = classifyProduct(product);
  return classification.isBlocked;
}

function isValidCarouselProduct(product) {
  const classification = classifyProduct(product);
  return classification.isPetProduct && classification.hasImage && !classification.isBlocked;
}

function getProductsByPetType(products, petType) {
  if (!Array.isArray(products)) return [];
  
  return products.filter(product => {
    const classification = classifyProduct(product);
    if (!classification.isPetProduct || classification.isBlocked || !classification.hasImage) {
      return false;
    }
    
    if (petType === 'dog') {
      return classification.primaryPet === 'dog' || classification.petTypes.includes('dog');
    }
    if (petType === 'cat') {
      return classification.primaryPet === 'cat' || classification.petTypes.includes('cat');
    }
    if (petType === 'small-pet' || petType === 'small') {
      return classification.primaryPet === 'small-pet' || classification.petTypes.includes('small-pet');
    }
    
    return true;
  });
}

function getCarouselProducts(products, options = {}) {
  const { petType = null, limit = 12, sortBy = 'score' } = options;
  
  let filtered = products.filter(isValidCarouselProduct);
  
  if (petType) {
    filtered = getProductsByPetType(filtered, petType);
  }
  
  if (sortBy === 'score') {
    filtered.sort((a, b) => {
      const scoreA = a.featured_score || a.popularity_score || 0;
      const scoreB = b.featured_score || b.popularity_score || 0;
      return scoreB - scoreA;
    });
  } else if (sortBy === 'price') {
    filtered.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));
  }
  
  return filtered.slice(0, limit);
}

function getClassifierSample(products, limit = 50) {
  if (!Array.isArray(products)) return [];
  
  return products.slice(0, limit).map(product => {
    const classification = classifyProduct(product);
    return {
      id: product.id,
      title: (product.title || product.name || '').slice(0, 80),
      primaryPet: classification.primaryPet,
      petTypes: classification.petTypes,
      isPetProduct: classification.isPetProduct,
      isBlocked: classification.isBlocked,
      hasImage: classification.hasImage,
      reasons: classification.reasons.slice(0, 3)
    };
  });
}

function getCarouselDebugInfo(products) {
  const allValid = products.filter(isValidCarouselProduct);
  const dogs = getProductsByPetType(products, 'dog');
  const cats = getProductsByPetType(products, 'cat');
  const smallPets = getProductsByPetType(products, 'small-pet');
  const blocked = products.filter(p => classifyProduct(p).isBlocked);
  const noImage = products.filter(p => !classifyProduct(p).hasImage);
  const notPet = products.filter(p => !classifyProduct(p).isPetProduct && !classifyProduct(p).isBlocked);
  
  return {
    totalProducts: products.length,
    validForCarousel: allValid.length,
    byPetType: {
      dogs: dogs.length,
      cats: cats.length,
      smallPets: smallPets.length
    },
    skipped: {
      blocked: blocked.length,
      noImage: noImage.length,
      notPetProduct: notPet.length
    },
    sampleIds: {
      dogs: dogs.slice(0, 5).map(p => p.id),
      cats: cats.slice(0, 5).map(p => p.id),
      smallPets: smallPets.slice(0, 5).map(p => p.id)
    }
  };
}

module.exports = {
  classifyProduct,
  shouldBlockProduct,
  isValidCarouselProduct,
  getProductsByPetType,
  getCarouselProducts,
  getClassifierSample,
  getCarouselDebugInfo,
  hasValidImage,
  SMALL_PET_KEYWORDS,
  DOG_KEYWORDS,
  CAT_KEYWORDS
};
