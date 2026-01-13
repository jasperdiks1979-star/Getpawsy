const path = require("path");

module.exports = function initializeApp(app, options = {}) {
  const { BUILD_ID, BUILD_START_TIME, GIT_COMMIT, getCachedHomepage } = options;
  
  const zlib = require("zlib");
  const crypto = require("crypto");
  const cookieParser = require("cookie-parser");
  const fs = require("fs");

  const { db } = require("../db");
  const { seedIfEmpty } = require("../seed");
  const { parseCSV, normalizeProduct } = require("../csvImport");
  const { parseCJCSV } = require("../cjImport");
  const { parseCJCSVRobust, parseCJCSVSimple, getImportProgress, resetProgress } = require("../cjImportRobust");
  const cjXlsxImport = require("../cjXlsxImport");
  const { runCJSync } = require("../cjSync");
  const { getPawsyResponse } = require("../pawsyLogic");
  const { log, getLogs } = require("../logger");
  const { prepareCJOrder, savePendingCJOrder, exportCJOrder, getCJOrders } = require("../cjFulfillment");
  const { generateSEOMeta, generateProductSEOMeta, generateProductStructuredData, generateOrganizationStructuredData, injectSEOIntoHTML, generateSitemap, generateHreflangTags } = require("../seo");
  const { placePendingOrders } = require("../cjFulfillment");
  const { askPawsyLLM } = require("../pawsyLLM");
  const { askPawsyHybrid, classifyIntent } = require("../pawsyHybridLLM");
  const { askPawsyRAG } = require("../pawsyRAG");
  const { askPawsyV3, isEnabled: isV3Enabled } = require("../pawsySalesAgentV3");
  const { initAITables, getEmbeddingsCount } = require("../aiDatabase");
  const { triggerReindexDelta, triggerReindexFull, getJobStatus, getJobById } = require("../aiJobRunner");
  const { getReindexStatus } = require("../aiReindex");
  const { retrieveContext } = require("../aiRetrieval");
  const { isEnabled: embeddingsEnabled } = require("../aiEmbeddings");
  const { addLabelsToProducts, addLabelsToProduct } = require("../productLabels");
  const cjExactMapper = require("../cjCsvExactMapper");
  const { applyPetFilter } = require("../petFilter");
  const adminAuth = require("../adminAuth");
  const { logAdminAction, getAdminLogs } = require("../adminLogger");
  const { classifyPetRelevance, batchClassify, getRejectReasons } = require("../petRelevance");
  const cjUrlImport = require("../cjUrlImport");
  const featuredProducts = require("../featuredProducts");
  const smartPricing = require("../smartPricing");
  const feedScheduler = require("../feedScheduler");
  const petEligibility = require("../petEligibility");
  const adsGenerator = require("../adsGenerator");
  const copywriter = require("../copywriter");
  const heroStudio = require("../heroStudio");
  const abTesting = require("../abTesting");
  const seoGenerator = require("../seoGenerator");
  const topPicks = require("../topPicks");
  const { localeMiddleware, getLocaleFromRequest, getSupportedLocales, SUPPORTED_LOCALES, DEFAULT_LOCALE } = require("../localeMiddleware");
  const { getSeoLocalized, getAllSeoForProduct, upsertSeoLocalized, lockSeoField, unlockSeoField, getSeoStats } = require("../aiDatabase");
  const productTranslation = require("../productTranslation");
  const enrichmentJob = require("../enrichmentJobV2");
  const translationJob = require("../translationJob");
  const imageTextDetection = require("../imageTextDetection");
  const translationStore = require("../translationStore");
  const { productStore, readDB, writeDB } = require("../productStore");
  const seoBulkJob = require("../seoBulkJob");
  const imageCache = require("../imageCache");
  const { classifyProduct, getAllCategories, getCategoryBySlug, getSubcategoryBySlug } = require("../categoryClassifier");
  const petEligibilityNew = require("../lib/petEligibility");
  const safeBoot = require("./safeBoot");
  const jobOrchestrator = require("./jobOrchestrator");
  const ga4Config = require("../config/ga4Config");
  const ga4Client = require("../analytics/ga4Client");
  const pawsyReason = require("../pawsyReason");
  const pawsyBoxes = require("../pawsyBoxes");
  const cjImportPro = require("../cjImportPro");

  const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

  return {
    zlib, crypto, cookieParser, fs, db, seedIfEmpty, parseCSV, normalizeProduct,
    parseCJCSV, parseCJCSVRobust, parseCJCSVSimple, getImportProgress, resetProgress,
    cjXlsxImport, runCJSync, getPawsyResponse, log, getLogs,
    prepareCJOrder, savePendingCJOrder, exportCJOrder, getCJOrders,
    generateSEOMeta, generateProductSEOMeta, generateProductStructuredData,
    generateOrganizationStructuredData, injectSEOIntoHTML, generateSitemap, generateHreflangTags,
    placePendingOrders, askPawsyLLM, askPawsyHybrid, classifyIntent, askPawsyRAG,
    askPawsyV3, isV3Enabled, initAITables, getEmbeddingsCount,
    triggerReindexDelta, triggerReindexFull, getJobStatus, getJobById,
    getReindexStatus, retrieveContext, embeddingsEnabled,
    addLabelsToProducts, addLabelsToProduct, cjExactMapper, applyPetFilter,
    adminAuth, logAdminAction, getAdminLogs, classifyPetRelevance, batchClassify, getRejectReasons,
    cjUrlImport, featuredProducts, smartPricing, feedScheduler, petEligibility,
    adsGenerator, copywriter, heroStudio, abTesting, seoGenerator, topPicks,
    localeMiddleware, getLocaleFromRequest, getSupportedLocales, SUPPORTED_LOCALES, DEFAULT_LOCALE,
    getSeoLocalized, getAllSeoForProduct, upsertSeoLocalized, lockSeoField, unlockSeoField, getSeoStats,
    productTranslation, enrichmentJob, translationJob, imageTextDetection, translationStore,
    productStore, readDB, writeDB, seoBulkJob, imageCache,
    classifyProduct, getAllCategories, getCategoryBySlug, getSubcategoryBySlug,
    petEligibilityNew, safeBoot, jobOrchestrator, ga4Config, ga4Client,
    pawsyReason, pawsyBoxes, cjImportPro, stripe, BUILD_ID, BUILD_START_TIME, GIT_COMMIT
  };
};
