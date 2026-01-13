const fs = require('fs');
const path = require('path');
const { classifyPetProduct, applyPetClassification } = require('../src/petSafetyNet');

const DB_PATH = path.join(__dirname, '../data/db.json');

function runBackfill() {
  console.log('=== Pet Safety Net Backfill ===\n');
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const products = db.products || [];
  
  const stats = {
    total: products.length,
    pet_ok: 0,
    flagged_non_pet: 0,
    hidden: 0,
    already_classified: 0,
    errors: []
  };
  
  const updatedProducts = products.map((product, idx) => {
    try {
      const result = classifyPetProduct(product);
      
      const updated = {
        ...product,
        is_pet_product: result.isPetProduct,
        pet_classification_reason: result.reason,
        pet_classification_confidence: result.confidence
      };
      
      if (result.isPetProduct) {
        updated.needs_review = false;
        updated.hidden_from_storefront = product.active === false ? true : false;
        stats.pet_ok++;
      } else {
        updated.needs_review = true;
        updated.hidden_from_storefront = true;
        stats.flagged_non_pet++;
        stats.hidden++;
        console.log(`FLAGGED: [${product.id}] ${product.title?.substring(0, 50)} - ${result.reason}`);
      }
      
      return updated;
    } catch (err) {
      stats.errors.push({ id: product.id, error: err.message });
      return product;
    }
  });
  
  db.products = updatedProducts;
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  
  console.log('\n=== Backfill Report ===');
  console.log(`Total products: ${stats.total}`);
  console.log(`Pet OK: ${stats.pet_ok}`);
  console.log(`Flagged non-pet: ${stats.flagged_non_pet}`);
  console.log(`Hidden from storefront: ${stats.hidden}`);
  console.log(`Errors: ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    stats.errors.slice(0, 10).forEach(e => console.log(`  - ${e.id}: ${e.error}`));
  }
  
  return stats;
}

if (require.main === module) {
  runBackfill();
}

module.exports = { runBackfill };
