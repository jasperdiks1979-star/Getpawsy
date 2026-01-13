#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read version from package.json (single source of truth)
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const BUILD_VERSION = pkg.version;

function getCommitHash() {
  // Priority 1: Environment variables (most reliable in CI/CD)
  const envCommit = process.env.REPLIT_DEPLOYMENT_ID || 
                    process.env.GIT_COMMIT || 
                    process.env.REPLIT_GIT_COMMIT ||
                    process.env.VERCEL_GIT_COMMIT_SHA ||
                    process.env.GITHUB_SHA;
  
  if (envCommit && envCommit.length >= 7) {
    console.log(`[build-meta] Commit from env: ${envCommit.substring(0, 8)}`);
    return envCommit;
  }
  
  // Priority 2: Git command (works in dev with .git folder)
  try {
    const { execSync } = require('child_process');
    const gitCommit = execSync('git rev-parse HEAD 2>/dev/null', { encoding: 'utf8' }).trim();
    if (gitCommit && gitCommit.length >= 7) {
      console.log(`[build-meta] Commit from git: ${gitCommit.substring(0, 8)}`);
      return gitCommit;
    }
  } catch (e) {
    // Git not available
  }
  
  // Priority 3: Generate deterministic hash from package.json + server.js content
  try {
    const pkgContent = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
    const serverContent = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const hash = crypto.createHash('sha256')
      .update(pkgContent)
      .update(serverContent)
      .update(new Date().toISOString().slice(0, 10)) // Include date for uniqueness
      .digest('hex');
    console.log(`[build-meta] Commit from content hash: ${hash.substring(0, 8)}`);
    return 'build-' + hash.substring(0, 32);
  } catch (e) {
    console.warn('[build-meta] Could not generate content hash:', e.message);
  }
  
  // Fallback: timestamp-based (never "unknown")
  const timestamp = Date.now().toString(36);
  console.log(`[build-meta] Commit from timestamp: ts-${timestamp}`);
  return 'ts-' + timestamp;
}

function generateFingerprint() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GP-${dateStr}-${rand}`;
}

const commit = getCommitHash();
const commitShort = commit.length >= 8 ? commit.substring(0, 8) : commit;
const buildTime = new Date().toISOString();
const fingerprint = generateFingerprint();
const env = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT ? 'production' : 'development';

const buildMeta = {
  version: BUILD_VERSION,
  commit,
  commitShort,
  buildTime,
  fingerprint,
  env,
  node: process.version
};

// Write to public folder for server and frontend access
const outputPath = path.join(__dirname, '..', 'public', 'build-meta.json');
fs.writeFileSync(outputPath, JSON.stringify(buildMeta, null, 2));
console.log(`[build-meta] Written to ${outputPath}`);
console.log(`[build-meta] Version: ${BUILD_VERSION}, Commit: ${commitShort}, Env: ${env}`);

// Also write fingerprint to build.txt for legacy compatibility
const buildTxtPath = path.join(__dirname, '..', 'public', 'build.txt');
fs.writeFileSync(buildTxtPath, fingerprint);

module.exports = buildMeta;
