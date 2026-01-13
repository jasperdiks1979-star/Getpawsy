const { parseCSV } = require("./csvImport");
const { cacheImage, ensureCacheDir } = require("./imageCache");
const { log } = require("./logger");
const petEligibility = require("./petEligibility");

const BATCH_SIZE = parseInt(process.env.CJ_IMPORT_BATCH_SIZE || "10");
const IMAGE_TIMEOUT = parseInt(process.env.CJ_IMAGE_TIMEOUT || "8000");

let importProgress = {
  status: "idle",
  phase: "",
  totalRows: 0,
  parsedProducts: 0,
  currentBatch: 0,
  totalBatches: 0,
  imagesTotal: 0,
  imagesCached: 0,
  imagesFailed: 0,
  productsImported: 0,
  productsBlocked: 0,
  blockedReasons: {},
  errors: [],
  startedAt: null,
  finishedAt: null
};

function getImportProgress() {
  return { ...importProgress };
}

function resetProgress() {
  importProgress = {
    status: "idle",
    phase: "",
    totalRows: 0,
    parsedProducts: 0,
    currentBatch: 0,
    totalBatches: 0,
    imagesTotal: 0,
    imagesCached: 0,
    imagesFailed: 0,
    productsImported: 0,
    productsBlocked: 0,
    blockedReasons: {},
    errors: [],
    startedAt: null,
    finishedAt: null
  };
}

function calcPrice(basePrice) {
  if (basePrice <= 0) return 0;
  let multiplier = 1.6;
  if (basePrice < 10) multiplier = 3.0;
  else if (basePrice <= 30) multiplier = 2.4;
  else if (basePrice <= 60) multiplier = 2.0;
  return Math.round((basePrice * multiplier) * 100 + 99) / 100;
}

function extractOptions(raw) {
  const optionKeys = [
    "variant", "variant name", "option", "color", "colour",
    "size", "style", "material", "Variant", "Variant Name",
    "Option", "Color", "Colour", "Size", "Style", "Material"
  ];

  const options = {};
  for (const key of optionKeys) {
    const val = raw[key] || raw[key.toLowerCase()] || "";
    if (val && typeof val === "string" && val.trim()) {
      const capKey = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
      if (!options[capKey]) options[capKey] = val.trim();
    }
  }
  return Object.keys(options).length > 0 ? options : null;
}

function extractImageUrls(raw, columns) {
  let images = [];
  for (const col of columns) {
    const val = raw[col] || raw[col.toLowerCase()] || "";
    if (val && typeof val === "string" && val.trim()) {
      const urls = val.split(/[,|;\s]+/).filter(u => u && u.trim());
      for (const u of urls) {
        let url = u.trim();
        if (url.match(/^https?:\/\//)) {
          if (url.startsWith("http://")) url = "https://" + url.slice(7);
          if (!images.includes(url)) images.push(url);
        }
      }
    }
  }
  return images;
}

function getVariantImageUrl(raw) {
  const cols = ["variant image", "variant images", "Variant Image", "Variant Images", "sku image", "SKU Image"];
  const urls = extractImageUrls(raw, cols);
  return urls.length > 0 ? urls[0] : null;
}

function getProductImageUrls(raw) {
  const cols = [
    "product image", "main image", "image url", "images", "image",
    "Product Image", "Main Image", "Image URL", "Images", "Image"
  ];
  return extractImageUrls(raw, cols);
}

async function cacheImageWithTimeout(url, timeoutMs = IMAGE_TIMEOUT) {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => {
      log(`[CJ Import] Image timeout: ${url}`);
      resolve({ ok: false, url, cached: url, error: "timeout" });
    }, timeoutMs);

    try {
      const cached = await cacheImage(url);
      clearTimeout(timer);
      const success = cached && cached.startsWith("/cache/");
      resolve({ ok: success, url, cached, error: success ? null : "cache_failed" });
    } catch (err) {
      clearTimeout(timer);
      log(`[CJ Import] Image error: ${url} - ${err.message}`);
      resolve({ ok: false, url, cached: url, error: err.message });
    }
  });
}

function generateDescription(title, category) {
  if (!title) return "Quality pet product for your furry friend.";
  
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes("toy")) {
    return `Fun and engaging ${title.toLowerCase()} to keep your pet entertained. Durable and safe for daily play.`;
  }
  if (titleLower.includes("bed") || titleLower.includes("mat")) {
    return `Comfortable ${title.toLowerCase()} for your pet's rest. Soft materials for maximum relaxation.`;
  }
  if (titleLower.includes("bowl") || titleLower.includes("feeder")) {
    return `Practical ${title.toLowerCase()} for easy feeding. Easy to clean and maintain.`;
  }
  if (titleLower.includes("collar") || titleLower.includes("leash") || titleLower.includes("harness")) {
    return `Durable ${title.toLowerCase()} for safe walks. Comfortable fit for your pet.`;
  }
  if (titleLower.includes("brush") || titleLower.includes("groom")) {
    return `Professional ${title.toLowerCase()} for a healthy coat. Gentle on your pet's skin.`;
  }
  
  return `High-quality ${title}. Perfect for pet owners who want the best for their companions.`;
}

