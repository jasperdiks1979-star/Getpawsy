const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CJ_BASE_URL = 'https://developers.cjdropshipping.com/api2.0/v1';

async function getAccessToken() {
  const cjClient = require('./cjClient');
  return cjClient.getAccessToken();
}

async function fetchProductVariants(pid) {
  try {
    const token = await getAccessToken();
    
    const response = await axios.get(
      `${CJ_BASE_URL}/product/query`,
      {
        params: { pid },
        headers: { 'CJ-Access-Token': token },
        timeout: 30000
      }
    );

    const product = response.data?.data || response.data?.result;
    if (!product) return null;

    return {
      product,
      variants: product.variants || [],
      productKeyEn: product.productKeyEn || null,
      images: extractProductImages(product)
    };
  } catch (err) {
    console.error(`[CJ Variants] Error fetching ${pid}:`, err.message);
    return null;
  }
}

function extractProductImages(cjProduct) {
  const images = new Set();
  
  if (cjProduct.productImage) {
    if (Array.isArray(cjProduct.productImage)) {
      cjProduct.productImage.forEach(img => images.add(img));
    } else if (typeof cjProduct.productImage === 'string') {
      images.add(cjProduct.productImage);
    }
  }
  
  if (cjProduct.productImageSet && Array.isArray(cjProduct.productImageSet)) {
    cjProduct.productImageSet.forEach(img => {
      if (img) images.add(img);
    });
  }
  
  if (cjProduct.bigImage) images.add(cjProduct.bigImage);
  
  return [...images].slice(0, 10);
}

function normalizeVariantOptions(variant, productKeyEn) {
  const options = {};
  const optionTypes = parseOptionTypes(productKeyEn);
  
  if (variant.variantKey) {
    if (Array.isArray(variant.variantKey)) {
      variant.variantKey.forEach((value, index) => {
        const optionName = optionTypes[index] || `Option${index + 1}`;
        if (value && String(value).trim()) {
          options[optionName] = String(value).trim();
        }
      });
    } else if (typeof variant.variantKey === 'string' && variant.variantKey.trim()) {
      const keyValue = variant.variantKey.trim();
      const optionName = optionTypes[0] || 'Type';
      options[optionName] = keyValue;
    }
  }
  
  if (Object.keys(options).length === 0 && variant.variantNameEn && variant.variantNameEn.trim()) {
    const nameEn = variant.variantNameEn.trim();
    const optionName = optionTypes[0] || 'Type';
    options[optionName] = nameEn;
  }
  
  if (Object.keys(options).length === 0 && variant.variantName && variant.variantName.trim()) {
    options['Type'] = variant.variantName.trim();
  }
  
  if (Object.keys(options).length === 0) {
    options['Type'] = 'Standard';
  }
  
  return options;
}

function parseOptionTypes(productKeyEn) {
  if (!productKeyEn) return ['Type'];
  
  const normalized = productKeyEn
    .replace(/[\[\]"]/g, '')
    .split(/[,\/]+/)
    .map(s => s.trim())
    .filter(Boolean);
  
  return normalized.length > 0 ? normalized : ['Type'];
}

const COLORS = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'pink', 'purple', 'orange', 'brown', 'gray', 'grey', 'beige', 'navy', 'gold', 'silver', 'multicolor'];
const SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '2xl', '3xl', 'small', 'medium', 'large', 'extra large', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48'];

function isColor(str) {
  return COLORS.includes(str.toLowerCase());
}

function isSize(str) {
  return SIZES.includes(str.toLowerCase());
}

function buildVariantTitle(options) {
  const parts = [];
  const order = ['Color', 'Size', 'Type', 'Material', 'Style'];
  
  for (const key of order) {
    if (options[key]) {
      parts.push(options[key]);
    }
  }
  
  for (const [key, value] of Object.entries(options)) {
    if (!order.includes(key)) {
      parts.push(value);
    }
  }
  
  return parts.join(' / ');
}

function normalizeVariants(cjProduct) {
  const productKeyEn = cjProduct.productKeyEn;
  const variants = [];
  
  if (cjProduct.variants && Array.isArray(cjProduct.variants)) {
    for (const v of cjProduct.variants) {
      const options = normalizeVariantOptions(v, productKeyEn);
      const variantTitle = buildVariantTitle(options);
      
      variants.push({
        id: v.vid || `${cjProduct.pid}-${variants.length}`,
        sku: v.variantSku || `${cjProduct.productSku}-${variants.length}`,
        cj_vid: v.vid,
        cj_sku: v.variantSku,
        title: variantTitle,
        price: parseFloat(v.variantSellPrice) || parseFloat(cjProduct.sellPrice) || 0,
        compareAt: null,
        cost: parseFloat(v.variantSellPrice) || 0,
        inventory: parseInt(v.variantStock) || 100,
        weight: parseFloat(v.variantWeight) || parseFloat(cjProduct.productWeight) || 0,
        weightUnit: 'g',
        image: v.variantImage || cjProduct.productImage || null,
        options: options,
        active: true
      });
    }
  }
  
  if (variants.length === 0) {
    variants.push({
      id: `${cjProduct.pid}-STD`,
      sku: `${cjProduct.productSku || cjProduct.pid}-STD`,
      cj_vid: null,
      cj_sku: cjProduct.productSku,
      title: 'Standard',
      price: parseFloat(cjProduct.sellPrice) || 0,
      compareAt: null,
      cost: parseFloat(cjProduct.sellPrice) || 0,
      inventory: 100,
      weight: parseFloat(cjProduct.productWeight) || 0,
      weightUnit: 'g',
      image: cjProduct.productImage || null,
      options: { Type: 'Standard' },
      active: true
    });
  }
  
  return variants;
}

function buildOptionsSchema(variants) {
  const optionTypes = {};
  
  for (const v of variants) {
    if (v.options) {
      for (const [key, value] of Object.entries(v.options)) {
        if (!optionTypes[key]) {
          optionTypes[key] = new Set();
        }
        optionTypes[key].add(String(value));
      }
    }
  }
  
  return Object.entries(optionTypes).map(([name, values]) => ({
    name,
    values: [...values].sort()
  }));
}

function getPriceRange(variants) {
  if (!variants || variants.length === 0) return { min: 0, max: 0 };
  
  const prices = variants.map(v => v.price).filter(p => p > 0);
  if (prices.length === 0) return { min: 0, max: 0 };
  
  return {
    min: Math.min(...prices),
    max: Math.max(...prices)
  };
}

function applyMarkup(cost) {
  if (!cost || cost <= 0) return 19.99;
  
  let factor;
  if (cost < 5) factor = 3.0;
  else if (cost < 10) factor = 2.5;
  else if (cost < 25) factor = 2.2;
  else if (cost < 50) factor = 2.0;
  else if (cost < 100) factor = 1.8;
  else factor = 1.6;
  
  const price = cost * factor;
  
  if (price < 10) return 9.99;
  if (price > 500) return Math.floor(price / 10) * 10 - 0.01;
  return Math.floor(price) + 0.99;
}

function applyMarkupToVariants(variants) {
  return variants.map(v => ({
    ...v,
    price: applyMarkup(v.cost)
  }));
}

module.exports = {
  fetchProductVariants,
  extractProductImages,
  normalizeVariantOptions,
  normalizeVariants,
  buildOptionsSchema,
  getPriceRange,
  buildVariantTitle,
  applyMarkup,
  applyMarkupToVariants
};
