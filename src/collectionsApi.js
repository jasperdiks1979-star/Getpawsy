const fs = require('fs');
const path = require('path');
const { filterStorefrontProducts } = require('./petSafetyNet');
const { isPetEligible, getPetProducts, assertHomepagePetOnly } = require('./strictPetProducts');
const productSafety = require('./lib/productSafety');
const { filterPetOnly } = require('./lib/petOnly');
const { isPetApproved, filterPetApproved, PETONLY_MODE } = require('./lib/petOnlyEngine');

const COLLECTIONS_PATH = path.join(__dirname, '../data/computed/collections.json');
const CATEGORY_BEST_PATH = path.join(__dirname, '../data/computed/category-best.json');
const DB_PATH = path.join(__dirname, '../data/db.json');

function loadCollections() {
  if (!fs.existsSync(COLLECTIONS_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(COLLECTIONS_PATH, 'utf8'));
}

function loadCategoryBest() {
  if (!fs.existsSync(CATEGORY_BEST_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CATEGORY_BEST_PATH, 'utf8'));
}

function loadProducts() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  return db.products || [];
}

function getProductById(products, id) {
  return products.find(p => p.id === id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PET-ONLY LOCKDOWN: Use centralized petOnlyEngine for all eligibility checks
// ═══════════════════════════════════════════════════════════════════════════════
function getEligibleProducts(products) {
  // First apply pet-only lockdown filter
  const { products: petApproved } = filterPetApproved(products, PETONLY_MODE);
  
  // Then apply CJ eligibility
  return petApproved.filter(p => {
    if (p.hidden_from_storefront === true) return false;
    
    // STRICT: Must have CJ product ID (real product from CJ Dropshipping)
    const hasCjId = p.cjProductId || p.cjPid || p.cj_pid || 
                   (p.id && (p.id.startsWith('cj-') || /^\d{15,}$/.test(p.id)));
    if (!hasCjId) return false;
    
    const tags = p.tags || [];
    const hasUSWarehouse = tags.length === 0 || tags.some(t => 
      t.toLowerCase().includes('us-warehouse') || 
      t.toLowerCase().includes('us warehouse') ||
      t.toLowerCase() === 'us') ||
      p.warehouseCountry === 'US' ||
      p.importedSource === 'CJ-PRO';
    return hasUSWarehouse;
  });
}

function getBestSellers(products, limit = 10) {
  const { dogs, cats } = getPetProducts(products);
  const allPetProducts = [...dogs, ...cats]
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  
  // First try products explicitly marked as best sellers
  let result = allPetProducts
    .filter(p => p.is_best_seller === true)
    .sort((a, b) => ((b.sales_score || 0) + (b.views_score || 0)) - ((a.sales_score || 0) + (a.views_score || 0)))
    .slice(0, limit);
  
  // If no explicit best sellers, show highest-rated pet products with good images
  if (result.length === 0) {
    result = allPetProducts
      .filter(p => p.images && p.images.length > 0)
      .sort((a, b) => {
        const scoreA = (a.popularity_score || 0) + (a.featured_score || 0) + (a.rating || 0) * 10;
        const scoreB = (b.popularity_score || 0) + (b.featured_score || 0) + (b.rating || 0) * 10;
        return scoreB - scoreA;
      })
      .slice(0, limit);
    console.log(`[Collections] No explicit best sellers, using top ${result.length} by score`);
  }
  
  return filterPetOnly(assertHomepagePetOnly(result, 'getBestSellers'), 'getBestSellers');
}

function getTrendingNow(products, limit = 12) {
  const { dogs, cats } = getPetProducts(products);
  const allPetProducts = [...dogs, ...cats]
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  
  // First try products explicitly marked as trending
  let result = allPetProducts
    .filter(p => p.is_trending === true)
    .sort((a, b) => (b.trending_score || 0) - (a.trending_score || 0))
    .slice(0, limit);
  
  // If no explicit trending, show recent pet products with good variety
  if (result.length === 0) {
    result = allPetProducts
      .filter(p => p.images && p.images.length > 0)
      .sort((a, b) => {
        // Mix of recency and variety
        const scoreA = (a.featured_score || 0) + (a.views_score || 0);
        const scoreB = (b.featured_score || 0) + (b.views_score || 0);
        return scoreB - scoreA;
      })
      .slice(0, limit);
    console.log(`[Collections] No explicit trending, using top ${result.length} by recency`);
  }
  
  return filterPetOnly(assertHomepagePetOnly(result, 'getTrendingNow'), 'getTrendingNow');
}

function getTopPicks(products, petType, limit = 8) {
  const { dogs, cats } = getPetProducts(products);
  
  const petFiltered = petType === 'dogs' ? dogs : cats;
  
  let result = petFiltered
    .sort((a, b) => (b.featured_score || 0) - (a.featured_score || 0))
    .slice(0, limit);
  
  const sectionName = petType === 'dogs' ? 'topPicksDogs' : 'topPicksCats';
  return filterPetOnly(assertHomepagePetOnly(result, sectionName), sectionName);
}

function formatProductForCollection(product, rank) {
  return {
    product_id: product.id,
    rank,
    product: {
      id: product.id,
      slug: product.slug,
      title: product.short_title || product.title,
      price: product.price,
      originalPrice: product.originalPrice,
      image: product.images?.[0] || product.image,
      images: product.images,
      rating: product.rating,
      reviewCount: product.reviewCount,
      badges: product.badges || [],
      mainCategorySlug: product.mainCategorySlug,
      subcategorySlug: product.subcategorySlug,
      tags: product.tags || [],
      is_featured: product.is_featured,
      is_trending: product.is_trending,
      is_best_seller: product.is_best_seller
    }
  };
}

function enrichCollectionWithProducts(collection, products) {
  if (!collection || !collection.items) return null;
  
  const enrichedItems = collection.items.map(item => {
    const product = getProductById(products, item.product_id);
    if (!product) return null;
    
    return {
      ...item,
      product: {
        id: product.id,
        slug: product.slug,
        title: product.short_title || product.title,
        price: product.price,
        originalPrice: product.originalPrice,
        image: product.images?.[0] || product.image,
        images: product.images,
        rating: product.rating,
        reviewCount: product.reviewCount,
        badges: product.badges || [],
        mainCategorySlug: product.mainCategorySlug,
        subcategorySlug: product.subcategorySlug,
        tags: product.tags || []
      }
    };
  }).filter(Boolean);
  
  return {
    ...collection,
    items: enrichedItems
  };
}

function getCollection(slug) {
  const collections = loadCollections();
  const products = filterStorefrontProducts(loadProducts());
  const collection = collections[slug];
  
  if (!collection) return null;
  
  return enrichCollectionWithProducts(collection, products);
}

function getCategoryBest(categorySlug) {
  const categoryBest = loadCategoryBest();
  const products = filterStorefrontProducts(loadProducts());
  
  const items = categoryBest[categorySlug] || [];
  
  return enrichCollectionWithProducts({
    slug: `best-in-${categorySlug}`,
    title: `Best in ${categorySlug}`,
    items
  }, products);
}

const BUNDLE_RULES = {
  'collars-leashes': ['grooming', 'toys', 'training'],
  'bowls-feeders': ['food-treats', 'grooming', 'health'],
  'grooming': ['health', 'bowls-feeders', 'toys'],
  'toys': ['food-treats', 'grooming', 'training'],
  'beds-furniture': ['blanket', 'toys', 'grooming'],
  'training': ['toys', 'food-treats', 'collars-leashes'],
  'travel': ['bowls-feeders', 'toys', 'beds-furniture'],
  'health': ['grooming', 'bowls-feeders', 'food-treats'],
  'food-treats': ['bowls-feeders', 'toys', 'training'],
  'litter': ['grooming', 'toys', 'health']
};

function getProductBundles(productId, limit = 3) {
  const products = filterStorefrontProducts(loadProducts());
  const product = products.find(p => p.id === productId);
  
  if (!product) return [];
  
  const subcategory = product.subcategorySlug;
  const mainCategory = product.mainCategorySlug;
  const compatibleCategories = BUNDLE_RULES[subcategory] || ['toys', 'grooming', 'food-treats'];
  
  const candidates = products.filter(p => {
    if (p.id === productId) return false;
    if (p.mainCategorySlug !== mainCategory) return false;
    if (!compatibleCategories.includes(p.subcategorySlug)) return false;
    if (p.price > 45 || p.price < 5) return false;
    return true;
  });
  
  const scored = candidates.map(p => {
    let score = 50;
    const imageCount = (p.images || []).length;
    if (imageCount >= 3) score += 20;
    if (p.price >= 10 && p.price <= 35) score += 15;
    if (p.enrichment_mode) score += 10;
    return { ...p, _bundleScore: score };
  }).sort((a, b) => b._bundleScore - a._bundleScore);
  
  return scored.slice(0, limit).map((p, i) => ({
    product_id: p.id,
    rank: i + 1,
    reason: `Pairs well with ${product.subcategorySlug}`,
    product: {
      id: p.id,
      slug: p.slug,
      title: p.short_title || p.title,
      price: p.price,
      originalPrice: p.originalPrice,
      image: p.images?.[0] || p.image,
      mainCategorySlug: p.mainCategorySlug,
      subcategorySlug: p.subcategorySlug
    }
  }));
}

function setupCollectionsRoutes(app, requireAdminSession) {
  app.get('/api/collections/:slug', (req, res) => {
    try {
      const slug = req.params.slug;
      const products = loadProducts();
      
      if (slug === 'best-sellers') {
        const items = getBestSellers(products, 12);
        return res.json({
          slug: 'best-sellers',
          title: 'Best Sellers',
          items: items.map((p, i) => formatProductForCollection(p, i + 1))
        });
      }
      
      if (slug === 'trending-now') {
        const items = getTrendingNow(products, 12);
        return res.json({
          slug: 'trending-now',
          title: 'Trending Now',
          items: items.map((p, i) => formatProductForCollection(p, i + 1))
        });
      }
      
      if (slug === 'top-picks-dogs') {
        const items = getTopPicks(products, 'dogs', 8);
        return res.json({
          slug: 'top-picks-dogs',
          title: 'Top Picks for Dogs',
          items: items.map((p, i) => formatProductForCollection(p, i + 1))
        });
      }
      
      if (slug === 'top-picks-cats') {
        const items = getTopPicks(products, 'cats', 8);
        return res.json({
          slug: 'top-picks-cats',
          title: 'Top Picks for Cats',
          items: items.map((p, i) => formatProductForCollection(p, i + 1))
        });
      }
      
      const collection = getCollection(slug);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }
      res.json(collection);
    } catch (err) {
      console.error('Error fetching collection:', err);
      res.status(500).json({ error: 'Failed to fetch collection' });
    }
  });
  
  app.get('/api/collections/best-in-category/:slug', (req, res) => {
    try {
      const collection = getCategoryBest(req.params.slug);
      res.json(collection);
    } catch (err) {
      console.error('Error fetching category best:', err);
      res.status(500).json({ error: 'Failed to fetch category best' });
    }
  });
  
  app.get('/api/products/:id/bundles', (req, res) => {
    try {
      const bundles = getProductBundles(req.params.id);
      res.json({ bundles });
    } catch (err) {
      console.error('Error fetching bundles:', err);
      res.status(500).json({ error: 'Failed to fetch bundles' });
    }
  });
  
  // FILTER-REPORT ENDPOINT
  app.get('/api/debug/filter-report', (req, res) => {
    try {
      const { filterProducts } = require('./lib/productFilter');
      const products = loadProducts();
      const { stats } = filterProducts(products);
      
      res.json({
        totalProducts: stats.total,
        visibleProducts: stats.allowed,
        blockedProducts: stats.total - stats.allowed,
        blockedReasons: {
          adult: stats.blockedAdult,
          nonPet: stats.blockedNonPet,
          noImage: stats.blockedNoImage,
          invalidCategory: stats.blockedNonPet, // Grouped in stats but separate in logic
          invalidPrice: stats.blockedInvalidPrice
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // FILTERED PRODUCT SEARCH
  app.get('/api/search', (req, res) => {
    try {
      const { filterProducts } = require('./lib/productFilter');
      const products = loadProducts();
      const query = (req.query.q || '').toLowerCase();
      
      const results = products.filter(p => 
        (p.title || '').toLowerCase().includes(query) || 
        (p.description || '').toLowerCase().includes(query)
      );
      
      const { products: filtered } = filterProducts(results);
      res.json(filtered.slice(0, 50));
    } catch (err) {
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // DEBUG FILTER ENDPOINT
  app.get('/api/debug/filter', (req, res) => {
    try {
      const { filterProducts, getFilterMode } = require('./lib/productFilter');
      const products = loadProducts();
      const { products: filtered, stats } = filterProducts(products);
      
      res.json({
        mode: getFilterMode(),
        stats,
        sampleAllowed: filtered.slice(0, 5).map(p => ({ id: p.id, title: p.title })),
        buildId: process.env.BUILD_ID || 'dev'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SMALL PETS REPORT ENDPOINT
  app.get('/api/debug/small-pets-report', (req, res) => {
    try {
      const key = req.query.key;
      if (process.env.DEBUG_KEY && key !== process.env.DEBUG_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      const petMap = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/petType-map.json'), 'utf-8'));
      const products = loadProducts();
      
      const stats = {
        dog: 0,
        cat: 0,
        small: 0,
        breakdown: { rabbit: 0, hamster: 0, guinea_pig: 0, other: 0 }
      };
      
      const candidates = [];
      
      products.forEach(p => {
        const id = String(p.id);
        const mapped = petMap[id];
        if (mapped) {
          if (mapped.petType === 'small') {
            stats.small++;
            stats.breakdown[mapped.subType]++;
            candidates.push({ id, title: p.title, subType: mapped.subType });
          } else if (mapped.petType === 'dog') stats.dog++;
          else if (mapped.petType === 'cat') stats.cat++;
        }
      });
      
      res.json({
        stats,
        topCandidates: candidates.slice(0, 30)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ENHANCED DEBUG HERO ENDPOINT WITH AUTH
  app.get('/api/debug/homepage-carousels', async (req, res) => {
    try {
      const key = req.query.key;
      if (process.env.DEBUG_KEY && key !== process.env.DEBUG_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      
      const { resolveHeroProducts } = require('./heroProducts/resolveHeroProducts');
      const result = await resolveHeroProducts();
      
      const report = {};
      const sections = ['bestSellers', 'trendingNow', 'topPicksDogs', 'topPicksCats', 'topPicksSmallPets'];
      
      const petMap = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/petType-map.json'), 'utf-8'));
      
      sections.forEach(s => {
        report[s] = (result.resolved[s] || []).map(p => ({
          id: p.id,
          title: p.title,
          petType: petMap[String(p.id)]?.petType || 'unknown',
          subType: petMap[String(p.id)]?.subType || 'unknown'
        }));
      });
      
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SMALL PETS COLLECTIONS
  app.get('/api/collections/small-pets/:subType?', (req, res) => {
    try {
      const subType = req.params.subType;
      const petMap = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/petType-map.json'), 'utf-8'));
      const products = loadProducts();
      
      const { filterProducts } = require('./lib/productFilter');
      const { products: safeProducts } = filterProducts(products);
      
      const filtered = safeProducts.filter(p => {
        const mapped = petMap[String(p.id)];
        if (!mapped || mapped.petType !== 'small') return false;
        if (subType && mapped.subType !== subType.replace(/-/g, '_').replace(/s$/, '')) {
          // Handle plural/singular and hyphenated subtypes
          const normalized = subType.replace(/-/g, '_').replace(/s$/, '');
          if (mapped.subType !== normalized) return false;
        }
        return true;
      });
      
      res.json({
        title: subType ? `🐰 Small Pets - ${subType}` : "🐰 Small Pets",
        subtitle: "Essentials for rabbits, hamsters & more",
        items: filtered.map((p, i) => formatProductForCollection(p, i + 1))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // HERO-PRODUCTS ENDPOINT
  app.get('/api/hero-products', async (req, res) => {
    try {
      const { resolveHeroProducts } = require('./heroProducts/resolveHeroProducts');
      const result = await resolveHeroProducts();
      res.json(result.resolved);
    } catch (err) {
      console.error('[HeroProducts] Error:', err);
      res.status(500).json({ error: 'Failed to load hero products' });
    }
  });

  // DEBUG HERO ENDPOINT
  app.get('/api/debug/hero', async (req, res) => {
    if (process.env.REPLIT_DEPLOYMENT === '1') {
      return res.status(403).json({ error: "Debug info restricted in production" });
    }
    
    try {
      const { resolveHeroProducts } = require('./heroProducts/resolveHeroProducts');
      const { getHomepageSectionsWithDebug } = require('../helpers/topProducts');
      
      const heroResult = await resolveHeroProducts();
      const dedupResult = getHomepageSectionsWithDebug();
      
      res.json({
        build: process.env.NODE_ENV || 'dev',
        timestamp: new Date().toISOString(),
        heroProducts: {
          counts: heroResult.resolved._meta?.counts || {},
          resolved: heroResult.resolved,
          skipped: heroResult.skipped
        },
        globalDeduplication: {
          sectionsOrder: dedupResult.debug.sectionsOrder,
          sections: dedupResult.debug.sections,
          usedGlobalSet: dedupResult.debug.usedGlobalSet,
          duplicatesFound: dedupResult.debug.duplicatesFound,
          summary: {
            totalUniqueProducts: dedupResult.debug.usedGlobalSet.length,
            totalDuplicatesSkipped: dedupResult.debug.duplicatesFound.length,
            deduplicationActive: true
          }
        }
      });
    } catch (err) {
      console.error('[DebugHero] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // PRODUCTS-SAMPLE ENDPOINT
  app.get('/api/debug/products-sample', (req, res) => {
    try {
      const products = loadProducts();
      const limit = parseInt(req.query.limit || '50');
      const sample = products.slice(0, limit).map(p => ({
        id: p.id,
        title: p.title,
        price: p.price,
        hasImage: !!(p.image || (p.images && p.images[0])),
        category: p.category || p.mainCategorySlug,
        tags: p.tags
      }));
      res.json(sample);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // UNIFIED HOMEPAGE CAROUSELS ENDPOINT - Strictly Hero Whitelist (NO FALLBACK)
  app.get('/api/homepage/carousels', (req, res) => {
    try {
      const { getHeroCarousels } = require('./heroProducts');
      const carousels = getHeroCarousels();
      
      const formatProduct = (p) => ({
        id: String(p.id),
        title: p.short_title || p.title || p.name,
        price: p.price,
        originalPrice: p.old_price || p.originalPrice,
        image: p.images?.[0] || p.image,
        images: p.images,
        petType: p.petType || p.pet_type || p._petType,
        category: p.mainCategorySlug || p.category,
        handle: p.slug || p.id,
        cjId: p.cjProductId || p.cjPid || p.cj_pid,
        stock: p.stock
      });
      
      res.json({
        topPicksDogs: carousels.topPicksDogs.map(formatProduct),
        topPicksCats: carousels.topPicksCats.map(formatProduct),
        topPicksSmallPets: (carousels.topPicksSmallPets || []).map(formatProduct),
        bestSellers: carousels.bestSellers.map(formatProduct),
        trending: carousels.trending.map(formatProduct),
        meta: {
          ...carousels.meta,
          buildId: process.env.BUILD_ID || 'dev',
          source: 'hero-whitelist-strictly-numeric',
          catalogSource: 'data/products_cj.json'
        }
      });
    } catch (err) {
      console.error('[Carousels] Error:', err);
      res.status(500).json({ error: 'Failed to load carousels' });
    }
  });

  // CATALOG DEBUG ENDPOINT - Task 4
  app.get('/api/catalog-debug', (req, res) => {
    try {
      const { loadHeroConfig, resolveHeroProducts } = require('./heroProducts');
      const PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'products_cj.json');
      const catalogData = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
      const catalogProducts = catalogData.products || (Array.isArray(catalogData) ? catalogData : []);
      
      const heroConfig = loadHeroConfig();
      const sampleHeroIds = Object.values(heroConfig).flat().filter(id => typeof id === 'string' || typeof id === 'number').slice(0, 5);
      
      const catalogIds = new Set(catalogProducts.map(p => String(p.id)));
      
      res.json({
        UI_PRODUCT_SOURCE: 'data/products_cj.json',
        catalogCount: catalogProducts.length,
        catalogSampleIds: catalogProducts.slice(0, 5).map(p => String(p.id)),
        heroSource: 'data/hero-products.json',
        heroSampleIds: sampleHeroIds,
        sameSource: true, // Both use products_cj.json
        health: catalogProducts.length > 0 ? 'OK' : 'EMPTY'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // ENHANCED DEBUG ENDPOINT with source tracking
  app.get('/api/debug/carousels', (req, res) => {
    try {
      const products = loadProducts();
      const { dogs, cats, both, rejected } = getPetProducts(products);
      
      const allPetProducts = [...dogs, ...cats]
        .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
      
      const topPicksDogs = getTopPicks(products, 'dogs', 12);
      const topPicksCats = getTopPicks(products, 'cats', 12);
      const bestSellersItems = getBestSellers(products, 12);
      const trendingItems = getTrendingNow(products, 12);
      
      const formatPreview = (p) => ({
        id: p.id,
        title: (p.short_title || p.title || '').slice(0, 50),
        petType: p.petType || p.pet_type || p._petType || 'unknown',
        category: p.mainCategorySlug || p.category || 'unknown',
        reason: isPetEligible(p).reason
      });
      
      res.json({
        counts: {
          total: products.length,
          allowed: allPetProducts.length,
          rejected: rejected.length,
          dogs: dogs.length,
          cats: cats.length,
          both: both.length
        },
        rejectedExamples: rejected.slice(0, 10).map(r => ({
          title: (r.product?.title || '').slice(0, 50),
          reason: r.reason
        })),
        sectionsPreview: {
          bestSellers: bestSellersItems.map(formatPreview),
          trending: trendingItems.map(formatPreview),
          topPicksDogs: topPicksDogs.map(formatPreview),
          topPicksCats: topPicksCats.map(formatPreview)
        },
        sourceMap: {
          endpointUsedByFrontend: '/api/collections/:slug OR /api/homepage/carousels',
          dataSource: 'data/db.json -> products_cj.json',
          filterModule: 'src/strictPetProducts.js',
          filterFunction: 'getPetProducts() + assertHomepagePetOnly()',
          anyFallbacksRemaining: false,
          cacheFiles: []
        },
        allSectionsPetOnly: 
          topPicksDogs.every(p => isPetEligible(p).eligible) &&
          topPicksCats.every(p => isPetEligible(p).eligible) &&
          bestSellersItems.every(p => isPetEligible(p).eligible) &&
          trendingItems.every(p => isPetEligible(p).eligible)
      });
    } catch (err) {
      console.error('[Debug Carousels] Error:', err);
      res.status(500).json({ error: 'Failed to load debug info' });
    }
  });
  
  // REJECTED PRODUCTS DEBUG ENDPOINT - Uses new productSafety module
  app.get('/api/debug/rejected-products', (req, res) => {
    try {
      const products = loadProducts();
      const rejected = [];
      const byReason = {};
      
      products.forEach(p => {
        const blockCheck = productSafety.isBlockedProduct(p);
        const petCheck = productSafety.isPetApproved(p);
        
        if (blockCheck.blocked || !petCheck.approved) {
          const reasons = blockCheck.blocked ? blockCheck.reasons : petCheck.reasons;
          const reason = reasons[0] || 'UNKNOWN';
          const category = reason.split(':')[0] || 'OTHER';
          
          rejected.push({
            id: p.id,
            title: (p.title || '').slice(0, 60),
            reason: reason,
            allReasons: reasons,
            category: category,
            blocked: blockCheck.blocked,
            cjId: p.cjProductId || p.cjPid || null
          });
          
          byReason[category] = (byReason[category] || 0) + 1;
        }
      });
      
      const samples = {};
      for (const [cat] of Object.entries(byReason)) {
        samples[cat] = rejected
          .filter(r => r.category === cat)
          .slice(0, 5)
          .map(r => r.title);
      }
      
      const recentLogs = productSafety.getRecentRejections(50);
      
      res.json({
        totalProducts: products.length,
        totalRejected: rejected.length,
        totalAllowed: products.length - rejected.length,
        byReason: byReason,
        samples: samples,
        recentLogs: recentLogs.slice(0, 20),
        fullList: rejected.slice(0, 100)
      });
    } catch (err) {
      console.error('[Debug Rejected] Error:', err);
      res.status(500).json({ error: 'Failed to load rejected products' });
    }
  });
  
  // CLASSIFICATION DEBUG ENDPOINT
  app.get('/api/debug/classification/:id', (req, res) => {
    try {
      const products = loadProducts();
      const product = products.find(p => p.id === req.params.id);
      
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const blockCheck = productSafety.isBlockedProduct(product);
      const petClassification = productSafety.classifyPetRelevance(product);
      const approvalStatus = productSafety.isPetApproved(product);
      
      res.json({
        productId: product.id,
        title: product.title,
        blockCheck: blockCheck,
        petClassification: petClassification,
        approvalStatus: approvalStatus,
        productFields: {
          petType: product.petType || product.pet_type,
          species: product.species,
          mainCategorySlug: product.mainCategorySlug,
          category: product.category,
          is_pet_product: product.is_pet_product,
          petApproved: product.petApproved
        }
      });
    } catch (err) {
      console.error('[Debug Classification] Error:', err);
      res.status(500).json({ error: 'Failed to classify product' });
    }
  });
  
  // HERO DEBUG ENDPOINT
  app.get('/api/hero-debug', (req, res) => {
    try {
      const { getHeroCarousels, loadHeroConfig } = require('./heroProducts');
      const config = loadHeroConfig();
      const carousels = getHeroCarousels();
      
      const formatResolved = (products) => products.map(p => ({
        id: p.id,
        title: p.title || p.name,
        category: p.mainCategorySlug || p.category
      }));

      res.json({
        build: process.env.BUILD_ID || 'dev',
        heroConfig: config,
        resolved: {
          bestSellers: formatResolved(carousels.bestSellers),
          topPicksDogs: formatResolved(carousels.topPicksDogs),
          topPicksCats: formatResolved(carousels.topPicksCats),
          trendingNow: formatResolved(carousels.trending)
        },
        skipped: {
          notFound: carousels.meta.skipped.filter(s => s.reason === 'not_found'),
          blocked: carousels.meta.skipped.filter(s => s.reason.includes('blocked') || s.reason === 'not_pet_approved')
        }
      });
    } catch (err) {
      console.error('[Hero Debug] Error:', err);
      res.status(500).json({ error: 'Failed to load hero debug' });
    }
  });

  // HOMEPAGE SECTIONS DEBUG ENDPOINT - Uses Hero Products
  app.get('/api/debug/homepage-sections', (req, res) => {
    try {
      const { getHeroCarousels, loadHeroConfig } = require('./heroProducts');
      const config = loadHeroConfig();
      const carousels = getHeroCarousels();
      
      const formatSection = (products, sectionName) => ({
        count: products.length,
        source: 'hero-whitelist',
        productIds: products.map(p => p.id),
        titles: products.map(p => (p.title || p.name || '').slice(0, 40))
      });
      
      res.json({
        source: 'hero-whitelist',
        version: config._meta?.version || '1.0',
        pinnedFirst: config.pinnedFirst || {},
        sections: {
          topPicksDogs: formatSection(carousels.topPicksDogs, 'topPicksDogs'),
          topPicksCats: formatSection(carousels.topPicksCats, 'topPicksCats'),
          bestSellers: formatSection(carousels.bestSellers, 'bestSellers'),
          trendingNow: formatSection(carousels.trending, 'trendingNow')
        },
        meta: carousels.meta,
        totalProductsInSections: carousels.topPicksDogs.length + carousels.topPicksCats.length + 
                                  carousels.bestSellers.length + carousels.trending.length
      });
    } catch (err) {
      console.error('[Debug Homepage Sections] Error:', err);
      res.status(500).json({ error: 'Failed to load homepage sections' });
    }
  });
  
  // SAFETY SCAN DEBUG ENDPOINT
  app.get('/api/debug/safety-scan', (req, res) => {
    try {
      const report = productSafety.getSafetyScanReport();
      if (!report) {
        return res.json({ message: 'No safety scan has been run yet', lastScan: null });
      }
      res.json(report);
    } catch (err) {
      console.error('[Debug Safety Scan] Error:', err);
      res.status(500).json({ error: 'Failed to load safety scan report' });
    }
  });
  
  // RUN SAFETY SCAN ENDPOINT (Admin only)
  app.post('/api/admin/run-safety-scan', requireAdminSession, (req, res) => {
    try {
      const products = loadProducts();
      const report = productSafety.runSafetySweep(products);
      res.json({ success: true, report });
    } catch (err) {
      console.error('[Admin Safety Scan] Error:', err);
      res.status(500).json({ error: 'Failed to run safety scan' });
    }
  });
  
  // UPDATE WHITELISTS ENDPOINT (Admin only)
  app.post('/api/admin/homepage-whitelists', requireAdminSession, (req, res) => {
    try {
      const whitelists = req.body;
      const products = loadProducts();
      const errors = [];
      
      for (const [section, ids] of Object.entries(whitelists)) {
        if (!Array.isArray(ids)) {
          errors.push(`${section} must be an array`);
          continue;
        }
        for (const id of ids) {
          const product = products.find(p => p.id === id);
          if (!product) {
            errors.push(`Product ${id} not found in ${section}`);
          } else if (!productSafety.isPetApproved(product).approved) {
            errors.push(`Product ${id} is not pet-approved in ${section}`);
          }
        }
      }
      
      if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
      }
      
      productSafety.saveWhitelists(whitelists);
      res.json({ 
        success: true, 
        message: 'Whitelists updated',
        counts: Object.fromEntries(
          Object.entries(whitelists).map(([k, v]) => [k, v.length])
        )
      });
    } catch (err) {
      console.error('[Admin Whitelists] Error:', err);
      res.status(500).json({ error: 'Failed to update whitelists' });
    }
  });
  
  app.post('/api/admin/rebuild-merchandising', requireAdminSession, async (req, res) => {
    try {
      const { runBackfill } = require('../scripts/backfill-pet-safety');
      const { buildRankings } = require('../scripts/build-product-rankings');
      
      console.log('[Admin] Running merchandising rebuild...');
      
      const safetyReport = runBackfill();
      const rankingsReport = buildRankings();
      
      res.json({
        success: true,
        safety: {
          total: safetyReport.total,
          pet_ok: safetyReport.pet_ok,
          flagged_non_pet: safetyReport.flagged_non_pet
        },
        rankings: rankingsReport,
        message: 'Merchandising rebuild complete'
      });
    } catch (err) {
      console.error('Error rebuilding merchandising:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  app.post('/api/admin/rebuild-merch-scores', requireAdminSession, async (req, res) => {
    try {
      const { runBackfill } = require('../scripts/backfill-merch-scores');
      
      console.log('[Admin] Running merch scores rebuild...');
      
      const report = runBackfill();
      
      res.json({
        success: true,
        report,
        message: 'Merchandising scores rebuild complete'
      });
    } catch (err) {
      console.error('Error rebuilding merch scores:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  app.get('/api/admin/review/needs-review', requireAdminSession, (req, res) => {
    try {
      const products = loadProducts();
      const needsReview = products.filter(p => p.needs_review === true);
      
      res.json({
        count: needsReview.length,
        products: needsReview.map(p => ({
          id: p.id,
          title: p.title,
          image: p.images?.[0] || p.image,
          review_reason: p.pet_classification_reason,
          price: p.price,
          mainCategorySlug: p.mainCategorySlug
        }))
      });
    } catch (err) {
      console.error('Error fetching needs review:', err);
      res.status(500).json({ error: 'Failed to fetch' });
    }
  });
  
  app.post('/api/admin/review/approve/:id', requireAdminSession, (req, res) => {
    try {
      const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const idx = db.products.findIndex(p => p.id === req.params.id);
      
      if (idx === -1) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      db.products[idx].is_pet_product = true;
      db.products[idx].needs_review = false;
      db.products[idx].hidden_from_storefront = false;
      db.products[idx].review_approved_at = new Date().toISOString();
      
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
      
      res.json({ success: true, message: 'Product approved' });
    } catch (err) {
      console.error('Error approving product:', err);
      res.status(500).json({ error: 'Failed to approve' });
    }
  });
  
  app.post('/api/admin/review/keep-hidden/:id', requireAdminSession, (req, res) => {
    try {
      const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const idx = db.products.findIndex(p => p.id === req.params.id);
      
      if (idx === -1) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      db.products[idx].needs_review = false;
      db.products[idx].hidden_from_storefront = true;
      db.products[idx].permanently_hidden = true;
      
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
      
      res.json({ success: true, message: 'Product kept hidden' });
    } catch (err) {
      console.error('Error hiding product:', err);
      res.status(500).json({ error: 'Failed to hide' });
    }
  });
  
  app.get('/api/admin/review/summary', requireAdminSession, (req, res) => {
    try {
      const products = loadProducts();
      
      const summary = {
        total: products.length,
        pet_ok: products.filter(p => p.is_pet_product === true).length,
        needs_review: products.filter(p => p.needs_review === true).length,
        hidden: products.filter(p => p.hidden_from_storefront === true).length,
        active: products.filter(p => p.active !== false).length,
        by_reason: {}
      };
      
      products.filter(p => p.needs_review).forEach(p => {
        const reason = p.pet_classification_reason || 'UNKNOWN';
        summary.by_reason[reason] = (summary.by_reason[reason] || 0) + 1;
      });
      
      res.json(summary);
    } catch (err) {
      console.error('Error fetching summary:', err);
      res.status(500).json({ error: 'Failed to fetch summary' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PET-ONLY LOCKDOWN ADMIN ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  app.get('/api/admin/petonly/status', requireAdminSession, (req, res) => {
    try {
      const { getLockdownStatus, PETONLY_MODE } = require('./lib/petOnlyEngine');
      const products = loadProducts();
      const status = getLockdownStatus(products, PETONLY_MODE);
      res.json(status);
    } catch (err) {
      console.error('[PetOnly Status] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  app.post('/api/admin/petonly/cleanup', requireAdminSession, (req, res) => {
    try {
      const { runCleanupJob, PETONLY_MODE } = require('./lib/petOnlyEngine');
      const products = loadProducts();
      const results = runCleanupJob(products, PETONLY_MODE);
      
      const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
      
      if (!dryRun && results.disabled > 0) {
        const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        const disabledIds = new Set(results.disabledProducts.map(p => p.id));
        
        db.products = db.products.map(p => {
          if (disabledIds.has(p.id)) {
            return { 
              ...p, 
              active: false, 
              _disabled_by_petonly: true,
              _disabled_reason: results.disabledProducts.find(d => d.id === p.id)?.reason,
              _disabled_at: new Date().toISOString()
            };
          }
          return p;
        });
        
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        console.log(`[PetOnly Cleanup] Disabled ${results.disabled} non-pet products`);
      }
      
      const logPath = path.join(__dirname, '../data/petonly-cleanup-log.json');
      const logEntry = {
        timestamp: new Date().toISOString(),
        dryRun,
        ...results
      };
      
      let logs = [];
      try {
        if (fs.existsSync(logPath)) {
          logs = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        }
      } catch (e) {}
      
      logs.unshift(logEntry);
      logs = logs.slice(0, 50);
      fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
      
      res.json({
        success: true,
        dryRun,
        ...results,
        message: dryRun 
          ? `Dry run: would disable ${results.disabled} products` 
          : `Disabled ${results.disabled} non-pet products`
      });
    } catch (err) {
      console.error('[PetOnly Cleanup] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  app.get('/api/admin/petonly/logs', requireAdminSession, (req, res) => {
    try {
      const logPath = path.join(__dirname, '../data/petonly-cleanup-log.json');
      if (!fs.existsSync(logPath)) {
        return res.json({ logs: [] });
      }
      const logs = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // COMPREHENSIVE CLEANUP ROUTE - Normalize categories, pet_type, and resolved_image
  // ═══════════════════════════════════════════════════════════════════════════════
  app.post('/api/admin/cleanup/run', requireAdminSession, (req, res) => {
    try {
      const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true' || req.body?.dryRun === true;
      const { isValidPetProduct, normalizeCategory, normalizePetType, resolveImage } = require('./lib/productNormalize');
      
      const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const allProducts = db.products || [];
      
      let disabled = 0, kept = 0, fixedCats = 0, fixedPetType = 0, fixedImg = 0;
      const changes = [];
      
      const updatedProducts = allProducts.map(p => {
        const valid = isValidPetProduct(p);
        const nextCategory = normalizeCategory(p.category);
        const nextPetType = normalizePetType(p.pet_type) || normalizePetType(p.category);
        const nextImage = resolveImage(p);
        
        const patch = {};
        
        // Set active based on validity
        if (!valid && p.active !== false) {
          patch.active = false;
          patch._cleanup_disabled = true;
          patch._cleanup_reason = 'not_valid_pet_product';
          disabled++;
        } else if (valid && p.active === false && !p._disabled_by_petonly && !p._cleanup_disabled) {
          // Re-enable if it was accidentally disabled but is actually valid
          patch.active = true;
          kept++;
        } else if (valid) {
          kept++;
        } else {
          disabled++;
        }
        
        // Normalize category
        if (p.category !== nextCategory && nextCategory !== 'Other') {
          patch.category = nextCategory;
          fixedCats++;
        }
        
        // Normalize pet_type
        if (nextPetType && p.pet_type !== nextPetType) {
          patch.pet_type = nextPetType;
          fixedPetType++;
        }
        
        // Add resolved_image field
        if (nextImage && p.resolved_image !== nextImage) {
          patch.resolved_image = nextImage;
          fixedImg++;
        }
        
        if (Object.keys(patch).length > 0) {
          changes.push({
            id: p.id,
            title: (p.title || '').slice(0, 50),
            changes: patch
          });
          
          if (!dryRun) {
            return { ...p, ...patch, _cleanup_at: new Date().toISOString() };
          }
        }
        
        return p;
      });
      
      // Save if not dry run
      if (!dryRun && changes.length > 0) {
        db.products = updatedProducts;
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        console.log(`[Admin Cleanup] Applied ${changes.length} changes: ${disabled} disabled, ${fixedCats} cats, ${fixedPetType} pet types, ${fixedImg} images`);
      }
      
      // Log the cleanup
      const logPath = path.join(__dirname, '../data/admin-cleanup-log.json');
      const logEntry = {
        timestamp: new Date().toISOString(),
        dryRun,
        total: allProducts.length,
        kept,
        disabled,
        fixedCats,
        fixedPetType,
        fixedImg,
        changesCount: changes.length
      };
      
      let logs = [];
      try {
        if (fs.existsSync(logPath)) {
          logs = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        }
      } catch (e) {}
      
      logs.unshift(logEntry);
      logs = logs.slice(0, 50);
      fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
      
      res.json({
        ok: true,
        dryRun,
        total: allProducts.length,
        kept,
        disabled,
        fixedCats,
        fixedPetType,
        fixedImg,
        changesCount: changes.length,
        changes: dryRun ? changes.slice(0, 20) : [],
        message: dryRun 
          ? `Dry run complete. Would modify ${changes.length} products.` 
          : `Cleanup complete. Modified ${changes.length} products.`
      });
    } catch (err) {
      console.error('[Admin Cleanup] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });
  
  app.get('/api/admin/cleanup/logs', requireAdminSession, (req, res) => {
    try {
      const logPath = path.join(__dirname, '../data/admin-cleanup-log.json');
      if (!fs.existsSync(logPath)) {
        return res.json({ logs: [] });
      }
      const logs = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

function getTopPicksDogs(limit = 12) {
  const products = filterStorefrontProducts(loadProducts());
  return getTopPicks(products, 'dogs', limit);
}

function getTopPicksCats(limit = 12) {
  const products = filterStorefrontProducts(loadProducts());
  return getTopPicks(products, 'cats', limit);
}

function getBestSellersPublic(limit = 12) {
  const products = filterStorefrontProducts(loadProducts());
  return getBestSellers(products, limit);
}

function getTrendingNowPublic(limit = 12) {
  const products = filterStorefrontProducts(loadProducts());
  return getTrendingNow(products, limit);
}

module.exports = {
  setupCollectionsRoutes,
  getCollection,
  getCategoryBest,
  getProductBundles,
  getTopPicksDogs,
  getTopPicksCats,
  getBestSellers: getBestSellersPublic,
  getTrendingNow: getTrendingNowPublic
};
