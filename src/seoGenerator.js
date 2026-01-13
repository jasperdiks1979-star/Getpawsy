const OpenAI = require("openai");
const { log } = require("./logger");
const { db } = require("./db");
const { getSeoLocalized, upsertSeoLocalized } = require("./aiDatabase");
const { retrieveContext, formatContextForLLM } = require("./aiRetrieval");
const { getShippingInfo, getReturnsInfo, getStoreIdentity } = require("./pawsyStorePolicies");
const { 
  SEO_POLICY, 
  detectPetType, 
  detectDepartment, 
  sanitizeContent, 
  buildSeoPromptRules, 
  validateSeoOutput,
  generateSlug
} = require("./seoPolicy");

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const API_KEY = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
const API_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;

let client = null;
if (API_KEY) {
  const config = { apiKey: API_KEY };
  if (API_BASE) config.baseURL = API_BASE;
  client = new OpenAI(config);
  log(`[SEO Generator] Initialized with model: ${MODEL}`);
} else {
  log(`[SEO Generator] Disabled - No API key found`);
}

const LOCALE_NAMES = {
  "en-US": "English (US)",
  "nl-NL": "Dutch (Netherlands)",
  "de-DE": "German (Germany)",
  "fr-FR": "French (France)",
  "es-ES": "Spanish (Spain)"
};

const TONE_PRESETS = {
  friendly: "friendly, warm, and approachable tone that pet owners love",
  premium: "premium, sophisticated tone that emphasizes quality and care",
  playful: "playful, fun tone with pet-related wordplay where appropriate",
  minimal: "clean, minimal tone focusing on key product benefits"
};

function getProductPrice(product) {
  if (product.variants && product.variants.length > 0) {
    const prices = product.variants.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
    if (prices.length > 0) return Math.min(...prices);
  }
  return parseFloat(product.price) || 0;
}

function buildProductContext(product) {
  const price = getProductPrice(product);
  const parts = [
    `Product: ${product.title}`,
    `Price: $${price.toFixed(2)}`,
    product.description ? `Description: ${product.description}` : null,
    product.category ? `Category: ${product.category}` : null,
    product.petType ? `Pet Type: ${product.petType}` : null,
    product.brand ? `Brand: ${product.brand}` : null,
    product.tags ? `Tags: ${Array.isArray(product.tags) ? product.tags.join(", ") : product.tags}` : null
  ];
  
  if (product.variants && product.variants.length > 0) {
    const variantInfo = product.variants.slice(0, 5).map(v => {
      const vPrice = parseFloat(v.price) || price;
      return `${v.title || v.name}: $${vPrice.toFixed(2)}`;
    }).join("; ");
    parts.push(`Variants: ${variantInfo}`);
  }
  
  if (product.materials) parts.push(`Materials: ${product.materials}`);
  if (product.dimensions) parts.push(`Dimensions: ${product.dimensions}`);
  if (product.weight) parts.push(`Weight: ${product.weight}`);
  
  return parts.filter(Boolean).join("\n");
}

function getSystemPrompt(locale, tonePreset = "friendly", product = null) {
  const localeName = LOCALE_NAMES[locale] || locale;
  const tone = TONE_PRESETS[tonePreset] || TONE_PRESETS.friendly;
  const storeInfo = getStoreIdentity(locale.split("-")[0]);
  const policyRules = buildSeoPromptRules();
  
  const petType = product ? detectPetType(product) : "both";
  const department = product ? detectDepartment(product) : "accessories";
  
  return `You are an SEO content generator for ${storeInfo.name}, a premium US pet supplies store.

CRITICAL RULES:
1. ALL output MUST be in ${localeName} language
2. NEVER invent product claims not in the source data:
   - Do NOT claim "waterproof", "vet-approved", "FDA certified", "eco-friendly" unless explicitly stated
   - Do NOT invent materials, dimensions, or specifications
   - Use safe phrasing like "Designed for..." instead of specific claims
3. Use a ${tone}

${policyRules}

DETECTED PRODUCT CONTEXT:
- Pet Type: ${petType}
- Department: ${department}

OUTPUT FORMAT:
Return valid JSON with these exact fields:
{
  "seo_title": "SEO title (30-60 chars, Title Case, no emoji)",
  "meta_description": "Meta description (120-155 chars, include CTA)",
  "slug": "lowercase-hyphenated-slug",
  "h1": "H1 heading for product page (max 70 chars)",
  "bullets": ["benefit-focused bullet 1", "benefit-focused bullet 2", ...],
  "faqs": [{"q": "Question?", "a": "Answer."}, ...],
  "alt_texts": [{"imageUrl": "main", "alt": "GetPawsy [pet] [product] - [feature]"}],
  "og_title": "OpenGraph title",
  "og_description": "OpenGraph description",
  "keywords_primary": ["3-6 main keywords"],
  "keywords_secondary": ["6-12 secondary keywords"],
  "category": {"pet": "${petType}", "department": "${department}"}
}`;
}

