/**
 * GetPawsy Category Configuration
 * Premium pet shop category structure
 * Updated: December 2024
 */

const CATEGORY_CONFIG = {
  dogs: {
    id: "dogs",
    title: "For Dogs",
    icon: "🐕",
    href: "/dogs",
    categories: [
      {
        id: "dogs-walking",
        petType: "dog",
        title: "Walking",
        subtitle: "Leashes, collars & harnesses",
        href: "/collections/dogs-walking",
        image: "/images/categories/walking.jpg",
        keywords: ["leash", "collar", "harness", "lead", "tag", "reflective", "retractable", "walking", "walk", "outdoor"]
      },
      {
        id: "dogs-sleep-comfort",
        petType: "dog",
        title: "Sleep & Comfort",
        subtitle: "Beds, blankets & cozy spots",
        href: "/collections/dogs-sleep-comfort",
        image: "/images/categories/sleeping.jpg",
        keywords: ["bed", "cushion", "mat", "sofa", "orthopedic", "blanket", "pillow", "sleep", "cozy", "rest", "comfort"]
      },
      {
        id: "dogs-toys-play",
        petType: "dog",
        title: "Toys & Play",
        subtitle: "Fun for every pup",
        href: "/collections/dogs-toys-play",
        image: "/images/categories/playing.jpg",
        keywords: ["toy", "toys", "ball", "rope", "squeaky", "fetch", "chew toy", "tug", "teaser", "interactive", "play", "game"]
      },
      {
        id: "dogs-grooming",
        petType: "dog",
        title: "Grooming",
        subtitle: "Brushes, shampoo & care",
        href: "/collections/dogs-grooming",
        image: "/images/categories/grooming.jpg",
        keywords: ["brush", "groom", "grooming", "deshedding", "clipper", "shampoo", "fur", "nail", "bath", "clean"]
      },
      {
        id: "dogs-training",
        petType: "dog",
        title: "Training",
        subtitle: "Tools & training aids",
        href: "/collections/dogs-training",
        image: "/images/categories/training.jpg",
        keywords: ["training", "clicker", "muzzle", "anti bark", "bark", "pee pad", "potty", "gate", "crate", "treat pouch"]
      },
      {
        id: "dogs-travel",
        petType: "dog",
        title: "Travel",
        subtitle: "Carriers, car gear & strollers",
        href: "/collections/dogs-travel",
        image: "/images/categories/travel.jpg",
        keywords: ["carrier", "car seat", "seat cover", "travel", "crate", "kennel", "stroller", "backpack", "bag", "transport"]
      }
    ]
  },
  cats: {
    id: "cats",
    title: "For Cats",
    icon: "🐈",
    href: "/cats",
    categories: [
      {
        id: "cats-sleep-comfort",
        petType: "cat",
        title: "Sleep & Comfort",
        subtitle: "Cozy hideaways & beds",
        href: "/collections/cats-sleep-comfort",
        image: "/images/categories/sleeping.jpg",
        keywords: ["bed", "cushion", "mat", "cave", "igloo", "hammock", "perch", "blanket", "sleep", "cozy", "rest", "comfort"]
      },
      {
        id: "cats-toys-play",
        petType: "cat",
        title: "Toys & Play",
        subtitle: "Enrichment & fun",
        href: "/collections/cats-toys-play",
        image: "/images/categories/playing.jpg",
        keywords: ["toy", "toys", "ball", "teaser", "wand", "feather", "mouse", "catnip", "interactive", "laser", "play", "game"]
      },
      {
        id: "cats-scratch-furniture",
        petType: "cat",
        title: "Scratch & Furniture",
        subtitle: "Trees, posts & scratchers",
        href: "/collections/cats-scratch-furniture",
        image: "/images/categories/cat-scratchers.jpg",
        keywords: ["scratching", "scratcher", "scratch post", "scratch pad", "cat tree", "tower", "sisal", "furniture", "perch", "climbing"]
      },
      {
        id: "cats-grooming",
        petType: "cat",
        title: "Grooming",
        subtitle: "Brushes & care essentials",
        href: "/collections/cats-grooming",
        image: "/images/categories/grooming.jpg",
        keywords: ["brush", "groom", "grooming", "deshedding", "clipper", "fur", "nail", "bath", "clean"]
      },
      {
        id: "cats-food-accessories",
        petType: "cat",
        title: "Food & Accessories",
        subtitle: "Bowls, feeders & litter",
        href: "/collections/cats-food-accessories",
        image: "/images/categories/cat-feeding.jpg",
        keywords: ["bowl", "feeder", "slow feeder", "water", "food", "fountain", "dish", "litter", "litter box", "scoop", "treat"]
      }
    ]
  }
};

const BUCKET_TO_CATEGORY = {
  toys: "toys-play",
  feeding: "food-accessories",
  travel: "travel",
  grooming: "grooming",
  training: "training",
  beds: "sleep-comfort",
  health: "food-accessories",
  litter: "food-accessories",
  scratchers: "scratch-furniture",
  walking: "walking",
  unknown: null
};

function getAllCategories() {
  return [
    ...CATEGORY_CONFIG.dogs.categories,
    ...CATEGORY_CONFIG.cats.categories
  ];
}

function getCategoriesByPet(petType) {
  if (petType === "dog" || petType === "dogs") {
    return CATEGORY_CONFIG.dogs.categories;
  }
  if (petType === "cat" || petType === "cats") {
    return CATEGORY_CONFIG.cats.categories;
  }
  return getAllCategories();
}

function getCategoryBySlug(slug) {
  const allCats = getAllCategories();
  return allCats.find(c => 
    c.id === slug || 
    c.href === `/collections/${slug}` ||
    c.href.endsWith(`/${slug}`)
  ) || null;
}

function getCategoryByPetAndSlug(petType, slug) {
  const categories = getCategoriesByPet(petType);
  const fullSlug = `${petType}s-${slug}`;
  return categories.find(c => 
    c.id === slug || 
    c.id === fullSlug ||
    c.href.endsWith(`/${slug}`) ||
    c.href.endsWith(`/${fullSlug}`)
  ) || null;
}

function mapBucketToCategory(bucket, petType) {
  const baseCat = BUCKET_TO_CATEGORY[bucket];
  if (!baseCat) return null;
  return petType ? `${petType}s-${baseCat}` : baseCat;
}

function classifyProductToCategory(product) {
  const combined = [
    product.title || '',
    product.description || '',
    Array.isArray(product.tags) ? product.tags.join(' ') : (product.tags || ''),
    product.category || ''
  ].join(' ').toLowerCase();
  
  const petType = product.petType || product.pet_usage;
  const categories = petType ? getCategoriesByPet(petType) : getAllCategories();
  
  for (const cat of categories) {
    const matchCount = cat.keywords.filter(kw => combined.includes(kw)).length;
    if (matchCount >= 2) {
      return cat.id;
    }
  }
  
  for (const cat of categories) {
    if (cat.keywords.some(kw => combined.includes(kw))) {
      return cat.id;
    }
  }
  
  return null;
}

module.exports = {
  CATEGORY_CONFIG,
  BUCKET_TO_CATEGORY,
  getAllCategories,
  getCategoriesByPet,
  getCategoryBySlug,
  getCategoryByPetAndSlug,
  mapBucketToCategory,
  classifyProductToCategory
};
