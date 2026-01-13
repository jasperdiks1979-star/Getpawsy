const express = require("express");
const router = express.Router();
const productCatalog = require("../services/productCatalog");
const { prepareProductsForView } = require("../src/lib/productNormalize");

function loadProducts() {
  return productCatalog.loadProducts();
}

router.get("/", async (req, res) => {
  const q = req.query.q || "";
  const category = req.query.category || "";
  const sort = req.query.sort || "";
  const min = parseFloat(req.query.min) || 0;
  const max = parseFloat(req.query.max) || 9999;

  let results = loadProducts();
  
  // Filter by price
  results = results.filter(p => p.price >= min && p.price <= max);
  
  // Filter by search query
  if (q) {
    results = results.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  }
  
  // Filter by category
  if (category) {
    results = results.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
  }
  
  // Sort
  if (sort === "price-asc") results.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") results.sort((a, b) => b.price - a.price);

  res.render("search", {
    title: "Search Results",
    results: prepareProductsForView(results),
    q,
    min,
    max,
    category,
    sort
  });
});

module.exports = router;
