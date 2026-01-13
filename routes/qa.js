const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROOF_BASE = path.join(__dirname, '../public/qa-proof');
const QA_TOKEN = process.env.QA_TOKEN || 'pawsy-qa-default';

function requireToken(req, res, next) {
  const token = req.headers['x-qa-token'] || req.query.token;
  if (token !== QA_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized - invalid or missing QA token' });
  }
  next();
}

router.post('/run', requireToken, (req, res) => {
  const mode = req.query.mode || 'fast';
  if (!['fast', 'full'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Use fast or full.' });
  }
  
  const runId = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  
  const child = spawn('node', ['qa/run-qa.js', `--mode=${mode}`], {
    cwd: path.join(__dirname, '..'),
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  
  res.json({ 
    runId, 
    mode,
    status: 'started',
    message: `QA ${mode} run started. Check /api/qa/latest for results.`
  });
});

router.get('/latest', requireToken, (req, res) => {
  const reportPath = path.join(PROOF_BASE, 'latest', 'report.json');
  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ error: 'No QA report found. Run QA first.' });
  }
  
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read report', details: err.message });
  }
});

router.get('/runs/:runId', requireToken, (req, res) => {
  const reportPath = path.join(PROOF_BASE, 'runs', req.params.runId, 'report.json');
  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ error: 'Run not found' });
  }
  
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read report', details: err.message });
  }
});

router.get('/screenshots', requireToken, (req, res) => {
  const latestDir = path.join(PROOF_BASE, 'latest');
  if (!fs.existsSync(latestDir)) {
    return res.json({ screenshots: [] });
  }
  
  const files = fs.readdirSync(latestDir).filter(f => f.endsWith('.png'));
  res.json({ 
    screenshots: files.map(f => `/qa-proof/latest/${f}`)
  });
});

module.exports = router;
