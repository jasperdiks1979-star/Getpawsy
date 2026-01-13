const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const { requireAdminSession } = require('../adminAuth');
const {
  collectDiagnostics,
  runTriage,
  runFix,
  applySafeFixes,
  runPlaywrightTests,
  loadReport,
  loadTriage,
  getFixLogTail,
  listScreenshots,
  ALLOWED_FIX_ACTIONS,
  SCREENSHOTS_DIR
} = require('./index');
const { 
  getSettings, 
  getEffectiveConfig, 
  updateSettings, 
  setKillSwitch,
  canApplyFixes,
  isKillSwitchActive,
  isActionAllowed,
  loadPolicy
} = require('./settings');
const { isPlaywrightAvailable } = require('./probe');
const { 
  recordEvent, 
  recordEvents, 
  getMetricsSummary, 
  getHealthScore,
  VALID_EVENTS
} = require('./telemetry');
const { runSyntheticProbe, loadProbeResults } = require('./probe');
const { listSnapshots, loadSnapshot } = require('./snapshots');
const { 
  startScheduler, 
  stopScheduler, 
  getSchedulerStatus 
} = require('./scheduler');

const rateLimitStore = new Map();

function rateLimit(maxRequests = 30, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!rateLimitStore.has(ip)) {
      rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    
    const record = rateLimitStore.get(ip);
    
    if (now > record.resetAt) {
      rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({
        ok: false,
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((record.resetAt - now) / 1000)
      });
    }
    
    record.count++;
    next();
  };
}

function checkKillSwitch(req, res, next) {
  if (isKillSwitchActive()) {
    return res.status(409).json({
      ok: false,
      error: 'KILL_SWITCH_ACTIVE',
      hint: 'Auto-healer is in emergency stop mode. Disable kill switch to apply fixes.'
    });
  }
  next();
}

let testsRunning = false;
let probeRunning = false;

router.get('/state', requireAdminSession, async (req, res) => {
  const config = getEffectiveConfig();
  const scheduler = getSchedulerStatus();
  const healthScore = getHealthScore();
  const metricsSummary = getMetricsSummary(1);
  
  const env = config.environment || {};
  const isProd = env.isProd || process.env.NODE_ENV === 'production';
  const isDeploy = env.isDeploy || !!process.env.REPLIT_DEPLOYMENT;
  const lockdownActive = isDeploy && config.level > 1;
  const applyBlocked = config.killSwitch || config.level < 1;
  const allowedMaxLevel = isDeploy ? 1 : 2;
  
  let productMetrics = { total: 0, approved: 0, blocked: 0, missingImages: 0 };
  try {
    const diagnostics = await collectDiagnostics();
    if (diagnostics && diagnostics.products) {
      productMetrics = {
        total: diagnostics.products.total || 0,
        approved: diagnostics.products.approved || 0,
        blocked: diagnostics.products.blocked || 0,
        missingImages: diagnostics.images?.missing || 0
      };
    }
  } catch (e) {
    console.error('[AutoHeal] Failed to get product metrics:', e.message);
  }
  
  const metrics = {
    productsTotal: productMetrics.total,
    approved: productMetrics.approved,
    blocked: productMetrics.blocked,
    missingImages: productMetrics.missingImages,
    uptimeSeconds: Math.floor(process.uptime()),
    lastAutohealAt: scheduler.lastRunTime,
    cartAddFails: metricsSummary.metrics?.add_to_cart_fail?.count || 0,
    cartClicks: metricsSummary.metrics?.add_to_cart_clicked?.count || 0,
    imageFailures: metricsSummary.metrics?.image_render_failed?.count || 0,
    pageLoads: metricsSummary.metrics?.page_load?.count || 0
  };
  
  res.json({
    ok: true,
    settings: {
      autoheal_enabled: config.enabled,
      autoheal_level: config.level,
      autoheal_kill_switch: config.killSwitch,
      autoheal_probe_browser: config.probeBrowser,
      autoheal_interval_seconds: config.intervalSeconds,
      autoheal_max_changes: config.maxChangesPerRun,
      autoheal_max_products: config.maxProductsPerRun
    },
    derived: {
      isProd,
      isDeploy,
      lockdownActive,
      applyBlocked,
      allowedMaxLevel,
      applyEnabled: process.env.AUTOHEAL_APPLY_ENABLED === 'true',
      playwrightAvailable: isPlaywrightAvailable()
    },
    policy: loadPolicy(),
    metrics,
    state: {
      enabled: config.enabled,
      level: config.level,
      killSwitch: config.killSwitch,
      probeBrowser: config.probeBrowser,
      intervalSeconds: config.intervalSeconds,
      maxChangesPerRun: config.maxChangesPerRun,
      maxProductsPerRun: config.maxProductsPerRun
    },
    environment: config.environment,
    scheduler,
    healthScore,
    allowedActions: ALLOWED_FIX_ACTIONS,
    testsRunning,
    probeRunning
  });
});

