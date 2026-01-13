const fs = require('fs');
const path = require('path');
const { FIX_ACTIONS, AUTOHEAL_CONFIG } = require('./types');
const { isActionAllowed, isSafeAction, getActionDescription } = require('./allowlist');
const { appendFixLog, loadTriage } = require('./storage');
const { 
  generateCorrelationId, 
  createAction, 
  updateActionStatus, 
  createSnapshot: createDbSnapshot,
  getAction
} = require('./db');
const { getEffectiveConfig } = require('./settings');

function loadCatalog() {
  const catalogPath = path.join(process.cwd(), 'data', 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    return { products: [], buildInfo: {} };
  }
  return JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
}

function saveCatalog(catalog) {
  const catalogPath = path.join(process.cwd(), 'data', 'catalog.json');
  const backupDir = path.join(process.cwd(), 'data', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `catalog-${timestamp}.json`);
  
  if (fs.existsSync(catalogPath)) {
    fs.copyFileSync(catalogPath, backupPath);
  }
  
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('catalog-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (backups.length > 20) {
    backups.slice(20).forEach(f => {
      fs.unlinkSync(path.join(backupDir, f));
    });
  }
  
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
}

async function runFix(actions, options = {}) {
  const { dryRun = false, maxFixes = AUTOHEAL_CONFIG.MAX_FIXES_PER_RUN, actor = 'admin' } = options;
  const config = getEffectiveConfig();
  const correlationId = generateCorrelationId();
  const mode = dryRun ? 'dry' : 'apply';
  
  const results = {
    ok: true,
    dryRun,
    timestamp: new Date().toISOString(),
    correlationId,
    actions: [],
    totalChanges: 0,
    errors: [],
    actionIds: []
  };

  let changeCount = 0;

  for (const action of actions) {
    if (changeCount >= maxFixes) {
      results.actions.push({
        type: action.type,
        status: 'skipped',
        reason: `Max fixes per run (${maxFixes}) reached`
      });
      continue;
    }

    if (!isActionAllowed(action.type)) {
      results.actions.push({
        type: action.type,
        status: 'rejected',
        reason: 'Action not in allowlist'
      });
      results.errors.push(`Action ${action.type} not allowed`);
      continue;
    }

    let dbAction = null;
    
    try {
      dbAction = await createAction({
        actor,
        level: config.level,
        action: action.type,
        mode,
        targetCount: 0,
        diffJson: { payload: action.payload },
        correlationId
      });
      results.actionIds.push(dbAction.id);
      
      const catalog = loadCatalog();
      const affectedProducts = getAffectedProducts(catalog, action);
      
      if (!dryRun && affectedProducts.length > 0) {
        for (const product of affectedProducts) {
          await createDbSnapshot(dbAction.id, 'products', product.product_id || product.id, product);
        }
      }
      
      const result = await executeAction(action, dryRun);
      
      results.actions.push({
        type: action.type,
        status: dryRun ? 'would_apply' : 'applied',
        description: getActionDescription(action.type),
        changes: result.changes,
        details: result.details,
        dbActionId: dbAction.id
      });
      changeCount += result.changes || 0;

      if (!dryRun) {
        await updateActionStatus(dbAction.id, 'applied');
        appendFixLog({
          action: action.type,
          payload: action.payload,
          changes: result.changes,
          status: 'applied',
          dbActionId: dbAction.id,
          correlationId
        });
      }
    } catch (err) {
      if (dbAction) {
        await updateActionStatus(dbAction.id, 'failed', err.message);
      }
      results.actions.push({
        type: action.type,
        status: 'error',
        error: err.message,
        dbActionId: dbAction?.id
      });
      results.errors.push(`${action.type}: ${err.message}`);
    }
  }

  results.totalChanges = changeCount;
  results.ok = results.errors.length === 0;

  return results;
}

function getAffectedProducts(catalog, action) {
  const products = catalog.products || [];
  const { type, payload = {} } = action;
  
  switch (type) {
    case FIX_ACTIONS.DISABLE_NON_PET_PRODUCTS: {
      let petOnlyEngine;
      try { petOnlyEngine = require('../lib/petOnlyEngine'); } catch (e) { petOnlyEngine = null; }
      return products.filter(p => {
        if (p.active === false) return false;
        if (p.is_pet_product === false) return true;
        if (petOnlyEngine && !petOnlyEngine.isPetApproved(p)) return true;
        return false;
      }).slice(0, 100);
    }
    case FIX_ACTIONS.REASSIGN_CATEGORY:
    case FIX_ACTIONS.REBUILD_RESOLVED_IMAGES:
    case FIX_ACTIONS.RECALC_PRICES:
      return products.filter(p => p.active !== false).slice(0, 100);
    default:
      return [];
  }
}

