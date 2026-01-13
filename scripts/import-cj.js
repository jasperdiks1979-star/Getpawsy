#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { mirrorProductImages, mirrorProductVideos, getLocalImagesForProduct, getLocalVideosForProduct, hasLocalMedia } = require("../src/mediaMirror");

const DATA_DIR = path.join(__dirname, "..", "data");
const SOURCE_FILE = path.join(DATA_DIR, "products_cj.json");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const HERO_FILE = path.join(DATA_DIR, "hero-products.json");

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 80);
}

function detectPetType(product) {
  const text = `${product.name || ""} ${product.title || ""} ${product.description || ""} ${(product.tags || []).join(" ")}`.toLowerCase();
  
  const dogTerms = ["dog", "puppy", "canine", "pup"];
  const catTerms = ["cat", "kitten", "feline", "kitty"];
  const smallPetTerms = ["rabbit", "hamster", "guinea pig", "bird", "fish", "reptile", "turtle", "ferret", "chinchilla"];
  
  const hasDog = dogTerms.some(t => text.includes(t));
  const hasCat = catTerms.some(t => text.includes(t));
  const hasSmallPet = smallPetTerms.some(t => text.includes(t));
  
  if (hasSmallPet) return "small_pet";
  if (hasDog && hasCat) return "both";
  if (hasDog) return "dog";
  if (hasCat) return "cat";
  return "both";
}

function detectCategories(product) {
  const text = `${product.name || ""} ${product.title || ""} ${product.description || ""} ${(product.tags || []).join(" ")}`.toLowerCase();
  const categories = [];
  
  const categoryMap = {
    "toys": ["toy", "ball", "chew", "squeaky", "plush toy", "rope toy"],
    "beds": ["bed", "mattress", "cushion", "pillow", "sleeping"],
    "feeding": ["bowl", "feeder", "water", "food dish", "feeding"],
    "grooming": ["brush", "shampoo", "nail", "grooming", "comb", "trimmer"],
    "travel": ["carrier", "cage", "crate", "travel", "transport", "backpack"],
    "accessories": ["collar", "leash", "harness", "tag", "bandana"],
    "clothing": ["clothes", "costume", "sweater", "jacket", "coat", "dress"],
    "health": ["medicine", "vitamin", "supplement", "health", "care"],
    "training": ["training", "clicker", "treat", "pee pad", "potty"]
  };
  
  for (const [cat, terms] of Object.entries(categoryMap)) {
    if (terms.some(t => text.includes(t))) {
      categories.push(cat);
    }
  }
  
  return categories.length > 0 ? categories : ["accessories"];
}

