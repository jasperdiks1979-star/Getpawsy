const { log } = require("./logger");

const SEO_POLICY = {
  brandName: "GetPawsy",
  market: "US",
  tone: "friendly, premium, helpful",
  
  bannedClaims: [
    "cures", "treats disease", "treats anxiety", "prevents disease",
    "FDA approved", "vet approved", "veterinarian approved", "vet recommended",
    "100% safe", "completely safe", "guaranteed safe",
    "clinically proven", "scientifically proven",
    "miracle", "revolutionary", "breakthrough",
    "no side effects", "risk-free"
  ],
  
  safePhrasing: {
    materials: "Made with pet-friendly materials",
    safety: "Designed with pet safety in mind",
    quality: "Quality crafted for your pet",
    durability: "Built for active pets",
    comfort: "Designed for comfort"
  },
  
  formatting: {
    title: {
      minChars: 30,
      maxChars: 60,
      style: "Title Case",
      rules: [
        "No emojis",
        "Include primary keyword",
        "Include brand or pet type when relevant",
        "No excessive punctuation"
      ]
    },
    metaDescription: {
      minChars: 120,
      maxChars: 155,
      rules: [
        "Include one CTA",
        "Mention key benefit",
        "Include price or 'from $X' when applicable",
        "No excessive punctuation or ALL CAPS"
      ]
    },
    slug: {
      maxChars: 60,
      rules: [
        "Lowercase only",
        "Hyphens between words",
        "Remove stopwords (the, a, an, and, or, for)",
        "Include primary keyword",
        "No special characters"
      ]
    },
    h1: {
      maxChars: 70,
      rules: [
        "Match or closely relate to title",
        "Include product name",
        "Natural reading"
      ]
    },
    highlights: {
      count: { min: 4, max: 6 },
      maxCharsPerBullet: 90,
      rules: [
        "Focus on benefits, not features",
        "Start with action verb when possible",
        "Be specific and factual",
        "No medical or safety claims"
      ]
    },
    altText: {
      maxChars: 120,
      format: "GetPawsy [pet type] [product type] - [key feature]",
      rules: [
        "Descriptive but concise",
        "Include product name",
        "Mention pet type (dog/cat) if known"
      ]
    }
  },
  
  keywords: {
    primary: { min: 3, max: 6 },
    secondary: { min: 6, max: 12 },
    rules: [
      "US market terminology",
      "Include product type",
      "Include pet type when applicable",
      "No keyword stuffing",
      "Natural language keywords"
    ]
  },
  
  shippingSnippet: "Fast US shipping. Free on orders $50+. 30-day returns.",
  returnsSnippet: "30-day easy returns for unused items.",
  
  categories: {
    dogs: {
      slug: "dogs",
      keywords: ["dog", "puppy", "canine", "pup", "pooch"],
      subcategories: ["toys", "beds", "feeding", "grooming", "walking", "training", "travel", "health"]
    },
    cats: {
      slug: "cats", 
      keywords: ["cat", "kitten", "feline", "kitty"],
      subcategories: ["toys", "beds", "feeding", "grooming", "scratchers", "litter", "travel", "health"]
    }
  },
  
  departmentMappings: {
    toys: ["toy", "toys", "play", "chew", "ball", "plush", "squeaky", "interactive", "puzzle"],
    beds: ["bed", "beds", "sleep", "blanket", "mat", "cushion", "pillow", "cozy", "comfort"],
    feeding: ["bowl", "feeder", "water", "food", "dish", "fountain", "treat", "dispenser"],
    grooming: ["brush", "comb", "shampoo", "nail", "clipper", "grooming", "bath", "fur", "coat"],
    walking: ["leash", "collar", "harness", "walk", "lead", "strap", "reflective"],
    training: ["training", "clicker", "whistle", "treat pouch", "potty", "pad"],
    travel: ["carrier", "crate", "travel", "car", "seat", "portable", "bag"],
    health: ["dental", "toothbrush", "supplement", "vitamin", "first aid", "calming", "anxiety"]
  }
};

