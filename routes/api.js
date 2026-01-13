const express = require("express");
const axios = require("axios");
const router = express.Router();
const cart = require("./api/cart");
const checkout = require("./api/checkout");
const auth = require("./api/auth/index.js");
const payment = require("./api/payment/index.js");
const adminOrders = require("./api/admin/orders.js");
const profile = require("./api/profile/index.js");
const productAdmin = require("./api/admin/products/index.js");
const searchApi = require("./api/search/index.js");
const { requireAuth } = require("../middleware/auth");

const productCatalog = require("../services/productCatalog");
const { purgeNonPetProducts, petOnlyGuard } = require("../src/petSafetyNet");
const { requireAdminSession } = require("../src/adminAuth");
const { getHomepageSections, getHomepageStats } = require("../helpers/topProducts");

const SMALL_PETS_BLOCKED_SLUGS = [
  "korean-style-sweet-and-cute-bunny-ear-plush-hat",
  "easter-bunny-shaped-decorative-creative-resin-craft-ornaments",
  "bunny-stuffed-toy-95cm-white-8124",
  "brazilian-bunny-chocolate-color-long-lasting-moisturizing-lip-gloss",
  "transform-into-a-milk-tea-pig-plush-toy-cute-little-bunny",
  "womens-thickened-coral-fleece-winter-cute-bunny-pajamas",
  "baby-sweet-bunny-romper-ruffle-trim-onesie-with-adjustable-straps-snap-closure",
  "2d-ribbon-bunny-ears-hood-with-bow-and-pearl-decoration-cute-versatile-long-slee",
  "bunny-suction-cup-hook-random",
  "bunny-headband-4111",
  "1-led-bunnyfat-bearstupid-bearchestnut-bearduck-night-lightcute-rainbow-light-ch",
  "cute-cupcake-liners-wrappers-with-plastic-spoons-bunny-flower-pattern-paper-baki",
  "cute-pig-long-plush-pillow-bunny-doll",
  "pastoral-style-girl-floral-bunny-washed-cotton-bedding"
];

function isSmallPetsBlockedSlug(product) {
  const slug = String(product?.slug || product?.handle || "").toLowerCase();
  return SMALL_PETS_BLOCKED_SLUGS.includes(slug);
}

router.get("/sync-cj", async (req, res) => {
  try {
    console.log("[API] Starting CJ product sync...");
    const result = await productCatalog.syncFromCJ({
      maxPages: parseInt(req.query.pages) || 3,
      pageSize: parseInt(req.query.pageSize) || 200
    });
    res.json({ 
      success: true, 
      message: `Synced ${result.count} products from CJdropshipping`,
      ...result 
    });
  } catch (err) {
    console.error("[API] CJ sync error:", err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      hint: "Check CJ_EMAIL and CJ_API_KEY secrets"
    });
  }
});

router.get("/catalog/stats", (req, res) => {
  res.json(productCatalog.getCatalogStats());
});

router.get("/import-cj", async (req, res) => {
  res.redirect("/api/sync-cj");
});

// Cart API Routes
router.get("/cart", cart.getCart);
router.post("/cart/add", cart.addItem);
router.post("/cart/update", cart.updateQty);
router.post("/cart/remove", cart.removeItem);

// Checkout API Routes
router.post("/checkout/submit", checkout.submitOrder);

// Auth API Routes
router.post("/auth/register", auth.register);
router.post("/auth/login", auth.login);
router.get("/auth/verify", auth.verify);

// Payment API Routes
router.post("/payment/process", payment.process);

// Admin API Routes
const { getCookieOptions, getAdminApiToken, safeEqual, COOKIE_NAME, SESSION_TTL_MS } = require("../src/adminAuth");

router.post("/admin/login", express.json(), (req, res) => {
  const expected = getAdminApiToken();
  if (!expected) {
    return res.status(500).json({ ok: false, error: "ADMIN_API_TOKEN_NOT_SET" });
  }
  const token = String(req.body?.token || "").trim();
  if (!token) {
    return res.status(400).json({ ok: false, error: "MISSING_TOKEN" });
  }
  if (!safeEqual(token, expected)) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED_ADMIN" });
  }
  res.cookie(COOKIE_NAME, token, getCookieOptions(req));
  console.log("[AdminAuth] Login successful, cookie set");
  return res.json({ ok: true, message: "Logged in successfully" });
});

router.post("/admin/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  console.log("[AdminAuth] Logout, cookie cleared");
  return res.json({ ok: true, message: "Logged out" });
});

router.get("/admin/ping", (req, res) => {
  const expected = getAdminApiToken();
  const provided = req.cookies?.[COOKIE_NAME] || 
    (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null) ||
    req.headers["x-admin-token"];
  
  const isValid = expected && provided && safeEqual(provided, expected);
  res.json({ 
    ok: isValid, 
    ts: new Date().toISOString(),
    authenticated: isValid,
    method: isValid ? (req.cookies?.[COOKIE_NAME] ? "cookie" : "header") : null
  });
});

router.get("/admin/orders", adminOrders.list);
router.get("/admin/order/:id", adminOrders.get);
router.post("/admin/order/status", adminOrders.updateStatus);

// Profile API Routes (protected with auth middleware)
router.get("/profile/orders", requireAuth, profile.orders);
router.get("/profile/addresses", requireAuth, profile.addresses);
router.post("/profile/address/add", requireAuth, profile.addAddress);
router.get("/profile/wishlist", requireAuth, profile.wishlist);
router.post("/profile/wishlist/add", requireAuth, profile.addWishlist);
router.post("/profile/wishlist/remove", requireAuth, profile.removeWishlist);
router.delete("/profile/wishlist", requireAuth, profile.removeWishlist);
router.post("/profile/reviews/add", requireAuth, profile.addReview);

// Public reviews endpoint (viewing reviews doesn't require auth)
router.get("/profile/reviews", profile.reviews);

// Product Admin API Routes
router.get("/admin/products", productAdmin.list);
router.get("/admin/product/:id", productAdmin.get);
router.post("/admin/product/add", productAdmin.add);
router.post("/admin/product/update", productAdmin.update);
router.post("/admin/product/delete", productAdmin.delete);

// Search API Routes
router.get("/search/query", searchApi.query);
router.get("/search/suggest", searchApi.suggest);

// Product API Routes (for cart V4)
const fs = require("fs");
const path = require("path");

function loadProducts() {
  return { products: productCatalog.loadProducts(), bundles: [] };
}

router.get("/product/:id", async (req, res) => {
  const productId = req.params.id;
  
  const product = productCatalog.getProductById(productId);
  if (product) {
    return res.json({
      id: product.id,
      name: product.name || product.title,
      title: product.title || product.name,
      price: product.price,
      image: product.images ? product.images[0] : "/public/images/placeholder.png",
      images: product.images || ["/public/images/placeholder.png"],
      category: product.category || product.mainCategorySlug,
      variants: product.variants || [],
      optionTypes: product.optionTypes || [],
      hasVariants: product.hasVariants || (product.variants && product.variants.length > 1)
    });
  }
  
  res.status(404).json({ error: "Product not found" });
});

router.post("/cart/sync", cart.syncCart);
router.get("/cart", cart.getCart);
router.post("/cart/update", cart.updateQty);
router.post("/cart/remove", cart.removeItem);

function round99(x) {
  return Math.floor(x) + 0.99;
}

function computePriceUSD({ cost, shipping = 0, msrp = null }) {
  if (!cost || cost <= 0) return 9.99;
  let price;
  if (cost < 20) {
    price = round99(cost * 2.5 + shipping * 0.5);
  } else if (cost < 80) {
    price = round99(cost * 1.8 + Math.min(12, shipping));
  } else {
    price = round99(Math.min(cost + shipping + 60, msrp ? msrp * 0.95 : Infinity));
  }
  return Math.max(0.99, price);
}

