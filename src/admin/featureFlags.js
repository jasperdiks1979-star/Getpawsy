/**
 * Feature Flags System
 * Controls which admin features are enabled
 * Stored in data/feature_flags.json
 */

const fs = require('fs');
const path = require('path');
const { log } = require('../logger');

const FLAGS_FILE = path.join(__dirname, '../../data/feature_flags.json');

const DEFAULT_FLAGS = {
  ENABLE_TRENDING_BADGES: false,
  ENABLE_PAWSY_INSIGHTS: false,
  ENABLE_SEO_STUDIO: false,
  ENABLE_AI_PRICING: false,
  ENABLE_AUTO_FIX_QUEUE: false,
  ENABLE_CATEGORY_MANAGER: true,
  ENABLE_BULK_ACTIONS: true,
  ENABLE_IMPORT_LOGS: true
};

function loadFlags() {
  try {
    if (fs.existsSync(FLAGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(FLAGS_FILE, 'utf8'));
      return { ...DEFAULT_FLAGS, ...data };
    }
  } catch (err) {
    log(`[FeatureFlags] Error loading flags: ${err.message}`);
  }
  return { ...DEFAULT_FLAGS };
}

function saveFlags(flags) {
  try {
    const dir = path.dirname(FLAGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(FLAGS_FILE, JSON.stringify(flags, null, 2));
    return true;
  } catch (err) {
    log(`[FeatureFlags] Error saving flags: ${err.message}`);
    return false;
  }
}

function getFlag(name) {
  if (process.env.FORCE_SAFE_MODE === 'true') {
    const heavyFeatures = ['ENABLE_TRENDING_BADGES', 'ENABLE_PAWSY_INSIGHTS', 'ENABLE_SEO_STUDIO', 'ENABLE_AI_PRICING', 'ENABLE_AUTO_FIX_QUEUE'];
    if (heavyFeatures.includes(name)) return false;
  }
  const flags = loadFlags();
  return flags[name] ?? DEFAULT_FLAGS[name] ?? false;
}

function setFlag(name, value) {
  const flags = loadFlags();
  flags[name] = Boolean(value);
  flags.updatedAt = new Date().toISOString();
  return saveFlags(flags);
}

function getAllFlags() {
  return loadFlags();
}

function getReleaseChecklist() {
  return {
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    CJ_API_KEY: !!process.env.CJ_API_KEY,
    CJ_EMAIL: !!process.env.CJ_EMAIL,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    GA4_MEASUREMENT_ID: !!(process.env.GA4_MEASUREMENT_ID || process.env.GOOGLE_ANALYTICS_ID),
    DATABASE_URL: !!process.env.DATABASE_URL,
    BACKGROUND_JOBS_ENABLED: process.env.ENABLE_BACKGROUND_JOBS !== 'false' && process.env.DISABLE_BACKGROUND_JOBS !== 'true',
    SAFE_MODE: process.env.SAFE_MODE === 'true' || process.env.FORCE_SAFE_MODE === 'true'
  };
}

module.exports = {
  loadFlags,
  saveFlags,
  getFlag,
  setFlag,
  getAllFlags,
  getReleaseChecklist,
  DEFAULT_FLAGS
};
