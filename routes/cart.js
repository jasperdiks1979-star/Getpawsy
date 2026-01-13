const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

function loadProducts() {
  const cjPath = path.join(__dirname, "../data/products_cj.json");
  if (!fs.existsSync(cjPath)) {
    throw new Error("FATAL: products_cj.json not found - API-only mode");
  }
  try {
    const raw = fs.readFileSync(cjPath, 'utf8');
    const d = JSON.parse(raw);
    const products = d.products || [];
    if (products.length === 0) {
      throw new Error("FATAL: products_cj.json is empty");
    }
    return products;
  } catch (e) {
    if (e.message.startsWith("FATAL:")) throw e;
    throw new Error(`FATAL: Failed to load products_cj.json: ${e.message}`);
  }
}

function getProductById(id) {
  return loadProducts().find(p => String(p.id) === String(id));
}

function isProductInStock(product, variantSku = null) {
  if (!product) return { inStock: false, error: 'not_found' };
  if (product.active === false) return { inStock: false, error: 'inactive' };
  
  if (variantSku) {
    if (!product.variants || product.variants.length === 0) {
      return { inStock: false, error: 'variant_not_found' };
    }
    const variant = product.variants.find(v => v.sku === variantSku);
    if (!variant) {
      return { inStock: false, error: 'variant_not_found' };
    }
    if (variant.available === false) {
      return { inStock: false, error: 'variant_unavailable' };
    }
    if ((variant.stock || 0) <= 0) {
      return { inStock: false, error: 'out_of_stock' };
    }
    return { inStock: true };
  }
  
  if ((product.stock || 0) <= 0) {
    return { inStock: false, error: 'out_of_stock' };
  }
  return { inStock: true };
}

// Initialize cart if empty
function initCart(req) {
  if (!req.session.cart) req.session.cart = [];
}

router.get("/", (req, res) => {
  initCart(req);
  const cart = req.session.cart;

  // Subtotal
  let subtotal = 0;
  cart.forEach(item => subtotal += item.price * item.qty);

  res.render("cart", {
    cart,
    subtotal,
    total: subtotal.toFixed(2)
  });
});

router.post("/add/:id", async (req, res) => {
  initCart(req);
  const variantSku = req.body.variantSku || null;

  const product = getProductById(req.params.id);
  if (!product) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    return res.send("Product not found");
  }

  const stockCheck = isProductInStock(product, variantSku);
  if (!stockCheck.inStock) {
    const errorMsg = stockCheck.error === 'variant_not_found' 
      ? "Selected variant is not available" 
      : "Out of stock - this item is currently unavailable";
    const statusCode = stockCheck.error === 'variant_not_found' ? 404 : 409;
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(statusCode).json({ 
        success: false, 
        error: errorMsg,
        errorType: stockCheck.error,
        outOfStock: stockCheck.error === 'out_of_stock'
      });
    }
    return res.status(statusCode).send(errorMsg);
  }

  const cartItemId = variantSku ? `${product.id}-${variantSku}` : product.id;
  const existing = req.session.cart.find(item => item.id === cartItemId);

  if (existing) {
    existing.qty += 1;
  } else {
    req.session.cart.push({
      id: cartItemId,
      productId: product.id,
      name: product.name || product.title,
      price: product.price,
      image: product.images?.[0] || product.image,
      variantSku,
      qty: 1
    });
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, cartCount: req.session.cart.length });
  }
  res.redirect("/cart");
});

router.post("/add", async (req, res) => {
  initCart(req);
  const { productId, quantity, variantSku } = req.body;
  
  const product = getProductById(productId);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  const stockCheck = isProductInStock(product, variantSku);
  if (!stockCheck.inStock) {
    const errorMsg = stockCheck.error === 'variant_not_found' 
      ? "Selected variant is not available" 
      : "Out of stock - this item is currently unavailable";
    const statusCode = stockCheck.error === 'variant_not_found' ? 404 : 409;
    
    return res.status(statusCode).json({ 
      success: false, 
      error: errorMsg,
      errorType: stockCheck.error,
      outOfStock: stockCheck.error === 'out_of_stock'
    });
  }

  const qty = parseInt(quantity) || 1;
  const cartItemId = variantSku ? `${product.id}-${variantSku}` : product.id;
  const existing = req.session.cart.find(item => item.id === cartItemId);

  if (existing) {
    existing.qty += qty;
  } else {
    req.session.cart.push({
      id: cartItemId,
      productId: product.id,
      name: product.name || product.title,
      price: product.price,
      image: product.images?.[0] || product.image,
      variantSku,
      qty
    });
  }

  res.json({ success: true, cartCount: req.session.cart.length });
});

router.post("/remove/:id", (req, res) => {
  initCart(req);
  req.session.cart = req.session.cart.filter(item => item.id != req.params.id);
  res.redirect("/cart");
});

router.post("/update/:id", (req, res) => {
  initCart(req);
  const qty = parseInt(req.body.qty);
  const item = req.session.cart.find(i => i.id == req.params.id);
  if (item) item.qty = qty > 0 ? qty : 1;
  res.redirect("/cart");
});

module.exports = router;
