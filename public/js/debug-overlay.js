(function() {
  'use strict';
  
  // DEBUG OVERLAY: STRICTLY opt-in via URL query param ?debug=1 ONLY
  // NO hash, NO localStorage, NO env - this is the requirement
  const params = new URLSearchParams(window.location.search);
  const debugEnabled = params.get('debug') === '1';
  const pin = params.get('pin');
  
  const DEBUG_PIN = window.__DEBUG_PIN || null;
  if (!debugEnabled) return;
  if (DEBUG_PIN && pin !== DEBUG_PIN) return;
  
  let healthData = null;
  let productsCount = null;
  let lastCartPayload = null;
  let lastCartError = null;
  let overflowStatus = 'checking...';
  let imageDebugEnabled = false;
  
  window.__debugSetLastCartPayload = function(payload) {
    lastCartPayload = payload;
    updateOverlay();
  };
  
  window.__debugSetLastCartError = function(error) {
    lastCartError = error;
    updateOverlay();
  };
  
  async function fetchHealthData() {
    try {
      const res = await fetch('/api/health');
      healthData = await res.json();
    } catch (e) {
      healthData = { ok: false, error: e.message };
    }
    updateOverlay();
  }
  
  async function fetchProductsCount() {
    try {
      const res = await fetch('/api/products?limit=1');
      const data = await res.json();
      if (data.products) {
        productsCount = data.totalProducts || data.products.length;
      } else if (Array.isArray(data)) {
        productsCount = data.length;
      } else {
        productsCount = 'unknown';
      }
    } catch (e) {
      productsCount = 'error';
    }
    updateOverlay();
  }
  
  function getProductInfo() {
    const pdpMatch = window.location.pathname.match(/\/product\/([^\/]+)/);
    if (!pdpMatch) return null;
    
    const productEl = document.querySelector('[data-product-id]');
    const variantEl = document.querySelector('[data-variant-id]');
    
    return {
      slug: pdpMatch[1],
      productId: productEl ? productEl.dataset.productId : 'N/A',
      variantId: variantEl ? variantEl.dataset.variantId : 'N/A'
    };
  }
  
  function detectOverflow() {
    const overflowEls = [];
    const docWidth = document.documentElement.clientWidth;
    
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollWidth > docWidth) {
        overflowEls.push({
          tag: el.tagName,
          id: el.id || '',
          class: el.className ? String(el.className).slice(0, 30) : '',
          scrollWidth: el.scrollWidth,
          diff: el.scrollWidth - docWidth
        });
      }
    });
    
    if (overflowEls.length > 0) {
      console.log('[DEBUG] Overflow elements:', overflowEls.slice(0, 5));
      overflowStatus = `YES (${overflowEls.length})`;
    } else {
      overflowStatus = 'NO';
    }
    
    return overflowEls.length > 0;
  }
  
  function getViewportInfo() {
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      docWidth: document.documentElement.clientWidth
    };
  }
  
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pawsy-debug-overlay';
    overlay.innerHTML = `
      <style>
        #pawsy-debug-overlay {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0,0,0,0.92);
          color: #0f0;
          font-family: monospace;
          font-size: 10px;
          padding: 6px 12px;
          z-index: 999999;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          max-height: 80px;
          overflow-y: auto;
        }
        #pawsy-debug-overlay .debug-item {
          display: flex;
          gap: 3px;
        }
        #pawsy-debug-overlay .debug-label {
          color: #888;
        }
        #pawsy-debug-overlay .debug-ok { color: #0f0; }
        #pawsy-debug-overlay .debug-err { color: #f44; }
        #pawsy-debug-overlay .debug-warn { color: #fa0; }
        #pawsy-debug-overlay .debug-close {
          position: absolute;
          right: 8px;
          top: 4px;
          cursor: pointer;
          color: #888;
          font-size: 14px;
        }
        #pawsy-debug-overlay .debug-cart-payload {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: pointer;
        }
        #pawsy-debug-overlay .debug-cart-payload.expanded {
          white-space: pre-wrap;
          max-width: none;
        }
        #pawsy-debug-overlay .debug-toggle {
          cursor: pointer;
          padding: 2px 6px;
          border: 1px solid #555;
          border-radius: 3px;
          margin-left: 4px;
        }
        #pawsy-debug-overlay .debug-toggle.active {
          background: #0a0;
          color: #000;
        }
        .img-debug-badge {
          position: absolute !important;
          top: 2px !important;
          left: 2px !important;
          z-index: 9999 !important;
          background: rgba(0,0,0,0.85) !important;
          color: #0f0 !important;
          font-family: monospace !important;
          font-size: 9px !important;
          padding: 2px 4px !important;
          border-radius: 3px !important;
          pointer-events: auto !important;
          cursor: pointer !important;
          max-width: 80px !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        .img-debug-badge.no-image {
          background: rgba(200,0,0,0.9) !important;
          color: #fff !important;
        }
        .img-debug-outline {
          outline: 3px solid red !important;
          outline-offset: -3px !important;
        }
        .img-debug-popover {
          position: fixed !important;
          z-index: 999999 !important;
          background: rgba(0,0,0,0.95) !important;
          color: #0f0 !important;
          font-family: monospace !important;
          font-size: 11px !important;
          padding: 10px !important;
          border-radius: 6px !important;
          max-width: 300px !important;
          word-break: break-all !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .img-debug-popover .popover-close {
          position: absolute !important;
          top: 4px !important;
          right: 6px !important;
          cursor: pointer !important;
          color: #888 !important;
        }
        .img-debug-popover .popover-row {
          margin: 4px 0 !important;
        }
        .img-debug-popover .popover-label {
          color: #888 !important;
        }
      </style>
      <span class="debug-close" onclick="document.getElementById('pawsy-debug-overlay').remove()">×</span>
      <div class="debug-content"></div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }
  
  function updateOverlay() {
    let overlay = document.getElementById('pawsy-debug-overlay');
    if (!overlay) {
      overlay = createOverlay();
    }
    
    const content = overlay.querySelector('.debug-content');
    if (!content) return;
    
    const productInfo = getProductInfo();
    const viewport = getViewportInfo();
    
    let html = '';
    
    if (healthData) {
      const statusClass = healthData.ok ? 'debug-ok' : 'debug-err';
      html += `<span class="debug-item"><span class="debug-label">Health:</span><span class="${statusClass}">${healthData.ok ? 'OK' : 'ERR'}</span></span>`;
      if (healthData.version) {
        html += `<span class="debug-item"><span class="debug-label">v:</span><span>${healthData.version}</span></span>`;
      }
      if (healthData.fingerprint) {
        html += `<span class="debug-item"><span class="debug-label">Build:</span><span>${healthData.fingerprint.substring(3, 17)}</span></span>`;
      }
    } else {
      html += `<span class="debug-item"><span class="debug-label">Health:</span><span>...</span></span>`;
    }
    
    html += `<span class="debug-item"><span class="debug-label">Prods:</span><span>${productsCount !== null ? productsCount : '...'}</span></span>`;
    
    const isPDP = window.location.pathname.startsWith('/product/');
    html += `<span class="debug-item"><span class="debug-label">Route:</span><span>${window.location.pathname}${isPDP ? ' (canonical)' : ''}</span></span>`;
    
    if (productInfo) {
      html += `<span class="debug-item"><span class="debug-label">PDP:</span><span>pid=${productInfo.productId}</span></span>`;
    }
    
    const cart = window.CartStore;
    if (cart && typeof cart.getCount === 'function') {
      html += `<span class="debug-item"><span class="debug-label">Cart:</span><span>${cart.getCount()}</span></span>`;
    }
    
    if (lastCartPayload) {
      const payloadStr = JSON.stringify(lastCartPayload);
      html += `<span class="debug-item"><span class="debug-label">LastAdd:</span><span class="debug-cart-payload debug-ok" onclick="this.classList.toggle('expanded')">${payloadStr}</span></span>`;
    }
    
    if (lastCartError) {
      html += `<span class="debug-item"><span class="debug-label">CartErr:</span><span class="debug-err">${lastCartError}</span></span>`;
    }
    
    html += `<span class="debug-item"><span class="debug-label">VP:</span><span>${viewport.innerWidth}x${viewport.innerHeight} @${viewport.devicePixelRatio}x</span></span>`;
    
    const overflowClass = overflowStatus === 'NO' ? 'debug-ok' : (overflowStatus.startsWith('YES') ? 'debug-err' : '');
    html += `<span class="debug-item"><span class="debug-label">Overflow:</span><span class="${overflowClass}">${overflowStatus}</span></span>`;
    
    // Image Debug toggle
    const imgToggleClass = imageDebugEnabled ? 'debug-toggle active' : 'debug-toggle';
    html += `<span class="debug-item"><span class="debug-label">ImgDebug:</span><span class="${imgToggleClass}" onclick="window.__toggleImageDebug()">${imageDebugEnabled ? 'ON' : 'OFF'}</span></span>`;
    
    content.innerHTML = html;
  }
  
  // Image debug functions
  window.__toggleImageDebug = function() {
    imageDebugEnabled = !imageDebugEnabled;
    updateOverlay();
    if (imageDebugEnabled) {
      addImageDebugBadges();
    } else {
      removeImageDebugBadges();
    }
  };
  
  function getImageSource(img) {
    const src = img.getAttribute('src') || '';
    const dataSrc = img.getAttribute('data-src') || '';
    const originalSrc = img.dataset.originalSrc || '';
    
    // Determine source type
    if (src.includes('/media/products/')) return { source: 'local', url: src };
    if (src.includes('thumbImage') || src.includes('/thumb')) return { source: 'thumbImage', url: src };
    if (src.includes('/api/img')) return { source: 'proxy', url: src };
    if (src.includes('placeholder')) return { source: 'none', url: src };
    if (src.startsWith('http')) return { source: 'external', url: src };
    if (src.startsWith('/')) return { source: 'local', url: src };
    return { source: 'unknown', url: src };
  }
  
  function addImageDebugBadges() {
    // Find all product card images
    const selectors = [
      '.card img',
      '.carousel-card img',
      '.pawsy-product-card img',
      '.top-pick img',
      '.product-grid img',
      '.card-img-wrap img',
      '.card-image-wrap img'
    ];
    
    const images = document.querySelectorAll(selectors.join(', '));
    
    images.forEach((img, idx) => {
      if (img.closest('.img-debug-badge')) return; // Skip badge images
      
      const parent = img.parentElement;
      if (!parent || parent.querySelector('.img-debug-badge')) return;
      
      // Ensure parent has position relative for absolute positioning
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.position === 'static') {
        parent.style.position = 'relative';
      }
      
      const { source, url } = getImageSource(img);
      const isPlaceholder = source === 'none' || url.includes('placeholder');
      const isBroken = img.dataset.fallbackApplied === 'true';
      
      const badge = document.createElement('span');
      badge.className = 'img-debug-badge' + (isPlaceholder || isBroken ? ' no-image' : '');
      badge.textContent = `IMG: ${source}`;
      badge.title = url.substring(0, 100);
      badge.dataset.imgIdx = idx;
      badge.dataset.source = source;
      badge.dataset.url = url;
      
      badge.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        showImagePopover(badge, source, url, img);
      };
      
      parent.appendChild(badge);
      
      // Add red outline for broken/placeholder images
      if (isPlaceholder || isBroken) {
        img.classList.add('img-debug-outline');
      }
    });
  }
  
  function removeImageDebugBadges() {
    document.querySelectorAll('.img-debug-badge').forEach(el => el.remove());
    document.querySelectorAll('.img-debug-outline').forEach(el => el.classList.remove('img-debug-outline'));
    document.querySelectorAll('.img-debug-popover').forEach(el => el.remove());
  }
  
  function showImagePopover(badge, source, url, img) {
    // Remove existing popovers
    document.querySelectorAll('.img-debug-popover').forEach(el => el.remove());
    
    const rect = badge.getBoundingClientRect();
    const popover = document.createElement('div');
    popover.className = 'img-debug-popover';
    
    // Get additional info from img
    const originalSrc = img.dataset.originalSrc || 'N/A';
    const fallback = img.dataset.fallbackApplied === 'true' ? 'YES' : 'NO';
    const naturalSize = img.naturalWidth ? `${img.naturalWidth}x${img.naturalHeight}` : 'N/A';
    
    popover.innerHTML = `
      <span class="popover-close" onclick="this.parentElement.remove()">×</span>
      <div class="popover-row"><span class="popover-label">Source:</span> ${source}</div>
      <div class="popover-row"><span class="popover-label">URL:</span> ${url.substring(0, 150)}${url.length > 150 ? '...' : ''}</div>
      <div class="popover-row"><span class="popover-label">Original:</span> ${originalSrc.substring(0, 100)}</div>
      <div class="popover-row"><span class="popover-label">Fallback:</span> ${fallback}</div>
      <div class="popover-row"><span class="popover-label">Size:</span> ${naturalSize}</div>
    `;
    
    popover.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - 200)}px`;
    popover.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
    
    document.body.appendChild(popover);
    
    // Auto-close on click outside
    setTimeout(() => {
      document.addEventListener('click', function closePopover(e) {
        if (!popover.contains(e.target) && !badge.contains(e.target)) {
          popover.remove();
          document.removeEventListener('click', closePopover);
        }
      });
    }, 100);
  }
  
  function init() {
    fetchHealthData();
    fetchProductsCount();
    
    setTimeout(() => {
      detectOverflow();
      updateOverlay();
    }, 1000);
    
    setInterval(() => {
      detectOverflow();
      updateOverlay();
    }, 3000);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  const origAddToCart = window.addToCart;
  if (typeof origAddToCart === 'function') {
    window.addToCart = function(...args) {
      const payload = args[0];
      if (payload && typeof payload === 'object') {
        window.__debugSetLastCartPayload(payload);
      }
      return origAddToCart.apply(this, args);
    };
  }
  
  setTimeout(() => {
    if (window.CartStore && window.CartStore.addItem) {
      const origAddItem = window.CartStore.addItem.bind(window.CartStore);
      window.CartStore.addItem = function(...args) {
        window.__debugSetLastCartPayload({ 
          productId: args[0], 
          variantId: args[1], 
          title: args[2], 
          price: args[3], 
          image: args[4], 
          qty: args[5] 
        });
        return origAddItem(...args);
      };
    }
  }, 100);
  
  console.log('[DEBUG] Pawsy debug overlay enabled with viewport & overflow detection');
})();
