const productCatalog = require("../../services/productCatalog");
const { normalizeProductVariants, validateVariantForCart } = require("../../src/lib/variantLinker");

// Server-side cart (session-based fallback)
// Primary cart is in frontend localStorage (CartStore)
let sessionCarts = new Map();

function getSessionCart(sessionId) {
  if (!sessionCarts.has(sessionId)) {
    sessionCarts.set(sessionId, []);
  }
  return sessionCarts.get(sessionId);
}

// Use getProductById with CJ variant validation
function resolveProductDetails(productId, variantId) {
  let product = productCatalog.getProductById(productId);
  
  if (!product) return null;
  
  // Normalize product to ensure variants are properly structured
  product = normalizeProductVariants(product);
  
  let price = product.price;
  let title = product.title || product.name;
  let image = (product.images && product.images[0]) || product.image || '/images/placeholder-product.svg';
  let sku = product.sku || product.id;
  let resolvedVariantId = variantId;
  let cjVariantId = null;
  let warehouseId = null;
  
  // Resolve variant if provided
  if (product.variants && product.variants.length > 0) {
    let variant = null;
    
    if (variantId) {
      variant = product.variants.find(v => 
        v.id === variantId || 
        v.sku === variantId || 
        v.cjVariantId === variantId ||
        v.cjSku === variantId
      );
    } else if (product.variants.length === 1) {
      variant = product.variants[0];
    }
    
    if (variant) {
      price = variant.price || price;
      sku = variant.sku || variantId;
      resolvedVariantId = variant.id;
      cjVariantId = variant.cjVariantId || variant.cjSku;
      warehouseId = variant.preferredWarehouse;
      if (variant.image) image = variant.image;
    }
  }
  
  return {
    productId,
    variantId: resolvedVariantId,
    title,
    price: parseFloat(price) || 0,
    image,
    sku,
    slug: product.slug || product.id,
    cjProductId: product.cjProductId,
    cjVariantId,
    warehouseId
  };
}

