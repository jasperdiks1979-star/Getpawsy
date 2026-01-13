const fs = require('fs');
const path = require('path');

const CATALOG_FILE = path.join(process.cwd(), 'data', 'catalog.json');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const AUDIT_FILE = path.join(process.cwd(), 'data', 'catalog-cleanup-audit.jsonl');

const BLACKLIST_TERMS = [
  'wine', 'whiskey', 'alcohol', 'beer', 'vodka', 'liquor', 'champagne', 'bourbon',
  'glass', 'glasses', 'crystal', 'chandelier',
  'jewelry', 'earring', 'necklace', 'bracelet', 'ring', 'pendant', 'brooch', 'anklet',
  'makeup', 'lip gloss', 'lipstick', 'mascara', 'eyeshadow', 'foundation', 'cosmetic', 'blush',
  'pajamas', 'romper', 'onesie', 'nightgown', 'sleepwear', 'lingerie', 'underwear', 'bra', 'panty', 'thong', 'bodysuit', 'stockings',
  'bedding', 'duvet', 'comforter', 'pillow case', 'bed sheet', 'mattress',
  'electronics', 'clamp meter', '3d printer', 'oscilloscope', 'soldering', 'multimeter', 'smartwatch', 'earbuds',
  'baby girl', 'baby boy', 'infant', 'newborn clothing', 'toddler dress',
  'women\'s', 'men\'s', 'ladies', 'gentleman', 'womens', 'for women', 'for men', 'girl\'s', 'boy\'s',
  'phone case', 'laptop', 'tablet', 'computer', 'keyboard', 'mouse pad',
  'costume', 'cosplay', 'halloween adult', 'nightclub', 'halloween costume', 'bunny costume',
  'human hair', 'wig', 'hair extension',
  'stationery', 'notebook', 'pen holder',
  'car accessory', 'motorcycle', 'bicycle part',
  'gaming chair', 'racing chair', 'office chair', 'gaming headset', 'reclining chair',
  'kids desk', 'toddler table', 'kids furniture', 'kids chair', 'bookshelf', 'cabinet', 'drawer',
  'kitten heels', 'cat ears headband', 'fashion boots', 'pointed toe heels', 'slim fit coat',
  'desk decoration', 'home decoration', 'wall art',
  'thermal socks', 'wool socks', 'knee-high socks', 'rabbit wool',
  'fur coat', 'faux fur coat', 'rex rabbit fur',
  'coffee mug', 'novelty mug'
];

const WHITELIST_TERMS = [
  'leash', 'harness', 'collar', 'crate', 'kennel', 'litter', 'scratching', 'catnip',
  'chew toy', 'fetch', 'squeaky', 'treat', 'kibble', 'food bowl', 'water bowl',
  'pet bed', 'dog bed', 'cat bed', 'pet carrier', 'pet crate',
  'grooming', 'brush', 'nail clipper', 'pet shampoo',
  'bird cage', 'fish tank', 'aquarium',
  'small animal', 'rodent', 'ferret', 'chinchilla', 'gerbil',
  'pet toy', 'dog toy', 'cat toy', 'pet food', 'pet treat'
];

const HIGH_CONFIDENCE_PET_TERMS = [
  'for dogs', 'for cats', 'for pets', 'for puppies', 'for kittens',
  'dog bed', 'cat bed', 'pet bed', 'dog bowl', 'cat bowl', 'pet bowl',
  'dog collar', 'cat collar', 'pet collar', 'dog leash', 'cat harness',
  'dog toy', 'cat toy', 'pet toy', 'dog treat', 'cat treat', 'pet treat',
  'dog crate', 'cat carrier', 'pet carrier', 'dog kennel', 'cat kennel',
  'dog house', 'cat house', 'pet house', 'dog training', 'cat training',
  'scratching post', 'cat tree', 'litter box', 'cat litter',
  'pet supplies', 'pet grooming', 'pet shampoo', 'pet food',
  'rabbit cage', 'hamster cage', 'guinea pig cage', 'bird cage',
  'pet stroller', 'dog stroller', 'pet ramp', 'dog ramp', 'dog stairs'
];

function loadCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) {
    return { products: [], buildInfo: {} };
  }
  return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
}

function saveCatalog(catalog) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `catalog-cleanup-${timestamp}.json`);
  
  if (fs.existsSync(CATALOG_FILE)) {
    fs.copyFileSync(CATALOG_FILE, backupPath);
  }
  
  const tempPath = CATALOG_FILE + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(catalog, null, 2));
  fs.renameSync(tempPath, CATALOG_FILE);
  
  return backupPath;
}

