const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const MEDIA_ROOT = path.join(__dirname, '..', 'public', 'media', 'products');
const MAX_IMAGE_SIZE = 25 * 1024 * 1024;
const MAX_VIDEO_SIZE = 80 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const CONCURRENCY_LIMIT = 4;

let activeDownloads = 0;
const downloadQueue = [];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}

function safeJoin(base, ...paths) {
  const joined = path.join(base, ...paths);
  const resolved = path.resolve(joined);
  const baseResolved = path.resolve(base);
  if (!resolved.startsWith(baseResolved)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function validateUrl(url) {
  if (!url || typeof url !== 'string') return { valid: false, reason: 'Empty or invalid URL' };
  const trimmed = url.trim();
  if (!trimmed) return { valid: false, reason: 'Empty URL after trim' };
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, reason: `Invalid protocol: ${parsed.protocol}` };
    }
    return { valid: true, url: trimmed };
  } catch (e) {
    return { valid: false, reason: `URL parse error: ${e.message}` };
  }
}

function normalizeCjUrl(url) {
  if (!url) return null;
  let cleaned = String(url).trim();
  cleaned = cleaned.replace(/^\[|\]$/g, '');
  cleaned = cleaned.replace(/^"|"$/g, '');
  cleaned = cleaned.replace(/\\"/g, '');
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch (e) {}
  cleaned = cleaned.replace(/\s+/g, '%20');
  return cleaned;
}

function getExtensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.webm'].includes(ext)) {
      return ext;
    }
  } catch (e) {}
  return '.jpg';
}

function urlHash(url) {
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
}

