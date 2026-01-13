const fs = require('fs');
const path = require('path');

const ADULT_BLOCKLIST = ["masturb", "anal", "sex", "sexy", "dildo", "vibrator", "lingerie", "porn", "fetish", "bdsm", "condom", "adult", "nude", "erotic"];
const NON_PET_BLOCKLIST = ["tattoo", "sticker", "phone case", "jewelry", "necklace", "ring", "shoe", "heels", "dress", "makeup", "cosmetic", "tool", "car part"];
const PET_RELEVANT_KEYWORDS = ["dog","cat","pet","puppy","kitten","leash","collar","harness","bed","bowl","feeder","toy","treat","groom","brush","litter","scratch","carrier","stroller","water","fountain"];

const HERO_CONFIG_PATH = path.join(__dirname, '../../data/hero-products.json');
const RESOLVED_HERO_PATH = path.join(__dirname, '../../data/hero-products.resolved.json');
const PRODUCTS_DATA_PATH = path.join(__dirname, '../../data/products_cj.json');

let resolvedCache = null;
let lastResolveTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getLowestPrice(product) {
  let price = parseFloat(product.price || 0);
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const variantPrices = product.variants
      .map(v => parseFloat(v.price || v.sellPrice || 0))
      .filter(p => p > 0);
    if (variantPrices.length > 0) {
      price = Math.min(price, ...variantPrices);
    }
  }
  return price;
}

