/**
 * Product Normalization & Validation Module
 * 
 * Provides functions to:
 * - Normalize pet types and categories
 * - Validate pet products (hard gate for storefront)
 * - Resolve images from various product formats
 * - Format prices consistently in USD
 */

const CURRENCY = 'USD';
const LOCALE = 'en-US';
const PLACEHOLDER_IMAGE = '/images/placeholder-pawsy.webp';

/**
 * Sanitize image URL - reject localhost, loopback, private networks, and invalid URLs
 * @param {string} url - Image URL to sanitize
 * @returns {string|null} - Sanitized URL or null if invalid
 */
function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  const trimmed = url.trim();
  if (!trimmed || trimmed === '/' || trimmed === '') return null;
  
  // For absolute URLs, parse and validate the hostname
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      
      // Reject localhost/loopback
      if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
        return null;
      }
      
      // Reject private IP ranges (RFC1918, CGNAT, link-local)
      const privatePatterns = [
        /^10\./,           // 10.0.0.0/8
        /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
        /^192\.168\./,     // 192.168.0.0/16
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // 100.64.0.0/10 (CGNAT)
        /^169\.254\./,     // 169.254.0.0/16 (link-local)
      ];
      
      for (const pattern of privatePatterns) {
        if (pattern.test(host)) return null;
      }
      
      // Reject URLs that are just the origin with no path AND no query string
      // Allow query-only URLs like https://cdn.example.com?img=123
      if ((!parsed.pathname || parsed.pathname === '/') && !parsed.search) {
        return null;
      }
      
      return trimmed;
    } catch (e) {
      return null;
    }
  }
  
  // Allow relative URLs that have actual paths
  if (trimmed.startsWith('/') && trimmed.length > 1) return trimmed;
  
  return null;
}

function formatMoney(amount) {
  if (amount == null || isNaN(amount)) return null;
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY }).format(amount);
}