router.get("/products", (req, res) => {
  const lang = req.query.lang || 'en';
  const category = req.query.category || null;
  const subcategory = req.query.subcategory || req.query.sub || null;
  const petType = req.query.petType || req.query.pet_type || null;
  // Higher limit (300) for pet_type/category filtered queries, 100 for general
  const maxLimit = (petType || category) ? 300 : 100;
  const limit = Math.min(parseInt(req.query.limit) || 24, maxLimit);
  const offset = parseInt(req.query.offset) || 0;
  const page = parseInt(req.query.page) || 1;
  const fields = req.query.fields || 'listing'; // 'listing' (lightweight) or 'full'
  
  let products = productCatalog.loadProducts();
  console.log(`[API/products] Loaded ${products.length} products, category=${category}, petType=${petType}, limit=${limit}, offset=${offset}`);
  
  if (category) {
    const normalizedCat = category.toLowerCase().replace(/[-\s]/g, '_');
    const isSmallPetsCat = ['small_pets', 'small_pet', 'smallpets', 'smallpet'].includes(normalizedCat);
    products = products.filter(p => {
      const pCat = (p.category || p.mainCategorySlug || '').toLowerCase().replace(/[-\s]/g, '_');
      const pPetType = (p.petType || p.pet_type || '').toLowerCase().replace(/[-\s]/g, '_');
      if (isSmallPetsCat) {
        return ['small_pets', 'small_pet', 'smallpets', 'smallpet'].includes(pPetType);
      }
      return pCat === normalizedCat || pPetType === normalizedCat;
    });
  }
  
  if (petType) {
    const normalizedPetType = petType.toLowerCase().replace(/[-\s]/g, '_');
    const isSmallPetType = ['small_pets', 'small_pet', 'smallpets', 'smallpet', 'small'].includes(normalizedPetType);
    products = products.filter(p => {
      const pPetType = (p.petType || p.pet_type || '').toLowerCase().replace(/[-\s]/g, '_');
      if (isSmallPetType) {
        return ['small_pets', 'small_pet', 'smallpets', 'smallpet', 'small'].includes(pPetType);
      }
      return pPetType === normalizedPetType;
    });
  }
  
  // ARCHITECTURE FIX: Server-side subcategory filtering (searches title, categories, tags)
  if (subcategory) {
    const normalizedSub = subcategory.toLowerCase().replace(/[-\s]/g, ' ');
    const subcatRoot = normalizedSub.replace(/s$/, ''); // toys -> toy
    const beforeCount = products.length;
    products = products.filter(p => {
      const pSub = (p.smallPetSubcategory || p.subcategory || '').toLowerCase().replace(/-/g, ' ');
      const pType = (p.smallPetType || '').toLowerCase().replace(/-/g, ' ');
      const pCategories = Array.isArray(p.categories) ? p.categories.join(' ').toLowerCase() : '';
      const title = (p.title || '').toLowerCase();
      const tags = Array.isArray(p.tags) ? p.tags.join(' ').toLowerCase() : '';
      
      // Exact match on subcategory fields
      if (pSub.includes(normalizedSub) || pType.includes(normalizedSub)) return true;
      if (pCategories.includes(normalizedSub)) return true;
      
      // Root word matching (toys -> toy)
      if (title.includes(subcatRoot) || pCategories.includes(subcatRoot) || tags.includes(subcatRoot)) {
        return true;
      }
      
      // Special cases for common subcategories
      if (normalizedSub === 'feeding' || normalizedSub === 'food') {
        return title.includes('food') || title.includes('feed') || title.includes('bowl') || 
               pCategories.includes('food') || pCategories.includes('feed') || pCategories.includes('feeder');
      }
      return false;
    });
    console.log(`[API/products] Subcategory=${subcategory}: ${beforeCount} -> ${products.length}`);
  }
  
  const normalizedPetType = (petType || category || '').toLowerCase().replace(/[-\s]/g, '_');
  const isSmallPetsQuery = ['small_pets', 'small_pet', 'smallpets', 'smallpet', 'small'].includes(normalizedPetType);
  
  if (isSmallPetsQuery) {
    const beforeDeny = products.length;
    products = products.filter(p => !isSmallPetsBlockedSlug(p));
    const deniedCount = beforeDeny - products.length;
    console.log(`[small-pets] incoming=${beforeDeny} after_deny=${products.length} denied=${deniedCount}`);
  }
  
  const totalCount = products.length;
  
  // Apply pagination: support both offset and page-based
  const actualOffset = offset > 0 ? offset : (page - 1) * limit;
  products = products.slice(actualOffset, actualOffset + limit);
  
  // Return lightweight listing fields for grid performance
  // CRITICAL FIX: Use catalog.json prices directly - NO dynamic recalculation!
  // The catalog already contains correctly marked-up retail prices.
  let items;
  if (fields === 'listing') {
    items = products.map(p => {
      // Get thumb image (first image, prefer smaller size)
      const images = p.images || [];
      const thumbImage = images[0] || p.image || '/images/placeholder-product.svg';
      
      // Use catalog price directly - already contains retail markup
      const catalogPrice = parseFloat(p.price) || 0;

      return {
        id: p.id,
        slug: p.slug || p.handle,
        title: p.title || p.name,
        price: catalogPrice,
        thumbImage: thumbImage,
        pet_type: p.pet_type || p.petType,
        variantCount: (p.variants || []).length,
        badges: p.badges || [],
        is_best_seller: p.is_best_seller || false,
        is_trending: p.is_trending || false
      };
    });
  } else {
    // Full response - return products as-is with catalog prices
    items = products.map(p => ({
      ...p,
      price: parseFloat(p.price) || 0
    }));
  }
  
  res.json({
    items,
    total: totalCount,
    limit,
    offset: actualOffset,
    page: Math.floor(actualOffset / limit) + 1,
    totalPages: Math.ceil(totalCount / limit),
    hasMore: actualOffset + products.length < totalCount,
    lang,
    category,
    subcategory
  });
});

router.get("/search", (req, res) => {
  const query = (req.query.q || "").toLowerCase();
  const v5Data = loadProducts();
  const results = v5Data.products.filter(p => 
    (p.name && p.name.toLowerCase().includes(query)) ||
    (p.category && p.category.toLowerCase().includes(query)) ||
    (p.tags && p.tags.some(t => t.toLowerCase().includes(query)))
  );
  res.json(results);
});

router.get("/social-proof/feed", (req, res) => {
  const v5Data = loadProducts();
  const randomProducts = v5Data.products.sort(() => 0.5 - Math.random()).slice(0, 5);
  const notifications = randomProducts.map(p => ({
    type: 'purchase',
    product: p.name,
    location: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami'][Math.floor(Math.random() * 5)],
    time: Math.floor(Math.random() * 30) + 1
  }));
  res.json({ notifications });
});

router.post("/social-proof/log", (req, res) => {
  res.json({ success: true });
});

