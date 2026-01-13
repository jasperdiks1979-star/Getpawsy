/**
 * Admin Job Queue System
 * Unified job system for all admin background tasks
 * Supports progress tracking, cancellation, and concurrency control
 */

const fs = require('fs');
const path = require('path');
const { log } = require('../logger');

const JOBS_FILE = path.join(__dirname, '../../data/admin_jobs.json');
const MAX_JOBS_HISTORY = 100;

let activeJobs = new Map();
let jobIdCounter = Date.now();

function loadJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    }
  } catch (err) {
    log(`[JobQueue] Error loading jobs: ${err.message}`);
  }
  return { jobs: [], lastId: 0 };
}

function saveJobs(data) {
  try {
    const dir = path.dirname(JOBS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    if (data.jobs.length > MAX_JOBS_HISTORY) {
      data.jobs = data.jobs.slice(-MAX_JOBS_HISTORY);
    }
    fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    log(`[JobQueue] Error saving jobs: ${err.message}`);
  }
}

function createJob(type, params = {}, options = {}) {
  const id = `job_${++jobIdCounter}_${Date.now().toString(36)}`;
  
  const job = {
    id,
    type,
    params,
    status: 'pending',
    progress: 0,
    message: 'Waiting to start...',
    logs: [],
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    error: null,
    result: null,
    dryRun: options.dryRun || false
  };
  
  const data = loadJobs();
  data.jobs.push(job);
  data.lastId = jobIdCounter;
  saveJobs(data);
  
  activeJobs.set(id, { job, cancelled: false });
  
  log(`[JobQueue] Created job ${id} (${type})`);
  return job;
}

function updateJob(id, updates) {
  const data = loadJobs();
  const idx = data.jobs.findIndex(j => j.id === id);
  if (idx >= 0) {
    Object.assign(data.jobs[idx], updates);
    saveJobs(data);
    
    const active = activeJobs.get(id);
    if (active) Object.assign(active.job, updates);
  }
}

function addJobLog(id, message) {
  const data = loadJobs();
  const idx = data.jobs.findIndex(j => j.id === id);
  if (idx >= 0) {
    if (!data.jobs[idx].logs) data.jobs[idx].logs = [];
    data.jobs[idx].logs.push({
      time: new Date().toISOString(),
      message
    });
    if (data.jobs[idx].logs.length > 200) {
      data.jobs[idx].logs = data.jobs[idx].logs.slice(-200);
    }
    saveJobs(data);
  }
}

function setJobProgress(id, progress, message) {
  updateJob(id, { 
    progress: Math.min(100, Math.max(0, progress)),
    message: message || `${progress}% complete`
  });
}

function completeJob(id, result = null) {
  updateJob(id, {
    status: 'completed',
    progress: 100,
    completedAt: new Date().toISOString(),
    result,
    message: 'Completed successfully'
  });
  activeJobs.delete(id);
  log(`[JobQueue] Completed job ${id}`);
}

function failJob(id, error) {
  updateJob(id, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    error: typeof error === 'string' ? error : error.message,
    message: 'Job failed'
  });
  activeJobs.delete(id);
  log(`[JobQueue] Failed job ${id}: ${error}`);
}

function cancelJob(id) {
  const active = activeJobs.get(id);
  if (active) {
    active.cancelled = true;
    updateJob(id, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      message: 'Cancelled by user'
    });
    activeJobs.delete(id);
    log(`[JobQueue] Cancelled job ${id}`);
    return true;
  }
  return false;
}

function isJobCancelled(id) {
  const active = activeJobs.get(id);
  return active ? active.cancelled : true;
}

function getJob(id) {
  const data = loadJobs();
  return data.jobs.find(j => j.id === id) || null;
}

function listJobs(options = {}) {
  const data = loadJobs();
  let jobs = [...data.jobs];
  
  if (options.type) {
    jobs = jobs.filter(j => j.type === options.type);
  }
  if (options.status) {
    jobs = jobs.filter(j => j.status === options.status);
  }
  
  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (options.limit) {
    jobs = jobs.slice(0, options.limit);
  }
  
  return jobs;
}

function getActiveJobs() {
  return Array.from(activeJobs.values()).map(a => a.job);
}

function hasRunningJob(type) {
  for (const [, active] of activeJobs) {
    if (active.job.type === type && active.job.status === 'running') {
      return true;
    }
  }
  return false;
}

async function runJob(id, executor) {
  const active = activeJobs.get(id);
  if (!active) {
    throw new Error(`Job ${id} not found`);
  }
  
  updateJob(id, {
    status: 'running',
    startedAt: new Date().toISOString(),
    message: 'Running...'
  });
  
  try {
    const result = await executor({
      job: active.job,
      setProgress: (p, m) => setJobProgress(id, p, m),
      addLog: (m) => addJobLog(id, m),
      isCancelled: () => isJobCancelled(id)
    });
    
    if (!isJobCancelled(id)) {
      completeJob(id, result);
    }
    return result;
  } catch (err) {
    if (!isJobCancelled(id)) {
      failJob(id, err);
    }
    throw err;
  }
}

module.exports = {
  createJob,
  updateJob,
  addJobLog,
  setJobProgress,
  completeJob,
  failJob,
  cancelJob,
  isJobCancelled,
  getJob,
  listJobs,
  getActiveJobs,
  hasRunningJob,
  runJob
};
