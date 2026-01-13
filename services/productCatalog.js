const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const HERO_FILE = path.join(DATA_DIR, "hero-products.json");
const LEGACY_FILE = path.join(DATA_DIR, "products_cj.json");

let productCache = null;
let catalogCache = null;
let heroCache = null;
let lastLoad = null;

function loadCatalog() {
  if (catalogCache && productCache && productCache.length > 0) {
    return catalogCache;
  }

  if (fs.existsSync(CATALOG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf-8"));
      catalogCache = data;
      productCache = data.products || [];
      lastLoad = new Date();
      console.log(`[Catalog] Loaded ${productCache.length} products from catalog.json`);
      return catalogCache;
    } catch (err) {
      console.error(`[Catalog] Failed to parse catalog.json: ${err.message}`);
    }
  }

  if (fs.existsSync(LEGACY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf-8"));
      const products = Array.isArray(data) ? data : (data.products || []);
      if (products.length === 0) {
        throw new Error("FATAL: products_cj.json is empty");
      }
      productCache = products;
      catalogCache = { products, stats: { total: products.length } };
      lastLoad = new Date();
      console.log(`[Catalog] Loaded ${products.length} products from products_cj.json (legacy mode)`);
      return catalogCache;
    } catch (err) {
      if (err.message.startsWith("FATAL:")) throw err;
      throw new Error(`FATAL: Failed to parse products_cj.json: ${err.message}`);
    }
  }

  throw new Error("FATAL: No product data found. Run 'node scripts/import-cj.js' first.");
}

function loadProducts() {
  loadCatalog();
  return productCache || [];
}

function loadHero() {
  if (heroCache) return heroCache;
  
  if (fs.existsSync(HERO_FILE)) {
    try {
      heroCache = JSON.parse(fs.readFileSync(HERO_FILE, "utf-8"));
      return heroCache;
    } catch (err) {
      console.error(`[Catalog] Failed to parse hero-products.json: ${err.message}`);
    }
  }
  
  return null;
}

function getProducts(options = {}) {
  let products = loadProducts();

  if (options.category && options.category !== "all") {
    products = products.filter(p => 
      p.categories?.includes(options.category) || 
      p.category === options.category ||
      p.mainCategorySlug === options.category
    );
  }

  if (options.petType && options.petType !== "all") {
    products = products.filter(p => 
      p.pet_type === options.petType || 
      p.pet_type === "both"
    );
  }

  if (options.search) {
    const query = options.search.toLowerCase();
    products = products.filter(p => 
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.title && p.title.toLowerCase().includes(query)) ||
      (p.category && p.category.toLowerCase().includes(query)) ||
      (p.categories && p.categories.some(c => c.toLowerCase().includes(query))) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(query)))
    );
  }

  if (options.sort) {
    switch (options.sort) {
      case "price-asc":
        products.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case "price-desc":
        products.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case "name-asc":
        products.sort((a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || ""));
        break;
      case "rating":
        products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "newest":
        products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        break;
    }
  }

  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 50;
  const start = (page - 1) * limit;
  
  return {
    products: products.slice(start, start + limit),
    total: products.length,
    page,
    totalPages: Math.ceil(products.length / limit)
  };
}

function getProductById(id) {
  const products = loadProducts();
  const stringId = String(id);
  return products.find(p => 
    String(p.id) === stringId || 
    String(p.cj_pid) === stringId ||
    p.slug === id
  ) || null;
}

function getProductBySlug(slug) {
  const products = loadProducts();
  return products.find(p => p.slug === slug) || null;
}

function getBestSellers(limit = 12) {
  const products = loadProducts();
  return products
    .filter(p => p.badge === "Best Seller" || (p.rating || 0) >= 4.7)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, limit);
}

function getTrending(limit = 12) {
  const products = loadProducts();
  return products
    .filter(p => p.badge === "Trending")
    .sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0))
    .slice(0, limit);
}

function getTopPicksForDogs(limit = 12) {
  const products = loadProducts();
  return products
    .filter(p => p.pet_type === "dog" || p.pet_type === "both")
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, limit);
}

function getTopPicksForCats(limit = 12) {
  const products = loadProducts();
  return products
    .filter(p => p.pet_type === "cat" || p.pet_type === "both")
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, limit);
}

function getTopPicksForSmallPets(limit = 12) {
  const products = loadProducts();
  return products
    .filter(p => p.pet_type === "small_pet")
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, limit);
}

function getHeroProducts() {
  const hero = loadHero();
  if (!hero) {
    return {
      bestSellers: getBestSellers(15).map(p => p.id),
      trending: getTrending(15).map(p => p.id),
      topPicksDogs: getTopPicksForDogs(15).map(p => p.id),
      topPicksCats: getTopPicksForCats(15).map(p => p.id),
      topPicksSmallPets: getTopPicksForSmallPets(15).map(p => p.id)
    };
  }
  return hero;
}

