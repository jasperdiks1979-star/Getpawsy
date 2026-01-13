const OpenAI = require("openai");
const { log } = require("./logger");
const { classifyIntent, hasRedFlags } = require("./pawsyIntentClassifier");

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
  log(`[Pawsy Hybrid] Initialized with model: ${MODEL}`);
} else {
  log(`[Pawsy Hybrid] Disabled - PAWSY_AI_ENABLED=${ENABLED}, API_KEY=${API_KEY ? 'present' : 'missing'}`);
}

const LANG_NAMES = {
  en: "English",
  nl: "Dutch",
  de: "German"
};

function getSystemPrompt(language = 'en') {
  const langInstruction = language !== 'en' && LANG_NAMES[language]
    ? `\n\nIMPORTANT: Respond in ${LANG_NAMES[language]}. The visitor prefers ${LANG_NAMES[language]} language.`
    : '';
    
  return `You are Pawsy 🐾, the AI assistant for GetPawsy pet shop.
You can answer:
(1) questions about this webshop using the provided shop context, and
(2) general questions about pets (dogs/cats) even if unrelated to the shop.

RULES:
- If the user is shopping or asking about products/shipping/returns, you MUST ground answers in shop context and NEVER invent products.
- If the user asks general pet questions, answer helpfully using general knowledge. Do not claim to be a veterinarian.
- For medical concerns: provide safe general guidance and escalation rules.
- Be concise, friendly, and practical. Ask clarifying questions when needed.
- Keep responses to 2-4 sentences max.

SAFETY RULES FOR HEALTH QUESTIONS:
- Never diagnose conditions or prescribe treatments
- Provide general information only
- For symptoms, ask 2-4 clarifying questions: age, breed, how long, severity, eating/drinking, energy level
- Always include: "I'm not a vet, so please consult a veterinarian for proper diagnosis."

RED FLAG ESCALATION (urgent vet needed):
- Trouble breathing, repeated vomiting, blood in stool/vomit
- Seizures, severe lethargy, bloat/swollen belly
- Inability to urinate, collapse, sudden paralysis
- Suspected poisoning (chocolate, xylitol, grapes, etc.)
→ Advise: "This sounds urgent - please contact your vet or emergency animal hospital immediately."${langInstruction}`;
}

const HYBRID_SYSTEM_PROMPT = getSystemPrompt('en');

const SHOPPING_CONTEXT_TEMPLATE = `
SHOP CONTEXT (use this to answer product questions):
Products available:
{PRODUCTS}

Shipping: US-based, typically 3-7 business days
Returns: 30-day return policy for unused items
Payment: Secure checkout with all major cards`;

const HEALTH_CLARIFYING_QUESTIONS = [
  "How old is your pet?",
  "What breed are they?",
  "How long has this been going on?",
  "Are they eating and drinking normally?",
  "Have you noticed any other symptoms?"
];

function selectRelevantProducts(message, products) {
  if (!products || products.length === 0) return [];
  
  const lower = message.toLowerCase();
  const keywords = lower.split(/\s+/).filter(w => w.length > 2);
  
  const scored = products.map(p => {
    let score = 0;
    const title = (p.title || "").toLowerCase();
    const desc = (p.description || "").toLowerCase();
    const category = (p.category || "").toLowerCase();
    const tags = (p.tags || []).join(" ").toLowerCase();
    
    keywords.forEach(kw => {
      if (title.includes(kw)) score += 3;
      if (desc.includes(kw)) score += 2;
      if (category.includes(kw)) score += 2;
      if (tags.includes(kw)) score += 1;
    });
    
    if (/dog|puppy|canine/.test(lower) && /dog/.test(category)) score += 5;
    if (/cat|kitten|feline/.test(lower) && /cat/.test(category)) score += 5;
    if (/toy/.test(lower) && /toy/.test(category)) score += 3;
    if (/bed|sleep/.test(lower) && /bed/.test(category)) score += 3;
    if (/food|treat/.test(lower) && /food|treat/.test(category)) score += 3;
    
    return { product: p, score };
  });
  
  return scored
    .filter(s => s.score > 0)
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
      price: minPrice === maxPrice ? `$${minPrice.toFixed(2)}` : `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`,
      category: p.category || "general",
      variants: variantsSummary || "Standard",
      image: p.image
    };
  });
}

