/**
 * Pet Relevance Classification Module
 * Central logic for detecting non-pet products and auto-rejecting them
 */

// Hard-block keywords - products with these are NEVER pet-related
const HARD_BLOCK_KEYWORDS = [
  // Electronics (non-pet)
  'smartphone', 'laptop', 'tablet', 'computer', 'phone case', 'iphone', 'android',
  'headphones', 'earbuds', 'airpods', 'bluetooth speaker', 'gaming', 'console',
  'keyboard', 'mouse pad', 'usb', 'charger', 'power bank', 'camera', 'drone',
  
  // Clothing (human)
  't-shirt', 'tshirt', 'hoodie', 'sweatshirt', 'jeans', 'pants', 'shorts',
  'dress', 'skirt', 'blouse', 'jacket', 'coat', 'suit', 'underwear', 'bra',
  'socks', 'shoes', 'sneakers', 'boots', 'sandals', 'heels', 'flip flops',
  'hat', 'cap', 'beanie', 'scarf', 'gloves', 'belt', 'tie', 'watch',
  
  // Jewelry & Accessories (human)
  'necklace', 'bracelet', 'earring', 'ring', 'pendant', 'anklet',
  'handbag', 'purse', 'wallet', 'backpack', 'luggage', 'suitcase',
  'sunglasses', 'glasses', 'reading glasses',
  
  // Home & Kitchen (non-pet)
  'curtain', 'tablecloth', 'bedsheet', 'pillow case', 'duvet', 'mattress',
  'cookware', 'pot', 'pan', 'knife set', 'cutting board', 'blender',
  'coffee maker', 'toaster', 'microwave', 'refrigerator', 'dishwasher',
  'vacuum cleaner', 'mop', 'broom', 'iron', 'sewing machine',
  
  // Beauty & Personal Care (human)
  'makeup', 'lipstick', 'mascara', 'foundation', 'eyeshadow', 'nail polish',
  'perfume', 'cologne', 'shampoo', 'conditioner', 'hair dryer', 'straightener',
  'razor', 'shaving cream', 'deodorant', 'lotion', 'face cream', 'serum',
  
  // Baby & Kids (human)
  'baby bottle', 'pacifier', 'diaper', 'stroller', 'car seat', 'crib',
  'baby clothes', 'onesie', 'toddler', 'infant',
  
  // Sports (human-only)
  'golf club', 'tennis racket', 'basketball', 'football', 'soccer ball',
  'baseball bat', 'hockey stick', 'ski', 'snowboard', 'surfboard',
  'gym equipment', 'dumbbell', 'treadmill', 'yoga mat',
  
  // Office & School
  'stapler', 'paper clip', 'binder', 'notebook', 'textbook', 'pen',
  'pencil', 'marker', 'highlighter', 'calculator', 'printer', 'scanner',
  
  // Automotive
  'car part', 'tire', 'car seat cover', 'steering wheel', 'dashboard',
  'motorcycle', 'helmet', 'car charger', 'gps navigator',
  
  // Adult/Inappropriate
  'adult toy', 'lingerie', 'sexy', 'erotic', 'intimate'
];

// Pet-positive keywords - strong indicators of pet relevance
const PET_POSITIVE_KEYWORDS = [
  // Animal types
  'dog', 'puppy', 'pup', 'canine', 'doggy', 'doggie',
  'cat', 'kitten', 'kitty', 'feline', 'kittycat',
  'pet', 'pets', 'animal', 'fur baby', 'furbaby',
  'bird', 'parrot', 'parakeet', 'cockatiel', 'finch',
  'fish', 'aquarium', 'goldfish', 'betta', 'tropical fish',
  'hamster', 'guinea pig', 'rabbit', 'bunny', 'ferret', 'gerbil',
  'reptile', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko',
  
  // Pet products
  'collar', 'leash', 'harness', 'muzzle', 'pet tag',
  'pet bed', 'dog bed', 'cat bed', 'crate', 'kennel', 'carrier',
  'pet food', 'dog food', 'cat food', 'kibble', 'treats', 'chew',
  'pet bowl', 'food bowl', 'water bowl', 'pet feeder', 'fountain',
  'litter', 'litter box', 'cat litter', 'poop bag', 'waste bag',
  'pet toy', 'dog toy', 'cat toy', 'squeaky', 'fetch', 'tug',
  'catnip', 'scratching post', 'scratch pad', 'cat tree', 'cat tower',
  'grooming', 'pet brush', 'deshedding', 'nail clipper', 'pet shampoo',
  'flea', 'tick', 'dewormer', 'pet medicine', 'pet supplement',
  'pet clothes', 'dog sweater', 'dog jacket', 'pet costume',
  'pet stroller', 'pet carrier', 'travel crate',
  'training pad', 'potty pad', 'pee pad', 'training treat',
  'aquarium filter', 'fish tank', 'aquarium pump', 'fish food',
  'bird cage', 'bird feeder', 'bird seed', 'perch'
];

