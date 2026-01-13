/**
 * Pet Type Classifier
 * Classifies products as dog, cat, both, or null based on keywords
 */

const { log } = require("./logger");

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s\-]/g, " ").replace(/\s+/g, " ").trim();

// Use word boundary matching to avoid false positives like "wheel" matching "heel"
const matchesWord = (text, word) => {
  // For multi-word phrases, use simple includes
  if (word.includes(" ") || word.includes("-")) {
    return text.includes(word);
  }
  // For single words, use word boundary regex
  const regex = new RegExp(`\\b${word}\\b`, 'i');
  return regex.test(text);
};

const includesAny = (text, words) => words.some(w => matchesWord(text, w));
const countMatches = (text, words) => words.filter(w => matchesWord(text, w)).length;

const DOG_KEYWORDS = [
  "dog", "dogs", "puppy", "puppies", "canine", "pup",
  "leash", "harness", "collar", "muzzle",
  "kennel", "crate",
  "chew", "kong",
  "bark", "anti-bark", "antibar",
  "pee pad", "puppy pad",
  "dog bed", "dog bowl", "dog toy", "dog treat",
  "dog coat", "dog jacket", "dog sweater",
  "pet gate", "dog gate"
];

const CAT_KEYWORDS = [
  "cat", "cats", "kitten", "kittens", "feline", "kitty",
  "litter", "litter box", "scoop",
  "scratching", "scratcher", "scratch post", "cat tree", "sisal",
  "meow", "catnip",
  "cat bed", "cat bowl", "cat toy", "cat treat",
  "feather wand", "laser pointer",
  "cat cave", "cat perch", "cat tower"
];

const HARD_DENY_KEYWORDS = [
  "women", "womens", "woman", "ladies", "lingerie", "bra", "panties", "underwear", "bikini", "panty", "stockings", "thong", "bodysuit",
  "sexy", "erotic", "fetish", "bdsm", "nightclub",
  "t-shirt", "tee", "hoodie", "sweater", "jacket", "dress", "skirt", "jeans", "pants", "suit", "romper", "jumpsuit", "pajama",
  "handbag", "purse", "wallet", "belt", "backpack",
  "jewelry", "jewel", "necklace", "bracelet", "earring", "ring", "pendant", "charm",
  "phone case", "iphone", "android", "airpods", "headphone", "charger", "smartwatch", "earbuds",
  "makeup", "cosmetic", "lipstick", "mascara", "skincare", "beauty",
  "kitchen", "cookware", "pan", "pot", "knife", "cutlery",
  "shoe", "shoes", "sneaker", "sandal", "boot", "heel", "slippers",
  "baby", "toddler", "kids toy", "doll", "lego", "newborn", "infant", "maternity",
  "car part", "motorcycle", "engine",
  "adult", "sex",
  "tattoo", "tattoos", "temporary tattoo", "fake tattoo", "body art",
  "bedding", "duvet", "comforter", "pillowcase", "bed sheet", "quilt", "mattress", "bed set", "bedspread", "bed cover",
  "quilt cover", "quilt cover suit", "bedroom decoration", "bedroom bedding", "home decoration",
  "curtain", "tablecloth", "wall art", "poster", "canvas print",
  "sticker", "stickers", "decal", "vinyl sticker", "laptop sticker", "car sticker",
  "keychain", "key chain", "keyring",
  "fishing", "camping gear", "sports equipment", "golf", "tennis", "basketball",
  "wedding", "party decoration", "balloon",
  "garden tool", "power tool", "drill", "saw",
  "wine", "beer", "liquor", "cigarette", "vape", "smoking",
  "wig", "hair extension", "hair piece",
  "perfume", "cologne", "fragrance",
  "sunglasses", "watch", "scarf", "hat", "cap", "gloves", "tie", "beanie",
  "storage box", "organizer", "shelf",
  "furniture", "chair", "table", "desk", "sofa", "lamp", "chandelier", "gaming chair", "office chair", "bookshelf", "cabinet", "drawer",
  "human clothing", "human sweater", "human jacket", "human coat",
  "towel", "bath towel", "beach towel", "hand towel",
  "rug", "carpet", "floor mat",
  "throw blanket", "throw pillow", "cushion cover",
  "phone holder", "tablet stand",
  "costume", "cosplay", "halloween costume",
  "plush toy", "stuffed animal", "teddy bear", "plush doll", "doll plush",
  "simulated", "simulation toy", "figurine", "statue", "sculpture",
  "new year sweater", "national style", "chinese style", "traditional style",
  "ice cream cone", "hedgehog tattoo",
  "socks", "wool socks", "thermal socks"
];

