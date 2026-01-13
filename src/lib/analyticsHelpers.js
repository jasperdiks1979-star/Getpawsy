/**
 * Analytics Helpers for GetPawsy
 * Product category lookup, Pawsy conversion tracking, and analytics aggregation
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CATEGORY_CONFIG = require('../config/categories').CATEGORY_CONFIG;

const ANALYTICS_DIR = path.join(__dirname, '../../data');
const EVENTS_FILE = path.join(ANALYTICS_DIR, 'analytics_events.jsonl');
const PAWSY_EVENTS_FILE = path.join(ANALYTICS_DIR, 'pawsy_events.jsonl');

let productsCache = null;
let productsCacheTime = 0;
const CACHE_TTL = 60000;

function loadProductsCache() {
  const now = Date.now();
  if (productsCache && now - productsCacheTime < CACHE_TTL) {
    return productsCache;
  }
  
  try {
    const productsPath = path.join(ANALYTICS_DIR, 'products.json');
    const data = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
    productsCache = data.products || [];
    productsCacheTime = now;
    return productsCache;
  } catch (err) {
    console.error('[Analytics] Error loading products:', err.message);
    return [];
  }
}

function getProductCategory(productId) {
  const products = loadProductsCache();
  const product = products.find(p => p.id === productId);
  
  if (!product) {
    return { petType: 'unknown', category: 'uncategorized', subcategory: null };
  }
  
  let petType = 'unknown';
  if (product.pet_usage === 'dog' || product.petType === 'dog') {
    petType = 'dogs';
  } else if (product.pet_usage === 'cat' || product.petType === 'cat') {
    petType = 'cats';
  } else if (product.is_pet === true) {
    const text = ((product.title || '') + ' ' + (product.tags || []).join(' ')).toLowerCase();
    if (text.includes('dog') || text.includes('puppy')) petType = 'dogs';
    else if (text.includes('cat') || text.includes('kitten')) petType = 'cats';
  }
  
  let category = product.category || 'uncategorized';
  let subcategory = product.pet_bucket || null;
  
  const catConfig = petType !== 'unknown' ? CATEGORY_CONFIG[petType] : null;
  if (catConfig && subcategory) {
    const matchedCat = catConfig.categories.find(c => 
      c.id.includes(subcategory) || c.keywords?.some(k => subcategory.includes(k))
    );
    if (matchedCat) {
      category = matchedCat.title;
    }
  }
  
  return { petType, category, subcategory };
}

function logEvent(eventName, payload = {}) {
  const event = {
    eventName,
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
    ...payload
  };
  
  const targetFile = eventName.startsWith('pawsy_') ? PAWSY_EVENTS_FILE : EVENTS_FILE;
  
  try {
    fs.appendFileSync(targetFile, JSON.stringify(event) + '\n');
    return true;
  } catch (err) {
    console.error(`[Analytics] Error logging ${eventName}:`, err.message);
    return false;
  }
}

async function* readEventsStream(filePath, options = {}) {
  const { startTime, endTime, eventNames } = options;
  
  if (!fs.existsSync(filePath)) {
    return;
  }
  
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  
  for await (const line of rl) {
    try {
      const event = JSON.parse(line);
      
      if (startTime && event.timestamp < startTime) continue;
      if (endTime && event.timestamp > endTime) continue;
      if (eventNames && !eventNames.includes(event.eventName)) continue;
      
      yield event;
    } catch (e) {
    }
  }
}

async function aggregateCategoryMetrics(range = '7d') {
  const now = Date.now();
  const rangeMs = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  }[range] || 7 * 24 * 60 * 60 * 1000;
  
  const startTime = now - rangeMs;
  
  const views = {};
  const atc = {};
  
  for await (const event of readEventsStream(EVENTS_FILE, { 
    startTime, 
    eventNames: ['view_item', 'add_to_cart', 'view_product'] 
  })) {
    const productId = event.productId || event.product_id;
    if (!productId) continue;
    
    const { petType, category, subcategory } = event.category 
      ? event 
      : getProductCategory(productId);
    
    const key = `${petType}|${category}|${subcategory || 'all'}`;
    
    if (event.eventName === 'view_item' || event.eventName === 'view_product') {
      if (!views[key]) views[key] = {};
      views[key][productId] = (views[key][productId] || 0) + 1;
    }
    
    if (event.eventName === 'add_to_cart') {
      if (!atc[key]) atc[key] = {};
      atc[key][productId] = (atc[key][productId] || 0) + 1;
    }
  }
  
  const topByCategory = {};
  const products = loadProductsCache();
  
  for (const key of [...new Set([...Object.keys(views), ...Object.keys(atc)])]) {
    const viewsData = views[key] || {};
    const atcData = atc[key] || {};
    
    const topViewed = Object.entries(viewsData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => {
        const p = products.find(pr => pr.id === id);
        return { id, count, title: p?.title, image: p?.image };
      });
    
    const topAtc = Object.entries(atcData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => {
        const p = products.find(pr => pr.id === id);
        return { id, count, title: p?.title, image: p?.image };
      });
    
    topByCategory[key] = { views: topViewed, atc: topAtc };
  }
  
  return { range, topByCategory, generated: new Date().toISOString() };
}

async function aggregatePawsyMetrics(range = '7d') {
  const now = Date.now();
  const rangeMs = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  }[range] || 7 * 24 * 60 * 60 * 1000;
  
  const startTime = now - rangeMs;
  
  const funnel = {
    pawsy_open: 0,
    pawsy_message: 0,
    pawsy_products_shown: 0,
    pawsy_product_click: 0,
    pawsy_atc: 0,
    pawsy_checkout: 0,
    pawsy_purchase: 0
  };
  
  const productClicks = {};
  const productAtc = {};
  const sessions = new Set();
  const messageIntents = {};
  
  for await (const event of readEventsStream(PAWSY_EVENTS_FILE, { startTime })) {
    if (event.gp_sid) sessions.add(event.gp_sid);
    
    switch (event.eventName) {
      case 'pawsy_open':
        funnel.pawsy_open++;
        break;
      case 'pawsy_message':
        funnel.pawsy_message++;
        if (event.intent) {
          messageIntents[event.intent] = (messageIntents[event.intent] || 0) + 1;
        }
        break;
      case 'pawsy_products_shown':
        funnel.pawsy_products_shown++;
        break;
      case 'pawsy_product_click':
        funnel.pawsy_product_click++;
        if (event.productId) {
          productClicks[event.productId] = (productClicks[event.productId] || 0) + 1;
        }
        break;
      case 'pawsy_atc':
        funnel.pawsy_atc++;
        if (event.productId) {
          productAtc[event.productId] = (productAtc[event.productId] || 0) + 1;
        }
        break;
      case 'pawsy_checkout':
        funnel.pawsy_checkout++;
        break;
      case 'pawsy_purchase':
        funnel.pawsy_purchase++;
        break;
    }
  }
  
  const products = loadProductsCache();
  
  const topClickedProducts = Object.entries(productClicks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => {
      const p = products.find(pr => pr.id === id);
      return { id, count, title: p?.title, image: p?.image };
    });
  
  const topAtcProducts = Object.entries(productAtc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => {
      const p = products.find(pr => pr.id === id);
      return { id, count, title: p?.title, image: p?.image };
    });
  
  const conversionRates = {
    open_to_message: funnel.pawsy_open > 0 
      ? ((funnel.pawsy_message / funnel.pawsy_open) * 100).toFixed(1) + '%' 
      : '0%',
    message_to_products: funnel.pawsy_message > 0 
      ? ((funnel.pawsy_products_shown / funnel.pawsy_message) * 100).toFixed(1) + '%' 
      : '0%',
    products_to_click: funnel.pawsy_products_shown > 0 
      ? ((funnel.pawsy_product_click / funnel.pawsy_products_shown) * 100).toFixed(1) + '%' 
      : '0%',
    click_to_atc: funnel.pawsy_product_click > 0 
      ? ((funnel.pawsy_atc / funnel.pawsy_product_click) * 100).toFixed(1) + '%' 
      : '0%',
    atc_to_purchase: funnel.pawsy_atc > 0 
      ? ((funnel.pawsy_purchase / funnel.pawsy_atc) * 100).toFixed(1) + '%' 
      : '0%'
  };
  
  return {
    range,
    funnel,
    conversionRates,
    uniqueSessions: sessions.size,
    topClickedProducts,
    topAtcProducts,
    messageIntents: Object.entries(messageIntents)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([intent, count]) => ({ intent, count })),
    generated: new Date().toISOString()
  };
}

let categoryMetricsCache = null;
let categoryMetricsCacheTime = 0;
let pawsyMetricsCache = null;
let pawsyMetricsCacheTime = 0;
const METRICS_CACHE_TTL = 5 * 60 * 1000;

async function getCachedCategoryMetrics(range) {
  const now = Date.now();
  const cacheKey = `cat_${range}`;
  
  if (categoryMetricsCache?.key === cacheKey && now - categoryMetricsCacheTime < METRICS_CACHE_TTL) {
    return categoryMetricsCache.data;
  }
  
  const data = await aggregateCategoryMetrics(range);
  categoryMetricsCache = { key: cacheKey, data };
  categoryMetricsCacheTime = now;
  return data;
}

async function getCachedPawsyMetrics(range) {
  const now = Date.now();
  const cacheKey = `paw_${range}`;
  
  if (pawsyMetricsCache?.key === cacheKey && now - pawsyMetricsCacheTime < METRICS_CACHE_TTL) {
    return pawsyMetricsCache.data;
  }
  
  const data = await aggregatePawsyMetrics(range);
  pawsyMetricsCache = { key: cacheKey, data };
  pawsyMetricsCacheTime = now;
  return data;
}

module.exports = {
  getProductCategory,
  logEvent,
  aggregateCategoryMetrics,
  aggregatePawsyMetrics,
  getCachedCategoryMetrics,
  getCachedPawsyMetrics
};
