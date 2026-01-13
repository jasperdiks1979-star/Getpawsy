(function() {
  'use strict';
  const DEBUG = new URLSearchParams(window.location.search).has('debug');
  let bound = false;
  function log(msg, data) { if (DEBUG) console.log('[CartUI] ' + msg, data || ''); }
  function renderCartBadges(count) {
    const selectors = ['#pawsyCartCount', '.pawsy-cart-count', '[data-cart-count]', '.cart-badge', '#cartCount'];
    const seen = new Set();
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(badge => {
        if (seen.has(badge)) return;
        seen.add(badge);
        badge.textContent = count;
        badge.style.display = count > 0 ? '' : 'none';
      });
    });
    log('Rendered badges', { count });
  }
  function syncFromStore() { if (window.CartStore) renderCartBadges(window.CartStore.getCount()); }
  function init() {
    if (bound) { syncFromStore(); return; }
    window.updateCartBadges = renderCartBadges;
    // Listen for custom event specifically
    window.addEventListener('cart:changed', (e) => {
      const count = e.detail ? (e.detail.count || 0) : 0;
      renderCartBadges(count);
      if (window.CartStore && typeof window.CartStore.renderUI === 'function') {
        window.CartStore.renderUI();
      }
    });
    window.addEventListener('cart:updated', (e) => {
      const count = e.detail ? (e.detail.count || 0) : 0;
      renderCartBadges(count);
      if (window.showToast) window.showToast('Added to cart!');
    });
    window.addEventListener('storage', (e) => {
      if (e.key === 'getpawsy_cart_v1' && window.CartStore) {
        syncFromStore();
      }
    });
    bound = true;
    syncFromStore();
    log('Initialized listeners');
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
  document.addEventListener('pawsy:navigate', init);
  window.addEventListener('popstate', init);
})();
