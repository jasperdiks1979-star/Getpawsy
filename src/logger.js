const fs = require("fs");
const path = require("path");

const LOG_PATH = path.join(__dirname, "..", "data", "app.log");

function ensureLogFile() {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "");
}

function log(message) {
  ensureLogFile();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_PATH, line);
}

function getLogs(limit = 200) {
  ensureLogFile();
  const content = fs.readFileSync(LOG_PATH, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  return lines.slice(-limit);
}

module.exports = { log, getLogs };
