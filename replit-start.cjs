#!/usr/bin/env node
/**
 * replit-start.cjs - Robust auto-detect launcher for Replit deployments
 * 
 * Auto-detects the correct entrypoint and starts the server.
 * Passes all environment variables through to the child process.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENTRYPOINT_CANDIDATES = [
  'server.js',
  'bootstrap.js',
  'index.js',
  'src/server.js',
  'src/index.js',
  'dist/server.js',
  'dist/index.js',
  'build/server.js',
  'build/index.js',
  'app/server.js',
  'app/index.js'
];

function findEntrypoint() {
  for (const candidate of ENTRYPOINT_CANDIDATES) {
    const fullPath = path.join(process.cwd(), candidate);
    if (fs.existsSync(fullPath)) {
      return candidate;
    }
  }
  return null;
}

function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║          Replit Auto-Start Launcher v1.0               ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  
  const entrypoint = findEntrypoint();
  
  if (!entrypoint) {
    console.error('❌ ERROR: No valid entrypoint found!');
    console.error('');
    console.error('Searched for these files (in order):');
    ENTRYPOINT_CANDIDATES.forEach((candidate, i) => {
      console.error(`  ${i + 1}. ${candidate}`);
    });
    console.error('');
    console.error('Please create one of these files or update the launcher.');
    process.exit(1);
  }
  
  console.log(`✅ Found entrypoint: ${entrypoint}`);
  console.log(`📍 Working directory: ${process.cwd()}`);
  console.log(`🔧 Node version: ${process.version}`);
  console.log(`🌐 PORT: ${process.env.PORT || '5000 (default)'}`);
  console.log(`🔒 ENABLE_BACKGROUND_JOBS: ${process.env.ENABLE_BACKGROUND_JOBS || 'false (default)'}`);
  console.log('');
  console.log(`🚀 Starting: node ${entrypoint}`);
  console.log('─'.repeat(60));
  console.log('');
  
  const child = spawn(process.execPath, [entrypoint], {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd()
  });
  
  child.on('error', (err) => {
    console.error(`❌ Failed to start process: ${err.message}`);
    process.exit(1);
  });
  
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`\n⚠️ Process terminated by signal: ${signal}`);
      process.exit(1);
    }
    if (code !== 0) {
      console.error(`\n❌ Process exited with code: ${code}`);
    }
    process.exit(code || 0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    child.kill('SIGTERM');
  });
  
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    child.kill('SIGINT');
  });
}

main();
