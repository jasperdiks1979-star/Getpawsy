/**
 * Translation Batch Job Module
 * Bulk translates products to all supported languages
 * Supports resume, stop, and progress tracking
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./logger');
const { db } = require('./db');
const { 
  translateProduct, 
  cacheTranslation, 
  SUPPORTED_LANGS, 
  I18N_STATUS 
} = require('./productTranslation');
const translationStore = require('./translationStore');

const JOBS_FILE = path.join(__dirname, '..', 'data', 'translation-jobs.json');
const BATCH_SIZE = 5;
const DELAY_BETWEEN_PRODUCTS = 500;
const DELAY_BETWEEN_LANGS = 200;

let currentJob = null;
let stopRequested = false;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`[TranslationJob] Error loading jobs: ${e.message}`);
  }
  return { jobs: [], currentJobId: null };
}

function saveJobs(data) {
  ensureDir(path.dirname(JOBS_FILE));
  fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
}

function generateJobId() {
  return `tj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

async function getStats() {
  const products = await db.listProducts();
  const targetLangs = SUPPORTED_LANGS.filter(l => l !== 'en');
  const storeStats = translationStore.getTranslationStats();
  const enabledLocales = storeStats.enabledLocales || [];
  
  const langToLocale = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };
  
  const stats = {
    totalProducts: products.length,
    translationStatus: {
      pending: 0,
      partial: 0,
      complete: 0
    },
    byLang: {},
    enabledLocales
  };
  
  targetLangs.forEach(l => { 
    const locale = langToLocale[l];
    const localeStats = storeStats.byLocale[locale] || { translated: 0, enabled: false };
    stats.byLang[l] = { 
      translated: localeStats.translated, 
      missing: products.length - localeStats.translated,
      enabled: localeStats.enabled
    }; 
  });
  
  for (const p of products) {
    const translations = translationStore.getAllTranslationsForProduct(p.id);
    const translatedCount = Object.keys(translations).length;
    const enabledNonCanonical = enabledLocales.filter(l => l !== 'en-US').length;
    
    if (translatedCount === 0) {
      stats.translationStatus.pending++;
    } else if (translatedCount >= enabledNonCanonical) {
      stats.translationStatus.complete++;
    } else {
      stats.translationStatus.partial++;
    }
  }
  
  return stats;
}

async function translateSingleProduct(product, targetLangs, includeSpecs = false) {
  const results = {
    productId: product.id,
    success: true,
    translated: [],
    failed: [],
    skipped: []
  };
  
  const langToLocale = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };
  
  for (const lang of targetLangs) {
    const locale = langToLocale[lang];
    const existing = translationStore.getTranslation(product.id, locale);
    if (existing) {
      results.skipped.push(lang);
      continue;
    }
    
    try {
      const translation = await translateProduct(product, lang, includeSpecs);
      if (translation) {
        await cacheTranslation(product.id, lang, translation);
        results.translated.push(lang);
        log(`[TranslationJob] Translated ${product.id} to ${lang}`);
      } else {
        results.failed.push({ lang, error: 'No translation returned' });
      }
    } catch (err) {
      results.failed.push({ lang, error: err.message });
      log(`[TranslationJob] Failed to translate ${product.id} to ${lang}: ${err.message}`);
    }
    
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_LANGS));
  }
  
  if (results.failed.length > 0) {
    results.success = false;
  }
  
  return results;
}

async function runJob(options = {}) {
  let {
    targetLangs = SUPPORTED_LANGS.filter(l => l !== 'en'),
    onlyMissing = true,
    includeSpecs = false,
    productIds = null
  } = options;
  
  const enabledLocales = translationStore.getEnabledLocales();
  const langToLocale = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };
  const enabledLangs = enabledLocales
    .map(locale => locale.split('-')[0])
    .filter(l => l !== 'en');
  
  targetLangs = targetLangs.filter(l => enabledLangs.includes(l));
  
  if (targetLangs.length === 0) {
    log(`[TranslationJob] No enabled languages to translate. Enabled locales: ${enabledLocales.join(', ')}`);
    return { success: false, error: 'No enabled target languages. Enable languages in Settings > Languages first.' };
  }
  
  log(`[TranslationJob] Enabled locales: ${enabledLocales.join(', ')}, Target langs: ${targetLangs.join(', ')}`);
  
  
  if (currentJob && currentJob.status === 'running') {
    return { success: false, error: 'A translation job is already running' };
  }
  
  stopRequested = false;
  
  const jobId = generateJobId();
  const products = await db.listProducts();
  
  let productsToTranslate = [];
  
  if (productIds && productIds.length > 0) {
    productsToTranslate = products.filter(p => productIds.includes(p.id));
  } else if (onlyMissing) {
    const langToLocale = { nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };
    for (const p of products) {
      const missingLangs = targetLangs.filter(l => {
        const locale = langToLocale[l];
        return !translationStore.getTranslation(p.id, locale);
      });
      if (missingLangs.length > 0) {
        productsToTranslate.push(p);
      }
    }
  } else {
    productsToTranslate = products;
  }
  
  if (productsToTranslate.length === 0) {
    return { success: true, message: 'No products need translation', jobId };
  }
  
  currentJob = {
    id: jobId,
    status: 'running',
    startedAt: new Date().toISOString(),
    targetLangs,
    includeSpecs,
    total: productsToTranslate.length,
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    currentProductId: null,
    results: []
  };
  
  const jobsData = loadJobs();
  jobsData.currentJobId = jobId;
  jobsData.jobs.unshift({
    ...currentJob,
    results: []
  });
  if (jobsData.jobs.length > 20) {
    jobsData.jobs = jobsData.jobs.slice(0, 20);
  }
  saveJobs(jobsData);
  
  log(`[TranslationJob] Starting job ${jobId}: ${productsToTranslate.length} products, langs: ${targetLangs.join(',')}`);
  
  processJobAsync(productsToTranslate, targetLangs, includeSpecs);
  
  return { success: true, jobId, total: productsToTranslate.length };
}

async function processJobAsync(products, targetLangs, includeSpecs) {
  for (let i = 0; i < products.length; i++) {
    if (stopRequested) {
      log(`[TranslationJob] Stop requested, halting at product ${i + 1}/${products.length}`);
      break;
    }
    
    const product = products[i];
    currentJob.currentProductId = product.id;
    currentJob.processed = i;
    
    try {
      const result = await translateSingleProduct(product, targetLangs, includeSpecs);
      currentJob.results.push(result);
      
      if (result.translated.length > 0) {
        currentJob.successful++;
      }
      if (result.failed.length > 0) {
        currentJob.failed++;
      }
      if (result.skipped.length === targetLangs.length) {
        currentJob.skipped++;
      }
    } catch (err) {
      currentJob.failed++;
      currentJob.results.push({
        productId: product.id,
        success: false,
        error: err.message
      });
      log(`[TranslationJob] Error processing ${product.id}: ${err.message}`);
    }
    
    currentJob.processed = i + 1;
    
    if ((i + 1) % BATCH_SIZE === 0) {
      updateJobFile();
    }
    
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_PRODUCTS));
  }
  
  currentJob.status = stopRequested ? 'stopped' : 'completed';
  currentJob.completedAt = new Date().toISOString();
  currentJob.currentProductId = null;
  
  updateJobFile();
  
  log(`[TranslationJob] Job ${currentJob.id} ${currentJob.status}: ${currentJob.successful} successful, ${currentJob.failed} failed, ${currentJob.skipped} skipped`);
}

function updateJobFile() {
  if (!currentJob) return;
  
  const jobsData = loadJobs();
  const idx = jobsData.jobs.findIndex(j => j.id === currentJob.id);
  if (idx >= 0) {
    jobsData.jobs[idx] = {
      ...currentJob,
      results: currentJob.results.slice(-50)
    };
  }
  saveJobs(jobsData);
}

function getStatus() {
  if (!currentJob) {
    const jobsData = loadJobs();
    if (jobsData.jobs.length > 0) {
      return {
        running: false,
        lastJob: {
          ...jobsData.jobs[0],
          results: undefined
        }
      };
    }
    return { running: false, lastJob: null };
  }
  
  return {
    running: currentJob.status === 'running',
    job: {
      id: currentJob.id,
      status: currentJob.status,
      startedAt: currentJob.startedAt,
      completedAt: currentJob.completedAt,
      total: currentJob.total,
      processed: currentJob.processed,
      successful: currentJob.successful,
      failed: currentJob.failed,
      skipped: currentJob.skipped,
      currentProductId: currentJob.currentProductId,
      progress: currentJob.total > 0 
        ? Math.round((currentJob.processed / currentJob.total) * 100) 
        : 0
    }
  };
}

function stopJob() {
  if (!currentJob || currentJob.status !== 'running') {
    return { success: false, error: 'No running job to stop' };
  }
  
  stopRequested = true;
  log(`[TranslationJob] Stop requested for job ${currentJob.id}`);
  
  return { success: true, message: 'Stop requested' };
}

function getJobHistory(limit = 10) {
  const jobsData = loadJobs();
  return jobsData.jobs.slice(0, limit).map(j => ({
    id: j.id,
    status: j.status,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    total: j.total,
    processed: j.processed,
    successful: j.successful,
    failed: j.failed,
    skipped: j.skipped
  }));
}

function getJobDetails(jobId) {
  const jobsData = loadJobs();
  const job = jobsData.jobs.find(j => j.id === jobId);
  return job || null;
}

module.exports = {
  getStats,
  runJob,
  getStatus,
  stopJob,
  getJobHistory,
  getJobDetails,
  translateSingleProduct
};