function detectPetType(product) {
  const titleLower = (product.title || "").toLowerCase();
  const descLower = (product.description || "").toLowerCase();
  const categoryLower = (product.category || "").toLowerCase();
  const tagsLower = (Array.isArray(product.tags) ? product.tags.join(" ") : "").toLowerCase();
  
  const combined = `${titleLower} ${descLower} ${categoryLower} ${tagsLower}`;
  
  const isDog = SEO_POLICY.categories.dogs.keywords.some(k => combined.includes(k));
  const isCat = SEO_POLICY.categories.cats.keywords.some(k => combined.includes(k));
  
  if (isDog && isCat) return "both";
  if (isDog) return "dog";
  if (isCat) return "cat";
  return "both";
}

function detectDepartment(product) {
  const titleLower = (product.title || "").toLowerCase();
  const descLower = (product.description || "").toLowerCase();
  const tagsLower = (Array.isArray(product.tags) ? product.tags.join(" ") : "").toLowerCase();
  
  const combined = `${titleLower} ${descLower} ${tagsLower}`;
  
  for (const [dept, keywords] of Object.entries(SEO_POLICY.departmentMappings)) {
    if (keywords.some(k => combined.includes(k))) {
      return dept;
    }
  }
  
  return "accessories";
}

function sanitizeContent(text) {
  if (!text) return text;
  
  let sanitized = text;
  
  for (const claim of SEO_POLICY.bannedClaims) {
    const regex = new RegExp(claim, "gi");
    if (regex.test(sanitized)) {
      log(`[SEO Policy] Removed banned claim: "${claim}"`);
      sanitized = sanitized.replace(regex, "");
    }
  }
  
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  
  return sanitized;
}

function validateTitle(title) {
  const issues = [];
  
  if (!title) {
    issues.push("Title is missing");
    return { valid: false, issues };
  }
  
  if (title.length < SEO_POLICY.formatting.title.minChars) {
    issues.push(`Title too short (${title.length} chars, min ${SEO_POLICY.formatting.title.minChars})`);
  }
  
  if (title.length > SEO_POLICY.formatting.title.maxChars) {
    issues.push(`Title too long (${title.length} chars, max ${SEO_POLICY.formatting.title.maxChars})`);
  }
  
  if (/[\u{1F300}-\u{1F9FF}]/u.test(title)) {
    issues.push("Title contains emoji");
  }
  
  return { valid: issues.length === 0, issues };
}

function validateMetaDescription(desc) {
  const issues = [];
  
  if (!desc) {
    issues.push("Meta description is missing");
    return { valid: false, issues };
  }
  
  if (desc.length < SEO_POLICY.formatting.metaDescription.minChars) {
    issues.push(`Meta description too short (${desc.length} chars, min ${SEO_POLICY.formatting.metaDescription.minChars})`);
  }
  
  if (desc.length > SEO_POLICY.formatting.metaDescription.maxChars) {
    issues.push(`Meta description too long (${desc.length} chars, max ${SEO_POLICY.formatting.metaDescription.maxChars})`);
  }
  
  return { valid: issues.length === 0, issues };
}

function validateSlug(slug) {
  const issues = [];
  
  if (!slug) {
    issues.push("Slug is missing");
    return { valid: false, issues };
  }
  
  if (slug !== slug.toLowerCase()) {
    issues.push("Slug contains uppercase characters");
  }
  
  if (/[^a-z0-9-]/.test(slug)) {
    issues.push("Slug contains invalid characters");
  }
  
  if (slug.length > SEO_POLICY.formatting.slug.maxChars) {
    issues.push(`Slug too long (${slug.length} chars, max ${SEO_POLICY.formatting.slug.maxChars})`);
  }
  
  return { valid: issues.length === 0, issues };
}

