const LABEL_RULES = [
  { label: "Dogs", keywords: ["dog", "puppy", "pup", "canine", "chew", "leash", "collar", "fetch", "tug", "bone"] },
  { label: "Cats", keywords: ["cat", "kitten", "feline", "litter", "scratch", "laser", "catnip", "whisker"] },
  { label: "Heavy Chewers", keywords: ["chew", "bite", "indestructible", "durable", "tough", "strong", "rubber"] },
  { label: "Fetch", keywords: ["ball", "fetch", "throw", "frisbee", "disc"] },
  { label: "Tug Play", keywords: ["tug", "rope", "pull"] },
  { label: "Training", keywords: ["training", "obedience", "treat", "clicker", "whistle"] },
  { label: "Grooming", keywords: ["shampoo", "brush", "groom", "comb", "nail", "clipper", "bath"] },
  { label: "Comfort", keywords: ["bed", "calming", "blanket", "cushion", "pillow", "cozy", "soft", "plush"] },
  { label: "Travel", keywords: ["carrier", "seat", "car", "travel", "portable", "foldable"] },
  { label: "Cleanup", keywords: ["poop", "waste", "litter", "bag", "scoop", "disposal"] },
  { label: "Outdoor", keywords: ["outdoor", "hiking", "walk", "adventure", "waterproof"] },
  { label: "Dental Care", keywords: ["dental", "teeth", "tooth", "chew", "oral"] },
  { label: "Feeding", keywords: ["bowl", "feeder", "food", "water", "dispenser"] }
];

function generateBestForLabels(product, maxLabels = 3) {
  if (!product) return [];
  
  const searchText = [
    product.title || "",
    product.description || "",
    product.category || "",
    product.name || ""
  ].join(" ").toLowerCase();
  
  const matched = [];
  
  for (const rule of LABEL_RULES) {
    for (const kw of rule.keywords) {
      if (searchText.includes(kw)) {
        if (!matched.find(m => m.label === rule.label)) {
          matched.push({ label: rule.label, priority: rule.keywords.indexOf(kw) });
        }
        break;
      }
    }
  }
  
  matched.sort((a, b) => a.priority - b.priority);
  
  return matched.slice(0, maxLabels).map(m => m.label);
}

function addLabelsToProducts(products) {
  return products.map(p => ({
    ...p,
    bestFor: generateBestForLabels(p)
  }));
}

function addLabelsToProduct(product) {
  if (!product) return product;
  return {
    ...product,
    bestFor: generateBestForLabels(product)
  };
}

module.exports = { generateBestForLabels, addLabelsToProducts, addLabelsToProduct };
