/*
========================================================
  GetPawsy PRO+ — Admin Panel 1-Click Installer
========================================================
Creates:
  ✔ views/admin.html
  ✔ public/css/admin.css
  ✔ routes/admin.js
Patches:
  ✔ server.js — adds admin router automatically

Author: ChatGPT Ultra-PRO
*/

const fs = require("fs");
const path = require("path");

console.log("🐾 Starting GetPawsy Admin Panel Installer…");

//
// Helper to safely write files (creates folders if needed)
//
function writeFileSafe(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log("✔ Created:", filePath);
}

//
// 1. CREATE admin.html
//
writeFileSafe(
  "views/admin.html",
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>GetPawsy Admin</title>
  <link rel="stylesheet" href="/css/admin.css" />
</head>

<body>
  <div class="admin-container">
    <h1>🐾 GetPawsy Admin Panel</h1>
    <p>Welcome, admin!</p>

    <div class="admin-grid">

      <a class="card" href="/dashboard" target="_blank">
        <h2>📊 Dashboard</h2>
        <p>System monitoring panel</p>
      </a>

      <a class="card" href="/logs" target="_blank">
        <h2>📁 Logs</h2>
        <p>View system & server logs</p>
      </a>

      <a class="card" href="/tools/images" target="_blank">
        <h2>🖼 Image Manager</h2>
        <p>Manage & optimize hero images</p>
      </a>

      <a class="card" href="/tools/seo" target="_blank">
        <h2>✍ AI SEO Generator</h2>
        <p>Generate product descriptions</p>
      </a>

      <a class="card" href="/tools/breakpoints" target="_blank">
        <h2>📱 Breakpoint Lab</h2>
        <p>Preview responsive views</p>
      </a>

      <a class="card" href="/settings" target="_blank">
        <h2>⚙ Settings</h2>
        <p>System configuration</p>
      </a>

    </div>
  </div>
</body>
</html>`
);

//
// 2. CREATE admin.css
//
writeFileSafe(
  "public/css/admin.css",
`body {
  background: #f4f7f9;
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 40px;
}

.admin-container { max-width: 900px; margin: auto; }

h1 { font-size: 32px; margin-bottom: 10px; }

.admin-grid {
  margin-top: 25px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  text-decoration: none;
  color: black;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: 0.2s;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.15);
}`
);

//
// 3. CREATE routes/admin.js
//
writeFileSafe(
  "routes/admin.js",
`const express = require("express");
const router = express.Router();

// Middleware: requires login
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect("/login");
}

router.get("/", requireAuth, (req, res) => {
  res.sendFile("admin.html", { root: "views" });
});

module.exports = router;
`
);

//
// 4. PATCH server.js to enable /admin router
//
const serverFile = "server.js";
let original = fs.readFileSync(serverFile, "utf8");

if (original.includes('routes/admin')) {
  console.log("✔ Admin router already installed — skipping patch.");
} else {
  console.log("⚙ Patching server.js …");

  const patch = `
const adminRouter = require("./routes/admin");
app.use("/admin", adminRouter);
`;

  // Insert router after existing app.use statements
  const position = original.indexOf("app.use");
  const updated =
    original.slice(0, position) + patch + "\n" + original.slice(position);

  fs.writeFileSync(serverFile, updated);
  console.log("✔ server.js patched successfully");
}

console.log("\n🎉 Admin Panel installation complete!");
console.log("➡ Visit: /admin once you restart the server.");
