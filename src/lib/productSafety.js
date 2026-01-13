/**
 * PRODUCT SAFETY MODULE V1.0
 * Single Source of Truth for Content Safety
 * 
 * Implements:
 * - NSFW-SHIELD: Hard block for adult/explicit content
 * - PET CLASSIFIER: Two-layer classification (heuristics + optional AI)
 * - WHITELIST CAROUSELS: Strict whitelist-based selection
 */

const fs = require('fs');
const path = require('path');

const REJECTION_LOG_PATH = path.join(__dirname, '../../data/rejected-products.json');
const WHITELIST_PATH = path.join(__dirname, '../../data/homepage-whitelists.json');
const SAFETY_SCAN_PATH = path.join(__dirname, '../../data/safety-scan-report.json');

const BLOCKLIST_KEYWORDS = [
  'sexual', 'erotic', 'dildo', 'vibrator', 'masturbator', 'masturbat',
  'anal plug', 'butt plug', 'bdsm', 'fetish', 'bondage', 'dominatrix',
  'porn', 'nude', 'adult only', 'xxx', 'condom', 'lubricant', 'sex-toy', 'sex toy',
  'cock ring', 'penis', 'vagina', 'pussy', 'escort', 'stripper',
  'open crotch', 'crotchless', 'nipple', 'g-spot', 'orgasm',
  'sexy lingerie', 'erotic lingerie', 'adult lingerie',
  'pleasure device', 'love toy', 'intimate toy', 'sexy', 'sex toys'
];

function matchesWordBoundary(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(text);
}

const HUMAN_FASHION_BLOCKLIST = [
  'women\'s lingerie', 'men\'s underwear', 'ladies underwear', 'thong panties',
  'bra set', 'bikini set', 'swimsuit', 'bathing suit',
  'women\'s dress', 'men\'s shirt', 'women\'s blouse', 'ladies top',
  'high heels', 'stilettos', 'evening gown', 'cocktail dress',
  'human clothing', 'women\'s clothing', 'men\'s clothing'
];

const HUMAN_PRODUCT_TERMS = [
  'for women', 'for men', 'for him', 'for her', 'for couples',
  'gifts for women', 'gifts for men', 'gift for women', 'gift for men',
  'human use', 'personal use', 'body massager', 'back massager',
  'neck massager', 'foot massager', 'massage gun', 'massage chair'
];

const GIFT_MERCHANDISE_TERMS = [
  'dog mom', 'cat mom', 'dog dad', 'cat dad', 'dog lover', 'cat lover',
  'pet parent gift', 'dog owner gift', 'cat owner gift', 'pet lover'
];

const PET_PRODUCT_INDICATORS = [
  'dog toy', 'cat toy', 'pet toy', 'chew toy', 'squeaky toy', 'plush toy',
  'dog bed', 'cat bed', 'pet bed', 'dog bowl', 'cat bowl', 'pet bowl',
  'dog collar', 'cat collar', 'leash', 'harness', 'pet carrier',
  'dog food', 'cat food', 'pet food', 'dog treat', 'cat treat',
  'scratching', 'litter', 'grooming', 'pet shampoo', 'flea', 'tick',
  'dog clothes', 'cat clothes', 'pet sweater', 'dog jacket',
  'training', 'crate', 'kennel', 'pet stroller', 'dog ramp',
  'for dogs', 'for cats', 'for pets', 'for puppies', 'for kittens'
];

const NON_PET_CATEGORY_BLOCKS = [
  'adult', 'sex', 'erotic', 'lingerie', 'underwear', 'intimate',
  'pleasure', 'jewelry', 'cosmetics', 'makeup', 'skincare',
  'home decor', 'kitchen', 'office supplies', 'electronics',
  'baby', 'kids clothing', 'women fashion', 'men fashion'
];

