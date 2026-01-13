"use strict";

const fs = require("fs");
const path = require("path");

const PRODUCTS_PATH = path.join(__dirname, "..", "data", "products_cj.json");
const HERO_PATH = path.join(__dirname, "..", "data", "hero-products.json");

const ADULT_KEYWORDS = [
  'masturbator', 'dildo', 'vibrator', 'anal', 'sex toy', 'erotic', 'lingerie',
  'condom', 'fetish', 'bdsm', 'bondage', 'adult toy', 'pleasure', 'intimate',
  'sensual', 'nipple', 'butt plug', 'cock ring', 'penis', 'vagina', 'orgasm'
];

const NON_PET_KEYWORDS = [
  'tattoo sticker', 'fashion shoes', 'phone case', 'cosmetics', 'makeup',
  'nail art', 'human clothing', 'jewelry', 'watch', 'sunglasses', 'handbag',
  'wallet', 'perfume', 'beauty', 'skincare', 'hair extension', 'wig',
  'baby clothes', 'kids shoes', 'men shirt', 'women dress', 'hoodie',
  'sneaker', 'boots', 'sandal', 'headphone', 'speaker', 'keyboard',
  'mouse pad', 'laptop', 'tablet', 'camera', 'drone', 'fishing', 'camping tent'
];

function classifyBlockReason(product) {
  const text = [
    product.title || '',
    product.name || '',
    product.description || '',
    product.category || '',
    ...(product.tags || [])
  ].join(' ').toLowerCase();

  for (const kw of ADULT_KEYWORDS) {
    if (text.includes(kw)) {
      return { allowed: false, reason: 'adult_keyword', keyword: kw };
    }
  }

  for (const kw of NON_PET_KEYWORDS) {
    if (text.includes(kw)) {
      return { allowed: false, reason: 'non_pet_keyword', keyword: kw };
    }
  }

  if (product.is_pet_product === false) {
    return { allowed: false, reason: 'not_pet_product', keyword: null };
  }

  if (product.blocked_reason) {
    return { allowed: false, reason: 'blocked_by_classifier', keyword: product.blocked_reason };
  }

  return { allowed: true, reason: null, keyword: null };
}

function countImages(product) {
  const images = product.images || [];
  const mainImage = product.image ? 1 : 0;
  const variantImages = (product.variants || []).filter(v => v.image).length;
  const total = new Set([
    ...(Array.isArray(images) ? images : []),
    product.image
  ].filter(Boolean)).size;
  return total;
}

function countVideos(product) {
  const videos = product.videos || [];
  const singleVideo = product.video ? 1 : 0;
  return (Array.isArray(videos) ? videos.length : 0) + singleVideo;
}

function classifyPetCategory(product) {
  const text = [
    product.title || '',
    product.name || '',
    product.category || '',
    product.mainCategorySlug || '',
    product.pet_type || ''
  ].join(' ').toLowerCase();

  const hasDog = /\bdog\b|\bpuppy\b|\bcanine\b|\bpup\b/.test(text);
  const hasCat = /\bcat\b|\bkitten\b|\bkitty\b|\bfeline\b/.test(text);
  const hasSmallPet = /\brabbit\b|\bhamster\b|\bguinea pig\b|\bferret\b|\bbird\b|\bparrot\b|\bfish\b|\baquarium\b|\bcage\b|\bterrarium\b|\bchinchilla\b|\bgerbil\b/.test(text);

  if (hasSmallPet) return 'smallPets';
  if (hasDog && hasCat) return 'both';
  if (hasDog) return 'dogs';
  if (hasCat) return 'cats';
  if (product.pet_type === 'both') return 'both';
  if (product.pet_type === 'dog') return 'dogs';
  if (product.pet_type === 'cat') return 'cats';
  return 'unclassified';
}

function loadProducts() {
  if (!fs.existsSync(PRODUCTS_PATH)) {
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf8"));
    return Array.isArray(data) ? data : (data.products || []);
  } catch (e) {
    console.error("[Report] Error loading products:", e.message);
    return [];
  }
}

function loadHeroConfig() {
  if (!fs.existsSync(HERO_PATH)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(HERO_PATH, "utf8"));
  } catch (e) {
    console.error("[Report] Error loading hero config:", e.message);
    return null;
  }
}