// Pawsy AI Chatbot - Ultra V3
router.post("/pawsy-ultra-v3", async (req, res) => {
  try {
    const { prompt, context, history } = req.body || {};
    
    // Validate input
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        answer: "Please send me a message! I'm Pawsy, ready to help you find pet products! 🐾",
        error: "Missing or invalid prompt"
      });
    }
    
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      return res.json({ 
        answer: "Hey there! I'm Pawsy, your pet shopping assistant! 🐾 How can I help you find the perfect products for your furry friend today?"
      });
    }
    
    const products = productCatalog.loadProducts();
    
    // Get personality config
    let personality = {};
    try {
      const personalityPath = path.join(__dirname, '../data/pawsy_personality_v5.json');
      if (fs.existsSync(personalityPath)) {
        personality = JSON.parse(fs.readFileSync(personalityPath, 'utf8'));
      }
    } catch (e) {}

    // Build context about available products
    const productContext = products.slice(0, 20).map(p => 
      `${p.name} ($${p.price}) - ${p.category || 'pet'}`
    ).join(', ');

    // Check for product-related queries
    const lowerPrompt = cleanPrompt.toLowerCase();
    let matchedProducts = [];
    
    // Search products based on keywords in prompt
    const keywords = ['dog', 'cat', 'toy', 'bed', 'treat', 'collar', 'leash', 'grooming', 'bowl', 'carrier'];
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword)) {
        const matches = products.filter(p => 
          (p.name && p.name.toLowerCase().includes(keyword)) ||
          (p.category && p.category.toLowerCase().includes(keyword))
        );
        matchedProducts.push(...matches);
      }
    }
    matchedProducts = [...new Set(matchedProducts)].slice(0, 4);

    // Try AI response with OpenAI
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    let answer = "";
    let addToCart = null;

    if (apiKey) {
      try {
        const fetch = (await import('node-fetch')).default;
        const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1';
        
        const systemPrompt = `You are Pawsy, a friendly and enthusiastic AI shopping assistant for GetPawsy pet store.
${personality.personality ? `Your traits: ${personality.personality.traits?.join(', ')}` : ''}
${personality.personality ? `Tone: ${personality.personality.tone}` : 'Be upbeat and helpful!'}

Available products: ${productContext}

Rules:
- Keep responses concise (2-3 sentences max)
- Use pet emojis like 🐕 🐈 🐾 🦴
- If user asks about products, recommend from available inventory
- Be helpful and enthusiastic about pets
- If user wants to add something to cart, respond with the product recommendation`;

        const response = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: cleanPrompt }
            ],
            max_tokens: 200,
            temperature: 0.8
          })
        });

        const data = await response.json();
        answer = data.choices?.[0]?.message?.content || '';
      } catch (aiError) {
        console.log('AI call failed, using fallback:', aiError.message);
      }
    }

    // Fallback responses if AI is not available
    if (!answer) {
      const responses = personality.responses || {};
      const greetings = responses.greeting || ["Hey there! I'm Pawsy, your pet shopping assistant! 🐾"];
      
      if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi')) {
        answer = greetings[Math.floor(Math.random() * greetings.length)];
      } else if (lowerPrompt.includes('dog')) {
        answer = "Woof! I love dogs! 🐕 Check out our amazing dog toys, beds, and treats. What's your pup's favorite thing?";
      } else if (lowerPrompt.includes('cat')) {
        answer = "Meow! Cats are awesome! 😸 We have scratchers, cozy beds, and fun toys. What does your kitty enjoy?";
      } else if (lowerPrompt.includes('toy')) {
        answer = "Toys are so important for happy pets! 🎾 We've got interactive toys, plush toys, and chew toys. What type interests you?";
      } else if (lowerPrompt.includes('bed')) {
        answer = "Comfy beds for sweet dreams! 🛏️ We have orthopedic beds, donut beds, and cozy caves. What size does your pet need?";
      } else if (matchedProducts.length > 0) {
        answer = `Great question! I found some products you might love: ${matchedProducts.slice(0,3).map(p => p.name).join(', ')}. Want me to tell you more about any of these? 🐾`;
      } else {
        answer = "I'm here to help you find the perfect products for your furry friend! 🐾 Try asking about dog toys, cat beds, or any pet accessories!";
      }
    }

    // Check if user wants to add to cart
    if (lowerPrompt.includes('add') && lowerPrompt.includes('cart') && matchedProducts.length > 0) {
      addToCart = matchedProducts[0].id;
    }

    res.json({ 
      answer,
      addToCart,
      products: matchedProducts.length > 0 ? matchedProducts : undefined
    });
  } catch (err) {
    console.error('Pawsy AI error:', err);
    res.json({ 
      answer: "Oops! My brain got a little fuzzy there 🐾 Try asking again!",
      error: err.message
    });
  }
});