const PET_KEYWORDS_POSITIVE = [
  'dog', 'puppy', 'canine', 'pup', 'pooch', 'hound',
  'cat', 'kitten', 'feline', 'kitty',
  'pet', 'leash', 'collar', 'harness', 'muzzle',
  'dog bed', 'cat bed', 'pet bed', 'crate', 'kennel', 'carrier',
  'dog food', 'cat food', 'pet food', 'treat', 'chew',
  'litter', 'litter box', 'scratching', 'scratch post',
  'grooming', 'pet shampoo', 'flea', 'tick',
  'dog toy', 'cat toy', 'pet toy', 'fetch', 'squeaky',
  'dog bowl', 'cat bowl', 'pet bowl', 'feeder', 'water fountain',
  'dog clothes', 'cat clothes', 'pet clothes', 'dog sweater',
  'pet stroller', 'dog ramp', 'pet gate', 'dog gate',
  'training pad', 'poop bag', 'pet waste'
];

const SPECIES_DOG_KEYWORDS = ['dog', 'puppy', 'canine', 'pup', 'pooch', 'hound'];
const SPECIES_CAT_KEYWORDS = ['cat', 'kitten', 'feline', 'kitty'];

function normalizeText(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim();
}

function getAllProductText(product) {
  const fields = [
    product.title,
    product.name,
    product.description,
    product.category,
    product.categorySlug,
    product.mainCategorySlug,
    product.subcategorySlug,
    product.collectionName,
    product.vendor,
    product.source,
    ...(product.tags || []),
    ...(product.options || []).map(o => `${o.name} ${o.values?.join(' ')}`),
    JSON.stringify(product.attributes || {})
  ];
  return normalizeText(fields.filter(Boolean).join(' '));
}

function hasPetProductIndicators(text) {
  return PET_PRODUCT_INDICATORS.some(indicator => text.includes(normalizeText(indicator)));
}

function isBlockedProduct(product) {
  if (!product) return { blocked: true, reasons: ['No product provided'] };
  
  const allText = getAllProductText(product);
  const reasons = [];
  
  const isPetProduct = product.is_pet_product === true || 
                       product.petApproved === true ||
                       hasPetProductIndicators(allText);
  
  for (const keyword of BLOCKLIST_KEYWORDS) {
    if (matchesWordBoundary(allText, keyword)) {
      reasons.push(`NSFW_BLOCKED: "${keyword}"`);
    }
  }
  
  if (!isPetProduct) {
    for (const term of HUMAN_FASHION_BLOCKLIST) {
      if (allText.includes(normalizeText(term))) {
        reasons.push(`HUMAN_FASHION: "${term}"`);
      }
    }
    
    for (const term of HUMAN_PRODUCT_TERMS) {
      if (allText.includes(normalizeText(term))) {
        reasons.push(`HUMAN_PRODUCT: "${term}"`);
      }
    }
    
    for (const term of GIFT_MERCHANDISE_TERMS) {
      if (allText.includes(normalizeText(term))) {
        reasons.push(`HUMAN_GIFT: "${term}"`);
      }
    }
  }
  
  const category = normalizeText(product.category || product.categorySlug || '');
  for (const cat of NON_PET_CATEGORY_BLOCKS) {
    if (matchesWordBoundary(category, cat) && !allText.includes('pet') && !allText.includes('dog') && !allText.includes('cat')) {
      reasons.push(`BLOCKED_CATEGORY: "${cat}"`);
    }
  }
  
  return {
    blocked: reasons.length > 0,
    reasons: reasons
  };
}

