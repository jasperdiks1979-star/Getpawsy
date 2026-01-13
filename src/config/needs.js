/**
 * GetPawsy Need-Based Navigation Configuration
 * Maps user needs to product categories and filters
 */

const NEEDS_CONFIG = [
  {
    id: "sleep-comfort",
    slug: "sleep-comfort",
    title: "Sleep & Comfort",
    icon: "🛏️",
    description: "Cozy beds, blankets & relaxation",
    href: "/need/sleep-comfort",
    keywords: ["bed", "cushion", "blanket", "pillow", "mat", "cave", "orthopedic", "donut", "calming"],
    buckets: ["beds"]
  },
  {
    id: "play-energy",
    slug: "play-energy", 
    title: "Play & Energy",
    icon: "🎾",
    description: "Toys, balls & interactive fun",
    href: "/need/play-energy",
    keywords: ["toy", "ball", "rope", "squeaky", "fetch", "interactive", "teaser", "wand", "mouse", "laser"],
    buckets: ["toys"]
  },
  {
    id: "feeding",
    slug: "feeding",
    title: "Feeding",
    icon: "🍽️",
    description: "Bowls, feeders & water fountains",
    href: "/need/feeding",
    keywords: ["bowl", "feeder", "slow feeder", "fountain", "dish", "food", "water"],
    buckets: ["feeding"]
  },
  {
    id: "grooming",
    slug: "grooming",
    title: "Grooming",
    icon: "✨",
    description: "Brushes, shampoos & care",
    href: "/need/grooming",
    keywords: ["brush", "groom", "grooming", "deshedding", "shampoo", "clipper", "nail", "fur"],
    buckets: ["grooming"]
  },
  {
    id: "health-wellness",
    slug: "health-wellness",
    title: "Health & Wellness",
    icon: "💊",
    description: "Supplements, dental & calming",
    href: "/need/health-wellness",
    keywords: ["supplement", "vitamin", "probiotic", "calming", "dental", "flea", "tick", "health"],
    buckets: ["health"]
  }
];

function getNeedBySlug(slug) {
  return NEEDS_CONFIG.find(n => n.slug === slug || n.id === slug) || null;
}

function getAllNeeds() {
  return NEEDS_CONFIG;
}

module.exports = {
  NEEDS_CONFIG,
  getNeedBySlug,
  getAllNeeds
};
