const express = require('express');
const router = express.Router();
const productCatalog = require('../services/productCatalog');
const { prepareProductsForView, prepareProductForView } = require('../src/lib/productNormalize');

function loadProducts() {
  return productCatalog.loadProducts();
}

// ALL PRODUCTS
router.get('/', (req, res) => {
  try {
    const products = loadProducts();
    res.render('collection', {
      title: 'All Products',
      products: prepareProductsForView(products),
      category: 'all',
      productCount: products.length
    });
  } catch (err) {
    console.error('Products route error:', err);
    res.status(500).send('Error loading products: ' + err.message);
  }
});

// SINGLE PRODUCT PAGE
router.get('/:id', (req, res) => {
  try {
    const products = loadProducts();
    const product = products.find(p => p.id === req.params.id);
    if (!product) {
      return res.status(404).render('404', { message: 'Product not found' });
    }
    // Filter related products: prefer same petType + category, fallback to just category
    const productPetType = product.petType || '';
    const productCategory = product.category || product.mainCategorySlug || '';
    
    let relatedProducts = products
      .filter(p => {
        if (p.id === req.params.id) return false;
        const relatedPetType = p.petType || '';
        // If both have petType, they must match
        if (productPetType && relatedPetType && productPetType !== relatedPetType) return false;
        // Must share category
        return p.category === productCategory || p.mainCategorySlug === product.mainCategorySlug;
      })
      .slice(0, 4);
    
    // Fallback: if no matches, just use same category without petType filter
    if (relatedProducts.length === 0) {
      relatedProducts = products
        .filter(p => p.id !== req.params.id && (p.category === productCategory || p.mainCategorySlug === product.mainCategorySlug))
        .slice(0, 4);
    }
    
    res.render('product', { 
      title: product.title || product.name || 'Product',
      product: prepareProductForView(product), 
      relatedProducts: prepareProductsForView(relatedProducts),
      locale: req.query.lang || 'en-US'
    });
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).send('Error loading product: ' + err.message);
  }
});

module.exports = router;
