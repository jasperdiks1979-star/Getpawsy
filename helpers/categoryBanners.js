const fs = require('fs');
const path = require('path');

function loadBanners() {
  const p = path.join(__dirname, '..', 'data', 'category_banners.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function getBanner(slug) {
  const all = loadBanners();
  return all[slug] || null;
}

function getAllBanners() {
  return loadBanners();
}

module.exports = { getBanner, getAllBanners };
