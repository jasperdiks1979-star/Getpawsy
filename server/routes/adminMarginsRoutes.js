"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const CATALOG_PATH = path.join(__dirname, "..", "..", "data", "catalog.json");

function authMiddleware(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;
  const adminToken = process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN;

  if (!token || token !== adminToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function getCost(product) {
  return Number(product.cj_price || product.cost || product.source_price || 0);
}

function calculateMargins(products) {
  return products.map(p => {
    const cost = getCost(p);
    const price = Number(p.price || 0);
    const marginUsd = price - cost;
    const marginPct = price > 0 ? (marginUsd / price) * 100 : 0;

    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      category: p.category,
      cost,
      price,
      margin_usd: marginUsd,
      margin_pct: marginPct,
      active: p.active !== false,
      flags: p.flags || []
    };
  });
}

router.get("/api/admin/margins", authMiddleware, (req, res) => {
  try {
    if (!fs.existsSync(CATALOG_PATH)) {
      return res.status(500).json({ error: "Catalog not found" });
    }

    const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
    const catalog = JSON.parse(rawData);
    const products = Array.isArray(catalog) ? catalog : (catalog.products || []);

    const withMargins = calculateMargins(products);
    const activeProducts = withMargins.filter(p => p.active);

    const avgMarginPct = activeProducts.length > 0
      ? activeProducts.reduce((sum, p) => sum + p.margin_pct, 0) / activeProducts.length
      : 0;

    const sorted = [...activeProducts].sort((a, b) => a.margin_pct - b.margin_pct);
    const lowestMarginProduct = sorted[0]?.title || null;
    const highestMarginProduct = sorted[sorted.length - 1]?.title || null;

    res.json({
      products: withMargins,
      summary: {
        totalCount: products.length,
        activeCount: activeProducts.length,
        avgMarginPct,
        lowestMarginProduct,
        highestMarginProduct
      }
    });
  } catch (e) {
    console.error("[MARGINS API] Error:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/margins", authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "..", "public", "admin", "margins.html"));
});

module.exports = router;