function getHeroProductsResolved() {
  const hero = getHeroProducts();
  const products = loadProducts();
  const productMap = new Map(products.map(p => [String(p.id), p]));
  
  const resolve = (ids) => {
    return (ids || [])
      .map(id => productMap.get(String(id)))
      .filter(p => p && p.images && p.images.length > 0);
  };
  
  return {
    bestSellers: resolve(hero.bestSellers),
    trending: resolve(hero.trending),
    topPicksDogs: resolve(hero.topPicksDogs),
    topPicksCats: resolve(hero.topPicksCats),
    topPicksSmallPets: resolve(hero.topPicksSmallPets)
  };
}

function getProductsByCategory(category, limit = 20) {
  const products = loadProducts();
  return products
    .filter(p => 
      p.categories?.includes(category) || 
      p.category === category ||
      p.mainCategorySlug === category ||
      p.subcategorySlug === category
    )
    .slice(0, limit);
}

function getRandomProducts(limit = 8) {
  const products = loadProducts();
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

function getCatalogStats() {
  const catalog = loadCatalog();
  const products = productCache || [];
  
  return {
    total: products.length,
    dogs: products.filter(p => p.pet_type === "dog" || p.pet_type === "both").length,
    cats: products.filter(p => p.pet_type === "cat" || p.pet_type === "both").length,
    smallPets: products.filter(p => p.pet_type === "small_pet").length,
    active: products.filter(p => p.active !== false).length,
    withImages: products.filter(p => p.images && p.images.length > 0).length,
    withLocalMedia: products.filter(p => p.images?.some(img => img.startsWith("/media/"))).length,
    lastLoad: lastLoad ? lastLoad.toISOString() : null,
    source: fs.existsSync(CATALOG_FILE) ? "catalog.json" : "products_cj.json"
  };
}

function clearCache() {
  productCache = null;
  catalogCache = null;
  heroCache = null;
  lastLoad = null;
}

function reloadCatalog() {
  clearCache();
  return loadCatalog();
}

const NON_PET_BLOCKLIST = [
  'tattoo', 'jewelry', 'necklace', 'bracelet', 'earring', 'ring', 'pendant',
  'women', 'men', 'dress', 'shirt', 'tee', 'hoodie', 'sweater', 'blouse',
  'phone case', 'iphone', 'airpods', 'ipad case', 'tablet',
  'makeup', 'cosmetic', 'wig', 'hair extension',
  'bedding', 'duvet', 'pillowcase', 'curtain', 'tablecloth',
  'sticker', 'wall art', 'poster', 'canvas print',
  'keychain', 'car accessories', 'motorcycle',
  'fishing', 'camping gear', 'sports equipment',
  'baby clothes', 'kids dress', 'infant',
  'wedding', 'party decoration', 'balloon',
  'garden tool', 'power tool', 'drill',
  'kitchen gadget', 'cookware', 'bakeware'
];

const PET_POSITIVE_KEYWORDS = [
  'pet', 'dog', 'cat', 'puppy', 'kitten', 'canine', 'feline',
  'leash', 'harness', 'collar', 'litter', 'scratch', 'grooming',
  'treat', 'chew', 'toy', 'bowl', 'feeder', 'crate', 'carrier',
  'bed', 'diaper', 'training', 'paw', 'fur', 'bark', 'meow',
  'pet clothing', 'pet costume', 'pet bed', 'pet bowl', 'pet carrier'
];

function isPetProduct(product) {
  if (!product) return false;
  
  const text = [
    product.name || '',
    product.title || '',
    product.category || '',
    product.description || '',
    ...(product.tags || []),
    ...(product.categories || [])
  ].join(' ').toLowerCase();
  
  for (const blocked of NON_PET_BLOCKLIST) {
    if (text.includes(blocked)) {
      if (!text.includes('pet') && !text.includes('dog') && !text.includes('cat')) {
        return false;
      }
    }
  }
  
  for (const keyword of PET_POSITIVE_KEYWORDS) {
    if (text.includes(keyword)) {
      return true;
    }
  }
  
  if (product.category === 'dogs' || product.category === 'cats' || product.category === 'pets') {
    return true;
  }
  
  return false;
}

module.exports = {
  loadProducts,
  loadCatalog,
  loadHero,
  getProducts,
  getProductById,
  getProductBySlug,
  getBestSellers,
  getTrending,
  getTopPicksForDogs,
  getTopPicksForCats,
  getTopPicksForSmallPets,
  getHeroProducts,
  getHeroProductsResolved,
  getProductsByCategory,
  getRandomProducts,
  getCatalogStats,
  clearCache,
  reloadCatalog,
  isPetProduct
};
