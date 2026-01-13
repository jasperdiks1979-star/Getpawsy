(function() {
  'use strict';
  
  const STORAGE_KEY = 'getpawsy_cart_v1';
  const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
  let isReady = false;
  let readyResolve;
  const readyPromise = new Promise(resolve => { readyResolve = resolve; });
  
  let memoryFallback = [];
  let storageType = 'localStorage';
  
  function log(msg, data) {
    if (DEBUG) console.log('[CartStore] ' + msg, data !== undefined ? data : '');
  }
  
  function logError(msg, data) {
    console.error('[CartStore ERROR] ' + msg, data !== undefined ? data : '');
  }
  
  const SafeStorage = {
    _type: 'localStorage',
    
    _testStorage: function(storage) {
      try {
        const testKey = '__cart_test__';
        storage.setItem(testKey, '1');
        const val = storage.getItem(testKey);
        storage.removeItem(testKey);
        return val === '1';
      } catch (e) {
        return false;
      }
    },
    
    _getCookie: function(name) {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      if (match) {
        try {
          return decodeURIComponent(match[2]);
        } catch (e) {
          return null;
        }
      }
      return null;
    },
    
    _setCookie: function(name, value, days) {
      const maxAge = days * 24 * 60 * 60;
      document.cookie = name + '=' + encodeURIComponent(value) + ';max-age=' + maxAge + ';path=/;SameSite=Lax';
    },
    
    _removeCookie: function(name) {
      document.cookie = name + '=;max-age=0;path=/';
    },
    
    init: function() {
      if (this._testStorage(localStorage)) {
        this._type = 'localStorage';
        storageType = 'localStorage';
        log('Using localStorage');
      } else if (this._testStorage(sessionStorage)) {
        this._type = 'sessionStorage';
        storageType = 'sessionStorage';
        log('Using sessionStorage');
      } else {
        this._type = 'cookie';
        storageType = 'cookie';
        log('Using cookie fallback');
      }
      return this._type;
    },
    
    get: function(key) {
      try {
        if (this._type === 'localStorage') {
          return localStorage.getItem(key);
        } else if (this._type === 'sessionStorage') {
          return sessionStorage.getItem(key);
        } else {
          return this._getCookie(key);
        }
      } catch (e) {
        return this._getCookie(key);
      }
    },
    
    set: function(key, value) {
      try {
        if (this._type === 'localStorage') {
          localStorage.setItem(key, value);
        } else if (this._type === 'sessionStorage') {
          sessionStorage.setItem(key, value);
        } else {
          this._setCookie(key, value, 30);
        }
        return true;
      } catch (e) {
        try {
          this._setCookie(key, value, 30);
          this._type = 'cookie';
          storageType = 'cookie';
          return true;
        } catch (e2) {
          return false;
        }
      }
    },
    
    remove: function(key) {
      try {
        if (this._type === 'localStorage') {
          localStorage.removeItem(key);
        } else if (this._type === 'sessionStorage') {
          sessionStorage.removeItem(key);
        } else {
          this._removeCookie(key);
        }
      } catch (e) {
        this._removeCookie(key);
      }
    }
  };
  
  window.SafeStorage = SafeStorage;

  function loadCart() {
    try {
      const saved = SafeStorage.get(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        memoryFallback = Array.isArray(parsed) ? parsed : [];
        return [...memoryFallback];
      }
      return [...memoryFallback];
    } catch (e) {
      logError('Load failed', e);
      return [...memoryFallback];
    }
  }

  function saveCart(items) {
    memoryFallback = Array.isArray(items) ? [...items] : [];
    
    try {
      SafeStorage.set(STORAGE_KEY, JSON.stringify(memoryFallback));
    } catch (e) {
      logError('Storage save failed', e);
    }
    
    const count = memoryFallback.reduce((s, i) => s + (i.qty || 1), 0);
    window.dispatchEvent(new CustomEvent('cart:changed', { detail: { count, items: memoryFallback } }));
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: { count, items: memoryFallback } }));
    return true;
  }

  function updateUI(count) {
    document.querySelectorAll('.cart-count, #cartCount, .pawsy-cart-count').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? '' : 'none';
    });
    if (window.updateCartBadges) window.updateCartBadges(count);
  }

  function renderMiniCart() {
    const container = document.querySelector('#pawsyMiniCartItems, .pawsy-mini-cart-items, #miniCartItems');
    if (!container) return;
    
    const items = loadCart();
    if (items.length === 0) {
      container.innerHTML = '<div class="empty-cart">Your cart is empty</div>';
      return;
    }
    
    let html = '';
    items.forEach(item => {
      html += `<div class="mini-cart-item" data-product-id="${item.productId}" data-variant-id="${item.variantId || ''}">
        <img src="${item.image || '/images/placeholder-pawsy.webp'}" alt="${item.title}" class="mini-cart-item-img">
        <div class="mini-cart-item-info">
          <div class="mini-cart-item-title">${item.title}</div>
          <div class="mini-cart-item-price">$${parseFloat(item.price || 0).toFixed(2)}</div>
          <div class="mini-cart-item-qty">
            <button data-action="decrease" data-product-id="${item.productId}" data-variant-id="${item.variantId || ''}">-</button>
            <span>${item.qty}</span>
            <button data-action="increase" data-product-id="${item.productId}" data-variant-id="${item.variantId || ''}">+</button>
          </div>
        </div>
        <button data-action="remove" data-product-id="${item.productId}" data-variant-id="${item.variantId || ''}" class="mini-cart-item-remove">&times;</button>
      </div>`;
    });
    
    const total = items.reduce((sum, i) => sum + (parseFloat(i.price) || 0) * (i.qty || 1), 0);
    html += `<div class="mini-cart-total">Total: $${total.toFixed(2)}</div>`;
    html += `<a href="/cart" class="mini-cart-checkout-btn">View Cart</a>`;
    
    container.innerHTML = html;
  }

  window.resolveVariant = function(product, selectedOptions) {
    const variants = product.variants || [];
    if (variants.length === 0) return { variantId: product.id, price: product.price, title: product.title };
    if (variants.length === 1) {
      const v = variants[0];
      return { variantId: v.id || product.id, price: v.price || product.price, title: v.title || product.title };
    }
    
    if (!selectedOptions || Object.keys(selectedOptions).length === 0) return null;
    
    const matched = variants.find(v => {
      const opts = v.options || v.optionValues || {};
      return Object.entries(selectedOptions).every(([k, val]) => opts[k] === val);
    });
    
    return matched ? { variantId: matched.id, price: matched.price, title: matched.title } : null;
  };

  window.addToCartUnified = async function(payload) {
    const { productId, variantId, qty, title, price, image, source } = payload;
    
    console.log('=== ADD TO CART ===', { productId, variantId, qty, source });
    
    if (!productId) {
      logError('Missing productId', { source });
      if (window.showToast) window.showToast('Unable to add item', 'error');
      return false;
    }
    
    const finalVariantId = variantId || productId;

    const items = loadCart();
    const existing = items.find(i => i.productId === productId && i.variantId === finalVariantId);
    
    if (existing) {
      existing.qty = (parseInt(existing.qty) || 0) + (parseInt(qty) || 1);
    } else {
      items.push({ 
        productId, 
        variantId: finalVariantId, 
        title: title || 'Product', 
        price: price || 0, 
        image: image || '', 
        qty: parseInt(qty) || 1 
      });
    }

    if (saveCart(items)) {
      const count = items.reduce((s, i) => s + (i.qty || 1), 0);
      updateUI(count);
      renderMiniCart();
      if (window.showToast) window.showToast('Added to cart!', 'success');
      
      const pawsy = window.pawsyVideoManager;
      if (pawsy && typeof pawsy.setState === 'function') {
        pawsy.setState('happy', 1500);
      }
      
      log('SUCCESS', { productId, variantId: finalVariantId, count: items.length });
      return true;
    }
    return false;
  };

  window.CartStore = {
    ready: readyPromise,
    
    getCount: function() {
      return loadCart().reduce((s, i) => s + (i.qty || 1), 0);
    },
    
    getItems: function() {
      return loadCart();
    },
    
    addItem: function(data, qty) {
      return window.addToCartUnified({ 
        productId: data.productId || data.id,
        variantId: data.variantId || data.productId || data.id,
        title: data.title,
        price: data.price,
        image: data.image,
        qty: qty || 1, 
        source: 'CartStore.addItem' 
      });
    },
    
    findItem: function(pid, vid) {
      return loadCart().find(i => i.productId === pid && (i.variantId === vid || (!vid && i.variantId === pid)));
    },
    
    setQty: function(pid, vid, newQty) {
      const items = loadCart();
      const item = items.find(i => i.productId === pid && (i.variantId === vid || (!vid && i.variantId === pid)));
      if (item) {
        if (newQty <= 0) {
          const idx = items.indexOf(item);
          items.splice(idx, 1);
        } else {
          item.qty = newQty;
        }
        saveCart(items);
        updateUI(items.reduce((s, i) => s + (i.qty || 1), 0));
        renderMiniCart();
      }
    },
    
    removeItem: function(pid, vid) {
      const items = loadCart().filter(i => !(i.productId === pid && (i.variantId === vid || (!vid && i.variantId === pid))));
      saveCart(items);
      updateUI(items.reduce((s, i) => s + (i.qty || 1), 0));
      renderMiniCart();
    },
    
    clear: function() {
      saveCart([]);
      updateUI(0);
      renderMiniCart();
    },
    
    renderUI: function() {
      const count = this.getCount();
      updateUI(count);
      renderMiniCart();
    }
  };
  
  function init() {
    SafeStorage.init();
    const count = window.CartStore.getCount();
    updateUI(count);
    isReady = true;
    readyResolve();
    log('Initialized', { count, storageType });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  window.__GETPAWSY_CART__ = window.CartStore;
})();
