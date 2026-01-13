const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const productCatalog = require("../services/productCatalog");
const { getAllBanners } = require("../helpers/categoryBanners");
const { getRecommended } = require("../helpers/recommendations");
const { 
  getHomepageSections, 
  getTopPicksForDogs, 
  getTopPicksForCats, 
  getTopPicksForSmallPets,
  getBestSellers, 
  getTrending,
  filterHomepageEligible 
} = require("../helpers/topProducts");
const { filterPetOnly, filterForDogs, filterForCats } = require("../src/petClassifier");
const { calculateProductScore } = require("../src/topPicks");
const { prepareProductsForView } = require("../src/lib/productNormalize");

function filterWithImages(products) {
  return filterPetOnly(products).filter(p => p.images && p.images.length > 0);
}

router.get("/", async (req, res) => {
  try {
    const heroTemplates = [
      "hero_v14/hero_dog",
      "hero_v14/hero_cat",
      "hero_v14/hero_dual",
      "hero_v14/hero_ai",
      "hero_v14/hero_play"
    ];
    const selectedHero = heroTemplates[Math.floor(Math.random() * heroTemplates.length)];
    
    const dogEssentials = getTopPicksForDogs(12);
    const catEssentials = getTopPicksForCats(12);
    const smallPetProducts = getTopPicksForSmallPets(12);
    const bestSellers = getBestSellers(12);
    const trendingProducts = getTrending(12);
    
    console.log(`[HOME] Sections loaded: dogs=${dogEssentials.length}, cats=${catEssentials.length}, smallPets=${smallPetProducts.length}, bestSellers=${bestSellers.length}, trending=${trendingProducts.length}`);
    
    const allProducts = filterHomepageEligible(productCatalog.loadProducts());
    const allEssentials = allProducts.slice(0, 12);
    
    const banners = getAllBanners();
    const recommended = filterWithImages(getRecommended(16)).slice(0, 8);
    const topProducts = filterWithImages(productCatalog.getBestSellers(24)).slice(0, 12);
    const sections = getHomepageSections();
    
    const buildStamp = `BUILD: ${new Date().toISOString().slice(0,16)}`;
    
    res.render("index", { 
      title: "GetPawsy | Premium Pet Products", 
      hero: selectedHero,
      banners,
      dogEssentials: prepareProductsForView(dogEssentials),
      catEssentials: prepareProductsForView(catEssentials),
      smallPetProducts: prepareProductsForView(smallPetProducts),
      allEssentials: prepareProductsForView(allEssentials),
      trendingProducts: prepareProductsForView(trendingProducts),
      recommended: prepareProductsForView(recommended),
      topProducts: prepareProductsForView(topProducts),
      bestSellers: prepareProductsForView(bestSellers),
      randomHighRated: prepareProductsForView(sections.highRatedRandom.slice(0, 8)),
      mixedProducts: prepareProductsForView(sections.mixed.slice(0, 8)),
      bundles: [],
      buildStamp
    });
  } catch (err) {
    console.error("Home route error:", err);
    const heroTemplates = [
      "hero_v14/hero_dog",
      "hero_v14/hero_cat",
      "hero_v14/hero_dual",
      "hero_v14/hero_ai",
      "hero_v14/hero_play"
    ];
    const selectedHero = heroTemplates[Math.floor(Math.random() * heroTemplates.length)];
    res.render("index", { 
      title: "GetPawsy", 
      hero: selectedHero,
      banners: {},
      dogEssentials: [],
      catEssentials: [],
      smallPetProducts: [],
      allEssentials: [],
      trendingProducts: [],
      recommended: [],
      topProducts: [],
      bestSellers: [],
      randomHighRated: [],
      mixedProducts: [],
      bundles: [],
      buildStamp: `BUILD: ${new Date().toISOString().slice(0,16)}`
    });
  }
});

module.exports = router;