const PET_OVERRIDE_TERMS = [
  "for dogs", "for cats", "for pets", "pet supplies",
  "dog bed", "cat bed", "pet bed", "dog bowl", "cat bowl",
  "dog toy", "cat toy", "pet toy", "dog treat", "cat treat",
  "dog collar", "cat collar", "pet collar",
  "dog leash", "cat harness", "pet carrier", "dog crate",
  "cat litter", "scratching post", "cat tree", "dog training",
  "dog ramp", "pet ramp", "dog stairs", "pet stairs", "dog steps", "pet steps",
  "dog stroller", "pet stroller", "cat stroller", "dog bike", "pet bike",
  "dog kennel", "pet kennel", "cat kennel", "dog house", "cat house", "pet house",
  "dog washing", "pet grooming", "dog grooming", "cat grooming",
  "puppy supplies", "kitten supplies", "dog station", "cat archway",
  "puppy crate", "pet trailer", "dog trailer"
];

const ABSOLUTE_DENY = [
  "tattoo", "temporary tattoo", "fake tattoo", "body art", "body sticker",
  "laptop sticker", "car sticker", "car decal", "wall sticker", "wall decal",
  "vinyl decal", "window sticker", "bumper sticker",
  "quilt cover", "duvet cover", "bedding set", "bed cover suit", "bedroom decoration",
  "bedroom bedding", "home textile", "home decoration",
  "plush toy", "plush doll", "stuffed toy", "stuffed animal", "stuffed doll",
  "teddy bear", "simulation toy", "simulated toy", "simulated corgi", "simulated dog",
  "simulated cat", "simulated puppy", "simulated kitten", "figurine", "doll toy",
  "ice cream cone", "hedgehog tattoo", "ice-cream cone",
  "new year sweater", "national style clothes", "chinese character"
];

function classifyPetType(product) {
  if (!product) return null;
  
  const combined = [
    product.title,
    product.name,
    product.description,
    Array.isArray(product.tags) ? product.tags.join(" ") : product.tags,
    product.category,
    product.cjCategory,
    product.handle,
    product.vendor,
    product.type
  ].filter(Boolean).join(" ");
  
  const t = norm(combined);
  
  if (includesAny(t, ABSOLUTE_DENY)) {
    return null;
  }
  
  const hasPetOverride = includesAny(t, PET_OVERRIDE_TERMS);
  
  if (includesAny(t, HARD_DENY_KEYWORDS) && !hasPetOverride) {
    return null;
  }
  
  const dogScore = countMatches(t, DOG_KEYWORDS);
  const catScore = countMatches(t, CAT_KEYWORDS);
  
  if (dogScore > 0 && catScore > 0) {
    if (dogScore > catScore + 2) return "dog";
    if (catScore > dogScore + 2) return "cat";
    return "both";
  }
  
  if (dogScore >= 1) return "dog";
  if (catScore >= 1) return "cat";
  
  const genericPetKeywords = ["pet", "pets", "animal", "fur", "paw"];
  if (includesAny(t, genericPetKeywords)) {
    return "both";
  }
  
  return null;
}

function isPetProduct(product) {
  if (!product) {
    return { ok: false, reason: "No product data" };
  }
  
  const combined = [
    product.title,
    product.name,
    product.productNameEn,
    product.description,
    product.productDesc,
    Array.isArray(product.tags) ? product.tags.join(" ") : product.tags,
    product.category,
    product.categoryName,
    product.cjCategory,
    product.handle,
    product.vendor,
    product.type
  ].filter(Boolean).join(" ");
  
  const t = norm(combined);
  
  if (includesAny(t, ABSOLUTE_DENY)) {
    const matched = ABSOLUTE_DENY.find(kw => t.includes(kw));
    return { ok: false, reason: `Absolute deny: "${matched}"` };
  }
  
  const hasPetOverride = includesAny(t, PET_OVERRIDE_TERMS);
  
  if (includesAny(t, HARD_DENY_KEYWORDS) && !hasPetOverride) {
    const matched = HARD_DENY_KEYWORDS.find(kw => t.includes(kw));
    return { ok: false, reason: `Blocked keyword: "${matched}"` };
  }
  
  const dogScore = countMatches(t, DOG_KEYWORDS);
  const catScore = countMatches(t, CAT_KEYWORDS);
  const genericPetKeywords = ["pet", "pets", "animal", "fur", "paw"];
  const genericScore = countMatches(t, genericPetKeywords);
  
  const totalScore = dogScore + catScore + genericScore;
  
  if (totalScore < 1) {
    return { ok: false, reason: "No pet keywords found", score: 0 };
  }
  
  let species = "both";
  if (dogScore > catScore * 2 && catScore < 2) {
    species = "dog";
  } else if (catScore > dogScore * 2 && dogScore < 2) {
    species = "cat";
  }
  
  const bucket = classifyProductBucket(product);
  
  return {
    ok: true,
    species,
    category: bucket,
    score: totalScore
  };
}

