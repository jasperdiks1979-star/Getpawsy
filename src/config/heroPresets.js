/**
 * Hero Studio Prompt Library - Bright Premium
 * Photorealistic, sharp, commercial e-commerce lighting
 * 
 * Usage: buildHeroPrompt({petType, category, subcategory, format, customKeywords})
 */

// ============ BASE PROMPT (BRIGHT PREMIUM) ============
const BASE_PROMPT = `Ultra-realistic premium e-commerce hero photo, shot with a high-end DSLR, tack-sharp, natural colors, clean bright studio lighting with soft shadows, high dynamic range, subtle depth of field, realistic fur texture, realistic eyes, premium lifestyle vibe, cozy modern home background, gentle bokeh, professional product photography composition, uncluttered, high-end brand feel, no text`;

// ============ NEGATIVE PROMPT ============
const NEGATIVE_PROMPT = `cartoon, illustration, CGI, 3D render, low-res, blurry, noisy, watermark, logo, text, misshapen anatomy, extra limbs, bad paws, duplicated animals, creepy eyes, over-saturated, harsh contrast, clutter, messy background, product packaging, gore, violence, humans`;

// ============ FORMAT DIRECTIVES ============
const FORMAT_DIRECTIVES = {
  desktop: {
    width: 1920,
    height: 700,
    aspectRatio: '16:9',
    directive: 'wide hero composition, subjects centered-left, leave empty space on right for brand text overlay, horizon level, clean background'
  },
  mobile: {
    width: 1080,
    height: 1350,
    aspectRatio: '3:4',
    directive: 'vertical composition, subjects centered, larger close-up, readable silhouette, minimal background clutter'
  },
  ultrawide: {
    width: 2560,
    height: 900,
    aspectRatio: '16:9',
    directive: 'ultrawide cinematic hero, subjects centered, extra breathing room on sides, premium depth'
  }
};

