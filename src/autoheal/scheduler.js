const fs = require('fs');
const path = require('path');
const { runPlaywrightTests } = require('./playwrightRunner');
const { runTriage } = require('./triage');
const { applySafeFixes } = require('./fixRunner');
const { loadReport, loadTriage, saveLastRunTime, ensureDir, AUTOHEAL_DIR } = require('./storage');
const { getEffectiveConfig, isKillSwitchActive } = require('./settings');
const { runSyntheticProbe, loadProbeResults } = require('./probe');
const { getMetricsSummary, getHealthScore } = require('./telemetry');

const LOCK_FILE = path.join(AUTOHEAL_DIR, '.scheduler-lock');
const LOCK_TTL_MS = 10 * 60 * 1000;

let schedulerInterval = null;
let lastRunTime = 0;
let isRunning = false;

function acquireLock() {
  try {
    ensureDir(AUTOHEAL_DIR);
    
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      const lockAge = Date.now() - new Date(lockData.acquiredAt).getTime();
      
      if (lockAge < LOCK_TTL_MS) {
        console.log(`[AutoHeal Scheduler] Lock held by ${lockData.pid}, skipping`);
        return false;
      }
      console.log('[AutoHeal Scheduler] Stale lock detected, claiming');
    }
    
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid,
      acquiredAt: new Date().toISOString()
    }));
    
    return true;
  } catch (err) {
    console.error('[AutoHeal Scheduler] Lock acquisition failed:', err.message);
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      if (lockData.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (err) {
    console.error('[AutoHeal Scheduler] Lock release failed:', err.message);
  }
}

async function runAutohealCycle() {
  const config = getEffectiveConfig();
  
  if (!config.enabled) {
    console.log('[AutoHeal Scheduler] Disabled - skipping cycle');
    return { skipped: true, reason: 'disabled' };
  }
  
  if (config.killSwitch) {
    console.log('[AutoHeal Scheduler] Kill switch active - skipping cycle');
    return { skipped: true, reason: 'kill_switch' };
  }
  
  const now = Date.now();
  const minInterval = config.intervalSeconds * 1000;
  
  if (now - lastRunTime < minInterval) {
    return { skipped: true, reason: 'too_soon' };
  }
  
  if (!acquireLock()) {
    return { skipped: true, reason: 'lock_held' };
  }
  
  if (isRunning) {
    releaseLock();
    return { skipped: true, reason: 'already_running' };
  }
  
  isRunning = true;
  lastRunTime = now;
  
  const cycleResult = {
    timestamp: new Date().toISOString(),
    level: config.level,
    steps: [],
    fixesApplied: 0
  };
  
  try {
    console.log(`[AutoHeal Scheduler] Starting cycle (level=${config.level})...`);
    
    const healthScore = getHealthScore();
    cycleResult.healthScore = healthScore;
    cycleResult.steps.push({ step: 'health_check', score: healthScore.score, issues: healthScore.issues });
    
    if (config.probeBrowser && !config.environment.isDeploy) {
      console.log('[AutoHeal Scheduler] Running synthetic probe...');
      try {
        const probeResult = await runSyntheticProbe();
        cycleResult.steps.push({ step: 'probe', ok: probeResult.ok, summary: probeResult.summary });
        
        if (!probeResult.ok) {
          console.log(`[AutoHeal Scheduler] Probe failed: ${probeResult.summary?.failed} checks`);
        }
      } catch (err) {
        console.error('[AutoHeal Scheduler] Probe error:', err.message);
        cycleResult.steps.push({ step: 'probe', ok: false, error: err.message });
      }
    }
    
    if (!config.environment.isDeploy) {
      console.log('[AutoHeal Scheduler] Running Playwright tests...');
      try {
        const testResult = await runPlaywrightTests();
        cycleResult.steps.push({ 
          step: 'tests', 
          ok: testResult.ok, 
          summary: testResult.summary 
        });
        
        if (!testResult.ok || testResult.summary?.failed > 0) {
          console.log(`[AutoHeal Scheduler] Tests failed (${testResult.summary?.failed}/${testResult.summary?.total})`);
        }
      } catch (err) {
        console.error('[AutoHeal Scheduler] Test error:', err.message);
        cycleResult.steps.push({ step: 'tests', ok: false, error: err.message });
      }
    }
    
    if (config.level >= 1) {
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      
      if (hasOpenAI) {
        console.log('[AutoHeal Scheduler] Running AI triage...');
        try {
          const triageResult = await runTriage({ 
            note: `Automated triage (level=${config.level}, health=${healthScore.score})` 
          });
          cycleResult.steps.push({ 
            step: 'triage', 
            ok: triageResult.ok 
          });
          
          if (triageResult.ok && triageResult.triage?.safeFixes?.length > 0) {
            const safeFixes = triageResult.triage.safeFixes;
            console.log(`[AutoHeal Scheduler] ${safeFixes.length} safe fixes recommended`);
            
            if (config.level >= 1) {
              console.log('[AutoHeal Scheduler] Applying safe fixes...');
              const fixResult = await applySafeFixes();
              cycleResult.fixesApplied = fixResult.totalChanges || 0;
              cycleResult.steps.push({ 
                step: 'safe_fixes', 
                applied: cycleResult.fixesApplied 
              });
            }
          }
        } catch (err) {
          console.error('[AutoHeal Scheduler] Triage error:', err.message);
          cycleResult.steps.push({ step: 'triage', ok: false, error: err.message });
        }
      } else {
        cycleResult.steps.push({ step: 'triage', skipped: true, reason: 'no_openai_key' });
      }
    } else {
      cycleResult.steps.push({ step: 'observe_only', level: config.level });
    }
    
    if (config.level >= 2) {
      cycleResult.steps.push({ 
        step: 'level_2_patches', 
        note: 'Code patches require manual review and apply'
      });
    }
    
    saveLastRunTime();
    console.log(`[AutoHeal Scheduler] Cycle completed. Fixes applied: ${cycleResult.fixesApplied}`);
    
  } catch (error) {
    console.error('[AutoHeal Scheduler] Cycle failed:', error.message);
    cycleResult.error = error.message;
  } finally {
    isRunning = false;
    releaseLock();
  }
  
  return cycleResult;
}

function startScheduler() {
  const config = getEffectiveConfig();
  
  if (!config.enabled) {
    console.log('[AutoHeal Scheduler] Disabled - not starting');
    return;
  }
  
  if (config.killSwitch) {
    console.log('[AutoHeal Scheduler] Kill switch active - not starting');
    return;
  }
  
  const intervalMs = config.intervalSeconds * 1000;
  
  console.log(`[AutoHeal Scheduler] Starting (interval=${config.intervalSeconds}s, level=${config.level})`);
  
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  schedulerInterval = setInterval(runAutohealCycle, intervalMs);
  
  setTimeout(runAutohealCycle, 60000);
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[AutoHeal Scheduler] Stopped');
  }
  releaseLock();
}

function isSchedulerRunning() {
  return schedulerInterval !== null;
}

function getSchedulerStatus() {
  const config = getEffectiveConfig();
  return {
    running: isSchedulerRunning(),
    cycleInProgress: isRunning,
    lastRunTime: lastRunTime ? new Date(lastRunTime).toISOString() : null,
    config: {
      enabled: config.enabled,
      level: config.level,
      intervalSeconds: config.intervalSeconds,
      killSwitch: config.killSwitch
    }
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  runAutohealCycle,
  isSchedulerRunning,
  getSchedulerStatus
};
