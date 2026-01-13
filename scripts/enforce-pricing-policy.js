#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { 
  validatePricing, 
  applyPricingPolicy,
  calculateMargin,
  MIN_MARGIN_PERCENT 
} = require("../src/lib/pricingPolicy");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const forceRecalculate = process.argv.includes("--force");
  const fixAll = process.argv.includes("--fix");
  
  console.log("\n========================================");
  console.log("  PRICING POLICY ENFORCEMENT v1.0");
  console.log("========================================");
  console.log(`Mode: ${dryRun ? "DRY RUN" : fixAll ? "FIX ALL" : "REPORT ONLY"}`);
  console.log(`Force Recalculate: ${forceRecalculate}`);
  console.log("========================================\n");
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("ERROR: catalog.json not found");
    process.exit(1);
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const products = catalog.products || [];
  
  const stats = {
    total: products.length,
    valid: 0,
    invalid: 0,
    lowMargin: 0,
    negativeMargin: 0,
    badComparePrice: 0,
    fixed: 0,
    wouldFix: 0
  };
  
  const issues = [];
  const updatedProducts = [];
  
  products.forEach(product => {
    const validation = validatePricing(product);
    
    if (validation.valid) {
      stats.valid++;
    } else {
      stats.invalid++;
    }
    
    validation.issues.forEach(issue => {
      if (issue.message.includes("margin")) {
        if (issue.message.includes("Negative")) {
          stats.negativeMargin++;
        } else {
          stats.lowMargin++;
        }
      }
      if (issue.message.includes("Compare price")) {
        stats.badComparePrice++;
      }
      
      issues.push({
        productId: product.id,
        title: (product.title || "").substring(0, 40),
        ...issue
      });
    });
    
    if (fixAll || forceRecalculate) {
      const result = applyPricingPolicy(product, { dryRun, forceRecalculate });
      if (dryRun && result.wouldChange) {
        stats.wouldFix++;
        updatedProducts.push(product);
      } else if (!dryRun) {
        if (result.pricingUpdated) {
          stats.fixed++;
        }
        updatedProducts.push(result);
      } else {
        updatedProducts.push(product);
      }
    } else {
      updatedProducts.push(product);
    }
  });
  
  console.log("=== VALIDATION SUMMARY ===");
  console.log(`Total Products: ${stats.total}`);
  console.log(`  Valid Pricing: ${stats.valid}`);
  console.log(`  Invalid Pricing: ${stats.invalid}`);
  console.log(`  Low Margin (<${MIN_MARGIN_PERCENT}%): ${stats.lowMargin}`);
  console.log(`  Negative Margin: ${stats.negativeMargin}`);
  console.log(`  Bad Compare Price: ${stats.badComparePrice}`);
  
  if (issues.length > 0) {
    console.log("\n=== ISSUES (first 15) ===");
    issues.slice(0, 15).forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.type.toUpperCase()}] ${issue.title}...`);
      console.log(`   ${issue.message}`);
      if (issue.suggestedPrice) {
        console.log(`   Suggested price: $${issue.suggestedPrice}`);
      }
    });
    
    if (issues.length > 15) {
      console.log(`\n... and ${issues.length - 15} more issues`);
    }
  }
  
  if (dryRun) {
    console.log(`\n=== DRY RUN RESULTS ===`);
    console.log(`Would fix: ${stats.wouldFix} products`);
    console.log(`Run with --fix to apply changes`);
  } else if (fixAll || forceRecalculate) {
    const backupPath = path.join(__dirname, "..", "data", `catalog.backup.pricing.${Date.now()}.json`);
    fs.writeFileSync(backupPath, fs.readFileSync(CATALOG_PATH));
    console.log(`\nBackup saved to: ${backupPath}`);
    
    const output = { ...catalog, products: updatedProducts };
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));
    
    console.log(`\n=== CHANGES APPLIED ===`);
    console.log(`Fixed: ${stats.fixed} products`);
  }
  
  console.log("\n========================================\n");
  
  const reportPath = path.join(__dirname, "..", "data", "pricing-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    mode: dryRun ? "dry-run" : fixAll ? "fix" : "report",
    stats,
    issues: issues.slice(0, 100)
  }, null, 2));
  console.log(`Report saved to: ${reportPath}`);
}

main();
