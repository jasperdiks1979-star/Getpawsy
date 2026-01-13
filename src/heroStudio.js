const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Import the new comprehensive preset library
const heroPresets = require('./config/heroPresets');

const HEROES_PATH = path.join(__dirname, '..', 'data', 'heroes.json');
const HERO_IMAGES_DIR = path.join(__dirname, '..', 'public', 'images', 'hero');

// Use presets from the new library
const STYLE_PRESETS = heroPresets.STYLE_PRESETS;
const CATEGORY_SCENES = heroPresets.CATEGORY_SCENES;
const FORMAT_DIRECTIVES = heroPresets.FORMAT_DIRECTIVES;

// Legacy aspect configs for backward compatibility
const ASPECT_CONFIGS = {
  ultrawide: { width: 2560, height: 900, ratio: '16:9', suffix: 'ultrawide' },
  desktop: { width: 1920, height: 700, ratio: '16:9', suffix: 'desktop' },
  mobile: { width: 1080, height: 1350, ratio: '3:4', suffix: 'mobile' }
};

function loadHeroes() {
  try {
    if (fs.existsSync(HEROES_PATH)) {
      return JSON.parse(fs.readFileSync(HEROES_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[HeroStudio] Error loading heroes:', e.message);
  }
  return { heroes: [], activeHeroes: {} };
}

function saveHeroes(data) {
  fs.writeFileSync(HEROES_PATH, JSON.stringify(data, null, 2));
}

function ensureHeroDir(category) {
  const categoryDir = path.join(HERO_IMAGES_DIR, category);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }
  return categoryDir;
}

function generateHeroId() {
  return `hero_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Build prompt using the new preset library (V2)
 * Supports petType, category, subcategory, format, and custom keywords
 */
function buildHeroPrompt(options) {
  return heroPresets.buildHeroPrompt(options);
}

/**
 * Legacy buildPrompt for backward compatibility
 * Legacy format: 'dogs-toys' -> {petType: 'dogs', subcategory: 'toys'}
 */
function buildPrompt(category, stylePreset, customKeywords, includeBrandText) {
  // Parse legacy category format (e.g., 'dogs-toys' -> {petType: 'dogs', subcategory: 'toys'})
  const parts = category ? category.split('-') : ['dogs'];
  const petType = parts[0] || 'dogs';
  // Legacy format uses hyphenated subcategory (e.g., 'dogs-toys', 'cats-beds')
  const subcategory = parts.slice(1).join('-') || null;
  
  const result = heroPresets.buildHeroPrompt({
    petType,
    category: subcategory,  // Pass subcategory as category for fallback
    subcategory,            // Also pass as subcategory for priority matching
    format: 'desktop',
    customKeywords,
    preset: stylePreset || 'bright-premium',
    includeBrandSpace: includeBrandText
  });
  
  return {
    prompt: result.prompt,
    negativePrompt: result.negativePrompt
  };
}

async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function getHeroes() {
  return loadHeroes();
}

function getHeroById(heroId) {
  const data = loadHeroes();
  return data.heroes.find(h => h.id === heroId);
}

function getActiveHero(category) {
  const data = loadHeroes();
  const activeId = data.activeHeroes[category];
  if (activeId) {
    return data.heroes.find(h => h.id === activeId);
  }
  return null;
}

function activateHero(heroId) {
  const data = loadHeroes();
  const hero = data.heroes.find(h => h.id === heroId);
  
  if (!hero) {
    throw new Error('Hero not found');
  }
  
  data.activeHeroes[hero.category] = heroId;
  saveHeroes(data);
  
  return hero;
}

function deleteHero(heroId) {
  const data = loadHeroes();
  const heroIndex = data.heroes.findIndex(h => h.id === heroId);
  
  if (heroIndex === -1) {
    throw new Error('Hero not found');
  }
  
  const hero = data.heroes[heroIndex];
  
  if (hero.paths) {
    Object.values(hero.paths).forEach(imagePath => {
      const fullPath = path.join(__dirname, '..', 'public', imagePath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          console.error('[HeroStudio] Error deleting image:', e.message);
        }
      }
    });
  }
  
  if (data.activeHeroes[hero.category] === heroId) {
    delete data.activeHeroes[hero.category];
  }
  
  data.heroes.splice(heroIndex, 1);
  saveHeroes(data);
  
  return { deleted: true };
}

function saveGeneratedHero(heroId, category, stylePreset, promptUsed, imagePaths) {
  const data = loadHeroes();
  
  const hero = {
    id: heroId,
    category,
    stylePreset,
    promptUsed,
    paths: imagePaths,
    createdAt: new Date().toISOString(),
    active: false
  };
  
  data.heroes.push(hero);
  saveHeroes(data);
  
  return hero;
}

function getStylePresets() {
  return heroPresets.getStylePresets();
}

function getFormats() {
  return heroPresets.getFormats();
}

function getCategoryOptions(petType) {
  return heroPresets.getCategoryOptions(petType);
}

function getCategories() {
  // Legacy: return category list for backward compatibility
  const petTypes = ['dogs', 'cats'];
  const categories = [];
  
  petTypes.forEach(petType => {
    const scenes = CATEGORY_SCENES[petType] || {};
    Object.keys(scenes).forEach(cat => {
      if (cat !== 'default') {
        categories.push({
          id: `${petType}-${cat}`,
          name: `${petType.charAt(0).toUpperCase() + petType.slice(1)} - ${cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`
        });
      }
    });
  });
  
  return categories;
}

module.exports = {
  loadHeroes,
  saveHeroes,
  ensureHeroDir,
  generateHeroId,
  buildPrompt,
  buildHeroPrompt,
  downloadImage,
  getHeroes,
  getHeroById,
  getActiveHero,
  activateHero,
  deleteHero,
  saveGeneratedHero,
  getStylePresets,
  getFormats,
  getCategoryOptions,
  getCategories,
  STYLE_PRESETS,
  CATEGORY_SCENES,
  FORMAT_DIRECTIVES,
  ASPECT_CONFIGS
};
