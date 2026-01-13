const { log } = require("./logger");
const { db } = require("./db");

const DUTCH_TO_ENGLISH = {
  voerbak: "bowl", voerbakken: "bowl", waterbak: "bowl", drinkbak: "bowl",
  bakje: "bowl", bakken: "bowl", bak: "bowl",
  speelgoed: "toy", speeltje: "toy", speeltjes: "toys",
  bal: "ball", ballen: "balls",
  halsband: "collar", halsbanden: "collars",
  riem: "leash", riemen: "leashes", looplijn: "leash",
  tuig: "harness", tuigje: "harness",
  bed: "bed", bedden: "beds", mand: "bed", mandje: "bed", kussen: "cushion",
  voer: "food", eten: "food", voeding: "food",
  snoepje: "treat", snoepjes: "treats", traktatie: "treat",
  borstel: "brush", kam: "comb", verzorging: "grooming",
  krabpaal: "scratcher", krabben: "scratch", krabmeubel: "scratcher",
  kattenbak: "litter", kattenbakvulling: "litter",
  draagtas: "carrier", transportbox: "carrier", reismand: "carrier",
  fontein: "fountain", drinkfontein: "fountain",
  hond: "dog", honden: "dog", hondje: "dog", pup: "puppy",
  kat: "cat", katten: "cat", poes: "cat", katje: "kitten",
  groot: "large", klein: "small", medium: "medium",
  goedkoop: "cheap", duur: "expensive", aanbieding: "sale"
};

function translateDutchTerms(text) {
  let translated = text.toLowerCase();
  for (const [dutch, english] of Object.entries(DUTCH_TO_ENGLISH)) {
    const regex = new RegExp(`\\b${dutch}\\b`, "gi");
    translated = translated.replace(regex, english);
  }
  return translated;
}

function normalizeText(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getProductPrice(product) {
  if (product.variants && product.variants.length > 0) {
    const prices = product.variants.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
    if (prices.length > 0) return Math.min(...prices);
  }
  return parseFloat(product.price) || 0;
}

async function searchProducts(options = {}) {
  const { 
    query = "", 
    petType = null, 
    categoryHints = [], 
    priceMax = null, 
    limit = 6 
  } = options;
  
  try {
    const allProducts = await db.listProducts();
    const products = allProducts.filter(p => p.active === true || p.status === "active");
    
    if (products.length === 0) {
      log(`[ProductSearch] No active products in database`);
      return [];
    }
    
    const translatedQuery = translateDutchTerms(query);
    const searchTerms = normalizeText(translatedQuery).split(" ").filter(t => t.length > 1);
    
    log(`[ProductSearch] Original: "${query}" → Translated: "${translatedQuery}"`);
    
    const scored = products.map(product => {
      const title = normalizeText(product.title);
      const description = normalizeText(product.description);
      const tags = Array.isArray(product.tags) ? product.tags.map(t => normalizeText(t)).join(" ") : "";
      const category = normalizeText(product.category || "");
      const productPetType = (product.petType || product.animal || "").toUpperCase();
      const price = getProductPrice(product);
      
      let score = 0;
      let matchedTerms = 0;
      
      for (const term of searchTerms) {
        if (title.includes(term)) {
          score += 10;
          matchedTerms++;
        }
        if (tags.includes(term)) {
          score += 8;
          matchedTerms++;
        }
        if (category.includes(term)) {
          score += 6;
          matchedTerms++;
        }
        if (description.includes(term)) {
          score += 2;
          matchedTerms++;
        }
      }
      
      for (const catHint of categoryHints) {
        const hint = normalizeText(catHint);
        if (title.includes(hint) || tags.includes(hint) || category.includes(hint)) {
          score += 15;
        }
      }
      
      if (petType && petType !== "BOTH") {
        if (productPetType === petType) {
          score += 5;
        } else if (productPetType && productPetType !== "BOTH" && productPetType !== petType) {
          score -= 10;
        }
      }
      
      if (priceMax && price > priceMax) {
        score -= 20;
      }
      
      if (searchTerms.length > 0 && matchedTerms === 0) {
        score = -100;
      }
      
      return { product, score, price };
    });
    
    let results = scored
      .filter(r => r.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.price - b.price;
      })
      .slice(0, limit)
      .map(r => r.product);
    
    log(`[ProductSearch] Query: "${query}" petType:${petType} categories:[${categoryHints.join(",")}] priceMax:${priceMax} → ${results.length} results`);
    
    return results;
  } catch (err) {
    log(`[ProductSearch] Error: ${err.message}`);
    console.error("[ProductSearch Error]", err);
    return [];
  }
}

