#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");

const VALID_MAIN_CATEGORIES = {
  "dogs": { label: "Dogs", petType: "dog" },
  "cats": { label: "Cats", petType: "cat" },
  "small-pets": { label: "Small Pets", petType: "small-pet" },
  "toys": { label: "Toys", petType: null },
  "feeding": { label: "Feeding", petType: null },
  "accessories": { label: "Accessories", petType: null }
};

const SUBCATEGORY_MAPPINGS = {
  "dogs": [
    "beds-furniture", "collars-leashes", "toys", "grooming", "feeding", 
    "clothing", "travel-carriers", "training", "health-wellness"
  ],
  "cats": [
    "beds-furniture", "collars-leashes", "toys", "grooming", "feeding",
    "litter-accessories", "scratchers", "trees-condos", "health-wellness"
  ],
  "small-pets": [
    "rabbits", "guinea-pigs", "hamsters", "birds", "ferrets", 
    "reptiles", "fish-aquatics", "cages-habitats", "food-treats"
  ]
};

const PET_TYPE_KEYWORDS = {
  "dog": ["dog", "dogs", "puppy", "puppies", "canine", "pup", "hound", "leash", "harness", "kennel", "crate", "bark"],
  "cat": ["cat", "cats", "kitten", "kittens", "feline", "kitty", "litter", "scratching", "scratcher", "catnip"],
  "small-pet": [
    "rabbit", "bunny", "hamster", "guinea pig", "ferret", "chinchilla",
    "bird", "parrot", "parakeet", "budgie", "cockatiel",
    "reptile", "turtle", "tortoise", "snake", "lizard", "gecko",
    "fish", "aquarium", "aquatic", "betta", "goldfish",
    "gerbil", "mouse", "rat", "hedgehog", "cage", "terrarium", "hutch"
  ]
};

function normalizeText(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").trim();
}

function detectPetType(product) {
  const text = normalizeText([
    product.title,
    product.name,
    product.description,
    product.category,
    ...(product.tags || [])
  ].filter(Boolean).join(" "));
  
  const scores = { dog: 0, cat: 0, "small-pet": 0 };
  
  for (const [petType, keywords] of Object.entries(PET_TYPE_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        scores[petType]++;
      }
    }
  }
  
  if (scores.dog > scores.cat && scores.dog > scores["small-pet"]) return "dog";
  if (scores.cat > scores.dog && scores.cat > scores["small-pet"]) return "cat";
  if (scores["small-pet"] > 0) return "small-pet";
  
  return product.petType || "dog";
}

function createSlug(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100);
}

function inferMainCategory(product) {
  const petType = detectPetType(product);
  
  if (petType === "dog") return "dogs";
  if (petType === "cat") return "cats";
  if (petType === "small-pet") return "small-pets";
  
  return "accessories";
}

function inferSubcategory(product, mainCategory) {
  const text = normalizeText([product.title, product.category, product.description].join(" "));
  
  const subcatKeywords = {
    "beds-furniture": ["bed", "furniture", "sofa", "couch", "mattress", "cushion", "blanket"],
    "collars-leashes": ["collar", "leash", "harness", "lead", "strap", "chain"],
    "toys": ["toy", "ball", "chew", "squeaky", "plush", "fetch", "interactive"],
    "grooming": ["groom", "brush", "comb", "shampoo", "nail", "clipper", "bath"],
    "feeding": ["bowl", "feeder", "water", "fountain", "food", "treat", "dispenser"],
    "clothing": ["coat", "jacket", "sweater", "vest", "raincoat", "costume", "outfit"],
    "travel-carriers": ["carrier", "travel", "bag", "crate", "kennel", "transport", "car seat", "stroller"],
    "training": ["train", "potty", "pad", "clicker", "whistle", "bell"],
    "health-wellness": ["health", "vitamin", "supplement", "medicine", "flea", "tick"],
    "litter-accessories": ["litter", "scoop", "mat", "deodorizer"],
    "scratchers": ["scratch", "scratcher", "sisal", "cardboard"],
    "trees-condos": ["tree", "condo", "tower", "perch", "climbing"],
    "rabbits": ["rabbit", "bunny", "hay", "hutch"],
    "guinea-pigs": ["guinea pig", "cavy"],
    "hamsters": ["hamster", "wheel", "tunnel"],
    "birds": ["bird", "parrot", "cage", "perch", "seed"],
    "ferrets": ["ferret"],
    "reptiles": ["reptile", "terrarium", "heat lamp", "turtle", "snake", "lizard"],
    "fish-aquatics": ["fish", "aquarium", "tank", "filter", "pump"],
    "cages-habitats": ["cage", "habitat", "enclosure", "pen", "playpen"]
  };
  
  const allowedSubcats = SUBCATEGORY_MAPPINGS[mainCategory] || Object.keys(subcatKeywords);
  
  for (const subcat of allowedSubcats) {
    const keywords = subcatKeywords[subcat] || [];
    if (keywords.some(kw => text.includes(kw))) {
      return subcat;
    }
  }
  
  return allowedSubcats[0] || "accessories";
}

