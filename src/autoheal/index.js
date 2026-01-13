const { AUTOHEAL_CONFIG, FIX_ACTIONS, ALLOWED_FIX_ACTIONS } = require('./types');
const { collectDiagnostics, recordMetric, getMetrics } = require('./diagnostics');
const { runTriage, bufferLog, getRecentLogs } = require('./triage');
const { runFix, applySafeFixes } = require('./fixRunner');
const { runPlaywrightTests } = require('./playwrightRunner');
const {
  saveReport,
  loadReport,
  saveTriage,
  loadTriage,
  getFixLogTail,
  listScreenshots,
  AUTOHEAL_DIR,
  SCREENSHOTS_DIR
} = require('./storage');
const { SAFE_ACTIONS, isActionAllowed, isSafeAction, getActionDescription } = require('./allowlist');
const { 
  getSettings, 
  getEffectiveConfig, 
  updateSettings, 
  setKillSwitch,
  canApplyFixes,
  isKillSwitchActive 
} = require('./settings');
const { 
  recordEvent, 
  recordEvents, 
  getMetricsSummary, 
  getHealthScore,
  VALID_EVENTS 
} = require('./telemetry');
const { runSyntheticProbe, loadProbeResults } = require('./probe');
const { createSnapshot, loadSnapshot, listSnapshots, generateRunId } = require('./snapshots');
const { startScheduler, stopScheduler, getSchedulerStatus } = require('./scheduler');

module.exports = {
  AUTOHEAL_CONFIG,
  FIX_ACTIONS,
  ALLOWED_FIX_ACTIONS,
  SAFE_ACTIONS,
  
  collectDiagnostics,
  recordMetric,
  getMetrics,
  
  runTriage,
  bufferLog,
  getRecentLogs,
  
  runFix,
  applySafeFixes,
  
  runPlaywrightTests,
  
  saveReport,
  loadReport,
  saveTriage,
  loadTriage,
  getFixLogTail,
  listScreenshots,
  
  isActionAllowed,
  isSafeAction,
  getActionDescription,
  
  getSettings,
  getEffectiveConfig,
  updateSettings,
  setKillSwitch,
  canApplyFixes,
  isKillSwitchActive,
  
  recordEvent,
  recordEvents,
  getMetricsSummary,
  getHealthScore,
  VALID_EVENTS,
  
  runSyntheticProbe,
  loadProbeResults,
  
  createSnapshot,
  loadSnapshot,
  listSnapshots,
  generateRunId,
  
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  
  AUTOHEAL_DIR,
  SCREENSHOTS_DIR
};