router.post('/state', requireAdminSession, (req, res) => {
  const { enabled, level, probeBrowser, intervalSeconds, maxChangesPerRun, maxProductsPerRun } = req.body || {};
  
  const updates = {};
  if (enabled !== undefined) updates.enabled = !!enabled;
  if (level !== undefined) updates.level = parseInt(level, 10);
  if (probeBrowser !== undefined) updates.probeBrowser = !!probeBrowser;
  if (intervalSeconds !== undefined) updates.intervalSeconds = parseInt(intervalSeconds, 10);
  if (maxChangesPerRun !== undefined) updates.maxChangesPerRun = parseInt(maxChangesPerRun, 10);
  if (maxProductsPerRun !== undefined) updates.maxProductsPerRun = parseInt(maxProductsPerRun, 10);
  
  const result = updateSettings(updates, 'admin');
  
  if (result.ok) {
    const config = getEffectiveConfig();
    if (config.enabled && !config.killSwitch) {
      startScheduler();
    } else {
      stopScheduler();
    }
  }
  
  res.json({
    ok: result.ok,
    state: getEffectiveConfig(),
    error: result.error
  });
});

router.post('/kill', requireAdminSession, (req, res) => {
  const { killSwitch = true } = req.body || {};
  
  const result = setKillSwitch(killSwitch, 'admin-emergency');
  
  if (killSwitch) {
    stopScheduler();
    console.log('[AutoHeal] EMERGENCY STOP activated');
  } else {
    const config = getEffectiveConfig();
    if (config.enabled) {
      startScheduler();
    }
    console.log('[AutoHeal] Kill switch deactivated');
  }
  
  res.json({
    ok: result.ok,
    killSwitch: killSwitch,
    schedulerStopped: killSwitch,
    timestamp: new Date().toISOString()
  });
});

router.get('/status', requireAdminSession, (req, res) => {
  const config = getEffectiveConfig();
  res.json({
    ok: true,
    enabled: config.enabled,
    level: config.level,
    killSwitch: config.killSwitch,
    safeMode: config.level >= 1,
    scheduleSeconds: config.intervalSeconds,
    maxFixesPerRun: config.maxChangesPerRun,
    allowedActions: ALLOWED_FIX_ACTIONS,
    testsRunning,
    probeRunning
  });
});

router.post('/run-tests', requireAdminSession, rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  if (testsRunning) {
    return res.status(409).json({
      ok: false,
      error: 'TESTS_ALREADY_RUNNING',
      hint: 'Wait for current test run to complete'
    });
  }
  
  testsRunning = true;
  try {
    console.log('[AutoHeal] Running Playwright tests...');
    const result = await runPlaywrightTests();
    console.log(`[AutoHeal] Tests completed: ${result.summary?.passed}/${result.summary?.total} passed`);
    res.json(result);
  } catch (error) {
    console.error('[AutoHeal] Test run failed:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    testsRunning = false;
  }
});

router.post('/run-probe', requireAdminSession, rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  if (probeRunning) {
    return res.status(409).json({
      ok: false,
      error: 'PROBE_ALREADY_RUNNING',
      hint: 'Wait for current probe to complete'
    });
  }
  
  probeRunning = true;
  try {
    console.log('[AutoHeal] Running synthetic probe...');
    const result = await runSyntheticProbe();
    console.log(`[AutoHeal] Probe completed: ${result.summary?.passed}/${result.summary?.total} passed`);
    res.json(result);
  } catch (error) {
    console.error('[AutoHeal] Probe failed:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    probeRunning = false;
  }
});

