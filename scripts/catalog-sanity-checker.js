#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");

const REQUIRED_FIELDS = ["id", "title", "price", "slug"];
const RECOMMENDED_FIELDS = ["description", "images", "category", "petType"];
const CJ_FIELDS = ["cj_id", "cj_price", "cj_sku", "source"];

const VALID_PET_TYPES = ["dog", "cat", "small-pet", "all", "dogs", "cats"];
const VALID_CATEGORIES = [
  "toys", "feeding", "grooming", "beds", "carriers", "collars-leashes",
  "health", "clothing", "training", "travel", "accessories", "cages",
  "aquarium", "reptile", "bird", "small-animal"
];

class SanityChecker {
  constructor(catalog) {
    this.products = catalog.products || [];
    this.issues = {
      critical: [],
      warning: [],
      info: []
    };
    this.stats = {
      total: this.products.length,
      active: 0,
      inactive: 0,
      withCjData: 0,
      withImages: 0,
      withValidPrice: 0,
      withPetType: 0,
      withCategory: 0
    };
  }

  log(level, productId, message) {
    this.issues[level].push({
      productId: productId || "N/A",
      message,
      timestamp: new Date().toISOString()
    });
  }

  checkRequiredFields(product) {
    for (const field of REQUIRED_FIELDS) {
      if (!product[field]) {
        this.log("critical", product.id, `Missing required field: ${field}`);
      }
    }
    for (const field of RECOMMENDED_FIELDS) {
      if (!product[field]) {
        this.log("info", product.id, `Missing recommended field: ${field}`);
      }
    }
  }

  checkCjFields(product) {
    const hasCjId = Boolean(product.cj_id || product.cjId);
    const hasCjPrice = Boolean(product.cj_price || product.cjPrice || product.costPrice);
    const hasCjSku = Boolean(product.cj_sku || product.cjSku || product.sku);
    
    if (hasCjId || hasCjPrice || hasCjSku) {
      this.stats.withCjData++;
    }
    
    if (hasCjId && !hasCjPrice) {
      this.log("warning", product.id, "Has CJ ID but missing CJ price/cost");
    }
    
    if (product.source === "cj" && !hasCjId) {
      this.log("warning", product.id, "Source is CJ but missing CJ ID");
    }
  }

  checkImages(product) {
    const images = product.images || [];
    const hasImages = Array.isArray(images) && images.length > 0;
    const hasValidImage = hasImages && images.some(img => 
      img && typeof img === "string" && img.length > 5 && !img.includes("placeholder")
    );
    
    if (hasValidImage) {
      this.stats.withImages++;
    } else if (product.active !== false) {
      this.log("warning", product.id, "Active product without valid images");
    }
    
    if (hasImages) {
      images.forEach((img, i) => {
        if (!img || typeof img !== "string") {
          this.log("info", product.id, `Invalid image at index ${i}`);
        }
      });
    }
  }

  checkPrice(product) {
    const price = parseFloat(product.price);
    const costPrice = parseFloat(product.cj_price || product.costPrice || 0);
    
    if (isNaN(price) || price <= 0) {
      this.log("critical", product.id, `Invalid price: ${product.price}`);
    } else {
      this.stats.withValidPrice++;
      
      if (price < 5) {
        this.log("warning", product.id, `Price too low: $${price}`);
      }
      if (price > 500) {
        this.log("info", product.id, `High price: $${price}`);
      }
      
      if (costPrice > 0) {
        const margin = ((price - costPrice) / price) * 100;
        if (margin < 30) {
          this.log("warning", product.id, `Low margin: ${margin.toFixed(1)}% (cost: $${costPrice}, price: $${price})`);
        }
      }
    }
    
    const comparePrice = parseFloat(product.compare_at_price || product.comparePrice || 0);
    if (comparePrice > 0 && comparePrice <= price) {
      this.log("warning", product.id, `Compare price ($${comparePrice}) not greater than price ($${price})`);
    }
  }

  checkPetType(product) {
    const petType = (product.petType || product.pet_type || "").toLowerCase();
    
    if (petType) {
      this.stats.withPetType++;
      if (!VALID_PET_TYPES.includes(petType)) {
        this.log("info", product.id, `Non-standard pet type: ${petType}`);
      }
    }
  }

  checkCategory(product) {
    const category = (product.category || product.categorySlug || "").toLowerCase();
    const mainCategory = (product.mainCategorySlug || "").toLowerCase();
    const subCategory = (product.subcategorySlug || "").toLowerCase();
    
    if (category || mainCategory) {
      this.stats.withCategory++;
    }
    
    if (mainCategory && !subCategory) {
      this.log("info", product.id, `Has main category (${mainCategory}) but no subcategory`);
    }
  }

