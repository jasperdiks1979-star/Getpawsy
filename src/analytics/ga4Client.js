const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const ga4Config = require('../config/ga4Config');

let client = null;
let initError = null;
const cache = new Map();
const MAX_CACHE_SIZE = 100;

function parseServiceAccountJson() {
  const jsonStr = ga4Config.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonStr) return null;
  
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.private_key && typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  } catch (e) {
    console.error('[GA4 Client] Failed to parse service account JSON:', e.message);
    return null;
  }
}

function getClient() {
  if (client) return client;
  if (initError) return null;
  
  const credentials = parseServiceAccountJson();
  if (!credentials) {
    initError = 'Invalid or missing GOOGLE_SERVICE_ACCOUNT_JSON';
    return null;
  }
  
  try {
    client = new BetaAnalyticsDataClient({ credentials });
    return client;
  } catch (e) {
    initError = e.message;
    console.error('[GA4 Client] Failed to initialize:', e.message);
    return null;
  }
}

function getMissingConfig() {
  const missing = [];
  if (!ga4Config.GA4_PROPERTY_ID) missing.push('GA4_PROPERTY_ID');
  if (!ga4Config.GOOGLE_SERVICE_ACCOUNT_JSON) missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!ga4Config.GA4_ADMIN_TOKEN) missing.push('GA4_ADMIN_TOKEN');
  return missing;
}

function isEnabled() {
  return getMissingConfig().length === 0;
}

function getCacheKey(endpoint, params) {
  return `${ga4Config.GA4_PROPERTY_ID}:${endpoint}:${JSON.stringify(params)}`;
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, {
    data,
    expires: Date.now() + (ga4Config.GA4_CACHE_TTL_SECONDS * 1000)
  });
}

function clearCache() {
  cache.clear();
  return { cleared: true, timestamp: new Date().toISOString() };
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 28);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}