function passesStrictFilters(product) {
  const title = (product.title || product.name || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const tags = Array.isArray(product.tags) ? product.tags.join(' ').toLowerCase() : (product.tags || '').toLowerCase();
  const category = (product.category || product.mainCategorySlug || '').toLowerCase();
  const combinedText = `${title} ${description} ${tags} ${category}`;

  // A) Adult blocklist
  if (ADULT_BLOCKLIST.some(word => combinedText.includes(word))) return { approved: false, reason: 'blocked_adult' };

  // B) Non-pet blocklist
  if (NON_PET_BLOCKLIST.some(word => combinedText.includes(word))) return { approved: false, reason: 'blocked_nonpet' };

  // C) Pet relevance
  if (!PET_RELEVANT_KEYWORDS.some(word => combinedText.includes(word))) return { approved: false, reason: 'not_pet_relevant' };

  // D) Images
  const image = product.image || (Array.isArray(product.images) && product.images[0]);
  if (!image || typeof image !== 'string' || image.toLowerCase().includes('no-image') || image.toLowerCase().includes('placeholder')) {
    return { approved: false, reason: 'no_image' };
  }

  // E) Price range (12-79 USD)
  const price = getLowestPrice(product);
  if (price < 12 || price > 79) return { approved: false, reason: 'price_out_of_range' };

  // F) Availability
  if (product.active === false || product.published === false) return { approved: false, reason: 'not_active' };

  return { approved: true };
}

const PET_TYPE_MAP_PATH = path.join(__dirname, '../../data/petType-map.json');

function getPetType(product, petMap) {
  const id = String(product.id);
  if (petMap && petMap[id]) return petMap[id].petType;
  
  const title = (product.title || '').toLowerCase();
  const category = (product.mainCategorySlug || '').toLowerCase();
  if (title.includes('dog') || category.includes('dog')) return 'dog';
  if (title.includes('cat') || category.includes('cat')) return 'cat';
  return 'unknown';
}

async function resolveHeroProducts(force = false) {
  const now = Date.now();
  if (!force && resolvedCache && (now - lastResolveTime < CACHE_TTL)) {
    return resolvedCache;
  }

  console.log('[HeroResolver] Starting resolution...');
  
  let products = [];
  try {
    const data = JSON.parse(fs.readFileSync(PRODUCTS_DATA_PATH, 'utf-8'));
    products = data.products || (Array.isArray(data) ? data : []);
  } catch (err) {
    console.error('[HeroResolver] Error reading products data:', err.message);
    return null;
  }

  let petMap = {};
  if (fs.existsSync(PET_TYPE_MAP_PATH)) {
    try {
      petMap = JSON.parse(fs.readFileSync(PET_TYPE_MAP_PATH, 'utf-8'));
    } catch (e) {}
  }

  let config = { pinnedFirst: {}, manual: {} };
  if (fs.existsSync(HERO_CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(HERO_CONFIG_PATH, 'utf-8'));
    } catch (err) {
      console.error('[HeroResolver] Error reading hero config:', err.message);
    }
  }

  const skipped = [];
  const processedProducts = products.map(p => {
    const filter = passesStrictFilters(p);
    const pType = getPetType(p, petMap);
    return { product: p, ...filter, petType: pType };
  });

  processedProducts.filter(p => !p.approved).forEach(p => {
    skipped.push({ id: p.product.id, title: p.product.title, reason: p.reason });
  });

  const approvedPool = processedProducts
    .filter(p => p.approved)
    .sort((a, b) => {
      const scoreA = (a.product.rating || 0) * 100 + (a.product.reviewCount || 0);
      const scoreB = (b.product.rating || 0) * 100 + (b.product.reviewCount || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return String(a.product.id).localeCompare(String(b.product.id));
    });

  const usedIds = new Set();
  const resolveSection = (sectionName, count, options = {}) => {
    let result = [];
    const { keywords = [], allowedPetTypes = [] } = options;
    
    // 1. Check manual config
    if (config.manual && Array.isArray(config.manual[sectionName])) {
      config.manual[sectionName].forEach(id => {
        const idStr = String(id);
        const entry = approvedPool.find(p => String(p.product.id) === idStr);
        if (entry && !usedIds.has(entry.product.id)) {
          if (allowedPetTypes.length > 0 && !allowedPetTypes.includes(entry.petType)) {
            skipped.push({ id: idStr, reason: `pet_type_mismatch_${entry.petType}`, section: sectionName });
            return;
          }
          result.push(entry.product);
          usedIds.add(entry.product.id);
        } else if (!entry) {
          skipped.push({ id: idStr, reason: 'not_found_or_filtered_in_manual', section: sectionName });
        }
      });
    }

    // 2. Check pinnedFirst
    if (result.length < count && config.pinnedFirst && config.pinnedFirst[sectionName]) {
      const pinnedIdStr = String(config.pinnedFirst[sectionName]);
      const entry = approvedPool.find(p => String(p.product.id) === pinnedIdStr);
      if (entry && !usedIds.has(entry.product.id)) {
        if (allowedPetTypes.length === 0 || allowedPetTypes.includes(entry.petType)) {
          result.unshift(entry.product);
          usedIds.add(entry.product.id);
        }
      }
    }

    // 3. Auto-fill
    if (result.length < count) {
      const filteredPool = approvedPool.filter(entry => {
        if (usedIds.has(entry.product.id)) return false;
        if (allowedPetTypes.length > 0 && !allowedPetTypes.includes(entry.petType)) return false;
        
        if (keywords.length > 0) {
          const text = `${entry.product.title} ${entry.product.description} ${entry.product.mainCategorySlug}`.toLowerCase();
          return keywords.some(k => text.includes(k));
        }
        return true;
      });

      for (const entry of filteredPool) {
        if (result.length >= count) break;
        result.push(entry.product);
        usedIds.add(entry.product.id);
      }
    }

    return result.slice(0, count);
  };

  const resolved = {
    bestSellers: resolveSection('bestSellers', 4, { allowedPetTypes: ['dog', 'cat'] }),
    trendingNow: resolveSection('trendingNow', 4, { allowedPetTypes: ['dog', 'cat'] }),
    topPicksDogs: resolveSection('topPicksDogs', 3, { allowedPetTypes: ['dog'], keywords: ['dog', 'puppy'] }),
    topPicksCats: resolveSection('topPicksCats', 3, { allowedPetTypes: ['cat'], keywords: ['cat', 'kitten'] }),
    topPicksSmallPets: resolveSection('topPicksSmallPets', 3, { allowedPetTypes: ['small'] }),
    _meta: {
      generatedAt: new Date().toISOString(),
      counts: {
        bestSellers: 0,
        trendingNow: 0,
        topPicksDogs: 0,
        topPicksCats: 0,
        topPicksSmallPets: 0
      }
    }
  };

  resolved._meta.counts.bestSellers = resolved.bestSellers.length;
  resolved._meta.counts.trendingNow = resolved.trendingNow.length;
  resolved._meta.counts.topPicksDogs = resolved.topPicksDogs.length;
  resolved._meta.counts.topPicksCats = resolved.topPicksCats.length;
  resolved._meta.counts.topPicksSmallPets = resolved.topPicksSmallPets.length;

  resolvedCache = { resolved, skipped };
  lastResolveTime = now;

  fs.writeFileSync(RESOLVED_HERO_PATH, JSON.stringify(resolvedCache, null, 2));
  return resolvedCache;
}

module.exports = {
  resolveHeroProducts,
  getResolvedHero: () => resolvedCache
};
