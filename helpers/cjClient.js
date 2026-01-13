const axios = require("axios");
const fs = require("fs");
const path = require("path");

const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";
const TOKEN_CACHE_FILE = path.join(__dirname, "../data/.cj_token_cache.json");

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  
  if (cachedToken && tokenExpiry > now) {
    return cachedToken;
  }
  
  if (fs.existsSync(TOKEN_CACHE_FILE)) {
    try {
      const cache = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, "utf-8"));
      if (cache.token && cache.expiry > now) {
        cachedToken = cache.token;
        tokenExpiry = cache.expiry;
        return cachedToken;
      }
    } catch (err) {}
  }

  const email = process.env.CJ_EMAIL;
  const apiKey = process.env.CJ_API_KEY;

  if (!email || !apiKey) {
    throw new Error("CJ_EMAIL and CJ_API_KEY environment variables required");
  }

  console.log("[CJ] Requesting new access token...");

  let response;
  try {
    response = await axios.post(
      `${CJ_BASE_URL}/authentication/getAccessToken`,
      { email, apiKey },
      { timeout: 30000 }
    );
  } catch (err) {
    if (err.response?.status === 429) {
      throw new Error("CJ rate limit reached. Wait 5 minutes before trying again.");
    }
    if (err.response?.data?.message) {
      throw new Error(`CJ API error: ${err.response.data.message}`);
    }
    throw err;
  }

  const tokenData = response.data?.data || response.data?.result;
  if (!tokenData?.accessToken) {
    throw new Error("Failed to get CJ access token: " + JSON.stringify(response.data));
  }

  cachedToken = tokenData.accessToken;
  const expiryDate = tokenData.accessTokenExpiryDate ? new Date(tokenData.accessTokenExpiryDate).getTime() : (now + (2 * 60 * 60 * 1000));
  tokenExpiry = expiryDate - 60000;

  try {
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
      token: cachedToken,
      expiry: tokenExpiry
    }));
  } catch (err) {
    console.warn("[CJ] Could not cache token:", err.message);
  }

  console.log("[CJ] Access token obtained successfully");
  return cachedToken;
}

async function fetchProductList(options = {}) {
  const token = await getAccessToken();
  
  const params = {
    pageNum: options.pageNum || 1,
    pageSize: Math.min(options.pageSize || 200, 200)
  };
  
  if (options.productType) params.productType = options.productType;
  if (options.categoryId) params.categoryId = options.categoryId;
  if (options.keyword) params.productName = options.keyword;

  console.log(`[CJ] Fetching products page ${params.pageNum}...`);

  const response = await axios.get(
    `${CJ_BASE_URL}/product/list`,
    {
      params,
      headers: {
        "CJ-Access-Token": token
      },
      timeout: 60000
    }
  );

  const result = response.data?.data || response.data?.result;
  if (!result) {
    throw new Error("Failed to fetch CJ products: " + JSON.stringify(response.data));
  }

  return result;
}

async function fetchProductDetails(pid) {
  const token = await getAccessToken();
  
  const response = await axios.get(
    `${CJ_BASE_URL}/product/query`,
    {
      params: { pid },
      headers: { "CJ-Access-Token": token },
      timeout: 30000
    }
  );

  return response.data?.result || null;
}

async function searchProducts(keyword, pageNum = 1, pageSize = 50) {
  return fetchProductList({ keyword, pageNum, pageSize });
}

function normalizeProduct(cjProduct) {
  const images = [];
  
  if (cjProduct.productImage) {
    if (Array.isArray(cjProduct.productImage)) {
      images.push(...cjProduct.productImage.slice(0, 5));
    } else if (typeof cjProduct.productImage === "string") {
      images.push(cjProduct.productImage);
    }
  }
  
  if (cjProduct.productImageSet && Array.isArray(cjProduct.productImageSet)) {
    cjProduct.productImageSet.forEach(img => {
      if (img && !images.includes(img) && images.length < 5) {
        images.push(img);
      }
    });
  }

  if (images.length === 0) {
    images.push("/images/placeholder.png");
  }

  const category = determinePetCategory(cjProduct);
  const price = parseFloat(cjProduct.sellPrice) || 0;
  const oldPrice = parseFloat(cjProduct.marketPrice) || price * 1.3;

  return {
    id: cjProduct.pid || cjProduct.id,
    cj_pid: cjProduct.pid,
    name: cleanProductName(cjProduct.productNameEn || cjProduct.productName || "Pet Product"),
    title: cleanProductName(cjProduct.productNameEn || cjProduct.productName || "Pet Product"),
    description: cjProduct.description || cjProduct.productDesc || "",
    price: Math.round(price * 100) / 100,
    old_price: Math.round(oldPrice * 100) / 100,
    images: images,
    image: images[0],
    rating: 4.5 + Math.random() * 0.4,
    reviews_count: Math.floor(50 + Math.random() * 200),
    stock: parseInt(cjProduct.sellStock) || 100,
    category: category,
    categoryId: cjProduct.categoryId,
    categoryName: cjProduct.categoryName,
    tags: extractTags(cjProduct),
    badge: determineBadge(cjProduct),
    variants: normalizeVariants(cjProduct),
    weight: cjProduct.productWeight,
    sourceUrl: cjProduct.productUrl,
    createdAt: new Date().toISOString()
  };
}

