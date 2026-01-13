"use strict";

const fs = require("fs");
const path = require("path");
const cjResyncJob = require("./cjResyncJob");

const STATE_FILE = path.join(__dirname, "../../data/.cj_schedule_state.json");
const CHECK_INTERVAL_MS = 60 * 1000;

let checkTimer = null;

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch {}
  return { lastScheduledRun: null };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("[CJ Scheduler] Failed to save state:", e.message);
  }
}

function getTodayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function shouldRunNow(scheduleHour) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  return hour === scheduleHour && minute >= 30 && minute < 32;
}

function checkAndRun() {
  const schedule = process.env.CJ_RESYNC_SCHEDULE;
  if (schedule !== "daily") return;

  const scheduleHour = parseInt(process.env.CJ_RESYNC_HOUR || "3", 10);
  const state = loadState();
  const today = getTodayDateStr();

  if (state.lastScheduledRun === today) {
    return;
  }

  if (!shouldRunNow(scheduleHour)) {
    return;
  }

  if (cjResyncJob.isLocked()) {
    console.log("[CJ Scheduler] Skipping scheduled run - another run is active");
    return;
  }

  console.log("[CJ Scheduler] Starting scheduled daily resync...");
  const result = cjResyncJob.startResync();
  
  if (result.ok) {
    state.lastScheduledRun = today;
    saveState(state);
    console.log("[CJ Scheduler] Scheduled resync started successfully");
  } else {
    console.error("[CJ Scheduler] Failed to start:", result.error);
  }
}

function start() {
  const schedule = process.env.CJ_RESYNC_SCHEDULE;
  if (schedule !== "daily") {
    console.log("[CJ Scheduler] Disabled (CJ_RESYNC_SCHEDULE != daily)");
    return;
  }

  const scheduleHour = parseInt(process.env.CJ_RESYNC_HOUR || "3", 10);
  console.log(`[CJ Scheduler] Enabled - will run daily at ${scheduleHour}:30`);

  setImmediate(checkAndRun);

  checkTimer = setInterval(checkAndRun, CHECK_INTERVAL_MS);
}

function stop() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

module.exports = { start, stop };
