const OpenAI = require("openai");
const { log } = require("./logger");
const { classifyIntent, hasRedFlags, detectLanguage } = require("./pawsyIntentClassifier");
const { searchProducts, getRelatedProducts, getCrossSellProducts, getProductPrice } = require("./pawsyProductSearch");
const { getPolicy, getShippingInfo, getReturnsInfo, getSupportInfo, getStoreIdentity } = require("./pawsyStorePolicies");
const { retrieveContext, formatContextForLLM, extractProductIdsFromContext } = require("./aiRetrieval");
const { db } = require("./db");

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_PRODUCTS = parseInt(process.env.PAWSY_AI_MAX_PRODUCTS || "6");
const API_KEY = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
const API_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
const ENABLED = process.env.PAWSY_AI_ENABLED !== "false" && !!API_KEY;

let client = null;
if (API_KEY) {
  const config = { apiKey: API_KEY };
  if (API_BASE) config.baseURL = API_BASE;
  client = new OpenAI(config);
  log(`[Pawsy RAG] Initialized with model: ${MODEL}, ENABLED=${ENABLED}`);
} else {
  log(`[Pawsy RAG] Disabled - No API key found`);
}

function getSystemPrompt(language) {
  const storeInfo = getStoreIdentity(language);
  
  if (language === "nl") {
    return `Je bent Pawsy 🐾, de AI winkelassistent en huisdierexpert voor ${storeInfo.name}.

BELANGRIJKE REGELS:
1. Antwoord ALTIJD in het Nederlands (zelfde taal als de klant)
2. VERZIN NOOIT producten - toon alleen producten uit de verstrekte PRODUCTEN sectie
3. Wees behulpzaam, vriendelijk en beknopt (2-4 zinnen)
4. Voor gezondheidsadviezen: geef alleen algemene begeleiding, adviseer dierenarts voor ernstige zorgen

WINKELINFO:
${storeInfo.about}

WANNEER JE PRODUCTEN AANBEVEELT:
- Gebruik ALLEEN producten uit de PRODUCTEN sectie
- Noem de exacte prijzen
- Leg kort uit waarom elk product past bij hun vraag

VEILIGHEIDSREGELS VOOR GEZONDHEIDSVRAGEN:
- Stel NOOIT diagnoses
- Geef alleen algemene informatie
- Adviseer bij zorgwekkende symptomen een dierenarts
- Voeg toe: "Ik ben geen dierenarts" disclaimer

RODE VLAG SYMPTOMEN (adviseer onmiddellijk dierenarts):
- Ademhalingsproblemen, herhaald braken, bloed in ontlasting/braaksel
- Aanvallen, ernstige sloomheid, opgezwollen buik
- Kan niet plassen, in elkaar zakken, plotselinge verlamming
- Vermoedelijke vergiftiging`;
  }
  
  return `You are Pawsy 🐾, the AI shopping assistant and pet expert for ${storeInfo.name}.

IMPORTANT RULES:
1. ALWAYS respond in English (same language as the customer)
2. NEVER invent products - only show products from the provided PRODUCTS section
3. Be helpful, friendly, and concise (2-4 sentences)
4. For health questions: provide general guidance only, advise vet for serious concerns

STORE INFO:
${storeInfo.about}

WHEN RECOMMENDING PRODUCTS:
- Use ONLY products from the PRODUCTS section
- Include exact prices
- Briefly explain why each product fits their needs

SAFETY RULES FOR HEALTH QUESTIONS:
- NEVER diagnose conditions
- Provide general information only
- For concerning symptoms, advise consulting a veterinarian
- Include: "I'm not a vet" disclaimer

RED FLAG SYMPTOMS (advise immediate vet visit):
- Trouble breathing, repeated vomiting, blood in stool/vomit
- Seizures, severe lethargy, bloated belly
- Unable to urinate, collapse, sudden paralysis
- Suspected poisoning`;
}

function formatProductsForLLM(products, language) {
  if (!products || products.length === 0) return "";
  
  const header = language === "nl" ? "BESCHIKBARE PRODUCTEN:" : "AVAILABLE PRODUCTS:";
  
  const productList = products.map(p => {
    const price = getProductPrice(p);
    return `- ${p.title} ($${price.toFixed(2)}) [ID: ${p.id}]`;
  }).join("\n");
  
  return `${header}\n${productList}`;
}

