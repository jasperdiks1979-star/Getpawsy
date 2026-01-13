"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const CATALOG_PATH = path.join(__dirname, "..", "..", "data", "catalog.json");

let openai = null;

function initOpenAI() {
  if (openai) return openai;
  if (!process.env.OPENAI_API_KEY) return null;
  
  try {
    const OpenAI = require("openai");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai;
  } catch (e) {
    console.error("[PAWSY-QA] Failed to init OpenAI:", e.message);
    return null;
  }
}

function loadCatalog() {
  try {
    const rawData = fs.readFileSync(CATALOG_PATH, "utf-8");
    const catalog = JSON.parse(rawData);
    return Array.isArray(catalog) ? catalog : (catalog.products || []);
  } catch (e) {
    console.error("[PAWSY-QA] Failed to load catalog:", e.message);
    return [];
  }
}

function findProduct(products, slug) {
  return products.find(p => p.slug === slug || p.id === slug);
}

function findRecommendations(products, current, limit = 3) {
  if (!current) return [];
  
  const price = Number(current.price || 0);
  const minPrice = price * 0.75;
  const maxPrice = price * 1.25;

  return products
    .filter(p => {
      if (p.slug === current.slug || p.id === current.id) return false;
      if (p.active === false) return false;
      if (current.category && p.category !== current.category) return false;
      const pPrice = Number(p.price || 0);
      return pPrice >= minPrice && pPrice <= maxPrice;
    })
    .slice(0, limit)
    .map(p => p.slug);
}

function getFallbackAnswer(question, product) {
  const q = question.toLowerCase();
  
  if (q.includes("safe") || q.includes("puppy") || q.includes("kitten")) {
    return `This ${product?.title || 'product'} is designed with pet safety in mind. However, for puppies and kittens under 6 months, we always recommend consulting your veterinarian before introducing new products. They can provide personalized advice based on your pet's specific needs and health status.`;
  }
  
  if (q.includes("size") || q.includes("fit")) {
    return `For the best fit, we recommend measuring your pet before ordering. For beds and carriers, measure your pet from nose to tail while they're lying down and add 4-6 inches. For clothing and accessories, check the size chart on the product page. When in doubt, size up for comfort!`;
  }
  
  if (q.includes("alternative") || q.includes("recommend") || q.includes("similar")) {
    return `Great question! Check out our recommendations below for similar products in the same category and price range. You can also browse our category pages to discover more options for your furry friend.`;
  }
  
  if (q.includes("ship") || q.includes("delivery")) {
    return `We offer fast shipping within the United States! Most orders arrive within 5-7 business days. Free shipping is available on orders over $50. You can track your order anytime using the confirmation email we send after purchase.`;
  }
  
  if (q.includes("return") || q.includes("refund")) {
    return `We want you and your pet to be happy! If something isn't right, contact us within 30 days of delivery for assistance with returns or exchanges. Items must be unused and in original packaging.`;
  }
  
  return `Thanks for your question about ${product?.title || 'this product'}! This is a quality pet product designed for comfort and durability. If you have specific concerns, our customer support team is happy to help, or consult your veterinarian for health-related questions.`;
}

async function getAIAnswer(question, product) {
  const client = initOpenAI();
  if (!client) {
    return getFallbackAnswer(question, product);
  }

  const productContext = product ? `
Product: ${product.title}
Category: ${product.category || 'Pet Supplies'}
Price: $${product.price}
Description: ${product.description || product.seo?.description || 'Quality pet product'}
${product.highlights ? `Highlights: ${product.highlights.join(', ')}` : ''}
${product.shipping_profile ? `Shipping: Ships from ${product.shipping_profile.origin || 'US'}, estimated ${product.shipping_profile.eta_days || 5} days` : ''}
` : '';

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are Pawsy, a friendly and knowledgeable pet shop assistant for GetPawsy. Answer questions concisely and helpfully in US English. Keep responses under 150 words. NEVER provide medical diagnoses - always suggest consulting a veterinarian for health concerns. Focus on product features, general pet care tips, and shopping assistance."
        },
        {
          role: "user",
          content: `${productContext}\n\nCustomer question: ${question}`
        }
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    return response.choices[0]?.message?.content || getFallbackAnswer(question, product);
  } catch (e) {
    console.error("[PAWSY-QA] OpenAI error:", e.message);
    return getFallbackAnswer(question, product);
  }
}

router.post("/api/pawsy/ask", async (req, res) => {
  try {
    const { slug, question } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Question is required" });
    }

    const products = loadCatalog();
    const product = slug ? findProduct(products, slug) : null;
    
    const answer = await getAIAnswer(question, product);
    const suggestions = findRecommendations(products, product);

    res.json({
      answer,
      suggestions,
      product_context: product ? {
        title: product.title,
        slug: product.slug,
        price: product.price
      } : null
    });
  } catch (e) {
    console.error("[PAWSY-QA] Error:", e.message);
    res.status(500).json({ 
      error: "Something went wrong",
      answer: "I'm having trouble right now. Please try again in a moment!"
    });
  }
});

module.exports = router;
