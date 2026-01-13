const { getAllProducts } = require('./products');

function scoreProduct(p) {
  const rating = p.rating || 0;
  const reviews = p.reviews || p.reviews_count || 0;
  const price = p.price || 0;
  const normalizedPrice = price > 0 ? 1 / Math.sqrt(price) : 1;
  const rnd = Math.random() * 0.2;
  return rating * 1.5 + Math.log1p(reviews) * 0.7 + normalizedPrice + rnd;
}

function getRecommended(limit = 8) {
  const list = getAllProducts()
    .map((p) => ({ ...p }))
    .sort((a, b) => scoreProduct(b) - scoreProduct(a))
    .slice(0, limit);
  return list;
}

module.exports = { getRecommended };