function formatStoreInfoForLLM(intent, language) {
  let info = "";
  
  if (intent === "STORE_INFO") {
    info += language === "nl" ? "WINKELBELEID:\n" : "STORE POLICIES:\n";
    info += `Shipping: ${getShippingInfo(language)}\n`;
    info += `Returns: ${getReturnsInfo(language)}\n`;
    info += `Support: ${getSupportInfo(language)}\n`;
  }
  
  return info;
}

async function askPawsyRAG(message, catalogProducts, options = {}) {
  try {
    const intentResult = classifyIntent(message);
    const { intent, language: detectedLang, petType, categoryHints, priceMax, isHealthConcern, hasRedFlags: redFlags } = intentResult;
    
    const language = options.language || detectedLang || 'en';
    
    log(`[Pawsy RAG] Processing: "${message.substring(0, 50)}..." Intent: ${intent} Language: ${language} (visitor: ${options.language || 'none'})`);
    
    let products = [];
    let relatedProducts = [];
    let crossSellProducts = [];
    let ragContext = null;
    let policyInfo = "";
    
    if (intent === "PRODUCT_SEARCH" || intent === "PRODUCT_RECOMMENDATION") {
      products = await searchProducts({
        query: message,
        petType,
        categoryHints,
        priceMax,
        limit: MAX_PRODUCTS
      });
      
      if (products.length > 0) {
        relatedProducts = await getRelatedProducts(products[0], 3);
        crossSellProducts = await getCrossSellProducts(products[0], 2);
      }
      
      log(`[Pawsy RAG] Product search: ${products.length} results, ${relatedProducts.length} related, ${crossSellProducts.length} cross-sell`);
    }
    
    if (intent === "STORE_INFO") {
      policyInfo = formatStoreInfoForLLM(intent, language);
    }
    
    if (!client || !ENABLED) {
      return buildFallbackResponse(message, intent, language, products, relatedProducts, crossSellProducts, isHealthConcern, redFlags);
    }
    
    let retrieval = { docs: [] };
    if (["PRODUCT_SEARCH", "PRODUCT_RECOMMENDATION", "STORE_INFO", "GENERAL_PET_KNOWLEDGE"].includes(intent)) {
      try {
        retrieval = await retrieveContext(message, 6);
        log(`[Pawsy RAG] Retrieved ${retrieval.docs?.length || 0} context docs`);
      } catch (err) {
        log(`[Pawsy RAG] RAG retrieval error: ${err.message}`);
      }
    }
    
    const systemPrompt = getSystemPrompt(language);
    let userPrompt = language === "nl" 
      ? `Klantvraag: "${message}"\n\n`
      : `Customer question: "${message}"\n\n`;
    
    if (redFlags) {
      userPrompt += language === "nl"
        ? `⚠️ DRINGENDE GEZONDHEIDSZORG GEDETECTEERD - Adviseer onmiddellijk dierenarts.\n\n`
        : `⚠️ URGENT HEALTH CONCERN DETECTED - Advise immediate vet visit.\n\n`;
    } else if (isHealthConcern) {
      userPrompt += language === "nl"
        ? `Gezondheidsvraag gedetecteerd - Volg veiligheidsregels, geef alleen algemene begeleiding.\n\n`
        : `Health question detected - Follow safety rules, provide general guidance only.\n\n`;
    }
    
    if (products.length > 0) {
      userPrompt += formatProductsForLLM(products, language) + "\n\n";
    }
    
    if (policyInfo) {
      userPrompt += policyInfo + "\n\n";
    }
    
    if (retrieval.docs?.length > 0) {
      userPrompt += formatContextForLLM(retrieval) + "\n\n";
    }
    
    if (intent === "PRODUCT_SEARCH" || intent === "PRODUCT_RECOMMENDATION") {
      if (products.length > 0) {
        userPrompt += language === "nl"
          ? `Antwoord met geldige JSON:
{
  "reply": "Jouw behulpzame antwoord waarin je specifieke producten en prijzen uit de PRODUCTEN sectie noemt",
  "recommendedProducts": [
    { "id": "product_id_from_list", "reason": "Waarom dit past" }
  ]
}
Neem 1-6 producten op die het beste bij hun vraag passen. Gebruik ALLEEN product ID's uit de PRODUCTEN sectie hierboven.`
          : `Respond with valid JSON:
{
  "reply": "Your helpful response mentioning specific products and prices from the PRODUCTS section",
  "recommendedProducts": [
    { "id": "product_id_from_list", "reason": "Why this fits" }
  ]
}
Include 1-6 products that best match their query. Use ONLY product IDs from the PRODUCTS section above.`;
      } else {
        userPrompt += language === "nl"
          ? `Geen producten gevonden voor deze zoekopdracht. Antwoord met geldige JSON:
{
  "reply": "Leg vriendelijk uit dat je geen exacte match hebt gevonden en stel 1 verduidelijkende vraag",
  "followupQuestions": ["Een relevante vervolgvraag?"]
}`
          : `No products found for this search. Respond with valid JSON:
{
  "reply": "Kindly explain you don't have an exact match and ask 1 clarifying question",
  "followupQuestions": ["A relevant follow-up question?"]
}`;
      }
    } else if (intent === "STORE_INFO") {
      userPrompt += language === "nl"
        ? `Beantwoord de vraag over winkelbeleid met de informatie hierboven. Antwoord met geldige JSON:
{
  "reply": "Jouw antwoord met nauwkeurige beleidsinformatie"
}`
        : `Answer the store policy question using the info above. Respond with valid JSON:
{
  "reply": "Your response with accurate policy information"
}`;
    } else if (intent === "PET_ADVICE" || intent === "GENERAL_PET_KNOWLEDGE") {
      userPrompt += language === "nl"
        ? `Antwoord met geldige JSON:
{
  "reply": "Jouw behulpzaam huisdieradvies",
  "followupQuestions": ["Relevante vervolgvraag?"]
}
Voeg alleen producten toe als ze direct relevant zijn.`
        : `Respond with valid JSON:
{
  "reply": "Your helpful pet advice response",
  "followupQuestions": ["Relevant follow-up question?"]
}
Only include products if directly relevant.`;
    } else {
      userPrompt += language === "nl"
        ? `Antwoord met geldige JSON:
{
  "reply": "Jouw vriendelijke antwoord"
}`
        : `Respond with valid JSON:
{
  "reply": "Your friendly response"
}`;
    }
    
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 700,
      temperature: 0.7
    });

    const content = response.choices[0]?.message?.content || "";
    log(`[Pawsy RAG] Raw response: ${content.substring(0, 100)}...`);
    
    return parseAndValidateResponse(content, {
      intent,
      language,
      products,
      relatedProducts,
      crossSellProducts,
      catalogProducts,
      isHealthConcern,
      hasRedFlags: redFlags,
      ragDocsUsed: retrieval.docs?.length || 0
    });
    
  } catch (err) {
    log(`[Pawsy RAG] API Error: ${err.message}`);
    console.error("[Pawsy RAG Error]", err.message);
    
    const language = detectLanguage(message);
    const intentResult = classifyIntent(message);
    
    return buildFallbackResponse(message, intentResult.intent, language, [], [], [], intentResult.isHealthConcern, intentResult.hasRedFlags);
  }
}

