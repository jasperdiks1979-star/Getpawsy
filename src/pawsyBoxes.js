const fs = require('fs');
const path = require('path');

const BOXES_FILE = path.join(__dirname, '..', 'data', 'pawsy-boxes.json');

function loadBoxes() {
  try {
    if (!fs.existsSync(BOXES_FILE)) {
      return { boxes: [], updatedAt: null };
    }
    const data = fs.readFileSync(BOXES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('[PawsyBoxes] Failed to load boxes:', e.message);
    return { boxes: [], updatedAt: null };
  }
}

function saveBoxes(data) {
  try {
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(BOXES_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('[PawsyBoxes] Failed to save boxes:', e.message);
    return false;
  }
}

function getActiveBoxes() {
  const data = loadBoxes();
  return data.boxes.filter(b => b.active);
}

function getFeaturedBoxes() {
  const data = loadBoxes();
  return data.boxes.filter(b => b.active && b.featured);
}

function getBoxById(id) {
  const data = loadBoxes();
  return data.boxes.find(b => b.id === id || b.slug === id);
}

function getBoxesForProfile(petProfile) {
  if (!petProfile || !petProfile.petType) {
    return getFeaturedBoxes();
  }
  
  const allBoxes = getActiveBoxes();
  const scored = [];
  
  for (const box of allBoxes) {
    let score = 0;
    
    if (box.petType === petProfile.petType) {
      score += 3;
    } else if (box.petType === 'both') {
      score += 1;
    }
    
    if (box.targetAgeGroup && box.targetAgeGroup === petProfile.ageGroup) {
      score += 2;
    }
    
    if (box.targetSize && box.targetSize === petProfile.size) {
      score += 1;
    }
    
    if (box.targetTraits && petProfile.traits) {
      const matchingTraits = box.targetTraits.filter(t => petProfile.traits.includes(t));
      score += matchingTraits.length * 2;
    }
    
    scored.push({ box, score });
  }
  
  scored.sort((a, b) => b.score - a.score);
  
  const result = scored.map(s => ({
    ...s.box,
    isRecommended: s.score >= 3,
    matchScore: s.score
  }));
  
  return result;
}

function populateBoxProducts(box, allProducts) {
  if (!box || !allProducts || !allProducts.length) return box;
  
  const matchingProducts = allProducts.filter(p => {
    if (!p.active && p.active !== undefined) return false;
    if (p.deletedAt) return false;
    if (!p.image) return false;
    
    const pType = (p.petType || '').toLowerCase();
    const bType = (box.petType || '').toLowerCase();
    
    if (bType !== 'both' && pType !== bType && pType !== 'both') {
      return false;
    }
    
    return true;
  });
  
  const selected = matchingProducts
    .sort(() => Math.random() - 0.5)
    .slice(0, box.productCount || 5);
  
  return {
    ...box,
    products: selected.map(p => ({
      id: p.id,
      title: p.title,
      image: p.image,
      price: p.price
    }))
  };
}

function populateAllBoxProducts(boxes, allProducts) {
  return boxes.map(box => populateBoxProducts(box, allProducts));
}

function addProductToBox(boxId, productId) {
  const data = loadBoxes();
  const box = data.boxes.find(b => b.id === boxId);
  if (!box) return false;
  
  if (!box.products) box.products = [];
  if (!box.products.includes(productId)) {
    box.products.push(productId);
    return saveBoxes(data);
  }
  return true;
}

function removeProductFromBox(boxId, productId) {
  const data = loadBoxes();
  const box = data.boxes.find(b => b.id === boxId);
  if (!box || !box.products) return false;
  
  box.products = box.products.filter(p => p !== productId);
  return saveBoxes(data);
}

function updateBox(boxId, updates) {
  const data = loadBoxes();
  const index = data.boxes.findIndex(b => b.id === boxId);
  if (index === -1) return false;
  
  data.boxes[index] = { ...data.boxes[index], ...updates };
  return saveBoxes(data);
}

function createBox(box) {
  const data = loadBoxes();
  const id = box.id || `box-${Date.now()}`;
  const newBox = {
    id,
    slug: box.slug || id,
    title: box.title || 'New Box',
    description: box.description || '',
    icon: box.icon || '📦',
    petType: box.petType || 'both',
    targetAgeGroup: box.targetAgeGroup || null,
    targetSize: box.targetSize || null,
    targetTraits: box.targetTraits || [],
    products: box.products || [],
    productCount: box.productCount || 5,
    bundlePrice: box.bundlePrice || 49.99,
    retailValue: box.retailValue || 69.99,
    savings: box.savings || 20.00,
    active: box.active !== false,
    featured: box.featured || false,
    createdAt: new Date().toISOString()
  };
  
  data.boxes.push(newBox);
  saveBoxes(data);
  return newBox;
}

module.exports = {
  loadBoxes,
  saveBoxes,
  getActiveBoxes,
  getFeaturedBoxes,
  getBoxById,
  getBoxesForProfile,
  populateBoxProducts,
  populateAllBoxProducts,
  addProductToBox,
  removeProductFromBox,
  updateBox,
  createBox
};