router.get('/probe', requireAdminSession, (req, res) => {
  const results = loadProbeResults();
  if (!results) {
    return res.json({
      ok: false,
      error: 'No probe results found',
      hint: 'Run probe first via POST /api/admin/autoheal/run-probe'
    });
  }
  res.json(results);
});

router.get('/report', requireAdminSession, (req, res) => {
  const report = loadReport();
  if (!report) {
    return res.json({
      ok: false,
      error: 'No report found',
      hint: 'Run tests first via POST /api/admin/autoheal/run-tests'
    });
  }
  res.json(report);
});

router.post('/triage', requireAdminSession, rateLimit(20, 15 * 60 * 1000), async (req, res) => {
  try {
    const { note } = req.body || {};
    console.log('[AutoHeal] Running AI triage...');
    const result = await runTriage({ note });
    console.log(`[AutoHeal] Triage completed: ${result.ok ? 'success' : 'failed'}`);
    res.json(result);
  } catch (error) {
    console.error('[AutoHeal] Triage failed:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/triage', requireAdminSession, (req, res) => {
  const triage = loadTriage();
  if (!triage) {
    return res.json({
      ok: false,
      error: 'No triage found',
      hint: 'Run triage first via POST /api/admin/autoheal/triage'
    });
  }
  res.json(triage);
});

router.post('/fix', requireAdminSession, checkKillSwitch, rateLimit(15, 15 * 60 * 1000), async (req, res) => {
  const canApply = canApplyFixes();
  if (!canApply.allowed) {
    return res.status(403).json({
      ok: false,
      error: 'AUTOHEAL_APPLY_DISABLED',
      reason: canApply.reason,
      hint: canApply.hint || 'At Level 1, the Auto-Healer only suggests fixes. Enable Level 2 and set AUTOHEAL_APPLY_ENABLED=true to apply fixes.'
    });
  }
  
  try {
    const { actions, applyRecommendedSafeFixes } = req.body || {};
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    
    let result;
    
    if (applyRecommendedSafeFixes) {
      console.log('[AutoHeal] Applying recommended safe fixes...');
      result = await applySafeFixes();
    } else if (actions && Array.isArray(actions)) {
      console.log(`[AutoHeal] Running ${actions.length} fix actions (dryRun: ${dryRun})...`);
      result = await runFix(actions, { dryRun });
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Missing actions array or applyRecommendedSafeFixes flag'
      });
    }
    
    console.log(`[AutoHeal] Fix completed: ${result.totalChanges} changes`);
    res.json(result);
  } catch (error) {
    console.error('[AutoHeal] Fix failed:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/fix-log', requireAdminSession, (req, res) => {
  const lines = parseInt(req.query.lines) || 200;
  const log = getFixLogTail(lines);
  res.json({
    ok: true,
    count: log.length,
    entries: log
  });
});

router.get('/snapshots', requireAdminSession, (req, res) => {
  const snapshots = listSnapshots();
  res.json({
    ok: true,
    count: snapshots.length,
    snapshots
  });
});

router.get('/snapshot/:runId', requireAdminSession, (req, res) => {
  const snapshot = loadSnapshot(req.params.runId);
  if (!snapshot) {
    return res.status(404).json({ ok: false, error: 'Snapshot not found' });
  }
  res.json({ ok: true, snapshot });
});

router.get('/screenshots', requireAdminSession, (req, res) => {
  const screenshots = listScreenshots();
  res.json({
    ok: true,
    count: screenshots.length,
    screenshots
  });
});

router.get('/screenshot/:filename', requireAdminSession, (req, res) => {
  const filename = req.params.filename;
  
  if (!filename.match(/^[a-zA-Z0-9_-]+\.png$/)) {
    return res.status(400).json({ ok: false, error: 'Invalid filename' });
  }
  
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ ok: false, error: 'Screenshot not found' });
  }
  
  res.sendFile(filepath);
});

router.get('/metrics', requireAdminSession, (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const metrics = getMetricsSummary(hours);
  const health = getHealthScore();
  res.json({
    ok: true,
    metrics,
    health
  });
});

router.get('/health', (req, res) => {
  const health = getHealthScore();
  res.json({
    ok: true,
    score: health.score,
    grade: health.grade,
    issues: health.issues
  });
});

router.get('/policy', requireAdminSession, (req, res) => {
  const policy = loadPolicy();
  const canApply = canApplyFixes();
  res.json({
    ok: true,
    policy,
    canApply,
    applyEnabled: process.env.AUTOHEAL_APPLY_ENABLED === 'true',
    hint: !canApply.allowed ? canApply.hint : null
  });
});

const { 
  getRecentActions, 
  getLastAppliedAction, 
  getActionStats,
  approveLevel2,
  getLevel2Approval,
  getRecentAlerts
} = require('./db');
const { rollbackAction, getRollbackPreview } = require('./rollback');
const { evaluateThresholds, isAlertsEnabled } = require('./alerts');

router.post('/enable-level2', requireAdminSession, async (req, res) => {
  const { confirmation } = req.body || {};
  
  if (confirmation !== 'I_UNDERSTAND_THE_RISKS') {
    return res.status(400).json({
      ok: false,
      error: 'CONFIRMATION_REQUIRED',
      hint: 'Body must include { confirmation: "I_UNDERSTAND_THE_RISKS" }'
    });
  }
  
  const applyEnabled = process.env.AUTOHEAL_APPLY_ENABLED === 'true';
  const level = parseInt(process.env.AUTOHEAL_LEVEL || '1', 10);
  
  try {
    const approval = await approveLevel2('admin', confirmation);
    
    res.json({
      ok: true,
      approval,
      runtimeStatus: {
        level,
        applyEnabled,
        canApplyNow: level >= 2 && applyEnabled,
        hint: !applyEnabled ? 'Set AUTOHEAL_APPLY_ENABLED=true in secrets to enable fix application' :
              level < 2 ? 'Set AUTOHEAL_LEVEL=2 in secrets to enable Level 2' : 
              'Level 2 is fully enabled'
      }
    });
  } catch (error) {
    console.error('[AutoHeal] Enable Level 2 failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/level2-status', requireAdminSession, async (req, res) => {
  try {
    const approval = await getLevel2Approval();
    const applyEnabled = process.env.AUTOHEAL_APPLY_ENABLED === 'true';
    const level = parseInt(process.env.AUTOHEAL_LEVEL || '1', 10);
    
    res.json({
      ok: true,
      approved: !!approval,
      approval: approval || null,
      runtimeLevel: level,
      applyEnabled,
      canApplyNow: level >= 2 && applyEnabled
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/actions', requireAdminSession, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const actions = await getRecentActions(limit);
    const stats = await getActionStats();
    const lastApply = await getLastAppliedAction();
    
    res.json({
      ok: true,
      actions,
      stats,
      lastApply: lastApply || null
    });
  } catch (error) {
    console.error('[AutoHeal] Get actions failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/rollback/:actionId/preview', requireAdminSession, async (req, res) => {
  try {
    const actionId = parseInt(req.params.actionId, 10);
    const preview = await getRollbackPreview(actionId);
    res.json(preview);
  } catch (error) {
    console.error('[AutoHeal] Rollback preview failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/rollback/:actionId', requireAdminSession, checkKillSwitch, async (req, res) => {
  const canApply = canApplyFixes();
  if (!canApply.allowed) {
    return res.status(403).json({
      ok: false,
      error: 'AUTOHEAL_APPLY_DISABLED',
      reason: canApply.reason,
      hint: canApply.hint || 'Level 2 and AUTOHEAL_APPLY_ENABLED=true required for rollback'
    });
  }
  
  try {
    const actionId = parseInt(req.params.actionId, 10);
    const result = await rollbackAction(actionId, 'admin');
    
    if (result.ok) {
      console.log(`[AutoHeal] Rolled back action ${actionId}: ${result.restoredCount} items restored`);
    }
    
    res.json(result);
  } catch (error) {
    console.error('[AutoHeal] Rollback failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/alerts', requireAdminSession, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const alerts = await getRecentAlerts(limit);
    
    res.json({
      ok: true,
      alertsEnabled: isAlertsEnabled(),
      slackConfigured: !!process.env.SLACK_WEBHOOK_URL,
      emailConfigured: !!(process.env.MAIL_USER && process.env.MAIL_PASS && process.env.ALERT_EMAIL_TO),
      count: alerts.length,
      alerts
    });
  } catch (error) {
    console.error('[AutoHeal] Get alerts failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/alerts/evaluate', requireAdminSession, rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  try {
    const result = await evaluateThresholds();
    res.json(result);
  } catch (error) {
    console.error('[AutoHeal] Alert evaluation failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
