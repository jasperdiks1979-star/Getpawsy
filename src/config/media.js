"use strict";

const MEDIA_CONFIG = {
  MEDIA_MODE: process.env.MEDIA_MODE || "local",
  MEDIA_DIR: process.env.MEDIA_DIR || "public/media",
  MEDIA_BUDGET_MB: parseInt(process.env.MEDIA_BUDGET_MB || "950", 10),
  MAX_IMAGES_PER_PRODUCT: parseInt(process.env.MAX_IMAGES_PER_PRODUCT || "8", 10),
  DOWNLOAD_THUMBS_ONLY: process.env.DOWNLOAD_THUMBS_ONLY !== "false",
  IMAGE_MAIN_WIDTH: parseInt(process.env.IMAGE_MAIN_WIDTH || "1400", 10),
  IMAGE_THUMB_WIDTH: parseInt(process.env.IMAGE_THUMB_WIDTH || "420", 10),
  IMAGE_FORMAT: process.env.IMAGE_FORMAT || "webp",
  SKIP_VIDEOS: process.env.SKIP_VIDEOS !== "false",
  ON_DEMAND_DOWNLOAD: process.env.ON_DEMAND_DOWNLOAD !== "false",
  MEDIA_CONCURRENCY: parseInt(process.env.MEDIA_CONCURRENCY || "3", 10),
  MEDIA_INDEX_PATH: "data/media-index.json",
  MEDIA_QUEUE_PATH: "data/media-queue.json"
};

function printConfig() {
  console.log("============================================================");
  console.log("[MEDIA CONFIG]");
  console.log(`  MEDIA_MODE: ${MEDIA_CONFIG.MEDIA_MODE}`);
  console.log(`  MEDIA_DIR: ${MEDIA_CONFIG.MEDIA_DIR}`);
  console.log(`  MEDIA_BUDGET_MB: ${MEDIA_CONFIG.MEDIA_BUDGET_MB}`);
  console.log(`  MAX_IMAGES_PER_PRODUCT: ${MEDIA_CONFIG.MAX_IMAGES_PER_PRODUCT}`);
  console.log(`  DOWNLOAD_THUMBS_ONLY: ${MEDIA_CONFIG.DOWNLOAD_THUMBS_ONLY}`);
  console.log(`  IMAGE_MAIN_WIDTH: ${MEDIA_CONFIG.IMAGE_MAIN_WIDTH}`);
  console.log(`  IMAGE_THUMB_WIDTH: ${MEDIA_CONFIG.IMAGE_THUMB_WIDTH}`);
  console.log(`  IMAGE_FORMAT: ${MEDIA_CONFIG.IMAGE_FORMAT}`);
  console.log(`  SKIP_VIDEOS: ${MEDIA_CONFIG.SKIP_VIDEOS}`);
  console.log(`  ON_DEMAND_DOWNLOAD: ${MEDIA_CONFIG.ON_DEMAND_DOWNLOAD}`);
  console.log(`  MEDIA_CONCURRENCY: ${MEDIA_CONFIG.MEDIA_CONCURRENCY}`);
  console.log("============================================================");
}

module.exports = { MEDIA_CONFIG, printConfig };
