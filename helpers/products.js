const productCatalog = require('../services/productCatalog');

function getAllProducts() {
  return productCatalog.loadProducts();
}

function getByCategory(cat) {
  if (!cat || cat === 'all') {
    return productCatalog.loadProducts();
  }
  return productCatalog.getProductsByCategory(cat);
}

function getTopProducts(limit = 10) {
  return productCatalog.getBestSellers(limit);
}

function getRandomProducts(limit = 8) {
  return productCatalog.getRandomProducts(limit);
}

function getProductById(id) {
  return productCatalog.getProductById(id);
}

function searchProducts(query) {
  const result = productCatalog.getProducts({ search: query });
  return result.products;
}

module.exports = { 
  getAllProducts, 
  getByCategory, 
  getTopProducts, 
  getRandomProducts,
  getProductById,
  searchProducts
};