function filterPetOnly(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(p => {
    const result = isPetProduct(p);
    return result.ok;
  });
}

function filterForDogs(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(p => {
    const result = isPetProduct(p);
    return result.ok && (result.species === "dog" || result.species === "both");
  });
}

function filterForCats(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(p => {
    const result = isPetProduct(p);
    return result.ok && (result.species === "cat" || result.species === "both");
  });
}

function classifyProductBucket(product) {
  if (!product) return "unknown";
  
  const combined = [
    product.title,
    product.description,
    Array.isArray(product.tags) ? product.tags.join(" ") : product.tags,
    product.category,
    product.type
  ].filter(Boolean).join(" ");
  
  const t = norm(combined);
  
  if (includesAny(t, ["litter box", "cat litter", "litter", "scoop"])) return "litter";
  if (includesAny(t, ["scratcher", "scratching", "cat tree", "cat tower", "scratch post"])) return "scratchers";
  if (includesAny(t, ["toy", "toys", "ball", "rope", "squeaky", "fetch", "chew toy", "interactive toy", "teaser", "wand", "laser"])) return "toys";
  if (includesAny(t, ["bowl", "feeder", "slow feeder", "fountain", "water fountain", "kibble", "treat", "treats", "food", "feeding"])) return "feeding";
  if (includesAny(t, ["carrier", "car seat", "seat cover", "pet barrier", "travel", "crate", "kennel", "stroller", "backpack"])) return "travel";
  if (includesAny(t, ["groom", "grooming", "brush", "deshedding", "nail clipper", "fur", "pet hair", "shampoo"])) return "grooming";
  if (includesAny(t, ["training", "clicker", "muzzle", "anti bark", "bark", "lead training", "pee pad", "potty", "gate"])) return "training";
  if (includesAny(t, ["bed", "mat", "blanket", "cushion", "orthopedic", "sofa cover", "cave", "hammock"])) return "beds";
  if (includesAny(t, ["flea", "tick", "supplement", "probiotic", "vitamin", "calming", "health", "dental"])) return "health";
  if (includesAny(t, ["collar", "leash", "harness", "lead", "tag"])) return "walking";
  
  return "unknown";
}

async function rebuildPetClassification() {
  const fs = require("fs");
  const path = require("path");
  const DB_PATH = path.join(__dirname, "..", "data", "db.json");
  
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch (err) {
    log(`[PetClassifier] Error reading DB: ${err.message}`);
    return { error: err.message };
  }
  
  const products = data.products || [];
  
  let dogCount = 0;
  let catCount = 0;
  let bothCount = 0;
  let nullCount = 0;
  
  const updatedProducts = products.map(p => {
    const petType = classifyPetType(p);
    const bucket = classifyProductBucket(p);
    
    if (petType === "dog") dogCount++;
    else if (petType === "cat") catCount++;
    else if (petType === "both") bothCount++;
    else nullCount++;
    
    return {
      ...p,
      petType,
      bucket,
      lastClassified: new Date().toISOString()
    };
  });
  
  data.products = updatedProducts;
  
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
    log(`[PetClassifier] DB written successfully`);
  } catch (err) {
    log(`[PetClassifier] Error writing DB: ${err.message}`);
    return { error: err.message };
  }
  
  const result = {
    total: products.length,
    dog: dogCount,
    cat: catCount,
    both: bothCount,
    null: nullCount,
    timestamp: new Date().toISOString()
  };
  
  log(`[PetClassifier] Rebuild complete: ${JSON.stringify(result)}`);
  
  return result;
}

module.exports = {
  classifyPetType,
  classifyProductBucket,
  rebuildPetClassification,
  isPetProduct,
  filterPetOnly,
  filterForDogs,
  filterForCats,
  DOG_KEYWORDS,
  CAT_KEYWORDS,
  HARD_DENY_KEYWORDS,
  PET_OVERRIDE_TERMS,
  ABSOLUTE_DENY
};
