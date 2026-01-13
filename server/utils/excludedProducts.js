
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const EXCLUDED_CSV_PATH = path.join(__dirname, '..', '..', 'getpawsy_excluded_products.csv');

let excludedItems = new Map();

// TIER 1: EXPLICIT HANDLE BLACKLIST - products that must never appear
const BLOCKED_HANDLES = new Set([
  'korean-style-sweet-and-cute-bunny-ear-plush-hat',
  'easter-bunny-shaped-decorative-creative-resin-craft-ornaments',
  'bunny-stuffed-toy-95cm-white-8124',
  'brazilian-bunny-chocolate-color-long-lasting-moisturizing-lip-gloss',
  'transform-into-a-milk-tea-pig-plush-toy-cute-little-bunny',
  'womens-thickened-coral-fleece-winter-cute-bunny-pajamas',
  'baby-sweet-bunny-romper-ruffle-trim-onesie-with-adjustable-straps-snap-closure',
  '2d-ribbon-bunny-ears-hood-with-bow-and-pearl-decoration-cute-versatile-long-slee',
  'bunny-suction-cup-hook-random',
  'bunny-headband-4111',
  '1-led-bunnyfat-bearstupid-bearchestnut-bearduck-night-lightcute-rainbow-light-ch',
  'cute-cupcake-liners-wrappers-with-plastic-spoons-bunny-flower-pattern-paper-baki',
  'cute-pig-long-plush-pillow-bunny-doll',
  'pastoral-style-girl-floral-bunny-washed-cotton-bedding',
  'womens-warm-retro-rabbit-wool-socks',
  'womens-dog-paw-print-heart-necklace',
  'furry-cat-ears-headband-for-women',
  '3d-wooden-puzzles-cat-model-kit-night-lights-desk-decorations-birthday-christmas',
  'womens-knee-high-big-face-cat-socks',
  'womens-short-faux-rex-rabbit-fur-coat-slim-fit'
]);

// TIER 2: STRICT ALWAYS BLOCK - truly never for pets (no exceptions)
const ALWAYS_BLOCK_KEYWORDS = [
  // Cosmetics - never for pets
  'lip gloss', 'lipstick', 'cosmetic', 'makeup', 'moisturizing', 'skincare',
  'nail polish', 'mascara', 'foundation', 'concealer', 'blush', 'eyeshadow',
  // Jewelry - never for pets  
  'necklace', 'jewelry', 'earrings', 'bracelet', 'pendant', 'charm', 'brooch',
  // Home decor - never for pets
  'desk decoration', 'resin craft', 'wooden puzzle', 'night light', 'lamp',
  'wall art', 'canvas print', 'poster', 'figurine', 'ornament', 'snow globe',
  'sculpture', 'paperweight', 'magnet', 'fridge magnet', 'keychain', 'key ring',
  // Kitchen/baking - never for pets
  'cupcake liner', 'wrappers', 'baking mold', 'paper cups', 'muffin tin',
  'cookie cutter', 'cake mold', 'kitchen towel', 'oven mitt', 'apron',
  'coffee mug', 'tumbler', 'coaster',
  // Human bedding - never for pets
  'washed cotton bedding', 'duvet', 'pillowcase', 'bed sheet', 'comforter',
  // Human costume/performance - never for pets
  'nightclub', 'performance mask', 'costume party', 'halloween costume', 'cosplay mask',
  'balaclava', 'k9 mask', 'fetish', 'adult costume', 'party mask'
];

// HUMAN APPAREL - blocked UNLESS pet intent is detected
const HUMAN_APPAREL_KEYWORDS = [
  'hoodie', 't-shirt', 'tee shirt', 'sweatshirt', 'sweater', 'pullover',
  'pants', 'jeans', 'shorts', 'skirt', 'dress', 'blouse', 'tank top',
  'underwear', 'bra', 'lingerie', 'swimsuit', 'bikini',
  'shoes', 'sneakers', 'sandals', 'boots', 'slippers', 'flip flops',
  'hat', 'cap', 'baseball cap', 'beanie', 'scarf', 'gloves', 'mittens', 'sunglasses',
  'backpack', 'handbag', 'purse', 'wallet', 'tote bag', 'crossbody bag'
];

// TIER 3: HARD BLOCK - novelty/plush items (not functional pet products)
const HARD_BLOCK_KEYWORDS = [
  'plush doll', 'simulation doll', 'stuffed toy', 'plush toy gift',
  'cute doll', 'novelty gift', 'desk toy',
  'fashion accessory', 'cosplay', 'pacifier', 'baby bottle',
  'bunny hat', 'bunny ear', 'rabbit ear'
];

