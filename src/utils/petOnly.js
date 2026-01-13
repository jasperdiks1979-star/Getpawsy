/**
 * PET ONLY UTILITY V1.0
 * 
 * Centralized pet product filtering utility.
 * Use isPetProduct() to check single products.
 * Use filterPetProducts() to filter arrays.
 */

const { isPetEligible, getPetProducts, PET_KEYWORDS, NON_PET_BLOCKLIST, PET_SAFE_OVERRIDES } = require('../strictPetProducts');

function isPetProduct(product) {
  const result = isPetEligible(product);
  return result.eligible;
}

function filterPetProducts(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(isPetProduct);
}

function getPetProductDetails(product) {
  return isPetEligible(product);
}

function validateCarouselProducts(products, sectionName) {
  const results = products.map(p => ({
    id: p.id,
    title: (p.title || '').slice(0, 50),
    ...isPetEligible(p)
  }));
  
  const valid = results.filter(r => r.eligible);
  const invalid = results.filter(r => !r.eligible);
  
  if (invalid.length > 0) {
    console.warn(`[petOnly] ${sectionName}: ${invalid.length} non-pet products rejected`);
    invalid.forEach(item => {
      console.warn(`  - ${item.id}: ${item.reason} - "${item.title}"`);
    });
  }
  
  return {
    validProducts: products.filter(p => isPetProduct(p)),
    rejectedCount: invalid.length,
    rejectedItems: invalid
  };
}

module.exports = {
  isPetProduct,
  filterPetProducts,
  getPetProductDetails,
  validateCarouselProducts,
  PET_KEYWORDS,
  NON_PET_BLOCKLIST,
  PET_SAFE_OVERRIDES
};
