"use strict";

const { getAccessToken } = require("./cjClient");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";
const CHECKPOINT_PATH = path.join(__dirname, "..", "data", "enrich-checkpoint.json");

function extractCjPid(product) {
  if (product.cj_pid) return product.cj_pid;
  if (product.cjPid) return product.cjPid;
  if (product.pid) return product.pid;
  
  const id = String(product.id || "");
  if (/^\d{16,}$/.test(id)) return id;
  
  const match = id.match(/cj[-_]?(\d{16,})/i);
  if (match) return match[1];
  
  if (product.sourceUrl) {
    const urlMatch = product.sourceUrl.match(/pid[=\/](\d+)/i);
    if (urlMatch) return urlMatch[1];
  }
  
  return null;
}

async function fetchProductMedia(pid) {
  if (!pid) return { images: [], videos: [], source: "unknown", error: "No PID" };
  
  try {
    const token = await getAccessToken();
    
    const response = await axios.get(`${CJ_BASE_URL}/product/query`, {
      params: { pid },
      headers: { "CJ-Access-Token": token },
      timeout: 30000
    });
    
    const product = response.data?.data || response.data?.result;
    if (!product) {
      return { images: [], videos: [], source: "cj", error: "Product not found" };
    }
    
    const images = new Set();
    
    if (product.productImage) {
      if (Array.isArray(product.productImage)) {
        product.productImage.forEach(img => img && images.add(img));
      } else if (typeof product.productImage === "string") {
        images.add(product.productImage);
      }
    }
    
    if (product.productImageSet && Array.isArray(product.productImageSet)) {
      product.productImageSet.forEach(img => img && images.add(img));
    }
    
    if (product.images && Array.isArray(product.images)) {
      product.images.forEach(img => img && images.add(img));
    }
    
    if (product.detailImages && Array.isArray(product.detailImages)) {
      product.detailImages.slice(0, 5).forEach(img => img && images.add(img));
    }
    
    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach(v => {
        if (v.variantImage) images.add(v.variantImage);
      });
    }
    
    const videos = [];
    if (product.productVideo) {
      videos.push(product.productVideo);
    }
    if (product.video) {
      videos.push(product.video);
    }
    if (product.videos && Array.isArray(product.videos)) {
      videos.push(...product.videos);
    }
    
    const validImages = [...images].filter(url => 
      url && typeof url === "string" && url.startsWith("http")
    );
    
    const validVideos = videos.filter(url => 
      url && typeof url === "string" && url.startsWith("http")
    );
    
    return {
      images: validImages,
      videos: validVideos,
      source: "cj",
      fetchedAt: new Date().toISOString(),
      rawProduct: {
        hasVariants: (product.variants || []).length,
        hasDetailImages: (product.detailImages || []).length
      }
    };
  } catch (err) {
    if (err.response?.status === 429) {
      return { images: [], videos: [], source: "cj", error: "rate_limited", retryAfter: 60 };
    }
    return { images: [], videos: [], source: "cj", error: err.message };
  }
}

async function validateImage(url) {
  if (!url) return false;
  try {
    const response = await axios.head(url, { timeout: 5000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
    }
  } catch (e) {}
  return { doneSet: [], lastProcessedId: null, stats: {} };
}

function saveCheckpoint(checkpoint) {
  try {
    fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
  } catch (e) {
    console.error("[Enrich] Could not save checkpoint:", e.message);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  extractCjPid,
  fetchProductMedia,
  validateImage,
  loadCheckpoint,
  saveCheckpoint,
  delay
};
