const { log } = require("./logger");

const SUPPORTED_LOCALES = ["en-US", "nl-NL", "de-DE", "fr-FR", "es-ES"];
const DEFAULT_LOCALE = "en-US";

const LANGUAGE_TO_LOCALE = {
  en: "en-US",
  nl: "nl-NL",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES"
};

function parseAcceptLanguage(header) {
  if (!header) return [];
  
  return header
    .split(",")
    .map(part => {
      const [lang, qPart] = part.trim().split(";");
      const q = qPart ? parseFloat(qPart.replace("q=", "")) : 1;
      return { lang: lang.trim().toLowerCase(), q };
    })
    .sort((a, b) => b.q - a.q)
    .map(item => item.lang);
}

function normalizeLocale(lang) {
  if (!lang) return null;
  
  const lower = lang.toLowerCase().replace("_", "-");
  
  for (const supported of SUPPORTED_LOCALES) {
    if (lower === supported.toLowerCase()) {
      return supported;
    }
  }
  
  const primary = lower.split("-")[0];
  if (LANGUAGE_TO_LOCALE[primary]) {
    return LANGUAGE_TO_LOCALE[primary];
  }
  
  return null;
}

function localeMiddleware(req, res, next) {
  let resolvedLocale = DEFAULT_LOCALE;
  let source = "default";
  
  // Priority: 1) URL param ?lang=  2) Cookie  3) Default to en-US
  // NOTE: We do NOT use Accept-Language header - English is default for US market
  // Users must explicitly choose a different language via the language switcher
  
  const queryLocale = req.query?.locale || req.query?.lang;
  if (queryLocale) {
    const normalized = normalizeLocale(queryLocale);
    if (normalized) {
      resolvedLocale = normalized;
      source = "query";
    }
  }
  
  if (source === "default") {
    const cookieLocale = req.cookies?.gp_lang || req.cookies?.locale;
    if (cookieLocale) {
      const normalized = normalizeLocale(cookieLocale);
      if (normalized) {
        resolvedLocale = normalized;
        source = "cookie";
      }
    }
  }
  
  // REMOVED: Accept-Language header detection
  // We default to English (en-US) for the US market
  // Product content stays in English unless user explicitly switches
  
  req.locale = resolvedLocale;
  req.localeSource = source;
  req.localeLanguage = resolvedLocale.split("-")[0];
  
  res.setHeader("Content-Language", resolvedLocale);
  
  next();
}

function getLocaleFromRequest(req) {
  return req.locale || DEFAULT_LOCALE;
}

function getSupportedLocales() {
  return [...SUPPORTED_LOCALES];
}

module.exports = {
  localeMiddleware,
  getLocaleFromRequest,
  getSupportedLocales,
  normalizeLocale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE
};
