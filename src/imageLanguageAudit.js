const Tesseract = require("tesseract.js");
const { log } = require("./logger");
const { upsertImageAudit, getImageAudit, getImageAuditsForProduct } = require("./aiDatabase");

const LANGUAGE_PATTERNS = {
  'en': /^[a-zA-Z0-9\s.,!?'"()\-:;%$@#&*+=\[\]{}|\\/<>]+$/,
  'de': /[äöüßÄÖÜ]/,
  'fr': /[àâçéèêëîïôùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŸŒÆ]/,
  'es': /[áéíóúñüÁÉÍÓÚÑÜ¿¡]/,
  'it': /[àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]/,
  'pt': /[ãõáéíóúâêôàçÃÕÁÉÍÓÚÂÊÔÀÇ]/,
  'nl': /[ëïéèüöäĳĲ]/,
  'pl': /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/,
  'ru': /[\u0400-\u04FF]/,
  'zh': /[\u4E00-\u9FFF]/,
  'ja': /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/,
  'ko': /[\uAC00-\uD7AF]/,
  'ar': /[\u0600-\u06FF]/
};

const COMMON_GERMAN_WORDS = ['und', 'der', 'die', 'das', 'für', 'mit', 'ist', 'von', 'nicht', 'bei', 'durch', 'größe', 'farbe', 'lieferung', 'kostenlos', 'versand', 'qualität', 'preis', 'stück', 'kaufen', 'jetzt', 'angebot', 'inkl', 'mwst', 'verfügbar', 'artikel', 'warenkorb', 'bestellung'];
const COMMON_FRENCH_WORDS = ['le', 'la', 'les', 'un', 'une', 'de', 'du', 'des', 'et', 'est', 'en', 'pour', 'avec', 'sur', 'dans', 'par', 'ou', 'mais', 'livraison', 'gratuit', 'acheter', 'panier', 'prix', 'offre', 'commande'];
const COMMON_SPANISH_WORDS = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'y', 'es', 'en', 'para', 'con', 'por', 'que', 'no', 'comprar', 'envío', 'gratis', 'precio', 'oferta', 'carrito', 'pedido'];

function detectLanguage(text) {
  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    return { lang: null, confidence: 0 };
  }
  
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(w => w.length > 1);
  
  if (words.length === 0) {
    return { lang: null, confidence: 0 };
  }
  
  if (LANGUAGE_PATTERNS.zh.test(text)) return { lang: 'zh', confidence: 0.9 };
  if (LANGUAGE_PATTERNS.ja.test(text)) return { lang: 'ja', confidence: 0.9 };
  if (LANGUAGE_PATTERNS.ko.test(text)) return { lang: 'ko', confidence: 0.9 };
  if (LANGUAGE_PATTERNS.ar.test(text)) return { lang: 'ar', confidence: 0.9 };
  if (LANGUAGE_PATTERNS.ru.test(text)) return { lang: 'ru', confidence: 0.9 };
  
  const germanWordCount = words.filter(w => COMMON_GERMAN_WORDS.includes(w)).length;
  const frenchWordCount = words.filter(w => COMMON_FRENCH_WORDS.includes(w)).length;
  const spanishWordCount = words.filter(w => COMMON_SPANISH_WORDS.includes(w)).length;
  
  if (LANGUAGE_PATTERNS.de.test(text) || germanWordCount >= 2) {
    return { lang: 'de', confidence: Math.min(0.7 + germanWordCount * 0.1, 0.95) };
  }
  if (LANGUAGE_PATTERNS.fr.test(text) || frenchWordCount >= 2) {
    return { lang: 'fr', confidence: Math.min(0.7 + frenchWordCount * 0.1, 0.95) };
  }
  if (LANGUAGE_PATTERNS.es.test(text) || spanishWordCount >= 2) {
    return { lang: 'es', confidence: Math.min(0.7 + spanishWordCount * 0.1, 0.95) };
  }
  if (LANGUAGE_PATTERNS.pt.test(text)) return { lang: 'pt', confidence: 0.7 };
  if (LANGUAGE_PATTERNS.it.test(text)) return { lang: 'it', confidence: 0.7 };
  if (LANGUAGE_PATTERNS.nl.test(text)) return { lang: 'nl', confidence: 0.7 };
  if (LANGUAGE_PATTERNS.pl.test(text)) return { lang: 'pl', confidence: 0.7 };
  
  if (LANGUAGE_PATTERNS.en.test(text)) {
    return { lang: 'en', confidence: 0.6 };
  }
  
  return { lang: 'en', confidence: 0.3 };
}

function isLikelyInfographic(text) {
  if (!text || typeof text !== 'string') return false;
  
  const cleaned = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const wordCount = cleaned.split(/\s+/).filter(w => w.length > 1).length;
  
  if (wordCount >= 5) return true;
  
  const infographicPatterns = [
    /\d+\s*%/,
    /\d+\s*(cm|mm|m|inch|in|ft|kg|g|lb|oz)/i,
    /\d+[x×]\d+/,
    /\d+\s*pcs?/i,
    /free\s+shipping/i,
    /kostenlos/i,
    /livraison\s+gratuite/i,
    /envío\s+gratis/i,
    /(step|schritt|étape|paso)\s*\d/i,
    /\d+\s*(pack|set|stück|piece)/i,
    /\bmaterial\b/i,
    /\bfeature/i,
    /\binstall/i,
    /\bhow\s+to\b/i,
    /\bspecification/i,
    /\bsize\s+chart\b/i,
    /\bcolor\s*:/i,
    /\bfarbe\s*:/i,
    /\bcouleur\s*:/i
  ];
  
  return infographicPatterns.some(pattern => pattern.test(cleaned));
}