function generateSlug(title) {
  if (!title) return "";
  
  const stopwords = ["the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with", "by"];
  
  let slug = title.toLowerCase();
  
  slug = slug.replace(/[^a-z0-9\s-]/g, "");
  
  const words = slug.split(/\s+/).filter(word => !stopwords.includes(word) && word.length > 0);
  
  slug = words.join("-");
  
  slug = slug.replace(/-+/g, "-");
  
  if (slug.length > SEO_POLICY.formatting.slug.maxChars) {
    const parts = slug.split("-");
    slug = "";
    for (const part of parts) {
      if ((slug + "-" + part).length <= SEO_POLICY.formatting.slug.maxChars) {
        slug = slug ? slug + "-" + part : part;
      } else {
        break;
      }
    }
  }
  
  return slug;
}

function buildSeoPromptRules() {
  return `
SEO CONTENT RULES (GetPawsy - US Market):

BANNED CLAIMS - Never use:
${SEO_POLICY.bannedClaims.map(c => `- "${c}"`).join("\n")}

SAFE ALTERNATIVES:
${Object.entries(SEO_POLICY.safePhrasing).map(([k, v]) => `- ${k}: "${v}"`).join("\n")}

FORMAT REQUIREMENTS:
1. SEO Title: ${SEO_POLICY.formatting.title.minChars}-${SEO_POLICY.formatting.title.maxChars} chars, Title Case, no emojis
2. Meta Description: ${SEO_POLICY.formatting.metaDescription.minChars}-${SEO_POLICY.formatting.metaDescription.maxChars} chars, include CTA
3. Slug: lowercase, hyphens, max ${SEO_POLICY.formatting.slug.maxChars} chars, no stopwords
4. Highlights: ${SEO_POLICY.formatting.highlights.count.min}-${SEO_POLICY.formatting.highlights.count.max} bullets, max ${SEO_POLICY.formatting.highlights.maxCharsPerBullet} chars each
5. Alt Text: max ${SEO_POLICY.formatting.altText.maxChars} chars, format: "${SEO_POLICY.formatting.altText.format}"

KEYWORDS:
- Primary: ${SEO_POLICY.keywords.primary.min}-${SEO_POLICY.keywords.primary.max} keywords
- Secondary: ${SEO_POLICY.keywords.secondary.min}-${SEO_POLICY.keywords.secondary.max} keywords
- US market terminology only

STORE INFO:
- Shipping: ${SEO_POLICY.shippingSnippet}
- Returns: ${SEO_POLICY.returnsSnippet}
`;
}

function validateSeoOutput(seoData) {
  const results = {
    valid: true,
    issues: [],
    scores: {}
  };
  
  const titleCheck = validateTitle(seoData.seo_title || seoData.seoTitle);
  if (!titleCheck.valid) {
    results.issues.push(...titleCheck.issues.map(i => `Title: ${i}`));
    results.valid = false;
  }
  results.scores.title = titleCheck.valid;
  
  const metaCheck = validateMetaDescription(seoData.meta_description || seoData.metaDescription);
  if (!metaCheck.valid) {
    results.issues.push(...metaCheck.issues.map(i => `Meta: ${i}`));
    results.valid = false;
  }
  results.scores.metaDescription = metaCheck.valid;
  
  if (seoData.slug) {
    const slugCheck = validateSlug(seoData.slug);
    if (!slugCheck.valid) {
      results.issues.push(...slugCheck.issues.map(i => `Slug: ${i}`));
    }
    results.scores.slug = slugCheck.valid;
  }
  
  const bullets = seoData.bullets || seoData.highlights || [];
  if (bullets.length < SEO_POLICY.formatting.highlights.count.min) {
    results.issues.push(`Highlights: Only ${bullets.length} bullets (min ${SEO_POLICY.formatting.highlights.count.min})`);
  }
  results.scores.highlights = bullets.length >= SEO_POLICY.formatting.highlights.count.min;
  
  return results;
}

module.exports = {
  SEO_POLICY,
  detectPetType,
  detectDepartment,
  sanitizeContent,
  validateTitle,
  validateMetaDescription,
  validateSlug,
  generateSlug,
  buildSeoPromptRules,
  validateSeoOutput
};
