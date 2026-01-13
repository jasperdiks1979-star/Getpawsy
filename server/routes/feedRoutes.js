"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const FEEDS_DIR = path.join(__dirname, "..", "..", "public", "feeds");
const CATALOG_PATH = path.join(__dirname, "..", "..", "data", "catalog.json");

router.get("/feeds/google-products.xml", (req, res) => {
  const xmlPath = path.join(FEEDS_DIR, "google-products.xml");
  
  if (!fs.existsSync(xmlPath)) {
    return res.status(404).send("Feed not generated yet. Run: node scripts/generate-google-feed.js");
  }

  res.set("Content-Type", "application/xml");
  res.sendFile(xmlPath);
});

router.get("/feeds/google-products.json", (req, res) => {
  const jsonPath = path.join(FEEDS_DIR, "google-products.json");
  
  if (!fs.existsSync(jsonPath)) {
    return res.status(404).json({ error: "Feed not generated yet" });
  }

  res.sendFile(jsonPath);
});

router.get("/sitemap.xml", (req, res) => {
  try {
    const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
    const catalog = JSON.parse(rawData);
    const products = Array.isArray(catalog) ? catalog : (catalog.products || []);
    const activeProducts = products.filter(p => p.active !== false && p.slug);

    const baseUrl = "https://getpawsy.pet";
    const today = new Date().toISOString().split("T")[0];

    const staticUrls = [
      { loc: baseUrl, priority: "1.0", changefreq: "daily" },
      { loc: `${baseUrl}/shop`, priority: "0.9", changefreq: "daily" },
      { loc: `${baseUrl}/about`, priority: "0.5", changefreq: "monthly" },
      { loc: `${baseUrl}/contact`, priority: "0.5", changefreq: "monthly" }
    ];

    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    const categoryUrls = categories.map(cat => ({
      loc: `${baseUrl}/category/${encodeURIComponent(cat.toLowerCase().replace(/\s+/g, '-'))}`,
      priority: "0.8",
      changefreq: "weekly"
    }));

    const productUrls = activeProducts.map(p => ({
      loc: `${baseUrl}/product/${p.slug}`,
      priority: "0.7",
      changefreq: "weekly"
    }));

    const allUrls = [...staticUrls, ...categoryUrls, ...productUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

    res.set("Content-Type", "application/xml");
    res.send(xml);
  } catch (e) {
    console.error("[SITEMAP] Error:", e.message);
    res.status(500).send("Error generating sitemap");
  }
});

module.exports = router;