module.exports = {
  getCart: (req, res) => {
    const sessionId = req.sessionID || 'default';
    const cart = getSessionCart(sessionId);
    
    // Enrich cart items with current product details
    const enrichedCart = cart.map(item => {
      const details = resolveProductDetails(item.productId, item.variantId);
      return details ? { ...details, qty: item.qty } : null;
    }).filter(Boolean);
    
    res.json({
      success: true,
      items: enrichedCart,
      count: enrichedCart.reduce((sum, i) => sum + i.qty, 0),
      subtotal: enrichedCart.reduce((sum, i) => sum + (i.price * i.qty), 0)
    });
  },

  addItem: (req, res) => {
    const { product_id, productId, variant_id, variantId, qty, quantity: reqQty } = req.body;
    const pId = product_id || productId;
    const vId = variant_id || variantId || null;
    const quantity = parseInt(qty || reqQty) || 1;
    
    // Enhanced logging for debugging production issues
    console.log('[Cart API] POST /api/cart/add', {
      requestId: Date.now().toString(36),
      productId: pId,
      variantId: vId,
      quantity,
      origin: req.get('origin'),
      userAgent: (req.get('user-agent') || '').substring(0, 50)
    });
    
    if (!pId) {
      console.log('[Cart API] Error: Missing product_id');
      return res.status(400).json({ success: false, error: "Missing product_id", errorCode: 400 });
    }
    
    // Get and normalize product from catalog
    let product = productCatalog.getProductById(pId);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found", errorCode: 404 });
    }
    
    product = normalizeProductVariants(product);
    
    // Validate variant with CJ mapping check
    const validation = validateVariantForCart(product, vId, quantity);
    if (!validation.valid) {
      console.log('[Cart] Validation failed:', validation.error, { productId: pId, variantId: vId });
      return res.status(validation.errorCode || 400).json({ 
        success: false, 
        error: validation.error,
        errorCode: validation.errorCode
      });
    }
    
    // Resolve full details with validated variant
    const details = resolveProductDetails(pId, validation.variant.id);
    if (!details) {
      return res.status(404).json({ success: false, error: "Product resolution failed", errorCode: 404 });
    }
    
    const sessionId = req.sessionID || 'default';
    const cart = getSessionCart(sessionId);
    
    // Cart line key includes variant + warehouse for uniqueness
    const lineKey = `${pId}:${validation.variant.id}:${validation.warehouseId || 'default'}`;
    
    // Find existing item with same product+variant+warehouse
    const existingIdx = cart.findIndex(i => 
      i.lineKey === lineKey || 
      (i.productId === pId && (i.variantId || null) === (validation.variant.id || null))
    );
    
    if (existingIdx >= 0) {
      cart[existingIdx].qty += quantity;
    } else {
      cart.push({
        productId: pId,
        variantId: validation.variant.id,
        warehouseId: validation.warehouseId,
        lineKey,
        qty: quantity
      });
    }
    
    sessionCarts.set(sessionId, cart);
    
    // Return enriched cart
    const enrichedCart = cart.map(item => {
      const d = resolveProductDetails(item.productId, item.variantId);
      return d ? { ...d, qty: item.qty, lineKey: item.lineKey } : null;
    }).filter(Boolean);
    
    console.log('[Cart] Item added:', { productId: pId, variantId: validation.variant.id, qty: quantity });
    
    res.json({
      success: true,
      items: enrichedCart,
      count: enrichedCart.reduce((sum, i) => sum + i.qty, 0),
      subtotal: enrichedCart.reduce((sum, i) => sum + (i.price * i.qty), 0),
      addedItem: { ...details, qty: quantity }
    });
  },

  updateQty: (req, res) => {
    const { product_id, productId, variant_id, variantId, qty } = req.body;
    const pId = product_id || productId;
    const vId = variant_id || variantId || null;
    const quantity = parseInt(qty) || 0;
    
    const sessionId = req.sessionID || 'default';
    const cart = getSessionCart(sessionId);
    
    const item = cart.find(i => 
      i.productId === pId && (i.variantId || null) === (vId || null)
    );
    
    if (item) {
      if (quantity <= 0) {
        // Remove item
        const idx = cart.indexOf(item);
        cart.splice(idx, 1);
      } else {
        item.qty = quantity;
      }
    }
    
    sessionCarts.set(sessionId, cart);
    
    const enrichedCart = cart.map(i => {
      const d = resolveProductDetails(i.productId, i.variantId);
      return d ? { ...d, qty: i.qty } : null;
    }).filter(Boolean);
    
    res.json({
      success: true,
      items: enrichedCart,
      count: enrichedCart.reduce((sum, i) => sum + i.qty, 0),
      subtotal: enrichedCart.reduce((sum, i) => sum + (i.price * i.qty), 0)
    });
  },

  removeItem: (req, res) => {
    const { product_id, productId, variant_id, variantId } = req.body;
    const pId = product_id || productId;
    const vId = variant_id || variantId || null;
    
    const sessionId = req.sessionID || 'default';
    let cart = getSessionCart(sessionId);
    
    cart = cart.filter(i => 
      !(i.productId === pId && (i.variantId || null) === (vId || null))
    );
    
    sessionCarts.set(sessionId, cart);
    
    const enrichedCart = cart.map(i => {
      const d = resolveProductDetails(i.productId, i.variantId);
      return d ? { ...d, qty: i.qty } : null;
    }).filter(Boolean);
    
    res.json({
      success: true,
      items: enrichedCart,
      count: enrichedCart.reduce((sum, i) => sum + i.qty, 0),
      subtotal: enrichedCart.reduce((sum, i) => sum + (i.price * i.qty), 0)
    });
  },
  
  // Sync cart from frontend localStorage
  syncCart: (req, res) => {
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: "Invalid items array" });
    }
    
    const sessionId = req.sessionID || 'default';
    
    // Validate and normalize items
    const normalizedCart = items.map(item => ({
      productId: item.productId || item.id,
      variantId: item.variantId || null,
      qty: parseInt(item.qty) || 1
    })).filter(item => item.productId);
    
    sessionCarts.set(sessionId, normalizedCart);
    
    const enrichedCart = normalizedCart.map(i => {
      const d = resolveProductDetails(i.productId, i.variantId);
      return d ? { ...d, qty: i.qty } : null;
    }).filter(Boolean);
    
    res.json({
      success: true,
      items: enrichedCart,
      count: enrichedCart.reduce((sum, i) => sum + i.qty, 0),
      subtotal: enrichedCart.reduce((sum, i) => sum + (i.price * i.qty), 0)
    });
  }
};