  checkSlug(product) {
    const slug = product.slug || "";
    
    if (slug.length < 5) {
      this.log("warning", product.id, `Slug too short: "${slug}"`);
    }
    
    if (!/^[a-z0-9-]+$/.test(slug)) {
      this.log("warning", product.id, `Invalid slug format: "${slug}"`);
    }
  }

  checkDuplicates() {
    const idMap = new Map();
    const slugMap = new Map();
    
    this.products.forEach(p => {
      if (p.id) {
        if (idMap.has(p.id)) {
          this.log("critical", p.id, `Duplicate product ID`);
        }
        idMap.set(p.id, true);
      }
      
      if (p.slug) {
        if (slugMap.has(p.slug)) {
          this.log("warning", p.id, `Duplicate slug: ${p.slug}`);
        }
        slugMap.set(p.slug, true);
      }
    });
  }

  run() {
    console.log("\n========================================");
    console.log("  CATALOG SANITY CHECKER v1.0");
    console.log("========================================\n");
    
    this.products.forEach(product => {
      if (product.active !== false) {
        this.stats.active++;
      } else {
        this.stats.inactive++;
      }
      
      this.checkRequiredFields(product);
      this.checkCjFields(product);
      this.checkImages(product);
      this.checkPrice(product);
      this.checkPetType(product);
      this.checkCategory(product);
      this.checkSlug(product);
    });
    
    this.checkDuplicates();
    
    return this.generateReport();
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      summary: {
        critical: this.issues.critical.length,
        warning: this.issues.warning.length,
        info: this.issues.info.length
      },
      health: this.calculateHealth(),
      issues: this.issues
    };
    
    console.log("=== STATISTICS ===");
    console.log(`Total Products: ${this.stats.total}`);
    console.log(`  Active: ${this.stats.active}`);
    console.log(`  Inactive: ${this.stats.inactive}`);
    console.log(`  With CJ Data: ${this.stats.withCjData}`);
    console.log(`  With Valid Images: ${this.stats.withImages}`);
    console.log(`  With Valid Price: ${this.stats.withValidPrice}`);
    console.log(`  With Pet Type: ${this.stats.withPetType}`);
    console.log(`  With Category: ${this.stats.withCategory}`);
    
    console.log("\n=== HEALTH SCORE ===");
    console.log(`Overall: ${report.health.score}/100 (${report.health.grade})`);
    
    console.log("\n=== ISSUES SUMMARY ===");
    console.log(`🔴 Critical: ${report.summary.critical}`);
    console.log(`🟡 Warning: ${report.summary.warning}`);
    console.log(`🔵 Info: ${report.summary.info}`);
    
    if (report.summary.critical > 0) {
      console.log("\n=== CRITICAL ISSUES (first 10) ===");
      this.issues.critical.slice(0, 10).forEach((issue, i) => {
        console.log(`${i + 1}. [${issue.productId?.substring(0, 15)}...] ${issue.message}`);
      });
    }
    
    if (report.summary.warning > 0) {
      console.log("\n=== WARNINGS (first 10) ===");
      this.issues.warning.slice(0, 10).forEach((issue, i) => {
        console.log(`${i + 1}. [${issue.productId?.substring(0, 15)}...] ${issue.message}`);
      });
    }
    
    console.log("\n========================================");
    
    return report;
  }

  calculateHealth() {
    let score = 100;
    const total = this.stats.total || 1;
    
    score -= (this.issues.critical.length / total) * 50;
    score -= (this.issues.warning.length / total) * 20;
    
    score -= ((total - this.stats.withImages) / total) * 15;
    score -= ((total - this.stats.withValidPrice) / total) * 15;
    
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    let grade = "F";
    if (score >= 90) grade = "A";
    else if (score >= 80) grade = "B";
    else if (score >= 70) grade = "C";
    else if (score >= 60) grade = "D";
    
    return { score, grade };
  }
}

function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("ERROR: catalog.json not found at", CATALOG_PATH);
    process.exit(1);
  }
  
  try {
    const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
    const catalog = JSON.parse(rawData);
    
    const checker = new SanityChecker(catalog);
    const report = checker.run();
    
    const reportPath = path.join(__dirname, "..", "data", "sanity-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);
    
    if (report.summary.critical > 0) {
      process.exit(1);
    }
    
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
}

main();