async function runReport(dimensions, metrics, dateRange, orderBy, limit) {
  const apiClient = getClient();
  if (!apiClient) {
    throw new Error(initError || 'GA4 client not initialized');
  }
  
  const { startDate, endDate } = dateRange || getDefaultDateRange();
  
  const request = {
    property: `properties/${ga4Config.GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: dimensions.map(d => ({ name: d })),
    metrics: metrics.map(m => ({ name: m }))
  };
  
  if (orderBy) {
    request.orderBys = [orderBy];
  }
  
  if (limit) {
    request.limit = limit;
  }
  
  const [response] = await apiClient.runReport(request);
  return response;
}

function parseReportRows(response, dimensions, metrics) {
  if (!response || !response.rows) return [];
  
  return response.rows.map(row => {
    const item = {};
    dimensions.forEach((dim, i) => {
      item[dim] = row.dimensionValues?.[i]?.value || '';
    });
    metrics.forEach((metric, i) => {
      const val = row.metricValues?.[i]?.value || '0';
      item[metric] = /\./.test(val) ? parseFloat(val) : parseInt(val, 10);
    });
    return item;
  });
}

async function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), ms)
    )
  ]);
}

async function getStatus() {
  const missing = getMissingConfig();
  return {
    enabled: missing.length === 0,
    missing,
    cacheTtl: ga4Config.GA4_CACHE_TTL_SECONDS,
    cacheSize: cache.size,
    measurementId: ga4Config.getMaskedMeasurementId(),
    propertyId: ga4Config.GA4_PROPERTY_ID ? `${ga4Config.GA4_PROPERTY_ID.slice(0, 3)}***` : 'Not set',
    environment: ga4Config.IS_PRODUCTION ? 'production' : 'development',
    trackingEnabled: ga4Config.GA_TRACKING_ENABLED
  };
}

async function getSummary(startDate, endDate) {
  if (!isEnabled()) {
    return { ok: false, enabled: false, missing: getMissingConfig(), hint: 'Configure required secrets' };
  }
  
  const cacheKey = getCacheKey('summary', { startDate, endDate });
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  
  const dateRange = startDate && endDate ? { startDate, endDate } : getDefaultDateRange();
  
  const baseMetrics = ['activeUsers', 'sessions', 'screenPageViews'];
  const ecomMetrics = ['ecommercePurchases', 'totalRevenue'];
  
  try {
    const response = await withTimeout(runReport([], baseMetrics, dateRange));
    const result = {
      ok: true,
      dateRange,
      metrics: {},
      supportedMetrics: baseMetrics
    };
    
    if (response.rows && response.rows[0]) {
      baseMetrics.forEach((m, i) => {
        const val = response.rows[0].metricValues?.[i]?.value || '0';
        result.metrics[m] = /\./.test(val) ? parseFloat(val) : parseInt(val, 10);
      });
    }
    
    try {
      const ecomResponse = await withTimeout(runReport([], ecomMetrics, dateRange));
      if (ecomResponse.rows && ecomResponse.rows[0]) {
        ecomMetrics.forEach((m, i) => {
          const val = ecomResponse.rows[0].metricValues?.[i]?.value || '0';
          result.metrics[m] = /\./.test(val) ? parseFloat(val) : parseInt(val, 10);
        });
        result.supportedMetrics.push(...ecomMetrics);
      }
    } catch (e) {
      result.ecomNote = 'E-commerce metrics not available';
    }
    
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    return { ok: false, error: e.message, hint: 'Check GA4 property access permissions' };
  }
}

async function getTimeseries(startDate, endDate) {
  if (!isEnabled()) {
    return { ok: false, enabled: false, missing: getMissingConfig(), hint: 'Configure required secrets' };
  }
  
  const cacheKey = getCacheKey('timeseries', { startDate, endDate });
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  
  const dateRange = startDate && endDate ? { startDate, endDate } : getDefaultDateRange();
  const metrics = ['activeUsers', 'sessions', 'screenPageViews'];
  
  try {
    const response = await withTimeout(runReport(['date'], metrics, dateRange, {
      dimension: { dimensionName: 'date' }
    }));
    
    const result = {
      ok: true,
      dateRange,
      data: parseReportRows(response, ['date'], metrics)
    };
    
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    return { ok: false, error: e.message, hint: 'Check GA4 property access' };
  }
}

async function getTopPages(startDate, endDate, limit = 20) {
  if (!isEnabled()) {
    return { ok: false, enabled: false, missing: getMissingConfig(), hint: 'Configure required secrets' };
  }
  
  const cacheKey = getCacheKey('topPages', { startDate, endDate, limit });
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  
  const dateRange = startDate && endDate ? { startDate, endDate } : getDefaultDateRange();
  const metrics = ['screenPageViews', 'sessions'];
  
  try {
    const response = await withTimeout(runReport(['pagePath'], metrics, dateRange, {
      metric: { metricName: 'screenPageViews' },
      desc: true
    }, limit));
    
    const result = {
      ok: true,
      dateRange,
      data: parseReportRows(response, ['pagePath'], metrics)
    };
    
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    return { ok: false, error: e.message, hint: 'Check GA4 property access' };
  }
}

async function getSources(startDate, endDate, limit = 20) {
  if (!isEnabled()) {
    return { ok: false, enabled: false, missing: getMissingConfig(), hint: 'Configure required secrets' };
  }
  
  const cacheKey = getCacheKey('sources', { startDate, endDate, limit });
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  
  const dateRange = startDate && endDate ? { startDate, endDate } : getDefaultDateRange();
  const dimensions = ['sessionSource', 'sessionMedium'];
  const metrics = ['sessions', 'activeUsers'];
  
  try {
    const response = await withTimeout(runReport(dimensions, metrics, dateRange, {
      metric: { metricName: 'sessions' },
      desc: true
    }, limit));
    
    const result = {
      ok: true,
      dateRange,
      data: parseReportRows(response, dimensions, metrics)
    };
    
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    return { ok: false, error: e.message, hint: 'Check GA4 property access' };
  }
}

async function getTopProducts(startDate, endDate, limit = 20) {
  if (!isEnabled()) {
    return { ok: false, enabled: false, missing: getMissingConfig(), hint: 'Configure required secrets' };
  }
  
  const cacheKey = getCacheKey('topProducts', { startDate, endDate, limit });
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  
  const dateRange = startDate && endDate ? { startDate, endDate } : getDefaultDateRange();
  const dimensions = ['itemName', 'itemId'];
  const baseMetrics = ['itemsViewed', 'itemsAddedToCart'];
  const ecomMetrics = ['itemsPurchased', 'itemRevenue'];
  
  try {
    const response = await withTimeout(runReport(dimensions, baseMetrics, dateRange, {
      metric: { metricName: 'itemsViewed' },
      desc: true
    }, limit));
    
    const result = {
      ok: true,
      dateRange,
      data: parseReportRows(response, dimensions, baseMetrics),
      supportedMetrics: baseMetrics
    };
    
    try {
      const ecomResponse = await withTimeout(runReport(dimensions, ecomMetrics, dateRange, {
        metric: { metricName: 'itemsPurchased' },
        desc: true
      }, limit));
      
      const ecomData = parseReportRows(ecomResponse, dimensions, ecomMetrics);
      result.data = result.data.map(item => {
        const ecom = ecomData.find(e => e.itemId === item.itemId) || {};
        return { ...item, ...ecom };
      });
      result.supportedMetrics.push(...ecomMetrics);
    } catch (e) {
      result.ecomNote = 'E-commerce product metrics not available';
    }
    
    setCache(cacheKey, result);
    return result;
  } catch (e) {
    return { ok: false, error: e.message, hint: 'Check GA4 e-commerce setup' };
  }
}

module.exports = {
  isEnabled,
  getMissingConfig,
  clearCache,
  getStatus,
  getSummary,
  getTimeseries,
  getTopPages,
  getSources,
  getTopProducts
};