function matchesTerms(text, terms) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function isNonPetProduct(product) {
  const reasons = [];
  
  if (product.is_pet_product === false) {
    reasons.push('is_pet_product=false');
  }
  
  const searchText = [
    product.title || '',
    product.description || '',
    product.slug || '',
    (product.tags || []).join(' ')
  ].join(' ').toLowerCase();
  
  const hasBlacklist = matchesTerms(searchText, BLACKLIST_TERMS);
  const hasWhitelist = matchesTerms(searchText, WHITELIST_TERMS);
  const hasHighConfidencePet = matchesTerms(searchText, HIGH_CONFIDENCE_PET_TERMS);
  
  const humanIndicators = ['women', 'mens ', 'for women', 'for men', 'fashion', 'silver', 'gold', 'sterling', '925', 'pearl', 'diamond', 'jade', 'womens'];
  const hasHumanIndicator = humanIndicators.some(h => searchText.includes(h));
  
  if (hasBlacklist) {
    const matchedBlacklist = BLACKLIST_TERMS.filter(t => searchText.includes(t.toLowerCase()));
    
    if (hasHighConfidencePet && !hasHumanIndicator) {
      // HIGH-CONFIDENCE PET TERMS override blacklist only if NO human indicators
    } else if (hasHumanIndicator) {
      // Human indicators ALWAYS trigger blocking regardless of pet terms
      reasons.push(`blacklist_with_human_indicator: ${matchedBlacklist.slice(0, 3).join(', ')}`);
    } else if (!hasWhitelist) {
      // No whitelist match at all - definitely non-pet
      reasons.push(`blacklist_match: ${matchedBlacklist.slice(0, 3).join(', ')}`);
    }
  }
  
  return {
    isNonPet: reasons.length > 0,
    reasons
  };
}

function fixCategoryMismatch(product) {
  if (!product.is_pet_product) return null;
  
  const title = (product.title || '').toLowerCase();
  const catTerms = ['cat', 'kitty', 'kitten', 'feline'];
  const dogTerms = ['dog', 'puppy', 'canine', 'pup'];
  
  const hasCat = catTerms.some(t => title.includes(t));
  const hasDog = dogTerms.some(t => title.includes(t));
  
  if (product.category === 'Dogs' && hasCat && !hasDog) {
    return 'Cats';
  }
  if (product.category === 'Cats' && hasDog && !hasCat) {
    return 'Dogs';
  }
  
  return null;
}

function purgeNonPetProducts({ mode = 'deactivate', dryRun = true }) {
  const catalog = loadCatalog();
  const products = catalog.products || [];
  
  const results = {
    mode,
    dryRun,
    timestamp: new Date().toISOString(),
    totalProducts: products.length,
    affected: [],
    categoryFixes: [],
    summary: {
      deactivated: 0,
      deleted: 0,
      categoryFixed: 0
    }
  };
  
  const newProducts = [];
  
  for (const product of products) {
    const { isNonPet, reasons } = isNonPetProduct(product);
    
    if (isNonPet) {
      results.affected.push({
        product_id: product.product_id,
        slug: product.slug,
        title: (product.title || '').substring(0, 60),
        reasons,
        action: mode
      });
      
      if (mode === 'delete') {
        results.summary.deleted++;
        continue;
      } else {
        product.active = false;
        product.is_pet_product = false;
        product._cleanup_reason = reasons.join('; ');
        product._cleanup_at = results.timestamp;
        results.summary.deactivated++;
      }
    }
    
    const newCategory = fixCategoryMismatch(product);
    if (newCategory) {
      results.categoryFixes.push({
        product_id: product.product_id,
        slug: product.slug,
        oldCategory: product.category,
        newCategory
      });
      if (!dryRun) {
        product.category = newCategory;
      }
      results.summary.categoryFixed++;
    }
    
    newProducts.push(product);
  }
  
  if (!dryRun) {
    catalog.products = newProducts;
    catalog.buildInfo = catalog.buildInfo || {};
    catalog.buildInfo.lastCleanup = results.timestamp;
    catalog.buildInfo.cleanupStats = results.summary;
    
    const backupPath = saveCatalog(catalog);
    results.backupPath = backupPath;
    
    const auditEntry = {
      ...results,
      affected: results.affected.map(a => ({ product_id: a.product_id, slug: a.slug, action: a.action }))
    };
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(auditEntry) + '\n');
  }
  
  results.newTotal = newProducts.length;
  
  return results;
}

function reloadCatalogCache() {
  try {
    delete require.cache[require.resolve('./db')];
    const db = require('./db');
    if (typeof db.reloadProducts === 'function') {
      db.reloadProducts();
    }
    return true;
  } catch (e) {
    console.log('[CatalogCleanup] Cache reload skipped:', e.message);
    return false;
  }
}

module.exports = {
  purgeNonPetProducts,
  isNonPetProduct,
  fixCategoryMismatch,
  reloadCatalogCache,
  BLACKLIST_TERMS,
  WHITELIST_TERMS
};
