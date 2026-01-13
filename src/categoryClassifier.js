const { log } = require("./logger");

const CATEGORY_DEFINITIONS = {
  dogs: {
    name: "Dogs",
    slug: "dogs",
    icon: "🐕",
    subcategories: {
      "toys": { name: "Toys", keywords: ["toy", "ball", "rope", "chew", "squeaky", "plush", "fetch", "frisbee", "tug"] },
      "food-treats": { name: "Food & Treats", keywords: ["food", "treat", "snack", "biscuit", "jerky", "bone", "chews", "nutrition", "supplement", "granule"] },
      "beds-furniture": { name: "Beds & Furniture", keywords: ["bed", "mat", "cushion", "sofa", "blanket", "crate", "kennel", "house"] },
      "collars-leashes": { name: "Collars & Leashes", keywords: ["collar", "leash", "harness", "lead", "tag", "id"] },
      "grooming": { name: "Grooming", keywords: ["brush", "comb", "shampoo", "grooming", "nail", "clipper", "fur", "bath", "cleaning", "foam", "paw"] },
      "clothing": { name: "Clothing", keywords: ["clothes", "jacket", "sweater", "coat", "raincoat", "costume", "bandana", "bow"] },
      "bowls-feeders": { name: "Bowls & Feeders", keywords: ["bowl", "feeder", "water", "fountain", "dispenser", "bottle"] },
      "training": { name: "Training", keywords: ["training", "whistle", "clicker", "pee", "pad", "potty", "diaper"] },
      "health": { name: "Health & Care", keywords: ["health", "medicine", "vitamin", "eye", "ear", "dental", "teeth", "flea", "tick", "protection", "support"] },
      "travel": { name: "Travel & Outdoor", keywords: ["travel", "carrier", "bag", "backpack", "car", "seat", "outdoor", "camping"] }
    }
  },
  cats: {
    name: "Cats",
    slug: "cats",
    icon: "🐱",
    subcategories: {
      "toys": { name: "Toys", keywords: ["toy", "mouse", "feather", "wand", "laser", "ball", "catnip", "teaser", "interactive"] },
      "food-treats": { name: "Food & Treats", keywords: ["food", "treat", "snack", "catnip", "nutrition", "supplement"] },
      "beds-furniture": { name: "Beds & Furniture", keywords: ["bed", "tree", "tower", "condo", "perch", "hammock", "cave", "house", "scratching", "scratcher", "post"] },
      "litter": { name: "Litter & Accessories", keywords: ["litter", "box", "scoop", "mat", "deodorizer", "tray"] },
      "grooming": { name: "Grooming", keywords: ["brush", "comb", "shampoo", "grooming", "nail", "clipper", "fur", "deshedding"] },
      "collars-harnesses": { name: "Collars & Harnesses", keywords: ["collar", "harness", "leash", "tag", "bell"] },
      "bowls-feeders": { name: "Bowls & Feeders", keywords: ["bowl", "feeder", "water", "fountain", "dispenser", "automatic"] },
      "health": { name: "Health & Care", keywords: ["health", "medicine", "vitamin", "eye", "ear", "dental", "flea", "tick"] },
      "carriers": { name: "Carriers & Travel", keywords: ["carrier", "bag", "backpack", "travel", "crate"] }
    }
  },
  "small-pets": {
    name: "Small Pets",
    slug: "small-pets",
    icon: "🐹",
    subcategories: {
      "hamster": { name: "Hamster", keywords: ["hamster", "wheel", "tube"] },
      "rabbit": { name: "Rabbit", keywords: ["rabbit", "bunny", "hay"] },
      "bird": { name: "Birds", keywords: ["bird", "cage", "perch", "seed", "parrot"] },
      "fish": { name: "Fish & Aquarium", keywords: ["fish", "aquarium", "tank", "filter", "pump"] }
    }
  }
};

const DOG_KEYWORDS = ["dog", "puppy", "pup", "canine", "doggy", "doggo", "k9", "pooch"];
const CAT_KEYWORDS = ["cat", "kitten", "kitty", "feline", "meow"];

function classifyProduct(product) {
  const title = (product.title || "").toLowerCase();
  const description = (product.description || "").toLowerCase();
  const combinedText = `${title} ${description}`;
  
  let mainCategory = null;
  let subcategory = null;
  let tags = [];
  
  const isDog = DOG_KEYWORDS.some(kw => combinedText.includes(kw));
  const isCat = CAT_KEYWORDS.some(kw => combinedText.includes(kw));
  
  if (isDog && !isCat) {
    mainCategory = "dogs";
  } else if (isCat && !isDog) {
    mainCategory = "cats";
  } else if (isDog && isCat) {
    const dogCount = DOG_KEYWORDS.filter(kw => combinedText.includes(kw)).length;
    const catCount = CAT_KEYWORDS.filter(kw => combinedText.includes(kw)).length;
    mainCategory = dogCount >= catCount ? "dogs" : "cats";
  } else {
    if (combinedText.includes("hamster") || combinedText.includes("rabbit") || combinedText.includes("bird") || combinedText.includes("fish")) {
      mainCategory = "small-pets";
    } else {
      mainCategory = "dogs";
    }
  }
  
  const categoryDef = CATEGORY_DEFINITIONS[mainCategory];
  if (categoryDef && categoryDef.subcategories) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [subSlug, subDef] of Object.entries(categoryDef.subcategories)) {
      let score = 0;
      for (const keyword of subDef.keywords) {
        if (title.includes(keyword)) score += 3;
        if (description.includes(keyword)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = subSlug;
      }
    }
    
    subcategory = bestMatch || "toys";
  }
  
  for (const keyword of DOG_KEYWORDS.concat(CAT_KEYWORDS)) {
    if (combinedText.includes(keyword)) {
      tags.push(keyword);
    }
  }
  
  const productKeywords = ["toy", "bed", "food", "treat", "collar", "leash", "brush", "bowl"];
  for (const kw of productKeywords) {
    if (combinedText.includes(kw) && !tags.includes(kw)) {
      tags.push(kw);
    }
  }
  
  return {
    category: mainCategory,
    subcategory: subcategory,
    tags: [...new Set(tags)].slice(0, 10)
  };
}

function getAllCategories() {
  const result = [];
  for (const [slug, def] of Object.entries(CATEGORY_DEFINITIONS)) {
    result.push({
      slug,
      name: def.name,
      icon: def.icon,
      subcategories: Object.entries(def.subcategories || {}).map(([subSlug, subDef]) => ({
        slug: subSlug,
        name: subDef.name,
        fullSlug: `${slug}/${subSlug}`
      }))
    });
  }
  return result;
}

function getCategoryBySlug(slug) {
  const def = CATEGORY_DEFINITIONS[slug];
  if (!def) return null;
  return {
    slug,
    name: def.name,
    icon: def.icon,
    subcategories: Object.entries(def.subcategories || {}).map(([subSlug, subDef]) => ({
      slug: subSlug,
      name: subDef.name
    }))
  };
}

function getSubcategoryBySlug(categorySlug, subcategorySlug) {
  const cat = CATEGORY_DEFINITIONS[categorySlug];
  if (!cat || !cat.subcategories) return null;
  const sub = cat.subcategories[subcategorySlug];
  if (!sub) return null;
  return {
    categorySlug,
    categoryName: cat.name,
    slug: subcategorySlug,
    name: sub.name
  };
}

module.exports = {
  classifyProduct,
  getAllCategories,
  getCategoryBySlug,
  getSubcategoryBySlug,
  CATEGORY_DEFINITIONS
};
