#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function generateBuildId() {
  return crypto.randomBytes(3).toString("hex");
}

function getGitCommit() {
  try {
    return require("child_process")
      .execSync("git rev-parse --short HEAD", { encoding: "utf-8" })
      .trim();
  } catch (e) {
    return process.env.REPLIT_DEPLOYMENT_SHA?.slice(0, 7) || 
           process.env.GIT_COMMIT?.slice(0, 7) || 
           "unknown";
  }
}

const buildInfo = {
  frontend_build_id: generateBuildId(),
  frontend_built_at: new Date().toISOString(),
  git: getGitCommit(),
  generated_by: "scripts/write-build-json.js"
};

const publicDir = path.join(__dirname, "..", "public");
const outputPath = path.join(publicDir, "build.json");

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));

console.log(`✅ Frontend build.json written to ${outputPath}`);
console.log(`   Build ID: ${buildInfo.frontend_build_id}`);
console.log(`   Built at: ${buildInfo.frontend_built_at}`);
console.log(`   Git: ${buildInfo.git}`);