async function executeAction(action, dryRun) {
  const { type, payload = {} } = action;

  switch (type) {
    case FIX_ACTIONS.DISABLE_NON_PET_PRODUCTS:
      return disableNonPetProducts(dryRun, payload);
    
    case FIX_ACTIONS.REASSIGN_CATEGORY:
      return reassignCategories(dryRun, payload);
    
    case FIX_ACTIONS.REBUILD_RESOLVED_IMAGES:
      return rebuildResolvedImages(dryRun, payload);
    
    case FIX_ACTIONS.ENABLE_REMOTE_IMAGE_FALLBACK:
      return enableRemoteImageFallback(dryRun, payload);
    
    case FIX_ACTIONS.REGENERATE_SEO_FOR_MISSING:
      return queueSeoRegeneration(dryRun, payload);
    
    case FIX_ACTIONS.RECALC_PRICES:
      return recalcPrices(dryRun, payload);
    
    case FIX_ACTIONS.CLEAR_CACHE_REINDEX:
      return clearCacheReindex(dryRun, payload);
    
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

function disableNonPetProducts(dryRun, payload) {
  const catalog = loadCatalog();
  const products = catalog.products || [];
  
  let petOnlyEngine;
  try {
    petOnlyEngine = require('../lib/petOnlyEngine');
  } catch (e) {
    petOnlyEngine = null;
  }

  const toDisable = products.filter(p => {
    if (p.active === false) return false;
    if (p.is_pet_product === false) return true;
    if (petOnlyEngine && !petOnlyEngine.isPetApproved(p)) return true;
    return false;
  });

  const details = toDisable.slice(0, 20).map(p => ({
    id: p.id || p.product_id,
    title: p.title?.substring(0, 50),
    reason: p.is_pet_product === false ? 'not_pet_product' : 'failed_pet_filter'
  }));

  if (!dryRun && toDisable.length > 0) {
    toDisable.forEach(p => {
      p.active = false;
      p.disabled_by_autoheal = true;
      p.disabled_at = new Date().toISOString();
    });
    saveCatalog(catalog);
  }

  return { changes: toDisable.length, details };
}

function reassignCategories(dryRun, payload) {
  const catalog = loadCatalog();
  const products = catalog.products || [];
  
  const BLACKLIST_PATTERNS = [
    /sock/i, /chair/i, /office/i, /jewelry/i, /cosmetic/i, /alcohol/i,
    /human clothing/i, /furniture/i, /electronics/i, /plush toy/i,
    /home decor/i, /kitchen/i, /sports equipment/i, /tool/i, /automotive/i
  ];

  let changes = 0;
  const details = [];

  products.forEach(p => {
    if (p.active === false) return;
    
    const text = `${p.title || ''} ${p.description || ''} ${p.category || ''}`.toLowerCase();
    const matchesBlacklist = BLACKLIST_PATTERNS.some(pattern => pattern.test(text));
    
    if (matchesBlacklist) {
      if (!dryRun) {
        p.active = false;
        p.disabled_by_autoheal = true;
        p.blacklist_match = true;
      }
      changes++;
      details.push({
        id: p.id || p.product_id,
        title: p.title?.substring(0, 50),
        action: 'disabled_blacklist_match'
      });
    }
  });

  if (!dryRun && changes > 0) {
    saveCatalog(catalog);
  }

  return { changes, details: details.slice(0, 20) };
}

function rebuildResolvedImages(dryRun, payload) {
  const catalog = loadCatalog();
  const products = catalog.products || [];
  
  let changes = 0;
  const details = [];

  products.forEach(p => {
    const oldResolved = p.resolved_image;
    
    let newResolved = null;
    
    if (p.images && p.images.length > 0 && p.images[0]) {
      newResolved = p.images[0];
    } else if (p.thumbnails && p.thumbnails.length > 0 && p.thumbnails[0]) {
      newResolved = p.thumbnails[0];
    } else if (p.image) {
      newResolved = p.image;
    } else if (p.imageUrl) {
      newResolved = p.imageUrl;
    } else if (p.cj_image) {
      newResolved = p.cj_image;
    } else if (p.main_image) {
      newResolved = p.main_image;
    }
    
    if (!newResolved) {
      newResolved = '/images/placeholder-product.svg';
    }

    if (newResolved !== oldResolved) {
      if (!dryRun) {
        p.resolved_image = newResolved;
        p.primaryImageUrl = newResolved;
      }
      changes++;
      details.push({
        id: p.id || p.product_id,
        old: oldResolved?.substring(0, 50),
        new: newResolved?.substring(0, 50)
      });
    }
  });

  if (!dryRun && changes > 0) {
    saveCatalog(catalog);
  }

  return { changes, details: details.slice(0, 20) };
}

function enableRemoteImageFallback(dryRun, payload) {
  const configPath = path.join(process.cwd(), 'data', 'feature-flags.json');
  
  let flags = {};
  if (fs.existsSync(configPath)) {
    try {
      flags = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      flags = {};
    }
  }

  const wasEnabled = flags.REMOTE_IMAGE_FALLBACK === true;
  
  if (!wasEnabled) {
    if (!dryRun) {
      flags.REMOTE_IMAGE_FALLBACK = true;
      flags.updated_at = new Date().toISOString();
      fs.writeFileSync(configPath, JSON.stringify(flags, null, 2));
    }
    return { changes: 1, details: [{ flag: 'REMOTE_IMAGE_FALLBACK', value: true }] };
  }

  return { changes: 0, details: [{ flag: 'REMOTE_IMAGE_FALLBACK', status: 'already_enabled' }] };
}

function queueSeoRegeneration(dryRun, payload) {
  const catalog = loadCatalog();
  const products = catalog.products || [];
  const limit = payload.limit || 50;

  const needsSeo = products.filter(p => {
    if (p.active === false) return false;
    if (!p.description || p.description.length < 50) return true;
    if (!p.highlights || p.highlights.length === 0) return true;
    return false;
  }).slice(0, limit);

  const details = needsSeo.map(p => ({
    id: p.id || p.product_id,
    title: p.title?.substring(0, 50),
    reason: !p.description ? 'missing_description' : 'short_description'
  }));

  if (!dryRun && needsSeo.length > 0) {
    const queuePath = path.join(process.cwd(), 'data', 'seo-queue.json');
    const queue = needsSeo.map(p => p.id || p.product_id);
    fs.writeFileSync(queuePath, JSON.stringify({ queued: queue, queuedAt: new Date().toISOString() }, null, 2));
  }

  return { changes: needsSeo.length, details: details.slice(0, 20) };
}

function recalcPrices(dryRun, payload) {
  const catalog = loadCatalog();
  const products = catalog.products || [];
  
  let changes = 0;
  const details = [];

  products.forEach(p => {
    if (p.active === false) return;
    
    const price = parseFloat(p.price) || 0;
    const cost = parseFloat(p.cost) || 0;
    
    if (cost > 0 && price > 0) {
      const margin = (price - cost) / cost;
      
      if (margin < 0.1) {
        const suggestedPrice = Math.ceil(cost * 1.5 * 100) / 100;
        
        if (!dryRun) {
          p.price = suggestedPrice;
          p.price_recalculated = true;
          p.original_price = price;
        }
        
        changes++;
        details.push({
          id: p.id || p.product_id,
          oldPrice: price,
          newPrice: suggestedPrice,
          cost,
          reason: 'margin_too_low'
        });
      }
    }
  });

  if (!dryRun && changes > 0) {
    saveCatalog(catalog);
  }

  return { changes, details: details.slice(0, 20) };
}

function clearCacheReindex(dryRun, payload) {
  const cachePaths = [
    path.join(process.cwd(), 'data', 'search-cache.json'),
    path.join(process.cwd(), 'data', 'product-cache.json'),
    path.join(process.cwd(), 'data', 'homepage-cache.json')
  ];

  let cleared = 0;
  const details = [];

  cachePaths.forEach(cachePath => {
    if (fs.existsSync(cachePath)) {
      if (!dryRun) {
        fs.unlinkSync(cachePath);
      }
      cleared++;
      details.push({ path: path.basename(cachePath), action: 'cleared' });
    }
  });

  return { changes: cleared, details };
}

function validateFixPayload(fix) {
  if (!fix || typeof fix !== 'object') return false;
  if (typeof fix.type !== 'string') return false;
  if (!ALLOWED_FIX_ACTIONS.includes(fix.type)) return false;
  if (fix.payload !== undefined && typeof fix.payload !== 'object') return false;
  return true;
}

const ALLOWED_FIX_ACTIONS = Object.values(FIX_ACTIONS);

async function applySafeFixes() {
  const triage = loadTriage();
  if (!triage || !triage.triage || !triage.triage.safeFixes) {
    return {
      ok: false,
      error: 'No triage results found or no safe fixes recommended',
      timestamp: new Date().toISOString()
    };
  }

  if (!Array.isArray(triage.triage.safeFixes)) {
    return {
      ok: false,
      error: 'Invalid triage safeFixes format - expected array',
      timestamp: new Date().toISOString()
    };
  }

  const validFixes = triage.triage.safeFixes.filter(fix => {
    if (!validateFixPayload(fix)) {
      console.warn('[AutoHeal] Skipping invalid fix payload:', fix);
      return false;
    }
    return isSafeAction(fix.type);
  });
  
  if (validFixes.length === 0) {
    return {
      ok: true,
      message: 'No valid safe fixes to apply',
      timestamp: new Date().toISOString()
    };
  }

  return runFix(validFixes, { dryRun: false });
}

module.exports = {
  runFix,
  applySafeFixes,
  executeAction
};
