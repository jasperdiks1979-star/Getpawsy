#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const MEDIA_DIR = path.join(__dirname, "..", "public", "media", "products");

function main() {
  console.log("=".repeat(60));
  console.log("[MEDIA VERIFY] Checking local media status...");
  console.log("=".repeat(60));
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("[ERROR] catalog.json not found at", CATALOG_PATH);
    process.exit(1);
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const products = catalog.products || [];
  
  let stats = {
    totalProducts: products.length,
    withLocalMediaFlag: 0,
    withLocalMediaFiles: 0,
    missingMedia: 0,
    brokenFiles: 0,
    totalFiles: 0,
    totalBytes: 0,
    productsWithExternalOnly: 0
  };
  
  const issues = [];
  
  for (const product of products) {
    const productId = String(product.id);
    const productDir = path.join(MEDIA_DIR, productId);
    
    if (product.withLocalMedia) {
      stats.withLocalMediaFlag++;
    }
    
    if (fs.existsSync(productDir)) {
      const files = fs.readdirSync(productDir).filter(f => !f.startsWith("."));
      
      if (files.length > 0) {
        stats.withLocalMediaFiles++;
        
        for (const file of files) {
          const filePath = path.join(productDir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.size < 100) {
              stats.brokenFiles++;
              issues.push({ productId, file, issue: "file too small (< 100 bytes)" });
            } else {
              stats.totalFiles++;
              stats.totalBytes += stat.size;
            }
          } catch (e) {
            stats.brokenFiles++;
            issues.push({ productId, file, issue: e.message });
          }
        }
      } else {
        stats.missingMedia++;
        issues.push({ productId, issue: "directory exists but empty" });
      }
    } else {
      if (product.withLocalMedia) {
        stats.missingMedia++;
        issues.push({ productId, issue: "withLocalMedia=true but no directory" });
      }
      
      if (product.originalImages && product.originalImages.length > 0) {
        stats.productsWithExternalOnly++;
      }
    }
  }
  
  const coveragePercent = ((stats.withLocalMediaFiles / stats.totalProducts) * 100).toFixed(1);
  
  console.log("");
  console.log("SUMMARY:");
  console.log("-".repeat(40));
  console.log(`  Total products:           ${stats.totalProducts}`);
  console.log(`  With local media flag:    ${stats.withLocalMediaFlag}`);
  console.log(`  With local media files:   ${stats.withLocalMediaFiles}`);
  console.log(`  Coverage:                 ${coveragePercent}%`);
  console.log(`  Missing media:            ${stats.missingMedia}`);
  console.log(`  Broken files:             ${stats.brokenFiles}`);
  console.log(`  External-only products:   ${stats.productsWithExternalOnly}`);
  console.log(`  Total valid files:        ${stats.totalFiles}`);
  console.log(`  Total size:               ${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log("");
  
  if (issues.length > 0 && issues.length <= 20) {
    console.log("ISSUES:");
    console.log("-".repeat(40));
    for (const issue of issues) {
      console.log(`  [${issue.productId}] ${issue.issue}`);
    }
    console.log("");
  } else if (issues.length > 20) {
    console.log(`[WARN] ${issues.length} issues found (too many to display)`);
  }
  
  if (stats.withLocalMediaFiles === stats.totalProducts) {
    console.log("[OK] All products have local media!");
  } else {
    console.log(`[INFO] Run 'npm run media:sync' to download missing images`);
  }
  
  console.log("=".repeat(60));
  
  return {
    ok: stats.withLocalMediaFiles === stats.totalProducts && stats.brokenFiles === 0,
    stats,
    issues
  };
}

const result = main();
process.exit(result.ok ? 0 : 1);