// POSITIVE PET INTENT SIGNALS - these indicate the product is actually for pets
const PET_INTENT_SIGNALS = [
  // Pet-specific functional terms
  'dog bed', 'cat bed', 'pet bed', 'dog house', 'cat tree', 'scratching post',
  'dog bowl', 'cat bowl', 'pet feeder', 'water fountain', 'food dispenser',
  'dog toy', 'cat toy', 'pet toy', 'chew toy', 'squeaky toy', 'interactive toy',
  'dog leash', 'cat leash', 'pet harness', 'dog harness', 'cat harness',
  'dog collar', 'cat collar', 'pet collar', 'id tag', 'pet bandana', 'dog bandana', 'cat bandana',
  'dog crate', 'cat carrier', 'pet carrier', 'dog carrier', 'travel cage', 'pet stroller',
  'dog grooming', 'cat grooming', 'pet brush', 'nail clipper', 'deshedding',
  'litter box', 'litter mat', 'cat litter', 'pee pad', 'potty pad',
  'dog training', 'clicker', 'treat pouch', 'pet gate', 'dog door',
  'flea', 'tick', 'dewormer', 'pet shampoo', 'pet wipes',
  'dog muzzle', 'pet cone', 'recovery collar', 'anxiety vest', 'thunder shirt',
  'cooling mat', 'heating pad', 'pet blanket', 'dog jacket', 'cat jacket', 'pet raincoat',
  'dog boots', 'pet boots', 'dog shoes', 'cat shoes', 'paw protector',
  'dog hat', 'cat hat', 'pet hat', 'dog cap', 'cat cap', 'pet cap',
  'dog scarf', 'cat scarf', 'pet scarf', 'triangle scarf dog', 'triangle scarf cat',
  'dog backpack', 'pet backpack', 'cat backpack', 'carrier backpack',
  'dog gloves', 'grooming glove', 'pet gloves',
  'aquarium', 'fish tank', 'reptile', 'hamster wheel', 'bird cage', 'bird perch'
];

// HUMAN PRODUCT QUALIFIERS - these suggest product is for humans
const HUMAN_QUALIFIERS = [
  'womens', 'women', 'mens', 'men', 'ladies', 'girls', 'boys',
  'for women', 'for men', 'for her', 'for him',
  'baby', 'kids', 'children', 'infant', 'newborn', 'toddler',
  'adult size', 'one size fits'
];

function loadExcludedProducts() {
  try {
    if (fs.existsSync(EXCLUDED_CSV_PATH)) {
      const content = fs.readFileSync(EXCLUDED_CSV_PATH, 'utf8');
      const records = parse(content, { columns: true, skip_empty_lines: true });
      
      records.forEach(record => {
        const id = record.SPU || record.sku || record.id;
        if (id) {
          excludedItems.set(String(id).toLowerCase(), record.excluded_reason || 'Manually excluded');
        }
        const name = record['Product Name'] || record.title;
        if (name) {
          excludedItems.set(name.toLowerCase(), record.excluded_reason || 'Manually excluded');
        }
      });
      console.log(`[ExcludedProducts] Loaded ${excludedItems.size} exclusion rules from CSV`);
    }
  } catch (err) {
    console.error('[ExcludedProducts] Error loading CSV:', err.message);
  }
}

function hasPetIntent(text) {
  // Check for explicit pet intent signals
  if (PET_INTENT_SIGNALS.some(signal => text.includes(signal))) {
    return true;
  }
  // Check for pet-specific sizing indicators
  const petSizing = ['xs dog', 's dog', 'm dog', 'l dog', 'xl dog', 'small dog', 'medium dog', 'large dog',
                     'puppy size', 'kitten size', 'for small pets', 'for large pets'];
  if (petSizing.some(s => text.includes(s))) {
    return true;
  }
  return false;
}

function hasHumanQualifier(text) {
  return HUMAN_QUALIFIERS.some(q => text.includes(q));
}

function getExcludedReason(product) {
  if (!product) return null;
  
  const title = (product.title || product.name || '').toLowerCase();
  const handle = (product.slug || product.handle || '').toLowerCase();
  const description = (product.description || '').toLowerCase();
  const fullText = `${title} ${handle} ${description}`;
  
  // TIER 1: EXPLICIT HANDLE BLACKLIST - highest priority
  if (BLOCKED_HANDLES.has(handle)) {
    return `Explicit handle blacklist`;
  }
  
  // TIER 2: CSV exclusion rules
  const id = String(product.id || product.cj_id || product.SPU || '').toLowerCase();
  if (excludedItems.has(id)) return excludedItems.get(id);
  if (excludedItems.has(title)) return excludedItems.get(title);
  
  // Check for pet intent first (used in multiple tiers)
  const petIntent = hasPetIntent(fullText);
  
  // TIER 3: STRICT ALWAYS BLOCK - cosmetics, jewelry, home decor (no exceptions)
  for (const kw of ALWAYS_BLOCK_KEYWORDS) {
    if (fullText.includes(kw)) {
      return `Non-pet product: ${kw}`;
    }
  }
  
  // TIER 4: HUMAN APPAREL - blocked unless pet intent detected
  if (!petIntent) {
    for (const kw of HUMAN_APPAREL_KEYWORDS) {
      if (fullText.includes(kw)) {
        return `Human apparel: ${kw}`;
      }
    }
  }
  
  // TIER 5: Check human qualifiers without pet intent
  const humanQualifier = hasHumanQualifier(fullText);
  if (humanQualifier && !petIntent) {
    return `Human product (no pet intent)`;
  }
  
  // TIER 6: Hard block novelty/plush items (unless clear pet intent)
  for (const kw of HARD_BLOCK_KEYWORDS) {
    if (fullText.includes(kw)) {
      if (petIntent) {
        continue;
      }
      return `Novelty/non-functional: ${kw}`;
    }
  }
  
  // TIER 7: Product-level status check
  if (product.blocked === true || product.active === false) {
    return 'Product blocked or inactive';
  }
  
  return null;
}

function isExcludedProduct(product) {
  return getExcludedReason(product) !== null;
}

function isFunctionalPetProduct(product) {
  if (!product) return false;
  const title = (product.title || '').toLowerCase();
  const desc = (product.description || '').toLowerCase();
  return hasPetIntent(`${title} ${desc}`);
}

loadExcludedProducts();

module.exports = {
  isExcludedProduct,
  getExcludedReason,
  isFunctionalPetProduct,
  reload: loadExcludedProducts
};
