const express = require('express');
const router = express.Router();
const { getProductById, getAllProducts } = require('../../helpers/products');
const productCatalog = require('../../services/productCatalog');
const { MEDIA_CONFIG } = require('../../src/config/media');
const { prepareProductsForView, prepareProductForView } = require('../../src/lib/productNormalize');

let mediaService;
try {
  mediaService = require('../../src/services/mediaService');
} catch (e) {
  console.warn('[ProductRoute] MediaService not available');
}

router.get('/:id', (req, res) => {
  try {
    const productId = req.params.id;
    const product = getProductById(productId);
    
    if (!product) {
      return res.status(404).render('404', { title: 'Product Not Found' });
    }
    
    // On-demand media download: if enabled and no local media, enqueue
    if (MEDIA_CONFIG.ON_DEMAND_DOWNLOAD && mediaService) {
      const localMedia = mediaService.getProductMedia(productId);
      if (!localMedia && product.originalImages && product.originalImages.length > 0) {
        mediaService.enqueueProduct(productId, 10, product.originalImages);
      }
    }
    
    const allProducts = productCatalog.loadProducts();
    // Filter related products: prefer same petType + category, fallback to just category
    const productPetType = product.petType || '';
    const productCategory = product.category || product.mainCategorySlug || '';
    
    let relatedProducts = allProducts
      .filter(p => {
        if (p.id === productId) return false;
        const relatedPetType = p.petType || '';
        // If both have petType, they must match
        if (productPetType && relatedPetType && productPetType !== relatedPetType) return false;
        // Must share category
        return p.mainCategorySlug === product.mainCategorySlug || p.category === productCategory;
      })
      .slice(0, 4);
    
    // Fallback: if no matches, just use same category without petType filter
    if (relatedProducts.length === 0) {
      relatedProducts = allProducts
        .filter(p => p.id !== productId && (p.category === productCategory || p.mainCategorySlug === product.mainCategorySlug))
        .slice(0, 4);
    }
    
    res.render('product', {
      title: product.title || product.name || 'Product',
      product: prepareProductForView(product),
      relatedProducts: prepareProductsForView(relatedProducts),
      locale: req.query.lang || 'en-US'
    });
  } catch (err) {
    console.error('Product route error:', err);
    res.status(500).render('404', { title: 'Error', error: err.message });
  }
});

module.exports = router;
