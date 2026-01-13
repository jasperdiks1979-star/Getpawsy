const fs = require('fs');
const path = require('path');
const productSafety = require('./productSafety');

/**
 * CENTRALIZED HARD PRODUCT FILTER (HARD FAIL)
 * Targets: Adult, Tattoos, Stickers, Human Lifestyle, No-Image, Price <= 0
 */

const HARD_BLOCK_KEYWORDS = [
  'tattoo', 'sticker', 'erotic', 'anal', 'plug', 'adult', 'bdsm', 'vibrator', 'sex', 'fetish'
];

const PET_ALLOWED_CATEGORIES = [
  'dog', 'dogs', 'cat', 'cats', 'pet', 'pets'
];

function isHardPetApproved(product) {
  if (!product) return { approved: false, reason: 'no_product' };

  // 0. CHECK ACTIVE/BLOCKED STATUS
  if (product.blocked === true || product.isBlocked === true) {
    return { approved: false, reason: 'blocked', flag: 'blocked' };
  }
  if (product.active === false) {
    return { approved: false, reason: 'inactive', flag: 'inactive' };
  }
  if (product.is_pet_product === false || product.isPetProduct === false) {
    return { approved: false, reason: 'non_pet', flag: 'is_pet_product' };
  }

  // 1. ADULT / TATTOO / STICKER BLOCK
  const title = (product.title || product.name || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const combinedText = `${title} ${desc}`;
  
  for (const kw of HARD_BLOCK_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(combinedText)) {
      return { approved: false, reason: 'adult_or_lifestyle', keyword: kw };
    }
  }

  // 2. CATEGORY VALIDATION
  const category = (product.mainCategorySlug || product.category || '').toLowerCase();
  const isPetCategory = PET_ALLOWED_CATEGORIES.some(c => category.includes(c));
  if (!isPetCategory) {
    return { approved: false, reason: 'invalid_category', category };
  }

  // 3. IMAGE VALIDATION
  const image = product.image || (product.images && product.images[0]);
  if (!image || String(image).includes('no-image') || String(image).includes('placeholder')) {
    return { approved: false, reason: 'no_image' };
  }

  // 4. PRICE VALIDATION
  if (!product.price || parseFloat(product.price) <= 0) {
    return { approved: false, reason: 'invalid_price' };
  }

  // 5. SECONDARY SAFETY (NSFW Shield)
  const safety = productSafety.isPetApproved(product);
  if (!safety.approved) {
    return { approved: false, reason: 'safety_check_failed', subReasons: safety.reasons };
  }

  return { approved: true, reason: 'ok' };
}

function filterProducts(products) {
  if (!Array.isArray(products)) return { products: [], stats: {} };
  
  const stats = {
    total: products.length,
    allowed: 0,
    blockedAdult: 0,
    blockedNonPet: 0,
    blockedNoImage: 0,
    blockedInvalidPrice: 0,
    blockedInactive: 0,
    blockedExplicit: 0
  };

  const filtered = products.filter(p => {
    const check = isHardPetApproved(p);
    if (!check.approved) {
      if (check.reason === 'adult_or_lifestyle') stats.blockedAdult++;
      else if (check.reason === 'invalid_category' || check.reason === 'safety_check_failed') stats.blockedNonPet++;
      else if (check.reason === 'no_image') stats.blockedNoImage++;
      else if (check.reason === 'invalid_price') stats.blockedInvalidPrice++;
      else if (check.reason === 'inactive' || check.reason === 'blocked') stats.blockedInactive++;
      else if (check.reason === 'non_pet') stats.blockedExplicit++;
      return false;
    }
    stats.allowed++;
    return true;
  });

  return { products: filtered, stats };
}

module.exports = {
  isHardPetApproved,
  filterProducts
};
