function parseCSV(csvText) {
  const lines = [];
  let currentLine = [];
  let inQuotes = false;
  let currentField = "";

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentLine.push(currentField.trim());
      currentField = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (currentField || currentLine.length > 0) {
        currentLine.push(currentField.trim());
        if (currentLine.some(f => f.length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = "";
      }
      if (char === "\r" && nextChar === "\n") i++;
    } else {
      currentField += char;
    }
  }

  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(f => f.length > 0)) {
      lines.push(currentLine);
    }
  }

  if (lines.length === 0) return [];

  const headers = lines[0].map(h => h.toLowerCase());
  const products = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const product = {};
    for (let j = 0; j < headers.length; j++) {
      product[headers[j]] = row[j] || "";
    }
    products.push(product);
  }

  return products;
}

async function parseCSVWithCaching(csvText) {
  const rawProducts = parseCSV(csvText);
  return Promise.all(rawProducts.map(normalizeProduct));
}

async function normalizeProduct(raw) {
  const { cacheImage } = require("./imageCache");
  
  const imageColumns = ["image", "image_url", "main_image", "featured_image", "images", "imageurls", "product_images"];
  let images = [];

  for (const col of imageColumns) {
    const val = raw[col];
    if (val && typeof val === "string" && val.trim()) {
      const urls = val.split(/[,|/\s]+/).filter(u => u.match(/^https?:/));
      images.push(...urls.map(u => u.startsWith("http") ? u : "https://" + u));
    }
  }

  images = [...new Set(images)];
  
  // Cache generic CSV images too
  const cachedImages = [];
  for (const img of images) {
    const cached = await cacheImage(img);
    cachedImages.push(cached);
  }

  const idCandidates = ["cj_id", "pid", "id", "handle", "sku"];
  let id = null;
  for (const key of idCandidates) {
    if (raw[key] && raw[key].trim()) {
      id = String(raw[key]).trim();
      break;
    }
  }

  if (!id) {
    const hash = (raw.title || "Product") + (raw.price || "0");
    id = "prod_" + Math.abs(hash.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0)).toString(36);
  }

  return {
    id,
    title: (raw.title || raw.name || "Product").trim(),
    price: parseFloat(raw.price || 0) || 0,
    description: (raw.description || raw.desc || "").trim(),
    image: cachedImages[0] || "/img/placeholder.png",
    images: cachedImages.length > 0 ? cachedImages : ["/img/placeholder.png"],
    category: (raw.category || raw.type || "pets").trim(),
    stock: parseInt(raw.stock || raw.inventory || 100) || 100
  };
}

module.exports = { parseCSV, normalizeProduct, parseCSVWithCaching };
