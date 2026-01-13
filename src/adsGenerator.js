const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const ADS_DB_PATH = path.join(__dirname, '..', 'data', 'ads.json');
const THEMES_DB_PATH = path.join(__dirname, '..', 'data', 'pmax-themes.json');
const COLLECTIONS_DB_PATH = path.join(__dirname, '..', 'data', 'collections.json');
const COPY_DB_PATH = path.join(__dirname, '..', 'data', 'copyblocks.json');

const GLOBAL_NEGATIVE_KEYWORDS = [
  'jewelry', 'ring', 'necklace', 'bracelet', 'earrings', 'jeans', 'lingerie', 
  'bikini', 'dress', 'hoodie', 't-shirt', 'cosplay', 'keychain', 'scrapbook', 
  'knife', 'mold', 'makeup', 'phone case', 'adult', 'sexy', 'costume'
];

const CHAR_LIMITS = {
  search: {
    headline: 30,
    description: 90,
    path: 15,
    maxHeadlines: 15,
    maxDescriptions: 4
  },
  pmax: {
    headline: 30,
    longHeadline: 90,
    description: 90,
    callout: 25,
    sitelinkText: 25,
    sitelinkDesc: 35,
    maxHeadlines: 5,
    maxDescriptions: 5,
    maxCallouts: 10
  }
};

function ensureFile(filePath, defaultData) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
}

function readJSON(filePath, defaultData = {}) {
  ensureFile(filePath, defaultData);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return defaultData;
  }
}