function parseAndValidateResponse(content, context) {
  const { intent, language, products, relatedProducts, crossSellProducts, catalogProducts, isHealthConcern, hasRedFlags, ragDocsUsed } = context;
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        reply: content.replace(/```json|```/g, '').trim() || getDefaultReply(language),
        intent,
        language,
        recommendedProducts: products.slice(0, MAX_PRODUCTS),
        relatedProducts: relatedProducts.slice(0, 3),
        crossSellProducts: crossSellProducts.slice(0, 2),
        followupQuestions: [],
        isHealthConcern,
        hasRedFlags,
        ragContext: { docsUsed: ragDocsUsed }
      };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    let recommendedProducts = [];
    if (Array.isArray(parsed.recommendedProducts) && parsed.recommendedProducts.length > 0) {
      const productMap = new Map(products.map(p => [p.id, p]));
      recommendedProducts = parsed.recommendedProducts
        .filter(p => p.id && productMap.has(p.id))
        .map(p => {
          const catalogProduct = productMap.get(p.id);
          return {
            ...catalogProduct,
            reason: p.reason || ""
          };
        })
        .slice(0, MAX_PRODUCTS);
    }
    
    if (recommendedProducts.length === 0 && products.length > 0) {
      recommendedProducts = products.slice(0, MAX_PRODUCTS);
    }
    
    const followupQuestions = Array.isArray(parsed.followupQuestions)
      ? parsed.followupQuestions.slice(0, 4)
      : [];
    
    let reply = parsed.reply || parsed.replyText || getDefaultReply(language);
    reply = validatePricesInReply(reply, products);
    
    return {
      reply,
      intent,
      language,
      recommendedProducts,
      relatedProducts: relatedProducts.slice(0, 3),
      crossSellProducts: crossSellProducts.slice(0, 2),
      followupQuestions,
      isHealthConcern,
      hasRedFlags,
      ragContext: { docsUsed: ragDocsUsed }
    };
  } catch (parseErr) {
    log(`[Pawsy RAG] JSON parse error: ${parseErr.message}`);
    return {
      reply: content.replace(/```json|```/g, '').trim() || getDefaultReply(language),
      intent,
      language,
      recommendedProducts: products.slice(0, MAX_PRODUCTS),
      relatedProducts: relatedProducts.slice(0, 3),
      crossSellProducts: crossSellProducts.slice(0, 2),
      followupQuestions: [],
      isHealthConcern,
      hasRedFlags,
      ragContext: { docsUsed: ragDocsUsed }
    };
  }
}

