/**
 * Pawsy AI Sales Agent V3
 * Uses OpenAI function calling for actionable capabilities
 * Tools: search_products, add_to_cart, view_product, get_recommendations
 */

const OpenAI = require("openai");
const { log } = require("./logger");

const ENABLED = process.env.PAWSY_AI_ENABLED === "true";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const API_KEY = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
const API_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;

let client = null;
if (ENABLED && API_KEY) {
  const config = { apiKey: API_KEY };
  if (API_BASE) config.baseURL = API_BASE;
  client = new OpenAI(config);
  log(`[Pawsy V3] Initialized with model: ${MODEL}`);
} else {
  log(`[Pawsy V3] Disabled - PAWSY_AI_ENABLED=${ENABLED}, API_KEY=${API_KEY ? 'present' : 'missing'}`);
}

const LANG_NAMES = {
  en: "English",
  nl: "Dutch",
  de: "German",
  fr: "French",
  es: "Spanish"
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Search for products in the shop. Use this when a customer is looking for products, asking about product availability, or has shopping intent. Returns matching products with prices and images.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query - can include product type, pet type (dog/cat), category, or keywords"
          },
          category: {
            type: "string",
            enum: ["dogs", "cats", "toys", "beds", "carriers", "grooming", "collars", "treats", "bowls", "climbing"],
            description: "Filter by specific category (optional)"
          },
          maxPrice: {
            type: "number",
            description: "Maximum price filter in USD (optional)"
          },
          limit: {
            type: "integer",
            description: "Maximum number of products to return (default 4, max 8)"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Add a product to the shopping cart. Use this when a customer explicitly wants to buy or add something to their cart.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "The product ID to add to cart"
          },
          quantity: {
            type: "integer",
            description: "Quantity to add (default 1)"
          },
          variantId: {
            type: "string",
            description: "Optional variant ID if product has variants (size/color)"
          }
        },
        required: ["productId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "view_product",
      description: "Navigate to a product detail page. Use when customer wants to see more details about a specific product.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "The product ID to view"
          }
        },
        required: ["productId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Get detailed information about a specific product including variants, description, and availability.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "The product ID to get details for"
          }
        },
        required: ["productId"]
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "get_recommendations",
      description: "Get personalized product recommendations based on context. Use for upsells, related items, or when customer needs suggestions.",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description: "Context for recommendations - e.g., 'new kitten owner', 'dog toy lover', 'birthday gift for cat'"
          },
          petType: {
            type: "string",
            enum: ["dog", "cat", "both"],
            description: "Type of pet (optional)"
          },
          budget: {
            type: "string",
            enum: ["budget", "mid-range", "premium"],
            description: "Price range preference (optional)"
          }
        },
        required: ["context"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "view_cart",
      description: "Open the shopping cart drawer. Use when customer wants to see their cart, checkout, or review items.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate_category",
      description: "Navigate to a category page. Use when customer wants to browse a specific category.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["dogs", "cats", "toys", "beds", "carriers", "grooming", "collars", "treats", "bowls", "climbing"],
            description: "Category to navigate to"
          }
        },
        required: ["category"]
      }
    }
  }
];

function getSystemPrompt(language = 'en') {
  const langInstruction = language !== 'en' && LANG_NAMES[language]
    ? `\n\nIMPORTANT: Always respond in ${LANG_NAMES[language]}. The customer prefers ${LANG_NAMES[language]}.`
    : '';
    
  return `You are Pawsy, the AI sales assistant for GetPawsy pet shop. You're friendly, helpful, and knowledgeable about pets.

YOUR ROLE:
- Help customers find and purchase pet products
- Use your tools to search, recommend, and add products to cart
- Answer questions about pets (dogs/cats) using general knowledge
- Be concise, warm, and action-oriented

TOOL USAGE:
- Use search_products when customers ask about products, prices, or availability
- Use add_to_cart when they want to buy something (after confirming which product)
- Use view_product to show product details when they want to learn more
- Use get_recommendations for personalized suggestions
- Use view_cart when they want to see their cart or checkout
- Use navigate_category when they want to browse a category

RULES:
1. Always confirm before adding to cart - show the product first
2. Keep responses SHORT (2-3 sentences max)
3. Be proactive - suggest related items when appropriate
4. For health questions: give general advice + recommend vet for diagnosis
5. Never diagnose medical conditions - redirect to veterinarians
6. Use emojis sparingly (1-2 per message max)

RED FLAGS (urgent vet needed):
- Trouble breathing, seizures, collapse
- Repeated vomiting, blood in stool
- Suspected poisoning
→ Say: "This sounds urgent - please contact your vet immediately."${langInstruction}`;
}