function generateReport() {
  const products = loadProducts();
  const heroConfig = loadHeroConfig();
  const productMap = new Map(products.map(p => [String(p.id), p]));

  const counts = {
    productsTotal: products.length,
    allowed: 0,
    blockedAdult: 0,
    blockedNonPet: 0
  };

  const images = { zero: 0, one: 0, twoOrMore: 0 };
  const videos = { zero: 0, oneOrMore: 0 };
  const categories = { dogs: 0, cats: 0, both: 0, smallPets: 0, unclassified: 0 };

  const blockedSamples = { adult: [], nonPet: [] };
  const imageSamples = { zeroImages: [], oneImage: [], twoOrMore: [] };
  const videoSamples = { hasVideos: [] };

  for (const product of products) {
    const blockResult = classifyBlockReason(product);
    const imgCount = countImages(product);
    const vidCount = countVideos(product);
    const petCategory = classifyPetCategory(product);

    if (blockResult.allowed) {
      counts.allowed++;
    } else {
      if (blockResult.reason === 'adult_keyword') {
        counts.blockedAdult++;
        if (blockedSamples.adult.length < 20) {
          blockedSamples.adult.push({
            id: product.id,
            title: (product.title || product.name || '').slice(0, 60),
            reason: blockResult.reason
          });
        }
      } else {
        counts.blockedNonPet++;
        if (blockedSamples.nonPet.length < 20) {
          blockedSamples.nonPet.push({
            id: product.id,
            title: (product.title || product.name || '').slice(0, 60),
            reason: blockResult.reason
          });
        }
      }
    }

    if (imgCount === 0) {
      images.zero++;
      if (imageSamples.zeroImages.length < 20) {
        imageSamples.zeroImages.push({ id: product.id, title: (product.title || product.name || '').slice(0, 60) });
      }
    } else if (imgCount === 1) {
      images.one++;
      if (imageSamples.oneImage.length < 20) {
        imageSamples.oneImage.push({ id: product.id, title: (product.title || product.name || '').slice(0, 60) });
      }
    } else {
      images.twoOrMore++;
      if (imageSamples.twoOrMore.length < 20) {
        imageSamples.twoOrMore.push({ id: product.id, title: (product.title || product.name || '').slice(0, 60), imageCount: imgCount });
      }
    }

    if (vidCount === 0) {
      videos.zero++;
    } else {
      videos.oneOrMore++;
      if (videoSamples.hasVideos.length < 20) {
        videoSamples.hasVideos.push({ id: product.id, title: (product.title || product.name || '').slice(0, 60), videosCount: vidCount });
      }
    }

    if (categories[petCategory] !== undefined) {
      categories[petCategory]++;
    } else {
      categories.unclassified++;
    }
  }

  const heroCheck = {
    sections: {},
    missingIds: [],
    blockedIds: []
  };

  if (heroConfig) {
    const sections = ['bestSellers', 'topPicksDogs', 'topPicksCats', 'trendingNow', 'trending', 'smallPets'];
    for (const section of sections) {
      const ids = heroConfig[section] || [];
      if (!Array.isArray(ids) || ids.length === 0) continue;

      const configured = ids.length;
      let resolved = 0;
      let missing = 0;
      let blocked = 0;

      for (const id of ids) {
        const product = productMap.get(String(id));
        if (!product) {
          missing++;
          heroCheck.missingIds.push({ section, id: String(id) });
        } else {
          const blockResult = classifyBlockReason(product);
          if (blockResult.allowed) {
            resolved++;
          } else {
            blocked++;
            heroCheck.blockedIds.push({
              section,
              id: String(id),
              title: (product.title || product.name || '').slice(0, 60),
              reason: blockResult.reason
            });
          }
        }
      }

      heroCheck.sections[section] = { configured, resolved, missing, blocked };
    }
  }

  return {
    timestamp: new Date().toISOString(),
    counts,
    images,
    videos,
    categories,
    blockedSamples,
    imageSamples,
    videoSamples,
    heroCheck
  };
}

function printReport(report) {
  console.log("============================================================");
  console.log("          GETPAWSY DATA QUALITY + SAFETY REPORT");
  console.log("============================================================");
  console.log(`Timestamp: ${report.timestamp}\n`);

  console.log("PRODUCT COUNTS");
  console.log("----------------------------------------");
  console.log(`  Total Products:     ${report.counts.productsTotal}`);
  console.log(`  Allowed (safe):     ${report.counts.allowed}`);
  console.log(`  Blocked (adult):    ${report.counts.blockedAdult}`);
  console.log(`  Blocked (non-pet):  ${report.counts.blockedNonPet}`);
  console.log();

  console.log("IMAGE COVERAGE");
  console.log("----------------------------------------");
  console.log(`  0 images:   ${report.images.zero}`);
  console.log(`  1 image:    ${report.images.one}`);
  console.log(`  2+ images:  ${report.images.twoOrMore}`);
  console.log();

  console.log("VIDEO COVERAGE");
  console.log("----------------------------------------");
  console.log(`  No videos:    ${report.videos.zero}`);
  console.log(`  Has videos:   ${report.videos.oneOrMore}`);
  console.log();

  console.log("CATEGORY DISTRIBUTION");
  console.log("----------------------------------------");
  console.log(`  Dogs:         ${report.categories.dogs}`);
  console.log(`  Cats:         ${report.categories.cats}`);
  console.log(`  Both:         ${report.categories.both}`);
  console.log(`  Small Pets:   ${report.categories.smallPets}`);
  console.log(`  Unclassified: ${report.categories.unclassified}`);
  console.log();

  console.log("HERO/CAROUSEL CHECK");
  console.log("----------------------------------------");
  const sections = Object.entries(report.heroCheck.sections);
  if (sections.length === 0) {
    console.log("  No hero configuration found");
  } else {
    for (const [section, stats] of sections) {
      console.log(`  ${section}: ${stats.resolved}/${stats.configured} resolved, ${stats.missing} missing, ${stats.blocked} blocked`);
    }
  }

  if (report.heroCheck.missingIds.length > 0) {
    console.log(`\n  Missing IDs (${report.heroCheck.missingIds.length}):`);
    report.heroCheck.missingIds.slice(0, 10).forEach(m => {
      console.log(`    - ${m.section}: ${m.id}`);
    });
  }

  if (report.heroCheck.blockedIds.length > 0) {
    console.log(`\n  Blocked IDs (${report.heroCheck.blockedIds.length}):`);
    report.heroCheck.blockedIds.slice(0, 10).forEach(b => {
      console.log(`    - ${b.section}: ${b.id} (${b.reason})`);
    });
  }

  console.log();
  console.log("============================================================");
  console.log("                    REPORT COMPLETE");
  console.log("============================================================");
}

module.exports = { generateReport, printReport, loadProducts, classifyBlockReason };
