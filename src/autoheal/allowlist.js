const { FIX_ACTIONS } = require('./types');

const SAFE_ACTIONS = [
  FIX_ACTIONS.DISABLE_NON_PET_PRODUCTS,
  FIX_ACTIONS.REASSIGN_CATEGORY,
  FIX_ACTIONS.REBUILD_RESOLVED_IMAGES,
  FIX_ACTIONS.ENABLE_REMOTE_IMAGE_FALLBACK,
  FIX_ACTIONS.CLEAR_CACHE_REINDEX
];

const REQUIRES_REVIEW = [
  FIX_ACTIONS.REGENERATE_SEO_FOR_MISSING,
  FIX_ACTIONS.RECALC_PRICES
];

function isActionAllowed(actionType) {
  return SAFE_ACTIONS.includes(actionType) || REQUIRES_REVIEW.includes(actionType);
}

function isSafeAction(actionType) {
  return SAFE_ACTIONS.includes(actionType);
}

function getActionDescription(actionType) {
  const descriptions = {
    [FIX_ACTIONS.DISABLE_NON_PET_PRODUCTS]: 'Disable products that are not pet-related (socks, chairs, etc.)',
    [FIX_ACTIONS.REASSIGN_CATEGORY]: 'Normalize and fix miscategorized products',
    [FIX_ACTIONS.REBUILD_RESOLVED_IMAGES]: 'Rebuild resolved_image field from available sources',
    [FIX_ACTIONS.ENABLE_REMOTE_IMAGE_FALLBACK]: 'Enable remote image fallback for missing local images',
    [FIX_ACTIONS.REGENERATE_SEO_FOR_MISSING]: 'Queue SEO regeneration for products missing descriptions',
    [FIX_ACTIONS.RECALC_PRICES]: 'Recalculate prices for products with suspicious pricing',
    [FIX_ACTIONS.CLEAR_CACHE_REINDEX]: 'Clear caches and rebuild search indexes'
  };
  return descriptions[actionType] || 'Unknown action';
}

module.exports = {
  SAFE_ACTIONS,
  REQUIRES_REVIEW,
  isActionAllowed,
  isSafeAction,
  getActionDescription
};