function buildUserPrompt(message, intent, products, isHealthConcern, redFlags) {
  let prompt = `User message: "${message}"\n\n`;
  
  if (intent === "SHOPPING_INTENT" && products.length > 0) {
    const productList = products.map(p => 
      `- ${p.title} (${p.price}) [ID: ${p.id}] - ${p.category}`
    ).join("\n");
    prompt += `Available products matching their query:\n${productList}\n\n`;
    prompt += `Respond with valid JSON:
{
  "reply": "Your helpful response (2-4 sentences)",
  "recommendedProducts": [
    { "id": "product_id", "title": "Name", "price": 0.00, "image": "url", "reason": "Why this fits" }
  ]
}
Include 1-3 product recommendations if relevant. Use exact product IDs from the list.`;
  } else if (intent === "PET_GENERAL") {
    if (redFlags) {
      prompt += `⚠️ RED FLAGS DETECTED - This may be urgent!\n`;
      prompt += `Advise immediate vet/emergency visit. Be calm but clear about urgency.\n\n`;
    } else if (isHealthConcern) {
      prompt += `Health concern detected. Follow safety rules:\n`;
      prompt += `- Give general info only (no diagnosis)\n`;
      prompt += `- Ask 2-3 clarifying questions\n`;
      prompt += `- Include "I'm not a vet" disclaimer\n\n`;
    }
    
    if (products.length > 0) {
      const productList = products.slice(0, 3).map(p => 
        `- ${p.title} (${p.price}) [ID: ${p.id}]`
      ).join("\n");
      prompt += `Optional relevant products (only suggest if truly helpful):\n${productList}\n\n`;
    }
    
    prompt += `Respond with valid JSON:
{
  "reply": "Your helpful response (2-4 sentences)",
  "followupQuestions": ["Question 1?", "Question 2?"],
  "recommendedProducts": []
}
Only include products if genuinely relevant to their pet care question.`;
  } else {
    prompt += `Respond with valid JSON:
{
  "reply": "Your friendly, helpful response (1-2 sentences)"
}`;
  }
  
  return prompt;
}

async function askPawsyHybrid(message, products, options = {}) {
  if (!client || !ENABLED) {
    log(`[Pawsy Hybrid] Skipped - client=${!!client}, enabled=${ENABLED}`);
    return null;
  }
  
  try {
    const { language = 'en' } = options;
    const intentResult = classifyIntent(message);
    const { intent, isHealthConcern, hasRedFlags: redFlags } = intentResult;
    
    log(`[Pawsy Hybrid] Processing: "${message.substring(0, 50)}..." Intent: ${intent} | Lang: ${language}`);
    
    let relevantProducts = [];
    if (intent === "SHOPPING_INTENT") {
      relevantProducts = selectRelevantProducts(message, products);
    } else if (intent === "PET_GENERAL" && !isHealthConcern) {
      relevantProducts = selectRelevantProducts(message, products).slice(0, 3);
    }
    
    const productContext = buildProductContext(relevantProducts);
    const userPrompt = buildUserPrompt(message, intent, productContext, isHealthConcern, redFlags);
    const systemPrompt = getSystemPrompt(language);
    
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 600,
      temperature: 0.7
    });

    const content = response.choices[0]?.message?.content || "";
    log(`[Pawsy Hybrid] Raw response: ${content.substring(0, 100)}...`);
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          reply: content.replace(/```json|```/g, '').trim() || "I'm Pawsy! How can I help you today?",
          intent,
          recommendedProducts: [],
          followupQuestions: []
        };
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      const recommendedProducts = Array.isArray(parsed.recommendedProducts) 
        ? parsed.recommendedProducts.slice(0, 3).map(p => ({
            id: p.id,
            title: p.title || "",
            price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0,
            image: p.image || "",
            reason: p.reason || ""
          }))
        : (Array.isArray(parsed.suggestions) 
            ? parsed.suggestions.slice(0, 3).map(s => ({
                id: s.id,
                title: s.title || "",
                price: typeof s.price === 'number' ? s.price : parseFloat(s.price) || 0,
                image: s.image || "",
                reason: s.reason || ""
              }))
            : []);
      
      const followupQuestions = Array.isArray(parsed.followupQuestions)
        ? parsed.followupQuestions.slice(0, 4)
        : [];
      
      return {
        reply: parsed.reply || parsed.replyText || "I'm Pawsy! Ask me anything about pets or our shop.",
        intent,
        recommendedProducts,
        followupQuestions,
        isHealthConcern,
        hasRedFlags: redFlags
      };
    } catch (parseErr) {
      log(`[Pawsy Hybrid] JSON parse error: ${parseErr.message}`);
      return {
        reply: content.replace(/```json|```/g, '').trim() || "I'm Pawsy! How can I help you today?",
        intent,
        recommendedProducts: [],
        followupQuestions: []
      };
    }
  } catch (err) {
    log(`[Pawsy Hybrid] API Error: ${err.message}`);
    console.error("[Pawsy Hybrid Error]", err.message);
    return null;
  }
}

function isEnabled() {
  return !!(client && ENABLED);
}

module.exports = { askPawsyHybrid, isEnabled, classifyIntent };