function buildJsonLd(product, seoData, locale) {
  const price = getProductPrice(product);
  const storeInfo = getStoreIdentity(locale.split("-")[0]);
  
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": seoData.h1 || product.title,
    "description": seoData.meta_description || product.description,
    "brand": {
      "@type": "Brand",
      "name": product.brand || storeInfo.name
    },
    "offers": {
      "@type": "Offer",
      "price": price,
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "seller": {
        "@type": "Organization",
        "name": storeInfo.name
      }
    },
    "category": product.category || "Pet Supplies"
  };
}

async function generateSeoForProduct(productId, locale, tonePreset = "friendly") {
  if (!client) {
    log(`[SEO Generator] No API client available`);
    return { error: "SEO generation not available - no API key configured" };
  }
  
  const product = await db.getProduct(productId);
  if (!product) {
    return { error: `Product ${productId} not found` };
  }
  
  log(`[SEO Generator] Generating SEO for product "${product.title}" in ${locale}`);
  
  const petType = detectPetType(product);
  const department = detectDepartment(product);
  log(`[SEO Generator] Detected: pet=${petType}, dept=${department}`);
  
  const productContext = buildProductContext(product);
  
  let ragContext = "";
  try {
    const retrieval = await retrieveContext(`${product.title} ${product.category || ""}`, 3);
    if (retrieval.docs?.length > 0) {
      ragContext = formatContextForLLM(retrieval);
    }
  } catch (err) {
    log(`[SEO Generator] RAG retrieval error: ${err.message}`);
  }
  
  const systemPrompt = getSystemPrompt(locale, tonePreset, product);
  const userPrompt = `Generate SEO content for this product:

${productContext}

${ragContext ? `ADDITIONAL CONTEXT FROM KNOWLEDGE BASE:\n${ragContext}\n` : ""}

Remember:
- Output must be in ${LOCALE_NAMES[locale] || locale}
- Only use facts from the product data above
- Include 4-6 benefit-focused bullet points (max 90 chars each)
- Include 3-5 FAQ pairs
- SEO title: 30-60 characters, Title Case
- Meta description: 120-155 characters, include CTA
- Slug: lowercase, hyphens, no stopwords

Return valid JSON only.`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 1800,
      temperature: 0.7
    });
    
    const content = response.choices[0]?.message?.content || "";
    log(`[SEO Generator] Raw response length: ${content.length}`);
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log(`[SEO Generator] Failed to parse JSON from response`);
      return { error: "Failed to parse SEO content" };
    }
    
    let parsed = JSON.parse(jsonMatch[0]);
    
    if (parsed.seo_title) {
      parsed.seo_title = sanitizeContent(parsed.seo_title);
      if (parsed.seo_title.length > 60) {
        parsed.seo_title = parsed.seo_title.substring(0, 57) + "...";
      }
    }
    
    if (parsed.meta_description) {
      parsed.meta_description = sanitizeContent(parsed.meta_description);
      if (parsed.meta_description.length > 155) {
        parsed.meta_description = parsed.meta_description.substring(0, 152) + "...";
      }
    }
    
    if (!parsed.slug && product.title) {
      parsed.slug = generateSlug(product.title);
    }
    
    const validation = validateSeoOutput(parsed);
    if (!validation.valid) {
      log(`[SEO Generator] Validation issues: ${validation.issues.join(", ")}`);
    }
    
    const jsonld = buildJsonLd(product, parsed, locale);
    
    const allKeywords = [
      ...(parsed.keywords_primary || parsed.keywords || []),
      ...(parsed.keywords_secondary || [])
    ];
    
    return {
      seo_title: parsed.seo_title,
      meta_description: parsed.meta_description,
      slug: parsed.slug,
      h1: parsed.h1,
      bullets_json: JSON.stringify(parsed.bullets || []),
      faqs_json: JSON.stringify(parsed.faqs || []),
      alt_texts_json: JSON.stringify(parsed.alt_texts || []),
      og_title: parsed.og_title,
      og_description: parsed.og_description,
      jsonld: JSON.stringify(jsonld),
      keywords_json: JSON.stringify(allKeywords),
      keywords_primary_json: JSON.stringify(parsed.keywords_primary || []),
      keywords_secondary_json: JSON.stringify(parsed.keywords_secondary || []),
      detected_pet_type: petType,
      detected_department: department,
      validation: validation,
      status: "draft"
    };
    
  } catch (err) {
    log(`[SEO Generator] API error: ${err.message}`);
    return { error: `Generation failed: ${err.message}` };
  }
}

