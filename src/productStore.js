const fs = require("fs");
const path = require("path");
const os = require("os");
const { log } = require("./logger");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");
const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const TEMP_DIR = path.join(__dirname, "..", "data");

function ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ products: [] }, null, 2));
}

function readDB() {
  ensureFile();
  try {
    if (fs.existsSync(CATALOG_PATH)) {
      const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
      const catalogProducts = catalog.products || [];
      if (catalogProducts.length > 0) {
        return { products: catalogProducts };
      }
    }
    
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    return db;
  } catch (err) {
    log(`[ProductStore] Error reading DB: ${err.message}`);
    return { products: [] };
  }
}

function writeDB(data) {
  ensureFile();
  const tempFile = path.join(TEMP_DIR, `.db_temp_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_PATH);
    log(`[ProductStore] Atomic write successful`);
  } catch (err) {
    log(`[ProductStore] Atomic write failed: ${err.message}`);
    try { fs.unlinkSync(tempFile); } catch (_) {}
    throw err;
  }
}

function normalizeText(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function generateSlug(title) {
  if (!title) return "";
  return String(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

function tokenize(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function fuzzyMatch(haystack, needle) {
  const normalHaystack = normalizeText(haystack);
  const normalNeedle = normalizeText(needle);
  if (normalHaystack.includes(normalNeedle)) return { match: true, score: 100 };
  if (normalNeedle.includes(normalHaystack) && normalHaystack.length > 3) return { match: true, score: 80 };
  const haystackTokens = tokenize(haystack);
  const needleTokens = tokenize(needle);
  let matchedTokens = 0;
  for (const nt of needleTokens) {
    for (const ht of haystackTokens) {
      if (ht.includes(nt) || nt.includes(ht)) {
        matchedTokens++;
        break;
      }
    }
  }
  if (needleTokens.length > 0 && matchedTokens >= Math.ceil(needleTokens.length * 0.5)) {
    return { match: true, score: 50 + (matchedTokens / needleTokens.length) * 30 };
  }
  return { match: false, score: 0 };
}

const productStore = {
  listProducts(options = {}) {
    const { 
      activeOnly = false, 
      category = null, 
      subcategory = null, 
      limit = null, 
      offset = 0,
      animalUsedOnly = true // NEW: Only show ANIMAL_USED products by default
    } = options;
    const data = readDB();
    let products = data.products || [];
    
    // STRICT FILTER: Only show pet products (unless explicitly disabled)
    if (animalUsedOnly) {
      products = products.filter(p => {
        // Reject explicitly non-pet products
        if (p.is_pet_product === false) return false;
        if (p.status === 'rejected') return false;
        if (p.hidden_from_storefront === true) return false;
        // Legacy filter compatibility
        if (p.isPetAllowed === false) return false;
        // Accept if any pet indicator is true
        return p.isPetAllowed === true || 
               p.is_pet_product === true ||
               p.petUsageType === 'ANIMAL_USED' || 
               (p.petUsageType === undefined && p.isPetAllowed !== false);
      });
    }
    
    if (activeOnly) {
      products = products.filter(p => 
        (p.active === true || p.status === 'active') && 
        p.rejected !== true && 
        p.status !== 'rejected'
      );
    }
    if (category) {
      const normalCat = normalizeText(category);
      const catSingular = normalCat.replace(/s$/, ''); // dogs -> dog, cats -> cat
      products = products.filter(p => {
        const pCat = normalizeText(p.category || "");
        const pMainCat = normalizeText(p.mainCategorySlug || "");
        // Direct match
        if (pCat === normalCat || pMainCat === normalCat) return true;
        // Partial match (e.g., "dog-toys" contains "dog")
        if (pCat.startsWith(catSingular + "-") || pCat.startsWith(catSingular + " ")) return true;
        // Reverse partial match
        if (pCat.includes(normalCat) || normalCat.includes(pCat)) return true;
        return false;
      });
    }
    if (subcategory) {
      const normalSub = normalizeText(subcategory);
      products = products.filter(p => {
        const pSub = normalizeText(p.subcategory || p.subcategorySlug || "");
        const pCat = normalizeText(p.category || "");
        // Direct match on subcategory field
        if (pSub === normalSub) return true;
        // Match on category suffix (e.g., "dog-toys" matches subcategory "toys")
        if (pCat.endsWith("-" + normalSub) || pCat.endsWith(" " + normalSub)) return true;
        // Map common subcategory names
        const subMap = {
          'sleep': ['beds', 'sleeping', 'sleep', 'comfort'],
          'toys': ['toys', 'toy', 'play'],
          'feeding': ['feeding', 'food', 'bowl', 'feeder'],
          'grooming': ['grooming', 'brush', 'shampoo'],
          'health': ['health', 'wellness', 'supplement'],
          'walking': ['walking', 'collars', 'leash', 'harness'],
          'training': ['training', 'potty', 'diaper'],
          'travel': ['travel', 'carrier', 'car']
        };
        const mappedTerms = subMap[normalSub] || [normalSub];
        for (const term of mappedTerms) {
          if (pCat.includes(term) || pSub.includes(term)) return true;
        }
        return false;
      });
    }
    if (offset > 0) products = products.slice(offset);
    if (limit && limit > 0) products = products.slice(0, limit);
    return products;
  },

  getProductById(id) {
    if (!id) return null;
    const data = readDB();
    const products = data.products || [];
    const normalId = String(id).trim();
    
    // Generate ID variants (with/without cj- prefix)
    const variants = [normalId];
    if (normalId.startsWith('cj-')) {
      variants.push(normalId.substring(3)); // without cj-
    } else {
      variants.push('cj-' + normalId); // with cj-
    }
    
    return products.find(p => {
      const pid = String(p.id).trim();
      const spu = String(p.spu || "").trim();
      return variants.some(v => pid === v || spu === v);
    }) || null;
  },
  
  getProductBySlug(slug) {
    if (!slug) return null;
    const data = readDB();
    const products = data.products || [];
    const normalSlug = normalizeText(slug);
    const trimmedSlug = slug.trim();
    
    // Generate slug/id variants (with/without cj- prefix)
    const variants = [trimmedSlug];
    if (trimmedSlug.startsWith('cj-')) {
      variants.push(trimmedSlug.substring(3)); // without cj-
    } else {
      variants.push('cj-' + trimmedSlug); // with cj-
    }
    
    return products.find(p => {
      if (p.slug && normalizeText(p.slug) === normalSlug) return true;
      const pid = String(p.id).trim();
      const spu = String(p.spu || "").trim();
      return variants.some(v => pid === v || spu === v);
    }) || null;
  },

  findProducts(query, options = {}) {
    const { limit = 20, activeOnly = false, category = null, animalUsedOnly = true } = options;
    if (!query || !query.trim()) {
      return this.listProducts({ activeOnly, category, limit, animalUsedOnly });
    }
    const data = readDB();
    let products = data.products || [];
    
    // STRICT FILTER: Only show isPetAllowed=true products
    if (animalUsedOnly) {
      products = products.filter(p => 
        p.isPetAllowed === true || 
        p.petUsageType === 'ANIMAL_USED' || 
        (p.petUsageType === undefined && p.isPetAllowed !== false)
      );
    }
    
    if (activeOnly) {
      products = products.filter(p => p.active === true && p.rejected !== true);
    }
    if (category) {
      const normalCat = normalizeText(category);
      products = products.filter(p => {
        const cats = Array.isArray(p.categories) ? p.categories : (p.category ? [p.category] : []);
        return cats.some(c => normalizeText(c).includes(normalCat));
      });
    }
    const normalQuery = normalizeText(query);
    const scored = [];
    for (const p of products) {
      let bestScore = 0;
      const idMatch = String(p.id || "").trim() === query.trim();
      const spuMatch = String(p.spu || "").trim() === query.trim();
      if (idMatch || spuMatch) {
        bestScore = 200;
      } else {
        const titleMatch = fuzzyMatch(p.title || "", query);
        if (titleMatch.match) bestScore = Math.max(bestScore, titleMatch.score + 50);
        const spuPartialMatch = fuzzyMatch(p.spu || "", query);
        if (spuPartialMatch.match) bestScore = Math.max(bestScore, spuPartialMatch.score + 40);
        const slugMatch = fuzzyMatch(p.slug || "", query);
        if (slugMatch.match) bestScore = Math.max(bestScore, slugMatch.score + 30);
        const descMatch = fuzzyMatch(p.description || "", query);
        if (descMatch.match) bestScore = Math.max(bestScore, descMatch.score);
      }
      if (bestScore > 0) {
        scored.push({ product: p, score: bestScore });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit).map(s => s.product);
    log(`[ProductStore] Search: q="${query}" results=${results.length}`);
    return results;
  },

  updateProduct(id, updates) {
    const data = readDB();
    const products = data.products || [];
    const idx = products.findIndex(p => String(p.id).trim() === String(id).trim());
    if (idx === -1) {
      log(`[ProductStore] updateProduct: product ${id} not found`);
      return null;
    }
    products[idx] = { ...products[idx], ...updates, updatedAt: new Date().toISOString() };
    data.products = products;
    writeDB(data);
    log(`[ProductStore] Updated product ${id}`);
    return products[idx];
  },

  updateProductSeo(id, seoData) {
    return this.updateProduct(id, { 
      seo: {
        ...seoData,
        updatedAt: new Date().toISOString()
      }
    });
  },

  bulkUpdateSeo(updates) {
    const data = readDB();
    const products = data.products || [];
    const byId = new Map(products.map(p => [String(p.id).trim(), p]));
    let count = 0;
    for (const { id, seo } of updates) {
      const product = byId.get(String(id).trim());
      if (product) {
        product.seo = { ...seo, updatedAt: new Date().toISOString() };
        count++;
      }
    }
    data.products = Array.from(byId.values());
    writeDB(data);
    log(`[ProductStore] Bulk SEO update: ${count} products`);
    return count;
  },

  getCategories() {
    const data = readDB();
    const products = data.products || [];
    const cats = new Set();
    for (const p of products) {
      if (p.category) cats.add(p.category);
      if (Array.isArray(p.categories)) {
        p.categories.forEach(c => cats.add(c));
      }
    }
    return Array.from(cats).sort();
  },

  getStats() {
    const data = readDB();
    const products = data.products || [];
    const active = products.filter(p => p.active === true && p.rejected !== true);
    const withSeo = products.filter(p => p.seo && p.seo.seoTitle);
    const publishedSeo = products.filter(p => p.seo && p.seo.published === true);
    return {
      total: products.length,
      active: active.length,
      withSeo: withSeo.length,
      publishedSeo: publishedSeo.length
    };
  },

  backfillProducts() {
    const data = readDB();
    const products = data.products || [];
    const slugMap = new Map();
    let updated = 0;
    
    for (const p of products) {
      if (p.slug) {
        slugMap.set(p.slug.toLowerCase(), (slugMap.get(p.slug.toLowerCase()) || 0) + 1);
      }
    }
    
    for (const p of products) {
      let changed = false;
      
      if (!p.slug && p.title) {
        let baseSlug = generateSlug(p.title);
        if (!baseSlug) baseSlug = `product-${p.id}`;
        
        let finalSlug = baseSlug;
        let counter = 2;
        while (slugMap.has(finalSlug.toLowerCase())) {
          finalSlug = `${baseSlug}-${counter}`;
          counter++;
        }
        p.slug = finalSlug;
        slugMap.set(finalSlug.toLowerCase(), 1);
        changed = true;
      }
      
      if (!p.images) {
        p.images = [];
        if (p.image) p.images.push(p.image);
        if (p.galleryImages && Array.isArray(p.galleryImages)) {
          p.images.push(...p.galleryImages.filter(img => !p.images.includes(img)));
        }
        changed = true;
      }
      
      if (!p.primaryImage && p.images && p.images.length > 0) {
        p.primaryImage = p.images[0];
        changed = true;
      } else if (!p.primaryImage && p.image) {
        p.primaryImage = p.image;
        changed = true;
      }
      
      if (p.descriptionSeo === undefined) {
        p.descriptionSeo = p.seo?.seoDescription || p.description || "";
        changed = true;
      }
      
      if (p.descriptionShort === undefined) {
        p.descriptionShort = (p.description || "").substring(0, 160);
        changed = true;
      }
      
      if (changed) updated++;
    }
    
    if (updated > 0) {
      data.products = products;
      writeDB(data);
      log(`[ProductStore] Backfill completed: ${updated} products updated`);
    }
    
    return { updated, total: products.length };
  },

  reclassifyProducts() {
    const petFilter = require('./config/petFilter');
    const data = readDB();
    const products = data.products || [];
    const stats = {
      total: products.length,
      animalUsed: 0,
      rejectedNonPet: 0,
      reclassified: 0,
      byReason: {},
      byPetType: { DOG: 0, CAT: 0, BOTH: 0 }
    };
    
    for (const p of products) {
      const classification = petFilter.classifyProduct(p);
      
      const oldType = p.petUsageType;
      p.petUsageType = classification.type;
      p.petUsageReason = classification.reason;
      p.petUsageDetails = classification.details;
      p.petUsageClassifiedAt = new Date().toISOString();
      p.isPetAllowed = classification.isPetAllowed;
      p.petType = classification.petType;
      
      if (oldType !== classification.type) {
        stats.reclassified++;
      }
      
      stats.byReason[classification.reason] = (stats.byReason[classification.reason] || 0) + 1;
      
      if (classification.eligible) {
        stats.animalUsed++;
        p.active = true;
        p.rejected = false;
        p.rejectReason = null;
        if (classification.petType) {
          stats.byPetType[classification.petType] = (stats.byPetType[classification.petType] || 0) + 1;
        }
      } else {
        stats.rejectedNonPet++;
        p.active = false;
        p.rejected = true;
        p.isPetAllowed = false;
        p.rejectReason = `${classification.reason}: ${classification.details.slice(0, 2).join(', ')}`;
      }
    }
    
    data.products = products;
    writeDB(data);
    log(`[ProductStore] Reclassify completed: ${stats.reclassified} reclassified, ${stats.animalUsed} ANIMAL_USED, ${stats.rejectedNonPet} REJECTED_NON_PET`);
    
    return stats;
  },
  
  removeNonPetProducts() {
    const data = readDB();
    const products = data.products || [];
    const before = products.length;
    
    const petProducts = products.filter(p => p.isPetAllowed === true || p.petUsageType === 'ANIMAL_USED');
    const removed = before - petProducts.length;
    
    data.products = petProducts;
    writeDB(data);
    log(`[ProductStore] Removed ${removed} non-pet products (${petProducts.length} remaining)`);
    
    return { removed, remaining: petProducts.length };
  },

  getProductsByPetUsageType(type) {
    const data = readDB();
    const products = data.products || [];
    return products.filter(p => p.petUsageType === type);
  },

  getPetUsageStats() {
    const data = readDB();
    const products = data.products || [];
    const stats = {
      total: products.length,
      animalUsed: 0,
      rejectedNonPet: 0,
      unclassified: 0,
      active: 0,
      rejected: 0
    };
    
    for (const p of products) {
      if (p.petUsageType === 'ANIMAL_USED') stats.animalUsed++;
      else if (p.petUsageType === 'REJECTED_NON_PET') stats.rejectedNonPet++;
      else stats.unclassified++;
      
      if (p.active) stats.active++;
      if (p.rejected) stats.rejected++;
    }
    
    return stats;
  }
};

module.exports = { productStore, normalizeText, fuzzyMatch, readDB, writeDB, generateSlug };
