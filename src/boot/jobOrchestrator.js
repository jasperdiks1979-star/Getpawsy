/**
 * Job Orchestrator
 * Starts background jobs after server is ready and health checks pass
 * 
 * Features:
 * - Delayed start with jitter to allow health checks to pass
 * - Singleton guard to prevent double starts
 * - Optional PostgreSQL advisory lock for multi-instance safety
 * - Never throws - all errors are caught and logged
 */

const { log } = require('../logger');
const { 
  getJobStartDelay, 
  getJobStartJitter, 
  useJobLock,
  jobsEnabled 
} = require('./safeBoot');

let jobsStarted = false;
let jobsStarting = false;
const LOCK_ID = 123456789;

async function acquireAdvisoryLock(pool) {
  if (!pool || !useJobLock()) {
    return true;
  }
  
  try {
    const result = await pool.query('SELECT pg_try_advisory_lock($1) as locked', [LOCK_ID]);
    const locked = result.rows?.[0]?.locked === true;
    if (locked) {
      log('[JobOrchestrator] Acquired advisory lock');
    } else {
      log('[JobOrchestrator] Could not acquire advisory lock - another instance is running jobs');
    }
    return locked;
  } catch (err) {
    log(`[JobOrchestrator] Advisory lock error (continuing anyway): ${err.message}`);
    return true;
  }
}

async function releaseAdvisoryLock(pool) {
  if (!pool || !useJobLock()) return;
  
  try {
    await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    log('[JobOrchestrator] Released advisory lock');
  } catch (err) {
    log(`[JobOrchestrator] Advisory unlock error: ${err.message}`);
  }
}

async function waitForDelay() {
  const baseDelay = getJobStartDelay();
  const jitter = Math.floor(Math.random() * getJobStartJitter());
  const totalDelay = baseDelay + jitter;
  
  log(`[JobOrchestrator] Waiting ${totalDelay}ms before starting jobs (base: ${baseDelay}, jitter: ${jitter})`);
  
  return new Promise(resolve => setTimeout(resolve, totalDelay));
}

async function checkReadiness(checkFn) {
  if (!checkFn) return true;
  
  try {
    const ready = await checkFn();
    return !!ready;
  } catch (err) {
    log(`[JobOrchestrator] Readiness check failed: ${err.message}`);
    return false;
  }
}

async function startJobsWhenReady(options = {}) {
  const {
    startJobsFn,
    pool = null,
    readinessCheckFn = null,
    logger = log
  } = options;
  
  if (!jobsEnabled()) {
    logger('[JobOrchestrator] Jobs disabled by configuration - skipping');
    return { started: false, reason: 'disabled' };
  }
  
  if (jobsStarted) {
    logger('[JobOrchestrator] Jobs already started - skipping');
    return { started: false, reason: 'already-started' };
  }
  
  if (jobsStarting) {
    logger('[JobOrchestrator] Jobs already starting - skipping');
    return { started: false, reason: 'already-starting' };
  }
  
  jobsStarting = true;
  
  try {
    await waitForDelay();
    
    const ready = await checkReadiness(readinessCheckFn);
    if (!ready) {
      logger('[JobOrchestrator] Readiness check failed - starting jobs anyway (best effort)');
    }
    
    const hasLock = await acquireAdvisoryLock(pool);
    if (!hasLock) {
      jobsStarting = false;
      return { started: false, reason: 'no-lock' };
    }
    
    if (!startJobsFn) {
      logger('[JobOrchestrator] No startJobsFn provided - nothing to start');
      jobsStarting = false;
      return { started: false, reason: 'no-fn' };
    }
    
    logger('[JobOrchestrator] Starting background jobs...');
    
    try {
      await startJobsFn();
      jobsStarted = true;
      jobsStarting = false;
      logger('[JobOrchestrator] Background jobs started successfully');
      return { started: true };
    } catch (jobErr) {
      logger(`[JobOrchestrator] Error starting jobs: ${jobErr.message}`);
      jobsStarting = false;
      return { started: false, reason: 'start-error', error: jobErr.message };
    }
    
  } catch (err) {
    logger(`[JobOrchestrator] Orchestrator error: ${err.message}`);
    jobsStarting = false;
    return { started: false, reason: 'orchestrator-error', error: err.message };
  }
}

function getJobsStatus() {
  return {
    started: jobsStarted,
    starting: jobsStarting,
    enabled: jobsEnabled()
  };
}

function resetJobsStatus() {
  jobsStarted = false;
  jobsStarting = false;
}

module.exports = {
  startJobsWhenReady,
  getJobsStatus,
  resetJobsStatus,
  acquireAdvisoryLock,
  releaseAdvisoryLock
};
