#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { calculateRetailPrice, calculateComparePrice, calculateMargin, MIN_MARGIN_PERCENT } = require("../src/lib/pricingPolicy");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const LOG_PATH = path.join(__dirname, "..", "data", "cj-sync-log.json");

const BATCH_SIZE = 50;
const RATE_LIMIT_MS = 100;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class CJCostSync {
  constructor(catalog) {
    this.products = catalog.products || [];
    this.originalCatalog = catalog;
    this.syncLog = {
      timestamp: new Date().toISOString(),
      totalProducts: this.products.length,
      synced: 0,
      priceUpdates: 0,
      marginIssues: 0,
      errors: [],
      marginReport: []
    };
  }

  async syncBatch(batch, batchIndex) {
    const results = [];
    
    for (const product of batch) {
      try {
        const synced = this.syncProduct(product);
        results.push(synced);
        this.syncLog.synced++;
        
        await sleep(RATE_LIMIT_MS / batch.length);
      } catch (err) {
        this.syncLog.errors.push({
          productId: product.id,
          error: err.message
        });
        results.push(product);
      }
    }
    
    console.log(`[Batch ${batchIndex + 1}] Synced ${batch.length} products`);
    return results;
  }

  syncProduct(product) {
    const costPrice = parseFloat(product.cj_price || product.costPrice || product.cost || 0);
    const currentPrice = parseFloat(product.price || 0);
    const category = product.category || product.mainCategorySlug || "accessories";
    
    let updated = { ...product };
    let priceChanged = false;
    
    if (costPrice > 0) {
      const margin = calculateMargin(costPrice, currentPrice);
      
      this.syncLog.marginReport.push({
        id: product.id,
        title: (product.title || "").substring(0, 40),
        cost: costPrice,
        price: currentPrice,
        margin: margin
      });
      
      if (margin < MIN_MARGIN_PERCENT) {
        const suggestedPrice = calculateRetailPrice(costPrice, category);
        
        if (suggestedPrice !== currentPrice) {
          updated.price = suggestedPrice;
          updated.priceSource = "cj-cost-sync";
          updated.priceSyncedAt = new Date().toISOString();
          priceChanged = true;
          this.syncLog.priceUpdates++;
        }
        
        this.syncLog.marginIssues++;
      }
      
      updated.cj_price = costPrice;
      updated.costPrice = costPrice;
      updated.marginPercent = calculateMargin(costPrice, updated.price);
    }
    
    const newCompare = calculateComparePrice(updated.price);
    if (newCompare === null) {
      delete updated.compare_at_price;
    } else if (!updated.compare_at_price || updated.compare_at_price <= updated.price) {
      updated.compare_at_price = newCompare;
    }
    
    return updated;
  }

  async run(dryRun = false) {
    console.log("\n========================================");
    console.log("  CJ COST SYNC v2.0");
    console.log("========================================");
    console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY CHANGES"}`);
    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log(`Rate Limit: ${RATE_LIMIT_MS}ms per batch`);
    console.log("========================================\n");
    
    const batches = [];
    for (let i = 0; i < this.products.length; i += BATCH_SIZE) {
      batches.push(this.products.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`Processing ${this.products.length} products in ${batches.length} batches...\n`);
    
    const allResults = [];
    for (let i = 0; i < batches.length; i++) {
      const results = await this.syncBatch(batches[i], i);
      allResults.push(...results);
      
      await sleep(RATE_LIMIT_MS);
    }
    
    console.log("\n=== SYNC SUMMARY ===");
    console.log(`Total Products: ${this.syncLog.totalProducts}`);
    console.log(`Synced: ${this.syncLog.synced}`);
    console.log(`Price Updates: ${this.syncLog.priceUpdates}`);
    console.log(`Margin Issues: ${this.syncLog.marginIssues}`);
    console.log(`Errors: ${this.syncLog.errors.length}`);
    
    const lowMargin = this.syncLog.marginReport.filter(r => r.margin < MIN_MARGIN_PERCENT);
    if (lowMargin.length > 0) {
      console.log(`\n=== LOW MARGIN PRODUCTS (first 10) ===`);
      lowMargin.slice(0, 10).forEach((item, i) => {
        console.log(`${i + 1}. ${item.title}... (margin: ${item.margin}%, cost: $${item.cost}, price: $${item.price})`);
      });
    }
    
    if (!dryRun && this.syncLog.priceUpdates > 0) {
      const backupPath = path.join(__dirname, "..", "data", `catalog.backup.cjsync.${Date.now()}.json`);
      fs.writeFileSync(backupPath, fs.readFileSync(CATALOG_PATH));
      console.log(`\nBackup saved to: ${backupPath}`);
      
      const output = { ...this.originalCatalog, products: allResults };
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));
      console.log(`Applied ${this.syncLog.priceUpdates} price updates`);
    } else if (dryRun) {
      console.log(`\n=== DRY RUN: Would update ${this.syncLog.priceUpdates} prices ===`);
    }
    
    fs.writeFileSync(LOG_PATH, JSON.stringify({
      ...this.syncLog,
      marginReport: this.syncLog.marginReport.slice(0, 100)
    }, null, 2));
    console.log(`\nSync log saved to: ${LOG_PATH}`);
    
    console.log("\n========================================\n");
    
    return this.syncLog;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("ERROR: catalog.json not found");
    process.exit(1);
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
  const syncer = new CJCostSync(catalog);
  
  await syncer.run(dryRun);
}

main().catch(err => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