function classifyPetRelevance(product) {
  if (!product) {
    return { petApproved: false, species: 'unknown', confidence: 0, reasons: ['No product'], source: 'heuristic' };
  }
  
  const allText = getAllProductText(product);
  const title = normalizeText(product.title || product.name || '');
  const reasons = [];
  
  if (product.petApproved === true) {
    return {
      petApproved: true,
      species: product.species || 'both',
      confidence: 1.0,
      reasons: ['Explicitly marked petApproved=true'],
      source: 'explicit'
    };
  }
  
  if (product.is_pet_product === false) {
    return {
      petApproved: false,
      species: 'unknown',
      confidence: 1.0,
      reasons: ['Explicitly marked is_pet_product=false'],
      source: 'explicit'
    };
  }
  
  const hasDogKeyword = SPECIES_DOG_KEYWORDS.some(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(title);
  });
  
  const hasCatKeyword = SPECIES_CAT_KEYWORDS.some(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(title);
  });
  
  const hasPetKeyword = PET_KEYWORDS_POSITIVE.some(kw => allText.includes(normalizeText(kw)));
  
  let species = 'unknown';
  if (hasDogKeyword && hasCatKeyword) species = 'both';
  else if (hasDogKeyword) species = 'dog';
  else if (hasCatKeyword) species = 'cat';
  else if (hasPetKeyword) species = 'both';
  
  const petType = normalizeText(product.petType || product.pet_type || '');
  if (['dog', 'dogs', 'puppy'].includes(petType)) species = 'dog';
  if (['cat', 'cats', 'kitten'].includes(petType)) species = 'cat';
  if (['both', 'pet', 'pets'].includes(petType)) species = 'both';
  
  const mainCat = normalizeText(product.mainCategorySlug || '');
  if (mainCat.includes('dog')) species = species === 'cat' ? 'both' : 'dog';
  if (mainCat.includes('cat')) species = species === 'dog' ? 'both' : 'cat';
  
  let confidence = 0;
  if (species !== 'unknown') {
    confidence = 0.8;
    reasons.push(`Species detected: ${species}`);
  }
  if (hasPetKeyword) {
    confidence = Math.max(confidence, 0.7);
    reasons.push('Pet keywords found in text');
  }
  if (petType) {
    confidence = 0.9;
    reasons.push(`petType field: ${petType}`);
  }
  if (mainCat && (mainCat.includes('dog') || mainCat.includes('cat'))) {
    confidence = 0.9;
    reasons.push(`mainCategorySlug: ${mainCat}`);
  }
  
  const petApproved = confidence >= 0.6 && species !== 'unknown';
  
  if (!petApproved) {
    reasons.push('No pet-related markers found or low confidence');
  }
  
  return {
    petApproved,
    species,
    confidence,
    reasons,
    source: 'heuristic'
  };
}

function isPetApproved(product) {
  const blockCheck = isBlockedProduct(product);
  if (blockCheck.blocked) {
    return {
      approved: false,
      reasons: blockCheck.reasons,
      species: 'unknown',
      confidence: 0
    };
  }
  
  const classification = classifyPetRelevance(product);
  return {
    approved: classification.petApproved,
    reasons: classification.reasons,
    species: classification.species,
    confidence: classification.confidence
  };
}

function filterApprovedProducts(products, options = {}) {
  const { species = null, minConfidence = 0.6 } = options;
  
  return products.filter(p => {
    const result = isPetApproved(p);
    if (!result.approved) return false;
    if (result.confidence < minConfidence) return false;
    
    if (species === 'dog' && !['dog', 'both'].includes(result.species)) return false;
    if (species === 'cat' && !['cat', 'both'].includes(result.species)) return false;
    
    return true;
  });
}