function cleanProductName(name) {
  if (!name) return "Pet Product";
  return name
    .replace(/\s+/g, " ")
    .replace(/^\d+\s*pcs?\s*/i, "")
    .trim()
    .slice(0, 100);
}

function isPetProduct(cjProduct) {
  const name = (cjProduct.productNameEn || cjProduct.productName || "").toLowerCase();
  const catName = (cjProduct.categoryName || "").toLowerCase();
  const desc = (cjProduct.description || cjProduct.productDesc || "").toLowerCase();
  
  const excludeCategories = [
    "bracelet", "bangle", "jewelry", "jewellery", "necklace", "ring", "earring",
    "cosmetic", "makeup", "beauty", "skincare", "storage box", "organizer",
    "phone case", "tablet", "laptop", "electronics", "clothing", "dress", "shirt",
    "pants", "shoes", "handbag", "purse", "wallet", "watch", "sunglasses"
  ];
  
  const excludeNameWords = [
    "bracelet", "bangle", "necklace", "ring", "earring", "jewelry", "jewellery",
    "stone bracelet", "cat eye stone", "crystal", "gemstone", "pearl",
    "storage box", "organizer", "cosmetic box", "makeup", "beauty",
    "phone case", "tablet case", "laptop", "computer", "usb",
    "human", "women", "men", "lady", "girl", "boy", "kids clothing"
  ];
  
  for (const exclude of excludeCategories) {
    if (catName.includes(exclude)) return false;
  }
  
  for (const exclude of excludeNameWords) {
    if (name.includes(exclude)) return false;
  }
  
  const petIndicators = [
    "pet toy", "dog toy", "cat toy", "pet bed", "dog bed", "cat bed",
    "pet food", "dog food", "cat food", "pet bowl", "pet feeder",
    "pet collar", "dog collar", "cat collar", "pet leash", "dog leash",
    "pet grooming", "dog grooming", "cat grooming", "pet brush", "deshedding",
    "pet carrier", "dog carrier", "cat carrier", "pet cage", "pet crate",
    "pet clothes", "dog clothes", "cat clothes", "pet costume",
    "chew toy", "squeaky", "catnip", "scratching", "scratcher",
    "pet supplies", "pet accessories", "pet care"
  ];
  
  for (const indicator of petIndicators) {
    if (name.includes(indicator) || desc.includes(indicator) || catName.includes(indicator)) {
      return true;
    }
  }
  
  if (catName.includes("pet") || catName.includes("dog") || catName.includes("cat")) {
    return true;
  }
  
  return false;
}

function determinePetCategory(cjProduct) {
  const name = (cjProduct.productNameEn || cjProduct.productName || "").toLowerCase();
  const catName = (cjProduct.categoryName || "").toLowerCase();
  
  const dogKeywords = ["dog", "puppy", "canine", "hond"];
  const catKeywords = ["kitten", "feline", "kat"];
  
  if (name.includes("cat toy") || name.includes("cat bed") || name.includes("cat food") || 
      name.includes("cat collar") || name.includes("catnip") || name.includes("scratching") ||
      name.includes("cat leash") || name.includes("cat carrier") || name.includes("cat grooming")) {
    return "cats";
  }
  
  for (const kw of dogKeywords) {
    if (name.includes(kw) || catName.includes(kw)) return "dogs";
  }
  
  for (const kw of catKeywords) {
    if (name.includes(kw) || catName.includes(kw)) return "cats";
  }
  
  if (name.includes("cat") && !name.includes("cat eye")) {
    return "cats";
  }
  
  return "pets";
}

function extractTags(cjProduct) {
  const tags = [];
  const name = (cjProduct.productNameEn || cjProduct.productName || "").toLowerCase();
  
  if (name.includes("toy")) tags.push("toys");
  if (name.includes("bed") || name.includes("sleep")) tags.push("beds");
  if (name.includes("collar") || name.includes("leash")) tags.push("accessories");
  if (name.includes("food") || name.includes("treat") || name.includes("bowl")) tags.push("feeding");
  if (name.includes("grooming") || name.includes("brush") || name.includes("shampoo")) tags.push("grooming");
  if (name.includes("cloth") || name.includes("jacket") || name.includes("sweater")) tags.push("clothing");
  
  return tags;
}

function determineBadge(cjProduct) {
  const badges = ["Best Seller", "Top Rated", "New Arrival", "Trending", null];
  return badges[Math.floor(Math.random() * badges.length)];
}

function normalizeVariants(cjProduct) {
  if (!cjProduct.variants || !Array.isArray(cjProduct.variants)) {
    return [];
  }
  
  return cjProduct.variants.map(v => ({
    id: v.vid,
    name: v.variantName || v.variantNameEn,
    price: parseFloat(v.variantSellPrice) || 0,
    stock: parseInt(v.variantStock) || 0,
    image: v.variantImage
  }));
}

module.exports = {
  getAccessToken,
  fetchProductList,
  fetchProductDetails,
  searchProducts,
  normalizeProduct,
  isPetProduct
};
