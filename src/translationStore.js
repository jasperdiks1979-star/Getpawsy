/**
 * Translation Store - Separate storage for product translations
 * Keeps translations isolated from canonical product data
 * Canonical locale is always en-US and never overwritten
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const TRANSLATIONS_FILE = path.join(__dirname, '..', 'data', 'translations.json');
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'language-settings.json');

const CANONICAL_LOCALE = 'en-US';
const ALL_LOCALES = ['en-US', 'nl-NL', 'de-DE', 'fr-FR', 'es-ES'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadTranslations() {
  try {
    if (fs.existsSync(TRANSLATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`[TranslationStore] Error loading translations: ${e.message}`);
  }
  return { products: {} };
}

function saveTranslations(data) {
  ensureDir(path.dirname(TRANSLATIONS_FILE));
  fs.writeFileSync(TRANSLATIONS_FILE, JSON.stringify(data, null, 2));
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`[TranslationStore] Error loading settings: ${e.message}`);
  }
  return {
    enabledLocales: ['en-US', 'nl-NL'],
    autoTranslate: true,
    updatedAt: new Date().toISOString()
  };
}

function saveSettings(data) {
  ensureDir(path.dirname(SETTINGS_FILE));
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

function getEnabledLocales() {
  const settings = loadSettings();
  return settings.enabledLocales || ['en-US', 'nl-NL'];
}

function isLocaleEnabled(locale) {
  if (locale === CANONICAL_LOCALE) return true;
  const enabled = getEnabledLocales();
  return enabled.includes(locale);
}

function setEnabledLocales(locales) {
  const settings = loadSettings();
  const validLocales = locales.filter(l => ALL_LOCALES.includes(l));
  if (!validLocales.includes(CANONICAL_LOCALE)) {
    validLocales.unshift(CANONICAL_LOCALE);
  }
  settings.enabledLocales = validLocales;
  saveSettings(settings);
  log(`[TranslationStore] Enabled locales updated: ${validLocales.join(', ')}`);
  return validLocales;
}

function getTranslation(productId, locale) {
  if (locale === CANONICAL_LOCALE) return null;
  
  const data = loadTranslations();
  const productTranslations = data.products[productId];
  if (!productTranslations) return null;
  
  return productTranslations[locale] || null;
}

function setTranslation(productId, locale, translation) {
  if (locale === CANONICAL_LOCALE) {
    log(`[TranslationStore] WARNING: Attempted to overwrite canonical locale - blocked`);
    return false;
  }
  
  if (!isLocaleEnabled(locale)) {
    log(`[TranslationStore] WARNING: Attempted to translate to disabled locale ${locale} - blocked`);
    return false;
  }
  
  const data = loadTranslations();
  if (!data.products[productId]) {
    data.products[productId] = {};
  }
  
  data.products[productId][locale] = {
    title: translation.title,
    description: translation.description,
    specs: translation.specs || null,
    seoTitle: translation.seoTitle || null,
    seoDescription: translation.seoDescription || null,
    updatedAt: new Date().toISOString()
  };
  
  saveTranslations(data);
  log(`[TranslationStore] Saved translation for ${productId} in ${locale}`);
  return true;
}

function deleteTranslation(productId, locale) {
  const data = loadTranslations();
  if (data.products[productId] && data.products[productId][locale]) {
    delete data.products[productId][locale];
    saveTranslations(data);
    return true;
  }
  return false;
}

function getAllTranslationsForProduct(productId) {
  const data = loadTranslations();
  return data.products[productId] || {};
}

function getTranslationStats() {
  const data = loadTranslations();
  const settings = loadSettings();
  const enabledLocales = settings.enabledLocales || [];
  
  const stats = {
    totalProducts: Object.keys(data.products).length,
    enabledLocales,
    byLocale: {}
  };
  
  for (const locale of ALL_LOCALES) {
    if (locale === CANONICAL_LOCALE) continue;
    stats.byLocale[locale] = {
      enabled: enabledLocales.includes(locale),
      translated: 0
    };
  }
  
  for (const productId in data.products) {
    const translations = data.products[productId];
    for (const locale in translations) {
      if (stats.byLocale[locale]) {
        stats.byLocale[locale].translated++;
      }
    }
  }
  
  return stats;
}

function migrateFromProductRecords(products) {
  const data = loadTranslations();
  let migrated = 0;
  
  for (const product of products) {
    const oldTranslations = product.translations || {};
    
    for (const lang in oldTranslations) {
      const locale = lang === 'nl' ? 'nl-NL' : lang === 'de' ? 'de-DE' : lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : null;
      
      if (locale && locale !== CANONICAL_LOCALE) {
        if (!data.products[product.id]) {
          data.products[product.id] = {};
        }
        
        if (!data.products[product.id][locale]) {
          data.products[product.id][locale] = {
            title: oldTranslations[lang].title,
            description: oldTranslations[lang].description,
            specs: oldTranslations[lang].specs || null,
            updatedAt: oldTranslations[lang].cachedAt || new Date().toISOString()
          };
          migrated++;
        }
      }
    }
  }
  
  if (migrated > 0) {
    saveTranslations(data);
    log(`[TranslationStore] Migrated ${migrated} translations from product records`);
  }
  
  return migrated;
}

module.exports = {
  CANONICAL_LOCALE,
  ALL_LOCALES,
  getEnabledLocales,
  isLocaleEnabled,
  setEnabledLocales,
  getTranslation,
  setTranslation,
  deleteTranslation,
  getAllTranslationsForProduct,
  getTranslationStats,
  migrateFromProductRecords,
  loadSettings,
  saveSettings
};
