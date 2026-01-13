const { db } = require("./db");
const { log } = require("./logger");
const translationStore = require("./translationStore");

const SUPPORTED_LANGS = ["en", "nl", "de", "fr", "es"];
const LANG_TO_LOCALE = {
  en: "en-US",
  nl: "nl-NL", 
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES"
};
const LOCALE_TO_LANG = {
  "en-US": "en",
  "nl-NL": "nl",
  "de-DE": "de",
  "fr-FR": "fr",
  "es-ES": "es"
};
const I18N_STATUS = {
  PENDING: "pending",
  PARTIAL: "partial",
  COMPLETE: "complete"
};

async function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) return null;
  const OpenAI = require("openai");
  return new OpenAI({ apiKey });
}

function langToLocale(lang) {
  return LANG_TO_LOCALE[lang] || `${lang}-${lang.toUpperCase()}`;
}

function localeToLang(locale) {
  return LOCALE_TO_LANG[locale] || locale.split("-")[0];
}

async function translateProduct(product, targetLang, includeSpecs = false) {
  if (!product || targetLang === "en") return null;
  
  const openai = await getOpenAI();
  if (!openai) {
    log(`[Translation] No OpenAI key available`);
    return null;
  }
  
  try {
    const langNames = { nl: "Dutch", de: "German", fr: "French", es: "Spanish" };
    const langName = langNames[targetLang] || targetLang;
    
    let specsSection = "";
    let specsJson = "";
    if (includeSpecs && product.specs) {
      const specsText = typeof product.specs === "string" ? product.specs : JSON.stringify(product.specs);
      specsSection = `\nSpecs: ${specsText}`;
      specsJson = `,\n  "specs": "translated specs or JSON object"`;
    }
    
    const prompt = `Translate this pet product info to ${langName}. Return JSON only:
{
  "title": "translated title",
  "description": "translated description"${specsJson}
}

Product:
Title: ${product.title}
Description: ${product.description || ""}${specsSection}`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 800
    });
    
    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    log(`[Translation] Translated product ${product.id} to ${targetLang}`);
    const result = {
      title: parsed.title || product.title,
      description: parsed.description || product.description
    };
    if (includeSpecs && parsed.specs) {
      result.specs = parsed.specs;
    }
    return result;
  } catch (err) {
    log(`[Translation] Error translating ${product.id}: ${err.message}`);
    return null;
  }
}

async function getCachedTranslation(productId, lang) {
  if (lang === "en") return null;
  
  const locale = langToLocale(lang);
  return translationStore.getTranslation(productId, locale);
}

async function cacheTranslation(productId, lang, translation) {
  if (lang === "en") {
    log(`[Translation] Blocked attempt to cache translation for canonical locale en`);
    return false;
  }
  
  const locale = langToLocale(lang);
  
  if (!translationStore.isLocaleEnabled(locale)) {
    log(`[Translation] Blocked: locale ${locale} is not enabled`);
    return false;
  }
  
  return translationStore.setTranslation(productId, locale, translation);
}

function calculateI18nStatus(translations) {
  if (!translations || Object.keys(translations).length === 0) {
    return I18N_STATUS.PENDING;
  }
  const targetLangs = SUPPORTED_LANGS.filter(l => l !== "en");
  const translatedLangs = Object.keys(translations);
  if (targetLangs.every(l => translatedLangs.includes(l))) {
    return I18N_STATUS.COMPLETE;
  }
  return I18N_STATUS.PARTIAL;
}

async function getI18nStats() {
  const products = await db.listProducts();
  const storeStats = translationStore.getTranslationStats();
  const stats = {
    total: products.length,
    pending: 0,
    partial: 0,
    complete: 0,
    byLang: {},
    enabledLocales: storeStats.enabledLocales
  };
  
  const targetLangs = SUPPORTED_LANGS.filter(l => l !== "en");
  targetLangs.forEach(l => { 
    const locale = langToLocale(l);
    stats.byLang[l] = { 
      translated: storeStats.byLocale[locale]?.translated || 0, 
      missing: products.length - (storeStats.byLocale[locale]?.translated || 0),
      enabled: storeStats.byLocale[locale]?.enabled || false
    }; 
  });
  
  for (const p of products) {
    const translations = translationStore.getAllTranslationsForProduct(p.id);
    const translatedCount = Object.keys(translations).length;
    const enabledCount = storeStats.enabledLocales.filter(l => l !== 'en-US').length;
    
    if (translatedCount === 0) {
      stats.pending++;
    } else if (translatedCount >= enabledCount) {
      stats.complete++;
    } else {
      stats.partial++;
    }
  }
  
  return stats;
}

async function getProductsNeedingTranslation(lang, limit = 50) {
  const products = await db.listProducts();
  const needing = [];
  const locale = langToLocale(lang);
  
  for (const p of products) {
    const translation = translationStore.getTranslation(p.id, locale);
    if (!translation) {
      needing.push(p);
      if (needing.length >= limit) break;
    }
  }
  
  return needing;
}

async function getProductTranslation(productId, lang) {
  if (lang === "en" || !SUPPORTED_LANGS.includes(lang)) {
    return null;
  }
  
  const cached = await getCachedTranslation(productId, lang);
  if (cached) {
    return cached;
  }
  
  const product = await db.getProduct(productId);
  if (!product) return null;
  
  const translation = await translateProduct(product, lang);
  if (translation) {
    await cacheTranslation(productId, lang, translation);
    return translation;
  }
  
  return null;
}

async function getTranslatedProduct(productId, lang) {
  const product = await db.getProduct(productId);
  if (!product) return null;
  
  if (lang === "en" || !SUPPORTED_LANGS.includes(lang)) {
    return product;
  }
  
  const translation = await getProductTranslation(productId, lang);
  if (translation) {
    return {
      ...product,
      title: translation.title,
      description: translation.description,
      _originalTitle: product.title,
      _originalDescription: product.description,
      _translatedLang: lang
    };
  }
  
  return product;
}

async function translateProductsBatch(products, lang) {
  if (lang === "en" || !SUPPORTED_LANGS.includes(lang)) {
    return products;
  }
  
  const locale = langToLocale(lang);
  
  const translated = await Promise.all(
    products.map(async (product) => {
      const cached = translationStore.getTranslation(product.id, locale);
      if (cached) {
        return {
          ...product,
          title: cached.title,
          description: cached.description,
          _translatedLang: lang
        };
      }
      return product;
    })
  );
  
  return translated;
}

module.exports = {
  translateProduct,
  getProductTranslation,
  getTranslatedProduct,
  translateProductsBatch,
  getCachedTranslation,
  cacheTranslation,
  getI18nStats,
  getProductsNeedingTranslation,
  calculateI18nStatus,
  SUPPORTED_LANGS,
  I18N_STATUS
};
