/**
 * Feed Scheduler - Automatic feed running and auto-import
 * No external cron libraries - uses native setTimeout
 */

const fs = require('fs');
const path = require('path');
const petEligibility = require('./petEligibility');

// ENV Configuration with defaults (PRODUCTION SAFE MODE: all jobs disabled by default)
const CONFIG = {
  // Scheduler settings - CRITICAL: Default to FALSE in production safe mode
  AUTO_RUN_ON_START: process.env.FEEDS_AUTO_RUN_ON_START === 'true', // Default: false (disabled)
  AUTO_RUN_DAILY: process.env.FEEDS_AUTO_RUN_DAILY === 'true', // Default: false (disabled)
  DAILY_HOUR: parseInt(process.env.FEEDS_DAILY_HOUR || '3'),
  DAILY_TZ: process.env.FEEDS_DAILY_TZ || 'Europe/Amsterdam',
  RUN_COOLDOWN_MIN: parseInt(process.env.FEEDS_RUN_COOLDOWN_MIN || '60'),
  MAX_FEEDS_PER_RUN: parseInt(process.env.FEEDS_RUN_MAX_FEEDS || '10'),
  MAX_RESULTS_PER_RUN: parseInt(process.env.FEEDS_MAX_RESULTS_PER_RUN || '60'),
  
  // Global auto-import limits - CRITICAL: Default to FALSE in production safe mode
  AUTO_IMPORT_GLOBAL_ENABLED: process.env.FEEDS_AUTO_IMPORT_GLOBAL_ENABLED === 'true', // Default: false (disabled)
  AUTO_IMPORT_GLOBAL_MAX_PER_DAY: parseInt(process.env.FEEDS_AUTO_IMPORT_GLOBAL_MAX_PER_DAY || '25'),
  AUTO_IMPORT_GLOBAL_MAX_PER_RUN: parseInt(process.env.FEEDS_AUTO_IMPORT_GLOBAL_MAX_PER_RUN || '12'),
  AUTO_IMPORT_GLOBAL_DRYRUN_DEFAULT: process.env.FEEDS_AUTO_IMPORT_GLOBAL_DRYRUN_DEFAULT !== 'false'
};

// File paths
const FEEDS_FILE = path.join(__dirname, '..', 'data', 'cj-feeds.json');
const FEED_RUNNER_LOG = path.join(__dirname, '..', 'data', 'feed-runner.log');
const AUTO_IMPORT_LOG = path.join(__dirname, '..', 'data', 'auto-import.log');
const GLOBAL_STATS_FILE = path.join(__dirname, '..', 'data', 'feed-scheduler-stats.json');

// In-memory state
let schedulerState = {
  isRunning: false,
  lastScheduledRun: null,
  nextScheduledRun: null,
  dailyTimer: null,
  startupComplete: false
};

// Default auto-import config for feeds
const DEFAULT_AUTO_IMPORT = {
  enabled: false,
  maxPerRun: 5,
  maxPerDay: 10,
  dryRun: true,
  requireUS: false,
  requireImages: true,
  requireVariants: true,
  rejectNonPet: true
};

// Default auto-import stats
const DEFAULT_AUTO_IMPORT_STATS = {
  importedToday: 0,
  importedTodayDate: null,
  lastAutoImportAt: null,
  lastAutoImportCount: 0,
  totalImported: 0
};

// ============ LOGGING ============

function logToFile(filepath, entry) {
  try {
    const line = `[${new Date().toISOString()}] ${JSON.stringify(entry)}\n`;
    fs.appendFileSync(filepath, line);
  } catch (e) {
    console.error(`[FeedScheduler] Log write error: ${e.message}`);
  }
}

function logFeedRun(data) {
  logToFile(FEED_RUNNER_LOG, data);
}

function logAutoImport(data) {
  logToFile(AUTO_IMPORT_LOG, data);
}

// ============ GLOBAL STATS ============

