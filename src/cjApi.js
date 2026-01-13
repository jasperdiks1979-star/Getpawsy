const https = require("https");
const fs = require("fs");
const path = require("path");
const { log } = require("./logger");

const CJ_API_BASE = process.env.CJ_API_BASE || "https://developers.cjdropshipping.com";
const CJ_EMAIL = process.env.CJ_EMAIL || "";
const CJ_PASSWORD = process.env.CJ_PASSWORD || "";
const CJ_API_KEY = process.env.CJ_API_KEY || "";
const CJ_TOKEN_CACHE = path.join(__dirname, "..", "data", "cj-token.json");
const DEBUG = process.env.CJ_DEBUG === "true";

let tokenCache = null;

function loadTokenCache() {
  try {
    if (fs.existsSync(CJ_TOKEN_CACHE)) {
      const data = JSON.parse(fs.readFileSync(CJ_TOKEN_CACHE, "utf-8"));
      if (data.expiry && data.expiry > Date.now()) {
        tokenCache = data;
        return data.token;
      }
    }
  } catch (e) {}
  return null;
}

function saveTokenCache(token, expiryMs = 86400000) {
  try {
    const dir = path.dirname(CJ_TOKEN_CACHE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CJ_TOKEN_CACHE, JSON.stringify({
      token,
      expiry: Date.now() + expiryMs,
      saved_at: new Date().toISOString()
    }, null, 2));
    tokenCache = { token, expiry: Date.now() + expiryMs };
  } catch (e) {
    if (DEBUG) log(`[CJ API] Token cache save error: ${e.message}`);
  }
}

async function httpsRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const options = {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "GetPawsy/1.0",
          ...headers
        },
        timeout: 10000
      };

      const req = https.request(urlObj, options, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => {
          if (DEBUG) log(`[CJ API] Response: ${res.statusCode}`);
          resolve({ statusCode: res.statusCode, body: data });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function getToken() {
  // Try env variable first
  if (process.env.CJ_TOKEN) {
    if (DEBUG) log(`[CJ API] Using CJ_TOKEN from env`);
    return process.env.CJ_TOKEN;
  }

  // Try cached token
  const cached = loadTokenCache();
  if (cached) {
    if (DEBUG) log(`[CJ API] Using cached token`);
    return cached;
  }

  // Attempt login
  if (!CJ_EMAIL || !CJ_PASSWORD) {
    log(`[CJ API] Missing CJ credentials (CJ_EMAIL or CJ_PASSWORD)`);
    return null;
  }

  const endpoints = [
    `${CJ_API_BASE}/user/login`,
    `${CJ_API_BASE}/api/user/login`,
    `${CJ_API_BASE}/v1/user/login`
  ];

  for (const endpoint of endpoints) {
    try {
      if (DEBUG) log(`[CJ API] Login attempt: ${endpoint}`);
      
      const res = await httpsRequest("POST", endpoint, {}, {
        email: CJ_EMAIL,
        password: CJ_PASSWORD
      });

      if (res.statusCode === 200) {
        try {
          const data = JSON.parse(res.body);
          const token = data.token || data.data?.token || data.accessToken;
          if (token) {
            saveTokenCache(token);
            log(`[CJ API] Login successful: ${endpoint}`);
            return token;
          }
        } catch (e) {}
      }
    } catch (err) {
      if (DEBUG) log(`[CJ API] Login failed: ${endpoint} - ${err.message}`);
    }
  }

  log(`[CJ API] All login endpoints failed`);
  return null;
}

async function createOrder(cjOrder) {
  if (!cjOrder) {
    log(`[CJ API] Invalid order object`);
    return { ok: false, error: "Invalid order" };
  }

  const token = await getToken();
  if (!token) {
    return { ok: false, error: "Authentication failed" };
  }

  const payload = {
    orderId: cjOrder.order_id,
    shippingAddress: cjOrder.shipping_address || {},
    items: cjOrder.items || [],
    currency: cjOrder.currency || "USD",
    source: cjOrder.source || "GetPawsy"
  };

  const endpoints = [
    `${CJ_API_BASE}/order/create`,
    `${CJ_API_BASE}/api/order/create`,
    `${CJ_API_BASE}/v1/order/create`,
    `${CJ_API_BASE}/dropshipping/order`
  ];

  for (const endpoint of endpoints) {
    try {
      if (DEBUG) log(`[CJ API] Create order attempt: ${endpoint}`);

      const res = await httpsRequest("POST", endpoint,
        { Authorization: `Bearer ${token}` },
        payload
      );

      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const data = JSON.parse(res.body);
          const orderId = data.orderId || data.data?.orderId || data.id;
          
          if (orderId) {
            log(`[CJ API] Order created: ${orderId} at ${endpoint}`);
            return {
              ok: true,
              orderId,
              endpoint,
              response: data
            };
          }
        } catch (e) {}
      }
      
      if (DEBUG) log(`[CJ API] Create failed: ${endpoint} (${res.statusCode})`);
    } catch (err) {
      if (DEBUG) log(`[CJ API] Create error: ${endpoint} - ${err.message}`);
    }
  }

  log(`[CJ API] Order creation failed for ${cjOrder.order_id}`);
  return { ok: false, error: "All endpoints failed" };
}

async function checkOrderStatus(cjOrderId) {
  const token = await getToken();
  if (!token) return null;

  const endpoints = [
    `${CJ_API_BASE}/order/status/${cjOrderId}`,
    `${CJ_API_BASE}/api/order/status/${cjOrderId}`,
    `${CJ_API_BASE}/v1/order/status/${cjOrderId}`
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await httpsRequest("GET", endpoint, {
        Authorization: `Bearer ${token}`
      });

      if (res.statusCode === 200) {
        try {
          const data = JSON.parse(res.body);
          return data;
        } catch (e) {}
      }
    } catch (err) {}
  }

  return null;
}

module.exports = { getToken, createOrder, checkOrderStatus };