function slugify(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

function normalizeProduct(raw) {
  if (!raw) return null;
  
  const id = raw.id || raw.cjProductId || raw.cj_product_id || raw.sku || raw.product_id || null;
  const cjId = raw.cjProductId || raw.cj_product_id || null;
  const slug = raw.slug || slugify(raw.title || raw.name || id);
  const title = raw.title || raw.name || 'Product';
  
  const images = safeParseArray(raw.images);
  const validImages = (images || [])
    .map(img => sanitizeImageUrl(img))
    .filter(Boolean);
  
  // Also check raw.image as fallback
  const fallbackImage = sanitizeImageUrl(raw.image);
  const imageArray = validImages.length > 0 ? validImages : 
    (fallbackImage ? [fallbackImage] : []);
  
  const priceUsd = parseFloat(raw.price_usd) || parseFloat(raw.price) || 
    parseFloat(raw.variants?.[0]?.price) || null;
  
  return {
    ...raw,
    id: String(id),
    cjId,
    slug,
    title,
    priceUsd,
    images: imageArray,
    resolved_image: imageArray[0] || PLACEHOLDER_IMAGE
  };
}

const BAD_KEYWORDS = [
  "sock", "socks", "chair", "gaming chair", "office chair", "desk", "human",
  "women", "mens", "tshirt", "shirt", "hoodie", "jacket", "pants", "jeans",
  "laptop", "phone case", "earbuds", "cosmetic", "makeup", "jewelry", "necklace",
  "earring", "bracelet", "ring", "brooch", "tiara", "pendant", "watch",
  "handbag", "purse", "wallet", "clutch", "tote bag", "high heels", "stiletto",
  "sneakers", "pumps shoes", "lingerie", "bikini", "underwear", "bra",
  "curtain", "bedding", "quilt", "comforter", "sheet set", "mattress",
  "office furniture", "stationery", "notebook", "power tool", "drill",
  "garden hose", "lawn mower", "christmas tree", "holiday decor", "party supplies",
  "luggage", "suitcase", "yoga mat", "dumbbell", "weight bench", "treadmill",
  "sofa", "couch", "end table", "coffee table", "nightstand", "wardrobe",
  "chandelier", "vase", "candle", "picture frame", "wall art", "poster",
  "car part", "engine", "tire", "wheel rim", "headlight", "bumper",
  "plush toy", "stuffed animal", "figurine", "statue", "ornament", "decor",
  "cup", "mug", "plate", "bowl set", "cookware", "kitchen utensil", "pot", "pan",
  "stroller", "car seat", "baby", "infant", "toddler", "maternity",
  "alcohol", "wine", "beer", "liquor", "cigarette", "vape", "tobacco",
  "pajamas", "sleepwear", "robe", "slippers", "pacifier", "diaper"
];

const PET_KEYWORDS = [
  "dog", "puppy", "cat", "kitten", "pet", "leash", "collar", "harness",
  "litter", "catio", "aquarium", "fish", "reptile", "hamster", "rabbit",
  "guinea", "bird", "cage", "hutch", "crate", "carrier", "groom", "treat",
  "chew", "toy", "feeder", "water fountain", "scratcher", "scratching post",
  "pet bed", "dog bed", "cat bed", "pet house", "dog house", "cat tree",
  "pet gate", "dog gate", "pet playpen", "dog crate", "cat carrier",
  "pet stroller", "dog ramp", "pet food", "dog food", "cat food",
  "poop bag", "flea", "tick", "pet shampoo", "nail clipper", "deshedding",
  "pet bowl", "automatic feeder", "pet water", "pet brush", "grooming tool"
];

const PET_SAFE_OVERRIDES = [
  "dog clothes", "cat clothes", "pet clothes", "puppy clothes",
  "dog sweater", "cat sweater", "dog hoodie", "cat costume", "pet costume",
  "dog stroller", "pet stroller", "dog car barrier", "dog car seat",
  "pet car seat", "dog ramp", "pet ramp", "dog stairs", "pet stairs",
  "dog backpack carrier", "dog couch", "pet couch", "dog sofa", "pet sofa",
  "dog playpen", "pet playpen", "cat playpen", "exercise pen",
  "cat treadmill", "cat wheel", "cat exercise", "pet pillow", "dog pillow",
  "dog pen", "pet pen", "cat pen", "puppy pen", "dog shirt", "cat shirt",
  "dog boot", "dog boots", "pet boots", "paw protector", "dog towel", "pet towel",
  "pet backpack", "dog backpack", "cat backpack", "carrier backpack",
  "dog tool", "grooming tool", "pet tool", "nail tool", "pet mirror", "bird mirror",
  "dog rug", "pet rug", "pet mat", "dog mat", "cat mat", "pet blanket",
  "dog blanket", "cat blanket", "pet lamp", "aquarium lamp", "terrarium lamp", "heat lamp"
];

function normalizePetType(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (["dog", "dogs", "canine"].includes(s)) return "dog";
  if (["cat", "cats", "feline"].includes(s)) return "cat";
  if (["small pets", "small_pet", "small_pets", "smallpet", "rabbit", "hamster", "guinea pig", "guinea_pig", "ferret"].includes(s)) return "small_pets";
  if (["bird", "birds", "avian"].includes(s)) return "bird";
  if (["fish", "fishes", "aquatic", "aquatics"].includes(s)) return "fish";
  if (["reptile", "reptiles"].includes(s)) return "reptile";
  if (["both"].includes(s)) return "both";
  return null;
}

function normalizeCategory(raw) {
  const s = (raw ?? "").toString().trim();
  if (!s) return "Other";
  const low = s.toLowerCase();
  if (low.includes("small") && low.includes("pet")) return "Small Pets";
  if (low.includes("cat")) return "Cats";
  if (low.includes("dog")) return "Dogs";
  if (low.includes("access")) return "Accessories";
  if (low.includes("toy")) return "Toys";
  if (low.includes("feed")) return "Feeding";
  if (low.includes("groom")) return "Grooming";
  if (low.includes("health")) return "Health";
  if (low.includes("cloth")) return "Pet Clothing";
  if (low.includes("bed") || low.includes("furniture")) return "Beds & Furniture";
  return s;
}

function safeParseArray(v) {
  if (!v) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }
  return null;
}

function looksLikePetProduct(p) {
  const title = String(p.title ?? p.name ?? "").toLowerCase();
  const desc = String(p.description ?? "").toLowerCase();
  const cat = String(p.category ?? "").toLowerCase();
  const tags = String(p.tags ?? "").toLowerCase();

  const hay = `${title} ${cat} ${tags} ${desc}`;

  const hasPetSafeOverride = PET_SAFE_OVERRIDES.some(k => hay.includes(k));
  if (hasPetSafeOverride) return true;

  const hasPetKeyword = PET_KEYWORDS.some(k => hay.includes(k));
  const hasBadKeyword = BAD_KEYWORDS.some(k => hay.includes(k));

  if (hasBadKeyword && !hasPetKeyword) return false;

  if (p.is_pet_product === true) return !hasBadKeyword || hasPetKeyword;

  return hasPetKeyword;
}