// ============ CATEGORY SCENE PROMPTS ============
const CATEGORY_SCENES = {
  // DOGS
  dogs: {
    default: 'happy golden retriever in a bright modern living room, natural pose, premium lifestyle vibe, clean background',
    toys: 'happy golden retriever playing with a premium rope toy and a rubber ball on a clean bright living room floor, toy slightly in foreground, energetic but natural pose',
    'food-treats': 'close-up of a stainless steel dog bowl with healthy kibble, a friendly dog looking excited in background, clean kitchen setting, premium feeding moment',
    feeding: 'close-up of a stainless steel dog bowl with healthy kibble, a friendly dog looking excited in background, clean kitchen setting, premium feeding moment',
    beds: 'cozy orthopaedic dog bed in a bright modern living room, dog lying relaxed with soft natural light, premium comfort vibe',
    'beds-furniture': 'cozy orthopaedic dog bed in a bright modern living room, dog lying relaxed with soft natural light, premium comfort vibe',
    comfort: 'cozy orthopaedic dog bed in a bright modern living room, dog lying relaxed with soft natural light, premium comfort vibe',
    'collars-leashes': 'dog wearing a premium collar and leash, ready for a walk near a bright airy entryway, clean minimal background',
    leashes: 'dog wearing a premium collar and leash, ready for a walk near a bright airy entryway, clean minimal background',
    outdoor: 'dog wearing a premium collar and leash, ready for a walk near a bright airy entryway, clean minimal background',
    harnesses: 'dog wearing a well-fitted harness, confident stance, minimal training cones subtly in background, clean outdoor patio, premium sporty vibe',
    training: 'dog wearing a well-fitted harness, confident stance, minimal training cones subtly in background, clean outdoor patio, premium sporty vibe',
    crates: 'premium pet carrier next to a calm dog, bright neutral background, travel-ready composition, clean and minimal',
    carriers: 'premium pet carrier next to a calm dog, bright neutral background, travel-ready composition, clean and minimal',
    travel: 'premium pet carrier next to a calm dog, bright neutral background, travel-ready composition, clean and minimal',
    grooming: 'dog with glossy fur being gently brushed, bright bathroom or grooming corner, clean towels, premium self-care vibe',
    health: 'calm dog next to pet-safe wellness items, bright clinic-like clean background, reassuring mood',
    'health-wellness': 'calm dog next to pet-safe wellness items, bright clinic-like clean background, reassuring mood',
    clothing: 'dog wearing a stylish pet jacket, bright modern entryway, ready for adventure, premium pet fashion',
    apparel: 'dog wearing a stylish pet jacket, bright modern entryway, ready for adventure, premium pet fashion',
    'bowls-feeders': 'elegant dog near premium stainless steel bowl, bright kitchen setting, healthy feeding moment'
  },
  
  // CATS
  cats: {
    default: 'elegant fluffy cat in a bright modern living room, graceful pose, premium lifestyle vibe, clean background',
    toys: 'curious cat chasing a feather wand toy, bright modern living room, natural motion freeze, sharp whiskers, playful premium vibe',
    'food-treats': 'cat next to a clean ceramic bowl, healthy food implied, bright kitchen scene, premium minimal styling',
    feeding: 'cat next to a clean ceramic bowl, healthy food implied, bright kitchen scene, premium minimal styling',
    litter: 'stylish modern litter box in a clean bathroom corner, cat nearby, soft daylight, premium hygiene vibe',
    'litter-boxes': 'stylish modern litter box in a clean bathroom corner, cat nearby, soft daylight, premium hygiene vibe',
    cleaning: 'stylish modern litter box in a clean bathroom corner, cat nearby, soft daylight, premium hygiene vibe',
    scratchers: 'cat using a premium scratching post, bright home interior, wood and fabric textures, clean composition',
    furniture: 'cat using a premium scratching post, bright home interior, wood and fabric textures, clean composition',
    beds: 'cat curled up on a plush calming bed, soft sunlight through window, cozy premium atmosphere',
    'beds-furniture': 'cat curled up on a plush calming bed, soft sunlight through window, cozy premium atmosphere',
    comfort: 'cat curled up on a plush calming bed, soft sunlight through window, cozy premium atmosphere',
    carriers: 'premium cat carrier with calm cat, bright neutral background, travel-ready composition',
    travel: 'premium cat carrier with calm cat, bright neutral background, travel-ready composition',
    grooming: 'cat being gently brushed, bright minimal background, sharp fur detail, premium self-care moment',
    trees: 'cat on a premium cat tree by a bright window, airy background, elegant home vibe',
    'trees-furniture': 'cat on a premium cat tree by a bright window, airy background, elegant home vibe',
    health: 'calm cat in a serene bright setting, wellness vibes, premium care moment',
    'health-wellness': 'calm cat in a serene bright setting, wellness vibes, premium care moment',
    clothing: 'cat wearing a cute pet costume, bright modern setting, adorable premium pet fashion',
    apparel: 'cat wearing a cute pet costume, bright modern setting, adorable premium pet fashion',
    'bowls-feeders': 'elegant cat near premium ceramic bowl, bright kitchen setting, healthy feeding moment'
  },
  
  // BOTH / DEFAULT
  both: {
    default: 'friendly dog and cat together, bright cozy modern interior, premium lifestyle hero, both animals sharp and centered, clean background'
  }
};

// ============ STYLE PRESETS ============
const STYLE_PRESETS = {
  'bright-premium': {
    name: 'Bright Premium',
    description: 'Photorealistic, sharp, commercial e-commerce lighting',
    basePrompt: BASE_PROMPT,
    negativePrompt: NEGATIVE_PROMPT,
    categoryScenes: CATEGORY_SCENES,
    formatDirectives: FORMAT_DIRECTIVES
  },
  'clean-studio': {
    name: 'Clean Studio',
    description: 'Professional studio lighting with minimalist backgrounds',
    basePrompt: 'Professional studio photography, clean white background, soft directional lighting, commercial product shot, sharp focus, high-end feel',
    negativePrompt: 'cluttered, busy background, harsh shadows, amateur, outdoor',
    categoryScenes: CATEGORY_SCENES,
    formatDirectives: FORMAT_DIRECTIVES
  },
  'outdoor-adventure': {
    name: 'Outdoor Adventure',
    description: 'Natural outdoor settings with golden hour lighting',
    basePrompt: 'Outdoor adventure photography, golden hour sunlight, natural setting, warm tones, energetic lifestyle, sharp focus',
    negativePrompt: 'indoor, artificial lighting, dark, gloomy, studio',
    categoryScenes: CATEGORY_SCENES,
    formatDirectives: FORMAT_DIRECTIVES
  },
  'cozy-home': {
    name: 'Cozy Home',
    description: 'Warm interior settings with ambient lighting',
    basePrompt: 'Cozy home interior photography, warm ambient lighting, comfortable inviting setting, lifestyle feel, natural tones',
    negativePrompt: 'cold, sterile, outdoor, harsh lighting, clinical',
    categoryScenes: CATEGORY_SCENES,
    formatDirectives: FORMAT_DIRECTIVES
  }
};

