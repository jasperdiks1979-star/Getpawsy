const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(__dirname, "..", "data", "admin-actions.log");

function logAdminAction(action, details = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    action,
    ...details
  };
  
  const line = JSON.stringify(entry) + "\n";
  
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (err) {
    console.error("[AdminLogger] Write error:", err.message);
  }
}

function getAdminLogs(limit = 100) {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const content = fs.readFileSync(LOG_PATH, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).reverse().map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch (err) {
    console.error("[AdminLogger] Read error:", err.message);
    return [];
  }
}

module.exports = { logAdminAction, getAdminLogs };