function isLocalPath(input) {
  if (!input || typeof input !== 'string') return false;
  return input.startsWith('/') || 
         input.startsWith('./') || 
         input.startsWith('../') ||
         input.startsWith('cache/') ||
         /^[A-Za-z]:\\/.test(input);
}

function resolveImagePath(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  if (isLocalPath(imageUrl)) {
    const path = require('path');
    const fs = require('fs');
    const cleanPath = imageUrl.replace(/^\/+/, '');
    let fullPath = path.join(process.cwd(), 'public', cleanPath);
    if (fs.existsSync(fullPath)) return fullPath;
    fullPath = path.join(process.cwd(), cleanPath);
    if (fs.existsSync(fullPath)) return fullPath;
    return null;
  }
  return null;
}

async function analyzeImageText(imageUrl, productId = null) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return { hasText: false, lang: null, confidence: 0, isInfographic: false, ocrText: null };
  }
  
  try {
    if (productId) {
      const existing = await getImageAudit(productId, imageUrl);
      if (existing) {
        log(`[ImageAudit] Cache hit for ${productId}: ${imageUrl.slice(0, 50)}...`);
        return {
          hasText: !!existing.has_text,
          lang: existing.detected_lang,
          confidence: existing.confidence,
          isInfographic: !!existing.is_infographic,
          ocrText: existing.ocr_text
        };
      }
    }
    
    const resolvedPath = resolveImagePath(imageUrl);
    if (!resolvedPath) {
      log(`[ImageAudit] Skipping unresolvable path: ${imageUrl.slice(0, 80)}`);
      return { hasText: false, lang: null, confidence: 0, isInfographic: false, ocrText: null };
    }
    
    log(`[ImageAudit] Running OCR on ${resolvedPath.slice(0, 80)}...`);
    
    const result = await Tesseract.recognize(resolvedPath, 'eng+deu+fra+spa', {
      logger: () => {}
    });
    
    const text = result?.data?.text?.trim() || '';
    const confidence = result?.data?.confidence || 0;
    
    if (!text || text.length < 3 || confidence < 30) {
      const auditResult = { hasText: false, lang: null, confidence: 0, isInfographic: false, ocrText: null };
      if (productId) {
        await upsertImageAudit(productId, imageUrl, {
          has_text: false,
          detected_lang: null,
          confidence: 0,
          is_infographic: false,
          ocr_text: null
        });
      }
      return auditResult;
    }
    
    const langResult = detectLanguage(text);
    const isInfographic = isLikelyInfographic(text);
    
    const auditResult = {
      hasText: true,
      lang: langResult.lang,
      confidence: langResult.confidence,
      isInfographic,
      ocrText: text.slice(0, 500)
    };
    
    if (productId) {
      await upsertImageAudit(productId, imageUrl, {
        has_text: true,
        detected_lang: langResult.lang,
        confidence: langResult.confidence,
        is_infographic: isInfographic,
        ocr_text: text.slice(0, 500)
      });
    }
    
    log(`[ImageAudit] Result for ${imageUrl.slice(0, 50)}: lang=${langResult.lang}, infographic=${isInfographic}`);
    return auditResult;
    
  } catch (err) {
    log(`[ImageAudit] Error analyzing ${imageUrl}: ${err.message}`);
    return { hasText: false, lang: null, confidence: 0, isInfographic: false, ocrText: null, error: err.message };
  }
}

async function auditProductImages(productId, imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return [];
  }
  
  log(`[ImageAudit] Auditing ${imageUrls.length} images for product ${productId}`);
  
  const results = [];
  for (const url of imageUrls) {
    try {
      const result = await analyzeImageText(url, productId);
      results.push({ url, ...result });
    } catch (err) {
      log(`[ImageAudit] Failed to audit ${url}: ${err.message}`);
      results.push({ url, hasText: false, lang: null, confidence: 0, isInfographic: false, error: err.message });
    }
  }
  
  return results;
}

function filterImagesForLocale(auditResults, locale) {
  if (!Array.isArray(auditResults) || auditResults.length === 0) {
    return [];
  }
  
  const localeLang = locale?.split('-')[0]?.toLowerCase() || 'en';
  
  return auditResults.filter(audit => {
    if (!audit.has_text) return true;
    if (!audit.is_infographic) return true;
    if (!audit.detected_lang) return true;
    if (audit.detected_lang === localeLang) return true;
    if (audit.detected_lang === 'en') return true;
    return false;
  });
}

async function getFilteredImagesForProduct(productId, locale) {
  const audits = await getImageAuditsForProduct(productId);
  
  if (!audits || audits.length === 0) {
    return null;
  }
  
  const allowed = filterImagesForLocale(audits, locale);
  return allowed.map(a => a.image_url);
}

module.exports = {
  detectLanguage,
  isLikelyInfographic,
  analyzeImageText,
  auditProductImages,
  filterImagesForLocale,
  getFilteredImagesForProduct
};
