const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

const CACHE_DIR = path.join(__dirname, "..", "public", "cache", "images");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getHashFromUrl(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
}

function getExtension(url) {
  const match = url.match(/\.([a-z0-9]+)(\?|$)/i);
  if (!match) return "jpg";
  const ext = match[1].toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return ext;
  return "jpg";
}

async function downloadImage(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error("Too many redirects"));
    }
    
    const protocol = url.startsWith("https") ? https : http;
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
        'Referer': 'https://cjdropshipping.com/'
      }
    };
    
    const req = protocol.get(options, (res) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, url).href;
        return downloadImage(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

async function cacheImage(url) {
  if (!url || typeof url !== "string") return url;
  
  // Already a local URL, skip caching
  if (url.startsWith("/")) return url;
  
  ensureCacheDir();
  
  const hash = getHashFromUrl(url);
  const ext = getExtension(url);
  const filename = `${hash}.${ext}`;
  const filepath = path.join(CACHE_DIR, filename);
  const publicUrl = `/cache/images/${filename}`;
  
  // Already cached, return local URL
  if (fs.existsSync(filepath)) {
    return publicUrl;
  }
  
  try {
    const imageData = await downloadImage(url);
    fs.writeFileSync(filepath, imageData);
    return publicUrl;
  } catch (err) {
    console.warn(`[ImageCache] Failed to cache ${url}: ${err.message}`);
    return url; // Fallback to original URL
  }
}

module.exports = { cacheImage, ensureCacheDir };
