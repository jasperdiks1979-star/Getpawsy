#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { applyPricingPolicy, calculateComparePrice } = require("../src/lib/pricingPolicy");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const MAX_PRICE = 999.99;

const SUBCATEGORY_MAPPINGS = {
  "dogs": ["beds-furniture", "collars-leashes", "toys", "grooming", "feeding", "clothing", "travel-carriers", "training", "health-wellness"],
  "cats": ["beds-furniture", "collars-leashes", "toys", "grooming", "feeding", "litter-accessories", "scratchers", "trees-condos", "health-wellness"],
  "small-pets": ["rabbits", "guinea-pigs", "hamsters", "birds", "ferrets", "reptiles", "fish-aquatics", "cages-habitats", "food-treats"]
};

const subcatKeywords = {
  "beds-furniture": ["bed", "furniture", "sofa", "couch", "mattress", "cushion", "blanket", "pillow", "house", "tent"],
  "collars-leashes": ["collar", "leash", "harness", "lead", "strap", "chain", "tag"],
  "toys": ["toy", "ball", "chew", "squeaky", "plush", "fetch", "interactive", "puzzle", "kong"],
  "grooming": ["groom", "brush", "comb", "shampoo", "nail", "clipper", "bath", "dryer", "trimmer"],
  "feeding": ["bowl", "feeder", "water", "fountain", "food container", "dispenser", "slow feeder"],
  "clothing": ["coat", "jacket", "sweater", "vest", "raincoat", "costume", "outfit", "boots", "socks"],
  "travel-carriers": ["carrier", "travel", "bag", "crate", "kennel", "transport", "car seat", "stroller", "backpack"],
  "training": ["train", "potty", "pad", "clicker", "whistle", "bell", "gate", "fence", "door"],
  "health-wellness": ["health", "vitamin", "supplement", "medicine", "flea", "tick", "dental", "tear stain", "ear", "eye"],
  "litter-accessories": ["litter", "scoop", "mat", "deodorizer", "box"],
  "scratchers": ["scratch", "scratcher", "sisal", "cardboard"],
  "trees-condos": ["tree", "condo", "tower", "perch", "climbing", "shelf"],
  "rabbits": ["rabbit", "bunny", "hay"],
  "guinea-pigs": ["guinea pig", "cavy"],
  "hamsters": ["hamster", "wheel", "tunnel", "exercise"],
  "birds": ["bird", "parrot", "cage", "perch", "seed", "feather"],
  "ferrets": ["ferret"],
  "reptiles": ["reptile", "terrarium", "heat lamp", "turtle", "snake", "lizard", "gecko"],
  "fish-aquatics": ["fish", "aquarium", "tank", "filter", "pump", "aquatic"],
  "cages-habitats": ["cage", "habitat", "enclosure", "pen", "playpen", "hutch"]
};

function normalizeText(text) {
  return (text || "").toLowerCase();
}

function inferSubcategory(product, mainCategory) {
  const text = normalizeText([product.title, product.category, product.description].join(" "));
  const allowed = SUBCATEGORY_MAPPINGS[mainCategory] || Object.keys(subcatKeywords);
  
  for (const subcat of allowed) {
    const keywords = subcatKeywords[subcat] || [];
    if (keywords.some(kw => text.includes(kw))) {
      return subcat;
    }
  }
  
  return allowed[0] || "accessories";
}

function fixProduct(product) {
  let updated = { ...product };
  const changes = [];
  
  const mainCat = product.mainCategorySlug || "accessories";
  const allowed = SUBCATEGORY_MAPPINGS[mainCat] || [];
  
  if (!product.subcategorySlug || !allowed.includes(product.subcategorySlug)) {
    const newSubcat = inferSubcategory(product, mainCat);
    if (newSubcat !== product.subcategorySlug) {
      updated.subcategorySlug = newSubcat;
      changes.push(`subcat: ${product.subcategorySlug || "none"} -> ${newSubcat}`);
    }
  }
  
  const price = parseFloat(product.price);
  const compare = parseFloat(product.compare_at_price || 0);
  
  if (price >= MAX_PRICE && compare > 0) {
    delete updated.compare_at_price;
    changes.push(`compare_at_price: $${compare} -> removed (at price cap)`);
  } else if (compare > 0 && compare <= price) {
    const newCompare = calculateComparePrice(price);
    if (newCompare) {
      updated.compare_at_price = newCompare;
      changes.push(`compare_at_price: $${compare} -> $${newCompare}`);
    } else {
      delete updated.compare_at_price;
      changes.push(`compare_at_price: $${compare} -> removed`);
    }
  }
  
  return { product: updated, changes };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  
  console.log("\n========================================");
  console.log("  CATALOG ALL-IN-ONE FIXER v1.0");
  console.log("========================================");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY FIXES"}`);
  console.log("========================================\n");
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("ERROR: catalog.json not found");
    process.exit(1);
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const products = catalog.products || [];
  
  let fixCount = 0;
  const allChanges = [];
  const fixedProducts = [];
  
  products.forEach(product => {
    const { product: fixed, changes } = fixProduct(product);
    
    if (changes.length > 0) {
      fixCount++;
      allChanges.push({
        id: product.id,
        title: (product.title || "").substring(0, 40),
        changes
      });
    }
    
    fixedProducts.push(fixed);
  });
  
  console.log(`Products needing fixes: ${fixCount}`);
  
  if (allChanges.length > 0) {
    console.log("\n=== CHANGES (first 15) ===");
    allChanges.slice(0, 15).forEach((item, i) => {
      console.log(`${i + 1}. ${item.title}...`);
      item.changes.forEach(c => console.log(`   - ${c}`));
    });
    
    if (allChanges.length > 15) {
      console.log(`\n... and ${allChanges.length - 15} more`);
    }
  }
  
  if (!dryRun && fixCount > 0) {
    const backupPath = path.join(__dirname, "..", "data", `catalog.backup.allfix.${Date.now()}.json`);
    fs.writeFileSync(backupPath, fs.readFileSync(CATALOG_PATH));
    console.log(`\nBackup saved to: ${backupPath}`);
    
    const output = { ...catalog, products: fixedProducts };
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));
    console.log(`Applied fixes to ${fixCount} products`);
  } else if (dryRun) {
    console.log(`\n=== DRY RUN: Would fix ${fixCount} products ===`);
    console.log("Run without --dry-run to apply fixes");
  }
  
  console.log("\n========================================\n");
}

main();