function writeJSON(filePath, data) {
  ensureFile(filePath, {});
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function truncateText(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  const shortened = text.slice(0, maxLen - 3).trim() + '...';
  return shortened.length <= maxLen ? shortened : text.slice(0, maxLen);
}

function sanitizeAdText(text) {
  if (!text) return '';
  return text
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateId() {
  return 'ad_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DEFAULT_THEMES = [
  {
    id: 'theme_dog_chewers',
    name: 'Chewers & Tough Toys',
    petType: 'dog',
    categoryKeys: ['toys', 'chew', 'durable', 'dental'],
    intentKeywords: ['chew toy', 'durable dog toy', 'aggressive chewer', 'indestructible dog toy', 'dental chew', 'tough rubber toy', 'dog chewing', 'strong dog toy'],
    headlineTemplates: [
      'Shop {ProductShort}',
      'Built for Chewers',
      'Durable Dog Toys',
      '{Pet} Approved Chews',
      'GetPawsy Top Pick'
    ],
    longHeadlineTemplates: [
      'Premium durable toys for aggressive chewers — curated by GetPawsy.',
      '{ProductShort} — built tough for your pup\'s strongest chews.'
    ],
    descriptionTemplates: [
      'Discover {ProductShort}, designed for dogs who love to chew. Durable materials built to last. Shop GetPawsy today.',
      'Give your pup a toy that lasts. {ProductShort} is made for aggressive chewers. Free returns, secure checkout.'
    ],
    calloutsDefault: ['Durable Design', 'Built for Chewers', 'Easy Returns', 'Secure Checkout', 'Quality Picks'],
    structuredSnippetsDefault: [{ header: 'Features', values: ['Durable', 'Easy Grip', 'Long-Lasting', 'Easy Clean'] }],
    audienceDefaults: {
      inMarket: ['Dog Supplies', 'Pet Supplies', 'Dog Toys'],
      interests: ['Pet Owners', 'Dog Lovers'],
      customIntentKeywords: ['buy dog chew toy', 'durable dog toys', 'indestructible dog toy', 'best chew toys for dogs']
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'theme_dog_walk',
    name: 'Walk & Train Essentials',
    petType: 'dog',
    categoryKeys: ['leash', 'harness', 'collar', 'training', 'walk'],
    intentKeywords: ['leash', 'harness', 'no pull', 'dog training', 'collar', 'dog walking', 'puppy training', 'lead'],
    headlineTemplates: [
      'Shop {ProductShort}',
      'Walk & Train Gear',
      'No-Pull Harnesses',
      'Everyday Dog Walks',
      'GetPawsy Essentials'
    ],
    longHeadlineTemplates: [
      'Premium walking and training gear for your best walks together — GetPawsy.',
      '{ProductShort} — making daily walks easier and more enjoyable.'
    ],
    descriptionTemplates: [
      'Upgrade your dog walks with {ProductShort}. Comfortable fit, easy control. Shop GetPawsy now.',
      'Train smarter with {ProductShort}. Designed for comfort and control on every walk.'
    ],
    calloutsDefault: ['No-Pull Options', 'Comfortable Fit', 'Easy Returns', 'Secure Checkout', 'Quality Picks'],
    structuredSnippetsDefault: [{ header: 'Good For', values: ['Daily Walks', 'Training', 'Puppies', 'Large Dogs'] }],
    audienceDefaults: {
      inMarket: ['Dog Supplies', 'Pet Supplies', 'Dog Training'],
      interests: ['Pet Owners', 'Dog Training'],
      customIntentKeywords: ['buy dog leash', 'no pull harness', 'dog walking gear', 'puppy training supplies']
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'theme_dog_beds',
    name: 'Comfort & Beds',
    petType: 'dog',
    categoryKeys: ['bed', 'comfort', 'sleep', 'orthopedic', 'mat', 'crate'],
    intentKeywords: ['dog bed', 'cozy dog bed', 'orthopedic', 'washable cover', 'crate mat', 'pet bed', 'sleeping mat'],
    headlineTemplates: [
      'Shop {ProductShort}',
      'Cozy Dog Beds',
      'Comfort for Pups',
      'Rest & Relaxation',
      'GetPawsy Comfort'
    ],
    longHeadlineTemplates: [
      'Premium cozy beds for your pup\'s best rest — curated by GetPawsy.',
      '{ProductShort} — where comfort meets quality for happier naps.'
    ],
    descriptionTemplates: [
      'Give your dog the rest they deserve with {ProductShort}. Cozy, washable, and built to last. Shop now.',
      'Premium comfort for your pup. {ProductShort} features easy-clean materials and superior cushioning.'
    ],
    calloutsDefault: ['Cozy Comfort', 'Easy Clean', 'Easy Returns', 'Secure Checkout', 'Quality Picks'],
    structuredSnippetsDefault: [{ header: 'Types', values: ['Beds', 'Mats', 'Covers', 'Crate Pads'] }],
    audienceDefaults: {
      inMarket: ['Dog Supplies', 'Pet Supplies', 'Pet Beds'],
      interests: ['Pet Owners', 'Home & Garden'],
      customIntentKeywords: ['buy dog bed', 'orthopedic dog bed', 'washable dog bed', 'cozy pet bed']
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'theme_cat_enrichment',
    name: 'Cat Enrichment & Play',
    petType: 'cat',
    categoryKeys: ['toys', 'interactive', 'enrichment', 'play', 'puzzle'],
    intentKeywords: ['interactive cat toy', 'enrichment', 'boredom', 'teaser', 'puzzle toy', 'cat play', 'indoor cat'],
    headlineTemplates: [
      'Shop {ProductShort}',
      'Interactive Cat Toys',
      'Keep Cats Busy',
      'Indoor Cat Fun',
      'GetPawsy Cat Picks'
    ],
    longHeadlineTemplates: [
      'Interactive toys to keep your cat entertained for hours — GetPawsy.',
      '{ProductShort} — enrichment and play for happier indoor cats.'
    ],
    descriptionTemplates: [
      'Keep your cat engaged with {ProductShort}. Interactive design for endless fun. Shop GetPawsy today.',
      'Beat boredom with {ProductShort}. Designed to stimulate your cat\'s natural instincts.'
    ],
    calloutsDefault: ['Keeps Cats Busy', 'Indoor Fun', 'Easy Returns', 'Secure Checkout', 'Quality Picks'],
    structuredSnippetsDefault: [{ header: 'Features', values: ['Interactive', 'Engaging', 'Indoor-Friendly', 'Stimulating'] }],
    audienceDefaults: {
      inMarket: ['Cat Supplies', 'Pet Supplies', 'Cat Toys'],
      interests: ['Pet Owners', 'Cat Lovers'],
      customIntentKeywords: ['buy cat toys', 'interactive cat toy', 'indoor cat entertainment', 'puzzle toys for cats']
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'theme_cat_scratch',
    name: 'Scratch & Furniture',
    petType: 'cat',
    categoryKeys: ['scratching', 'post', 'tree', 'scratcher', 'sisal', 'furniture'],
    intentKeywords: ['scratching post', 'cat tree', 'scratcher', 'sisal', 'furniture protection', 'cat climbing'],
    headlineTemplates: [
      'Shop {ProductShort}',
      'Cat Scratching Posts',
      'Protect Your Furniture',
      'Cat Trees & More',
      'GetPawsy Cat Picks'
    ],
    longHeadlineTemplates: [
      'Premium scratchers and cat trees your feline will love — GetPawsy.',
      '{ProductShort} — save your furniture while keeping your cat happy.'
    ],
    descriptionTemplates: [
      'Give your cat a scratching outlet with {ProductShort}. Protect your furniture, satisfy their instincts.',
      'Premium cat furniture from GetPawsy. {ProductShort} combines fun and function for happier cats.'
    ],
    calloutsDefault: ['Protect Furniture', 'Cat-Approved', 'Easy Returns', 'Secure Checkout', 'Quality Picks'],
    structuredSnippetsDefault: [{ header: 'Types', values: ['Scratchers', 'Posts', 'Trees', 'Loungers'] }],
    audienceDefaults: {
      inMarket: ['Cat Supplies', 'Pet Supplies', 'Cat Furniture'],
      interests: ['Pet Owners', 'Cat Lovers'],
      customIntentKeywords: ['buy cat scratcher', 'cat tree', 'scratching post', 'cat furniture']
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'theme_cat_litter',
    name: 'Litter & Cleaning',
    petType: 'cat',
    categoryKeys: ['litter', 'box', 'cleaning', 'hygiene', 'scoop', 'mat'],
    intentKeywords: ['litter box', 'odor control', 'scoop', 'mat', 'cat hygiene', 'litter pan', 'cat cleanup'],
    headlineTemplates: [
      'Shop {ProductShort}',
      'Litter Box Solutions',
      'Cleaner Cat Home',
      'Odor Control Gear',
      'GetPawsy Cat Care'
    ],
    longHeadlineTemplates: [
      'Premium litter solutions for a cleaner, fresher home — GetPawsy.',
      '{ProductShort} — practical cat care for a tidier living space.'
    ],
    descriptionTemplates: [
      'Keep your home fresh with {ProductShort}. Easy setup, effective odor control. Shop GetPawsy now.',
      'Simplify cat care with {ProductShort}. Designed for easy cleaning and odor management.'
    ],
    calloutsDefault: ['Cleaner Home', 'Easy Setup', 'Easy Returns', 'Secure Checkout', 'Quality Picks'],
    structuredSnippetsDefault: [{ header: 'Features', values: ['Easy Clean', 'Odor Control', 'Practical', 'Durable'] }],
    audienceDefaults: {
      inMarket: ['Cat Supplies', 'Pet Supplies', 'Cat Litter'],
      interests: ['Pet Owners', 'Cat Lovers'],
      customIntentKeywords: ['buy litter box', 'cat litter supplies', 'odor control litter', 'litter box mat']
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'theme_feeding',
    name: 'Feeding & Hydration',
    petType: 'both',
    categoryKeys: ['bowl', 'feeder', 'fountain', 'food', 'water', 'hydration', 'slow feeder'],
    intentKeywords: ['pet bowl', 'slow feeder', 'water fountain', 'feeder', 'hydration', 'dog bowl', 'cat bowl'],
    headlineTemplates: [
      'Shop {ProductShort}',
      'Pet Feeding Bowls',
      'Daily Pet Essentials',
      'Hydration Solutions',
      'GetPawsy Essentials'
    ],
    longHeadlineTemplates: [
      'Premium feeding and hydration for happier, healthier pets — GetPawsy.',
      '{ProductShort} — everyday essentials for your pet\'s well-being.'
    ],
    descriptionTemplates: [
      'Upgrade mealtimes with {ProductShort}. Easy-clean, practical design for daily use. Shop now.',
      'Keep your pet hydrated and happy with {ProductShort}. Quality feeding solutions from GetPawsy.'
    ],
    calloutsDefault: ['Daily Essential', 'Easy Clean', 'Easy Returns', 'Secure Checkout', 'Quality Picks'],
    structuredSnippetsDefault: [{ header: 'Good For', values: ['Daily Meals', 'Hydration', 'All Pets', 'Easy Care'] }],
    audienceDefaults: {
      inMarket: ['Pet Supplies', 'Dog Supplies', 'Cat Supplies'],
      interests: ['Pet Owners'],
      customIntentKeywords: ['buy pet bowl', 'slow feeder dog', 'cat water fountain', 'pet feeding supplies']
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const DEFAULT_COLLECTIONS = [
  { slug: 'dog-chewers', name: 'Chewers & Tough Toys', petType: 'dog', categoryKeys: ['toys', 'chew'], themeId: 'theme_dog_chewers', seoTitle: 'Dog Chew Toys & Durable Toys | GetPawsy', seoDescription: 'Shop durable chew toys for aggressive chewers. Built tough for dogs who love to chew. Fast shipping, easy returns.', heroHeadline: 'Toys Built for Chewers', heroSubline: 'Durable, long-lasting toys for dogs who love to chew' },
  { slug: 'dog-walk-train', name: 'Walk & Train Essentials', petType: 'dog', categoryKeys: ['leash', 'harness', 'collar', 'training'], themeId: 'theme_dog_walk', seoTitle: 'Dog Leashes, Harnesses & Training Gear | GetPawsy', seoDescription: 'Shop quality leashes, no-pull harnesses, and training supplies. Make every walk better. Free returns.', heroHeadline: 'Walk & Train Like a Pro', heroSubline: 'Quality gear for better walks and training sessions' },
  { slug: 'dog-beds', name: 'Dog Beds & Comfort', petType: 'dog', categoryKeys: ['bed', 'mat', 'comfort'], themeId: 'theme_dog_beds', seoTitle: 'Cozy Dog Beds & Sleeping Mats | GetPawsy', seoDescription: 'Give your pup the rest they deserve. Shop comfortable, washable dog beds. Quality comfort, easy returns.', heroHeadline: 'Cozy Beds for Happy Pups', heroSubline: 'Premium comfort for your dog\'s best rest' },
  { slug: 'cat-enrichment', name: 'Cat Enrichment & Play', petType: 'cat', categoryKeys: ['toys', 'interactive', 'enrichment'], themeId: 'theme_cat_enrichment', seoTitle: 'Interactive Cat Toys & Enrichment | GetPawsy', seoDescription: 'Keep your cat entertained with interactive toys and puzzles. Beat boredom, stimulate play. Fast shipping.', heroHeadline: 'Endless Fun for Cats', heroSubline: 'Interactive toys to keep your feline entertained' },
  { slug: 'cat-scratch-furniture', name: 'Scratch & Furniture', petType: 'cat', categoryKeys: ['scratching', 'post', 'tree', 'scratcher'], themeId: 'theme_cat_scratch', seoTitle: 'Cat Scratchers, Trees & Posts | GetPawsy', seoDescription: 'Protect your furniture with quality cat scratchers and trees. Your cat will love them. Easy returns.', heroHeadline: 'Scratch-Approved Furniture', heroSubline: 'Cat trees and scratchers your feline will love' },
  { slug: 'cat-litter-cleaning', name: 'Litter & Cleaning', petType: 'cat', categoryKeys: ['litter', 'box', 'cleaning', 'hygiene'], themeId: 'theme_cat_litter', seoTitle: 'Cat Litter Boxes & Cleaning Supplies | GetPawsy', seoDescription: 'Keep your home fresh with quality litter solutions. Easy setup, effective odor control. Shop now.', heroHeadline: 'Cleaner Cat Care', heroSubline: 'Practical solutions for a fresher home' },
  { slug: 'feeding-hydration', name: 'Feeding & Hydration', petType: 'both', categoryKeys: ['bowl', 'feeder', 'fountain', 'food', 'water'], themeId: 'theme_feeding', seoTitle: 'Pet Bowls, Feeders & Water Fountains | GetPawsy', seoDescription: 'Upgrade mealtimes with quality pet bowls and fountains. For dogs and cats. Fast shipping, easy returns.', heroHeadline: 'Mealtime Essentials', heroSubline: 'Quality feeding solutions for happy pets' },
  { slug: 'dog-grooming', name: 'Dog Grooming', petType: 'dog', categoryKeys: ['grooming', 'brush', 'shampoo', 'nail'], themeId: null, seoTitle: 'Dog Grooming Supplies | GetPawsy', seoDescription: 'Keep your pup looking great with quality grooming tools. Brushes, shampoos, and more.', heroHeadline: 'Groom Like a Pro', heroSubline: 'Everything you need for a well-groomed pup' },
  { slug: 'cat-grooming', name: 'Cat Grooming', petType: 'cat', categoryKeys: ['grooming', 'brush', 'comb'], themeId: null, seoTitle: 'Cat Grooming Supplies | GetPawsy', seoDescription: 'Keep your cat looking fabulous with gentle grooming tools. Brushes, combs, and care essentials.', heroHeadline: 'Feline Grooming Essentials', heroSubline: 'Gentle care for your cat\'s coat' }
];

function initializeThemes() {
  const data = readJSON(THEMES_DB_PATH, { themes: [] });
  if (!data.themes || data.themes.length === 0) {
    data.themes = DEFAULT_THEMES;
    writeJSON(THEMES_DB_PATH, data);
  }
  return data.themes;
}

function initializeCollections() {
  const data = readJSON(COLLECTIONS_DB_PATH, { collections: [] });
  if (!data.collections || data.collections.length === 0) {
    data.collections = DEFAULT_COLLECTIONS;
    writeJSON(COLLECTIONS_DB_PATH, data);
  }
  return data.collections;
}

function getThemes() {
  const data = readJSON(THEMES_DB_PATH, { themes: [] });
  if (!data.themes || data.themes.length === 0) {
    return initializeThemes();
  }
  return data.themes;
}

function getTheme(themeId) {
  const themes = getThemes();
  return themes.find(t => t.id === themeId);
}

function saveTheme(theme) {
  const data = readJSON(THEMES_DB_PATH, { themes: [] });
  const idx = data.themes.findIndex(t => t.id === theme.id);
  if (idx >= 0) {
    data.themes[idx] = { ...data.themes[idx], ...theme, updatedAt: new Date().toISOString() };
  } else {
    theme.id = theme.id || 'theme_' + Date.now().toString(36);
    theme.createdAt = theme.createdAt || new Date().toISOString();
    theme.updatedAt = new Date().toISOString();
    data.themes.push(theme);
  }
  writeJSON(THEMES_DB_PATH, data);
  return theme;
}

function deleteTheme(themeId) {
  const data = readJSON(THEMES_DB_PATH, { themes: [] });
  data.themes = (data.themes || []).filter(t => t.id !== themeId);
  writeJSON(THEMES_DB_PATH, data);
}

function getCollections() {
  const data = readJSON(COLLECTIONS_DB_PATH, { collections: [] });
  if (!data.collections || data.collections.length === 0) {
    return initializeCollections();
  }
  return data.collections;
}

function getCollection(slug) {
  const collections = getCollections();
  return collections.find(c => c.slug === slug);
}

function saveCollection(collection) {
  const data = readJSON(COLLECTIONS_DB_PATH, { collections: [] });
  const idx = data.collections.findIndex(c => c.slug === collection.slug);
  if (idx >= 0) {
    data.collections[idx] = { ...data.collections[idx], ...collection };
  } else {
    data.collections.push(collection);
  }
  writeJSON(COLLECTIONS_DB_PATH, data);
  return collection;
}

function getAdAssets() {
  const data = readJSON(ADS_DB_PATH, { assets: [] });
  return data.assets || [];
}

function getAdAsset(id) {
  const assets = getAdAssets();
  return assets.find(a => a.id === id);
}

function getAdAssetByProduct(productId) {
  const assets = getAdAssets();
  return assets.find(a => a.productId === productId);
}

function saveAdAsset(asset) {
  const data = readJSON(ADS_DB_PATH, { assets: [] });
  if (!data.assets) data.assets = [];
  
  const idx = data.assets.findIndex(a => a.id === asset.id);
  if (idx >= 0) {
    data.assets[idx] = { ...data.assets[idx], ...asset, updatedAt: new Date().toISOString() };
  } else {
    asset.id = asset.id || generateId();
    asset.createdAt = asset.createdAt || new Date().toISOString();
    asset.updatedAt = new Date().toISOString();
    data.assets.push(asset);
  }
  writeJSON(ADS_DB_PATH, data);
  return asset;
}

function deleteAdAsset(id) {
  const data = readJSON(ADS_DB_PATH, { assets: [] });
  data.assets = (data.assets || []).filter(a => a.id !== id);
  writeJSON(ADS_DB_PATH, data);
}

function suggestTheme(product) {
  const themes = getThemes().filter(t => t.isActive);
  if (!themes.length) return null;
  
  const productText = [
    product.title || '',
    product.description || '',
    product.category || '',
    ...(product.tags || []),
    ...(product.keywords || [])
  ].join(' ').toLowerCase();
  
  const productPetType = (product.petType || 'both').toLowerCase();
  
  let bestTheme = null;
  let bestScore = 0;
  
  for (const theme of themes) {
    let score = 0;
    
    if (theme.petType === productPetType || theme.petType === 'both' || productPetType === 'both') {
      score += 5;
    }
    
    for (const keyword of theme.intentKeywords || []) {
      if (productText.includes(keyword.toLowerCase())) {
        score += 3;
      }
    }
    
    for (const catKey of theme.categoryKeys || []) {
      if (productText.includes(catKey.toLowerCase())) {
        score += 2;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestTheme = theme;
    }
  }
  
  if (bestScore < 5) {
    const fallback = themes.find(t => t.id === 'theme_feeding') || themes[0];
    return { theme: fallback, score: 0, confidence: 'low' };
  }
  
  return { theme: bestTheme, score: bestScore, confidence: bestScore >= 10 ? 'high' : 'medium' };
}

function getShortProductName(product, maxLen = 25) {
  let name = product.title || 'Product';
  name = name.replace(/\([^)]*\)/g, '').trim();
  name = name.replace(/\s*-\s*\d+.*$/, '').trim();
  name = name.split(' - ')[0].trim();
  return truncateText(name, maxLen);
}

function extractBenefits(product) {
  const desc = (product.description || '').toLowerCase();
  const title = (product.title || '').toLowerCase();
  const benefits = [];
  
  const benefitKeywords = [
    'durable', 'comfortable', 'washable', 'easy clean', 'long-lasting',
    'interactive', 'engaging', 'cozy', 'soft', 'sturdy', 'lightweight',
    'portable', 'adjustable', 'non-slip', 'waterproof', 'breathable'
  ];
  
  for (const kw of benefitKeywords) {
    if (desc.includes(kw) || title.includes(kw)) {
      benefits.push(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
  }
  
  return benefits.slice(0, 5);
}

function expandTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

async function generateSearchAdsWithAI(product, settings = {}) {
  if (!process.env.OPENAI_API_KEY) {
    return generateSearchAdsFromTemplates(product, settings);
  }
  
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const petType = product.petType || 'pet';
    const category = product.category || 'Pet Supplies';
    const shortName = getShortProductName(product);
    const benefits = extractBenefits(product);
    
    const prompt = `Generate Google Search Ads assets for this pet product (US market, policy-safe):

Product: ${product.title}
Category: ${category}
Pet Type: ${petType}
Key Benefits: ${benefits.join(', ') || 'quality, durable'}

Generate:
1. 15 headlines (each max 30 characters, compelling, no fake claims)
2. 4 descriptions (each max 90 characters, benefit-focused, include CTA)
3. 12 keywords with match types (EXACT, PHRASE, or BROAD)
4. path1 and path2 (each max 15 chars, URL-friendly)

IMPORTANT RULES:
- NO medical claims, NO "vet approved", NO "cures" or "guaranteed results"
- Focus on product features, quality, convenience
- Include brand "GetPawsy" in some headlines
- Keywords should be buyer-intent focused

Return JSON only:
{
  "headlines": ["headline1", ...],
  "descriptions": ["desc1", ...],
  "keywords": [{"keyword": "...", "matchType": "EXACT|PHRASE|BROAD"}, ...],
  "path1": "...",
  "path2": "..."
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1500
    });
    
    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      headlines: (parsed.headlines || []).slice(0, 15).map(h => truncateText(sanitizeAdText(h), 30)),
      descriptions: (parsed.descriptions || []).slice(0, 4).map(d => truncateText(sanitizeAdText(d), 90)),
      keywords: (parsed.keywords || []).slice(0, 20),
      path1: truncateText(sanitizeAdText(parsed.path1 || ''), 15),
      path2: truncateText(sanitizeAdText(parsed.path2 || ''), 15),
      generatedBy: 'ai'
    };
  } catch (err) {
    console.error('[AdsGenerator] AI generation failed:', err.message);
    return generateSearchAdsFromTemplates(product, settings);
  }
}

function generateSearchAdsFromTemplates(product, settings = {}) {
  const petType = (product.petType || 'pet').charAt(0).toUpperCase() + (product.petType || 'pet').slice(1);
  const category = product.category || 'Pet Supplies';
  const shortName = getShortProductName(product, 20);
  const benefits = extractBenefits(product);
  
  const vars = {
    ProductShort: shortName,
    Pet: petType,
    Category: category.split(' ')[0],
    Benefit1: benefits[0] || 'Quality',
    Benefit2: benefits[1] || 'Durable',
    Brand: 'GetPawsy'
  };
  
  const headlineTemplates = [
    'Shop {ProductShort}',
    'Best {Category} for {Pet}s',
    '{Pet} {Category} Picks',
    'GetPawsy {Pet} Shop',
    'Premium {Pet} Supplies',
    '{Benefit1} {Category}',
    'Top {Pet} Products',
    'Quality {Pet} Gear',
    'Shop {Pet} Essentials',
    '{ProductShort} for {Pet}s',
    'GetPawsy Top Picks',
    '{Pet} Approved Choices',
    'Browse {Category}',
    'GetPawsy Pet Store',
    'Explore {Pet} Picks'
  ];
  
  const descriptionTemplates = [
    'Discover {ProductShort} at GetPawsy. {Benefit1} design, quality materials. Shop now for your {Pet}.',
    'Premium {Category} for {Pet}s. {ProductShort} features {Benefit1} build. Easy returns, secure checkout.',
    'Give your {Pet} the best with {ProductShort}. {Benefit1}, {Benefit2}. Shop GetPawsy today.',
    'Quality {Pet} supplies from GetPawsy. {ProductShort} — designed for comfort and durability.'
  ];
  
  const headlines = headlineTemplates.map(t => truncateText(expandTemplate(t, vars), 30));
  const descriptions = descriptionTemplates.map(t => truncateText(expandTemplate(t, vars), 90));
  
  const keywordBase = [
    `${petType.toLowerCase()} ${category.toLowerCase()}`,
    `buy ${petType.toLowerCase()} ${category.toLowerCase()}`,
    `best ${petType.toLowerCase()} ${category.toLowerCase()}`,
    `${shortName.toLowerCase()}`,
    `${category.toLowerCase()} for ${petType.toLowerCase()}s`
  ];
  
  const keywords = keywordBase.map((kw, i) => ({
    keyword: kw,
    matchType: i < 2 ? 'EXACT' : (i < 4 ? 'PHRASE' : 'BROAD')
  }));
  
  return {
    headlines,
    descriptions,
    keywords,
    path1: truncateText(petType.toLowerCase() + 's', 15),
    path2: truncateText(category.toLowerCase().replace(/\s+/g, '-').slice(0, 15), 15),
    generatedBy: 'template'
  };
}

async function generatePMaxAssetsWithAI(product, settings = {}) {
  if (!process.env.OPENAI_API_KEY) {
    return generatePMaxFromTemplates(product, settings);
  }
  
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const petType = product.petType || 'pet';
    const category = product.category || 'Pet Supplies';
    const shortName = getShortProductName(product);
    const benefits = extractBenefits(product);
    
    const prompt = `Generate Performance Max ad assets for this pet product (US market, policy-safe):

Product: ${product.title}
Category: ${category}
Pet Type: ${petType}
Key Benefits: ${benefits.join(', ') || 'quality, durable'}

Generate:
1. 5 short headlines (each max 30 characters)
2. 1 long headline (max 90 characters)
3. 5 descriptions (each max 90 characters)
4. 8 callouts (each max 25 characters, feature/benefit focused)
5. 15 custom intent keywords for audience targeting

IMPORTANT RULES:
- NO medical claims, NO "vet approved", NO "cures" or "guaranteed results"
- NO absolute shipping guarantees
- Focus on product features, quality, convenience
- Include brand "GetPawsy" where natural

Return JSON only:
{
  "headlines": ["..."],
  "longHeadline": "...",
  "descriptions": ["..."],
  "callouts": ["..."],
  "customIntentKeywords": ["..."]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1500
    });
    
    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      headlines: (parsed.headlines || []).slice(0, 5).map(h => truncateText(sanitizeAdText(h), 30)),
      longHeadline: truncateText(sanitizeAdText(parsed.longHeadline || ''), 90),
      descriptions: (parsed.descriptions || []).slice(0, 5).map(d => truncateText(sanitizeAdText(d), 90)),
      callouts: (parsed.callouts || []).slice(0, 10).map(c => truncateText(sanitizeAdText(c), 25)),
      customIntentKeywords: (parsed.customIntentKeywords || []).slice(0, 20),
      generatedBy: 'ai'
    };
  } catch (err) {
    console.error('[AdsGenerator] AI PMax generation failed:', err.message);
    return generatePMaxFromTemplates(product, settings);
  }
}

function generatePMaxFromTemplates(product, settings = {}) {
  const petType = (product.petType || 'pet').charAt(0).toUpperCase() + (product.petType || 'pet').slice(1);
  const category = product.category || 'Pet Supplies';
  const shortName = getShortProductName(product, 20);
  const benefits = extractBenefits(product);
  
  const theme = settings.theme || suggestTheme(product)?.theme;
  
  const vars = {
    ProductShort: shortName,
    Pet: petType,
    Category: category.split(' ')[0],
    Benefit1: benefits[0] || 'Quality',
    Benefit2: benefits[1] || 'Durable',
    Brand: 'GetPawsy'
  };
  
  let headlines, longHeadline, descriptions, callouts;
  
  if (theme) {
    headlines = (theme.headlineTemplates || []).slice(0, 5).map(t => truncateText(expandTemplate(t, vars), 30));
    longHeadline = truncateText(expandTemplate((theme.longHeadlineTemplates || [])[0] || 'Premium {Category} for happier {Pet}s — curated by GetPawsy.', vars), 90);
    descriptions = (theme.descriptionTemplates || []).slice(0, 5).map(t => truncateText(expandTemplate(t, vars), 90));
    callouts = (theme.calloutsDefault || []).slice(0, 10).map(c => truncateText(c, 25));
  } else {
    headlines = [
      `Shop ${shortName}`,
      'Premium Pet Supplies',
      `${petType} Essentials`,
      'GetPawsy Top Pick',
      'Quality Pet Gear'
    ].map(h => truncateText(h, 30));
    
    longHeadline = truncateText(`Premium ${category} for happier ${petType.toLowerCase()}s — curated by GetPawsy.`, 90);
    
    descriptions = [
      `Discover ${shortName} at GetPawsy. Quality materials, designed for ${petType.toLowerCase()}s. Shop now.`,
      `Give your ${petType.toLowerCase()} the best. ${shortName} combines quality and value. Easy returns.`,
      `Premium ${category} from GetPawsy. Trusted by pet owners. Secure checkout, fast shipping.`
    ].map(d => truncateText(d, 90));
    
    callouts = ['Quality Picks', 'Easy Returns', 'Secure Checkout', 'Fast Shipping', 'Pet-Approved'];
  }
  
  while (headlines.length < 5) headlines.push(truncateText('GetPawsy Pet Store', 30));
  while (descriptions.length < 5) descriptions.push(truncateText('Quality pet supplies from GetPawsy. Shop now for your furry friend.', 90));
  
  return {
    headlines,
    longHeadline,
    descriptions,
    callouts,
    customIntentKeywords: theme?.audienceDefaults?.customIntentKeywords || [
      `buy ${petType.toLowerCase()} supplies`,
      `${petType.toLowerCase()} products online`,
      `best ${category.toLowerCase()}`,
      `${petType.toLowerCase()} essentials`
    ],
    generatedBy: 'template'
  };
}

async function generateAdAsset(product, settings = {}) {
  const petType = product.petType || 'both';
  const category = product.category || 'Pet Supplies';
  const shortName = getShortProductName(product);
  const baseUrl = settings.baseUrl || 'https://getpawsy.com';
  
  const themeResult = suggestTheme(product);
  const theme = settings.themeId ? getTheme(settings.themeId) : themeResult?.theme;
  
  const searchAssets = await generateSearchAdsWithAI(product, settings);
  const pmaxAssets = await generatePMaxAssetsWithAI(product, { ...settings, theme });
  
  const campaignName = `GetPawsy | ${petType === 'dog' ? 'Dog' : petType === 'cat' ? 'Cat' : 'Pets'} | ${category}`;
  const adGroupName = shortName;
  
  const productUrl = `${baseUrl}/product/${product.id}`;
  const utmSuffix = `utm_source=google&utm_medium=cpc&utm_campaign=${encodeURIComponent(campaignName)}&utm_content=${encodeURIComponent(adGroupName)}`;
  
  const asset = {
    id: generateId(),
    productId: product.id,
    productTitle: product.title,
    status: 'draft',
    locale: 'en-US',
    type: 'BOTH',
    
    campaignName,
    adGroupName,
    finalUrl: productUrl,
    finalUrlSuffix: utmSuffix,
    finalUrlMode: 'PRODUCT',
    
    path1: searchAssets.path1,
    path2: searchAssets.path2,
    headlines: searchAssets.headlines,
    descriptions: searchAssets.descriptions,
    keywords: searchAssets.keywords,
    negativeKeywords: GLOBAL_NEGATIVE_KEYWORDS,
    
    businessName: 'GetPawsy',
    
    pmax: {
      finalUrl: productUrl,
      businessName: 'GetPawsy',
      headlines: pmaxAssets.headlines,
      longHeadline: pmaxAssets.longHeadline,
      descriptions: pmaxAssets.descriptions,
      callouts: pmaxAssets.callouts,
      structuredSnippets: theme?.structuredSnippetsDefault || [],
      sitelinks: [],
      audienceSignals: {
        inMarket: theme?.audienceDefaults?.inMarket || ['Pet Supplies'],
        interests: theme?.audienceDefaults?.interests || ['Pet Owners'],
        customIntentKeywords: pmaxAssets.customIntentKeywords
      },
      imageAssets: {
        marketingImage: product.images?.[0] || product.image || null,
        squareImage: product.images?.[1] || product.image || null,
        portraitImage: null,
        logo: '/images/getpawsy-logo.png'
      },
      videoAssets: []
    },
    
    themeId: theme?.id || null,
    themeName: theme?.name || null,
    
    generatedBy: searchAssets.generatedBy,
    petType,
    categoryKey: category,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return asset;
}

function validateAsset(asset) {
  const errors = [];
  
  for (let i = 0; i < (asset.headlines || []).length; i++) {
    if (asset.headlines[i].length > CHAR_LIMITS.search.headline) {
      errors.push(`Headline ${i + 1} exceeds ${CHAR_LIMITS.search.headline} chars`);
    }
  }
  
  for (let i = 0; i < (asset.descriptions || []).length; i++) {
    if (asset.descriptions[i].length > CHAR_LIMITS.search.description) {
      errors.push(`Description ${i + 1} exceeds ${CHAR_LIMITS.search.description} chars`);
    }
  }
  
  if (asset.pmax) {
    for (let i = 0; i < (asset.pmax.headlines || []).length; i++) {
      if (asset.pmax.headlines[i].length > CHAR_LIMITS.pmax.headline) {
        errors.push(`PMax Headline ${i + 1} exceeds ${CHAR_LIMITS.pmax.headline} chars`);
      }
    }
    
    if (asset.pmax.longHeadline && asset.pmax.longHeadline.length > CHAR_LIMITS.pmax.longHeadline) {
      errors.push(`PMax Long Headline exceeds ${CHAR_LIMITS.pmax.longHeadline} chars`);
    }
    
    for (let i = 0; i < (asset.pmax.descriptions || []).length; i++) {
      if (asset.pmax.descriptions[i].length > CHAR_LIMITS.pmax.description) {
        errors.push(`PMax Description ${i + 1} exceeds ${CHAR_LIMITS.pmax.description} chars`);
      }
    }
    
    for (let i = 0; i < (asset.pmax.callouts || []).length; i++) {
      if (asset.pmax.callouts[i].length > CHAR_LIMITS.pmax.callout) {
        errors.push(`PMax Callout ${i + 1} exceeds ${CHAR_LIMITS.pmax.callout} chars`);
      }
    }
  }
  
  return errors;
}

function getAssetChecklist(asset) {
  const checklist = {
    search: {
      headlines: { count: (asset.headlines || []).length, required: 3, max: 15, status: 'red' },
      descriptions: { count: (asset.descriptions || []).length, required: 2, max: 4, status: 'red' },
      keywords: { count: (asset.keywords || []).length, required: 5, max: 20, status: 'red' }
    },
    pmax: {
      headlines: { count: (asset.pmax?.headlines || []).length, required: 5, max: 5, status: 'red' },
      longHeadline: { present: !!(asset.pmax?.longHeadline), status: 'red' },
      descriptions: { count: (asset.pmax?.descriptions || []).length, required: 3, max: 5, status: 'red' },
      callouts: { count: (asset.pmax?.callouts || []).length, required: 4, max: 10, status: 'red' },
      landscapeImage: { present: !!(asset.pmax?.imageAssets?.marketingImage), status: 'red' },
      squareImage: { present: !!(asset.pmax?.imageAssets?.squareImage), status: 'red' }
    }
  };
  
  checklist.search.headlines.status = checklist.search.headlines.count >= 3 ? 'green' : (checklist.search.headlines.count >= 1 ? 'yellow' : 'red');
  checklist.search.descriptions.status = checklist.search.descriptions.count >= 2 ? 'green' : (checklist.search.descriptions.count >= 1 ? 'yellow' : 'red');
  checklist.search.keywords.status = checklist.search.keywords.count >= 5 ? 'green' : (checklist.search.keywords.count >= 3 ? 'yellow' : 'red');
  
  checklist.pmax.headlines.status = checklist.pmax.headlines.count >= 5 ? 'green' : (checklist.pmax.headlines.count >= 3 ? 'yellow' : 'red');
  checklist.pmax.longHeadline.status = checklist.pmax.longHeadline.present ? 'green' : 'red';
  checklist.pmax.descriptions.status = checklist.pmax.descriptions.count >= 3 ? 'green' : (checklist.pmax.descriptions.count >= 1 ? 'yellow' : 'red');
  checklist.pmax.callouts.status = checklist.pmax.callouts.count >= 4 ? 'green' : (checklist.pmax.callouts.count >= 2 ? 'yellow' : 'red');
  checklist.pmax.landscapeImage.status = checklist.pmax.landscapeImage.present ? 'green' : 'yellow';
  checklist.pmax.squareImage.status = checklist.pmax.squareImage.present ? 'green' : 'yellow';
  
  return checklist;
}

function exportSearchAdsCSV(assets) {
  const rows = [];
  
  const headerRow = [
    'Campaign', 'Ad group', 'Final URL', 'Path 1', 'Path 2',
    ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
    'Row Type'
  ];
  rows.push(headerRow.join(','));
  
  for (const asset of assets) {
    const headlines = asset.headlines || [];
    const descriptions = asset.descriptions || [];
    
    const adRow = [
      `"${(asset.campaignName || '').replace(/"/g, '""')}"`,
      `"${(asset.adGroupName || '').replace(/"/g, '""')}"`,
      `"${(asset.finalUrl || '').replace(/"/g, '""')}"`,
      `"${(asset.path1 || '').replace(/"/g, '""')}"`,
      `"${(asset.path2 || '').replace(/"/g, '""')}"`,
      ...Array.from({ length: 15 }, (_, i) => `"${(headlines[i] || '').replace(/"/g, '""')}"`),
      ...Array.from({ length: 4 }, (_, i) => `"${(descriptions[i] || '').replace(/"/g, '""')}"`),
      '"Ad"'
    ];
    rows.push(adRow.join(','));
    
    for (const kw of asset.keywords || []) {
      const kwRow = [
        `"${(asset.campaignName || '').replace(/"/g, '""')}"`,
        `"${(asset.adGroupName || '').replace(/"/g, '""')}"`,
        '', '', '',
        ...Array.from({ length: 15 }, () => ''),
        ...Array.from({ length: 4 }, () => ''),
        '"Keyword"',
        `"${(kw.keyword || '').replace(/"/g, '""')}"`,
        `"${kw.matchType || 'BROAD'}"`
      ];
      rows.push(kwRow.join(','));
    }
    
    for (const neg of asset.negativeKeywords || []) {
      const negRow = [
        `"${(asset.campaignName || '').replace(/"/g, '""')}"`,
        `"${(asset.adGroupName || '').replace(/"/g, '""')}"`,
        '', '', '',
        ...Array.from({ length: 15 }, () => ''),
        ...Array.from({ length: 4 }, () => ''),
        '"NegativeKeyword"',
        `"${neg.replace(/"/g, '""')}"`
      ];
      rows.push(negRow.join(','));
    }
  }
  
  return rows.join('\n');
}

function exportPMaxCSV(assets) {
  const rows = [];
  
  const headerRow = [
    'Campaign', 'Asset Group', 'Final URL', 'Business Name',
    ...Array.from({ length: 5 }, (_, i) => `PMax Headline ${i + 1}`),
    'PMax Long Headline',
    ...Array.from({ length: 5 }, (_, i) => `PMax Description ${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `Callout ${i + 1}`),
    'Image Landscape', 'Image Square', 'Image Portrait', 'Logo',
    'Audience In-Market', 'Audience Custom Intent Keywords'
  ];
  rows.push(headerRow.join(','));
  
  for (const asset of assets) {
    const pmax = asset.pmax || {};
    const headlines = pmax.headlines || [];
    const descriptions = pmax.descriptions || [];
    const callouts = pmax.callouts || [];
    const images = pmax.imageAssets || {};
    const audience = pmax.audienceSignals || {};
    
    const campaignName = asset.themeName 
      ? `GetPawsy | PMax | ${asset.themeName}`
      : `GetPawsy | PMax | ${asset.petType === 'dog' ? 'Dog' : asset.petType === 'cat' ? 'Cat' : 'Pets'}`;
    
    const row = [
      `"${campaignName.replace(/"/g, '""')}"`,
      `"${(asset.adGroupName || '').replace(/"/g, '""')}"`,
      `"${(pmax.finalUrl || asset.finalUrl || '').replace(/"/g, '""')}"`,
      `"${(pmax.businessName || 'GetPawsy').replace(/"/g, '""')}"`,
      ...Array.from({ length: 5 }, (_, i) => `"${(headlines[i] || '').replace(/"/g, '""')}"`),
      `"${(pmax.longHeadline || '').replace(/"/g, '""')}"`,
      ...Array.from({ length: 5 }, (_, i) => `"${(descriptions[i] || '').replace(/"/g, '""')}"`),
      ...Array.from({ length: 10 }, (_, i) => `"${(callouts[i] || '').replace(/"/g, '""')}"`),
      `"${(images.marketingImage || '').replace(/"/g, '""')}"`,
      `"${(images.squareImage || '').replace(/"/g, '""')}"`,
      `"${(images.portraitImage || '').replace(/"/g, '""')}"`,
      `"${(images.logo || '').replace(/"/g, '""')}"`,
      `"${(audience.inMarket || []).join('|').replace(/"/g, '""')}"`,
      `"${(audience.customIntentKeywords || []).join('|').replace(/"/g, '""')}"`
    ];
    rows.push(row.join(','));
  }
  
  return rows.join('\n');
}

initializeThemes();
initializeCollections();

async function generateSearchAds(product, settings = {}) {
  return generateSearchAdsWithAI(product, settings);
}

async function generatePMaxAds(product, settings = {}) {
  return generatePMaxAssetsWithAI(product, settings);
}

module.exports = {
  getAdAssets,
  getAdAsset,
  getAdAssetByProduct,
  saveAdAsset,
  deleteAdAsset,
  generateAdAsset,
  generateSearchAds,
  generatePMaxAds,
  validateAsset,
  getAssetChecklist,
  
  getThemes,
  getTheme,
  saveTheme,
  deleteTheme,
  suggestTheme,
  
  getCollections,
  getCollection,
  saveCollection,
  
  exportSearchAdsCSV,
  exportPMaxCSV,
  
  CHAR_LIMITS,
  GLOBAL_NEGATIVE_KEYWORDS
};