// Ambiguous keywords that need context
const AMBIGUOUS_KEYWORDS = [
  'ball', 'rope', 'mat', 'blanket', 'bowl', 'brush', 'comb',
  'bed', 'house', 'door', 'gate', 'fence', 'cage',
  'food', 'water', 'treat', 'toy', 'plush', 'stuffed'
];

/**
 * Classify a product's pet relevance
 * @param {Object} product - Product object with title, description, category
 * @returns {Object} { isPet: boolean, confidence: 'high'|'medium'|'low', reasons: string[], blocked: boolean }
 */
function classifyPetRelevance(product) {
  const title = (product.title || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const category = (product.category || '').toLowerCase();
  const combined = `${title} ${description} ${category}`;
  
  const reasons = [];
  let score = 0;
  let blocked = false;
  
  // Check for hard blocks first (instant rejection)
  for (const keyword of HARD_BLOCK_KEYWORDS) {
    if (combined.includes(keyword)) {
      reasons.push(`Hard-blocked keyword: "${keyword}"`);
      blocked = true;
      break;
    }
  }
  
  if (blocked) {
    return {
      isPet: false,
      confidence: 'high',
      reasons,
      blocked: true,
      score: -100
    };
  }
  
  // Check for pet-positive keywords
  let petPositiveCount = 0;
  for (const keyword of PET_POSITIVE_KEYWORDS) {
    if (combined.includes(keyword)) {
      petPositiveCount++;
      score += 20;
      if (petPositiveCount <= 3) {
        reasons.push(`Pet keyword: "${keyword}"`);
      }
    }
  }
  
  // Check title specifically (title matches are stronger)
  for (const keyword of PET_POSITIVE_KEYWORDS) {
    if (title.includes(keyword)) {
      score += 10; // Extra points for title match
    }
  }
  
  // Category check
  const petCategories = ['dog', 'cat', 'pet', 'bird', 'fish', 'small-animal', 'reptile'];
  if (petCategories.some(cat => category.includes(cat))) {
    score += 30;
    reasons.push(`Pet category: "${category}"`);
  }
  
  // Check for ambiguous keywords (only add points if there's already pet context)
  if (score > 0) {
    for (const keyword of AMBIGUOUS_KEYWORDS) {
      if (combined.includes(keyword)) {
        score += 5;
      }
    }
  }
  
  // Determine confidence and isPet status
  let isPet = false;
  let confidence = 'low';
  
  if (score >= 50) {
    isPet = true;
    confidence = 'high';
  } else if (score >= 20) {
    isPet = true;
    confidence = 'medium';
  } else if (score >= 10) {
    isPet = true;
    confidence = 'low';
  } else {
    isPet = false;
    confidence = score > 0 ? 'low' : 'high';
    if (score === 0) {
      reasons.push('No pet-related keywords found');
    }
  }
  
  return {
    isPet,
    confidence,
    reasons: reasons.slice(0, 5), // Max 5 reasons
    blocked: false,
    score
  };
}

/**
 * Quick check if a product should be rejected
 * @param {Object} product 
 * @returns {boolean}
 */
function shouldReject(product) {
  const result = classifyPetRelevance(product);
  return !result.isPet || result.blocked;
}

/**
 * Get rejection reasons for a product
 * @param {Object} product 
 * @returns {string[]}
 */
function getRejectReasons(product) {
  const result = classifyPetRelevance(product);
  if (result.isPet && !result.blocked) {
    return [];
  }
  return result.reasons.length > 0 ? result.reasons : ['Not classified as pet-related'];
}

/**
 * Batch classify products
 * @param {Array} products 
 * @returns {Object} { petProducts: [], nonPetProducts: [], stats: {} }
 */
function batchClassify(products) {
  const petProducts = [];
  const nonPetProducts = [];
  const stats = {
    total: products.length,
    pet: 0,
    nonPet: 0,
    blocked: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0
  };
  
  for (const product of products) {
    const result = classifyPetRelevance(product);
    
    if (result.isPet && !result.blocked) {
      petProducts.push({ ...product, _classification: result });
      stats.pet++;
    } else {
      nonPetProducts.push({ 
        ...product, 
        _classification: result,
        rejectReasons: result.reasons
      });
      stats.nonPet++;
      if (result.blocked) stats.blocked++;
    }
    
    if (result.confidence === 'high') stats.highConfidence++;
    else if (result.confidence === 'medium') stats.mediumConfidence++;
    else stats.lowConfidence++;
  }
  
  return { petProducts, nonPetProducts, stats };
}

module.exports = {
  classifyPetRelevance,
  shouldReject,
  getRejectReasons,
  batchClassify,
  HARD_BLOCK_KEYWORDS,
  PET_POSITIVE_KEYWORDS,
  AMBIGUOUS_KEYWORDS
};
