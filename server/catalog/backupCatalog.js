/**
 * Catalog Backup System
 * Creates timestamped backups with rotation (max 20)
 */

const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '../../data/backups');
const MAX_BACKUPS = 20;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .replace(/\..+/, '')
    .slice(0, 15);
}

function createBackup(catalogData, reason = 'manual') {
  ensureBackupDir();
  
  const timestamp = getTimestamp();
  const filename = `catalog.${timestamp}.${reason}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  
  try {
    const data = typeof catalogData === 'string' 
      ? catalogData 
      : JSON.stringify(catalogData, null, 2);
    
    fs.writeFileSync(filepath, data, 'utf8');
    console.log(`[Backup] Created: ${filename}`);
    
    // Rotate old backups
    rotateBackups();
    
    return { success: true, filename, filepath };
  } catch (err) {
    console.error('[Backup] Failed to create backup:', err.message);
    return { success: false, error: err.message };
  }
}

function rotateBackups() {
  ensureBackupDir();
  
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('catalog.') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        stat: fs.statSync(path.join(BACKUP_DIR, f))
      }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    
    // Remove oldest if over limit
    while (files.length > MAX_BACKUPS) {
      const oldest = files.pop();
      fs.unlinkSync(oldest.path);
      console.log(`[Backup] Rotated out: ${oldest.name}`);
    }
  } catch (err) {
    console.error('[Backup] Rotation error:', err.message);
  }
}

function listBackups() {
  ensureBackupDir();
  
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('catalog.') && f.endsWith('.json'))
      .map(f => {
        const filepath = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(filepath);
        return {
          filename: f,
          size: stat.size,
          sizeFormatted: formatBytes(stat.size),
          createdAt: stat.mtime.toISOString(),
          createdAtFormatted: stat.mtime.toLocaleString()
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return { success: true, backups: files };
  } catch (err) {
    console.error('[Backup] List error:', err.message);
    return { success: false, backups: [], error: err.message };
  }
}

function restoreBackup(filename) {
  ensureBackupDir();
  
  const backupPath = path.join(BACKUP_DIR, filename);
  const catalogPath = path.join(__dirname, '../../data/catalog.json');
  
  // Validate filename (security)
  if (filename.includes('..') || !filename.startsWith('catalog.')) {
    return { success: false, error: 'Invalid backup filename' };
  }
  
  if (!fs.existsSync(backupPath)) {
    return { success: false, error: 'Backup file not found' };
  }
  
  try {
    // First, backup current catalog before restore
    if (fs.existsSync(catalogPath)) {
      const currentData = fs.readFileSync(catalogPath, 'utf8');
      createBackup(currentData, 'pre-restore');
    }
    
    // Read backup and validate it's valid JSON
    const backupData = fs.readFileSync(backupPath, 'utf8');
    const parsed = JSON.parse(backupData);
    
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Invalid backup: not a product array' };
    }
    
    // Restore
    fs.writeFileSync(catalogPath, backupData, 'utf8');
    console.log(`[Backup] Restored from: ${filename} (${parsed.length} products)`);
    
    return { 
      success: true, 
      message: `Restored ${parsed.length} products from ${filename}`,
      productCount: parsed.length
    };
  } catch (err) {
    console.error('[Backup] Restore error:', err.message);
    return { success: false, error: err.message };
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getLastBackupTime() {
  const result = listBackups();
  if (result.success && result.backups.length > 0) {
    return result.backups[0].createdAt;
  }
  return null;
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  getLastBackupTime,
  ensureBackupDir
};
