const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const COPY_DB_PATH = path.join(__dirname, '..', 'data', 'copyblocks.json');

const CHAR_LIMITS = {
  headline: 60,
  subheadline: 120,
  introParagraph: 280,
  bullet: 60,
  ctaPrimary: 22,
  ctaSecondary: 22,
  seoTitle: 60,
  seoDescription: 155,
  pawsyTip: 70
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
  return text.slice(0, maxLen - 3).trim() + '...';
}

function generateId() {
  return 'copy_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DEFAULT_COPY_BLOCKS = [
  {
    id: 'copy_home_hero',
    scope: 'HOME_HERO',
    collectionSlug: null,
    status: 'approved',
    locale: 'en-US',
    headline: 'Premium Pet Essentials',
    subheadline: 'Curated products for dogs and cats, picked with love by Pawsy',
    introParagraphs: [
      'Discover quality pet supplies handpicked for your furry family members.',
      'From durable toys to cozy beds, we have everything your pet needs.'
    ],
    bullets: [
      'Quality picks for dogs & cats',
      'Easy returns, secure checkout',
      'Fast US shipping available',
      'Curated by pet lovers',
      'Trusted by pet owners'
    ],
    ctaPrimary: 'Shop Dogs',
    ctaSecondary: 'Shop Cats',
    seoTitle: 'GetPawsy | Premium Pet Supplies for Dogs & Cats',
    seoDescription: 'Shop quality pet supplies for dogs and cats. Durable toys, cozy beds, and everyday essentials. Fast shipping, easy returns.',
    keywords: ['pet supplies', 'dog toys', 'cat toys', 'pet beds', 'pet essentials'],
    tone: 'warm_premium',
    pawsyTip: 'Need help finding the perfect product? Ask me anything!',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'copy_dogs_landing',
    scope: 'DOGS_LANDING',
    collectionSlug: null,
    status: 'approved',
    locale: 'en-US',
    headline: 'Everything Your Dog Needs',
    subheadline: 'Quality toys, gear, and comfort for your best friend',
    introParagraphs: [
      'From playful pups to loyal companions, find products designed for every stage of your dog\'s life.',
      'Shop durable toys, comfortable beds, and everyday essentials curated with care.'
    ],
    bullets: [
      'Durable toys for chewers',
      'Comfortable walking gear',
      'Cozy beds & mats',
      'Grooming essentials',
      'Feeding & hydration'
    ],
    ctaPrimary: 'Shop Dog Picks',
    ctaSecondary: 'Browse Collections',
    seoTitle: 'Dog Supplies & Essentials | GetPawsy',
    seoDescription: 'Shop quality dog supplies. Durable toys, comfortable harnesses, cozy beds, and more. Curated for dogs of all sizes.',
    keywords: ['dog supplies', 'dog toys', 'dog beds', 'dog harness', 'dog essentials'],
    tone: 'warm_premium',
    pawsyTip: 'Looking for something for your pup? I can help you find it!',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'copy_cats_landing',
    scope: 'CATS_LANDING',
    collectionSlug: null,
    status: 'approved',
    locale: 'en-US',
    headline: 'Purrfect Picks for Cats',
    subheadline: 'Interactive toys, scratchers, and comfort for your feline',
    introParagraphs: [
      'From curious kittens to sophisticated loungers, discover products your cat will love.',
      'Shop interactive toys, quality scratchers, and cozy essentials picked with care.'
    ],
    bullets: [
      'Interactive toys & puzzles',
      'Quality scratchers & trees',
      'Litter & cleaning solutions',
      'Grooming essentials',
      'Feeding & hydration'
    ],
    ctaPrimary: 'Shop Cat Picks',
    ctaSecondary: 'Browse Collections',
    seoTitle: 'Cat Supplies & Essentials | GetPawsy',
    seoDescription: 'Shop quality cat supplies. Interactive toys, scratchers, cozy beds, and litter solutions. Curated for cats of all ages.',
    keywords: ['cat supplies', 'cat toys', 'cat scratchers', 'cat beds', 'cat essentials'],
    tone: 'warm_premium',
    pawsyTip: 'Need the purrfect product for your cat? Just ask!',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function initializeCopyBlocks() {
  const data = readJSON(COPY_DB_PATH, { copyblocks: [] });
  if (!data.copyblocks || data.copyblocks.length === 0) {
    data.copyblocks = DEFAULT_COPY_BLOCKS;
    writeJSON(COPY_DB_PATH, data);
  }
  return data.copyblocks;
}

function getCopyBlocks() {
  const data = readJSON(COPY_DB_PATH, { copyblocks: [] });
  if (!data.copyblocks || data.copyblocks.length === 0) {
    return initializeCopyBlocks();
  }
  return data.copyblocks;
}

function getCopyBlock(id) {
  const blocks = getCopyBlocks();
  return blocks.find(b => b.id === id);
}

function getCopyBlockByScope(scope, collectionSlug = null) {
  const blocks = getCopyBlocks();
  return blocks.find(b => b.scope === scope && b.collectionSlug === collectionSlug && b.status === 'approved');
}

function getCopyBlockDraft(scope, collectionSlug = null) {
  const blocks = getCopyBlocks();
  return blocks.find(b => b.scope === scope && b.collectionSlug === collectionSlug);
}

function saveCopyBlock(block) {
  const data = readJSON(COPY_DB_PATH, { copyblocks: [] });
  if (!data.copyblocks) data.copyblocks = [];
  
  const idx = data.copyblocks.findIndex(b => b.id === block.id);
  if (idx >= 0) {
    data.copyblocks[idx] = { ...data.copyblocks[idx], ...block, updatedAt: new Date().toISOString() };
  } else {
    block.id = block.id || generateId();
    block.createdAt = block.createdAt || new Date().toISOString();
    block.updatedAt = new Date().toISOString();
    data.copyblocks.push(block);
  }
  writeJSON(COPY_DB_PATH, data);
  return block;
}

function deleteCopyBlock(id) {
  const data = readJSON(COPY_DB_PATH, { copyblocks: [] });
  data.copyblocks = (data.copyblocks || []).filter(b => b.id !== id);
  writeJSON(COPY_DB_PATH, data);
}

async function generateCopyWithAI(scope, collectionSlug, collectionDef = null) {
  if (!process.env.OPENAI_API_KEY) {
    return generateCopyFromTemplates(scope, collectionSlug, collectionDef);
  }
  
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    let context = '';
    let petType = 'both';
    
    if (scope === 'HOME_HERO') {
      context = 'Homepage hero for GetPawsy pet store. Warm, inviting, premium feel. CTAs should be "Shop Dogs" and "Shop Cats".';
    } else if (scope === 'DOGS_LANDING') {
      context = 'Dogs landing page. Focus on dog products: toys, harnesses, beds, grooming. CTAs like "Shop Dog Picks".';
      petType = 'dog';
    } else if (scope === 'CATS_LANDING') {
      context = 'Cats landing page. Focus on cat products: toys, scratchers, litter, grooming. CTAs like "Shop Cat Picks".';
      petType = 'cat';
    } else if (scope === 'COLLECTION' && collectionDef) {
      context = `Collection page: ${collectionDef.name}. Pet type: ${collectionDef.petType}. Categories: ${(collectionDef.categoryKeys || []).join(', ')}.`;
      petType = collectionDef.petType || 'both';
    }
    
    const prompt = `Write premium e-commerce copy for GetPawsy pet store (US market):

Context: ${context}
Pet Type: ${petType}
Brand: GetPawsy (with Pawsy AI helper)

Generate:
1. headline (max 60 chars, compelling)
2. subheadline (max 120 chars, supportive)
3. 2 intro paragraphs (each max 280 chars)
4. 5 bullets (each max 60 chars, feature/benefit focused)
5. ctaPrimary (max 22 chars, action-oriented)
6. ctaSecondary (max 22 chars, browse-oriented)
7. seoTitle (max 60 chars, includes "GetPawsy")
8. seoDescription (max 155 chars, compelling for search)
9. 8 SEO keywords
10. pawsyTip (max 70 chars, friendly AI helper tip)

RULES:
- NO medical claims, NO "vet approved", NO "cures"
- NO absolute shipping guarantees
- Warm, friendly, premium tone
- Focus on quality, convenience, pet happiness

Return JSON only:
{
  "headline": "...",
  "subheadline": "...",
  "introParagraphs": ["...", "..."],
  "bullets": ["...", "...", "...", "...", "..."],
  "ctaPrimary": "...",
  "ctaSecondary": "...",
  "seoTitle": "...",
  "seoDescription": "...",
  "keywords": ["...", ...],
  "pawsyTip": "..."
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1200
    });
    
    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      headline: truncateText(parsed.headline || '', CHAR_LIMITS.headline),
      subheadline: truncateText(parsed.subheadline || '', CHAR_LIMITS.subheadline),
      introParagraphs: (parsed.introParagraphs || []).slice(0, 3).map(p => truncateText(p, CHAR_LIMITS.introParagraph)),
      bullets: (parsed.bullets || []).slice(0, 7).map(b => truncateText(b, CHAR_LIMITS.bullet)),
      ctaPrimary: truncateText(parsed.ctaPrimary || '', CHAR_LIMITS.ctaPrimary),
      ctaSecondary: truncateText(parsed.ctaSecondary || '', CHAR_LIMITS.ctaSecondary),
      seoTitle: truncateText(parsed.seoTitle || '', CHAR_LIMITS.seoTitle),
      seoDescription: truncateText(parsed.seoDescription || '', CHAR_LIMITS.seoDescription),
      keywords: (parsed.keywords || []).slice(0, 20),
      pawsyTip: truncateText(parsed.pawsyTip || '', CHAR_LIMITS.pawsyTip),
      generatedBy: 'ai'
    };
  } catch (err) {
    console.error('[Copywriter] AI generation failed:', err.message);
    return generateCopyFromTemplates(scope, collectionSlug, collectionDef);
  }
}

function generateCopyFromTemplates(scope, collectionSlug, collectionDef = null) {
  if (scope === 'HOME_HERO') {
    return {
      headline: 'Premium Pet Essentials',
      subheadline: 'Curated products for dogs and cats, picked with love by Pawsy',
      introParagraphs: [
        'Discover quality pet supplies handpicked for your furry family members.',
        'From durable toys to cozy beds, we have everything your pet needs.'
      ],
      bullets: [
        'Quality picks for dogs & cats',
        'Easy returns, secure checkout',
        'Fast US shipping available',
        'Curated by pet lovers',
        'Trusted by pet owners'
      ],
      ctaPrimary: 'Shop Dogs',
      ctaSecondary: 'Shop Cats',
      seoTitle: 'GetPawsy | Premium Pet Supplies',
      seoDescription: 'Shop quality pet supplies for dogs and cats. Durable toys, cozy beds, and everyday essentials.',
      keywords: ['pet supplies', 'dog toys', 'cat toys', 'pet beds'],
      pawsyTip: 'Need help? Ask me anything!',
      generatedBy: 'template'
    };
  }
  
  if (scope === 'DOGS_LANDING') {
    return {
      headline: 'Everything Your Dog Needs',
      subheadline: 'Quality toys, gear, and comfort for your best friend',
      introParagraphs: [
        'From playful pups to loyal companions, find products for every stage.',
        'Shop durable toys, comfortable beds, and everyday essentials.'
      ],
      bullets: [
        'Durable toys for chewers',
        'Comfortable walking gear',
        'Cozy beds & mats',
        'Grooming essentials',
        'Feeding & hydration'
      ],
      ctaPrimary: 'Shop Dog Picks',
      ctaSecondary: 'Browse Collections',
      seoTitle: 'Dog Supplies & Essentials | GetPawsy',
      seoDescription: 'Shop quality dog supplies. Durable toys, harnesses, cozy beds, and more.',
      keywords: ['dog supplies', 'dog toys', 'dog beds', 'dog harness'],
      pawsyTip: 'Looking for something for your pup?',
      generatedBy: 'template'
    };
  }
  
  if (scope === 'CATS_LANDING') {
    return {
      headline: 'Purrfect Picks for Cats',
      subheadline: 'Interactive toys, scratchers, and comfort for your feline',
      introParagraphs: [
        'Discover products your cat will love.',
        'Shop interactive toys, quality scratchers, and cozy essentials.'
      ],
      bullets: [
        'Interactive toys & puzzles',
        'Quality scratchers & trees',
        'Litter & cleaning solutions',
        'Grooming essentials',
        'Feeding & hydration'
      ],
      ctaPrimary: 'Shop Cat Picks',
      ctaSecondary: 'Browse Collections',
      seoTitle: 'Cat Supplies & Essentials | GetPawsy',
      seoDescription: 'Shop quality cat supplies. Interactive toys, scratchers, and litter solutions.',
      keywords: ['cat supplies', 'cat toys', 'cat scratchers', 'cat beds'],
      pawsyTip: 'Need the purrfect product?',
      generatedBy: 'template'
    };
  }
  
  if (scope === 'COLLECTION' && collectionDef) {
    const petLabel = collectionDef.petType === 'dog' ? 'Dog' : collectionDef.petType === 'cat' ? 'Cat' : 'Pet';
    return {
      headline: collectionDef.heroHeadline || collectionDef.name,
      subheadline: collectionDef.heroSubline || `Quality ${collectionDef.name.toLowerCase()} for your ${petLabel.toLowerCase()}`,
      introParagraphs: [
        `Shop our ${collectionDef.name} collection, curated for quality and value.`,
        `Find the perfect ${collectionDef.name.toLowerCase()} for your ${petLabel.toLowerCase()}.`
      ],
      bullets: [
        'Quality materials',
        'Easy returns',
        'Secure checkout',
        'Fast shipping available',
        'Curated picks'
      ],
      ctaPrimary: 'Shop Collection',
      ctaSecondary: 'Browse More',
      seoTitle: collectionDef.seoTitle || `${collectionDef.name} | GetPawsy`,
      seoDescription: collectionDef.seoDescription || `Shop quality ${collectionDef.name.toLowerCase()}. Curated for your pet.`,
      keywords: collectionDef.categoryKeys || [],
      pawsyTip: `Looking for ${collectionDef.name.toLowerCase()}? I can help!`,
      generatedBy: 'template'
    };
  }
  
  return {
    headline: 'Quality Pet Supplies',
    subheadline: 'Curated for your furry friend',
    introParagraphs: ['Shop quality pet supplies.'],
    bullets: ['Quality picks', 'Easy returns'],
    ctaPrimary: 'Shop Now',
    ctaSecondary: 'Browse',
    seoTitle: 'GetPawsy Pet Supplies',
    seoDescription: 'Shop quality pet supplies.',
    keywords: ['pet supplies'],
    pawsyTip: 'Need help? Ask me!',
    generatedBy: 'template'
  };
}

async function generateCopyBlock(scope, collectionSlug = null, collectionDef = null) {
  const generated = await generateCopyWithAI(scope, collectionSlug, collectionDef);
  
  const block = {
    id: generateId(),
    scope,
    collectionSlug,
    status: 'draft',
    locale: 'en-US',
    headline: generated.headline,
    subheadline: generated.subheadline,
    introParagraphs: generated.introParagraphs,
    bullets: generated.bullets,
    ctaPrimary: generated.ctaPrimary,
    ctaSecondary: generated.ctaSecondary,
    seoTitle: generated.seoTitle,
    seoDescription: generated.seoDescription,
    keywords: generated.keywords,
    tone: 'warm_premium',
    pawsyTip: generated.pawsyTip,
    generatedBy: generated.generatedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return block;
}

function validateCopyBlock(block) {
  const errors = [];
  
  if (block.headline && block.headline.length > CHAR_LIMITS.headline) {
    errors.push(`Headline exceeds ${CHAR_LIMITS.headline} chars`);
  }
  if (block.subheadline && block.subheadline.length > CHAR_LIMITS.subheadline) {
    errors.push(`Subheadline exceeds ${CHAR_LIMITS.subheadline} chars`);
  }
  if (block.ctaPrimary && block.ctaPrimary.length > CHAR_LIMITS.ctaPrimary) {
    errors.push(`CTA Primary exceeds ${CHAR_LIMITS.ctaPrimary} chars`);
  }
  if (block.ctaSecondary && block.ctaSecondary.length > CHAR_LIMITS.ctaSecondary) {
    errors.push(`CTA Secondary exceeds ${CHAR_LIMITS.ctaSecondary} chars`);
  }
  if (block.seoTitle && block.seoTitle.length > CHAR_LIMITS.seoTitle) {
    errors.push(`SEO Title exceeds ${CHAR_LIMITS.seoTitle} chars`);
  }
  if (block.seoDescription && block.seoDescription.length > CHAR_LIMITS.seoDescription) {
    errors.push(`SEO Description exceeds ${CHAR_LIMITS.seoDescription} chars`);
  }
  
  for (let i = 0; i < (block.introParagraphs || []).length; i++) {
    if (block.introParagraphs[i].length > CHAR_LIMITS.introParagraph) {
      errors.push(`Intro paragraph ${i + 1} exceeds ${CHAR_LIMITS.introParagraph} chars`);
    }
  }
  
  for (let i = 0; i < (block.bullets || []).length; i++) {
    if (block.bullets[i].length > CHAR_LIMITS.bullet) {
      errors.push(`Bullet ${i + 1} exceeds ${CHAR_LIMITS.bullet} chars`);
    }
  }
  
  return errors;
}

initializeCopyBlocks();

module.exports = {
  getCopyBlocks,
  getCopyBlock,
  getCopyBlockByScope,
  getCopyBlockDraft,
  saveCopyBlock,
  deleteCopyBlock,
  generateCopyBlock,
  validateCopyBlock,
  CHAR_LIMITS
};
