"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const LOCK_FILE = path.join("/tmp", ".cj_resync.lock");
const MAX_LOG_LINES = 200;
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

const state = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  lastSummary: null,
  logLines: [],
  exitCode: null,
  error: null
};

function isLocked() {
  if (!fs.existsSync(LOCK_FILE)) return false;
  try {
    const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    const age = Date.now() - lockData.startedAt;
    if (age > LOCK_STALE_MS) {
      console.log("[CJ Resync] Stale lock detected, removing");
      fs.unlinkSync(LOCK_FILE);
      return false;
    }
    return true;
  } catch {
    fs.unlinkSync(LOCK_FILE);
    return false;
  }
}

function acquireLock() {
  if (isLocked()) return false;
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ startedAt: Date.now(), pid: process.pid }));
  return true;
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

function appendLog(line) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const entry = `[${timestamp}] ${line}`;
  state.logLines.push(entry);
  if (state.logLines.length > MAX_LOG_LINES) {
    state.logLines.shift();
  }
}

function startResync(options = {}) {
  if (state.status === "running") {
    return { ok: false, error: "Job already running" };
  }
  
  if (!acquireLock()) {
    return { ok: false, error: "Lock held by another process" };
  }

  state.status = "running";
  state.startedAt = Date.now();
  state.finishedAt = null;
  state.exitCode = null;
  state.error = null;
  state.logLines = [];
  state.lastSummary = null;

  appendLog("Starting CJ price resync...");

  const args = ["scripts/cj_sync.js"];
  if (options.limit) {
    args.push("--limit", String(options.limit));
  }

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    lines.forEach(line => appendLog(line));
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    lines.forEach(line => appendLog(`[ERR] ${line}`));
  });

  child.on("error", (err) => {
    state.error = err.message;
    state.status = "error";
    state.finishedAt = Date.now();
    appendLog(`Process error: ${err.message}`);
    releaseLock();
  });

  child.on("close", (code) => {
    state.exitCode = code;
    state.finishedAt = Date.now();
    const duration = ((state.finishedAt - state.startedAt) / 1000).toFixed(1);
    
    if (code === 0) {
      state.status = "success";
      state.lastSummary = {
        success: true,
        duration: `${duration}s`,
        finishedAt: new Date(state.finishedAt).toISOString()
      };
      appendLog(`Completed successfully in ${duration}s`);
    } else {
      state.status = "error";
      state.lastSummary = {
        success: false,
        exitCode: code,
        duration: `${duration}s`,
        finishedAt: new Date(state.finishedAt).toISOString()
      };
      appendLog(`Failed with exit code ${code} after ${duration}s`);
    }
    releaseLock();
  });

  return { ok: true, status: "running" };
}

function getStatus() {
  return {
    status: state.status,
    startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : null,
    finishedAt: state.finishedAt ? new Date(state.finishedAt).toISOString() : null,
    runningFor: state.status === "running" && state.startedAt 
      ? `${((Date.now() - state.startedAt) / 1000).toFixed(0)}s` 
      : null,
    lastSummary: state.lastSummary,
    logLines: state.logLines,
    exitCode: state.exitCode,
    error: state.error
  };
}

function getLogs() {
  return state.logLines.join("\n");
}

module.exports = {
  startResync,
  getStatus,
  getLogs,
  isLocked
};
