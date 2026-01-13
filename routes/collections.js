const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { prepareProductsForView } = require('../src/lib/productNormalize');

function loadProducts() {
  const cjPath = path.join(__dirname, '../data/products_cj.json');
  if (!fs.existsSync(cjPath)) {
    throw new Error('FATAL: products_cj.json not found - API-only mode');
  }
  try {
    const data = JSON.parse(fs.readFileSync(cjPath, 'utf-8'));
    const products = data.products || [];
    if (products.length === 0) {
      throw new Error('FATAL: products_cj.json is empty');
    }
    return products;
  } catch (err) {
    if (err.message.startsWith('FATAL:')) throw err;
    throw new Error(`FATAL: Failed to load products_cj.json: ${err.message}`);
  }
}

router.get('/', (req, res) => {
  try {
    const products = loadProducts();
    res.render('collection', {
      title: 'All Collections',
      products: prepareProductsForView(products),
      category: 'all',
      collections: ['Dogs', 'Cats', 'Birds', 'Small Animals']
    });
  } catch (err) {
    console.error('Collections route error:', err);
    res.status(500).send('Error loading collections: ' + err.message);
  }
});

module.exports = router;
