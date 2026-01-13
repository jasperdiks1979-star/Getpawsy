const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const HERO_PATH = path.join(__dirname, '..', 'data', 'hero-products.json');
const EXPORT_PATH = path.join(__dirname, '..', 'data', 'getpawsy_catalog_export_clean.csv');
const IMPORT_PATH = path.join(__dirname, '..', 'data', 'getpawsy_catalog_IMPORT_READY.csv');
const EXCLUDED_LOG_PATH = path.join(__dirname, '..', 'data', 'getpawsy_catalog_excluded_log.csv');

const CATEGORY_BLACKLIST = [
  'human clothing', 'human apparel', 'baby pajamas', 'baby romper', 
  'human jewelry', 'wine glass', 'electronics', 'home decoration', 
  'christmas ornament', 'home lighting', '3d printer', 
  'power tools', 'human doll'
];

const TEXT_BLACKLIST = [
  'women socks', 'womens socks', 'women necklace', 'womens necklace',
  'baby clothing', 'baby clothes', 'kid clothes', 'infant clothing',
  'costume party', 'wine glass', 'champagne glass', 
  'christmas decoration', 'christmas ornament', 
  '3d printer', 'cosmetic', 'makeup', 
  'human bedding', 'human necklace', 'human bracelet',
  'phone case', 'tablet case', 'laptop case',
  'perfume bottle', 'cologne bottle', 'deodorant stick',
  'headphones', 'earbuds', 'bluetooth speaker',
  'tactical armor', 'bulletproof', 'body armor',
  'mattress pad', 'for women only', 'for men only',
  'womens dress', 'womens skirt', 'womens blouse',
  'socks for women', 'jewelry for women'
];

const VALID_PET_TYPES = ['dog', 'cat', 'small_pet'];

function normalizeCategory(category) {
  if (!category) return null;
  const cat = category.toLowerCase();
  if (cat.includes('dog') || cat === 'dogs') return 'Dogs';
  if (cat.includes('cat') || cat === 'cats') return 'Cats';
  if (cat.includes('small') || cat.includes('hamster') || cat.includes('rabbit') || cat.includes('bird') || cat.includes('fish')) return 'Small Pets';
  return category;
}

function normalizePetType(petType, category, title) {
  if (petType && VALID_PET_TYPES.includes(petType)) return petType;
  
  const text = `${category || ''} ${title || ''}`.toLowerCase();
  
  if (text.includes('dog') || text.includes('puppy') || text.includes('canine')) return 'dog';
  if (text.includes('cat') || text.includes('kitten') || text.includes('feline')) return 'cat';
  if (text.includes('hamster') || text.includes('rabbit') || text.includes('bunny') || 
      text.includes('guinea pig') || text.includes('bird') || text.includes('fish') ||
      text.includes('reptile') || text.includes('small pet')) return 'small_pet';
  
  return null;
}

