const express = require('express');
const router = express.Router();
const { requireAdminSession } = require('../src/adminAuth');
const { syncAllCjCosts, getSyncStatus } = require('../src/cjCostSync');

router.post('/sync-costs', requireAdminSession, express.json(), async (req, res) => {
  try {
    const { dryRun = true, limit = null } = req.body || {};
    
    console.log(`[CJ Costs] Starting sync (dryRun=${dryRun}, limit=${limit})`);
    
    const result = await syncAllCjCosts({ dryRun, limit });
    
    if (!result.ok) {
      return res.status(409).json(result);
    }
    
    console.log(`[CJ Costs] Sync complete: ${result.updated} updated, ${result.failed} failed`);
    
    res.json(result);
  } catch (err) {
    console.error('[CJ Costs] Sync error:', err);
    res.status(500).json({ ok: false, error: 'Sync failed', message: err.message });
  }
});

router.get('/sync-costs/status', requireAdminSession, (req, res) => {
  const status = getSyncStatus();
  res.json({ ok: true, ...status });
});

router.get('/costs/export.csv', requireAdminSession, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const csvPath = path.join(process.cwd(), 'public', 'downloads', 'getpawsy_cj_cost_export.csv');
  
  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ ok: false, error: 'No export file found. Run sync first.' });
  }
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="getpawsy_cj_cost_export.csv"');
  res.sendFile(csvPath);
});

module.exports = router;