// Parse simple CJ CSV format: SPU, Name, Link (with duplicate merging)
async function parseCJCSVSimple(csvText) {
  resetProgress();
  importProgress.status = "parsing";
  importProgress.phase = "Parsing CSV rows";
  importProgress.startedAt = new Date().toISOString();
  ensureCacheDir();

  const lines = csvText.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  if (lines.length < 2) {
    log(`[CJ Import] No CSV rows found`);
    return [];
  }

  // Parse header - detect column positions
  const headerLine = lines[0];
  const headers = headerLine.split(",").map(h => h.replace(/^["']|["']$/g, "").trim().toLowerCase());
  const spuIdx = headers.findIndex(h => h.includes("spu"));
  const nameIdx = headers.findIndex(h => h.includes("name"));

  if (spuIdx < 0 || nameIdx < 0) {
    log(`[CJ Import] Invalid CSV header - need SPU and product name columns`);
    importProgress.errors.push("CSV missing SPU or name column");
    return [];
  }

  // Group products by SPU (merge duplicates)
  const productsByKey = {};
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map(p => p.replace(/^["']|["']$/g, "").trim());
    if (parts.length <= Math.max(spuIdx, nameIdx)) continue;

    const spu = parts[spuIdx];
    const name = parts[nameIdx];
    if (!spu || !name) continue;

    if (!productsByKey[spu]) {
      productsByKey[spu] = { name, variantCount: 0, category: detectCategory(name) };
    }
    productsByKey[spu].variantCount++;
  }

  const productKeys = Object.keys(productsByKey);
  importProgress.parsedProducts = productKeys.length;
  importProgress.totalBatches = Math.ceil(productKeys.length / BATCH_SIZE);
  importProgress.phase = `Grouped ${productKeys.length} unique SPUs from ${lines.length - 1} rows`;
  log(`[CJ Import] Grouped ${productKeys.length} unique SPUs with ${lines.length - 1} total rows (merged duplicates)`);

  importProgress.status = "processing";
  importProgress.phase = "Processing products";

  const allProducts = [];
  let totalErrors = 0;

  // Process each product
  for (let i = 0; i < productKeys.length; i++) {
    const key = productKeys[i];
    const meta = productsByKey[key];

    try {
      const variants = [];
      
      // Create variants for each duplicate (they represent different options)
      for (let v = 0; v < meta.variantCount; v++) {
        variants.push({
          sku: `${key}_v${v + 1}`,
          price: calcPrice(15.99),
          options: v > 0 ? { Option: `Variant ${v + 1}` } : null,
          imageUrl: null
        });
      }

      const product = {
        id: key,
        spu: key,
        title: meta.name,
        description: generateDescription(meta.name, meta.category),
        category: meta.category,
        variants,
        productImageUrls: [],
        source: "CJ",
        warehouse: "US",
        is_us: true
      };

      const eligibility = petEligibility.evaluateEligibility(product);
      if (!eligibility.ok) {
        importProgress.productsBlocked++;
        const reason = eligibility.denyReason ? eligibility.denyReason.split(':')[1] || 'other' : 'low_score';
        importProgress.blockedReasons[reason] = (importProgress.blockedReasons[reason] || 0) + 1;
        log(`[CJ Import] Blocked non-pet product: ${meta.name} (${eligibility.denyReason})`);
        continue;
      }

      allProducts.push(product);

      if ((i + 1) % BATCH_SIZE === 0) {
        importProgress.currentBatch = Math.floor(i / BATCH_SIZE) + 1;
        importProgress.phase = `Batch ${importProgress.currentBatch}/${importProgress.totalBatches}`;
      }
    } catch (err) {
      totalErrors++;
      if (importProgress.errors.length < 50) {
        importProgress.errors.push(`Product ${key}: ${err.message}`);
      }
      log(`[CJ Import] Error processing ${key}: ${err.message}`);
    }
  }

  // Since this CSV has no images, skip image caching phase
  importProgress.imagesTotal = 0;
  importProgress.imagesCached = 0;
  importProgress.phase = "Finalizing products";

  const finalProducts = allProducts.map(p => ({
    id: p.id,
    spu: p.spu,
    title: p.title,
    description: p.description,
    category: p.category,
    variants: p.variants.map(v => ({
      sku: v.sku,
      price: v.price,
      options: v.options,
      image: null
    })),
    image: "/img/placeholder.png",
    images: ["/img/placeholder.png"],
    source: p.source,
    warehouse: p.warehouse,
    is_us: p.is_us,
    import_date: new Date().toISOString()
  }));

  importProgress.productsImported = finalProducts.length;
  importProgress.status = "complete";
  importProgress.phase = "Import complete";
  importProgress.finishedAt = new Date().toISOString();

  const successRate = totalErrors === 0 ? "100%" : `${Math.round(100 * finalProducts.length / (finalProducts.length + totalErrors))}%`;
  log(`[CJ Import] Complete: ${finalProducts.length} products imported, ${importProgress.productsBlocked} blocked (${successRate} success rate)`);

  return finalProducts;
}

function detectCategory(title) {
  const titleLower = title.toLowerCase();
  if (titleLower.includes("toy")) return "dog-toys";
  if (titleLower.includes("bed") || titleLower.includes("house") || titleLower.includes("mat")) return "beds";
  if (titleLower.includes("bowl") || titleLower.includes("feeder") || titleLower.includes("cup")) return "feeding";
  if (titleLower.includes("collar") || titleLower.includes("leash") || titleLower.includes("harness")) return "collars";
  if (titleLower.includes("brush") || titleLower.includes("groom") || titleLower.includes("comb")) return "grooming";
  if (titleLower.includes("cat")) return "cat-toys";
  if (titleLower.includes("travel") || titleLower.includes("carrier")) return "travel";
  return "supplies";
}

async function parseCJCSVRobust(csvText) {
  resetProgress();
  importProgress.status = "parsing";
  importProgress.phase = "Parsing CSV rows";
  importProgress.startedAt = new Date().toISOString();

  ensureCacheDir();

  let rawProducts;
  try {
    rawProducts = parseCSV(csvText);
  } catch (err) {
    importProgress.status = "error";
    importProgress.errors.push(`CSV parse error: ${err.message}`);
    log(`[CJ Import] CSV parse error: ${err.message}`);
    return [];
  }

  importProgress.totalRows = rawProducts.length;
  log(`[CJ Import] Parsed ${rawProducts.length} CSV rows`);

  const productsByKey = {};
  const metadata = {};

  for (const raw of rawProducts) {
    const spu = (raw.spu || raw.SPU || raw.productId || raw["Product ID"] || "").trim();
    const sku = (raw.sku || raw.SKU || "").trim();

    if (!spu && !sku) continue;

    const key = spu || sku;

    if (!productsByKey[key]) {
      productsByKey[key] = [];
      
      let description = (raw.description || raw.Description || raw["Product Description"] || "").trim();
      if (!description || description.length < 10) {
        const title = (raw["product name"] || raw["product title"] || raw.name || 
                      raw["Product Name"] || raw["Product Title"] || raw.Name || "").trim();
        const category = (raw.category || raw.Category || "").trim();
        description = generateDescription(title, category);
      }

      metadata[key] = {
        title: (
          raw["product name"] || raw["product title"] || raw.name ||
          raw["Product Name"] || raw["Product Title"] || raw.Name || "CJ Product"
        ).trim(),
        description,
        spu: spu,
        category: (raw.category || raw.Category || "general").toLowerCase(),
        warehouse: (raw.warehouse || raw.Warehouse || raw["Ship From"] || raw["ship from"] || "").toLowerCase(),
        shipFrom: (raw["ship from"] || raw["Ship From"] || "").toLowerCase(),
        country: (raw.country || raw.Country || "").toLowerCase(),
        shippingFee: parseFloat(raw["shipping fee"] || raw["Shipping Fee"] || raw.shipping || 0) || 0
      };
    }

    productsByKey[key].push(raw);
  }

  const productKeys = Object.keys(productsByKey);
  importProgress.parsedProducts = productKeys.length;
  importProgress.totalBatches = Math.ceil(productKeys.length / BATCH_SIZE);
  log(`[CJ Import] Grouped into ${productKeys.length} products`);

  importProgress.status = "processing";
  importProgress.phase = "Processing products with image caching";

  const allProducts = [];
  let imageQueue = [];

  for (let i = 0; i < productKeys.length; i++) {
    const spuKey = productKeys[i];
    const rows = productsByKey[spuKey];
    const meta = metadata[spuKey];

    const variants = [];
    const productImageUrls = getProductImageUrls(rows[0]);

    for (const imgUrl of productImageUrls) {
      if (!imageQueue.find(q => q.url === imgUrl)) {
        imageQueue.push({ url: imgUrl, type: "product", productId: spuKey });
      }
    }

    for (const raw of rows) {
      const sku = (raw.sku || raw.SKU || "").trim();
      const sellPrice = parseFloat(raw["sell price"] || raw["Sell Price"] || raw.price || raw.Price || 0);
      const price = calcPrice(sellPrice);

      const options = extractOptions(raw);
      const variantImageUrl = getVariantImageUrl(raw);

      if (variantImageUrl && !imageQueue.find(q => q.url === variantImageUrl)) {
        imageQueue.push({ url: variantImageUrl, type: "variant", productId: spuKey, sku });
      }

      variants.push({
        sku: sku || `${spuKey}_var_${variants.length}`,
        price,
        options,
        imageUrl: variantImageUrl
      });
    }

    const warehouse = meta.warehouse || meta.shipFrom || meta.country || "Unknown";
    const usKeywords = ["us", "usa", "united states", "america"];
    const isUS =
      usKeywords.some(kw => warehouse.includes(kw)) ||
      usKeywords.some(kw => meta.shipFrom.includes(kw)) ||
      usKeywords.some(kw => meta.country.includes(kw));

    const productForCheck = {
      title: meta.title,
      description: meta.description,
      category: meta.category,
      variants,
      images: productImageUrls
    };
    
    const eligibility = petEligibility.evaluateEligibility(productForCheck);
    if (!eligibility.ok) {
      importProgress.productsBlocked++;
      const reason = eligibility.denyReason ? eligibility.denyReason.split(':')[1] || 'other' : 'low_score';
      importProgress.blockedReasons[reason] = (importProgress.blockedReasons[reason] || 0) + 1;
      log(`[CJ Import] Blocked non-pet product: ${meta.title} (${eligibility.denyReason})`);
      continue;
    }

    allProducts.push({
      id: spuKey,
      spu: meta.spu || spuKey,
      title: meta.title,
      description: meta.description,
      category: meta.category,
      variants,
      productImageUrls,
      source: "CJ",
      shipping_fee: meta.shippingFee,
      shipping_note: !isUS ? "Shipping time may vary" : undefined,
      warehouse,
      is_us: isUS
    });

    if ((i + 1) % BATCH_SIZE === 0) {
      importProgress.currentBatch = Math.floor(i / BATCH_SIZE) + 1;
      importProgress.phase = `Parsed batch ${importProgress.currentBatch}/${importProgress.totalBatches}`;
    }
  }

  importProgress.imagesTotal = imageQueue.length;
  importProgress.phase = `Caching ${imageQueue.length} images sequentially`;
  log(`[CJ Import] Starting sequential image cache for ${imageQueue.length} images`);

  const imageCache = {};
  
  for (let i = 0; i < imageQueue.length; i++) {
    const item = imageQueue[i];
    
    if (i % 10 === 0) {
      importProgress.phase = `Caching image ${i + 1}/${imageQueue.length}`;
    }

    const result = await cacheImageWithTimeout(item.url);
    imageCache[item.url] = result.cached;

    if (result.ok) {
      importProgress.imagesCached++;
    } else {
      importProgress.imagesFailed++;
      if (importProgress.errors.length < 50) {
        importProgress.errors.push(`Image failed: ${item.url} (${result.error})`);
      }
    }

    if ((i + 1) % 20 === 0) {
      log(`[CJ Import] Image progress: ${i + 1}/${imageQueue.length} (${importProgress.imagesCached} ok, ${importProgress.imagesFailed} failed)`);
    }
  }

  importProgress.phase = "Finalizing products";

  const finalProducts = allProducts.map(p => {
    const cachedProductImages = p.productImageUrls.map(url => imageCache[url] || url);
    
    const finalVariants = p.variants.map(v => ({
      sku: v.sku,
      price: v.price,
      options: v.options,
      image: v.imageUrl ? (imageCache[v.imageUrl] || v.imageUrl) : null
    }));

    const allImages = [...cachedProductImages];
    finalVariants.forEach(v => {
      if (v.image && !allImages.includes(v.image)) {
        allImages.push(v.image);
      }
    });

    return {
      id: p.id,
      spu: p.spu,
      title: p.title,
      description: p.description,
      category: p.category,
      price: finalVariants[0]?.price || 0,
      image: allImages[0] || "/img/placeholder.png",
      images: allImages.length > 0 ? allImages : ["/img/placeholder.png"],
      variants: finalVariants,
      source: p.source,
      shipping_fee: p.shipping_fee,
      shipping_note: p.shipping_note,
      warehouse: p.warehouse,
      is_us: p.is_us
    };
  });

  importProgress.productsImported = finalProducts.length;
  importProgress.status = "complete";
  importProgress.phase = "Import complete";
  importProgress.finishedAt = new Date().toISOString();

  log(`[CJ Import] Complete: ${finalProducts.length} products, ${importProgress.productsBlocked} blocked, ${importProgress.imagesCached} images cached, ${importProgress.imagesFailed} failed`);

  return finalProducts;
}

module.exports = {
  parseCJCSVRobust,
  parseCJCSVSimple,
  getImportProgress,
  resetProgress
};
