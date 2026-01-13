const { log } = require("./logger");
const { reindexDelta, reindexFull } = require("./aiReindex");
const {
  createJob,
  getJob,
  updateJob,
  getQueuedJob,
  hasRunningJob,
  getRecentJobs,
  getLastCompletedJob
} = require("./aiDatabase");

let isProcessing = false;

async function enqueueJob(type) {
  if (!["reindex_delta", "reindex_full"].includes(type)) {
    throw new Error(`Invalid job type: ${type}`);
  }
  
  const jobId = await createJob(type);
  log(`[AI Jobs] Enqueued job ${jobId} (${type})`);
  
  setImmediate(() => runNextJob());
  
  return jobId;
}

async function runNextJob() {
  if (isProcessing) {
    log("[AI Jobs] Already processing a job, skipping");
    return;
  }
  
  const running = await hasRunningJob();
  if (running) {
    log("[AI Jobs] Another job is running, skipping");
    return;
  }
  
  const queuedJob = await getQueuedJob();
  if (!queuedJob) {
    return;
  }
  
  isProcessing = true;
  const jobId = queuedJob.id;
  
  try {
    log(`[AI Jobs] Starting job ${jobId} (${queuedJob.type})`);
    
    await updateJob(jobId, {
      status: "running",
      started_at: new Date().toISOString()
    });
    
    let stats;
    if (queuedJob.type === "reindex_delta") {
      stats = await reindexDelta();
    } else if (queuedJob.type === "reindex_full") {
      stats = await reindexFull();
    }
    
    await updateJob(jobId, {
      status: "done",
      finished_at: new Date().toISOString(),
      stats_json: JSON.stringify(stats),
      error: null
    });
    
    log(`[AI Jobs] Job ${jobId} completed successfully`);
    
  } catch (err) {
    log(`[AI Jobs] Job ${jobId} failed: ${err.message}`);
    
    await updateJob(jobId, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error: err.message
    });
    
  } finally {
    isProcessing = false;
    
    setImmediate(() => runNextJob());
  }
}

async function getJobStatus() {
  const jobs = await getRecentJobs(10);
  const lastJob = await getLastCompletedJob();
  const running = await hasRunningJob();
  
  return {
    isRunning: running,
    recentJobs: jobs,
    lastCompletedJob: lastJob
  };
}

async function getJobById(id) {
  return getJob(id);
}

function triggerReindexDelta() {
  return enqueueJob("reindex_delta");
}

function triggerReindexFull() {
  return enqueueJob("reindex_full");
}

module.exports = {
  enqueueJob,
  runNextJob,
  getJobStatus,
  getJobById,
  triggerReindexDelta,
  triggerReindexFull
};
