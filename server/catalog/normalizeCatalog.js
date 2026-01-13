/**
 * Catalog Normalizer - Ensures all products have valid images array
 * Non-destructive: preserves all existing product data
 */

function isValidUrl(str) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/');
}

function parseImages(value) {
  if (!value) return [];
  
  // Already an array
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object' && item !== null) {
          return item.url || item.src || item.image || item.thumb || '';
        }
        return '';
      })
      .filter(isValidUrl);
  }
  
  // String handling
  if (typeof value === 'string') {
    const str = value.trim();
    if (!str) return [];
    
    // Try JSON parse if looks like array
    if (str.startsWith('[') && str.endsWith(']')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
          return parseImages(parsed);
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }
    
    // Pipe-separated
    if (str.includes('|') && str.includes('http')) {
      return str.split('|').map(s => s.trim()).filter(isValidUrl);
    }
    
    // Comma-separated (only if multiple URLs)
    if (str.includes(',') && (str.match(/https?:\/\//g) || []).length > 1) {
      return str.split(',').map(s => s.trim()).filter(isValidUrl);
    }
    
    // Single URL
    if (isValidUrl(str)) {
      return [str];
    }
  }
  
  return [];
}

function normalizeProduct(product) {
  if (!product) return { product: null, changed: false };
  
  const original = JSON.stringify(product);
  const normalized = { ...product };
  
  // Collect all potential image sources
  let images = [];
  
  // Priority order for image sources
  const sources = [
    product.images,
    product.image,
    product.image_url,
    product.imageUrl,
    product.resolved_image,
    product.main_image,
    product.thumbImage,
    product.thumbnail,
    product.cj_image,
    product.galleryImages,
    product.gallery_images,
    product.gallery,
    product.media
  ];
  
  for (const source of sources) {
    const parsed = parseImages(source);
    images.push(...parsed);
  }
  
  // Add variant images
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      if (v.image) images.push(...parseImages(v.image));
      if (v.images) images.push(...parseImages(v.images));
      if (v.imageUrl) images.push(...parseImages(v.imageUrl));
    }
  }
  
  // Deduplicate while preserving order
  images = [...new Set(images)];
  
  // Filter out invalid/localhost URLs
  images = images.filter(url => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim().toLowerCase();
    if (trimmed.includes('localhost')) return false;
    if (trimmed.includes('127.0.0.1')) return false;
    if (trimmed.includes('0.0.0.0')) return false;
    // Reject base URLs without actual image paths
    if (/^https?:\/\/[^\/]+\/?$/.test(url.trim())) return false;
    return true;
  });
  
  // Set CANONICAL image schema
  normalized.images = images;
  normalized.thumbnail = images.length > 0 ? images[0] : null;
  normalized.mainImage = normalized.thumbnail;
  
  // Also set legacy fields for backward compatibility
  if (images.length > 0) {
    normalized.image = images[0];
    normalized.resolved_image = images[0];
    normalized.thumbImage = images[0];
  }
  
  const changed = JSON.stringify(normalized) !== original;
  
  return { product: normalized, changed };
}

function normalizeCatalog(products) {
  if (!Array.isArray(products)) {
    console.warn('[NormalizeCatalog] Input is not an array');
    return { products: [], changedCount: 0, warnings: [] };
  }
  
  const warnings = [];
  let changedCount = 0;
  
  const normalizedProducts = products.map((p, index) => {
    const { product, changed } = normalizeProduct(p);
    
    if (changed) changedCount++;
    
    // Validation warnings
    const id = product?.product_id || product?.id || `index-${index}`;
    const slug = product?.slug || 'no-slug';
    
    if (!product?.images || product.images.length === 0) {
      warnings.push(`Product ${id} (${slug}): No valid images found`);
    }
    
    if (!product?.product_id && !product?.id) {
      warnings.push(`Product at index ${index}: Missing product_id`);
    }
    
    return product;
  });
  
  return {
    products: normalizedProducts,
    changedCount,
    warnings
  };
}

module.exports = {
  normalizeCatalog,
  normalizeProduct,
  parseImages,
  isValidUrl
};
