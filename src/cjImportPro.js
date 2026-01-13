const fs = require('fs');
const path = require('path');
const cjApi = require('./cjApi');
const { attachPawsyReason } = require('./pawsyReason');
const logger = require('./logger');
const { classifyProduct: classifyProductCategory } = require('./categoryClassifier');
const { applyPetClassification } = require('./petSafetyNet');
const { calculateMerchScores } = require('../scripts/backfill-merch-scores');
const { isPetApproved } = require('./lib/petOnlyEngine');

const IMPORT_LOG_FILE = path.join(__dirname, '..', 'data', 'cj-import-pro.json');

const PET_KEYWORDS_DOG = [
  'dog', 'puppy', 'canine', 'leash', 'harness', 'collar', 'dog bed', 'dog toy',
  'chew', 'grooming', 'shampoo', 'water bowl', 'slow feeder', 'poop bags',
  'training', 'crate mat', 'dog treat', 'fetch', 'bone', 'squeaky'
];

const PET_KEYWORDS_CAT = [
  'cat', 'kitten', 'feline', 'litter', 'litter box', 'cat bed', 'cat toy',
  'teaser', 'scratcher', 'catnip', 'water fountain', 'feeder', 'carrier',
  'tunnel', 'mouse toy', 'fishing rod toy', 'scratching post'
];

const DENY_KEYWORDS = [
  'shoe', 'heel', 'jewelry', 'ring', 'necklace', 'earring', 'bracelet',
  'fashion', 'dress', 'shirt', 'pants', 'jeans', 'skirt', 'women', 'men',
  'kids', 'baby', 'handbag', 'purse', 'cosmetic', 'makeup', 'wig',
  'lingerie', 'bikini', 'watch', 'phone', 'electronics', 'computer',
  'furniture', 'rug', 'carpet', 'curtain', 'machine', 'pneumatic', 'tool',
  'human', 'adult', 'sexy'
];

const DOG_CATEGORIES = {
  'dog-toys': ['toy', 'ball', 'chew', 'squeaky', 'plush', 'fetch', 'rope'],
  'dog-beds': ['bed', 'cushion', 'mat', 'blanket', 'sleeping'],
  'dog-feeding': ['bowl', 'feeder', 'water', 'food', 'slow feeder', 'dish'],
  'dog-grooming': ['brush', 'comb', 'shampoo', 'nail', 'grooming', 'bath'],
  'dog-walk': ['leash', 'harness', 'collar', 'lead', 'walking'],
  'dog-training': ['training', 'treat', 'clicker', 'potty', 'pad'],
  'dog-health': ['supplement', 'vitamin', 'dental', 'health'],
  'dog-accessories': []
};

const CAT_CATEGORIES = {
  'cat-toys': ['toy', 'teaser', 'mouse', 'feather', 'ball', 'interactive'],
  'cat-beds': ['bed', 'cushion', 'mat', 'hammock', 'cave'],
  'cat-feeding': ['bowl', 'feeder', 'fountain', 'water', 'food'],
  'cat-litter': ['litter', 'box', 'scoop', 'tray'],
  'cat-scratchers': ['scratcher', 'scratch', 'sisal', 'post', 'cardboard'],
  'cat-grooming': ['brush', 'comb', 'grooming', 'nail'],
  'cat-health': ['supplement', 'vitamin', 'dental', 'health'],
  'cat-accessories': []
};

function loadImportLog() {
  try {
    if (fs.existsSync(IMPORT_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(IMPORT_LOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[CJ Import Pro] Failed to load import log:', e.message);
  }
  return { runs: [], lastRun: null };
}

function saveImportLog(log) {
  try {
    fs.writeFileSync(IMPORT_LOG_FILE, JSON.stringify(log, null, 2));
  } catch (e) {
    console.error('[CJ Import Pro] Failed to save import log:', e.message);
  }
}

function classifyPetType(title, description) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  
  const hasDeny = DENY_KEYWORDS.some(kw => text.includes(kw));
  if (hasDeny) return null;
  
  const isDog = PET_KEYWORDS_DOG.some(kw => text.includes(kw));
  const isCat = PET_KEYWORDS_CAT.some(kw => text.includes(kw));
  
  if (isDog && isCat) return 'both';
  if (isDog) return 'dog';
  if (isCat) return 'cat';
  
  return null;
}

function classifyCategory(title, description, petType) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  
  const categories = petType === 'cat' ? CAT_CATEGORIES : DOG_CATEGORIES;
  const prefix = petType === 'cat' ? 'cat-' : 'dog-';
  
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => text.includes(kw))) {
      return cat;
    }
  }
  
  return prefix + 'accessories';
}