function downloadFile(url, outPath, maxSize = MAX_IMAGE_SIZE) {
  return new Promise((resolve, reject) => {
    const validation = validateUrl(url);
    if (!validation.valid) {
      return reject(new Error(validation.reason));
    }

    const parsedUrl = new URL(validation.url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      timeout: DOWNLOAD_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GetPawsy/1.0)',
        'Accept': 'image/*,video/*,*/*'
      }
    };

    const req = client.get(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, outPath, maxSize).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const contentLength = parseInt(res.headers['content-length'] || '0', 10);
      if (contentLength > maxSize) {
        res.destroy();
        return reject(new Error(`File too large: ${contentLength} bytes`));
      }

      ensureDir(path.dirname(outPath));
      const fileStream = fs.createWriteStream(outPath);
      let downloaded = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (downloaded > maxSize) {
          res.destroy();
          fileStream.destroy();
          fs.unlink(outPath, () => {});
          reject(new Error(`Download exceeded max size: ${downloaded} bytes`));
        }
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve({ success: true, path: outPath, size: downloaded });
      });

      fileStream.on('error', (err) => {
        fs.unlink(outPath, () => {});
        reject(err);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

async function downloadWithRetry(url, outPath, maxSize = MAX_IMAGE_SIZE, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await downloadFile(url, outPath, maxSize);
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.pow(2, attempt) * 500;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function processQueue() {
  while (downloadQueue.length > 0 && activeDownloads < CONCURRENCY_LIMIT) {
    const task = downloadQueue.shift();
    if (!task) break;
    
    activeDownloads++;
    try {
      const result = await downloadWithRetry(task.url, task.outPath, task.maxSize);
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      activeDownloads--;
      processQueue();
    }
  }
}

function queueDownload(url, outPath, maxSize = MAX_IMAGE_SIZE) {
  return new Promise((resolve, reject) => {
    downloadQueue.push({ url, outPath, maxSize, resolve, reject });
    processQueue();
  });
}

function getLocalMediaPath(productId, filename, type = 'images') {
  return `/media/products/${productId}/${type}/${filename}`;
}

function getLocalMediaFullPath(productId, filename, type = 'images') {
  return safeJoin(MEDIA_ROOT, productId, type, filename);
}

async function mirrorProductImages(product) {
  const productId = String(product.id || product.cj_pid);
  if (!productId) return { success: false, reason: 'No product ID' };

  const imageDir = safeJoin(MEDIA_ROOT, productId, 'images');
  ensureDir(imageDir);

  const results = { downloaded: 0, skipped: 0, failed: 0, localImages: [] };
  const sourceImages = Array.isArray(product.images) ? product.images : 
                       (product.image ? [product.image] : []);

  for (const imgUrl of sourceImages) {
    const normalized = normalizeCjUrl(imgUrl);
    if (!normalized) {
      results.skipped++;
      continue;
    }

    const validation = validateUrl(normalized);
    if (!validation.valid) {
      results.skipped++;
      continue;
    }

    const hash = urlHash(normalized);
    const ext = getExtensionFromUrl(normalized);
    const filename = sanitizeFilename(`${hash}${ext}`);
    const localPath = safeJoin(imageDir, filename);
    const publicPath = getLocalMediaPath(productId, filename, 'images');

    if (fs.existsSync(localPath)) {
      results.skipped++;
      results.localImages.push(publicPath);
      continue;
    }

    try {
      await queueDownload(normalized, localPath, MAX_IMAGE_SIZE);
      results.downloaded++;
      results.localImages.push(publicPath);
    } catch (err) {
      console.log(`[MediaMirror] Failed to download ${normalized}: ${err.message}`);
      results.failed++;
      results.localImages.push(normalized);
    }
  }

  return {
    success: true,
    productId,
    ...results
  };
}

async function mirrorProductVideos(product) {
  const productId = String(product.id || product.cj_pid);
  if (!productId) return { success: false, reason: 'No product ID' };

  const videoDir = safeJoin(MEDIA_ROOT, productId, 'videos');
  const results = { downloaded: 0, skipped: 0, failed: 0, localVideos: [] };
  const sourceVideos = Array.isArray(product.videos) ? product.videos : [];

  if (sourceVideos.length === 0) return results;

  ensureDir(videoDir);

  for (const vidUrl of sourceVideos) {
    const normalized = normalizeCjUrl(vidUrl);
    if (!normalized) {
      results.skipped++;
      continue;
    }

    const validation = validateUrl(normalized);
    if (!validation.valid) {
      results.skipped++;
      continue;
    }

    const hash = urlHash(normalized);
    const ext = getExtensionFromUrl(normalized) || '.mp4';
    const filename = sanitizeFilename(`${hash}${ext}`);
    const localPath = safeJoin(videoDir, filename);
    const publicPath = getLocalMediaPath(productId, filename, 'videos');

    if (fs.existsSync(localPath)) {
      results.skipped++;
      results.localVideos.push(publicPath);
      continue;
    }

    try {
      await queueDownload(normalized, localPath, MAX_VIDEO_SIZE);
      results.downloaded++;
      results.localVideos.push(publicPath);
    } catch (err) {
      console.log(`[MediaMirror] Failed to download video ${normalized}: ${err.message}`);
      results.failed++;
    }
  }

  return results;
}

function getLocalImagesForProduct(productId) {
  const imageDir = safeJoin(MEDIA_ROOT, String(productId), 'images');
  if (!fs.existsSync(imageDir)) return [];
  
  try {
    const files = fs.readdirSync(imageDir);
    return files
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .map(f => getLocalMediaPath(productId, f, 'images'));
  } catch (e) {
    return [];
  }
}

function getLocalVideosForProduct(productId) {
  const videoDir = safeJoin(MEDIA_ROOT, String(productId), 'videos');
  if (!fs.existsSync(videoDir)) return [];
  
  try {
    const files = fs.readdirSync(videoDir);
    return files
      .filter(f => /\.(mp4|mov|webm)$/i.test(f))
      .map(f => getLocalMediaPath(productId, f, 'videos'));
  } catch (e) {
    return [];
  }
}

function hasLocalMedia(productId) {
  const imageDir = safeJoin(MEDIA_ROOT, String(productId), 'images');
  if (!fs.existsSync(imageDir)) return false;
  try {
    const files = fs.readdirSync(imageDir);
    return files.length > 0;
  } catch (e) {
    return false;
  }
}

module.exports = {
  ensureDir,
  sanitizeFilename,
  safeJoin,
  validateUrl,
  normalizeCjUrl,
  downloadFile,
  downloadWithRetry,
  queueDownload,
  mirrorProductImages,
  mirrorProductVideos,
  getLocalMediaPath,
  getLocalMediaFullPath,
  getLocalImagesForProduct,
  getLocalVideosForProduct,
  hasLocalMedia,
  MEDIA_ROOT,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE
};
