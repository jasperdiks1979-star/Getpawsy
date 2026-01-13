#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const DATA_DIR = path.join(__dirname, "..", "data");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");
const OUTPUT_DIR = path.join(__dirname, "..", "public", "product");
const BUILD_FILE = path.join(__dirname, "..", "public", "build.json");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateJsonLd(product) {
  const offers = {
    "@type": "Offer",
    "price": product.price,
    "priceCurrency": "USD",
    "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    "seller": {
      "@type": "Organization",
      "name": "GetPawsy"
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.title,
    "description": product.description || product.seo?.description || "",
    "image": product.images && product.images.length > 0 ? product.images : [],
    "brand": {
      "@type": "Brand",
      "name": "GetPawsy"
    },
    "offers": offers,
    "aggregateRating": product.rating ? {
      "@type": "AggregateRating",
      "ratingValue": product.rating.toFixed(1),
      "reviewCount": product.reviewsCount || 1
    } : undefined
  };

  return JSON.stringify(jsonLd);
}

function generateProductPage(product, template) {
  const seoTitle = product.seo?.title || `${product.title} | GetPawsy`;
  const seoDescription = product.seo?.description || product.description || `Shop ${product.title} at GetPawsy. Quality pet products with fast shipping.`;
  const canonicalUrl = `https://getpawsy.com/product/${product.slug}`;
  const primaryImage = product.images && product.images.length > 0 ? product.images[0] : "/images/placeholder.jpg";
  
  const data = {
    product,
    seoTitle: escapeHtml(seoTitle),
    seoDescription: escapeHtml(seoDescription.substring(0, 160)),
    canonicalUrl,
    primaryImage,
    jsonLd: generateJsonLd(product),
    escapeHtml
  };

  return ejs.render(template, data);
}

async function main() {
  console.log("[Page Build] Starting static page generation...");
  
  if (!fs.existsSync(CATALOG_FILE)) {
    console.error("[Page Build] FATAL: catalog.json not found - cannot build pages");
    process.exit(1);
  }
  
  const catalogData = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));
  const products = catalogData.products || [];
  
  if (products.length === 0) {
    console.error("[Page Build] FATAL: catalog.json has no products");
    process.exit(1);
  }
  
  console.log(`[Page Build] Found ${products.length} products`);
  
  ensureDir(TEMPLATES_DIR);
  ensureDir(OUTPUT_DIR);
  
  const templatePath = path.join(TEMPLATES_DIR, "product.ejs");
  if (!fs.existsSync(templatePath)) {
    console.log("[Page Build] Creating product template...");
    const defaultTemplate = generateDefaultTemplate();
    fs.writeFileSync(templatePath, defaultTemplate);
  }
  
  const template = fs.readFileSync(templatePath, "utf8");
  
  let generated = 0;
  let failed = 0;
  
  for (const product of products) {
    try {
      const html = generateProductPage(product, template);
      const productDir = path.join(OUTPUT_DIR, product.slug);
      ensureDir(productDir);
      fs.writeFileSync(path.join(productDir, "index.html"), html);
      generated++;
    } catch (err) {
      console.error(`[Page Build] Failed to generate page for ${product.id}: ${err.message}`);
      failed++;
    }
  }
  
  const buildInfo = {
    frontend_build_id: Date.now().toString(36),
    frontend_built_at: new Date().toISOString(),
    productCount: products.length,
    pagesGenerated: generated,
    pagesFailed: failed,
    catalogSource: "catalog.json",
    hasLocalMedia: products.filter(p => p.hasLocalMedia).length,
    git: "local"
  };
  
  fs.writeFileSync(BUILD_FILE, JSON.stringify(buildInfo, null, 2));
  
  console.log("\n[Page Build] === COMPLETE ===");
  console.log(`[Page Build] Pages generated: ${generated}`);
  console.log(`[Page Build] Pages failed: ${failed}`);
  console.log(`[Page Build] Build info: ${BUILD_FILE}`);
}

function generateDefaultTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= seoTitle %></title>
  <meta name="description" content="<%= seoDescription %>">
  <link rel="canonical" href="<%= canonicalUrl %>">
  
  <!-- Open Graph -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="<%= seoTitle %>">
  <meta property="og:description" content="<%= seoDescription %>">
  <meta property="og:image" content="<%= primaryImage %>">
  <meta property="og:url" content="<%= canonicalUrl %>">
  <meta property="og:site_name" content="GetPawsy">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="<%= seoTitle %>">
  <meta name="twitter:description" content="<%= seoDescription %>">
  <meta name="twitter:image" content="<%= primaryImage %>">
  
  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json"><%- jsonLd %></script>
  
  <link rel="stylesheet" href="/styles.css">
  <style>
    .product-page { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .product-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
    .product-gallery img { width: 100%; height: 150px; object-fit: cover; border-radius: 8px; cursor: pointer; }
    .product-gallery img:first-child { grid-column: span 2; grid-row: span 2; height: 320px; }
    .product-info { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .product-title { font-size: 1.8rem; margin-bottom: 10px; color: #333; }
    .product-price { font-size: 1.5rem; color: #E07A5F; font-weight: bold; margin-bottom: 15px; }
    .product-price .old-price { text-decoration: line-through; color: #999; font-size: 1rem; margin-left: 10px; }
    .product-description { line-height: 1.6; color: #666; margin-bottom: 20px; }
    .add-to-cart-btn { background: #E07A5F; color: white; border: none; padding: 15px 40px; font-size: 1.1rem; border-radius: 8px; cursor: pointer; }
    .add-to-cart-btn:hover { background: #c66a52; }
    .breadcrumb { margin-bottom: 20px; color: #666; }
    .breadcrumb a { color: #E07A5F; text-decoration: none; }
    .video-section { margin-top: 20px; }
    .video-section video { max-width: 100%; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="product-page">
    <nav class="breadcrumb">
      <a href="/">Home</a> &gt;
      <a href="/<%= product.mainCategorySlug || 'products' %>"><%= product.mainCategorySlug || 'Products' %></a> &gt;
      <span><%= product.title %></span>
    </nav>
    
    <div class="product-gallery">
      <% if (product.images && product.images.length > 0) { %>
        <% product.images.forEach(function(img, idx) { %>
          <img src="<%= img %>" alt="<%= escapeHtml(product.title) %> - Image <%= idx + 1 %>" loading="<%= idx === 0 ? 'eager' : 'lazy' %>">
        <% }); %>
      <% } else { %>
        <img src="/images/placeholder.jpg" alt="<%= escapeHtml(product.title) %>">
      <% } %>
    </div>
    
    <% if (product.videos && product.videos.length > 0) { %>
    <div class="video-section">
      <h3>Product Videos</h3>
      <% product.videos.forEach(function(vid) { %>
        <video controls preload="metadata">
          <source src="<%= vid %>" type="video/mp4">
        </video>
      <% }); %>
    </div>
    <% } %>
    
    <div class="product-info">
      <h1 class="product-title"><%= product.title %></h1>
      <div class="product-price">
        &euro;<%= product.price.toFixed(2) %>
        <% if (product.oldPrice) { %>
          <span class="old-price">&euro;<%= product.oldPrice.toFixed(2) %></span>
        <% } %>
      </div>
      <p class="product-description"><%= product.description || product.seo?.description || '' %></p>
      <button class="add-to-cart-btn" onclick="addToCart('<%= product.id %>')">Add to Cart</button>
    </div>
  </div>
  
  <script>
    function addToCart(productId) {
      window.location.href = '/?addToCart=' + productId;
    }
  </script>
</body>
</html>`;
}

main().catch(err => {
  console.error("[Page Build] FATAL:", err);
  process.exit(1);
});
