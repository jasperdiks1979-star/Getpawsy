const fs = require('fs');
const path = require('path');
const { getAction, getSnapshotsForAction, updateActionStatus, generateCorrelationId, createAction } = require('./db');

const CATALOG_FILE = path.join(process.cwd(), 'data', 'catalog.json');

function loadCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('[Rollback] Failed to load catalog:', e.message);
  }
  return { products: [], buildInfo: {} };
}

function saveCatalog(catalog) {
  const dir = path.dirname(CATALOG_FILE);
  const backupDir = path.join(process.cwd(), 'data', 'backups');
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `catalog-rollback-${timestamp}.json`);
  
  if (fs.existsSync(CATALOG_FILE)) {
    fs.copyFileSync(CATALOG_FILE, backupPath);
  }
  
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('catalog-') && f.endsWith('.json'))
    .sort()
    .reverse();
  
  if (backups.length > 20) {
    backups.slice(20).forEach(f => {
      try { fs.unlinkSync(path.join(backupDir, f)); } catch (e) {}
    });
  }
  
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}

async function rollbackAction(actionId, actor = 'admin') {
  const action = await getAction(actionId);
  
  if (!action) {
    return { ok: false, error: 'Action not found' };
  }
  
  if (action.status === 'rolled_back') {
    return { ok: false, error: 'Action already rolled back' };
  }
  
  if (action.status !== 'applied') {
    return { ok: false, error: `Cannot rollback action with status: ${action.status}` };
  }
  
  if (action.mode !== 'apply') {
    return { ok: false, error: 'Cannot rollback dry-run actions' };
  }
  
  const snapshots = await getSnapshotsForAction(actionId);
  
  if (snapshots.length === 0) {
    return { ok: false, error: 'No snapshots found for this action' };
  }
  
  const correlationId = generateCorrelationId();
  let restoredCount = 0;
  const errors = [];
  
  try {
    const catalog = loadCatalog();
    const products = catalog.products || [];
    const productMap = new Map(products.map(p => [p.product_id || p.id, p]));
    
    const restoredKeys = new Set();
    
    for (const snapshot of snapshots) {
      try {
        if (snapshot.table_name === 'products') {
          const beforeData = typeof snapshot.before_json === 'string' 
            ? JSON.parse(snapshot.before_json) 
            : snapshot.before_json;
          
          const key = snapshot.row_key;
          
          productMap.set(key, { ...beforeData });
          restoredKeys.add(key);
          restoredCount++;
        } else if (snapshot.table_name === 'feature-flags') {
          try {
            const flagsPath = path.join(process.cwd(), 'data', 'feature-flags.json');
            const beforeData = typeof snapshot.before_json === 'string' 
              ? JSON.parse(snapshot.before_json) 
              : snapshot.before_json;
            fs.writeFileSync(flagsPath, JSON.stringify(beforeData, null, 2));
            restoredCount++;
          } catch (flagErr) {
            errors.push({ snapshotId: snapshot.id, error: `feature-flags: ${flagErr.message}` });
          }
        }
      } catch (err) {
        errors.push({ snapshotId: snapshot.id, error: err.message });
      }
    }
    
    catalog.products = Array.from(productMap.values());
    catalog.buildInfo = catalog.buildInfo || {};
    catalog.buildInfo.lastRollback = new Date().toISOString();
    catalog.buildInfo.rollbackActionId = actionId;
    catalog.buildInfo.restoredProductKeys = Array.from(restoredKeys);
    saveCatalog(catalog);
    
    await updateActionStatus(actionId, 'rolled_back');
    
    await createAction({
      actor,
      level: action.level,
      action: `ROLLBACK_${action.action}`,
      mode: 'apply',
      targetCount: restoredCount,
      diffJson: { originalActionId: actionId, restoredCount, errors },
      correlationId
    }).then(a => updateActionStatus(a.id, 'applied'));
    
    return {
      ok: true,
      actionId,
      restoredCount,
      snapshotCount: snapshots.length,
      errors: errors.length > 0 ? errors : undefined,
      correlationId
    };
  } catch (error) {
    console.error('[Rollback] Failed:', error.message);
    return {
      ok: false,
      error: error.message,
      restoredCount,
      correlationId
    };
  }
}

async function getRollbackPreview(actionId) {
  const action = await getAction(actionId);
  
  if (!action) {
    return { ok: false, error: 'Action not found' };
  }
  
  const snapshots = await getSnapshotsForAction(actionId);
  
  return {
    ok: true,
    action: {
      id: action.id,
      action: action.action,
      status: action.status,
      mode: action.mode,
      targetCount: action.target_count,
      timestamp: action.ts
    },
    canRollback: action.status === 'applied' && action.mode === 'apply',
    snapshotCount: snapshots.length,
    snapshots: snapshots.slice(0, 10).map(s => ({
      id: s.id,
      tableName: s.table_name,
      rowKey: s.row_key,
      beforePreview: typeof s.before_json === 'string' 
        ? JSON.parse(s.before_json).title || s.row_key
        : s.before_json.title || s.row_key
    }))
  };
}

module.exports = {
  rollbackAction,
  getRollbackPreview
};
