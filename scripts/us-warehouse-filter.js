#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");

const US_KEYWORDS = ["us", "usa", "united states", "america", "domestic"];
const CN_KEYWORDS = ["cn", "china", "chinese", "shenzhen", "guangzhou", "asia"];

function detectWarehouse(product) {
  const fields = [
    product.warehouse,
    product.warehouses,
    product.shippingFrom,
    product.ship_from_country,
    product.inventory_country,
    product.origin,
    ...(product.tags || [])
  ].filter(Boolean).map(f => String(f).toLowerCase());

  const text = fields.join(" ");

  if (US_KEYWORDS.some(kw => text.includes(kw))) {
    return "US";
  }
  if (CN_KEYWORDS.some(kw => text.includes(kw))) {
    return "CN";
  }
  return "UNKNOWN";
}

function estimateShippingDays(product) {
  if (product.shipping_days_min) return product.shipping_days_min;
  if (product.shipping_days_max) return product.shipping_days_max;
  if (product.eta_days) return product.eta_days;
  
  const origin = detectWarehouse(product);
  if (origin === "US") return 3;
  if (origin === "CN") return 14;
  return 7;
}

function filterProduct(product) {
  const flags = [];
  const origin = detectWarehouse(product);
  const etaDays = estimateShippingDays(product);
  
  let active = true;

  if (origin === "CN") {
    flags.push("non_us_warehouse");
    active = false;
  }

  if (etaDays > 10) {
    flags.push("slow_shipping");
    active = false;
  }

  if (origin === "UNKNOWN") {
    flags.push("needs_review");
  }

  return {
    ...product,
    active,
    flags: [...new Set([...(product.flags || []), ...flags])],
    shipping_profile: {
      origin,
      eta_days: etaDays
    }
  };
}

function main() {
  console.log("[US-WAREHOUSE-FILTER] Starting...");

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("[US-WAREHOUSE-FILTER] ERROR: catalog.json not found");
    process.exit(1);
  }

  const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
  let catalog;

  try {
    catalog = JSON.parse(rawData);
  } catch (e) {
    console.error("[US-WAREHOUSE-FILTER] ERROR: Failed to parse catalog.json:", e.message);
    process.exit(1);
  }

  const products = Array.isArray(catalog) ? catalog : (catalog.products || []);
  const updated = products.map(filterProduct);

  const output = Array.isArray(catalog) ? updated : { ...catalog, products: updated };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(output, null, 2));

  const stats = {
    total: updated.length,
    active: updated.filter(p => p.active).length,
    inactive: updated.filter(p => !p.active).length,
    needsReview: updated.filter(p => p.flags?.includes("needs_review")).length,
    usWarehouse: updated.filter(p => p.shipping_profile?.origin === "US").length,
    cnWarehouse: updated.filter(p => p.shipping_profile?.origin === "CN").length,
    unknown: updated.filter(p => p.shipping_profile?.origin === "UNKNOWN").length
  };

  console.log("[US-WAREHOUSE-FILTER] Results:");
  console.log("  Total:", stats.total);
  console.log("  Active:", stats.active);
  console.log("  Inactive:", stats.inactive);
  console.log("  US Warehouse:", stats.usWarehouse);
  console.log("  CN Warehouse:", stats.cnWarehouse);
  console.log("  Unknown:", stats.unknown);
  console.log("  Needs Review:", stats.needsReview);
  console.log("[US-WAREHOUSE-FILTER] Done!");
}

main();
