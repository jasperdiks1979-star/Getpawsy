const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SESSIONS_FILE = path.join(__dirname, "..", "data", "admin-sessions.json");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "gp_admin";

let sessions = {};

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
      const now = Date.now();
      for (const [token, expiry] of Object.entries(data)) {
        if (expiry > now) {
          sessions[token] = expiry;
        }
      }
    }
  } catch (err) {
    console.error("[AdminAuth] Failed to load sessions:", err.message);
    sessions = {};
  }
}

function saveSessions() {
  try {
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  } catch (err) {
    console.error("[AdminAuth] Failed to save sessions:", err.message);
  }
}

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  const expiry = Date.now() + SESSION_TTL_MS;
  sessions[token] = expiry;
  saveSessions();
  return { token, expiry };
}

function validateSession(token) {
  if (!token) return false;
  const expiry = sessions[token];
  if (!expiry) return false;
  if (Date.now() > expiry) {
    delete sessions[token];
    saveSessions();
    return false;
  }
  return true;
}

function destroySession(token) {
  if (token && sessions[token]) {
    delete sessions[token];
    saveSessions();
    return true;
  }
  return false;
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || null;
}

function getAdminKey() {
  return process.env.ADMIN_KEY || null;
}

function getAdminApiToken() {
  return process.env.ADMIN_API_TOKEN || null;
}

function isMagicLinkEnabled() {
  return process.env.ENABLE_ADMIN_MAGIC_LINK === "true";
}

function checkPassword(password) {
  const adminPassword = getAdminPassword();
  if (!adminPassword) return { valid: false, reason: "ADMIN_PASSWORD not configured" };
  if (password === adminPassword) return { valid: true };
  return { valid: false, reason: "Invalid password" };
}

function checkMagicKey(key) {
  if (!isMagicLinkEnabled()) return { valid: false, reason: "Magic link disabled" };
  const adminKey = getAdminKey();
  if (!adminKey) return { valid: false, reason: "ADMIN_KEY not configured" };
  if (key === adminKey) return { valid: true };
  return { valid: false, reason: "Invalid key" };
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function getTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const xAdminToken = req.headers["x-admin-token"];
  if (xAdminToken) {
    return String(xAdminToken).trim();
  }
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) {
    return String(cookieToken).trim();
  }
  return null;
}

function getCookieOptions(req) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS
  };
}

function requireAdminSession(req, res, next) {
  const expected = getAdminApiToken();
  
  if (!expected) {
    console.error("[AdminAuth] ADMIN_API_TOKEN not set!");
    return res.status(500).json({ 
      ok: false, 
      error: "ADMIN_API_TOKEN_NOT_SET",
      hint: "Set ADMIN_API_TOKEN in secrets"
    });
  }
  
  const provided = getTokenFromReq(req);
  
  // Foolproof fallback: accept token as "Bearer" or "x-admin-token" even without cookie
  if (!provided) {
    console.log(`[AdminAuth] 401 on ${req.method} ${req.path} - no token/cookie provided`);
    return res.status(401).json({ 
      ok: false, 
      error: "UNAUTHORIZED_ADMIN",
      hint: "Missing token or cookie. Login at /admin"
    });
  }
  
  if (!safeEqual(provided, expected)) {
    console.log(`[AdminAuth] 401 on ${req.method} ${req.path} - invalid token`);
    return res.status(401).json({ 
      ok: false, 
      error: "UNAUTHORIZED_ADMIN",
      hint: "Invalid token"
    });
  }
  
  req.isAdmin = true;
  req.adminAuthMethod = provided === req.cookies?.[COOKIE_NAME] ? "cookie" : "header";
  next();
}

loadSessions();

module.exports = {
  createSession,
  validateSession,
  destroySession,
  checkPassword,
  checkMagicKey,
  getCookieOptions,
  requireAdminSession,
  getAdminPassword,
  getAdminKey,
  getAdminApiToken,
  isMagicLinkEnabled,
  safeEqual,
  getTokenFromReq,
  COOKIE_NAME,
  SESSION_TTL_MS
};
