const GA4_MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID || "G-1QLN0SLCH2";
const GA4_ENABLE_IN_NON_PROD = process.env.GA4_ENABLE_IN_NON_PROD === "true";
const GA4_DEBUG = process.env.GA4_DEBUG === "true";
const GA4_ENABLE_PURCHASE = process.env.GA4_ENABLE_PURCHASE === "true";
const LOOKER_STUDIO_REPORT_URL = process.env.LOOKER_STUDIO_REPORT_URL || "";
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || "";
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
const GA4_ADMIN_TOKEN = process.env.GA4_ADMIN_TOKEN || "";
const GA4_CACHE_TTL_SECONDS = parseInt(process.env.GA4_CACHE_TTL_SECONDS || "600", 10);
const META_PIXEL_ID = process.env.META_PIXEL_ID || "";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_DEPLOYMENT = process.env.REPLIT_DEPLOYMENT === "1";
const GA_TRACKING_ENABLED = IS_PRODUCTION || IS_DEPLOYMENT || GA4_ENABLE_IN_NON_PROD;

function getGA4ScriptTag() {
  if (!GA_TRACKING_ENABLED) {
    return `<script>window.GA_TRACKING_ENABLED=false;window.gpTrackPage=function(){};window.gpTrackEvent=function(){};</script>`;
  }
  
  return `
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA4_MEASUREMENT_ID}', {
    anonymize_ip: true,
    send_page_view: false
  });
  window.GA_TRACKING_ENABLED = true;
  window.GA4_DEBUG = ${GA4_DEBUG};
  window.GA4_MEASUREMENT_ID = '${GA4_MEASUREMENT_ID}';
  window.GA4_ENABLE_PURCHASE = ${GA4_ENABLE_PURCHASE};
  
  window.gpTrackPage = function(path, title) {
    if (typeof gtag !== 'function') return;
    var pagePath = path || location.pathname;
    var pageTitle = title || document.title;
    if (window.GA4_DEBUG) console.log('[GA4] page_view:', pagePath, pageTitle);
    gtag('event', 'page_view', {
      page_location: location.href,
      page_path: pagePath,
      page_title: pageTitle
    });
  };
  
  window.gpTrackEvent = function(eventName, params) {
    if (typeof gtag !== 'function') return;
    if (window.GA4_DEBUG) console.log('[GA4] event:', eventName, params);
    gtag('event', eventName, params || {});
  };
  
  window.ga4TrackViewItem = function(product, variant) {
    if (typeof gtag !== 'function' || !product) return;
    var price = variant ? parseFloat(variant.price) : parseFloat(product.price) || 0;
    var itemId = variant ? variant.sku : (product.sku || product.id);
    var params = {
      currency: 'USD',
      value: price,
      items: [{
        item_id: itemId,
        item_name: product.title || product.name || '',
        item_category: product.category || '',
        item_category2: product.petType || product.subcategory || '',
        price: price,
        quantity: 1
      }]
    };
    if (window.GA4_DEBUG) console.log('[GA4] view_item:', params);
    gtag('event', 'view_item', params);
  };
  
  window.ga4TrackViewItemList = function(items, listName) {
    if (typeof gtag !== 'function' || !items || !items.length) return;
    var ga4Items = items.slice(0, 20).map(function(p, idx) {
      return {
        item_id: p.sku || p.id,
        item_name: p.title || p.name || '',
        item_category: p.category || '',
        item_category2: p.petType || p.subcategory || '',
        price: parseFloat(p.price) || 0,
        index: idx
      };
    });
    var params = {
      item_list_name: listName || 'Product List',
      items: ga4Items
    };
    if (window.GA4_DEBUG) console.log('[GA4] view_item_list:', params);
    gtag('event', 'view_item_list', params);
  };
  
  window.ga4TrackAddToCart = function(product, qty, variant) {
    if (typeof gtag !== 'function' || !product) return;
    var price = variant ? parseFloat(variant.price) : parseFloat(product.price) || 0;
    var itemId = variant ? variant.sku : (product.sku || product.id);
    var quantity = qty || 1;
    var params = {
      currency: 'USD',
      value: price * quantity,
      items: [{
        item_id: itemId,
        item_name: product.title || product.name || '',
        item_category: product.category || '',
        item_category2: product.petType || product.subcategory || '',
        price: price,
        quantity: quantity
      }]
    };
    if (window.GA4_DEBUG) console.log('[GA4] add_to_cart:', params);
    gtag('event', 'add_to_cart', params);
  };
  
  window.ga4TrackBeginCheckout = function(cartItems, total) {
    if (typeof gtag !== 'function' || !cartItems || !cartItems.length) return;
    var ga4Items = cartItems.map(function(item) {
      return {
        item_id: item.sku || item.productId || item.id,
        item_name: item.title || '',
        price: parseFloat(item.price) || 0,
        quantity: item.qty || 1
      };
    });
    var params = {
      currency: 'USD',
      value: total || 0,
      items: ga4Items
    };
    if (window.GA4_DEBUG) console.log('[GA4] begin_checkout:', params);
    gtag('event', 'begin_checkout', params);
  };
  
  window.ga4TrackPurchase = function(transactionId, cartItems, total) {
    if (typeof gtag !== 'function' || !window.GA4_ENABLE_PURCHASE) return;
    if (!cartItems || !cartItems.length) return;
    var ga4Items = cartItems.map(function(item) {
      return {
        item_id: item.sku || item.productId || item.id,
        item_name: item.title || '',
        price: parseFloat(item.price) || 0,
        quantity: item.qty || 1
      };
    });
    var params = {
      transaction_id: transactionId,
      currency: 'USD',
      value: total || 0,
      items: ga4Items
    };
    if (window.GA4_DEBUG) console.log('[GA4] purchase:', params);
    gtag('event', 'purchase', params);
  };
</script>
`;
}

function getMaskedMeasurementId() {
  if (!GA4_MEASUREMENT_ID) return 'Not configured';
  const parts = GA4_MEASUREMENT_ID.split('-');
  if (parts.length !== 2) return GA4_MEASUREMENT_ID.slice(0, 2) + '***';
  return parts[0] + '-' + parts[1].slice(0, 2) + '***' + parts[1].slice(-2);
}

module.exports = {
  GA4_MEASUREMENT_ID,
  GA4_ENABLE_IN_NON_PROD,
  GA4_DEBUG,
  GA4_ENABLE_PURCHASE,
  LOOKER_STUDIO_REPORT_URL,
  GA4_PROPERTY_ID,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  GA4_ADMIN_TOKEN,
  GA4_CACHE_TTL_SECONDS,
  META_PIXEL_ID,
  IS_PRODUCTION,
  IS_DEPLOYMENT,
  GA_TRACKING_ENABLED,
  getGA4ScriptTag,
  getMaskedMeasurementId
};