function fixProduct(product) {
  const changes = [];
  let updated = { ...product };
  
  const detectedPetType = detectPetType(product);
  if (!product.petType || product.petType !== detectedPetType) {
    updated.petType = detectedPetType;
    changes.push(`petType: ${product.petType || "none"} -> ${detectedPetType}`);
  }
  
  const expectedMainCat = inferMainCategory(updated);
  if (!product.mainCategorySlug || product.mainCategorySlug !== expectedMainCat) {
    updated.mainCategorySlug = expectedMainCat;
    changes.push(`mainCategorySlug: ${product.mainCategorySlug || "none"} -> ${expectedMainCat}`);
  }
  
  const expectedSubcat = inferSubcategory(updated, expectedMainCat);
  if (!product.subcategorySlug || !SUBCATEGORY_MAPPINGS[expectedMainCat]?.includes(product.subcategorySlug)) {
    updated.subcategorySlug = expectedSubcat;
    changes.push(`subcategorySlug: ${product.subcategorySlug || "none"} -> ${expectedSubcat}`);
  }
  
  if (!product.slug || product.slug.length < 5) {
    const newSlug = createSlug(product.title || product.name || product.id);
    if (newSlug !== product.slug) {
      updated.slug = newSlug;
      changes.push(`slug: ${product.slug || "none"} -> ${newSlug.substring(0, 30)}...`);
    }
  }
  
  return { product: updated, changes };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const fixAll = process.argv.includes("--fix");
  
  console.log("\n========================================");
  console.log("  TAXONOMY FIXER v1.0");
  console.log("========================================");
  console.log(`Mode: ${dryRun ? "DRY RUN" : fixAll ? "FIX ALL" : "REPORT ONLY"}`);
  console.log("========================================\n");
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("ERROR: catalog.json not found");
    process.exit(1);
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const products = catalog.products || [];
  
  const stats = {
    total: products.length,
    checked: 0,
    needsFix: 0,
    fixed: 0,
    byPetType: { dog: 0, cat: 0, "small-pet": 0, other: 0 },
    byMainCategory: {}
  };
  
  const fixedProducts = [];
  const allChanges = [];
  
  products.forEach(product => {
    stats.checked++;
    const { product: fixed, changes } = fixProduct(product);
    
    const petType = fixed.petType || "other";
    stats.byPetType[petType] = (stats.byPetType[petType] || 0) + 1;
    stats.byMainCategory[fixed.mainCategorySlug] = (stats.byMainCategory[fixed.mainCategorySlug] || 0) + 1;
    
    if (changes.length > 0) {
      stats.needsFix++;
      allChanges.push({
        id: product.id,
        title: (product.title || "").substring(0, 40),
        changes
      });
      
      if (fixAll && !dryRun) {
        stats.fixed++;
        fixedProducts.push(fixed);
      } else {
        fixedProducts.push(product);
      }
    } else {
      fixedProducts.push(product);
    }
  });
  
  console.log("=== TAXONOMY SUMMARY ===");
  console.log(`Total Products: ${stats.total}`);
  console.log(`Needs Fix: ${stats.needsFix}`);
  
  console.log("\n=== PET TYPE DISTRIBUTION ===");
  for (const [type, count] of Object.entries(stats.byPetType)) {
    const pct = ((count / stats.total) * 100).toFixed(1);
    console.log(`  ${type}: ${count} (${pct}%)`);
  }
  
  console.log("\n=== MAIN CATEGORY DISTRIBUTION ===");
  for (const [cat, count] of Object.entries(stats.byMainCategory)) {
    const pct = ((count / stats.total) * 100).toFixed(1);
    console.log(`  ${cat}: ${count} (${pct}%)`);
  }
  
  if (allChanges.length > 0) {
    console.log("\n=== CHANGES NEEDED (first 10) ===");
    allChanges.slice(0, 10).forEach((item, i) => {
      console.log(`${i + 1}. ${item.title}...`);
      item.changes.forEach(c => console.log(`   - ${c}`));
    });
    
    if (allChanges.length > 10) {
      console.log(`\n... and ${allChanges.length - 10} more products need fixes`);
    }
  }
  
  if (fixAll && !dryRun && stats.fixed > 0) {
    const backupPath = path.join(__dirname, "..", "data", `catalog.backup.taxonomy.${Date.now()}.json`);
    fs.writeFileSync(backupPath, fs.readFileSync(CATALOG_PATH));
    console.log(`\nBackup saved to: ${backupPath}`);
    
    const output = { ...catalog, products: fixedProducts };
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));
    console.log(`Fixed: ${stats.fixed} products`);
  } else if (dryRun) {
    console.log(`\n=== DRY RUN: Would fix ${stats.needsFix} products ===`);
    console.log("Run with --fix to apply changes");
  }
  
  console.log("\n========================================\n");
  
  const reportPath = path.join(__dirname, "..", "data", "taxonomy-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    changes: allChanges.slice(0, 100)
  }, null, 2));
  console.log(`Report saved to: ${reportPath}`);
}

main();
