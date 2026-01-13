const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const CJ_EMAIL = process.env.CJ_EMAIL;
const CJ_API_KEY = process.env.CJ_API_KEY;

if (!CJ_EMAIL || !CJ_API_KEY) {
  console.error("❌ .env ontbreekt CJ_EMAIL of CJ_API_KEY");
  process.exit(1);
}

const OUTPUT_JSON = "./data/products_v15.json";
const IMAGE_DIR = "./public/products";

if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

// -------- STEP 1 — GET CJ TOKEN --------
async function getCJToken() {
  console.log("📡 Verbinding met CJ API...");
  const url = "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken";

  try {
    const res = await axios.post(url, {
      email: CJ_EMAIL,
      apiKey: CJ_API_KEY
    });

    if (!res.data.result?.accessToken) {
      console.error("❌ Kon CJ token niet ophalen!");
      throw new Error("Token mislukt");
    }

    console.log("🔑 CJ Access Token verkregen");
    return res.data.result.accessToken;
  } catch (err) {
    if (err.response?.data?.message?.includes("Too Many Requests")) {
      console.error("⏸️ Rate limit bereikt! Wacht 5 minuten alstublieft.");
      console.error("CJ API beperkt tot 1 request per 300 seconden");
    } else {
      console.error("❌ Token error:", err.message);
    }
    throw err;
  }
}

// -------- STEP 2 — DOWNLOAD PRODUCTS --------
async function fetchCJProducts(token) {
  console.log("📦 Products ophalen van CJ...");
  const url = "https://developers.cjdropshipping.com/api2.0/v1/product/list";

  try {
    const res = await axios.post(url, {
      pageNum: 1,
      pageSize: 500,
      productType: 1,
      status: 1
    }, {
      headers: {
        "CJ-Access-Token": token,
        "Content-Type": "application/json"
      }
    });

    if (!res.data.result?.list) {
      console.error("❌ Kon CJ productlijst niet laden");
      throw new Error("Productlijst mislukt");
    }

    console.log(`✅ ${res.data.result.list.length} producten gevonden`);
    return res.data.result.list;
  } catch (err) {
    console.error("❌ Product list error:", err.message);
    throw err;
  }
}

// -------- STEP 3 — IMAGE DOWNLOAD --------
async function downloadImage(url, filename) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(path.join(IMAGE_DIR, filename), res.data);
  } catch (err) {
    console.log("⚠️ Fout bij downloaden:", url);
  }
}

// -------- STEP 4 — CONVERT TO GETPAWSY FORMAT --------
async function convertProducts(list) {
  console.log("🔄 Producten omzetten naar GetPawsy format...");
  const results = [];
  let count = 0;

  for (const p of list) {
    const images = [];
    
    if (p.productImage && Array.isArray(p.productImage)) {
      for (let i = 0; i < p.productImage.length; i++) {
        const filename = `${p.id}-${i}.jpg`;
        await downloadImage(p.productImage[i], filename);
        images.push(`/products/${filename}`);
      }
    }

    results.push({
      id: p.id || `product-${count}`,
      name: p.productName || "Unknown Product",
      title: p.productName || "Unknown Product",
      description: p.describe || "",
      price: parseFloat(p.sellPrice) || 0,
      old_price: parseFloat(p.marketPrice) || 0,
      images: images.length > 0 ? images : ["/images/placeholder.png"],
      rating: parseFloat(p.ratings) || 4.7,
      reviews_count: parseInt(p.reviews) || 150,
      stock: parseInt(p.sellStock) || 0,
      category: p.categoryName || "General",
      tags: p.tags || [],
      badge: "Top Rated"
    });
    
    count++;
  }

  return results;
}

// -------- MAIN EXECUTION --------
async function run() {
  console.log("🚀 Start CJ → GetPawsy V15 Sync\n");

  try {
    const token = await getCJToken();
    const cjProducts = await fetchCJProducts(token);
    const converted = await convertProducts(cjProducts);

    fs.writeFileSync(
      OUTPUT_JSON,
      JSON.stringify({ products: converted }, null, 2)
    );

    console.log("\n✅ JSON opgeslagen → /data/products_v15.json");
    console.log(`✅ ${converted.length} producten gesynchroniseerd`);
    console.log("🖼️  Afbeeldingen opgeslagen → /public/products");
    console.log("🔥 CJ Sync voltooid!\n");
  } catch (err) {
    console.error("\n❌ Sync niet voltooid:", err.message);
    console.error("\n💡 Dit kan gebeuren als:");
    console.error("   1. Rate limit bereikt (wacht 5 minuten)");
    console.error("   2. CJ API niet bereikbaar");
    console.error("   3. Credentials verlopen zijn");
  }
}

run();
