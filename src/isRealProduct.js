const DEMO_PATTERNS = {
  id: [/^cj_demo/, /^demo/, /^sample/, /^test/, /^placeholder/i],
  title: [/demo/i, /sample/i, /placeholder/i, /test product/i],
  image: [/demo/, /placeholder/, /no-image/, /stock/, /unsplash\.com/, /sample/, /\.svg$/i],
  handle: [/demo/, /sample/, /placeholder/, /test/i]
};

function isRealProduct(p) {
  if (!p) return false;
  
  const id = String(p.id || '').toLowerCase();
  for (const pattern of DEMO_PATTERNS.id) {
    if (pattern.test(id)) return false;
  }
  
  const title = String(p.title || '').toLowerCase();
  for (const pattern of DEMO_PATTERNS.title) {
    if (pattern.test(title)) return false;
  }
  
  const image = String(p.image || '').toLowerCase();
  if (!image || image.includes('undefined') || image === 'null') return false;
  for (const pattern of DEMO_PATTERNS.image) {
    if (pattern.test(image)) return false;
  }
  
  const handle = String(p.handle || p.slug || '').toLowerCase();
  for (const pattern of DEMO_PATTERNS.handle) {
    if (pattern.test(handle)) return false;
  }
  
  if (p.source === 'demo' || p.source === 'seed') return false;
  
  const hasCJId = p.cj_product_id || p.cjProductId || p.spu || p.sku;
  const hasValidSource = p.source && !['demo', 'seed', 'sample'].includes(p.source);
  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
  
  return hasCJId || hasValidSource || hasVariants || (p.price && p.price > 0);
}

function filterRealProducts(products) {
  if (!Array.isArray(products)) return [];
  return products.filter(isRealProduct);
}

module.exports = { isRealProduct, filterRealProducts, DEMO_PATTERNS };