// Admin: Purge Non-Pet Products
router.post("/admin/purge-non-pet", requireAdminSession, async (req, res) => {
  try {
    console.log("[Admin] Starting non-pet product purge...");
    const productStore = require("../src/productStore");
    const products = productStore.listProducts({ activeOnly: false, animalUsedOnly: false });
    
    const { products: processedProducts, results } = purgeNonPetProducts(products);
    
    // Update each product in the store
    let updatedCount = 0;
    for (const product of processedProducts) {
      try {
        productStore.updateProduct(product.id, {
          is_pet_product: product.is_pet_product,
          status: product.status,
          pet_classification_reason: product.pet_classification_reason,
          pet_classification_confidence: product.pet_classification_confidence,
          needs_review: product.needs_review,
          hidden_from_storefront: product.hidden_from_storefront
        });
        updatedCount++;
      } catch (err) {
        console.error(`[Admin] Failed to update product ${product.id}:`, err.message);
      }
    }
    
    console.log(`[Admin] Purge complete: ${results.approved} approved, ${results.rejected} rejected`);
    
    res.json({
      success: true,
      message: `Purge complete: ${results.approved} pet products approved, ${results.rejected} non-pet products rejected`,
      results: {
        ...results,
        updatedCount
      }
    });
  } catch (err) {
    console.error("[Admin] Purge error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Get Pet Classification Stats
router.get("/admin/pet-stats", requireAdminSession, async (req, res) => {
  try {
    const productStore = require("../src/productStore");
    const products = productStore.listProducts({ activeOnly: false, animalUsedOnly: false });
    
    const stats = {
      total: products.length,
      petProducts: products.filter(p => p.is_pet_product === true).length,
      nonPetProducts: products.filter(p => p.is_pet_product === false).length,
      needsReview: products.filter(p => p.needs_review === true).length,
      active: products.filter(p => p.status === 'active' || p.active === true).length,
      rejected: products.filter(p => p.status === 'rejected').length,
      draft: products.filter(p => p.status === 'draft').length
    };
    
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Rebuild Pawsy Knowledge Index
router.post("/admin/rebuild-knowledge", requireAdminSession, async (req, res) => {
  try {
    console.log("[Admin] Starting Pawsy knowledge rebuild...");
    const { reindexFull } = require("../src/aiReindex");
    
    const stats = await reindexFull();
    
    console.log("[Admin] Knowledge rebuild complete:", stats);
    
    res.json({
      success: true,
      message: `Knowledge index rebuilt: ${stats.embedded} documents embedded`,
      stats
    });
  } catch (err) {
    console.error("[Admin] Knowledge rebuild error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Get Knowledge Stats
router.get("/admin/knowledge-stats", requireAdminSession, async (req, res) => {
  try {
    const { getEmbeddingsCount } = require("../src/aiDatabase");
    const count = await getEmbeddingsCount();
    
    res.json({
      success: true,
      stats: {
        embeddingsCount: count
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Import Pet Products from CJ (curated US warehouse list)
router.post("/admin/import-pet-products", requireAdminSession, async (req, res) => {
  try {
    console.log("[Admin] Starting CJ curated pet product import...");
    const { spawn } = require("child_process");
    const path = require("path");
    
    const resume = req.body.resume === true;
    const args = [path.join(__dirname, "..", "scripts", "import-cj-petlist-curated.js")];
    if (resume) args.push("--resume");
    
    const child = spawn("node", args, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env }
    });
    
    child.unref();
    
    res.json({
      success: true,
      message: `Curated pet product import started (250 products from US warehouse). Check logs for progress.`,
      pid: child.pid,
      resume
    });
  } catch (err) {
    console.error("[Admin] Import error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Get Import Failures CSV
router.get("/admin/import-failures", requireAdminSession, async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const failuresPath = path.join(__dirname, "..", "data", "cj-import-failures.json");
    
    if (!fs.existsSync(failuresPath)) {
      return res.json({ success: true, failures: [], count: 0 });
    }
    
    const data = JSON.parse(fs.readFileSync(failuresPath, "utf8"));
    
    if (req.query.format === "csv") {
      let csv = "product_id,title,reason,timestamp\n";
      for (const f of (data.failures || [])) {
        csv += `"${f.productId || ""}","${(f.title || "").replace(/"/g, '""')}","${(f.reason || "").replace(/"/g, '""')}","${f.timestamp || ""}"\n`;
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=import-failures.csv");
      return res.send(csv);
    }
    
    res.json({
      success: true,
      failures: data.failures || [],
      count: (data.failures || []).length,
      exportedAt: data.exportedAt
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: SEO for ALL products
router.post("/admin/seo-all", requireAdminSession, async (req, res) => {
  try {
    console.log("[Admin] Starting SEO generation for ALL products...");
    const seoBulkJob = require("../src/seoBulkJob");
    
    const status = seoBulkJob.getJobStatus();
    if (status.running) {
      return res.json({
        success: false,
        error: "SEO job already running",
        status
      });
    }
    
    const options = {
      mode: "all",
      overwrite: req.body.overwrite === true,
      batchSize: parseInt(req.body.batchSize) || 50,
      locale: req.body.locale || "en-US",
      tonePreset: req.body.tonePreset || "friendly",
      resume: req.body.resume === true
    };
    
    setImmediate(async () => {
      try {
        await seoBulkJob.runBulkSeoJob(options);
      } catch (err) {
        console.error("[Admin] SEO job error:", err);
      }
    });
    
    res.json({
      success: true,
      message: "SEO generation started for ALL products (no limit). Check status for progress.",
      options
    });
  } catch (err) {
    console.error("[Admin] SEO error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Get SEO Job Status
router.get("/admin/seo-status", requireAdminSession, async (req, res) => {
  try {
    const seoBulkJob = require("../src/seoBulkJob");
    const status = seoBulkJob.getJobStatus();
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Cancel SEO Job
router.post("/admin/seo-cancel", requireAdminSession, async (req, res) => {
  try {
    const seoBulkJob = require("../src/seoBulkJob");
    const cancelled = seoBulkJob.requestCancel();
    res.json({ success: true, cancelled });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Sync Pawsy Knowledge (Full Catalog)
router.post("/admin/sync-pawsy-knowledge", requireAdminSession, async (req, res) => {
  try {
    console.log("[Admin] Starting full Pawsy knowledge sync...");
    const { buildKnowledgeDocs } = require("../src/knowledgeDocs");
    const { reindexFull } = require("../src/aiReindex");
    
    const docs = await buildKnowledgeDocs();
    console.log(`[Admin] Built ${docs.length} knowledge documents`);
    
    const stats = await reindexFull();
    
    const fs = require("fs");
    const path = require("path");
    const syncStatePath = path.join(__dirname, "..", "data", "pawsy-sync-state.json");
    fs.writeFileSync(syncStatePath, JSON.stringify({
      lastSync: new Date().toISOString(),
      documentsCount: docs.length,
      embeddedCount: stats.embedded,
      stats
    }, null, 2));
    
    res.json({
      success: true,
      message: `Pawsy knowledge synced: ${docs.length} documents, ${stats.embedded} embedded`,
      documentsCount: docs.length,
      stats,
      lastSync: new Date().toISOString()
    });
  } catch (err) {
    console.error("[Admin] Pawsy sync error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Get Pawsy Sync Status
router.get("/admin/pawsy-sync-status", requireAdminSession, async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const syncStatePath = path.join(__dirname, "..", "data", "pawsy-sync-state.json");
    
    if (!fs.existsSync(syncStatePath)) {
      return res.json({ success: true, synced: false, lastSync: null });
    }
    
    const state = JSON.parse(fs.readFileSync(syncStatePath, "utf8"));
    res.json({ success: true, synced: true, ...state });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Reclassify Dogs/Cats Categories
router.post("/admin/reclassify-categories", requireAdminSession, async (req, res) => {
  try {
    console.log("[Admin] Starting category reclassification...");
    const productStore = require("../src/productStore");
    const products = productStore.listProducts({ activeOnly: false, animalUsedOnly: false });
    
    const DOG_KEYWORDS = ['dog', 'puppy', 'canine', 'pup', 'doggy', 'pooch'];
    const CAT_KEYWORDS = ['cat', 'kitten', 'feline', 'kitty'];
    
    let updated = 0;
    let dogCount = 0;
    let catCount = 0;
    let bothCount = 0;
    
    for (const product of products) {
      const text = `${product.title || ''} ${product.description || ''} ${(product.tags || []).join(' ')}`.toLowerCase();
      
      const hasDog = DOG_KEYWORDS.some(kw => text.includes(kw));
      const hasCat = CAT_KEYWORDS.some(kw => text.includes(kw));
      
      let mainCategorySlug = product.mainCategorySlug;
      let petType = product.petType;
      
      if (hasDog && hasCat) {
        mainCategorySlug = 'both';
        petType = 'both';
        bothCount++;
      } else if (hasDog) {
        mainCategorySlug = 'dogs';
        petType = 'dog';
        dogCount++;
      } else if (hasCat) {
        mainCategorySlug = 'cats';
        petType = 'cat';
        catCount++;
      } else {
        mainCategorySlug = 'other';
        petType = 'other';
      }
      
      if (mainCategorySlug !== product.mainCategorySlug || petType !== product.petType) {
        productStore.updateProduct(product.id, { mainCategorySlug, petType });
        updated++;
      }
    }
    
    console.log(`[Admin] Reclassification complete: ${updated} updated (Dogs: ${dogCount}, Cats: ${catCount}, Both: ${bothCount})`);
    
    res.json({
      success: true,
      message: `Reclassified ${updated} products`,
      stats: { updated, dogCount, catCount, bothCount, total: products.length }
    });
  } catch (err) {
    console.error("[Admin] Reclassification error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: CJ Inventory Sync
router.post("/admin/sync-inventory", requireAdminSession, async (req, res) => {
  try {
    const { syncInventory } = require("../src/cjInventorySync");
    console.log("[Admin] Starting CJ inventory sync...");
    
    const result = await syncInventory({
      batchSize: req.body.batchSize || 10,
      delayMs: req.body.delayMs || 500
    });
    
    if (result.ok) {
      res.json({
        success: true,
        message: `Synced inventory: ${result.results.updated} updated, ${result.results.outOfStock} now OOS`,
        ...result.results
      });
    } else {
      res.status(result.error === "Sync already in progress" ? 409 : 500).json({
        success: false,
        error: result.error,
        status: result.status
      });
    }
  } catch (err) {
    console.error("[Admin] Inventory sync error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/admin/inventory-status", requireAdminSession, async (req, res) => {
  try {
    const { getSyncStatus, getOutOfStockProducts } = require("../src/cjInventorySync");
    const status = getSyncStatus();
    const oosProducts = getOutOfStockProducts();
    
    res.json({
      success: true,
      ...status,
      outOfStockCount: oosProducts.length,
      outOfStockProducts: oosProducts.slice(0, 50)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Rebuild Image Cache (pre-warm thumbnails)
router.post("/admin/rebuild-image-cache", requireAdminSession, async (req, res) => {
  try {
    const products = productCatalog.loadProducts();
    const limit = parseInt(req.body.limit) || 100;
    const productsToWarm = products.slice(0, limit);
    
    let success = 0;
    let failed = 0;
    const failures = [];
    const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
    
    console.log(`[ImageCache] Pre-warming ${productsToWarm.length} products...`);
    
    for (const product of productsToWarm) {
      const images = product.images || [];
      const primaryImage = images[0] || product.image;
      
      if (!primaryImage || primaryImage.startsWith('/media/')) {
        success++;
        continue;
      }
      
      try {
        const thumbUrl = `${baseUrl}/api/img?url=${encodeURIComponent(primaryImage)}&w=420&q=75`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(thumbUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          success++;
        } else {
          failed++;
          failures.push({ productId: product.id, url: primaryImage, status: response.status });
        }
      } catch (err) {
        failed++;
        failures.push({ productId: product.id, url: primaryImage, error: err.message });
      }
    }
    
    console.log(`[ImageCache] Complete: ${success} success, ${failed} failed`);
    
    res.json({
      success: true,
      message: `Warmed ${success} thumbnails, ${failed} failed`,
      stats: { success, failed, total: productsToWarm.length },
      failures: failures.slice(0, 20)
    });
  } catch (err) {
    console.error("[Admin] Image cache rebuild error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: SEO Generator (selective generation)
router.post("/admin/seo/generate", requireAdminSession, async (req, res) => {
  try {
    const OpenAI = require("openai");
    const openai = new OpenAI();
    
    const { mode, productIds, overwrite, batchSize } = req.body;
    const limit = Math.min(parseInt(batchSize) || 10, 25);
    
    let products = productCatalog.loadProducts();
    
    if (mode === "missing") {
      products = products.filter(p => !p.seo?.description || (p.seo.description || "").length < 50);
    } else if (mode === "short") {
      products = products.filter(p => (p.description || "").length < 100);
    } else if (mode === "category" && req.body.category) {
      const cat = req.body.category.toLowerCase();
      products = products.filter(p => 
        (p.petType || "").toLowerCase() === cat ||
        (p.mainCategorySlug || "").toLowerCase() === cat
      );
    } else if (productIds && Array.isArray(productIds)) {
      products = products.filter(p => productIds.includes(p.id));
    }
    
    products = products.slice(0, limit);
    
    if (products.length === 0) {
      return res.json({ success: true, message: "No products to generate SEO for", generated: 0 });
    }
    
    console.log(`[SEO Generator] Generating for ${products.length} products...`);
    
    const results = [];
    for (const product of products) {
      try {
        const prompt = `Generate SEO content for this pet product:
Title: ${product.title || product.name}
Category: ${product.category || product.mainCategorySlug}
Pet Type: ${product.petType || "unknown"}
Price: $${product.price || 0}

Return JSON with:
- seo_title (max 60 chars, include brand "GetPawsy")
- seo_description (max 160 chars, compelling)
- short_description (max 200 chars, features)
- description_html (300-500 chars, clean HTML with bullets)
- tags (5-8 relevant tags array)

Rules: US English, no medical claims, no "guaranteed", factual only.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 500
        });
        
        const seoData = JSON.parse(completion.choices[0].message.content);
        
        productCatalog.updateProduct(product.id, {
          seo: {
            title: seoData.seo_title,
            description: seoData.seo_description
          },
          description: seoData.description_html || product.description,
          tags: seoData.tags || product.tags,
          updatedAt: new Date().toISOString()
        });
        
        results.push({ id: product.id, success: true });
      } catch (err) {
        results.push({ id: product.id, success: false, error: err.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`[SEO Generator] Complete: ${successCount}/${products.length} success`);
    
    res.json({
      success: true,
      message: `Generated SEO for ${successCount} products`,
      generated: successCount,
      failed: products.length - successCount,
      results
    });
  } catch (err) {
    console.error("[Admin] SEO generate error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: SEO Generate for single product (preview mode)
router.post("/admin/seo/generate-one", requireAdminSession, async (req, res) => {
  try {
    const OpenAI = require("openai");
    const openai = new OpenAI();
    
    const { product_id, dryRun } = req.body;
    
    if (!product_id) {
      return res.status(400).json({ success: false, error: "Missing product_id" });
    }
    
    const product = productCatalog.getProductById(product_id);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    
    console.log(`[SEO Generator] Generating for product ${product_id}...`);
    
    const prompt = `Generate SEO content for this pet product:
Title: ${product.title || product.name}
Category: ${product.category || product.mainCategorySlug}
Pet Type: ${product.petType || "unknown"}
Price: $${product.price || 0}
Current Description: ${(product.description || "").slice(0, 200)}

Return JSON with:
- seo_title (max 60 chars, include brand "GetPawsy")
- seo_description (max 155 chars, compelling meta description)
- short_bullets (array of 3-5 key benefits)
- description_html (300-500 chars, clean HTML with bullets, no <img> tags)
- tags (6-12 relevant pet product tags as array)

Rules: US English, no medical claims, no "guaranteed", no "FDA approved", factual only.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800
    });
    
    const seoData = JSON.parse(completion.choices[0].message.content);
    
    if (!dryRun) {
      productCatalog.updateProduct(product_id, {
        seo: {
          title: seoData.seo_title,
          description: seoData.seo_description
        },
        description: seoData.description_html || product.description,
        tags: seoData.tags || product.tags,
        updatedAt: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      product_id,
      dryRun: !!dryRun,
      generated: seoData,
      applied: !dryRun
    });
  } catch (err) {
    console.error("[Admin] SEO generate-one error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Product Feed for Google Merchant / Meta Commerce
router.get("/feeds/products.json", async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const productsPath = path.join(__dirname, "..", "data", "products.json");
    
    if (!fs.existsSync(productsPath)) {
      return res.status(404).json({ error: "No products found" });
    }
    
    const productsData = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
    const products = productsData.products || [];
    
    const baseUrl = `https://${req.get("host")}`;
    
    const feedProducts = products
      .filter(p => {
        if (p.active === false) return false;
        if ((p.stock || 0) <= 0) return false;
        if (!p.petType || p.petType === 'other') return false;
        return true;
      })
      .map(p => {
        const imageUrl = p.images?.[0] 
          ? (p.images[0].startsWith("http") ? p.images[0] : `${baseUrl}${p.images[0]}`)
          : `${baseUrl}/placeholder.jpg`;
          
        const additionalImages = (p.images || []).slice(1, 10).map(img => 
          img.startsWith("http") ? img : `${baseUrl}${img}`
        );
        
        const categoryPath = [
          p.mainCategorySlug === 'dogs' ? 'Dogs' : p.mainCategorySlug === 'cats' ? 'Cats' : 'Pets',
          p.subcategorySlug ? p.subcategorySlug.charAt(0).toUpperCase() + p.subcategorySlug.slice(1) : 'Supplies'
        ].join(' > ');
        
        const googleCategory = p.petType === 'dog' 
          ? "Animals & Pet Supplies > Pet Supplies > Dog Supplies"
          : p.petType === 'cat'
          ? "Animals & Pet Supplies > Pet Supplies > Cat Supplies"
          : "Animals & Pet Supplies > Pet Supplies";
        
        return {
          id: p.id,
          title: (p.seoTitle || p.title || p.name || "").slice(0, 150),
          description: (p.seoDescription || p.description || "").slice(0, 5000),
          link: `${baseUrl}/product/${p.slug || p.id}`,
          image_link: imageUrl,
          additional_image_link: additionalImages,
          availability: p.stock > 0 ? "in_stock" : "out_of_stock",
          price: `${(p.price || 0).toFixed(2)} USD`,
          sale_price: p.old_price && p.old_price > p.price ? `${(p.price || 0).toFixed(2)} USD` : undefined,
          brand: "GetPawsy",
          condition: "new",
          product_type: categoryPath,
          google_product_category: googleCategory,
          shipping: {
            country: "US",
            service: "Standard",
            price: p.price >= 35 ? "0.00 USD" : "5.99 USD"
          },
          identifier_exists: "no",
          custom_label_0: p.petType,
          custom_label_1: p.subcategorySlug || "general",
          custom_label_2: p.popularityBadge || ""
        };
      });
    
    res.set("Cache-Control", "public, max-age=600");
    res.json({
      generated_at: new Date().toISOString(),
      count: feedProducts.length,
      products: feedProducts
    });
  } catch (err) {
    console.error("[Feed] Error generating product feed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Pre-Launch Checklist
router.get("/admin/launch-checklist", requireAdminSession, async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const productsPath = path.join(__dirname, "..", "data", "products.json");
    const syncStatusPath = path.join(__dirname, "..", "data", "cj-inventory-sync.json");
    
    const checks = [];
    
    let products = [];
    if (fs.existsSync(productsPath)) {
      const data = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
      products = data.products || [];
    }
    
    const activeProducts = products.filter(p => p.active !== false);
    const withImages = activeProducts.filter(p => p.images && p.images.length > 0);
    const withSEO = activeProducts.filter(p => p.seoTitle && p.seoDescription);
    const inStock = activeProducts.filter(p => (p.stock || 0) > 0);
    const petOnly = activeProducts.filter(p => p.petType === 'dog' || p.petType === 'cat' || p.petType === 'both');
    const dogProducts = activeProducts.filter(p => p.petType === 'dog' || p.mainCategorySlug === 'dogs');
    const catProducts = activeProducts.filter(p => p.petType === 'cat' || p.mainCategorySlug === 'cats');
    
    checks.push({
      name: "Active Products",
      status: activeProducts.length >= 50 ? "pass" : activeProducts.length >= 20 ? "warn" : "fail",
      value: activeProducts.length,
      target: "50+",
      message: `${activeProducts.length} active products`
    });
    
    checks.push({
      name: "Products with Images",
      status: withImages.length / activeProducts.length >= 0.95 ? "pass" : "warn",
      value: `${Math.round(withImages.length / activeProducts.length * 100)}%`,
      target: "95%+",
      message: `${withImages.length}/${activeProducts.length} have images`
    });
    
    checks.push({
      name: "SEO Meta Tags",
      status: withSEO.length / activeProducts.length >= 0.80 ? "pass" : "warn",
      value: `${Math.round(withSEO.length / activeProducts.length * 100)}%`,
      target: "80%+",
      message: `${withSEO.length}/${activeProducts.length} have SEO`
    });
    
    checks.push({
      name: "In Stock Products",
      status: inStock.length / activeProducts.length >= 0.70 ? "pass" : "warn",
      value: `${Math.round(inStock.length / activeProducts.length * 100)}%`,
      target: "70%+",
      message: `${inStock.length}/${activeProducts.length} in stock`
    });
    
    checks.push({
      name: "Pet-Only Products",
      status: petOnly.length / activeProducts.length >= 0.95 ? "pass" : "fail",
      value: `${Math.round(petOnly.length / activeProducts.length * 100)}%`,
      target: "95%+",
      message: `${petOnly.length}/${activeProducts.length} are pet products`
    });
    
    const dogCatRatio = dogProducts.length / (catProducts.length || 1);
    checks.push({
      name: "Dog/Cat Balance",
      status: dogCatRatio >= 0.7 && dogCatRatio <= 1.4 ? "pass" : "warn",
      value: `${dogProducts.length}/${catProducts.length}`,
      target: "~50/50",
      message: `Dogs: ${dogProducts.length}, Cats: ${catProducts.length}`
    });
    
    let lastSync = null;
    if (fs.existsSync(syncStatusPath)) {
      try {
        const syncData = JSON.parse(fs.readFileSync(syncStatusPath, "utf-8"));
        lastSync = syncData.lastSync;
      } catch (e) {}
    }
    
    const syncAge = lastSync ? (Date.now() - new Date(lastSync).getTime()) / 1000 / 60 : null;
    checks.push({
      name: "Inventory Sync",
      status: syncAge && syncAge < 60 ? "pass" : syncAge && syncAge < 1440 ? "warn" : "fail",
      value: lastSync ? `${Math.round(syncAge)} min ago` : "Never",
      target: "< 15 min",
      message: lastSync ? `Last sync: ${new Date(lastSync).toISOString()}` : "Never synced"
    });
    
    const policyPages = ['shipping', 'returns', 'privacy', 'terms'];
    const existingPolicies = policyPages.filter(p => {
      const filePath = path.join(__dirname, "..", "views", "legal", p + ".ejs");
      return fs.existsSync(filePath);
    });
    
    checks.push({
      name: "Policy Pages",
      status: existingPolicies.length === policyPages.length ? "pass" : existingPolicies.length >= 2 ? "warn" : "fail",
      value: `${existingPolicies.length}/${policyPages.length}`,
      target: "4/4",
      message: existingPolicies.length === policyPages.length ? "All policies exist" : `Missing: ${policyPages.filter(p => !existingPolicies.includes(p)).join(", ")}`
    });
    
    const passCount = checks.filter(c => c.status === "pass").length;
    const failCount = checks.filter(c => c.status === "fail").length;
    
    res.json({
      success: true,
      ready: failCount === 0,
      summary: {
        total: checks.length,
        pass: passCount,
        warn: checks.length - passCount - failCount,
        fail: failCount
      },
      checks,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("[Admin] Launch checklist error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// CJ List Import Job State
let cjImportJob = {
  running: false,
  jobId: null,
  startedAt: null,
  progress: { imported: 0, total: 250, skippedNonUs: 0, skippedNonPet: 0, duplicates: 0, errors: 0 },
  lastError: null,
  completedAt: null
};

// Admin: Start CJ List Import (250 Pet Products)
router.post("/api/admin/cj/list-import", requireAdminSession, async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  
  if (cjImportJob.running) {
    return res.status(409).json({
      success: false,
      error: "Import already running",
      jobId: cjImportJob.jobId,
      progress: cjImportJob.progress
    });
  }
  
  const { limit = 250, resume = false } = req.body;
  const jobId = `cj-import-${Date.now()}`;
  
  cjImportJob = {
    running: true,
    jobId,
    startedAt: new Date().toISOString(),
    progress: { imported: 0, total: limit, skippedNonUs: 0, skippedNonPet: 0, duplicates: 0, errors: 0 },
    lastError: null,
    completedAt: null
  };
  
  res.json({
    success: true,
    message: "Import job started",
    jobId,
    checkProgress: "/api/admin/cj/import-status"
  });
  
  try {
    const { runImport, stats } = require("../scripts/import-cj-petlist-curated");
    
    const updateProgress = setInterval(() => {
      cjImportJob.progress = {
        imported: stats.imported || 0,
        total: limit,
        skippedNonUs: stats.skipped_non_us || 0,
        skippedNonPet: stats.skipped_non_pet || 0,
        duplicates: stats.duplicates || 0,
        errors: stats.errors || 0,
        pagesScanned: stats.pages_scanned || 0
      };
    }, 1000);
    
    const result = await runImport({ resume, forceUsOnly: true });
    
    clearInterval(updateProgress);
    
    cjImportJob.running = false;
    cjImportJob.completedAt = new Date().toISOString();
    cjImportJob.progress = {
      imported: result.imported || 0,
      total: limit,
      skippedNonUs: result.skipped_non_us || 0,
      skippedNonPet: result.skipped_non_pet || 0,
      duplicates: result.duplicates || 0,
      errors: result.errors || 0,
      pagesScanned: result.pages_scanned || 0
    };
    
    console.log(`[CJ Import] Job ${jobId} completed:`, JSON.stringify(cjImportJob.progress));
    
  } catch (err) {
    console.error("[CJ Import] Job error:", err);
    cjImportJob.running = false;
    cjImportJob.lastError = err.message;
    cjImportJob.completedAt = new Date().toISOString();
  }
});

// Admin: Get CJ Import Status
router.get("/api/admin/cj/import-status", requireAdminSession, async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  
  const logPath = path.join(__dirname, "..", "data", "cj-petlist-import-log.json");
  const failuresPath = path.join(__dirname, "..", "data", "cj-import-failures.json");
  
  let lastImportLog = null;
  let recentFailures = [];
  
  try {
    if (fs.existsSync(logPath)) {
      lastImportLog = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    }
  } catch (e) {}
  
  try {
    if (fs.existsSync(failuresPath)) {
      const data = JSON.parse(fs.readFileSync(failuresPath, "utf-8"));
      recentFailures = (data.failures || []).slice(-20);
    }
  } catch (e) {}
  
  res.json({
    success: true,
    job: {
      running: cjImportJob.running,
      jobId: cjImportJob.jobId,
      startedAt: cjImportJob.startedAt,
      completedAt: cjImportJob.completedAt,
      progress: cjImportJob.progress,
      lastError: cjImportJob.lastError
    },
    lastImportLog,
    recentFailures
  });
});

// Admin: Get Rejected Products
router.get("/api/admin/cj/rejected", requireAdminSession, async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  
  const failuresPath = path.join(__dirname, "..", "data", "cj-import-failures.json");
  
  try {
    if (!fs.existsSync(failuresPath)) {
      return res.json({ success: true, failures: [], count: 0 });
    }
    
    const data = JSON.parse(fs.readFileSync(failuresPath, "utf-8"));
    const failures = data.failures || [];
    
    const grouped = {
      nonPet: failures.filter(f => f.reason && !f.reason.includes("warehouse")),
      noUsWarehouse: failures.filter(f => f.reason && f.reason.includes("warehouse")),
      errors: failures.filter(f => f.type === "page_fetch" || f.error)
    };
    
    res.json({
      success: true,
      count: failures.length,
      grouped,
      exportedAt: data.exportedAt
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// HOME SLIDER ENDPOINTS (Pet-Only, Ranked)
// ========================================

const collectionsApi = require("../src/collectionsApi");

router.get("/home/top-picks/dogs", (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const products = collectionsApi.getTopPicksDogs(limit);
    res.json({ success: true, products, count: products.length });
  } catch (err) {
    console.error("[Home API] Top picks dogs error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/home/top-picks/cats", (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const products = collectionsApi.getTopPicksCats(limit);
    res.json({ success: true, products, count: products.length });
  } catch (err) {
    console.error("[Home API] Top picks cats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/home/best-sellers", (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const products = collectionsApi.getBestSellers(limit);
    res.json({ success: true, products, count: products.length });
  } catch (err) {
    console.error("[Home API] Best sellers error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/home/trending", (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const products = collectionsApi.getTrendingNow(limit);
    res.json({ success: true, products, count: products.length });
  } catch (err) {
    console.error("[Home API] Trending error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Rebuild Product Rankings
router.post("/admin/rankings/rebuild", requireAdminSession, async (req, res) => {
  try {
    const { buildRankings } = require("../scripts/build-product-rankings");
    const result = buildRankings();
    res.json({ 
      success: true, 
      message: "Rankings rebuilt successfully",
      ...result
    });
  } catch (err) {
    console.error("[Admin] Rankings rebuild error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Product Stats Dashboard
router.get("/admin/product-stats", requireAdminSession, async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  
  try {
    const dbPath = path.join(__dirname, "..", "data", "db.json");
    let products = [];
    
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      products = data.products || [];
    }
    
    const total = products.length;
    const active = products.filter(p => p.active !== false).length;
    const petOnly = products.filter(p => p.petType === 'dog' || p.petType === 'cat' || p.petType === 'both').length;
    const nonPet = products.filter(p => !p.petType || (p.petType !== 'dog' && p.petType !== 'cat' && p.petType !== 'both')).length;
    const inStock = products.filter(p => (p.stock || 0) > 0).length;
    const outOfStock = products.filter(p => (p.stock || 0) === 0).length;
    const dogs = products.filter(p => p.petType === 'dog' || p.mainCategorySlug === 'dogs').length;
    const cats = products.filter(p => p.petType === 'cat' || p.mainCategorySlug === 'cats').length;
    const withSEO = products.filter(p => p.seoTitle && p.seoDescription).length;
    const withImages = products.filter(p => p.images && p.images.length > 0).length;
    
    res.json({
      success: true,
      stats: {
        total,
        active,
        inactive: total - active,
        petOnly,
        nonPet,
        inStock,
        outOfStock,
        dogs,
        cats,
        withSEO,
        withImages,
        seoPercent: total > 0 ? Math.round(withSEO / total * 100) : 0,
        petPercent: total > 0 ? Math.round(petOnly / total * 100) : 0,
        stockPercent: total > 0 ? Math.round(inStock / total * 100) : 0
      },
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("[Admin] Product stats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Run Pet Lock (classify and deactivate non-pet products)
router.post("/admin/pet-lock/run", requireAdminSession, async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  const { classifyPetType, isPetProduct } = require("../src/petClassifier");
  
  try {
    const dbPath = path.join(__dirname, "..", "data", "db.json");
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ success: false, error: "Database file not found" });
    }
    
    const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    const products = data.products || [];
    
    let classified = 0;
    let deactivated = 0;
    let kept = 0;
    
    for (const p of products) {
      const petResult = isPetProduct(p);
      const petType = classifyPetType(p);
      
      p.petType = petType;
      p.petConfidence = petResult.ok ? 80 : 20;
      p.petReason = petResult.reason || "Unknown";
      p.is_pet_product = petResult.ok;
      
      if (!petResult.ok || !petType) {
        p.active = false;
        p.hidden_from_storefront = true;
        deactivated++;
      } else {
        p.active = true;
        p.hidden_from_storefront = false;
        kept++;
      }
      classified++;
    }
    
    fs.writeFileSync(dbPath, JSON.stringify({ ...data, products }, null, 2));
    
    res.json({
      success: true,
      message: `Pet lock complete: ${kept} kept, ${deactivated} deactivated`,
      stats: { classified, kept, deactivated }
    });
  } catch (err) {
    console.error("[Admin] Pet lock error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/admin/pet-audit", requireAdminSession, async (req, res) => {
  const { isPetProduct, classifyPetType } = require("../src/petClassifier");
  const { loadProducts } = require("../helpers/topProducts");
  
  try {
    const limit = parseInt(req.query.limit) || 50;
    const blocked = req.query.blocked === '1';
    
    const products = loadProducts();
    const results = [];
    
    for (const p of products) {
      const result = isPetProduct(p);
      const petType = classifyPetType(p);
      
      if (blocked && result.ok) continue;
      if (!blocked && !result.ok) continue;
      
      results.push({
        id: p.id,
        title: (p.title || p.name || '').slice(0, 80),
        is_pet: result.ok,
        pet_type: petType,
        reason: result.reason || 'Passed',
        score: result.score || 0,
        stock: p.stock,
        hasImages: !!(p.images && p.images.length > 0)
      });
      
      if (results.length >= limit) break;
    }
    
    res.json({
      success: true,
      filter: blocked ? 'blocked' : 'allowed',
      count: results.length,
      products: results
    });
  } catch (err) {
    console.error("[Admin] Pet audit error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/admin/pet-reclassify", requireAdminSession, async (req, res) => {
  try {
    const { execSync } = require('child_process');
    const result = execSync('node scripts/backfill-pet-classification.js', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 60000
    });
    
    res.json({
      success: true,
      message: 'Pet classification backfill completed',
      output: result.split('\n').slice(-15).join('\n')
    });
  } catch (err) {
    console.error("[Admin] Pet reclassify error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/homepage/sections", async (req, res) => {
  try {
    const sections = getHomepageSections();
    const stats = getHomepageStats();
    
    res.json({
      success: true,
      stats,
      sections: {
        topPicksDogs: sections.topPicksDogs.length,
        topPicksCats: sections.topPicksCats.length,
        bestSellers: sections.bestSellers.length,
        trending: sections.trending.length,
        top12: sections.top12.length,
        highRatedRandom: sections.highRatedRandom.length,
        mixed: sections.mixed.length
      }
    });
  } catch (err) {
    console.error("[API] Homepage sections error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/debug/home-source", async (req, res) => {
  const fs = require("fs");
  const path = require("path");
  
  const PRODUCTS_CJ = path.join(__dirname, '..', 'data', 'products_cj.json');
  
  let dataSource = "none";
  let productCount = 0;
  let syncedAt = null;
  
  if (!fs.existsSync(PRODUCTS_CJ)) {
    return res.status(500).json({ 
      error: "FATAL: products_cj.json not found - API-only mode requires this file",
      dataSource: "none",
      fallbackActive: false
    });
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(PRODUCTS_CJ, 'utf-8'));
    productCount = (data.products || []).length;
    syncedAt = data.syncedAt || null;
    dataSource = "products_cj.json (API-ONLY)";
  } catch (e) {
    return res.status(500).json({ 
      error: `FATAL: Failed to parse products_cj.json: ${e.message}`,
      dataSource: "error",
      fallbackActive: false
    });
  }
  
  const stats = getHomepageStats();
  const sections = getHomepageSections();
  
  res.json({
    dataSource,
    mockActive: false,
    fallbackActive: false,
    apiOnlyMode: true,
    syncedAt,
    productCount,
    petStats: stats,
    sectionCounts: {
      topPicksDogs: sections.topPicksDogs.length,
      topPicksCats: sections.topPicksCats.length,
      bestSellers: sections.bestSellers.length,
      trending: sections.trending.length
    },
    sampleProducts: {
      dogs: sections.topPicksDogs.slice(0,2).map(p => ({ id: p.id, title: (p.title||p.name||'').slice(0,50), pet_type: p.pet_type })),
      cats: sections.topPicksCats.slice(0,2).map(p => ({ id: p.id, title: (p.title||p.name||'').slice(0,50), pet_type: p.pet_type }))
    }
  });
});

// REMOVED: UNIFIED HOMEPAGE CAROUSELS ENDPOINT (Handled by collectionsApi.js)
/*
router.get("/homepage/carousels", (req, res) => {
  ...
});
*/

router.get("/debug/homepage-sections", (req, res) => {
  const { getHeroCarousels, loadHeroConfig } = require("../src/heroProducts");
  
  try {
    const config = loadHeroConfig();
    const carousels = getHeroCarousels();
    
    const formatSection = (products) => products.map(p => ({
      id: p.id,
      handle: p.id,
      title: (p.title || p.name || '').slice(0, 60)
    }));
    
    res.json({
      source: "hero-whitelist",
      version: config._meta?.version || "1.0",
      pinnedFirst: config.pinnedFirst || {},
      bestSellers: formatSection(carousels.bestSellers),
      trending: formatSection(carousels.trending),
      topPicksDogs: formatSection(carousels.topPicksDogs),
      topPicksCats: formatSection(carousels.topPicksCats),
      meta: {
        source: "hero-whitelist",
        skipped: carousels.meta.skipped,
        missing: carousels.meta.skipped.filter(s => s.reason === 'not_found'),
        counts: carousels.meta.counts
      }
    });
  } catch (err) {
    console.error("[DEBUG] Homepage sections error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/debug/homepage-carousels", async (req, res) => {
  const { getHeroCarousels } = require("../src/heroProducts");
  const { isPetEligible } = require("../src/strictPetProducts");
  
  try {
    const carousels = getHeroCarousels();
    
    function validateSection(products, sectionName) {
      const validated = [];
      const nonPetItems = [];
      
      for (const p of products) {
        const check = isPetEligible(p);
        const item = {
          id: p.id,
          title: (p.title || p.name || '').slice(0, 60),
          petType: p.pet_type || p.petType || null,
          category: p.mainCategorySlug || p.categorySlug || null,
          price: p.price,
          source: 'hero-whitelist'
        };
        
        if (!check.eligible) {
          nonPetItems.push({ ...item, reason: check.reason });
        } else {
          validated.push(item);
        }
      }
      
      return { items: validated, nonPetItems, count: validated.length };
    }
    
    const topPicksDogs = validateSection(carousels.topPicksDogs, 'topPicksDogs');
    const topPicksCats = validateSection(carousels.topPicksCats, 'topPicksCats');
    const bestSellers = validateSection(carousels.bestSellers, 'bestSellers');
    const trending = validateSection(carousels.trending, 'trending');
    
    res.json({
      success: true,
      source: "hero-whitelist",
      sections: {
        topPicksDogs,
        topPicksCats,
        bestSellers,
        trending
      },
      allSectionsPetOnly: (
        topPicksDogs.nonPetItems.length === 0 &&
        topPicksCats.nonPetItems.length === 0 &&
        bestSellers.nonPetItems.length === 0 &&
        trending.nonPetItems.length === 0
      ),
      meta: carousels.meta
    });
  } catch (err) {
    console.error("[DEBUG] Homepage carousels validation error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      allSectionsPetOnly: false
    });
  }
});

// ============== PERFORMANCE DEBUG ENDPOINT ==============
// Returns performance metrics for Lighthouse analysis
router.get("/perf/debug", (req, res) => {
  try {
    const catalogPath = path.join(__dirname, '..', 'data', 'catalog.json');
    const mediaDir = path.join(__dirname, '..', 'public', 'media', 'products');
    
    // Calculate catalog stats
    let products = [];
    let catalogSize = 0;
    try {
      const catalogData = fs.readFileSync(catalogPath, 'utf8');
      catalogSize = Buffer.byteLength(catalogData, 'utf8');
      const catalog = JSON.parse(catalogData);
      products = catalog.products || [];
    } catch (e) {
      console.error('[Perf] Failed to load catalog:', e.message);
    }
    
    // Calculate media stats
    let totalMediaFiles = 0;
    let totalMediaSize = 0;
    let thumbCount = 0;
    try {
      if (fs.existsSync(mediaDir)) {
        const productDirs = fs.readdirSync(mediaDir).filter(f => {
          try { return fs.statSync(path.join(mediaDir, f)).isDirectory(); } catch { return false; }
        });
        for (const dir of productDirs) {
          try {
            const files = fs.readdirSync(path.join(mediaDir, dir));
            for (const file of files) {
              const filePath = path.join(mediaDir, dir, file);
              const stat = fs.statSync(filePath);
              totalMediaFiles++;
              totalMediaSize += stat.size;
              if (file.includes('thumb') || file.includes('_420') || file.includes('_640')) {
                thumbCount++;
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      console.error('[Perf] Failed to analyze media:', e.message);
    }
    
    // Calculate average product payload size (listing mode)
    const sampleProduct = products[0] || {};
    const listingPayload = {
      id: sampleProduct.id || '',
      slug: sampleProduct.slug || '',
      title: sampleProduct.title || '',
      price: sampleProduct.price || 0,
      thumbImage: sampleProduct.images?.[0] || '',
      pet_type: sampleProduct.pet_type || '',
      variantCount: (sampleProduct.variants || []).length,
      badges: sampleProduct.badges || []
    };
    const listingPayloadSize = JSON.stringify(listingPayload).length;
    const fullPayloadSize = JSON.stringify(sampleProduct).length;
    
    // Estimate page weight for 24 products
    const gridOf24Size = listingPayloadSize * 24 + 200; // 200 bytes for response wrapper
    
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      catalog: {
        totalProducts: products.length,
        catalogFileSize: `${(catalogSize / 1024).toFixed(1)} KB`,
        avgListingPayloadSize: `${listingPayloadSize} bytes`,
        avgFullPayloadSize: `${fullPayloadSize} bytes`,
        reductionPercent: `${((1 - listingPayloadSize / fullPayloadSize) * 100).toFixed(1)}%`
      },
      media: {
        totalFiles: totalMediaFiles,
        totalSize: `${(totalMediaSize / 1024 / 1024).toFixed(2)} MB`,
        thumbCount: thumbCount,
        avgFileSize: totalMediaFiles > 0 ? `${(totalMediaSize / totalMediaFiles / 1024).toFixed(1)} KB` : '0 KB'
      },
      caching: {
        mediaHeaders: 'Cache-Control: public, max-age=31536000, immutable',
        staticAssets: 'Cache-Control: public, max-age=86400',
        htmlFiles: 'Cache-Control: no-cache, must-revalidate',
        compression: 'brotli/gzip enabled'
      },
      pageEstimates: {
        gridOf24Products: `${(gridOf24Size / 1024).toFixed(1)} KB`,
        fullPageWith24: `~${((gridOf24Size + 50000) / 1024).toFixed(0)} KB (HTML+CSS+JS+data)`
      },
      recommendations: [
        products.length > 500 ? 'Consider pre-generating static category pages' : 'Product count OK',
        thumbCount < products.length ? 'Generate more thumbnail images' : 'Thumbs coverage OK',
        listingPayloadSize > 300 ? 'Consider reducing listing payload fields' : 'Listing payload optimized'
      ]
    });
  } catch (err) {
    console.error('[Perf] Debug endpoint error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