async function generateAndSaveSeo(productId, locale, tonePreset = "friendly", overwriteUnlockedOnly = true) {
  const generated = await generateSeoForProduct(productId, locale, tonePreset);
  
  if (generated.error) {
    return generated;
  }
  
  // Primary: Save to data/db.json (product.seo field)
  try {
    const { productStore } = require("./productStore");
    const seoData = {
      locale,
      seoTitle: generated.seo_title,
      metaDescription: generated.meta_description,
      h1: generated.h1,
      ogTitle: generated.og_title,
      ogDescription: generated.og_description,
      bullets_json: generated.bullets_json,
      faqs_json: generated.faqs_json,
      keywords_json: generated.keywords_json,
      alt_texts_json: generated.alt_texts_json,
      jsonld: generated.jsonld,
      published: false,
      updatedAt: new Date().toISOString()
    };
    
    productStore.updateProductSeo(productId, seoData);
    log(`[SEO Generator] Saved SEO to JSON for product ${productId} in ${locale}`);
  } catch (jsonErr) {
    log(`[SEO Generator] JSON save error (non-fatal): ${jsonErr.message}`);
  }
  
  // Secondary: Try to save to PostgreSQL (may fail in safe mode)
  try {
    const saved = await upsertSeoLocalized(productId, locale, generated);
    log(`[SEO Generator] Saved SEO to Postgres for product ${productId} in ${locale}`);
    return { success: true, data: saved };
  } catch (err) {
    log(`[SEO Generator] Postgres save skipped: ${err.message}`);
    return { success: true, data: generated, source: 'json' };
  }
}

async function bulkGenerateSeo(options = {}) {
  const { locale = "en-US", categoryFilter, limit = 50, tonePreset = "friendly", skipExisting = true } = options;
  
  const allProducts = await db.listProducts();
  let products = allProducts.filter(p => p.active === true || p.status === "active");
  
  if (categoryFilter) {
    products = products.filter(p => 
      p.category && p.category.toLowerCase().includes(categoryFilter.toLowerCase())
    );
  }
  
  products = products.slice(0, limit);
  
  const results = {
    total: products.length,
    generated: 0,
    skipped: 0,
    errors: []
  };
  
  for (const product of products) {
    if (skipExisting) {
      const existing = await getSeoLocalized(product.id, locale);
      if (existing && existing.status === "published") {
        results.skipped++;
        continue;
      }
    }
    
    const result = await generateAndSaveSeo(product.id, locale, tonePreset);
    
    if (result.error) {
      results.errors.push({ productId: product.id, error: result.error });
    } else {
      results.generated++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  log(`[SEO Generator] Bulk generation complete: ${results.generated} generated, ${results.skipped} skipped, ${results.errors.length} errors`);
  return results;
}

function isEnabled() {
  return !!client;
}

module.exports = {
  generateSeoForProduct,
  generateAndSaveSeo,
  bulkGenerateSeo,
  isEnabled,
  LOCALE_NAMES,
  TONE_PRESETS
};