function buildFallbackResponse(message, intent, language, products, relatedProducts, crossSellProducts, isHealthConcern, hasRedFlags) {
  let reply;
  
  if (intent === "PRODUCT_SEARCH" || intent === "PRODUCT_RECOMMENDATION") {
    if (products.length > 0) {
      reply = language === "nl"
        ? `Ik heb ${products.length} producten gevonden die bij je zoekopdracht passen! Bekijk de opties hieronder.`
        : `I found ${products.length} products that match your search! Check out the options below.`;
    } else {
      reply = language === "nl"
        ? `Ik kon geen exacte match vinden. Kun je me meer vertellen over wat je zoekt?`
        : `I couldn't find an exact match. Can you tell me more about what you're looking for?`;
    }
  } else if (intent === "STORE_INFO") {
    reply = language === "nl"
      ? `${getShippingInfo(language)} Voor meer vragen, neem contact op via ${getSupportInfo(language)}`
      : `${getShippingInfo(language)} For more questions, reach out via ${getSupportInfo(language)}`;
  } else if (hasRedFlags) {
    reply = language === "nl"
      ? `Dit klinkt als een urgente situatie. Neem alsjeblieft onmiddellijk contact op met een dierenarts. Ik ben geen dierenarts en kan geen medisch advies geven voor ernstige symptomen.`
      : `This sounds like an urgent situation. Please contact a veterinarian immediately. I'm not a vet and cannot provide medical advice for serious symptoms.`;
  } else if (isHealthConcern) {
    reply = language === "nl"
      ? `Voor gezondheidszorgen raad ik je aan om een dierenarts te raadplegen. Ik ben geen dierenarts, maar ik help je graag met productaanbevelingen of algemene verzorgingstips.`
      : `For health concerns, I recommend consulting a veterinarian. I'm not a vet, but I'm happy to help with product recommendations or general care tips.`;
  } else {
    reply = language === "nl"
      ? `Hoe kan ik je vandaag helpen? Ik kan producten aanbevelen, huisdieradvies geven, of je helpen met winkelinfo.`
      : `How can I help you today? I can recommend products, give pet advice, or help with store info.`;
  }
  
  return {
    reply,
    intent,
    language,
    recommendedProducts: products.slice(0, MAX_PRODUCTS),
    relatedProducts: relatedProducts.slice(0, 3),
    crossSellProducts: crossSellProducts.slice(0, 2),
    followupQuestions: [],
    isHealthConcern,
    hasRedFlags,
    ragContext: { docsUsed: 0 }
  };
}

function getDefaultReply(language) {
  return language === "nl"
    ? "Hoe kan ik je vandaag helpen?"
    : "How can I help you today?";
}

function validatePricesInReply(reply, products) {
  const pricePattern = /\$(\d+(?:\.\d{2})?)/g;
  const matches = [...reply.matchAll(pricePattern)];
  
  if (matches.length === 0) return reply;
  
  const catalogPrices = new Set();
  products.forEach(p => {
    const price = getProductPrice(p);
    if (price) catalogPrices.add(price.toFixed(2));
  });
  
  for (const match of matches) {
    const mentionedPrice = match[1];
    if (!catalogPrices.has(mentionedPrice) && !catalogPrices.has(parseFloat(mentionedPrice).toFixed(2))) {
      log(`[Pawsy RAG] Warning: Price $${mentionedPrice} not found in product list`);
    }
  }
  
  return reply;
}

function isEnabled() {
  return !!(client && ENABLED);
}

module.exports = { askPawsyRAG, isEnabled };