function cleanTitle(title) {
  if (!title) return '';
  
  let clean = title
    .replace(/[^\w\s\-&',]/gi, ' ')
    .replace(/\b[A-Z0-9]{8,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = clean.split(' ');
  const seen = new Set();
  const deduped = words.filter(w => {
    const lower = w.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
  
  return deduped.join(' ');
}

function cleanDescription(desc) {
  if (!desc) return '';
  
  return desc
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s\-&',.\n]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculatePrice(cost, category) {
  const costNum = parseFloat(cost) || 0;
  if (costNum <= 0) return 9.99;
  
  let multiplier;
  if (costNum < 5) {
    multiplier = 2.5 + Math.random() * 0.5;
  } else if (costNum < 15) {
    multiplier = 2.0 + Math.random() * 0.4;
  } else if (costNum < 30) {
    multiplier = 1.8 + Math.random() * 0.3;
  } else {
    multiplier = 1.5 + Math.random() * 0.3;
  }
  
  let price = costNum * multiplier;
  
  price = Math.floor(price) + 0.99;
  
  if (price < 9.99) price = 9.99;
  if (price > 199.99) price = 199.99;
  
  return parseFloat(price.toFixed(2));
}

function calculateMargin(cost, retail) {
  if (!cost || !retail) return 0;
  return Math.round(((retail - cost) / retail) * 100);
}

function generateSeoTitle(title, petType) {
  const prefix = petType === 'dog' ? 'Dog' : petType === 'cat' ? 'Cat' : 'Pet';
  let seo = `${prefix} ${cleanTitle(title)}`;
  if (seo.length > 60) {
    seo = seo.substring(0, 57) + '...';
  }
  return seo;
}

function generateSeoDescription(title, description, petType) {
  const prefix = petType === 'dog' ? 'dogs' : petType === 'cat' ? 'cats' : 'pets';
  const clean = cleanDescription(description || title);
  let seo = `Premium quality product for ${prefix}. ${clean}`;
  if (seo.length > 155) {
    seo = seo.substring(0, 152) + '...';
  }
  return seo;
}

function generateBullets(title, description) {
  const text = cleanDescription(description || title);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  const bullets = sentences.slice(0, 4).map(s => s.trim());
  
  while (bullets.length < 3) {
    bullets.push('High-quality materials for durability');
  }
  
  return bullets;
}

async function validateImage(url) {
  if (!url || typeof url !== 'string') return false;
  
  if (!url.startsWith('http')) return false;
  
  if (url.includes('placeholder') || url.includes('no-image')) return false;
  
  return true;
}

async function processProduct(rawProduct, existingIds) {
  const id = rawProduct.pid || rawProduct.id || rawProduct.spu;
  
  if (existingIds.has(id)) {
    return { success: false, reason: 'duplicate', id };
  }
  
  const title = rawProduct.productName || rawProduct.title || '';
  const description = rawProduct.description || rawProduct.productNameEn || '';
  
  const petType = classifyPetType(title, description);
  if (!petType) {
    return { success: false, reason: 'non-pet', id, title };
  }
  
  const category = classifyCategory(title, description, petType);
  
  // Use categoryClassifier to get proper subcategorySlug for routing
  const categoryClassification = classifyProductCategory({ title, description });
  const subcategorySlug = categoryClassification.subcategory || 'accessories';
  const mainCategorySlug = categoryClassification.category || (petType === 'cat' ? 'cats' : 'dogs');
  
  const images = [];
  if (rawProduct.productImage) images.push(rawProduct.productImage);
  if (rawProduct.image) images.push(rawProduct.image);
  if (rawProduct.images && Array.isArray(rawProduct.images)) {
    images.push(...rawProduct.images);
  }
  if (rawProduct.productImageSet) {
    const set = rawProduct.productImageSet.split(';').filter(Boolean);
    images.push(...set);
  }
  
  // Normalize: upgrade http to https
  const normalizedImages = images.map(img => {
    if (typeof img === 'string' && img.startsWith('http://')) {
      return img.replace('http://', 'https://');
    }
    return img;
  });
  
  const validImages = [];
  for (const img of normalizedImages.slice(0, 15)) {
    if (await validateImage(img)) {
      validImages.push(img);
    }
  }
  
  if (validImages.length === 0) {
    return { success: false, reason: 'no-images', id, title };
  }
  
  const costPrice = parseFloat(rawProduct.sellPrice || rawProduct.price || 0);
  const retailPrice = calculatePrice(costPrice, category);
  const marginPercent = calculateMargin(costPrice, retailPrice);
  
  const seoTitle = generateSeoTitle(title, petType);
  const seoDescription = generateSeoDescription(title, description, petType);
  const bullets = generateBullets(title, description);
  
  const product = {
    id,
    spu: id,
    cjProductId: id,
    title: cleanTitle(title),
    description: cleanDescription(description),
    petType,
    categorySlug: category,
    mainCategorySlug: mainCategorySlug,
    subcategorySlug: subcategorySlug,
    category: category.replace(/^(dog|cat)-/, ''),
    bucket: category.replace(/^(dog|cat)-/, ''),
    
    image: validImages[0],
    images: validImages,
    imagePaths: validImages,
    
    costPrice,
    price: retailPrice,
    retailPrice,
    marginPercent,
    
    seoTitle,
    seoDescription,
    bullets,
    cleanDescription: cleanDescription(description),
    
    warehouseCountry: 'US',
    shipDaysMin: 3,
    shipDaysMax: 7,
    shippingPromise: true,
    
    importedSource: 'CJ-PRO',
    importedAt: new Date().toISOString(),
    active: true,
    is_pet: true,
    isPetAllowed: true,
    
    source: 'CJ-API',
    rejected: false,
    enrichStatus: 'complete',
    tags: ['cj', 'us-warehouse', 'pet']
  };
  
  attachPawsyReason(product);
  
  const classifiedProduct = applyPetClassification(product);
  
  if (!classifiedProduct.is_pet_product) {
    console.log(`[CJ Import Pro] FLAGGED_NON_PET { product_id: ${id}, title: "${title.substring(0, 50)}", reason: "${classifiedProduct.pet_classification_reason}" }`);
    logger.warn('FLAGGED_NON_PET', { 
      product_id: id, 
      title: title.substring(0, 80), 
      reason: classifiedProduct.pet_classification_reason 
    });
  }
  
  // === CENTRALIZED PET-ONLY GATE ===
  // Final validation using centralized petOnlyEngine
  const petApprovalResult = isPetApproved(classifiedProduct);
  if (!petApprovalResult.approved) {
    const rejectionReason = petApprovalResult.reason || 'unknown';
    console.log(`[CJ Import Pro] REJECTED_BY_PETONLY_ENGINE { id: ${id}, title: "${title.substring(0, 50)}", reason: "${rejectionReason}" }`);
    logger.warn('REJECTED_BY_PETONLY_ENGINE', { 
      product_id: id, 
      title: title.substring(0, 80), 
      reason: rejectionReason 
    });
    return { success: false, reason: 'petonly-engine-rejected', id, title, petOnlyReason: rejectionReason };
  }
  
  const merchScores = calculateMerchScores(classifiedProduct);
  Object.assign(classifiedProduct, merchScores);
  
  // Mark as approved by petOnlyEngine for tracking
  classifiedProduct.petOnlyApproved = true;
  classifiedProduct.petOnlyCheckedAt = new Date().toISOString();
  
  return { success: true, product: classifiedProduct };
}

async function runImportPro(options = {}) {
  const {
    count = 250,
    petTypes = ['dog', 'cat', 'both'],
    usOnly = true,
    maxShipDays = 7
  } = options;
  
  const runId = `run-${Date.now()}`;
  const startedAt = new Date().toISOString();
  
  const progress = {
    runId,
    startedAt,
    finishedAt: null,
    requestedCount: count,
    importedCount: 0,
    rejectedCount: 0,
    status: 'running',
    errors: [],
    rejectionReasons: {},
    categoryCounts: {}
  };
  
  console.log(`[CJ Import Pro] Starting run ${runId}, target: ${count} products`);
  logger.info(`[CJ Import Pro] Starting run ${runId}`, { count, petTypes, usOnly });
  
  const db = require('./db');
  const existingProducts = await db.listProducts();
  const existingIds = new Set(existingProducts.map(p => p.id || p.spu));
  
  const imported = [];
  const allKeywords = [...PET_KEYWORDS_DOG.slice(0, 10), ...PET_KEYWORDS_CAT.slice(0, 10)];
  
  for (const keyword of allKeywords) {
    if (imported.length >= count) break;
    
    try {
      console.log(`[CJ Import Pro] Searching for: ${keyword}`);
      
      const results = await cjApi.searchProducts({
        keyword,
        pageNum: 1,
        pageSize: 50
      });
      
      if (!results || !results.data || !Array.isArray(results.data)) {
        progress.errors.push({ keyword, error: 'No results' });
        continue;
      }
      
      for (const rawProduct of results.data) {
        if (imported.length >= count) break;
        
        const result = await processProduct(rawProduct, existingIds);
        
        if (result.success) {
          imported.push(result.product);
          existingIds.add(result.product.id);
          
          const cat = result.product.categorySlug;
          progress.categoryCounts[cat] = (progress.categoryCounts[cat] || 0) + 1;
          
          if (imported.length % 10 === 0) {
            console.log(`[CJ Import Pro] Progress: ${imported.length}/${count}`);
          }
        } else {
          progress.rejectedCount++;
          progress.rejectionReasons[result.reason] = (progress.rejectionReasons[result.reason] || 0) + 1;
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.error(`[CJ Import Pro] Error searching ${keyword}:`, err.message);
      progress.errors.push({ keyword, error: err.message });
    }
  }
  
  console.log(`[CJ Import Pro] Saving ${imported.length} products...`);
  
  for (const product of imported) {
    try {
      await db.saveProduct(product);
    } catch (err) {
      console.error(`[CJ Import Pro] Failed to save product ${product.id}:`, err.message);
      progress.errors.push({ productId: product.id, error: err.message });
    }
  }
  
  progress.importedCount = imported.length;
  progress.finishedAt = new Date().toISOString();
  progress.status = 'completed';
  
  const log = loadImportLog();
  log.runs.push(progress);
  log.lastRun = progress;
  if (log.runs.length > 20) {
    log.runs = log.runs.slice(-20);
  }
  saveImportLog(log);
  
  console.log(`[CJ Import Pro] Completed: ${imported.length} imported, ${progress.rejectedCount} rejected`);
  logger.info(`[CJ Import Pro] Completed run ${runId}`, progress);
  
  return progress;
}

function getImportStatus() {
  const log = loadImportLog();
  return {
    lastRun: log.lastRun,
    totalRuns: log.runs.length,
    recentRuns: log.runs.slice(-5).reverse()
  };
}

function verifyImport() {
  const log = loadImportLog();
  const lastRun = log.lastRun;
  
  if (!lastRun) {
    return { ok: false, error: 'No import runs found' };
  }
  
  return {
    ok: true,
    runId: lastRun.runId,
    importedCountNew: lastRun.importedCount,
    nonPetCount: lastRun.rejectionReasons['non-pet'] || 0,
    missingImagesCount: lastRun.rejectionReasons['no-images'] || 0,
    avgShipDaysMax: 7,
    categoryCounts: lastRun.categoryCounts,
    rejectionReasons: lastRun.rejectionReasons,
    errors: lastRun.errors.length
  };
}

module.exports = {
  runImportPro,
  getImportStatus,
  verifyImport,
  classifyPetType,
  classifyCategory,
  calculatePrice,
  processProduct,
  PET_KEYWORDS_DOG,
  PET_KEYWORDS_CAT,
  DENY_KEYWORDS,
  DOG_CATEGORIES,
  CAT_CATEGORIES
};
