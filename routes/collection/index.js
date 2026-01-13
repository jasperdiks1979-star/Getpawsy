const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { isStrictSmallPet, classifyWithConfidence, getSmallPetSubcategory } = require('../../src/strictCategoryClassifier');
const { prepareProductsForView } = require('../../src/lib/productNormalize');

const SMALL_PETS_SUBCATEGORIES = {
  rabbits: { name: 'Rabbits', keywords: ['rabbit', 'bunny', 'bunnies', 'hutch'] },
  guinea_pigs: { name: 'Guinea Pigs', keywords: ['guinea pig', 'guinea-pig', 'guinea', 'cavy'] },
  hamsters: { name: 'Hamsters', keywords: ['hamster', 'hamster wheel', 'hamster cage', 'syrian hamster', 'dwarf hamster'] },
  birds: { name: 'Birds', keywords: ['bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 'perch', 'aviary'] },
  fish_aquatics: { name: 'Fish & Aquatics', keywords: ['fish', 'aquarium', 'aquatic', 'betta', 'goldfish', 'tropical fish', 'fish tank'] },
  reptiles: { name: 'Reptiles', keywords: ['reptile', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko', 'iguana', 'terrarium', 'vivarium'] },
  cages_habitats: { name: 'Cages & Habitats', keywords: ['cage', 'habitat', 'enclosure', 'terrarium', 'vivarium', 'hutch'] },
  bedding_cleaning: { name: 'Bedding & Cleaning', keywords: ['bedding', 'substrate', 'wood shavings', 'straw', 'cleaning'] },
  food_treats: { name: 'Food & Treats', keywords: ['pellets', 'seeds', 'hay', 'mealworms', 'treats', 'nutrition', 'food'] },
  toys_enrichment: { name: 'Toys & Enrichment', keywords: ['exercise wheel', 'tunnels', 'hideout', 'chew toys', 'enrichment', 'playground', 'toy'] }
};

function loadProducts() {
  const catalogPath = path.join(__dirname, '../../data/catalog.json');
  const cjPath = path.join(__dirname, '../../data/products_cj.json');
  
  if (fs.existsSync(catalogPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      const products = data.products || [];
      return products;
    } catch (err) {
      console.error('[Collection] Failed to load catalog.json:', err.message);
    }
  }
  
  if (fs.existsSync(cjPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cjPath, 'utf-8'));
      const products = data.products || [];
      return products;
    } catch (err) {
      console.error('[Collection] Failed to load products_cj.json:', err.message);
    }
  }
  
  throw new Error('No product data found');
}

function filterByCategory(products, category) {
  let filtered;
  
  if (category === 'dog' || category === 'dogs') {
    filtered = products.filter(p => {
      const c = classifyWithConfidence(p);
      return c.primaryCategory === 'dogs' && !c.isBlocked;
    });
  } else if (category === 'cat' || category === 'cats') {
    filtered = products.filter(p => {
      const c = classifyWithConfidence(p);
      return c.primaryCategory === 'cats' && !c.isBlocked;
    });
  } else if (category === 'small_pet' || category === 'small-pet' || category === 'small-pets' || category === 'smallpets') {
    filtered = products.filter(p => isStrictSmallPet(p));
  } else {
    filtered = products.filter(p => {
      const productCategory = (p.category || '').toLowerCase();
      return productCategory.includes(category) || 
             (p.type || '').includes(category) ||
             p.mainCategorySlug === category;
    });
  }
  
  return filtered;
}

function filterSmallPetSubcategory(products, subcat) {
  const def = SMALL_PETS_SUBCATEGORIES[subcat];
  if (!def) return products;
  
  const ANIMAL_TYPES = ['rabbits', 'guinea_pigs', 'hamsters', 'birds', 'fish_aquatics', 'reptiles', 'chinchillas', 'ferrets', 'hedgehogs', 'mice_rats'];
  const PRODUCT_TYPES = ['cages_habitats', 'bedding_cleaning', 'toys_enrichment', 'food_treats'];
  
  let filtered;
  if (ANIMAL_TYPES.includes(subcat)) {
    const normalizedSubcat = subcat === 'fish_aquatics' ? 'fish' : subcat;
    filtered = products.filter(p => p.smallPetType === normalizedSubcat);
  } else if (PRODUCT_TYPES.includes(subcat)) {
    filtered = products.filter(p => {
      const productSubcat = p.smallPetSubcategory || getSmallPetSubcategory(p);
      return productSubcat === subcat;
    });
  } else {
    filtered = products.filter(p => {
      const productSubcat = p.smallPetSubcategory || getSmallPetSubcategory(p);
      return productSubcat === subcat || p.smallPetType === subcat;
    });
  }
  
  if (filtered.length === 0 && products.length > 0) {
    return products;
  }
  
  return filtered;
}

router.get('/:category', (req, res) => {
  try {
    const products = loadProducts();
    const category = req.params.category.toLowerCase();
    const filtered = filterByCategory(products, category);
    
    res.render('collection', {
      title: `${category.charAt(0).toUpperCase() + category.slice(1)} Products`,
      products: prepareProductsForView(filtered.length > 0 ? filtered : []),
      category,
      categoryImage: `/images/categories/${category}.jpg`,
      subcategories: category.includes('small') ? SMALL_PETS_SUBCATEGORIES : null
    });
  } catch (err) {
    console.error('[Collection] Route error:', err);
    res.status(500).render('error', { title: 'Error', error: err.message });
  }
});

router.get('/small-pets/:subcat', (req, res) => {
  try {
    const products = loadProducts();
    const subcat = req.params.subcat.toLowerCase().replace(/-/g, '_');
    
    let smallPetProducts = products.filter(p => isStrictSmallPet(p));
    smallPetProducts = filterSmallPetSubcategory(smallPetProducts, subcat);
    
    const subcatDef = SMALL_PETS_SUBCATEGORIES[subcat];
    const title = subcatDef ? subcatDef.name : 'Small Pets';
    
    res.render('collection', {
      title: `${title} | Small Pets`,
      products: prepareProductsForView(smallPetProducts),
      category: 'small-pets',
      subcategory: subcat,
      subcategories: SMALL_PETS_SUBCATEGORIES,
      categoryImage: `/images/categories/small-pets.jpg`
    });
  } catch (err) {
    console.error('[Collection] Small pets subcategory error:', err);
    res.status(500).render('error', { title: 'Error', error: err.message });
  }
});

module.exports = router;
