const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { db } = require("./db");
const { log } = require("./logger");

const SITE_PAGES_PATH = path.join(__dirname, "..", "data", "site_pages.json");

function loadSitePages() {
  try {
    if (fs.existsSync(SITE_PAGES_PATH)) {
      const data = JSON.parse(fs.readFileSync(SITE_PAGES_PATH, "utf-8"));
      return data.pages || [];
    }
  } catch (err) {
    log(`[KnowledgeDocs] Error loading site pages: ${err.message}`);
  }
  return [];
}

const SHIPPING_POLICY = `
GetPawsy Shipping Policy:
- We ship from US-based warehouses
- Standard shipping: 5-7 business days
- Express shipping: 2-3 business days
- Priority shipping: 1-2 business days
- Free shipping on orders over $50 (Alaska/Hawaii $75+)
- We ship to all 50 US states
- International shipping not currently available
- Order processing: Same day before 2PM EST
- Tracking provided via email after shipment
`;

const RETURNS_POLICY = `
GetPawsy Returns Policy:
- 30-day return window for unused items
- Items must be in original packaging
- Refunds processed within 5-7 business days
- Free return shipping for defective items
- Change of mind returns: $5.99 shipping fee
- Exchanges available for different sizes/colors
- Opened food/treats cannot be returned for safety reasons
- Contact support@getpawsy.com for return authorization
`;

const ABOUT_SHOP = `
GetPawsy Pet Shop:
- Online pet store specializing in dog and cat products
- Categories: toys, beds, feeding, grooming, health, walking, training, travel
- High-quality products from trusted suppliers
- Secure checkout with Stripe (all major credit cards)
- AI-powered shopping assistant (Pawsy) available 24/7
- Customer support: support@getpawsy.com
- Fast US shipping, 30-day returns
`;

function hashContent(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

function buildProductDoc(product) {
  const p = product;
  
  let priceRange = "";
  if (p.variants && p.variants.length > 0) {
    const prices = p.variants.map(v => v.price || 0).filter(pr => pr > 0);
    if (prices.length > 0) {
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      priceRange = minPrice === maxPrice 
        ? `$${minPrice.toFixed(2)}` 
        : `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`;
    }
  } else if (p.price) {
    priceRange = `$${p.price.toFixed(2)}`;
  }
  
  let variantsSummary = "";
  if (p.variants && p.variants.length > 0) {
    const options = {};
    p.variants.forEach(v => {
      if (v.options) {
        Object.entries(v.options).forEach(([key, val]) => {
          if (!options[key]) options[key] = new Set();
          options[key].add(val);
        });
      }
    });
    variantsSummary = Object.entries(options)
      .map(([key, vals]) => `${key}: ${Array.from(vals).join(", ")}`)
      .join(" | ");
  }
  
  const tags = Array.isArray(p.tags) ? p.tags.join(", ") : "";
  
  const text = `
Product: ${p.title || "Untitled"}
ID: ${p.id}
Category: ${p.category || "general"}
Tags: ${tags || "none"}
Price: ${priceRange || "Contact for price"}
Variants: ${variantsSummary || "Standard"}
Description: ${p.description || "No description available"}
URL: /product/${p.slug || p.id}
In Stock: ${p.active !== false ? "Yes" : "No"}
`.trim();

  return {
    doc_id: `product:${p.id}`,
    content_text: text,
    content_hash: hashContent(text),
    meta: {
      type: "product",
      id: p.id,
      title: p.title,
      price: priceRange,
      image: p.image,
      category: p.category
    }
  };
}

function buildPolicyDocs() {
  const docs = [];
  
  const sitePages = loadSitePages();
  
  if (sitePages.length > 0) {
    for (const page of sitePages) {
      if (page.content && page.slug) {
        docs.push({
          doc_id: `policy:${page.slug}`,
          content_text: page.content.trim(),
          content_hash: hashContent(page.content),
          meta: { 
            type: page.type || "policy", 
            name: page.slug,
            title: page.title,
            url: page.url
          }
        });
      }
    }
    log(`[KnowledgeDocs] Loaded ${docs.length} pages from site_pages.json`);
  }
  
  if (docs.length === 0) {
    docs.push(
      {
        doc_id: "policy:shipping",
        content_text: SHIPPING_POLICY.trim(),
        content_hash: hashContent(SHIPPING_POLICY),
        meta: { type: "policy", name: "shipping" }
      },
      {
        doc_id: "policy:returns",
        content_text: RETURNS_POLICY.trim(),
        content_hash: hashContent(RETURNS_POLICY),
        meta: { type: "policy", name: "returns" }
      },
      {
        doc_id: "policy:about",
        content_text: ABOUT_SHOP.trim(),
        content_hash: hashContent(ABOUT_SHOP),
        meta: { type: "policy", name: "about" }
      }
    );
  }
  
  return docs;
}

async function buildKnowledgeDocs() {
  try {
    const products = await db.listProducts();
    
    const activeProducts = products.filter(p => 
      p.active !== false && 
      p.rejected !== true && 
      p.title && 
      p.id
    );
    
    log(`[KnowledgeDocs] Building docs for ${activeProducts.length} active products`);
    
    const productDocs = activeProducts.map(buildProductDoc);
    
    const policyDocs = buildPolicyDocs();
    
    const allDocs = [...productDocs, ...policyDocs];
    
    log(`[KnowledgeDocs] Generated ${allDocs.length} total documents`);
    
    return allDocs;
  } catch (err) {
    log(`[KnowledgeDocs] Error building docs: ${err.message}`);
    throw err;
  }
}

function extractProductIds(docs) {
  return docs
    .filter(d => d.doc_id.startsWith("product:"))
    .map(d => d.meta?.id);
}

module.exports = {
  buildKnowledgeDocs,
  buildProductDoc,
  buildPolicyDocs,
  hashContent,
  extractProductIds
};
