const fs = require('fs');
const path = require('path');

const TELEMETRY_FILE = path.join(process.cwd(), 'data', 'autoheal-telemetry.json');
const HOURLY_BUCKETS_TO_KEEP = 48;

const VALID_EVENTS = [
  'image_render_failed',
  'add_to_cart_clicked',
  'add_to_cart_ok',
  'add_to_cart_fail',
  'cart_drawer_render_count',
  'cart_state_mismatch',
  'category_empty_render',
  'page_load',
  'product_view',
  'checkout_started',
  'pdp_not_found',
  'image_placeholder_used',
  'cart_drawer_empty',
  'js_error'
];

let telemetryData = null;

function getHourKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`;
}

function loadTelemetry() {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      telemetryData = JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf-8'));
    } else {
      telemetryData = { hourlyBuckets: {}, totals: {}, lastUpdated: null };
    }
  } catch (err) {
    console.error('[Telemetry] Failed to load:', err.message);
    telemetryData = { hourlyBuckets: {}, totals: {}, lastUpdated: null };
  }
  return telemetryData;
}

function saveTelemetry() {
  try {
    const dir = path.dirname(TELEMETRY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    telemetryData.lastUpdated = new Date().toISOString();
    
    const keys = Object.keys(telemetryData.hourlyBuckets).sort();
    if (keys.length > HOURLY_BUCKETS_TO_KEEP) {
      const toRemove = keys.slice(0, keys.length - HOURLY_BUCKETS_TO_KEEP);
      for (const k of toRemove) {
        delete telemetryData.hourlyBuckets[k];
      }
    }
    
    fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(telemetryData, null, 2));
  } catch (err) {
    console.error('[Telemetry] Failed to save:', err.message);
  }
}

function recordEvent(eventName, metadata = {}) {
  if (!telemetryData) loadTelemetry();
  
  if (!VALID_EVENTS.includes(eventName)) {
    return { ok: false, error: 'INVALID_EVENT_TYPE' };
  }
  
  const hourKey = getHourKey();
  
  if (!telemetryData.hourlyBuckets[hourKey]) {
    telemetryData.hourlyBuckets[hourKey] = {};
  }
  
  if (!telemetryData.hourlyBuckets[hourKey][eventName]) {
    telemetryData.hourlyBuckets[hourKey][eventName] = { count: 0, samples: [] };
  }
  
  telemetryData.hourlyBuckets[hourKey][eventName].count++;
  
  if (telemetryData.hourlyBuckets[hourKey][eventName].samples.length < 10) {
    telemetryData.hourlyBuckets[hourKey][eventName].samples.push({
      ts: new Date().toISOString(),
      ...metadata
    });
  }
  
  if (!telemetryData.totals[eventName]) {
    telemetryData.totals[eventName] = 0;
  }
  telemetryData.totals[eventName]++;
  
  saveTelemetry();
  
  return { ok: true, eventName, hourKey };
}

function recordEvents(events) {
  if (!Array.isArray(events)) {
    return { ok: false, error: 'EVENTS_MUST_BE_ARRAY' };
  }
  
  const results = events.map(evt => {
    if (!evt || !evt.event) {
      return { ok: false, error: 'MISSING_EVENT_NAME' };
    }
    return recordEvent(evt.event, evt.metadata || {});
  });
  
  return {
    ok: results.every(r => r.ok),
    recorded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length
  };
}

function getMetricsSummary(hoursBack = 24) {
  if (!telemetryData) loadTelemetry();
  
  const now = new Date();
  const summary = {
    period: `last_${hoursBack}_hours`,
    generated: new Date().toISOString(),
    metrics: {}
  };
  
  for (const eventName of VALID_EVENTS) {
    summary.metrics[eventName] = {
      count: 0,
      hourlyBreakdown: []
    };
  }
  
  const keys = Object.keys(telemetryData.hourlyBuckets).sort().slice(-hoursBack);
  
  for (const hourKey of keys) {
    const bucket = telemetryData.hourlyBuckets[hourKey];
    for (const eventName of Object.keys(bucket)) {
      if (summary.metrics[eventName]) {
        summary.metrics[eventName].count += bucket[eventName].count;
        summary.metrics[eventName].hourlyBreakdown.push({
          hour: hourKey,
          count: bucket[eventName].count
        });
      }
    }
  }
  
  const addToCartClicked = summary.metrics.add_to_cart_clicked?.count || 0;
  const addToCartOk = summary.metrics.add_to_cart_ok?.count || 0;
  const addToCartFail = summary.metrics.add_to_cart_fail?.count || 0;
  const imageRenderFailed = summary.metrics.image_render_failed?.count || 0;
  const pageLoads = summary.metrics.page_load?.count || 1;
  
  summary.derived = {
    cartSuccessRate: addToCartClicked > 0 
      ? Math.round((addToCartOk / addToCartClicked) * 100) 
      : null,
    cartFailureRate: addToCartClicked > 0 
      ? Math.round((addToCartFail / addToCartClicked) * 100) 
      : null,
    imageFailureRate: pageLoads > 0 
      ? Math.round((imageRenderFailed / pageLoads) * 100) 
      : null,
    cartStateMismatches: summary.metrics.cart_state_mismatch?.count || 0,
    emptyCategories: summary.metrics.category_empty_render?.count || 0
  };
  
  return summary;
}

function getHealthScore() {
  const metrics = getMetricsSummary(24);
  let score = 100;
  let issues = [];
  
  if (metrics.derived.cartSuccessRate !== null && metrics.derived.cartSuccessRate < 95) {
    score -= 20;
    issues.push(`Cart success rate: ${metrics.derived.cartSuccessRate}% (target: 95%)`);
  }
  
  if (metrics.derived.imageFailureRate !== null && metrics.derived.imageFailureRate > 5) {
    score -= 15;
    issues.push(`Image failure rate: ${metrics.derived.imageFailureRate}% (target: <5%)`);
  }
  
  if (metrics.derived.cartStateMismatches > 10) {
    score -= 10;
    issues.push(`Cart state mismatches: ${metrics.derived.cartStateMismatches}`);
  }
  
  if (metrics.derived.emptyCategories > 0) {
    score -= 10;
    issues.push(`Empty category renders: ${metrics.derived.emptyCategories}`);
  }
  
  return {
    score: Math.max(0, score),
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    issues,
    metrics: metrics.derived
  };
}

function clearTelemetry() {
  telemetryData = { hourlyBuckets: {}, totals: {}, lastUpdated: null };
  saveTelemetry();
  return { ok: true };
}

loadTelemetry();

module.exports = {
  recordEvent,
  recordEvents,
  getMetricsSummary,
  getHealthScore,
  clearTelemetry,
  VALID_EVENTS,
  TELEMETRY_FILE
};
