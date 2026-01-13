/**
 * Safe Boot Module
 * Controls startup behavior for production deployments
 * 
 * Environment Variables:
 * - SAFE_MODE: 0/1 - Production safe mode (no DB migrations, no destructive ops) - default OFF
 * - HARD_SAFE_MODE: 0/1 - Emergency mode (disables ALL background jobs + AI) - use when publishing fails
 * - SAFE_BOOT: 0/1 - Alias for SAFE_MODE (backward compatibility)
 * - ENABLE_BACKGROUND_JOBS: 0/1 - Enable background jobs (default: true when safeMode is false)
 * - DISABLE_BACKGROUND_JOBS: 0/1 - Disable all background jobs
 * - ALLOW_JOBS_IN_SAFE_MODE: 0/1 - Allow jobs to run even in safe mode (debug override)
 * - REPLIT_DEPLOYMENT: Set by Replit during deployment
 * - JOB_START_DELAY_MS: Base delay before starting jobs (default: 12000)
 * - JOB_START_JITTER_MS: Random jitter added to delay (default: 4000)
 * - DISABLE_IMAGETEXT: 0/1 - Disable ImageText analyzer
 * - MIGRATIONS_MODE: on/off - Database migrations (default: off in production)
 */

const { log } = require('../logger');

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase().trim();
  if (str === '1' || str === 'true' || str === 'yes' || str === 'on') return true;
  if (str === '0' || str === 'false' || str === 'no' || str === 'off') return false;
  return defaultValue;
}

function parseNumber(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

function isDeployment() {
  return !!(
    process.env.REPLIT_DEPLOYMENT === '1' ||
    process.env.REPLIT_DEPLOYMENT === 'true' ||
    process.env.REPLIT_DEPLOYMENT_ID
  );
}

function isSafeBoot() {
  const explicit = process.env.SAFE_BOOT || process.env.SAFE_MODE;
  if (explicit !== undefined && explicit !== '') {
    return parseBool(explicit, false);
  }
  return false;
}

function isSafeMode() {
  const explicit = process.env.SAFE_MODE || process.env.SAFE_BOOT;
  if (explicit !== undefined && explicit !== '') {
    return parseBool(explicit, false);
  }
  return false;
}

function isHardSafeMode() {
  return parseBool(process.env.HARD_SAFE_MODE, false);
}

function migrationsEnabled() {
  if (isHardSafeMode()) return false;
  if (isSafeMode()) return false;
  
  const disableDbMigrations = process.env.DISABLE_DB_MIGRATIONS !== 'false';
  if (disableDbMigrations) return false;
  
  const explicit = process.env.MIGRATIONS_MODE;
  if (explicit !== undefined && explicit !== '') {
    return explicit.toLowerCase() === 'on';
  }
  return !isDeployment();
}

function jobsDisabled() {
  if (isHardSafeMode()) return true;
  return parseBool(process.env.DISABLE_BACKGROUND_JOBS, false);
}

function jobsEnabled() {
  if (jobsDisabled()) return false;
  
  if (parseBool(process.env.ALLOW_JOBS_IN_SAFE_MODE, false)) {
    return true;
  }
  
  if (isSafeBoot()) return false;
  
  return true;
}

function imageTextDisabled() {
  if (isHardSafeMode()) return true;
  return parseBool(process.env.DISABLE_IMAGETEXT, false);
}

function getJobStartDelay() {
  return parseNumber(process.env.JOB_START_DELAY_MS, 12000);
}

function getJobStartJitter() {
  return parseNumber(process.env.JOB_START_JITTER_MS, 4000);
}

function getEnvVarsSeen() {
  return {
    SAFE_MODE: process.env.SAFE_MODE || 'missing',
    HARD_SAFE_MODE: process.env.HARD_SAFE_MODE || 'missing',
    ENABLE_BACKGROUND_JOBS: process.env.ENABLE_BACKGROUND_JOBS || 'missing',
    DISABLE_BACKGROUND_JOBS: process.env.DISABLE_BACKGROUND_JOBS || 'missing',
    ALLOW_JOBS_IN_SAFE_MODE: process.env.ALLOW_JOBS_IN_SAFE_MODE || 'missing',
    AUTO_RUN_ON_START: process.env.AUTO_RUN_ON_START || 'missing',
    AUTO_RUN_DAILY: process.env.AUTO_RUN_DAILY || 'missing',
    REPLIT_DEPLOYMENT: process.env.REPLIT_DEPLOYMENT || 'missing',
    REPLIT_DEPLOYMENT_ID: process.env.REPLIT_DEPLOYMENT_ID ? 'set' : 'missing'
  };
}

function logBootStatus() {
  const envVars = getEnvVarsSeen();
  const status = {
    safeMode: isSafeMode(),
    hardSafeMode: isHardSafeMode(),
    safeBoot: isSafeBoot(),
    deployment: isDeployment(),
    jobsEnabled: jobsEnabled(),
    jobsDisabled: jobsDisabled(),
    migrationsEnabled: migrationsEnabled(),
    imageTextDisabled: imageTextDisabled(),
    jobStartDelay: getJobStartDelay(),
    jobStartJitter: getJobStartJitter()
  };
  
  log(`[SafeBoot] Env vars: ${JSON.stringify(envVars)}`);
  log(`[SafeBoot] Status: ${JSON.stringify(status)}`);
  
  if (isHardSafeMode()) {
    log('[SafeBoot] 🚨 HARD SAFE MODE — ALL background jobs + AI + migrations DISABLED');
  } else if (isSafeMode()) {
    log('[SafeBoot] 🔒 SAFE MODE — Database migrations disabled, background jobs limited');
  }
  
  if (!migrationsEnabled()) {
    log('[SafeBoot] 📦 Migrations OFF — No schema changes at startup');
  }
  
  if (jobsEnabled()) {
    log('[SafeBoot] ✅ Background jobs ENABLED');
  } else {
    log('[SafeBoot] ❌ Background jobs DISABLED');
  }
  
  return status;
}

function getBootStatus() {
  return {
    safeMode: isSafeMode(),
    hardSafeMode: isHardSafeMode(),
    deployment: isDeployment(),
    jobsEnabled: jobsEnabled(),
    migrationsEnabled: migrationsEnabled(),
    imageTextDisabled: imageTextDisabled(),
    envVarsSeen: getEnvVarsSeen()
  };
}

module.exports = {
  parseBool,
  parseNumber,
  isDeployment,
  isSafeBoot,
  isSafeMode,
  isHardSafeMode,
  migrationsEnabled,
  jobsEnabled,
  jobsDisabled,
  imageTextDisabled,
  getJobStartDelay,
  getJobStartJitter,
  logBootStatus,
  getBootStatus,
  getEnvVarsSeen
};
