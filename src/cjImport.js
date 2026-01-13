const { parseCSV } = require("./csvImport");
const { cacheImage, ensureCacheDir } = require("./imageCache");

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

function getVariantImages(raw) {
  const variantImageCols = [
    "variant image", "variant images", "Variant Image", "Variant Images"
  ];
  
  let images = [];
  for (const col of variantImageCols) {
    const val = raw[col] || raw[col.toLowerCase()] || "";
    if (val && typeof val === "string" && val.trim()) {
      const urls = val.split(/[,|\/\s]+/).filter(u => u && u.trim());
      for (const u of urls) {
        let url = u.trim();
        if (url.match(/^https?:\/\//)) {
          if (url.startsWith("http://")) url = "https://" + url.slice(7);
          if (!images.includes(url)) images.push(url);
        }
      }
    }
  }
  return images.length > 0 ? images[0] : null;
}

function getProductImages(raw) {
  const imageColumns = [
    "product image", "main image", "image url", "images", 
    "Product Image", "Main Image", "Image URL", "Images"
  ];
  
  let images = [];
  for (const col of imageColumns) {
    const val = raw[col] || raw[col.toLowerCase()] || "";
    if (val && typeof val === "string" && val.trim()) {
      const urls = val.split(/[,|\/\s]+/).filter(u => u && u.trim());
      for (const u of urls) {
        let url = u.trim();
        if (url.match(/^https?:\/\//)) {
          if (url.startsWith("http://")) url = "https://" + url.slice(7);
          if (!images.includes(url)) images.push(url);
        }
      }
    }
  }
  return images.filter((u, i, a) => a.indexOf(u) === i);
}

async function parseCJCSV(csvText) {
  ensureCacheDir();
  const rawProducts = parseCSV(csvText);
  
  const productsBySpuSku = {};
  const metadata = {};

  for (const raw of rawProducts) {
    const spu = (raw.spu || raw.SPU || "").trim();
    const sku = (raw.sku || raw.SKU || "").trim();
    
    if (!spu && !sku) continue;

    const key = spu || sku;
    
    if (!productsBySpuSku[key]) {
      productsBySpuSku[key] = [];
      metadata[key] = {
        title: (
          raw["product name"] || raw["product title"] || raw.name || 
          raw["Product Name"] || raw["Product Title"] || raw.Name || "CJ Product"
        ).trim(),
        description: (raw.description || raw.Description || "").trim(),
        spu: spu,
        warehouse: (raw.warehouse || raw.Warehouse || "").toLowerCase(),
        shipFrom: (raw["ship from"] || raw["Ship From"] || "").toLowerCase(),
        country: (raw.country || raw.Country || "").toLowerCase(),
        shippingFee: parseFloat(raw["shipping fee"] || raw["Shipping Fee"] || 0)
      };
    }
    
    productsBySpuSku[key].push(raw);
  }

  const normalized = [];

  for (const spuKey in productsBySpuSku) {
    const rows = productsBySpuSku[spuKey];
    const meta = metadata[spuKey];
    
    const variants = [];
    let allImages = [];

    for (const raw of rows) {
      const sku = (raw.sku || raw.SKU || "").trim();
      const sellPrice = parseFloat(raw["sell price"] || raw["Sell Price"] || 0);
      const price = calcPrice(sellPrice);
      
      const options = extractOptions(raw);
      let variantImage = getVariantImages(raw);
      
      // Cache variant image
      if (variantImage) {
        variantImage = await cacheImage(variantImage);
      }
      
      variants.push({
        sku: sku || spuKey + "_var_" + variants.length,
        price,
        options: options,
        image: variantImage
      });

      if (variantImage) allImages.push(variantImage);
    }

    const productImages = getProductImages(rows[0]);
    
    // Cache all product images
    const cachedProductImages = [];
    for (const img of productImages) {
      const cached = await cacheImage(img);
      cachedProductImages.push(cached);
    }
    allImages.push(...cachedProductImages);
    allImages = [...new Set(allImages)];

    const warehouse = meta.warehouse || meta.shipFrom || meta.country || "Unknown";
    const usKeywords = ["us", "usa", "united states", "america"];
    const isUS = 
      usKeywords.some(kw => warehouse.includes(kw)) ||
      usKeywords.some(kw => meta.shipFrom.includes(kw)) ||
      usKeywords.some(kw => meta.country.includes(kw));

    normalized.push({
      id: spuKey,
      spu: meta.spu || spuKey,
      title: meta.title,
      price: variants[0]?.price || 0,
      description: meta.description,
      image: allImages[0] || "/img/placeholder.png",
      images: allImages.length > 0 ? allImages : ["/img/placeholder.png"],
      variants: variants,
      source: "CJ",
      shipping_fee: meta.shippingFee,
      shipping_note: !isUS ? "Shipping time may vary" : undefined,
      warehouse: warehouse,
      is_us: isUS
    });
  }

  return normalized;
}

module.exports = { parseCJCSV, cacheImage };
