/**
 * Product Audit Module
 * Detect duplicates, missing images, and data quality issues
 */

const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const CACHE_DIR = path.join(__dirname, '..', 'public', 'cache', 'images');

/**
 * Find products with duplicate main images
 * @param {Array} products - List of products
 * @returns {Object} - Groups of products sharing the same image
 */
function findDuplicateImages(products) {
  const imageMap = new Map();
  
  for (const product of products) {
    if (!product.image || product.rejected || product.deletedAt) continue;
    
    const normalizedImage = normalizeImagePath(product.image);
    if (!normalizedImage) continue;
    
    if (!imageMap.has(normalizedImage)) {
      imageMap.set(normalizedImage, []);
    }
    imageMap.set(normalizedImage, [...imageMap.get(normalizedImage), {
      id: product.id,
      title: product.title,
      image: product.image,
      price: product.price,
      active: product.active,
      source: product.source || 'unknown'
    }]);
  }
  
  const duplicates = [];
  for (const [image, prods] of imageMap.entries()) {
    if (prods.length > 1) {
      duplicates.push({
        image,
        count: prods.length,
        products: prods
      });
    }
  }
  
  duplicates.sort((a, b) => b.count - a.count);
  
  return {
    totalDuplicateGroups: duplicates.length,
    totalAffectedProducts: duplicates.reduce((sum, g) => sum + g.count, 0),
    groups: duplicates
  };
}

/**
 * Find products with duplicate or very similar titles
 * @param {Array} products - List of products
 * @returns {Object} - Groups of products with similar titles
 */
function findDuplicateTitles(products) {
  const titleMap = new Map();
  
  for (const product of products) {
    if (!product.title || product.rejected || product.deletedAt) continue;
    
    const normalizedTitle = normalizeTitle(product.title);
    if (!normalizedTitle || normalizedTitle.length < 5) continue;
    
    if (!titleMap.has(normalizedTitle)) {
      titleMap.set(normalizedTitle, []);
    }
    titleMap.set(normalizedTitle, [...titleMap.get(normalizedTitle), {
      id: product.id,
      title: product.title,
      image: product.image,
      price: product.price,
      active: product.active,
      source: product.source || 'unknown'
    }]);
  }
  
  const duplicates = [];
  for (const [title, prods] of titleMap.entries()) {
    if (prods.length > 1) {
      duplicates.push({
        normalizedTitle: title,
        count: prods.length,
        products: prods
      });
    }
  }
  
  duplicates.sort((a, b) => b.count - a.count);
  
  return {
    totalDuplicateGroups: duplicates.length,
    totalAffectedProducts: duplicates.reduce((sum, g) => sum + g.count, 0),
    groups: duplicates
  };
}

/**
 * Find products with missing, invalid, or placeholder images
 * @param {Array} products - List of products
 * @returns {Object} - List of products with image issues
 */
function findMissingImages(products) {
  const issues = [];
  
  const invalidPatterns = [
    'placeholder', 'default', 'no-image', 'noimage', 
    'demo', 'sample', 'stock', 'dropship', 'unsplash',
    'pexels', 'pixabay', 'shutterstock'
  ];
  
  for (const product of products) {
    if (product.rejected || product.deletedAt) continue;
    
    const issue = {
      id: product.id,
      title: product.title,
      image: product.image,
      active: product.active,
      source: product.source || 'unknown',
      issues: []
    };
    
    if (!product.image) {
      issue.issues.push('no_image');
    } else {
      const lowerImage = product.image.toLowerCase();
      
      for (const pattern of invalidPatterns) {
        if (lowerImage.includes(pattern)) {
          issue.issues.push(`placeholder_${pattern}`);
          break;
        }
      }
      
      if (product.image.startsWith('/cache/images/')) {
        const filePath = path.join(__dirname, '..', 'public', product.image);
        if (!fs.existsSync(filePath)) {
          issue.issues.push('file_missing');
        }
      }
      
      if (product.image.startsWith('http')) {
        issue.issues.push('external_url');
      }
    }
    
    if (issue.issues.length > 0) {
      issues.push(issue);
    }
  }
  
  const byIssueType = {};
  for (const issue of issues) {
    for (const type of issue.issues) {
      if (!byIssueType[type]) byIssueType[type] = 0;
      byIssueType[type]++;
    }
  }
  
  return {
    totalProducts: issues.length,
    byIssueType,
    products: issues
  };
}

/**
 * Find products with variant issues
 * @param {Array} products - List of products
 * @returns {Object} - Products with variant problems
 */
