const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'autoheal-settings.json');

const DEFAULT_SETTINGS = {
  enabled: false,
  level: 0,
  killSwitch: false,
  probeBrowser: false,
  intervalSeconds: 300,
  maxChangesPerRun: 25,
  maxProductsPerRun: 50,
  deploymentLockdown: true,
  lastUpdated: null,
  lastUpdatedBy: 'system'
};

let cachedSettings = null;

function getEnvironmentFlags() {
  const isProd = process.env.NODE_ENV === 'production';
  const isDeploy = process.env.REPLIT_DEPLOYMENT === '1';
  const lockdownEnv = process.env.AUTOHEAL_DEPLOYMENT_MODE_LOCKDOWN;
  const lockdownEnabled = lockdownEnv === undefined ? true : lockdownEnv === 'true';
  const isLockdown = (isProd || isDeploy) && lockdownEnabled;
  
  return {
    isProd,
    isDeploy,
    lockdownEnabled,
    isLockdown,
    nodeEnv: process.env.NODE_ENV || 'development'
  };
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      cachedSettings = { ...DEFAULT_SETTINGS, ...data };
    } else {
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  } catch (err) {
    console.error('[AutoHeal Settings] Failed to load:', err.message);
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

function saveSettings(settings) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cachedSettings = {
      ...cachedSettings,
      ...settings,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cachedSettings, null, 2));
    return { ok: true, settings: cachedSettings };
  } catch (err) {
    console.error('[AutoHeal Settings] Failed to save:', err.message);
    return { ok: false, error: err.message };
  }
}

function getSettings() {
  if (!cachedSettings) {
    loadSettings();
  }
  return { ...cachedSettings };
}

function getEffectiveConfig() {
  const settings = getSettings();
  const envFlags = getEnvironmentFlags();
  
  let effectiveLevel = settings.level;
  let effectiveProbeBrowser = settings.probeBrowser;
  let effectiveEnabled = settings.enabled;
  
  if (envFlags.isLockdown) {
    effectiveLevel = Math.min(effectiveLevel, 1);
    effectiveProbeBrowser = false;
  }
  
  if (settings.killSwitch) {
    effectiveEnabled = false;
  }
  
  const envOverrides = {
    enabled: process.env.AUTOHEAL_ENABLED,
    level: process.env.AUTOHEAL_LEVEL,
    intervalSeconds: process.env.AUTOHEAL_INTERVAL_SEC,
    maxChangesPerRun: process.env.AUTOHEAL_MAX_CHANGES,
    maxProductsPerRun: process.env.AUTOHEAL_MAX_PRODUCTS,
    probeBrowser: process.env.AUTOHEAL_PROBE_BROWSER
  };
  
  if (envOverrides.enabled !== undefined) {
    effectiveEnabled = envOverrides.enabled === 'true';
    if (settings.killSwitch) effectiveEnabled = false;
  }
  if (envOverrides.level !== undefined) {
    const parsedLevel = parseInt(envOverrides.level, 10);
    if (!isNaN(parsedLevel) && envOverrides.level.trim().match(/^[0-2]$/)) {
      effectiveLevel = parsedLevel;
      if (envFlags.isLockdown) effectiveLevel = Math.min(effectiveLevel, 1);
    }
  }
  if (envOverrides.probeBrowser !== undefined) {
    effectiveProbeBrowser = envOverrides.probeBrowser === 'true';
    if (envFlags.isLockdown) effectiveProbeBrowser = false;
  }
  
  return {
    enabled: effectiveEnabled,
    level: effectiveLevel,
    killSwitch: settings.killSwitch,
    probeBrowser: effectiveProbeBrowser,
    intervalSeconds: parseInt(envOverrides.intervalSeconds || settings.intervalSeconds, 10),
    maxChangesPerRun: parseInt(envOverrides.maxChangesPerRun || settings.maxChangesPerRun, 10),
    maxProductsPerRun: parseInt(envOverrides.maxProductsPerRun || settings.maxProductsPerRun, 10),
    deploymentLockdown: settings.deploymentLockdown,
    environment: envFlags,
    storedSettings: settings
  };
}

function setKillSwitch(active, by = 'admin') {
  return saveSettings({
    killSwitch: !!active,
    lastUpdatedBy: by
  });
}

function updateSettings(updates, by = 'admin') {
  const allowed = ['enabled', 'level', 'probeBrowser', 'intervalSeconds', 
                   'maxChangesPerRun', 'maxProductsPerRun', 'deploymentLockdown'];
  const filtered = {};
  
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'level') {
        filtered[key] = Math.max(0, Math.min(2, parseInt(updates[key], 10)));
      } else if (['intervalSeconds', 'maxChangesPerRun', 'maxProductsPerRun'].includes(key)) {
        filtered[key] = Math.max(1, parseInt(updates[key], 10));
      } else if (typeof updates[key] === 'boolean') {
        filtered[key] = updates[key];
      } else {
        filtered[key] = updates[key];
      }
    }
  }
  
  filtered.lastUpdatedBy = by;
  return saveSettings(filtered);
}

function isKillSwitchActive() {
  const settings = getSettings();
  return settings.killSwitch === true;
}

function canApplyFixes() {
  const config = getEffectiveConfig();
  const applyEnabled = process.env.AUTOHEAL_APPLY_ENABLED === 'true';
  
  if (config.killSwitch) return { allowed: false, reason: 'KILL_SWITCH_ACTIVE' };
  if (config.level < 2) return { allowed: false, reason: 'LEVEL_BELOW_2', hint: 'Level 2 required to apply fixes' };
  if (!applyEnabled) return { allowed: false, reason: 'AUTOHEAL_APPLY_DISABLED', hint: 'Set AUTOHEAL_APPLY_ENABLED=true in secrets' };
  return { allowed: true };
}

function loadPolicy() {
  try {
    const policyPath = require('path').join(process.cwd(), 'config', 'autoheal.policy.json');
    if (require('fs').existsSync(policyPath)) {
      return JSON.parse(require('fs').readFileSync(policyPath, 'utf-8'));
    }
  } catch (e) {
    console.error('[AutoHeal] Failed to load policy:', e.message);
  }
  return { mode: 'suggest_only', rules: [], maxActionsPerRun: 3 };
}

function isActionAllowed(actionName) {
  const policy = loadPolicy();
  const rule = policy.rules.find(r => r.action === actionName);
  if (!rule) return { allowed: false, reason: 'ACTION_NOT_IN_POLICY' };
  if (!rule.allowed) return { allowed: false, reason: 'ACTION_DISALLOWED_BY_POLICY', risk: rule.risk };
  return { allowed: true, requiresApproval: rule.requiresApproval, risk: rule.risk };
}

loadSettings();

module.exports = {
  getSettings,
  saveSettings,
  updateSettings,
  getEffectiveConfig,
  setKillSwitch,
  isKillSwitchActive,
  canApplyFixes,
  isActionAllowed,
  loadPolicy,
  getEnvironmentFlags,
  DEFAULT_SETTINGS,
  SETTINGS_FILE
};
