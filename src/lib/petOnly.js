/**
 * SHARED PET-ONLY FILTER HELPER
 * 
 * IMPORTANT: Admin catalog (catalog.json) is the SOURCE OF TRUTH.
 * When products come from admin catalog, we ONLY filter by active=true.
 * The pet-only rules were already applied during catalog import.
 * 
 * Rules (for non-admin sources):
 * 1. active must be true/1/"true"
 * 2. is_pet_product must be true/1/"true" 
 * 3. Must have category OR pet_type (not unknown/empty)
 */

// Trust admin catalog = skip pet-only refiltering, only check active
const TRUST_ADMIN_CATALOG = true;

function isTruthy(v) {
  return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
}

function isFalsy(v) {
  return v === false || v === 0 || v === "0" || String(v).toLowerCase() === "false";
}

function isPetOnly(p) {
  if (!p) return false;
  
  // 1. Must be active
  if (isFalsy(p.active)) return false;
  if (!isTruthy(p.active) && p.active !== undefined) return false;
  
  // 2. Must be marked as pet product (if field exists and is false, reject)
  if (isFalsy(p.is_pet_product) || isFalsy(p.isPetProduct)) return false;
  
  // 3. Must be unblocked
  if (isTruthy(p.blocked) || isTruthy(p.isBlocked)) return false;
  
  // 4. Must have valid category or pet_type (not empty/unknown)
  const category = (p.mainCategorySlug || p.category || '').toLowerCase().trim();
  const petType = (p.pet_type || p.petType || '').toLowerCase().trim();
  
  const validCategories = ['dogs', 'dog', 'cats', 'cat', 'small-pets', 'small_pets', 'smallpets', 'pets', 'pet'];
  const hasValidCategory = validCategories.some(c => category.includes(c));
  const hasValidPetType = petType && petType !== 'unknown' && petType !== '';
  
  if (!hasValidCategory && !hasValidPetType) return false;
  
  // 5. Must have a valid image
  const image = p.image || (Array.isArray(p.images) && p.images[0]);
  if (!image || String(image).includes('no-image') || String(image).includes('placeholder')) {
    return false;
  }
  
  // 6. Must have valid price
  if (!p.price || parseFloat(p.price) <= 0) return false;
  
  return true;
}

// Simple active-only filter (for admin catalog data)
function filterActiveOnly(products, source = 'unknown') {
  if (!Array.isArray(products)) return [];
  const filtered = products.filter(p => p && !isFalsy(p.active));
  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PET-ONLY LOCKDOWN V2.0: TIGHTENED - No more bypasses for storefront routes
// Only internal admin catalog operations bypass the lockdown filter
// ═══════════════════════════════════════════════════════════════════════════════
const TRUSTED_ADMIN_SOURCES = [
  'admin_catalog',              // Explicit flag passed via options (internal only)
  'catalog.json'                // Direct file load (internal only)
  // REMOVED: '/api/products/catalog', 'storefront' - these must go through lockdown
];

// ═══════════════════════════════════════════════════════════════════════════════
// PET-ONLY LOCKDOWN: Use centralized petOnlyEngine for consistent filtering
// ═══════════════════════════════════════════════════════════════════════════════
function filterPetOnly(products, source = 'unknown', options = {}) {
  if (!Array.isArray(products)) return [];
  
  const bypass = options.bypass === true;
  
  // STRICT admin catalog detection: must be EXPLICIT, not substring match
  // Preview/apply/import endpoints should NOT bypass - they need full validation
  const isAdminCatalog = options.source === 'admin_catalog' || 
                          TRUSTED_ADMIN_SOURCES.includes(source);
  
  // If we trust admin catalog and this is admin catalog data, only filter by active
  if (TRUST_ADMIN_CATALOG && isAdminCatalog && !bypass) {
    const before = products.length;
    const filtered = filterActiveOnly(products, source);
    const after = filtered.length;
    if (before !== after && process.env.DEBUG_PETONLY === 'true') {
      console.log(`[CATALOG] Active filter: ${before - after} inactive of ${before} in ${source}`);
    }
    return filtered;
  }
  
  // For non-admin sources, use centralized petOnlyEngine for lockdown
  try {
    const { filterPetApproved, PETONLY_MODE } = require('./petOnlyEngine');
    const before = products.length;
    const { products: lockdownFiltered } = filterPetApproved(products, PETONLY_MODE);
    const after = lockdownFiltered.length;
    
    if (before !== after && !bypass) {
      console.log(`[PETONLY-LOCKDOWN] Filtered out ${before - after} of ${before} items in ${source}`);
    }
    
    return lockdownFiltered;
  } catch (err) {
    // Fallback to legacy filter if petOnlyEngine fails
    console.error('[PETONLY] Engine error, using fallback:', err.message);
    const before = products.length;
    const filtered = products.filter(isPetOnly);
    const after = filtered.length;
    
    if (before !== after && !bypass) {
      console.log(`[PETONLY] Filtered out ${before - after} of ${before} items in ${source}`);
    }
    
    return filtered;
  }
}

module.exports = {
  isTruthy,
  isFalsy,
  isPetOnly,
  filterPetOnly,
  filterActiveOnly,
  TRUST_ADMIN_CATALOG
};