async function getProductById(id) {
  try {
    return await db.getProduct(id);
  } catch (err) {
    log(`[ProductSearch] getProductById error: ${err.message}`);
    return null;
  }
}

async function getProductBySlug(slug) {
  try {
    const products = await db.listProducts();
    return products.find(p => p.slug === slug || p.handle === slug) || null;
  } catch (err) {
    log(`[ProductSearch] getProductBySlug error: ${err.message}`);
    return null;
  }
}

async function getRelatedProducts(product, limit = 3) {
  if (!product) return [];
  
  try {
    const allProducts = await db.listProducts();
    const products = allProducts.filter(p => (p.active === true || p.status === "active") && p.id !== product.id);
    const category = normalizeText(product.category || "");
    const petType = (product.petType || product.animal || "").toUpperCase();
    const tags = Array.isArray(product.tags) ? product.tags.map(t => normalizeText(t)) : [];
    
    const scored = products.map(p => {
      let score = 0;
      const pCategory = normalizeText(p.category || "");
      const pPetType = (p.petType || p.animal || "").toUpperCase();
      const pTags = Array.isArray(p.tags) ? p.tags.map(t => normalizeText(t)) : [];
      
      if (category && pCategory === category) score += 10;
      if (petType && pPetType === petType) score += 5;
      if (petType && pPetType && pPetType !== "BOTH" && pPetType !== petType) score -= 8;
      
      for (const tag of tags) {
        if (pTags.includes(tag)) score += 3;
      }
      
      return { product: p, score };
    });
    
    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.product);
  } catch (err) {
    log(`[ProductSearch] getRelatedProducts error: ${err.message}`);
    return [];
  }
}

async function getCrossSellProducts(product, limit = 3) {
  if (!product) return [];
  
  const crossSellMap = {
    bowl: ["placemat", "stand", "travel", "food", "treat"],
    toy: ["treat", "ball", "rope", "chew"],
    bed: ["blanket", "cover", "calming", "pillow"],
    food: ["bowl", "feeder", "treat"],
    collar: ["leash", "harness", "tag"],
    leash: ["collar", "harness", "bag"],
    litter: ["scoop", "mat", "deodorizer"],
    scratcher: ["toy", "catnip", "post"]
  };
  
  try {
    const category = normalizeText(product.category || "");
    const title = normalizeText(product.title);
    
    let crossSellKeywords = [];
    for (const [key, keywords] of Object.entries(crossSellMap)) {
      if (category.includes(key) || title.includes(key)) {
        crossSellKeywords = [...crossSellKeywords, ...keywords];
      }
    }
    
    if (crossSellKeywords.length === 0) return [];
    
    const petType = (product.petType || product.animal || "").toUpperCase();
    
    const results = await searchProducts({
      query: crossSellKeywords.slice(0, 3).join(" "),
      petType,
      limit
    });
    return results.filter(p => p.id !== product.id);
  } catch (err) {
    log(`[ProductSearch] getCrossSellProducts error: ${err.message}`);
    return [];
  }
}

module.exports = { 
  searchProducts, 
  getProductById, 
  getProductBySlug, 
  getRelatedProducts, 
  getCrossSellProducts,
  getProductPrice
};