function searchProducts(query, products, options = {}) {
  const { category, maxPrice, limit = 4 } = options;
  const lower = query.toLowerCase();
  const keywords = lower.split(/\s+/).filter(w => w.length > 2);
  
  let filtered = products.filter(p => p.active !== false);
  
  if (category) {
    filtered = filtered.filter(p => {
      const pCat = (p.category || '').toLowerCase();
      return pCat.includes(category.toLowerCase());
    });
  }
  
  if (maxPrice) {
    filtered = filtered.filter(p => {
      const price = p.price || (p.variants?.[0]?.price) || 0;
      return price <= maxPrice;
    });
  }
  
  const scored = filtered.map(p => {
    let score = 0;
    const title = (p.title || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    const pCat = (p.category || '').toLowerCase();
    
    keywords.forEach(kw => {
      if (title.includes(kw)) score += 4;
      if (desc.includes(kw)) score += 2;
      if (pCat.includes(kw)) score += 3;
    });
    
    if (/dog|puppy/.test(lower) && /dog/.test(pCat)) score += 5;
    if (/cat|kitten/.test(lower) && /cat/.test(pCat)) score += 5;
    if (/toy/.test(lower) && /toy/.test(pCat)) score += 3;
    if (/bed/.test(lower) && /bed/.test(pCat)) score += 3;
    if (/treat/.test(lower) && /treat/.test(pCat)) score += 3;
    
    return { product: p, score };
  });
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limit, 8))
    .map(s => formatProduct(s.product));
}

function formatProduct(p) {
  const price = p.price || (p.variants?.[0]?.price) || 0;
  const hasVariants = p.variants && p.variants.length > 0;
  
  let variantInfo = null;
  if (hasVariants) {
    const sizes = new Set();
    const colors = new Set();
    p.variants.forEach(v => {
      if (v.options?.Size) sizes.add(v.options.Size);
      if (v.options?.Color) colors.add(v.options.Color);
    });
    if (sizes.size > 0 || colors.size > 0) {
      variantInfo = {
        sizes: Array.from(sizes),
        colors: Array.from(colors)
      };
    }
  }
  
  return {
    id: p.id,
    title: p.title,
    price: price,
    priceFormatted: `$${price.toFixed(2)}`,
    image: p.image || p.mainImage || (p.images?.[0]) || null,
    category: p.category,
    hasVariants,
    variantInfo,
    inStock: p.stock !== 0
  };
}

