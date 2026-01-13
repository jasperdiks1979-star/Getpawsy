const fs = require('fs');
const path = require('path');

const AB_DATA_PATH = path.join(__dirname, '..', 'data', 'ab_testing.json');
const COOKIE_NAME = 'pdpHeroVariant';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const EXPERIMENTS = {
  pdpHero: {
    id: 'pdpHero',
    name: 'PDP Hero: Image vs Video',
    variants: ['A', 'B'],
    variantLabels: { A: 'Image', B: 'Video' },
    split: 50
  }
};

const EVENT_TYPES = ['PDP_VIEW', 'ADD_TO_CART', 'CHECKOUT_START', 'PURCHASE'];

function loadData() {
  try {
    if (fs.existsSync(AB_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(AB_DATA_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[AB Testing] Error loading data:', e.message);
  }
  return { 
    experiments: { pdpHero: { enabled: false } },
    events: [],
    dailyStats: {}
  };
}

function saveData(data) {
  fs.writeFileSync(AB_DATA_PATH, JSON.stringify(data, null, 2));
}

function getExperimentConfig(experimentId) {
  const data = loadData();
  const config = EXPERIMENTS[experimentId];
  if (!config) return null;
  
  return {
    ...config,
    enabled: data.experiments[experimentId]?.enabled || false
  };
}

function setExperimentEnabled(experimentId, enabled) {
  const data = loadData();
  if (!data.experiments[experimentId]) {
    data.experiments[experimentId] = {};
  }
  data.experiments[experimentId].enabled = enabled;
  saveData(data);
  return { ok: true, enabled };
}

function assignVariant(experimentId, existingVariant = null) {
  const config = getExperimentConfig(experimentId);
  if (!config || !config.enabled) {
    return null;
  }
  
  if (existingVariant && config.variants.includes(existingVariant)) {
    return existingVariant;
  }
  
  const rand = Math.random() * 100;
  return rand < config.split ? 'A' : 'B';
}

function recordEvent(experimentId, eventType, variant, productId = null) {
  if (!EVENT_TYPES.includes(eventType)) return false;
  if (!['A', 'B'].includes(variant)) return false;
  
  const data = loadData();
  const today = new Date().toISOString().split('T')[0];
  
  const event = {
    experimentId,
    eventType,
    variant,
    productId,
    timestamp: Date.now()
  };
  
  data.events.push(event);
  
  if (data.events.length > 50000) {
    data.events = data.events.slice(-25000);
  }
  
  const statsKey = `${experimentId}:${today}:${variant}`;
  if (!data.dailyStats[statsKey]) {
    data.dailyStats[statsKey] = {
      PDP_VIEW: 0,
      ADD_TO_CART: 0,
      CHECKOUT_START: 0,
      PURCHASE: 0
    };
  }
  data.dailyStats[statsKey][eventType]++;
  
  saveData(data);
  return true;
}

function getSummary(experimentId, days = 30) {
  const data = loadData();
  const config = EXPERIMENTS[experimentId];
  if (!config) return null;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  
  const summary = {
    A: { PDP_VIEW: 0, ADD_TO_CART: 0, CHECKOUT_START: 0, PURCHASE: 0 },
    B: { PDP_VIEW: 0, ADD_TO_CART: 0, CHECKOUT_START: 0, PURCHASE: 0 }
  };
  
  for (const [key, stats] of Object.entries(data.dailyStats || {})) {
    const [expId, date, variant] = key.split(':');
    if (expId !== experimentId) continue;
    if (date < cutoffStr) continue;
    if (!summary[variant]) continue;
    
    for (const eventType of EVENT_TYPES) {
      summary[variant][eventType] += stats[eventType] || 0;
    }
  }
  
  const calcRate = (numerator, denominator) => 
    denominator > 0 ? ((numerator / denominator) * 100).toFixed(2) : '0.00';
  
  const results = {
    experimentId,
    experimentName: config.name,
    enabled: data.experiments[experimentId]?.enabled || false,
    days,
    variants: {
      A: {
        label: config.variantLabels.A,
        ...summary.A,
        atcRate: calcRate(summary.A.ADD_TO_CART, summary.A.PDP_VIEW),
        checkoutRate: calcRate(summary.A.CHECKOUT_START, summary.A.ADD_TO_CART),
        conversionRate: calcRate(summary.A.PURCHASE, summary.A.PDP_VIEW)
      },
      B: {
        label: config.variantLabels.B,
        ...summary.B,
        atcRate: calcRate(summary.B.ADD_TO_CART, summary.B.PDP_VIEW),
        checkoutRate: calcRate(summary.B.CHECKOUT_START, summary.B.ADD_TO_CART),
        conversionRate: calcRate(summary.B.PURCHASE, summary.B.PDP_VIEW)
      }
    }
  };
  
  const totalA = summary.A.PDP_VIEW;
  const totalB = summary.B.PDP_VIEW;
  if (totalA > 0 && totalB > 0) {
    const atcA = summary.A.ADD_TO_CART / totalA;
    const atcB = summary.B.ADD_TO_CART / totalB;
    results.winner = atcA > atcB ? 'A' : atcB > atcA ? 'B' : 'tie';
    results.lift = ((Math.max(atcA, atcB) / Math.min(atcA, atcB) - 1) * 100).toFixed(1);
  }
  
  return results;
}

function getAllExperiments() {
  const data = loadData();
  return Object.keys(EXPERIMENTS).map(id => ({
    ...EXPERIMENTS[id],
    enabled: data.experiments[id]?.enabled || false
  }));
}

module.exports = {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  EXPERIMENTS,
  EVENT_TYPES,
  getExperimentConfig,
  setExperimentEnabled,
  assignVariant,
  recordEvent,
  getSummary,
  getAllExperiments
};