function checkExclusion(product) {
  const title = (product.title || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const text = `${title} ${description}`;
  const categories = product.categories || [];
  
  for (const cat of categories) {
    const catLower = cat.toLowerCase();
    for (const blackCat of CATEGORY_BLACKLIST) {
      if (catLower.includes(blackCat)) {
        return { excluded: true, reason: `Category blacklist: ${blackCat}` };
      }
    }
  }
  
  for (const blackTerm of TEXT_BLACKLIST) {
    if (text.includes(blackTerm)) {
      return { excluded: true, reason: `Text blacklist: ${blackTerm}` };
    }
  }
  
  const petType = normalizePetType(product.pet_type || product.petType, categories[0], product.title);
  if (!petType) {
    return { excluded: true, reason: 'Invalid or missing pet_type' };
  }
  
  const images = product.images || [];
  if (!images.length || !images[0]) {
    return { excluded: true, reason: 'No valid images' };
  }
  
  if (product.isBlocked === true) {
    return { excluded: true, reason: 'Product is blocked (NSFW/inappropriate)' };
  }
  
  return { excluded: false, reason: null };
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function run() {
  console.log('[CatalogCleaner] Starting catalog cleanup...');
  
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  } catch (err) {
    console.error('[CatalogCleaner] Failed to read catalog.json:', err.message);
    process.exit(1);
  }
  
  const products = catalog.products || [];
  console.log(`[CatalogCleaner] Loaded ${products.length} products from catalog.json`);
  
  let heroIds = new Set();
  try {
    const heroData = JSON.parse(fs.readFileSync(HERO_PATH, 'utf-8'));
    const allHeroIds = [
      ...(heroData.bestSellers || []),
      ...(heroData.trending || []),
      ...(heroData.featured || []),
      ...(heroData.newArrivals || [])
    ];
    heroIds = new Set(allHeroIds);
    console.log(`[CatalogCleaner] Loaded ${heroIds.size} hero product IDs`);
  } catch (err) {
    console.log('[CatalogCleaner] No hero-products.json found, continuing without');
  }
  
  const cleanProducts = [];
  const excludedProducts = [];
  
  for (const product of products) {
    const check = checkExclusion(product);
    
    if (check.excluded && !heroIds.has(product.id)) {
      excludedProducts.push({
        product_id: product.id,
        title: product.title,
        reason: check.reason
      });
      continue;
    }
    
    const petType = normalizePetType(product.pet_type || product.petType, (product.categories || [])[0], product.title);
    const category = normalizeCategory((product.categories || [])[0] || product.mainCategorySlug);
    
    cleanProducts.push({
      product_id: product.id,
      variant_id: (product.variants && product.variants[0]?.variantId) || '',
      handle: product.slug,
      title: product.title,
      description: (product.description || '').substring(0, 500),
      price: product.price || 0,
      compare_at_price: product.oldPrice || product.compareAtPrice || '',
      cost: product.cost || '',
      sku: product.sku || product.cjProductId || '',
      cj_product_id: product.cjProductId || product.cj_product_id || '',
      cj_variant_id: (product.variants && product.variants[0]?.variantId) || '',
      category_primary: category || 'Dogs',
      category_secondary: product.subcategorySlug || (product.categories || [])[1] || '',
      pet_type: petType || 'dog',
      collection: product.mainCategorySlug || 'dogs',
      image_urls: (product.images || []).slice(0, 8).join('|'),
      status: product.active !== false ? 'active' : 'draft',
      original: product
    });
  }
  
  console.log(`[CatalogCleaner] Clean products: ${cleanProducts.length}`);
  console.log(`[CatalogCleaner] Excluded products: ${excludedProducts.length}`);
  
  const csvHeaders = [
    'product_id', 'variant_id', 'handle', 'title', 'description', 'price',
    'compare_at_price', 'cost', 'sku', 'cj_product_id', 'cj_variant_id',
    'category_primary', 'category_secondary', 'pet_type', 'collection', 
    'image_urls', 'status'
  ];
  
  const csvRows = cleanProducts.map(p => csvHeaders.map(h => escapeCSV(p[h])).join(','));
  const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
  
  fs.writeFileSync(EXPORT_PATH, csvContent, 'utf-8');
  console.log(`[CatalogCleaner] Wrote clean export: ${EXPORT_PATH}`);
  
  fs.writeFileSync(IMPORT_PATH, csvContent, 'utf-8');
  console.log(`[CatalogCleaner] Wrote import-ready CSV: ${IMPORT_PATH}`);
  
  const excludedHeaders = ['product_id', 'title', 'reason'];
  const excludedRows = excludedProducts.map(p => excludedHeaders.map(h => escapeCSV(p[h])).join(','));
  const excludedContent = [excludedHeaders.join(','), ...excludedRows].join('\n');
  fs.writeFileSync(EXCLUDED_LOG_PATH, excludedContent, 'utf-8');
  console.log(`[CatalogCleaner] Wrote exclusion log: ${EXCLUDED_LOG_PATH}`);
  
  fs.writeFileSync(CATALOG_PATH + '.bak', JSON.stringify(catalog, null, 2), 'utf-8');
  console.log('[CatalogCleaner] Backed up original catalog to catalog.json.bak');
  
  const cleanedCatalog = {
    products: cleanProducts.map(p => {
      const orig = p.original;
      return {
        ...orig,
        pet_type: p.pet_type,
        petType: p.pet_type,
        mainCategorySlug: p.collection,
        active: p.status === 'active',
        isPetProduct: true,
        isBlocked: false
      };
    }),
    lastUpdated: new Date().toISOString(),
    cleanedAt: new Date().toISOString(),
    stats: {
      total: cleanProducts.length,
      excluded: excludedProducts.length,
      byPetType: {
        dog: cleanProducts.filter(p => p.pet_type === 'dog').length,
        cat: cleanProducts.filter(p => p.pet_type === 'cat').length,
        small_pet: cleanProducts.filter(p => p.pet_type === 'small_pet').length
      }
    }
  };
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(cleanedCatalog, null, 2), 'utf-8');
  console.log('[CatalogCleaner] Applied cleaned catalog to catalog.json');
  
  console.log('\n========================================');
  console.log('CATALOG CLEANUP COMPLETE');
  console.log('========================================');
  console.log(`Total products: ${products.length}`);
  console.log(`Clean products: ${cleanProducts.length}`);
  console.log(`Excluded: ${excludedProducts.length}`);
  console.log(`By pet type:`);
  console.log(`  - Dogs: ${cleanedCatalog.stats.byPetType.dog}`);
  console.log(`  - Cats: ${cleanedCatalog.stats.byPetType.cat}`);
  console.log(`  - Small Pets: ${cleanedCatalog.stats.byPetType.small_pet}`);
  console.log('========================================');
  console.log('Files created:');
  console.log(`  - ${EXPORT_PATH}`);
  console.log(`  - ${IMPORT_PATH}`);
  console.log(`  - ${EXCLUDED_LOG_PATH}`);
  console.log('========================================');
}

run();