function findSuspectVariants(products) {
  const issues = [];
  
  for (const product of products) {
    if (product.rejected || product.deletedAt) continue;
    
    const productIssues = [];
    
    if (!product.variants || product.variants.length === 0) {
      productIssues.push('no_variants');
    } else {
      const skus = new Set();
      for (const variant of product.variants) {
        if (!variant.sku) {
          productIssues.push('variant_missing_sku');
        } else if (skus.has(variant.sku)) {
          productIssues.push('duplicate_sku');
        } else {
          skus.add(variant.sku);
        }
        
        if (!variant.price || variant.price <= 0) {
          productIssues.push('variant_invalid_price');
        }
        
        if (!variant.options || Object.keys(variant.options).length === 0) {
          productIssues.push('variant_no_options');
        }
      }
      
      if (product.variants.length > 100) {
        productIssues.push('excessive_variants');
      }
    }
    
    if (productIssues.length > 0) {
      issues.push({
        id: product.id,
        title: product.title,
        variantCount: product.variants?.length || 0,
        active: product.active,
        source: product.source || 'unknown',
        issues: [...new Set(productIssues)]
      });
    }
  }
  
  const byIssueType = {};
  for (const item of issues) {
    for (const type of item.issues) {
      if (!byIssueType[type]) byIssueType[type] = 0;
      byIssueType[type]++;
    }
  }
  
  return {
    totalProducts: issues.length,
    byIssueType,
    products: issues
  };
}

/**
 * Find products with pricing issues
 * @param {Array} products - List of products
 * @returns {Object} - Products with pricing problems
 */
function findPricingIssues(products) {
  const issues = [];
  
  for (const product of products) {
    if (product.rejected || product.deletedAt) continue;
    
    const productIssues = [];
    
    if (!product.price || product.price <= 0) {
      productIssues.push('invalid_base_price');
    } else if (product.price < 1) {
      productIssues.push('price_too_low');
    } else if (product.price > 10000) {
      productIssues.push('price_suspiciously_high');
    }
    
    if (product.variants && product.variants.length > 0) {
      const prices = product.variants.map(v => v.price).filter(p => p > 0);
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        if (maxPrice > minPrice * 10) {
          productIssues.push('extreme_variant_price_range');
        }
      }
    }
    
    if (productIssues.length > 0) {
      issues.push({
        id: product.id,
        title: product.title,
        price: product.price,
        active: product.active,
        source: product.source || 'unknown',
        issues: productIssues
      });
    }
  }
  
  const byIssueType = {};
  for (const item of issues) {
    for (const type of item.issues) {
      if (!byIssueType[type]) byIssueType[type] = 0;
      byIssueType[type]++;
    }
  }
  
  return {
    totalProducts: issues.length,
    byIssueType,
    products: issues
  };
}

/**
 * Run full audit on all products
 * @param {Array} products - List of products
 * @returns {Object} - Complete audit results
 */
function runFullAudit(products) {
  log(`[Audit] Running full audit on ${products.length} products`);
  
  const activeProducts = products.filter(p => !p.rejected && !p.deletedAt);
  
  const duplicateImages = findDuplicateImages(activeProducts);
  const duplicateTitles = findDuplicateTitles(activeProducts);
  const missingImages = findMissingImages(activeProducts);
  const suspectVariants = findSuspectVariants(activeProducts);
  const pricingIssues = findPricingIssues(activeProducts);
  
  const totalIssues = 
    duplicateImages.totalDuplicateGroups +
    duplicateTitles.totalDuplicateGroups +
    missingImages.totalProducts +
    suspectVariants.totalProducts +
    pricingIssues.totalProducts;
  
  log(`[Audit] Found ${totalIssues} total issues across all categories`);
  
  return {
    summary: {
      totalProducts: activeProducts.length,
      totalIssues,
      duplicateImageGroups: duplicateImages.totalDuplicateGroups,
      duplicateTitleGroups: duplicateTitles.totalDuplicateGroups,
      productsWithImageIssues: missingImages.totalProducts,
      productsWithVariantIssues: suspectVariants.totalProducts,
      productsWithPricingIssues: pricingIssues.totalProducts
    },
    duplicateImages,
    duplicateTitles,
    missingImages,
    suspectVariants,
    pricingIssues,
    auditedAt: new Date().toISOString()
  };
}

/**
 * Normalize image path for comparison
 */
function normalizeImagePath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return null;
  
  let normalized = imagePath.trim().toLowerCase();
  normalized = normalized.replace(/^https?:\/\/[^\/]+/, '');
  normalized = normalized.split('?')[0];
  
  return normalized || null;
}

/**
 * Normalize title for comparison
 */
function normalizeTitle(title) {
  if (!title || typeof title !== 'string') return null;
  
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  findDuplicateImages,
  findDuplicateTitles,
  findMissingImages,
  findSuspectVariants,
  findPricingIssues,
  runFullAudit
};
