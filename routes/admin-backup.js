/**
 * Admin Backup/Restore Routes
 */

const express = require('express');
const router = express.Router();
const { createBackup, listBackups, restoreBackup, getLastBackupTime } = require('../server/catalog/backupCatalog');

// List all backups
router.get('/', (req, res) => {
  try {
    const result = listBackups();
    const lastBackup = getLastBackupTime();
    
    res.json({
      success: result.success,
      backups: result.backups,
      lastBackupAt: lastBackup,
      error: result.error
    });
  } catch (err) {
    console.error('[Admin Backup] List error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create manual backup
router.post('/create', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const catalogPath = path.join(__dirname, '../data/catalog.json');
    
    if (!fs.existsSync(catalogPath)) {
      return res.status(404).json({ success: false, error: 'Catalog not found' });
    }
    
    const catalogData = fs.readFileSync(catalogPath, 'utf8');
    const result = createBackup(catalogData, 'manual');
    
    res.json(result);
  } catch (err) {
    console.error('[Admin Backup] Create error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restore from backup
router.post('/restore', (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Filename required' });
    }
    
    const result = restoreBackup(filename);
    
    if (result.success) {
      // Reload catalog in memory if using cached version
      try {
        delete require.cache[require.resolve('../data/catalog.json')];
      } catch (e) {
        // Ignore cache clear errors
      }
    }
    
    res.json(result);
  } catch (err) {
    console.error('[Admin Backup] Restore error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
