const fs = require('fs');
const path = require('path');

const AUTOHEAL_DIR = path.join(process.cwd(), '.autoheal');
const SCREENSHOTS_DIR = path.join(AUTOHEAL_DIR, 'screenshots');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getFilePath(filename) {
  ensureDir(AUTOHEAL_DIR);
  return path.join(AUTOHEAL_DIR, filename);
}

function saveReport(report) {
  const filePath = getFilePath('last-report.json');
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}

function loadReport() {
  const filePath = getFilePath('last-report.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function saveTriage(triage) {
  const filePath = getFilePath('last-triage.json');
  fs.writeFileSync(filePath, JSON.stringify(triage, null, 2));
  return filePath;
}

function loadTriage() {
  const filePath = getFilePath('last-triage.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function appendFixLog(entry) {
  const filePath = getFilePath('fix-log.jsonl');
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
  fs.appendFileSync(filePath, line);
}

function getFixLogTail(lines = 200) {
  const filePath = getFilePath('fix-log.jsonl');
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.trim().split('\n').filter(Boolean);
    return allLines.slice(-lines).map(line => {
      try { return JSON.parse(line); } catch { return { raw: line }; }
    });
  } catch (e) {
    return [];
  }
}

function saveLastRunTime() {
  const filePath = getFilePath('last-run.json');
  fs.writeFileSync(filePath, JSON.stringify({ ranAt: new Date().toISOString() }));
}

function loadLastRunTime() {
  const filePath = getFilePath('last-run.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function getScreenshotsDir() {
  ensureDir(SCREENSHOTS_DIR);
  return SCREENSHOTS_DIR;
}

function listScreenshots() {
  ensureDir(SCREENSHOTS_DIR);
  return fs.readdirSync(SCREENSHOTS_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => `/api/admin/autoheal/screenshot/${f}`);
}

module.exports = {
  ensureDir,
  saveReport,
  loadReport,
  saveTriage,
  loadTriage,
  appendFixLog,
  getFixLogTail,
  saveLastRunTime,
  loadLastRunTime,
  getScreenshotsDir,
  listScreenshots,
  AUTOHEAL_DIR,
  SCREENSHOTS_DIR
};