/**
 * Build a complete hero prompt for image generation
 * @param {Object} options
 * @param {string} options.petType - 'dogs' | 'cats' | 'both'
 * @param {string} options.category - Category slug (e.g., 'toys', 'beds')
 * @param {string} options.subcategory - Optional subcategory slug
 * @param {string} options.format - 'desktop' | 'mobile' | 'ultrawide'
 * @param {string} options.customKeywords - Optional custom keywords to add
 * @param {string} options.preset - Style preset name (default: 'bright-premium')
 * @param {boolean} options.includeBrandSpace - Include space for brand text overlay
 * @returns {Object} { prompt, negativePrompt, size, seed }
 */
function buildHeroPrompt({
  petType = 'dogs',
  category = null,
  subcategory = null,
  format = 'desktop',
  customKeywords = '',
  preset = 'bright-premium',
  includeBrandSpace = true
}) {
  const style = STYLE_PRESETS[preset] || STYLE_PRESETS['bright-premium'];
  const formatConfig = style.formatDirectives[format] || style.formatDirectives.desktop;
  
  // Get category scene prompt for the pet type
  const petScenes = style.categoryScenes[petType] || style.categoryScenes.dogs;
  let scenePrompt = petScenes.default;
  let matchedScene = 'default';
  
  // Normalize inputs for matching
  const normalizeKey = (key) => key ? key.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') : null;
  const normalizedSubcategory = normalizeKey(subcategory);
  const normalizedCategory = normalizeKey(category);
  
  // Priority 1: Try exact subcategory match
  if (normalizedSubcategory && petScenes[normalizedSubcategory]) {
    scenePrompt = petScenes[normalizedSubcategory];
    matchedScene = normalizedSubcategory;
  }
  // Priority 2: Try category match
  else if (normalizedCategory && petScenes[normalizedCategory]) {
    scenePrompt = petScenes[normalizedCategory];
    matchedScene = normalizedCategory;
  }
  // Priority 3: Try category as hyphenated key (e.g., 'food-treats')
  else if (normalizedCategory) {
    // Try variations: toys -> toys, food -> food-treats
    const variations = [
      normalizedCategory,
      `${normalizedCategory}-treats`,
      `${normalizedCategory}-furniture`,
      `${normalizedCategory}-wellness`,
      `${normalizedCategory}-leashes`,
      `${normalizedCategory}-boxes`
    ];
    for (const variant of variations) {
      if (petScenes[variant]) {
        scenePrompt = petScenes[variant];
        matchedScene = variant;
        break;
      }
    }
  }
  
  // Build the complete prompt
  let fullPrompt = style.basePrompt;
  fullPrompt += `, ${formatConfig.directive}`;
  fullPrompt += `, ${scenePrompt}`;
  
  if (customKeywords && customKeywords.trim()) {
    fullPrompt += `, ${customKeywords.trim()}`;
  }
  
  // Add extra brand space directive for desktop if requested
  if (includeBrandSpace && format === 'desktop') {
    fullPrompt += ', extra clean space on right side for text overlay';
  }
  
  // Generate a random seed for reproducibility
  const seed = Math.floor(Math.random() * 2147483647);
  
  return {
    prompt: fullPrompt,
    negativePrompt: style.negativePrompt,
    size: {
      width: formatConfig.width,
      height: formatConfig.height,
      aspectRatio: formatConfig.aspectRatio
    },
    seed,
    metadata: {
      preset,
      petType,
      category,
      subcategory,
      format,
      matchedScene,
      createdAt: new Date().toISOString()
    }
  };
}

/**
 * Get all available style presets
 */
function getStylePresets() {
  return Object.entries(STYLE_PRESETS).map(([key, value]) => ({
    id: key,
    name: value.name,
    description: value.description
  }));
}

/**
 * Get available formats
 */
function getFormats() {
  return Object.entries(FORMAT_DIRECTIVES).map(([key, value]) => ({
    id: key,
    width: value.width,
    height: value.height,
    aspectRatio: value.aspectRatio
  }));
}

/**
 * Get available categories for a pet type
 */
function getCategoryOptions(petType) {
  const scenes = CATEGORY_SCENES[petType] || CATEGORY_SCENES.dogs;
  return Object.keys(scenes).filter(k => k !== 'default');
}

module.exports = {
  BASE_PROMPT,
  NEGATIVE_PROMPT,
  FORMAT_DIRECTIVES,
  CATEGORY_SCENES,
  STYLE_PRESETS,
  buildHeroPrompt,
  getStylePresets,
  getFormats,
  getCategoryOptions
};
