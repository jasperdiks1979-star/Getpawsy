const fs = require('fs');
const path = require('path');
const { ensureDir, AUTOHEAL_DIR } = require('./storage');

const SNAPSHOTS_DIR = path.join(AUTOHEAL_DIR, 'snapshots');
const MAX_SNAPSHOTS = 50;

function getSnapshotPath(runId) {
  ensureDir(SNAPSHOTS_DIR);
  return path.join(SNAPSHOTS_DIR, `${runId}.json`);
}

function createSnapshot(runId, records, fixType) {
  const snapshot = {
    runId,
    fixType,
    timestamp: new Date().toISOString(),
    recordCount: records.length,
    records: records.map(r => ({
      id: r.id,
      data: { ...r }
    }))
  };
  
  try {
    const filePath = getSnapshotPath(runId);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    
    cleanupOldSnapshots();
    
    return { ok: true, snapshotId: runId, recordCount: records.length };
  } catch (err) {
    console.error('[Snapshot] Failed to create:', err.message);
    return { ok: false, error: err.message };
  }
}

function loadSnapshot(runId) {
  try {
    const filePath = getSnapshotPath(runId);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error('[Snapshot] Failed to load:', err.message);
  }
  return null;
}

function listSnapshots() {
  try {
    ensureDir(SNAPSHOTS_DIR);
    const files = fs.readdirSync(SNAPSHOTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(SNAPSHOTS_DIR, f);
        const stat = fs.statSync(filePath);
        return {
          runId: f.replace('.json', ''),
          file: f,
          createdAt: stat.mtime.toISOString(),
          size: stat.size
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return files;
  } catch (err) {
    console.error('[Snapshot] Failed to list:', err.message);
    return [];
  }
}

function cleanupOldSnapshots() {
  try {
    const snapshots = listSnapshots();
    if (snapshots.length > MAX_SNAPSHOTS) {
      const toRemove = snapshots.slice(MAX_SNAPSHOTS);
      for (const snap of toRemove) {
        const filePath = path.join(SNAPSHOTS_DIR, snap.file);
        fs.unlinkSync(filePath);
      }
      console.log(`[Snapshot] Cleaned up ${toRemove.length} old snapshots`);
    }
  } catch (err) {
    console.error('[Snapshot] Cleanup failed:', err.message);
  }
}

function generateRunId() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const random = Math.random().toString(36).substring(2, 8);
  return `fix-${dateStr}-${random}`;
}

module.exports = {
  createSnapshot,
  loadSnapshot,
  listSnapshots,
  generateRunId,
  SNAPSHOTS_DIR
};
