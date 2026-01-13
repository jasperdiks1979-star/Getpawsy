#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const FEEDS_DIR = path.join(__dirname, "..", "public", "feeds");
const XML_PATH = path.join(FEEDS_DIR, "google-products.xml");
const JSON_PATH = path.join(FEEDS_DIR, "google-products.json");

const SITE_URL = "https://getpawsy.pet";
const BRAND = "GetPawsy";
const FREE_SHIPPING_THRESHOLD = 50;

function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatPrice(price) {
  return `${Number(price).toFixed(2)} USD`;
}

function getAvailability(product) {
  if (product.in_stock === false) return "out of stock";
  if (product.inventory !== undefined && product.inventory <= 0) return "out of stock";
  return "in stock";
}

function getImageUrl(product) {
  const img = product.images?.[0] || product.thumbnail || product.resolved_image;
  if (!img) return `${SITE_URL}/images/placeholder.png`;
  if (img.startsWith("http")) return img;
  return `${SITE_URL}${img.startsWith("/") ? "" : "/"}${img}`;
}

function productToItem(product) {
  const link = `${SITE_URL}/product/${product.slug}`;
  const imageLink = getImageUrl(product);
  const availability = getAvailability(product);
  const price = formatPrice(product.price || 0);
  const salePrice = product.compare_at_price ? formatPrice(product.compare_at_price) : null;

  return {
    id: product.id || product.slug,
    title: product.title || "Pet Product",
    description: product.seo?.description || product.description || `Quality pet product from ${BRAND}`,
    link,
    image_link: imageLink,
    availability,
    price,
    sale_price: salePrice,
    brand: BRAND,
    condition: "new",
    google_product_category: "Animals & Pet Supplies",
    product_type: product.category || "Pet Supplies",
    shipping: product.price >= FREE_SHIPPING_THRESHOLD ? "US:::0 USD" : null
  };
}

function generateXml(items) {
  const itemsXml = items.map(item => {
    let xml = `    <item>
      <g:id>${escapeXml(item.id)}</g:id>
      <g:title>${escapeXml(item.title)}</g:title>
      <g:description>${escapeXml(item.description)}</g:description>
      <g:link>${escapeXml(item.link)}</g:link>
      <g:image_link>${escapeXml(item.image_link)}</g:image_link>
      <g:availability>${item.availability}</g:availability>
      <g:price>${item.price}</g:price>
      <g:brand>${escapeXml(item.brand)}</g:brand>
      <g:condition>${item.condition}</g:condition>
      <g:google_product_category>${escapeXml(item.google_product_category)}</g:google_product_category>
      <g:product_type>${escapeXml(item.product_type)}</g:product_type>`;
    
    if (item.shipping) {
      xml += `\n      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard</g:service>
        <g:price>0 USD</g:price>
      </g:shipping>`;
    }
    
    xml += `\n    </item>`;
    return xml;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GetPawsy Pet Products</title>
    <link>${SITE_URL}</link>
    <description>Quality pet products for dogs and cats</description>
${itemsXml}
  </channel>
</rss>`;
}

function main() {
  console.log("[GOOGLE-FEED] Starting...");

  if (!fs.existsSync(FEEDS_DIR)) {
    fs.mkdirSync(FEEDS_DIR, { recursive: true });
    console.log("[GOOGLE-FEED] Created feeds directory");
  }

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("[GOOGLE-FEED] ERROR: catalog.json not found");
    process.exit(1);
  }

  const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
  let catalog;

  try {
    catalog = JSON.parse(rawData);
  } catch (e) {
    console.error("[GOOGLE-FEED] ERROR: Failed to parse catalog.json:", e.message);
    process.exit(1);
  }

  const products = Array.isArray(catalog) ? catalog : (catalog.products || []);
  
  const activeProducts = products.filter(p => {
    if (p.active === false) return false;
    if (!p.price || p.price <= 0) return false;
    if (!p.slug) return false;
    return true;
  });

  const items = activeProducts.map(productToItem);

  const xml = generateXml(items);
  fs.writeFileSync(XML_PATH, xml, "utf-8");
  console.log("[GOOGLE-FEED] Generated XML with", items.length, "products");

  fs.writeFileSync(JSON_PATH, JSON.stringify(items, null, 2), "utf-8");
  console.log("[GOOGLE-FEED] Generated JSON debug file");

  console.log("[GOOGLE-FEED] Done!");
}

main();
