const fs = require('fs');
const path = require('path');
const { mirrorProductImages, mirrorProductVideos, hasLocalMedia } = require('./mediaMirror');

const PRODUCTS_CJ_PATH = path.join(__dirname, '..', 'data', 'products_cj.json');
const JOB_STATUS_PATH = path.join(__dirname, '..', 'data', 'mirror-job-status.json');

let currentJob = null;
let jobHistory = [];

function loadProducts() {
  if (!fs.existsSync(PRODUCTS_CJ_PATH)) {
    throw new Error('products_cj.json not found');
  }
  const data = JSON.parse(fs.readFileSync(PRODUCTS_CJ_PATH, 'utf-8'));
  return Array.isArray(data) ? data : (data.products || []);
}

function saveJobStatus(status) {
  try {
    fs.writeFileSync(JOB_STATUS_PATH, JSON.stringify(status, null, 2));
  } catch (e) {
    console.warn('[MirrorJob] Failed to save status:', e.message);
  }
}

function loadJobStatus() {
  try {
    if (fs.existsSync(JOB_STATUS_PATH)) {
      return JSON.parse(fs.readFileSync(JOB_STATUS_PATH, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

async function runMirrorJob(options = {}) {
  const { limit, productId, skipExisting = true, includeVideos = false } = options;

  if (currentJob && currentJob.status === 'running') {
    return { error: 'Job already running', jobId: currentJob.id };
  }

  const jobId = `mirror-${Date.now()}`;
  const startTime = new Date();

  currentJob = {
    id: jobId,
    status: 'running',
    startedAt: startTime.toISOString(),
    options,
    progress: {
      total: 0,
      processed: 0,
      downloaded: 0,
      skipped: 0,
      failed: 0
    }
  };

  saveJobStatus(currentJob);

  try {
    let products = loadProducts();
    
    if (productId) {
      products = products.filter(p => String(p.id) === String(productId) || String(p.cj_pid) === String(productId));
    }

    if (limit && limit > 0) {
      products = products.slice(0, limit);
    }

    currentJob.progress.total = products.length;
    console.log(`[MirrorJob] Starting job ${jobId} for ${products.length} products`);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const pid = String(product.id || product.cj_pid);

      if (skipExisting && hasLocalMedia(pid)) {
        currentJob.progress.skipped++;
        currentJob.progress.processed++;
        continue;
      }

      try {
        const imageResult = await mirrorProductImages(product);
        currentJob.progress.downloaded += imageResult.downloaded || 0;
        currentJob.progress.skipped += imageResult.skipped || 0;
        currentJob.progress.failed += imageResult.failed || 0;

        if (includeVideos && product.videos && product.videos.length > 0) {
          const videoResult = await mirrorProductVideos(product);
          currentJob.progress.downloaded += videoResult.downloaded || 0;
          currentJob.progress.skipped += videoResult.skipped || 0;
          currentJob.progress.failed += videoResult.failed || 0;
        }
      } catch (err) {
        console.log(`[MirrorJob] Error processing product ${pid}: ${err.message}`);
        currentJob.progress.failed++;
      }

      currentJob.progress.processed++;

      if (i % 10 === 0) {
        saveJobStatus(currentJob);
        console.log(`[MirrorJob] Progress: ${currentJob.progress.processed}/${currentJob.progress.total}`);
      }
    }

    currentJob.status = 'completed';
    currentJob.completedAt = new Date().toISOString();
    currentJob.duration = Date.now() - startTime.getTime();

    console.log(`[MirrorJob] Completed: ${JSON.stringify(currentJob.progress)}`);
    
  } catch (err) {
    currentJob.status = 'failed';
    currentJob.error = err.message;
    currentJob.completedAt = new Date().toISOString();
    console.error(`[MirrorJob] Failed: ${err.message}`);
  }

  saveJobStatus(currentJob);
  jobHistory.unshift(currentJob);
  if (jobHistory.length > 10) jobHistory.pop();

  const result = { ...currentJob };
  currentJob = null;
  return result;
}

function getJobStatus(jobId) {
  if (currentJob && currentJob.id === jobId) {
    return currentJob;
  }
  
  const historical = jobHistory.find(j => j.id === jobId);
  if (historical) return historical;

  const saved = loadJobStatus();
  if (saved && saved.id === jobId) return saved;

  return null;
}

function getCurrentJobStatus() {
  return currentJob || loadJobStatus();
}

function getMediaStats() {
  const products = loadProducts();
  let totalProducts = products.length;
  let withLocalMedia = 0;
  let totalLocalImages = 0;

  for (const product of products) {
    const pid = String(product.id || product.cj_pid);
    if (hasLocalMedia(pid)) {
      withLocalMedia++;
      const { getLocalImagesForProduct } = require('./mediaMirror');
      const localImages = getLocalImagesForProduct(pid);
      totalLocalImages += localImages.length;
    }
  }

  return {
    totalProducts,
    withLocalMedia,
    withoutLocalMedia: totalProducts - withLocalMedia,
    totalLocalImages,
    percentMirrored: totalProducts > 0 ? Math.round((withLocalMedia / totalProducts) * 100) : 0
  };
}

module.exports = {
  runMirrorJob,
  getJobStatus,
  getCurrentJobStatus,
  getMediaStats
};