function addRejectionLog(product, reasons) {
  try {
    let log = [];
    if (fs.existsSync(REJECTION_LOG_PATH)) {
      log = JSON.parse(fs.readFileSync(REJECTION_LOG_PATH, 'utf8'));
    }
    
    log.unshift({
      timestamp: new Date().toISOString(),
      productId: product.id || product.cjProductId || 'unknown',
      title: (product.title || '').slice(0, 100),
      cjId: product.cjProductId || product.cjPid || null,
      reasons: reasons
    });
    
    log = log.slice(0, 500);
    
    fs.writeFileSync(REJECTION_LOG_PATH, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('[ProductSafety] Error writing rejection log:', err.message);
  }
}

function getRecentRejections(limit = 200) {
  try {
    if (fs.existsSync(REJECTION_LOG_PATH)) {
      const log = JSON.parse(fs.readFileSync(REJECTION_LOG_PATH, 'utf8'));
      return log.slice(0, limit);
    }
  } catch (err) {
    console.error('[ProductSafety] Error reading rejection log:', err.message);
  }
  return [];
}

function loadWhitelists() {
  try {
    if (fs.existsSync(WHITELIST_PATH)) {
      return JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[ProductSafety] Error loading whitelists:', err.message);
  }
  return {
    topPicksDogs: [],
    topPicksCats: [],
    bestSellers: [],
    trendingNow: []
  };
}

function saveWhitelists(whitelists) {
  try {
    fs.writeFileSync(WHITELIST_PATH, JSON.stringify(whitelists, null, 2));
    return true;
  } catch (err) {
    console.error('[ProductSafety] Error saving whitelists:', err.message);
    return false;
  }
}

function getWhitelistedProducts(sectionName, allProducts, limit = 12) {
  const whitelists = loadWhitelists();
  const whitelistIds = whitelists[sectionName] || [];
  
  if (whitelistIds.length > 0) {
    const whitelisted = whitelistIds
      .map(id => allProducts.find(p => p.id === id))
      .filter(p => p && isPetApproved(p).approved)
      .slice(0, limit);
    
    return {
      products: whitelisted,
      source: 'whitelist',
      requestedCount: whitelistIds.length,
      returnedCount: whitelisted.length
    };
  }
  
  const approved = filterApprovedProducts(allProducts, {
    species: sectionName.includes('Dogs') ? 'dog' : sectionName.includes('Cats') ? 'cat' : null
  });
  
  const sorted = approved
    .filter(p => p.images && p.images.length > 0)
    .sort((a, b) => (b.featured_score || 0) - (a.featured_score || 0))
    .slice(0, limit);
  
  return {
    products: sorted,
    source: 'approved_pool',
    requestedCount: limit,
    returnedCount: sorted.length
  };
}

function runSafetySweep(products) {
  const report = {
    timestamp: new Date().toISOString(),
    totalScanned: products.length,
    blocked: 0,
    notPetApproved: 0,
    approved: 0,
    blockedSamples: [],
    notPetSamples: []
  };
  
  for (const product of products) {
    const blockCheck = isBlockedProduct(product);
    if (blockCheck.blocked) {
      report.blocked++;
      if (report.blockedSamples.length < 10) {
        report.blockedSamples.push({
          id: product.id,
          title: (product.title || '').slice(0, 50),
          reasons: blockCheck.reasons.slice(0, 3)
        });
      }
      addRejectionLog(product, blockCheck.reasons);
      continue;
    }
    
    const petCheck = classifyPetRelevance(product);
    if (!petCheck.petApproved) {
      report.notPetApproved++;
      if (report.notPetSamples.length < 10) {
        report.notPetSamples.push({
          id: product.id,
          title: (product.title || '').slice(0, 50),
          reasons: petCheck.reasons.slice(0, 3)
        });
      }
      continue;
    }
    
    report.approved++;
  }
  
  try {
    fs.writeFileSync(SAFETY_SCAN_PATH, JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('[ProductSafety] Error saving safety scan report:', err.message);
  }
  
  return report;
}

function getSafetyScanReport() {
  try {
    if (fs.existsSync(SAFETY_SCAN_PATH)) {
      return JSON.parse(fs.readFileSync(SAFETY_SCAN_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[ProductSafety] Error reading safety scan report:', err.message);
  }
  return null;
}

module.exports = {
  normalizeText,
  getAllProductText,
  isBlockedProduct,
  classifyPetRelevance,
  isPetApproved,
  filterApprovedProducts,
  addRejectionLog,
  getRecentRejections,
  loadWhitelists,
  saveWhitelists,
  getWhitelistedProducts,
  runSafetySweep,
  getSafetyScanReport,
  BLOCKLIST_KEYWORDS,
  PET_KEYWORDS_POSITIVE,
  SPECIES_DOG_KEYWORDS,
  SPECIES_CAT_KEYWORDS
};
