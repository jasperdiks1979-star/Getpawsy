(function() {
  'use strict';

  const DEBUG = new URLSearchParams(window.location.search).has('debug');
  let initialized = false;
  const LOCK_MS = 500;
  const productLocks = new Map();

  function log(action, data) {
    if (DEBUG) {
      console.log(`[CART-DELEGATE] ${action}`, data);
    }
  }

  function isProductLocked(productId) {
    const lockTime = productLocks.get(productId);
    if (!lockTime) return false;
    return Date.now() - lockTime < LOCK_MS;
  }

  function setProductLock(productId) {
    productLocks.set(productId, Date.now());
  }

  function extractProductData(btn) {
    const productId = btn.dataset.productId || btn.getAttribute('data-product-id');
    const variantId = btn.dataset.variantId || btn.getAttribute('data-variant-id') || null;
    const title = btn.dataset.productTitle || btn.dataset.title || btn.getAttribute('data-product-title') || 'Product';
    const price = parseFloat(btn.dataset.productPrice || btn.dataset.price || btn.getAttribute('data-product-price') || 0);
    const image = btn.dataset.productImage || btn.dataset.image || btn.getAttribute('data-product-image') || '';
    const qty = parseInt(btn.dataset.qty || btn.getAttribute('data-qty') || 1, 10);

    return { productId, variantId, title, price, image, qty };
  }

  async function handleAddToCart(e) {
    const btn = e.target.closest('[data-add-to-cart], .add-to-cart, .add-to-cart-btn, .pdp-atc-btn, [data-action="add-to-cart"]');
    if (!btn) return;
    
    if (btn.dataset.pdpHandled === 'true') {
      log('skipping (pdp-handled)', { id: btn.id });
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // ARCHITECTURE FIX: Wait for CartStore.ready Promise (iOS Safari deterministic)
    if (!window.CartStore) {
      console.error('[CART-DELEGATE] CartStore not loaded');
      return;
    }
    
    // Await ready state before proceeding
    if (window.CartStore.ready) {
      await window.CartStore.ready;
      log('CartStore ready confirmed', { timestamp: Date.now() });
    }

    const data = extractProductData(btn);
    
    if (!data.productId) {
      const card = btn.closest('.product-card, .pawsy-product-card, [data-product-id]');
      if (card) {
        data.productId = card.dataset.productId || card.getAttribute('data-product-id');
        if (!data.title || data.title === 'Product') {
          const titleEl = card.querySelector('.product-title, .card-title, h3, h4');
          if (titleEl) data.title = titleEl.textContent.trim();
        }
        if (!data.price) {
          const priceEl = card.querySelector('.product-price, .price, [data-price]');
          if (priceEl) {
            const priceText = priceEl.textContent.replace(/[^0-9.]/g, '');
            data.price = parseFloat(priceText) || 0;
          }
        }
        if (!data.image) {
          const imgEl = card.querySelector('img');
          if (imgEl) data.image = imgEl.src;
        }
      }
    }

    if (!data.productId) {
      console.error('[CART-DELEGATE] No productId found on button or parent card', btn);
      return;
    }

    if (isProductLocked(data.productId)) {
      log('blocked (product locked)', { productId: data.productId, lockMs: LOCK_MS });
      return;
    }

    setProductLock(data.productId);

    const success = window.addToCartUnified({
      productId: data.productId,
      variantId: data.variantId || data.productId,
      title: data.title,
      price: data.price,
      image: data.image,
      qty: data.qty,
      source: 'card'
    });

    if (success) {
      btn.classList.add('added');
      setTimeout(() => btn.classList.remove('added'), 1000);
    }
  }

  function handleDrawerAction(e) {
    const btn = e.target.closest('[data-action="increase"], [data-action="decrease"], [data-action="remove"]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    if (!window.CartStore) return;

    const action = btn.dataset.action;
    const productId = btn.dataset.productId;
    const variantId = btn.dataset.variantId || null;

    if (!productId) return;

    const item = window.CartStore.findItem(productId, variantId);
    if (!item && action !== 'remove') return;

    switch (action) {
      case 'increase':
        window.CartStore.setQty(productId, variantId, item.qty + 1);
        break;
      case 'decrease':
        window.CartStore.setQty(productId, variantId, item.qty - 1);
        break;
      case 'remove':
        window.CartStore.removeItem(productId, variantId);
        break;
    }

    log('drawer action', { action, productId, variantId });
  }

  function handleCartToggle(e) {
    const toggleBtn = e.target.closest('.cart-toggle, #cartToggle, [data-cart-toggle], #pawsyCartBtn, .pawsy-cart-btn');
    if (!toggleBtn) return;

    e.preventDefault();
    
    const miniCart = document.querySelector('#pawsyMiniCart, .pawsy-mini-cart');
    const miniCartOverlay = document.querySelector('#pawsyMiniCartOverlay, .pawsy-mini-cart-overlay');
    const legacyDrawer = document.querySelector('.drawer, #cartDrawer');
    
    if (miniCart) {
      miniCart.classList.toggle('open');
      if (miniCartOverlay) miniCartOverlay.classList.toggle('open');
      document.body.classList.toggle('mini-cart-open');
      if (window.CartStore) window.CartStore.renderUI();
    } else if (legacyDrawer) {
      legacyDrawer.classList.toggle('open');
      document.body.classList.toggle('drawer-open');
    }
    
    log('cart toggle', { miniCart: !!miniCart, legacyDrawer: !!legacyDrawer });
  }

  function handleDrawerClose(e) {
    const closeBtn = e.target.closest('.drawer-close, #drawerClose, [data-drawer-close], #pawsyMiniCartClose, .pawsy-mini-cart-close');
    const overlay = e.target.closest('.drawer-overlay, #drawerOverlay, #pawsyMiniCartOverlay, .pawsy-mini-cart-overlay');
    
    if (closeBtn || overlay) {
      e.preventDefault();
      
      const miniCart = document.querySelector('#pawsyMiniCart, .pawsy-mini-cart');
      const miniCartOverlay = document.querySelector('#pawsyMiniCartOverlay, .pawsy-mini-cart-overlay');
      const legacyDrawer = document.querySelector('.drawer, #cartDrawer');
      
      if (miniCart) {
        miniCart.classList.remove('open');
        if (miniCartOverlay) miniCartOverlay.classList.remove('open');
        document.body.classList.remove('mini-cart-open');
      }
      if (legacyDrawer) {
        legacyDrawer.classList.remove('open');
        document.body.classList.remove('drawer-open');
      }
      
      log('drawer close', { closeBtn: !!closeBtn, overlay: !!overlay });
    }
  }

  function init() {
    if (initialized) {
      log('init skipped (already initialized)', {});
      return;
    }
    initialized = true;

    document.addEventListener('click', function(e) {
      handleAddToCart(e);
      handleDrawerAction(e);
      handleCartToggle(e);
      handleDrawerClose(e);
    }, { capture: true });

    if (window.CartStore) {
      window.CartStore.renderUI();
    }

    log('initialized', { timestamp: new Date().toISOString() });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function normalizeCartPayload(productIdOrObj, skuOrTitle, titleOrPrice, qtyOrImage, optionsOrQty) {
    let productId, variantId, title, price, image, qty;

    if (typeof productIdOrObj === 'object' && productIdOrObj !== null) {
      productId = String(productIdOrObj.productId || productIdOrObj.id || '');
      variantId = productIdOrObj.variantId || productIdOrObj.sku || null;
      title = productIdOrObj.title || 'Product';
      price = parseFloat(productIdOrObj.price) || 0;
      image = productIdOrObj.image || '';
      qty = parseInt(productIdOrObj.qty) || parseInt(skuOrTitle) || 1;
    } else if (typeof optionsOrQty === 'object' && optionsOrQty !== null) {
      productId = String(productIdOrObj || '');
      variantId = optionsOrQty.variantId || skuOrTitle || null;
      title = String(titleOrPrice || 'Product');
      qty = parseInt(qtyOrImage) || 1;
      price = parseFloat(optionsOrQty.price) || 0;
      image = optionsOrQty.image || '';
    } else {
      productId = String(productIdOrObj || '');
      title = String(skuOrTitle || 'Product');
      price = parseFloat(titleOrPrice) || 0;
      image = String(qtyOrImage || '');
      qty = parseInt(optionsOrQty) || 1;
      variantId = null;
    }

    if (!variantId) {
      variantId = productId;
    }

    return { productId, variantId, title, price, image, qty };
  }

  async function addToCartInternal(payload, qty) {
    // HARD FIX: Get cart - create fallback if not available
    let cart = window.CartStore || window.__GETPAWSY_CART__;
    if (!cart) {
      console.warn('[Cart] CartStore not found, creating fallback');
      cart = {
        addItem: function(p, q) {
          try {
            const key = 'getpawsy_cart_v1';
            const saved = localStorage.getItem(key);
            const arr = saved ? JSON.parse(saved) : [];
            const pid = p.productId;
            const vid = p.variantId || null;
            // IDEMPOTENT: check if item exists, increment qty instead of duplicating
            const existing = arr.find(i => (i.productId || i.id) === pid && (i.variantId || null) === vid);
            if (existing) {
              existing.qty = (existing.qty || 1) + (q || 1);
              console.log('[Cart] update (delegate fallback increment)', { productId: pid, newQty: existing.qty });
            } else {
              arr.push({ productId: pid, title: p.title, price: p.price, image: p.image, qty: q || 1, variantId: vid });
              console.log('[Cart] add (delegate fallback new)', pid);
            }
            localStorage.setItem(key, JSON.stringify(arr));
            window.dispatchEvent(new CustomEvent('cart:changed', { detail: { count: arr.reduce((s,i) => s + (i.qty||1), 0) } }));
            return true;
          } catch(e) { return true; }
        },
        renderUI: function() {}
      };
      window.__GETPAWSY_CART__ = cart;
    }

    if (!payload.productId) {
      console.error('[addToCart] Missing productId', payload);
      return false;
    }

    console.log('[addToCart] Adding', payload, 'qty:', qty);

    let success = cart.addItem(payload, qty);
    if (success && typeof success.then === 'function') {
      success = await success;
    }

    if (success) {
      if (cart.renderUI) cart.renderUI();
      const pawsy = window.pawsyVideoManager;
      if (pawsy && typeof pawsy.setState === 'function') pawsy.setState('happy', 1500);
      if (window.showToast) window.showToast('Added to cart!', 'success');
    }

    return success;
  }

  window.addToCart = async function(productIdOrObj, skuOrTitle, titleOrPrice, qtyOrImage, optionsOrQty) {
    const payload = normalizeCartPayload(productIdOrObj, skuOrTitle, titleOrPrice, qtyOrImage, optionsOrQty);
    return addToCartInternal(payload, payload.qty);
  };

  window.normalizeCartPayload = normalizeCartPayload;

})();