function isValidPetProduct(p) {
  if (!p) return false;
  
  if (!looksLikePetProduct(p)) return false;

  const pt = normalizePetType(p.pet_type) ?? normalizePetType(p.category) ?? null;
  const cat = normalizeCategory(p.category).toLowerCase();
  const catOk = ["dogs", "cats", "small pets", "toys", "feeding", "accessories", "grooming", "health", "pet clothing", "beds"].some(x => cat.includes(x));
  if (!pt && !catOk) return false;

  const rawCat = String(p.category ?? "").toLowerCase();
  if (["office", "furniture", "apparel", "clothing", "women", "men", "kids", "home decor", "kitchen", "automotive"].some(b => rawCat.includes(b) && !rawCat.includes("pet"))) {
    return false;
  }

  return true;
}

function resolveImage(p) {
  if (!p) return PLACEHOLDER_IMAGE;
  
  // Priority 1: Pre-sanitized resolved_image
  if (p.resolved_image && p.resolved_image !== PLACEHOLDER_IMAGE) {
    const sanitized = sanitizeImageUrl(p.resolved_image);
    if (sanitized) return sanitized;
  }
  
  // Priority 2: Images array
  const imgs = safeParseArray(p.images);
  if (imgs && imgs.length > 0) {
    for (const img of imgs) {
      const url = typeof img === 'string' ? img : (img?.url || null);
      const sanitized = sanitizeImageUrl(url);
      if (sanitized) return sanitized;
    }
  }

  // Priority 3: Variant images
  const vars = safeParseArray(p.variants);
  if (vars && vars.length > 0) {
    const v0 = vars[0];
    const vImg = v0?.image || v0?.img || v0?.imageUrl;
    const sanitizedV = sanitizeImageUrl(vImg);
    if (sanitizedV) return sanitizedV;

    const vImgs = safeParseArray(v0?.images);
    if (vImgs && vImgs.length > 0) {
      const sanitizedVI = sanitizeImageUrl(vImgs[0]);
      if (sanitizedVI) return sanitizedVI;
    }
  }

  // Priority 4: Legacy fields (all sanitized)
  const candidates = [p.image, p.main_image, p.cj_image, p.thumbnail];
  for (const c of candidates) {
    const sanitized = sanitizeImageUrl(c);
    if (sanitized) return sanitized;
  }

  return PLACEHOLDER_IMAGE;
}

function getValidationReason(p) {
  if (!p) return 'no_product';
  if (!looksLikePetProduct(p)) return 'not_pet_product';
  
  const pt = normalizePetType(p.pet_type) ?? normalizePetType(p.category);
  const cat = normalizeCategory(p.category).toLowerCase();
  const catOk = ["dogs", "cats", "small pets", "toys", "feeding", "accessories", "grooming", "health", "pet clothing", "beds"].some(x => cat.includes(x));
  
  if (!pt && !catOk) return 'invalid_category';
  
  const rawCat = String(p.category ?? "").toLowerCase();
  if (["office", "furniture", "apparel", "clothing", "women", "men", "kids", "home decor", "kitchen", "automotive"].some(b => rawCat.includes(b) && !rawCat.includes("pet"))) {
    return 'blocked_category';
  }
  
  return 'valid';
}

function proxiedImageUrl(url) {
  const sanitized = sanitizeImageUrl(url);
  if (!sanitized) {
    return PLACEHOLDER_IMAGE;
  }
  if (sanitized.startsWith('/media/') || sanitized.startsWith('/images/')) {
    return sanitized;
  }
  return '/api/img?url=' + encodeURIComponent(sanitized);
}

/**
 * Prepare a single product for SSR rendering with sanitized image fields
 * @param {object} p - Raw product object
 * @returns {object} - Product with sanitized displayImage/displayImageProxy fields
 */
function prepareProductForView(p) {
  if (!p) return null;
  
  const safeImage = resolveImage(p);
  const proxyImage = proxiedImageUrl(safeImage);
  
  return {
    ...p,
    displayImage: safeImage,
    displayImageProxy: proxyImage,
    resolved_image: safeImage,
  };
}

/**
 * Prepare an array of products for SSR rendering
 * @param {array} products - Array of raw product objects
 * @returns {array} - Array of products with sanitized image fields
 */
function prepareProductsForView(products) {
  if (!products || !Array.isArray(products)) return [];
  return products.map(prepareProductForView).filter(Boolean);
}

module.exports = {
  normalizePetType,
  normalizeCategory,
  looksLikePetProduct,
  isValidPetProduct,
  resolveImage,
  getValidationReason,
  safeParseArray,
  normalizeProduct,
  formatMoney,
  slugify,
  proxiedImageUrl,
  sanitizeImageUrl,
  prepareProductForView,
  prepareProductsForView,
  CURRENCY,
  LOCALE,
  PLACEHOLDER_IMAGE,
  BAD_KEYWORDS,
  PET_KEYWORDS,
  PET_SAFE_OVERRIDES
};