function getRecommendations(context, products, options = {}) {
  const { petType, budget } = options;
  const lower = context.toLowerCase();
  
  let filtered = products.filter(p => p.active !== false);
  
  if (petType && petType !== 'both') {
    filtered = filtered.filter(p => {
      const pCat = (p.category || '').toLowerCase();
      return pCat.includes(petType);
    });
  }
  
  if (budget === 'budget') {
    filtered = filtered.filter(p => (p.price || 0) < 20);
  } else if (budget === 'premium') {
    filtered = filtered.filter(p => (p.price || 0) >= 30);
  }
  
  const keywords = lower.split(/\s+/).filter(w => w.length > 2);
  const scored = filtered.map(p => {
    let score = Math.random() * 2;
    const title = (p.title || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    
    keywords.forEach(kw => {
      if (title.includes(kw)) score += 3;
      if (desc.includes(kw)) score += 1;
    });
    
    return { product: p, score };
  });
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(s => formatProduct(s.product));
}

function getProductDetails(productId, products) {
  const product = products.find(p => p.id === productId);
  if (!product) return null;
  
  const formatted = formatProduct(product);
  return {
    ...formatted,
    description: product.description || '',
    images: product.images || [product.image || product.mainImage].filter(Boolean),
    variants: product.variants || []
  };
}

function executeToolCall(toolName, args, products) {
  log(`[Pawsy V3] Executing tool: ${toolName} with args: ${JSON.stringify(args)}`);
  
  switch (toolName) {
    case 'search_products':
      return {
        action: 'search_results',
        products: searchProducts(args.query, products, {
          category: args.category,
          maxPrice: args.maxPrice,
          limit: args.limit || 4
        })
      };
      
    case 'add_to_cart':
      return {
        action: 'add_to_cart',
        productId: args.productId,
        quantity: args.quantity || 1,
        variantId: args.variantId || null
      };
      
    case 'view_product':
      return {
        action: 'navigate',
        url: `/product/${args.productId}`,
        productId: args.productId
      };
      
    case 'get_product_details':
      const details = getProductDetails(args.productId, products);
      return {
        action: 'product_details',
        product: details
      };
      
    case 'get_recommendations':
      return {
        action: 'recommendations',
        products: getRecommendations(args.context, products, {
          petType: args.petType,
          budget: args.budget
        })
      };
      
    case 'view_cart':
      return {
        action: 'open_cart'
      };
      
    case 'navigate_category':
      return {
        action: 'navigate',
        url: `/category/${args.category}`,
        category: args.category
      };
      
    default:
      return { action: 'unknown' };
  }
}

async function askPawsyV3(message, products, options = {}) {
  if (!client || !ENABLED) {
    log(`[Pawsy V3] Skipped - client=${!!client}, enabled=${ENABLED}`);
    return null;
  }
  
  const { language = 'en', conversationHistory = [] } = options;
  const systemPrompt = getSystemPrompt(language);
  
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: "user", content: message }
  ];
  
  try {
    log(`[Pawsy V3] Processing: "${message.substring(0, 50)}..." | Lang: ${language}`);
    
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 500,
      temperature: 0.7
    });
    
    const assistantMessage = response.choices[0]?.message;
    const toolCalls = assistantMessage?.tool_calls || [];
    
    if (toolCalls.length > 0) {
      const toolResults = [];
      const actions = [];
      
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          log(`[Pawsy V3] Tool args parse error: ${e.message}`);
        }
        
        const result = executeToolCall(toolName, toolArgs, products);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result)
        });
        actions.push(result);
      }
      
      const followUpMessages = [
        ...messages,
        assistantMessage,
        ...toolResults
      ];
      
      const followUpResponse = await client.chat.completions.create({
        model: MODEL,
        messages: followUpMessages,
        max_tokens: 300,
        temperature: 0.7
      });
      
      const reply = followUpResponse.choices[0]?.message?.content || "Here's what I found!";
      
      const recommendedProducts = actions
        .filter(a => a.products)
        .flatMap(a => a.products)
        .slice(0, 4);
      
      const primaryAction = actions.find(a => 
        ['add_to_cart', 'navigate', 'open_cart'].includes(a.action)
      );
      
      return {
        reply,
        intent: 'SHOPPING_INTENT',
        recommendedProducts,
        actions,
        primaryAction,
        toolsUsed: toolCalls.map(t => t.function.name),
        followupQuestions: []
      };
      
    } else {
      const reply = assistantMessage?.content || "I'm Pawsy! How can I help you today?";
      
      return {
        reply,
        intent: detectIntent(message),
        recommendedProducts: [],
        actions: [],
        primaryAction: null,
        toolsUsed: [],
        followupQuestions: []
      };
    }
    
  } catch (err) {
    log(`[Pawsy V3] API Error: ${err.message}`);
    console.error("[Pawsy V3 Error]", err.message);
    return null;
  }
}

function detectIntent(message) {
  const lower = message.toLowerCase();
  
  if (/buy|purchase|add to cart|order|get|want to buy/.test(lower)) return 'ADD_TO_CART';
  if (/cart|basket|checkout|pay/.test(lower)) return 'VIEW_CART';
  if (/show|find|search|looking for|recommend|suggest/.test(lower)) return 'SHOPPING_INTENT';
  if (/sick|vet|health|symptom|diagnos/.test(lower)) return 'HEALTH_CONCERN';
  if (/hi|hello|hey/.test(lower)) return 'GREETING';
  
  return 'OTHER_GENERAL';
}

function isEnabled() {
  return !!(client && ENABLED);
}

module.exports = { 
  askPawsyV3, 
  isEnabled,
  searchProducts,
  getRecommendations,
  getProductDetails,
  formatProduct,
  TOOLS
};