function normalizeProduct(rawProduct, options = {}) {
  const id = String(rawProduct.id || rawProduct.cj_pid);
  const title = rawProduct.name || rawProduct.title || "Pet Product";
  const slug = rawProduct.slug || slugify(title) || `product-${id}`;
  
  const originalImages = Array.isArray(rawProduct.images) ? rawProduct.images : 
                         (rawProduct.image ? [rawProduct.image] : []);
  const originalVideos = Array.isArray(rawProduct.videos) ? rawProduct.videos : [];
  
  return {
    id,
    title,
    slug,
    price: parseFloat(rawProduct.price) || 0,
    oldPrice: parseFloat(rawProduct.old_price) || null,
    description: rawProduct.description || "",
    categories: detectCategories(rawProduct),
    pet_type: rawProduct.pet_type || detectPetType(rawProduct),
    images: options.keepOriginalImages ? originalImages : [],
    videos: options.keepOriginalVideos ? originalVideos : [],
    originalImages,
    originalVideos,
    rating: parseFloat(rawProduct.rating) || 4.5,
    reviewsCount: parseInt(rawProduct.reviews_count) || 0,
    stock: parseInt(rawProduct.stock) || 100,
    badge: rawProduct.badge || null,
    weight: rawProduct.weight || null,
    variants: rawProduct.variants || [],
    mainCategorySlug: rawProduct.mainCategorySlug || "dogs",
    subcategorySlug: rawProduct.subcategorySlug || "accessories",
    seo: {
      title: `${title} | GetPawsy`,
      description: rawProduct.description || `Shop ${title} for your pet at GetPawsy. Quality pet products with fast shipping.`,
      canonical: `/product/${slug}`
    },
    active: true,
    createdAt: rawProduct.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function processProduct(rawProduct, options = {}) {
  const normalized = normalizeProduct(rawProduct, { 
    keepOriginalImages: options.keepOriginalImages,
    keepOriginalVideos: options.keepOriginalVideos
  });
  
  if (options.downloadMedia !== false) {
    try {
      const imageResult = await mirrorProductImages(rawProduct);
      if (imageResult.localImages && imageResult.localImages.length > 0) {
        const localOnly = imageResult.localImages.filter(img => img.startsWith("/media/"));
        if (localOnly.length > 0) {
          normalized.images = localOnly;
          normalized.hasLocalMedia = true;
        }
      }
      
      if (options.includeVideos) {
        const videoResult = await mirrorProductVideos(rawProduct);
        if (videoResult.localVideos && videoResult.localVideos.length > 0) {
          const localVids = videoResult.localVideos.filter(vid => vid.startsWith("/media/"));
          if (localVids.length > 0) {
            normalized.videos = localVids;
          }
        }
      }
    } catch (err) {
      console.log(`[Import] Media download failed for ${normalized.id}: ${err.message}`);
    }
  }
  
  if (normalized.images.length === 0) {
    const localImages = getLocalImagesForProduct(normalized.id);
    if (localImages.length > 0) {
      normalized.images = localImages;
      normalized.hasLocalMedia = true;
    }
  }
  
  if (normalized.videos.length === 0 && options.includeVideos) {
    const localVideos = getLocalVideosForProduct(normalized.id);
    if (localVideos.length > 0) {
      normalized.videos = localVideos;
    }
  }
  
  if (normalized.images.length === 0 && normalized.originalImages.length > 0) {
    normalized.images = normalized.originalImages;
    normalized.hasLocalMedia = false;
  }
  
  return normalized;
}

async function runImport(options = {}) {
  console.log("[Import] Starting CJ product import pipeline...");
  console.log(`[Import] Options: ${JSON.stringify(options)}`);
  
  if (!fs.existsSync(SOURCE_FILE)) {
    console.error("[Import] FATAL: products_cj.json not found");
    process.exit(1);
  }
  
  const rawData = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
  const rawProducts = Array.isArray(rawData) ? rawData : (rawData.products || []);
  
  console.log(`[Import] Found ${rawProducts.length} raw products`);
  
  const validProducts = rawProducts.filter(p => {
    if (!p.id && !p.cj_pid) return false;
    if (p.is_pet_product === false && p.homepage_eligible === false) return false;
    return true;
  });
  
  console.log(`[Import] ${validProducts.length} products pass initial filter`);
  
  const limit = options.limit || validProducts.length;
  const toProcess = validProducts.slice(0, limit);
  
  const normalizedProducts = [];
  const errors = [];
  
  for (let i = 0; i < toProcess.length; i++) {
    const raw = toProcess[i];
    try {
      const normalized = await processProduct(raw, {
        downloadMedia: options.downloadMedia !== false,
        includeVideos: options.includeVideos || false
      });
      
      if (normalized.images.length > 0 || options.includeNoImages) {
        normalizedProducts.push(normalized);
      } else {
        console.log(`[Import] Skipping ${normalized.id} - no local images`);
      }
      
      if ((i + 1) % 10 === 0) {
        console.log(`[Import] Processed ${i + 1}/${toProcess.length}`);
      }
    } catch (err) {
      console.error(`[Import] Error processing product ${raw.id}: ${err.message}`);
      errors.push({ id: raw.id, error: err.message });
    }
  }
  
  const seenIds = new Set();
  const dedupedProducts = normalizedProducts.filter(p => {
    if (seenIds.has(p.id)) {
      console.log(`[Import] Duplicate skipped: ${p.id}`);
      return false;
    }
    seenIds.add(p.id);
    return true;
  });
  
  const withLocalMedia = dedupedProducts.filter(p => p.hasLocalMedia === true).length;
  const withRemoteOnly = dedupedProducts.filter(p => p.hasLocalMedia !== true && p.images.length > 0).length;
  console.log(`[Import] ${dedupedProducts.length} unique products (${withLocalMedia} with local media, ${withRemoteOnly} with remote URLs)`);
  
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(dedupedProducts, null, 2));
  console.log(`[Import] Saved ${PRODUCTS_FILE}`);
  
  const catalogProducts = dedupedProducts.filter(p => p.active && p.images.length > 0);
  const catalog = {
    products: catalogProducts,
    stats: {
      total: catalogProducts.length,
      dogs: catalogProducts.filter(p => p.pet_type === "dog" || p.pet_type === "both").length,
      cats: catalogProducts.filter(p => p.pet_type === "cat" || p.pet_type === "both").length,
      smallPets: catalogProducts.filter(p => p.pet_type === "small_pet").length
    },
    generatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
  console.log(`[Import] Saved ${CATALOG_FILE} with ${catalogProducts.length} active products`);
  
  const heroProducts = buildHeroProducts(catalogProducts);
  fs.writeFileSync(HERO_FILE, JSON.stringify(heroProducts, null, 2));
  console.log(`[Import] Saved ${HERO_FILE}`);
  
  console.log("\n[Import] === COMPLETE ===");
  console.log(`Total processed: ${toProcess.length}`);
  console.log(`Products saved: ${dedupedProducts.length}`);
  console.log(`Catalog active: ${catalogProducts.length}`);
  console.log(`Errors: ${errors.length}`);
  
  return {
    success: true,
    processed: toProcess.length,
    saved: dedupedProducts.length,
    catalog: catalogProducts.length,
    errors: errors.length
  };
}

function buildHeroProducts(products) {
  const usedIds = new Set();
  
  function pickUnique(list, count) {
    const result = [];
    for (const p of list) {
      if (!usedIds.has(p.id) && result.length < count) {
        usedIds.add(p.id);
        result.push(p.id);
      }
    }
    return result;
  }
  
  const bestSellers = products
    .filter(p => p.badge === "Best Seller" || p.rating >= 4.7)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  
  const trending = products
    .filter(p => p.badge === "Trending")
    .sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
  
  const dogProducts = products
    .filter(p => p.pet_type === "dog" || p.pet_type === "both")
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  
  const catProducts = products
    .filter(p => p.pet_type === "cat" || p.pet_type === "both")
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  
  const smallPetProducts = products
    .filter(p => p.pet_type === "small_pet")
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  
  return {
    bestSellers: pickUnique(bestSellers, 15),
    trending: pickUnique(trending, 15),
    topPicksDogs: pickUnique(dogProducts, 15),
    topPicksCats: pickUnique(catProducts, 15),
    topPicksSmallPets: pickUnique(smallPetProducts, 15),
    generatedAt: new Date().toISOString(),
    totalUsed: usedIds.size
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    limit: null,
    downloadMedia: true,
    includeVideos: false,
    includeNoImages: false
  };
  
  for (const arg of args) {
    if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.split("=")[1]);
    } else if (arg === "--no-download") {
      options.downloadMedia = false;
    } else if (arg === "--videos") {
      options.includeVideos = true;
    } else if (arg === "--include-no-images") {
      options.includeNoImages = true;
    }
  }
  
  runImport(options)
    .then(result => {
      console.log("\n[Import] Result:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error("[Import] Fatal error:", err);
      process.exit(1);
    });
}

module.exports = { runImport, normalizeProduct, buildHeroProducts };
