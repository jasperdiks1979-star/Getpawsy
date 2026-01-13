const OpenAI = require("openai");
const { log } = require("./logger");

const ENABLED = process.env.PAWSY_AI_ENABLED === "true";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_PRODUCTS = parseInt(process.env.PAWSY_AI_MAX_PRODUCTS || "8");
const API_KEY = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
const API_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;

let client = null;
if (ENABLED && API_KEY) {
  const config = { apiKey: API_KEY };
  if (API_BASE) config.baseURL = API_BASE;
  client = new OpenAI(config);
  log(`[Pawsy LLM] Initialized with model: ${MODEL}`);
} else {
  log(`[Pawsy LLM] Disabled - PAWSY_AI_ENABLED=${ENABLED}, API_KEY=${API_KEY ? 'present' : 'missing'}`);
}

function selectRelevantProducts(message, products) {
  if (!products || products.length === 0) return [];
  
  const lower = message.toLowerCase();
  const keywords = lower.split(/\s+/).filter(w => w.length > 2);
  
  const scored = products.map(p => {
    let score = 0;
    const title = (p.title || "").toLowerCase();
    const desc = (p.description || "").toLowerCase();
    const category = (p.category || "").toLowerCase();
    
    keywords.forEach(kw => {
      if (title.includes(kw)) score += 3;
      if (desc.includes(kw)) score += 2;
      if (category.includes(kw)) score += 2;
    });
    
    if (/dog|puppy|canine/.test(lower) && /dog/.test(category)) score += 5;
    if (/cat|kitten|feline/.test(lower) && /cat/.test(category)) score += 5;
    
    if (p.variants && p.variants.length > 0) {
      p.variants.forEach(v => {
        if (v.options) {
          Object.values(v.options).forEach(opt => {
            if (opt && opt.toLowerCase().includes(lower)) score += 1;
          });
        }
      });
    }
    
    return { product: p, score };
  });
  
  return scored
    .filter(s => s.score > 0 || products.length <= MAX_PRODUCTS)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PRODUCTS)
    .map(s => s.product);
}

function buildProductContext(products) {
  return products.map(p => {
    const minPrice = p.variants && p.variants.length > 0
      ? Math.min(...p.variants.map(v => v.price || 0))
      : (p.price || 0);
    
    const maxPrice = p.variants && p.variants.length > 0
      ? Math.max(...p.variants.map(v => v.price || 0))
      : (p.price || 0);
    
    let variantsSummary = "";
    if (p.variants && p.variants.length > 0) {
      const sizes = new Set();
      const colors = new Set();
      p.variants.forEach(v => {
        if (v.options) {
          if (v.options.Size) sizes.add(v.options.Size);
          if (v.options.Color) colors.add(v.options.Color);
        }
      });
      const parts = [];
      if (sizes.size > 0) parts.push(`Sizes: ${Array.from(sizes).join(", ")}`);
      if (colors.size > 0) parts.push(`Colors: ${Array.from(colors).join(", ")}`);
      variantsSummary = parts.join(" | ");
    }
    
    return {
      id: p.id,
      title: p.title,
      price_min: minPrice,
      price_max: maxPrice,
      category: p.category || "general",
      variants: variantsSummary || "Standard",
      shipping_note: p.shipping_note || "3-7 business days",
      image: p.image
    };
  });
}

async function askPawsyLLM(message, products) {
  if (!client || !ENABLED) {
    log(`[Pawsy LLM] Skipped - client=${!!client}, enabled=${ENABLED}`);
    return null;
  }
  
  try {
    log(`[Pawsy LLM] Processing: "${message.substring(0, 50)}..."`);
    
    const relevant = selectRelevantProducts(message, products);
    const context = buildProductContext(relevant);
    
    const systemPrompt = `You are Pawsy, a friendly pet product assistant for GetPawsy pet shop.

Your personality: Helpful, casual, warm, concise. Use simple language.

What you can help with:
- Product recommendations for dogs and cats
- Product variants (sizes, colors, options)
- Pricing information
- Shipping (US-based, typically 3-7 business days)
- General pet care advice (non-medical)

Rules:
- Keep responses to 1-3 sentences
- Never make medical claims - suggest consulting a vet for health issues
- Never promise specific shipping dates beyond "3-7 business days"
- If you don't know something, say so honestly
- When recommending products, include up to 3 suggestions`;

    const userPrompt = `Customer question: "${message}"

Available products (most relevant to their question):
${JSON.stringify(context, null, 2)}

Respond with valid JSON only:
{
  "reply": "Your friendly response here (1-3 sentences)",
  "suggestions": [
    {
      "id": "product_id",
      "title": "Product Title",
      "price": 0.00,
      "image": "image_url",
      "reason": "Brief reason for recommendation"
    }
  ]
}

Maximum 3 suggestions. If no products are relevant, return empty suggestions array.`;

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const content = response.choices[0]?.message?.content || "";
    log(`[Pawsy LLM] Raw response: ${content.substring(0, 100)}...`);
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        log(`[Pawsy LLM] No JSON found in response`);
        return {
          reply: content.replace(/```json|```/g, '').trim() || "I'm Pawsy! How can I help with pet products today?",
          suggestions: []
        };
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      log(`[Pawsy LLM] Parsed reply: ${(parsed.reply || "").substring(0, 50)}...`);
      
      const suggestions = Array.isArray(parsed.suggestions) 
        ? parsed.suggestions.slice(0, 3).map(s => ({
            id: s.id,
            title: s.title || "",
            price: s.price || 0,
            image: s.image || "",
            reason: s.reason || ""
          }))
        : [];
      
      return {
        reply: parsed.reply || "I'm Pawsy! Ask me about our pet products.",
        suggestions
      };
    } catch (parseErr) {
      log(`[Pawsy LLM] JSON parse error: ${parseErr.message}`);
      return {
        reply: content.replace(/```json|```/g, '').trim() || "I'm Pawsy! Ask me about products, shipping, or pet advice.",
        suggestions: []
      };
    }
  } catch (err) {
    log(`[Pawsy LLM] API Error: ${err.message}`);
    console.error("[Pawsy LLM Error]", err.message);
    return null;
  }
}

module.exports = { askPawsyLLM };
