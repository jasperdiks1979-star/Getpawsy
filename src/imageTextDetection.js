/**
 * Image Text Detection Module
 * Detects text-heavy images (banners, promotional images with German text)
 * and reorders gallery to prioritize clean product photos
 * 
 * PRODUCTION SAFETY:
 * - Never throws errors - always returns safe result objects
 * - Supports DISABLE_IMAGETEXT=1 env flag to skip all analysis
 * - Handles both HTTP URLs and local file paths
 * - Timeouts on all network operations
 * - Concurrency limited to prevent deploy hangs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { log } = require('./logger');

const TIMEOUT = 12000;
const MIN_TEXT_CONFIDENCE = 50;
const TEXT_HEAVY_THRESHOLD = 0.15;
const BANNER_ASPECT_RATIO_MIN = 2.5;
const BANNER_ASPECT_RATIO_MAX = 0.4;
const MAX_CONCURRENCY = 2;

let Tesseract = null;
let tesseractWorker = null;
let activeAnalysisCount = 0;

function isDisabled() {
  return process.env.DISABLE_IMAGETEXT === '1' || process.env.DISABLE_IMAGETEXT === 'true';
}

function hasOpenAIKey() {
  return !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}

function isLocalPath(input) {
  if (!input || typeof input !== 'string') return false;
  return input.startsWith('/') || 
         input.startsWith('./') || 
         input.startsWith('../') ||
         input.startsWith('cache/') ||
         /^[A-Za-z]:\\/.test(input);
}

function isHttpUrl(input) {
  if (!input || typeof input !== 'string') return false;
  return input.startsWith('http://') || input.startsWith('https://');
}

function safeResult(url, extra = {}) {
  return {
    ok: false,
    url: url || '',
    hasText: false,
    textContent: '',
    textRatio: 0,
    confidence: 0,
    isBanner: false,
    score: 0,
    ...extra
  };
}

async function initTesseract() {
  if (tesseractWorker) return tesseractWorker;
  
  try {
    Tesseract = require('tesseract.js');
    tesseractWorker = await Tesseract.createWorker('deu+eng', 1, {
      logger: () => {}
    });
    log('[ImageText] Tesseract worker initialized');
    return tesseractWorker;
  } catch (err) {
    log(`[ImageText] Failed to init Tesseract: ${err.message}`);
    return null;
  }
}

async function terminateTesseract() {
  if (tesseractWorker) {
    try {
      await tesseractWorker.terminate();
      tesseractWorker = null;
      log('[ImageText] Tesseract worker terminated');
    } catch (err) {
      log(`[ImageText] Error terminating Tesseract: ${err.message}`);
    }
  }
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    if (!isHttpUrl(url)) {
      reject(new Error('Invalid URL: not an HTTP/HTTPS URL'));
      return;
    }
    
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, { timeout: TIMEOUT }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) {
          reject(new Error('Redirect without location header'));
          return;
        }
        downloadImage(location).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function readLocalImage(filePath) {
  return new Promise((resolve, reject) => {
    const normalizedPath = filePath.startsWith('/') ? filePath : path.join(process.cwd(), filePath);
    
    fs.access(normalizedPath, fs.constants.R_OK, (err) => {
      if (err) {
        reject(new Error(`File not readable: ${normalizedPath}`));
        return;
      }
      
      fs.readFile(normalizedPath, (err, data) => {
        if (err) {
          reject(new Error(`Read error: ${err.message}`));
          return;
        }
        resolve(data);
      });
    });
  });
}

async function getImageBuffer(imageSource) {
  if (isHttpUrl(imageSource)) {
    return await downloadImage(imageSource);
  }
  
  if (isLocalPath(imageSource)) {
    return await readLocalImage(imageSource);
  }
  
  throw new Error(`Unknown image source type: ${imageSource?.substring(0, 50)}`);
}

async function analyzeImageForText(imageUrl) {
  if (isDisabled()) {
    return safeResult(imageUrl, { ok: false, reason: 'disabled' });
  }
  
  if (!imageUrl || typeof imageUrl !== 'string') {
    return safeResult(imageUrl, { ok: false, reason: 'invalid-input' });
  }
  
  if (activeAnalysisCount >= MAX_CONCURRENCY) {
    return safeResult(imageUrl, { ok: false, reason: 'concurrency-limit' });
  }
  
  activeAnalysisCount++;
  
  const result = {
    ok: true,
    url: imageUrl,
    hasText: false,
    textContent: '',
    textRatio: 0,
    confidence: 0,
    isBanner: false,
    score: 0
  };
  
  try {
    const urlLower = imageUrl.toLowerCase();
    if (urlLower.includes('banner') || urlLower.includes('promo') || 
        urlLower.includes('sale') || urlLower.includes('offer') ||
        urlLower.includes('aktion') || urlLower.includes('rabatt')) {
      result.isBanner = true;
      result.score += 30;
    }
    
    const worker = await initTesseract();
    if (!worker) {
      result.ok = false;
      result.reason = 'tesseract-unavailable';
      return result;
    }
    
    let imageBuffer;
    try {
      imageBuffer = await getImageBuffer(imageUrl);
    } catch (bufferErr) {
      if (isLocalPath(imageUrl)) {
        log(`[ImageText] Local file not found: ${imageUrl}`);
        result.ok = false;
        result.reason = 'missing-file';
        return result;
      }
      throw bufferErr;
    }
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCR timeout')), TIMEOUT);
    });
    
    const recognizePromise = worker.recognize(imageBuffer);
    const { data } = await Promise.race([recognizePromise, timeoutPromise]);
    
    if (data.text && data.text.trim().length > 0) {
      result.textContent = data.text.trim();
      result.confidence = data.confidence || 0;
      
      const textLength = result.textContent.replace(/\s/g, '').length;
      const estimatedArea = 100 * 100;
      result.textRatio = textLength / estimatedArea;
      
      if (result.confidence >= MIN_TEXT_CONFIDENCE) {
        const germanPatterns = [
          /\b(und|oder|der|die|das|für|mit|von|bei|auf|aus|nach)\b/i,
          /\b(versand|lieferung|preis|angebot|rabatt|aktion|gratis|kostenlos)\b/i,
          /\b(neu|sale|top|best|garantie|qualität)\b/i,
          /[äöüß]/i,
          /\d+[,\.]\d{2}\s*€/,
          /€\s*\d+/
        ];
        
        const hasGermanText = germanPatterns.some(p => p.test(result.textContent));
        if (hasGermanText) {
          result.hasText = true;
          result.score += 40;
        }
        
        if (textLength > 50) {
          result.hasText = true;
          result.score += 20;
        }
        
        if (textLength > 100) {
          result.score += 20;
        }
      }
    }
    
  } catch (err) {
    log(`[ImageText] Error analyzing ${imageUrl?.substring(0, 80)}: ${err.message}`);
    result.ok = false;
    result.reason = 'error';
    result.error = err.message;
  } finally {
    activeAnalysisCount--;
  }
  
  return result;
}

async function analyzeImageByHeuristics(imageUrl) {
  if (isDisabled()) {
    return { url: imageUrl, isBanner: false, score: 0, ok: false, reason: 'disabled' };
  }
  
  const result = {
    ok: true,
    url: imageUrl || '',
    isBanner: false,
    score: 0
  };
  
  try {
    if (!imageUrl || typeof imageUrl !== 'string') {
      result.ok = false;
      result.reason = 'invalid-input';
      return result;
    }
    
    const urlLower = imageUrl.toLowerCase();
    
    const bannerKeywords = [
      'banner', 'promo', 'sale', 'offer', 'deal', 'ad', 'advert',
      'aktion', 'rabatt', 'angebot', 'werbung', 'header', 'slider'
    ];
    
    for (const keyword of bannerKeywords) {
      if (urlLower.includes(keyword)) {
        result.isBanner = true;
        result.score += 30;
        break;
      }
    }
    
    const textKeywords = ['text', 'info', 'beschreibung', 'detail'];
    for (const keyword of textKeywords) {
      if (urlLower.includes(keyword)) {
        result.score += 15;
        break;
      }
    }
  } catch (err) {
    log(`[ImageText] Heuristics error: ${err.message}`);
    result.ok = false;
    result.reason = 'error';
  }
  
  return result;
}

async function reorderGalleryImages(images, mainImage, options = {}) {
  if (isDisabled()) {
    return { images: images || [], mainImage, reordered: false, reason: 'disabled' };
  }
  
  const { 
    useOCR = false,
    maxOCRImages = 5
  } = options;
  
  if (!images || images.length === 0) {
    return { images: [], mainImage, reordered: false };
  }
  
  try {
    const allImages = mainImage && !images.includes(mainImage) 
      ? [mainImage, ...images] 
      : [...images];
    
    if (allImages.length <= 1) {
      return { 
        images: allImages.slice(1), 
        mainImage: allImages[0] || mainImage, 
        reordered: false 
      };
    }
    
    const imageScores = [];
    
    for (let i = 0; i < allImages.length; i++) {
      const url = allImages[i];
      let analysis;
      
      if (useOCR && i < maxOCRImages) {
        analysis = await analyzeImageForText(url);
      } else {
        analysis = await analyzeImageByHeuristics(url);
      }
      
      imageScores.push({
        url,
        originalIndex: i,
        score: analysis.score || 0,
        isBanner: analysis.isBanner || false,
        hasText: analysis.hasText || false
      });
    }
    
    imageScores.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.originalIndex - b.originalIndex;
    });
    
    const sortedImages = imageScores.map(s => s.url);
    const newMainImage = sortedImages[0];
    const newGallery = sortedImages.slice(1);
    
    const wasReordered = newMainImage !== (mainImage || allImages[0]);
    
    if (wasReordered) {
      log(`[ImageText] Reordered gallery: ${newMainImage?.substring(0, 50)}... is now main`);
    }
    
    return {
      images: newGallery,
      mainImage: newMainImage,
      reordered: wasReordered,
      scores: imageScores
    };
  } catch (err) {
    log(`[ImageText] Reorder error: ${err.message}`);
    return { images: images || [], mainImage, reordered: false, error: err.message };
  }
}

async function processProductImages(product, options = {}) {
  if (isDisabled()) {
    return null;
  }
  
  if (!product) return null;
  
  const mainImage = product.image;
  const galleryImages = product.images || [];
  
  if (!mainImage && galleryImages.length === 0) {
    return null;
  }
  
  try {
    const result = await reorderGalleryImages(galleryImages, mainImage, options);
    
    if (result.reordered) {
      return {
        image: result.mainImage,
        images: result.images,
        imageAnalysis: {
          reordered: true,
          analyzedAt: new Date().toISOString(),
          scores: result.scores?.map(s => ({
            url: (s.url || '').substring(0, 80),
            score: s.score,
            isBanner: s.isBanner,
            hasText: s.hasText
          }))
        }
      };
    }
    
    return null;
  } catch (err) {
    log(`[ImageText] Error processing product ${product.id}: ${err.message}`);
    return null;
  }
}

async function analyzeProductBatch(products, options = {}) {
  if (isDisabled()) {
    return { processed: 0, reordered: 0, errors: 0, updates: [], reason: 'disabled' };
  }
  
  const results = {
    processed: 0,
    reordered: 0,
    errors: 0,
    updates: []
  };
  
  for (const product of products) {
    try {
      const update = await processProductImages(product, options);
      results.processed++;
      
      if (update) {
        results.reordered++;
        results.updates.push({
          productId: product.id,
          ...update
        });
      }
    } catch (err) {
      results.errors++;
      log(`[ImageText] Batch error for ${product.id}: ${err.message}`);
    }
  }
  
  return results;
}

module.exports = {
  initTesseract,
  terminateTesseract,
  analyzeImageForText,
  analyzeImageByHeuristics,
  reorderGalleryImages,
  processProductImages,
  analyzeProductBatch,
  isDisabled,
  isLocalPath,
  isHttpUrl
};