function loadGlobalStats() {
  try {
    if (fs.existsSync(GLOBAL_STATS_FILE)) {
      return JSON.parse(fs.readFileSync(GLOBAL_STATS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return {
    totalImportedToday: 0,
    importedTodayDate: null,
    lastRunAt: null,
    lastRunReason: null,
    totalRuns: 0
  };
}

function saveGlobalStats(stats) {
  fs.writeFileSync(GLOBAL_STATS_FILE, JSON.stringify(stats, null, 2));
}

function getAmsterdamDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.DAILY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

function resetDailyStatsIfNeeded() {
  const today = getAmsterdamDate();
  const stats = loadGlobalStats();
  
  if (stats.importedTodayDate !== today) {
    stats.totalImportedToday = 0;
    stats.importedTodayDate = today;
    saveGlobalStats(stats);
  }
  
  return stats;
}

// ============ FEED DATA MODEL ============

function loadFeeds() {
  try {
    if (fs.existsSync(FEEDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf-8'));
      data.feeds = data.feeds.map(f => ({
        ...f,
        seenCjIds: f.seenCjIds || [],
        autoImport: { ...DEFAULT_AUTO_IMPORT, ...f.autoImport },
        autoImportStats: { ...DEFAULT_AUTO_IMPORT_STATS, ...f.autoImportStats },
        lastRunAt: f.lastRunAt || null,
        lastRunStatus: f.lastRunStatus || null,
        lastRunError: f.lastRunError || null,
        lastResultCount: f.lastResultCount || 0,
        lastNewCount: f.lastNewCount || 0
      }));
      return data;
    }
  } catch (e) {
    console.error(`[FeedScheduler] Load feeds error: ${e.message}`);
  }
  return { feeds: [], lastUpdated: null };
}

function saveFeeds(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(FEEDS_FILE, JSON.stringify(data, null, 2));
}

function addToSeenFIFO(feed, pids, maxSize = 2000) {
  const seenSet = new Set(feed.seenCjIds || []);
  pids.forEach(pid => seenSet.add(pid));
  
  let arr = [...seenSet];
  if (arr.length > maxSize) {
    arr = arr.slice(arr.length - maxSize);
  }
  
  feed.seenCjIds = arr;
}

// ============ QUALITY SCORING ============

function scoreProduct(product, feed) {
  let score = 50;
  
  if (product.productImage && !product.productImage.includes('placeholder')) {
    score += 15;
  }
  
  const imgs = product.productImageSet || [];
  if (imgs.length >= 3) score += 10;
  else if (imgs.length >= 1) score += 5;
  
  if (product.variants && product.variants.length > 0) {
    score += 10;
    if (product.variants.length >= 3) score += 5;
  }
  
  const cost = parseFloat(product.sellPrice) || 0;
  if (cost >= 5 && cost <= 50) score += 10;
  else if (cost > 50 && cost <= 100) score += 5;
  
  if (product.categoryName) {
    const cat = product.categoryName.toLowerCase();
    const petTerms = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'collar', 'leash', 'bowl', 'bed', 'toy'];
    if (petTerms.some(t => cat.includes(t))) score += 15;
  }
  
  const name = (product.productNameEn || product.productName || '').toLowerCase();
  const petNameTerms = ['dog', 'cat', 'pet', 'puppy', 'kitten', 'paw'];
  if (petNameTerms.some(t => name.includes(t))) score += 10;
  
  if (product.logisticPrice && parseFloat(product.logisticPrice) <= 5) {
    score += 5;
  }
  
  return Math.min(100, Math.max(0, score));
}

function filterAndScoreProducts(products, feed, importedPids) {
  const seenSet = new Set(feed.seenCjIds || []);
  const autoImport = feed.autoImport || {};
  const feedScopes = feed.allowedPetScopes || ['any_pet'];
  
  return products
    .filter(p => {
      if (importedPids.has(p.pid)) return false;
      if (seenSet.has(p.pid)) return false;
      
      if (autoImport.requireImages && !p.productImage) return false;
      
      if (autoImport.requireVariants) {
        const hasVariants = p.variants && p.variants.length > 0;
        if (!hasVariants) return false;
      }
      
      // Pet eligibility check
      if (autoImport.rejectNonPet !== false) {
        const eligibility = petEligibility.evaluateEligibility({
          title: p.productNameEn || p.productName,
          description: p.productDescEn || p.description,
          categoryName: p.categoryName,
          variants: p.variants,
          productImageSet: p.productImageSet
        }, { feedScopes });
        
        if (!eligibility.ok) {
          p._eligibilityBlocked = true;
          p._eligibilityReason = eligibility.denyReason;
          return false;
        }
        p._eligibility = eligibility;
      }
      
      return true;
    })
    .map(p => ({
      ...p,
      _qualityScore: scoreProduct(p, feed),
      isNew: true
    }))
    .sort((a, b) => b._qualityScore - a._qualityScore);
}

// ============ TIMEZONE HELPERS ============

function getNextDailyRunTime() {
  const now = new Date();
  
  // Get the current hour in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.DAILY_TZ,
    hour: 'numeric',
    hour12: false
  });
  const currentHour = parseInt(formatter.format(now));
  
  // Create a date formatter to get the current date in the target timezone
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.DAILY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Parse current date in target timezone
  let [year, month, day] = dateFormatter.format(now).split('-').map(Number);
  
  // If we've already passed the scheduled hour today, move to tomorrow
  if (currentHour >= CONFIG.DAILY_HOUR) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    [year, month, day] = dateFormatter.format(tomorrow).split('-').map(Number);
  }
  
  // Create the target date/time string in the target timezone
  // Format: "YYYY-MM-DD HH:00:00" interpreted as local time in the target TZ
  const targetStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(CONFIG.DAILY_HOUR).padStart(2,'0')}:00:00`;
  
  // Get the UTC offset for the target timezone at that date
  const tzOffset = getTimezoneOffset(CONFIG.DAILY_TZ, new Date(`${year}-${month}-${day}`));
  
  // Create the UTC date by adding the offset (tzOffset is negative when ahead of UTC)
  const targetDate = new Date(targetStr);
  targetDate.setMinutes(targetDate.getMinutes() + tzOffset);
  
  return targetDate;
}

function getTimezoneOffset(tz, date) {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  return (utcDate - tzDate) / (1000 * 60);
}

function msUntilNextRun() {
  const nextRun = getNextDailyRunTime();
  return Math.max(0, nextRun.getTime() - Date.now());
}

// ============ CORE RUN FUNCTIONS ============

async function runSingleFeed(feed, db, cjUrlImport, options = {}) {
  const { dryRun = false, maxResults = CONFIG.MAX_RESULTS_PER_RUN } = options;
  
  const now = new Date();
  const cooldownMs = CONFIG.RUN_COOLDOWN_MIN * 60 * 1000;
  
  if (feed.lastRunAt && !options.ignoreCooldown) {
    const lastRun = new Date(feed.lastRunAt);
    if (now - lastRun < cooldownMs) {
      return {
        ok: false,
        skipped: true,
        reason: 'cooldown',
        cooldownRemaining: Math.ceil((cooldownMs - (now - lastRun)) / 60000)
      };
    }
  }
  
  try {
    const result = await cjUrlImport.searchCatalog({
      keyword: feed.keyword,
      pageNum: 1,
      pageSize: Math.min(50, maxResults),
      usOnly: feed.filters?.usOnly,
      petOnly: feed.filters?.petOnly,
      requireImages: feed.filters?.requireImages,
      minPrice: feed.filters?.minPrice,
      maxPrice: feed.filters?.maxPrice,
      sort: feed.filters?.sort
    });
    
    const allProducts = await db.listProducts();
    const importedPids = new Set(allProducts.filter(p => p.cjPid).map(p => p.cjPid));
    const seenSet = new Set(feed.seenCjIds || []);
    
    const products = result.products.map(p => ({
      ...p,
      alreadyImported: importedPids.has(p.pid),
      isNew: !seenSet.has(p.pid),
      _qualityScore: scoreProduct(p, feed)
    }));
    
    const newCount = products.filter(p => p.isNew && !p.alreadyImported).length;
    
    feed.lastRunAt = now.toISOString();
    feed.lastRunStatus = 'success';
    feed.lastRunError = null;
    feed.lastResultCount = products.length;
    feed.lastNewCount = newCount;
    
    return {
      ok: true,
      products,
      total: result.total,
      newCount,
      resultCount: products.length
    };
    
  } catch (err) {
    feed.lastRunAt = now.toISOString();
    feed.lastRunStatus = 'error';
    feed.lastRunError = err.message;
    feed.lastResultCount = 0;
    feed.lastNewCount = 0;
    
    return {
      ok: false,
      error: err.message
    };
  }
}

async function runFeeds(db, cjUrlImport, options = {}) {
  const { reason = 'manual', maxFeeds = CONFIG.MAX_FEEDS_PER_RUN } = options;
  
  if (schedulerState.isRunning) {
    return { ok: false, error: 'Already running' };
  }
  
  schedulerState.isRunning = true;
  const runStart = new Date();
  
  const data = loadFeeds();
  const feeds = data.feeds.slice(0, maxFeeds);
  
  const results = {
    reason,
    startedAt: runStart.toISOString(),
    feedsProcessed: 0,
    feedsSucceeded: 0,
    feedsFailed: 0,
    feedsSkipped: 0,
    totalNewItems: 0,
    totalResults: 0,
    feedResults: [],
    autoImportResults: []
  };
  
  for (const feed of feeds) {
    const feedResult = await runSingleFeed(feed, db, cjUrlImport, {
      ignoreCooldown: reason === 'startup'
    });
    
    results.feedsProcessed++;
    
    if (feedResult.skipped) {
      results.feedsSkipped++;
      results.feedResults.push({
        feedId: feed.id,
        name: feed.name,
        status: 'skipped',
        reason: feedResult.reason,
        cooldownRemaining: feedResult.cooldownRemaining
      });
    } else if (feedResult.ok) {
      results.feedsSucceeded++;
      results.totalNewItems += feedResult.newCount || 0;
      results.totalResults += feedResult.resultCount || 0;
      
      results.feedResults.push({
        feedId: feed.id,
        name: feed.name,
        status: 'success',
        resultCount: feedResult.resultCount,
        newCount: feedResult.newCount
      });
      
      if (feed.autoImport?.enabled && CONFIG.AUTO_IMPORT_GLOBAL_ENABLED) {
        const autoResult = await autoImportNew(
          feed, 
          feedResult.products, 
          db, 
          cjUrlImport,
          { dryRun: feed.autoImport.dryRun ?? CONFIG.AUTO_IMPORT_GLOBAL_DRYRUN_DEFAULT }
        );
        results.autoImportResults.push({
          feedId: feed.id,
          ...autoResult
        });
      }
    } else {
      results.feedsFailed++;
      results.feedResults.push({
        feedId: feed.id,
        name: feed.name,
        status: 'error',
        error: feedResult.error
      });
    }
  }
  
  saveFeeds(data);
  
  results.completedAt = new Date().toISOString();
  results.durationMs = Date.now() - runStart.getTime();
  
  logFeedRun(results);
  
  const globalStats = resetDailyStatsIfNeeded();
  globalStats.lastRunAt = results.completedAt;
  globalStats.lastRunReason = reason;
  globalStats.totalRuns++;
  saveGlobalStats(globalStats);
  
  schedulerState.isRunning = false;
  schedulerState.lastScheduledRun = runStart.toISOString();
  
  return { ok: true, results };
}

// ============ AUTO-IMPORT ============

async function autoImportNew(feed, products, db, cjUrlImport, options = {}) {
  const { dryRun = true } = options;
  
  const today = getAmsterdamDate();
  const autoImport = feed.autoImport || DEFAULT_AUTO_IMPORT;
  const stats = feed.autoImportStats || { ...DEFAULT_AUTO_IMPORT_STATS };
  
  if (stats.importedTodayDate !== today) {
    stats.importedToday = 0;
    stats.importedTodayDate = today;
  }
  
  const globalStats = resetDailyStatsIfNeeded();
  
  const allProducts = await db.listProducts();
  const importedPids = new Set(allProducts.filter(p => p.cjPid).map(p => p.cjPid));
  
  const candidates = filterAndScoreProducts(products, feed, importedPids);
  
  const feedDailyRemaining = autoImport.maxPerDay - stats.importedToday;
  const globalDailyRemaining = CONFIG.AUTO_IMPORT_GLOBAL_MAX_PER_DAY - globalStats.totalImportedToday;
  const feedPerRunLimit = autoImport.maxPerRun;
  const globalPerRunLimit = CONFIG.AUTO_IMPORT_GLOBAL_MAX_PER_RUN;
  
  const maxToImport = Math.min(
    feedDailyRemaining,
    globalDailyRemaining,
    feedPerRunLimit,
    globalPerRunLimit,
    candidates.length
  );
  
  const toImport = candidates.slice(0, Math.max(0, maxToImport));
  
  const result = {
    dryRun,
    candidateCount: candidates.length,
    selectedCount: toImport.length,
    imported: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    importedProducts: []
  };
  
  if (toImport.length === 0) {
    result.reason = maxToImport <= 0 ? 'daily_limit_reached' : 'no_candidates';
    logAutoImport({ feedId: feed.id, feedName: feed.name, ...result });
    return result;
  }
  
  for (const product of toImport) {
    if (dryRun) {
      result.importedProducts.push({
        pid: product.pid,
        name: product.productNameEn || product.productName,
        score: product._qualityScore,
        dryRun: true
      });
      result.imported++;
      continue;
    }
    
    try {
      const importOptions = {
        overwrite: false,
        requireImages: autoImport.requireImages,
        rejectNonPet: autoImport.rejectNonPet,
        markFeatured: feed.defaults?.markFeatured || false,
        categoryPin: feed.defaults?.categoryPin || 'AUTO',
        subcatPin: feed.defaults?.subcatPin || 'AUTO'
      };
      
      const importResult = await cjUrlImport.importProduct(product.pid, db, importOptions);
      
      if (importResult.ok) {
        result.imported++;
        result.importedProducts.push({
          pid: product.pid,
          name: product.productNameEn || product.productName,
          score: product._qualityScore,
          productId: importResult.product?.id
        });
        
        stats.importedToday++;
        stats.totalImported++;
        globalStats.totalImportedToday++;
      } else if (importResult.skipped) {
        result.skipped++;
      } else {
        result.failed++;
        result.errors.push({ pid: product.pid, error: importResult.error });
      }
    } catch (err) {
      result.failed++;
      result.errors.push({ pid: product.pid, error: err.message });
    }
  }
  
  // Only mark products as seen if NOT a dry run
  if (!dryRun) {
    addToSeenFIFO(feed, toImport.map(p => p.pid));
    saveGlobalStats(globalStats);
  }
  
  stats.lastAutoImportAt = new Date().toISOString();
  stats.lastAutoImportCount = result.imported;
  feed.autoImportStats = stats;
  
  logAutoImport({ feedId: feed.id, feedName: feed.name, ...result });
  
  return result;
}

// ============ SCHEDULER ============

function scheduleDailyRun(db, cjUrlImport) {
  if (!CONFIG.AUTO_RUN_DAILY) {
    console.log('[FeedScheduler] Daily auto-run disabled');
    return;
  }
  
  const ms = msUntilNextRun();
  const nextRun = new Date(Date.now() + ms);
  
  schedulerState.nextScheduledRun = nextRun.toISOString();
  
  console.log(`[FeedScheduler] Next daily run scheduled for ${nextRun.toISOString()} (${Math.round(ms / 60000)} minutes)`);
  
  if (schedulerState.dailyTimer) {
    clearTimeout(schedulerState.dailyTimer);
  }
  
  schedulerState.dailyTimer = setTimeout(async () => {
    console.log('[FeedScheduler] Starting daily scheduled run...');
    try {
      await runFeeds(db, cjUrlImport, { reason: 'daily_schedule' });
    } catch (err) {
      console.error(`[FeedScheduler] Daily run error: ${err.message}`);
    }
    
    scheduleDailyRun(db, cjUrlImport);
  }, ms);
}

async function startupRun(db, cjUrlImport) {
  if (!CONFIG.AUTO_RUN_ON_START) {
    console.log('[FeedScheduler] Startup auto-run disabled');
    return null;
  }
  
  console.log('[FeedScheduler] Starting startup feed run...');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    const result = await runFeeds(db, cjUrlImport, { reason: 'startup' });
    schedulerState.startupComplete = true;
    return result;
  } catch (err) {
    console.error(`[FeedScheduler] Startup run error: ${err.message}`);
    schedulerState.startupComplete = true;
    return { ok: false, error: err.message };
  }
}

function initialize(db, cjUrlImport) {
  console.log('[FeedScheduler] Initializing...');
  console.log(`[FeedScheduler] Config: AUTO_RUN_ON_START=${CONFIG.AUTO_RUN_ON_START}, AUTO_RUN_DAILY=${CONFIG.AUTO_RUN_DAILY}, DAILY_HOUR=${CONFIG.DAILY_HOUR} ${CONFIG.DAILY_TZ}`);
  
  if (CONFIG.AUTO_RUN_ON_START) {
    setTimeout(() => startupRun(db, cjUrlImport), 10000);
  }
  
  scheduleDailyRun(db, cjUrlImport);
}

// ============ API HELPERS ============

function getSchedulerStats() {
  const globalStats = loadGlobalStats();
  const data = loadFeeds();
  
  let totalNewItems = 0;
  let totalSeenItems = 0;
  
  data.feeds.forEach(feed => {
    totalNewItems += feed.lastNewCount || 0;
    totalSeenItems += feed.seenCjIds?.length || 0;
  });
  
  return {
    config: {
      autoRunOnStart: CONFIG.AUTO_RUN_ON_START,
      autoRunDaily: CONFIG.AUTO_RUN_DAILY,
      dailyHour: CONFIG.DAILY_HOUR,
      dailyTz: CONFIG.DAILY_TZ,
      cooldownMin: CONFIG.RUN_COOLDOWN_MIN,
      maxFeedsPerRun: CONFIG.MAX_FEEDS_PER_RUN,
      autoImportEnabled: CONFIG.AUTO_IMPORT_GLOBAL_ENABLED,
      autoImportMaxPerDay: CONFIG.AUTO_IMPORT_GLOBAL_MAX_PER_DAY,
      autoImportMaxPerRun: CONFIG.AUTO_IMPORT_GLOBAL_MAX_PER_RUN,
      autoImportDryRunDefault: CONFIG.AUTO_IMPORT_GLOBAL_DRYRUN_DEFAULT
    },
    scheduler: {
      isRunning: schedulerState.isRunning,
      lastScheduledRun: schedulerState.lastScheduledRun,
      nextScheduledRun: schedulerState.nextScheduledRun,
      startupComplete: schedulerState.startupComplete
    },
    global: globalStats,
    summary: {
      feedCount: data.feeds.length,
      totalNewItems,
      totalSeenItems,
      todayImported: globalStats.totalImportedToday,
      todayDate: getAmsterdamDate()
    }
  };
}

function getFeedWithStats(feedId) {
  const data = loadFeeds();
  const feed = data.feeds.find(f => f.id === feedId);
  if (!feed) return null;
  
  return {
    ...feed,
    seenCount: feed.seenCjIds?.length || 0,
    autoImport: { ...DEFAULT_AUTO_IMPORT, ...feed.autoImport },
    autoImportStats: { ...DEFAULT_AUTO_IMPORT_STATS, ...feed.autoImportStats }
  };
}

function updateFeedAutoImport(feedId, autoImportConfig) {
  const data = loadFeeds();
  const feed = data.feeds.find(f => f.id === feedId);
  if (!feed) return null;
  
  feed.autoImport = {
    ...DEFAULT_AUTO_IMPORT,
    ...feed.autoImport,
    ...autoImportConfig
  };
  
  saveFeeds(data);
  return feed;
}

function getRecentLogs(type = 'runner', limit = 50) {
  const logFile = type === 'auto-import' ? AUTO_IMPORT_LOG : FEED_RUNNER_LOG;
  
  try {
    if (!fs.existsSync(logFile)) return [];
    
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    return lines.slice(-limit).reverse().map(line => {
      const match = line.match(/^\[([^\]]+)\] (.+)$/);
      if (match) {
        try {
          return { timestamp: match[1], data: JSON.parse(match[2]) };
        } catch (e) {
          return { timestamp: match[1], data: match[2] };
        }
      }
      return { raw: line };
    });
  } catch (e) {
    return [];
  }
}

module.exports = {
  CONFIG,
  initialize,
  runFeeds,
  runSingleFeed,
  autoImportNew,
  getSchedulerStats,
  getFeedWithStats,
  updateFeedAutoImport,
  getRecentLogs,
  loadFeeds,
  saveFeeds,
  DEFAULT_AUTO_IMPORT,
  DEFAULT_AUTO_IMPORT_STATS
};
