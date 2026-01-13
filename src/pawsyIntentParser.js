const INTENT_TYPES = {
  SEARCH: 'search',
  ADD_TO_CART: 'add_to_cart',
  VIEW_PRODUCT: 'view_product',
  FILTER_PRICE: 'filter_price',
  FILTER_CATEGORY: 'filter_category',
  VIEW_CART: 'view_cart',
  CHECKOUT: 'checkout',
  HELP: 'help',
  GREETING: 'greeting',
  HEALTH_CONCERN: 'health_concern',
  GENERAL_QUESTION: 'general_question'
};

const SEARCH_TRIGGERS = [
  'show', 'find', 'search', 'look for', 'looking for', 'need', 'want',
  'recommend', 'suggest', 'what', 'which', 'any', 'got any', 'do you have',
  'help me find', 'browse', 'see', 'check out', 'explore'
];

const CART_ADD_TRIGGERS = [
  'add', 'put in cart', 'add to cart', 'buy', 'purchase', 'get', 'order',
  'i want', 'i\'ll take', 'give me', 'take'
];

const CART_VIEW_TRIGGERS = [
  'cart', 'my cart', 'view cart', 'show cart', 'what\'s in my cart', 'basket'
];

const CHECKOUT_TRIGGERS = [
  'checkout', 'check out', 'pay', 'complete order', 'finalize', 'buy now',
  'proceed to payment'
];

const GREETING_TRIGGERS = [
  'hi', 'hello', 'hey', 'howdy', 'hola', 'good morning', 'good afternoon',
  'good evening', 'what\'s up', 'sup', 'yo'
];

const HEALTH_KEYWORDS = [
  'sick', 'vomit', 'diarrhea', 'bleeding', 'injured', 'limping', 'won\'t eat',
  'not eating', 'fever', 'emergency', 'vet', 'veterinarian', 'medication',
  'medicine', 'symptoms', 'diagnosis', 'treatment', 'disease', 'infection',
  'poison', 'toxic', 'swallowed', 'ate something'
];

const CATEGORY_KEYWORDS = {
  dogs: ['dog', 'puppy', 'pup', 'canine', 'doggy', 'pooch'],
  cats: ['cat', 'kitten', 'kitty', 'feline'],
  toys: ['toy', 'toys', 'play', 'chew', 'fetch', 'ball'],
  beds: ['bed', 'beds', 'sleep', 'cushion', 'mat'],
  collars: ['collar', 'leash', 'harness', 'lead'],
  grooming: ['groom', 'brush', 'shampoo', 'bath', 'nail', 'clipper'],
  treats: ['treat', 'snack', 'food', 'chew'],
  bowls: ['bowl', 'feeder', 'water', 'dish'],
  carriers: ['carrier', 'crate', 'kennel', 'travel', 'cage']
};

const PRICE_PATTERNS = [
  { pattern: /under\s*\$?(\d+)/i, type: 'maxPrice' },
  { pattern: /below\s*\$?(\d+)/i, type: 'maxPrice' },
  { pattern: /less\s*than\s*\$?(\d+)/i, type: 'maxPrice' },
  { pattern: /<\s*\$?(\d+)/i, type: 'maxPrice' },
  { pattern: /cheaper\s*than\s*\$?(\d+)/i, type: 'maxPrice' },
  { pattern: /over\s*\$?(\d+)/i, type: 'minPrice' },
  { pattern: /above\s*\$?(\d+)/i, type: 'minPrice' },
  { pattern: /more\s*than\s*\$?(\d+)/i, type: 'minPrice' },
  { pattern: />\s*\$?(\d+)/i, type: 'minPrice' },
  { pattern: /\$?(\d+)\s*-\s*\$?(\d+)/i, type: 'range' },
  { pattern: /between\s*\$?(\d+)\s*and\s*\$?(\d+)/i, type: 'range' },
  { pattern: /\$?(\d+)\s*to\s*\$?(\d+)/i, type: 'range' }
];

const SORT_KEYWORDS = {
  price_asc: ['cheap', 'cheapest', 'lowest price', 'budget', 'affordable'],
  price_desc: ['expensive', 'premium', 'high end', 'luxury', 'best quality'],
  newest: ['new', 'newest', 'latest', 'recent', 'just arrived'],
  popular: ['popular', 'best seller', 'top rated', 'recommended', 'trending']
};

function parseIntent(text) {
  const lower = (text || "").toLowerCase().trim();
  
  if (!lower) {
    return { intent: INTENT_TYPES.HELP, confidence: 1.0, parsed: {} };
  }
  
  if (HEALTH_KEYWORDS.some(kw => lower.includes(kw))) {
    return {
      intent: INTENT_TYPES.HEALTH_CONCERN,
      confidence: 0.95,
      isHealthConcern: true,
      parsed: { keywords: HEALTH_KEYWORDS.filter(kw => lower.includes(kw)) }
    };
  }
  
  if (GREETING_TRIGGERS.some(g => lower === g || lower.startsWith(g + ' ') || lower.startsWith(g + ','))) {
    return {
      intent: INTENT_TYPES.GREETING,
      confidence: 0.9,
      parsed: {}
    };
  }
  
  if (CHECKOUT_TRIGGERS.some(t => lower.includes(t))) {
    return {
      intent: INTENT_TYPES.CHECKOUT,
      confidence: 0.9,
      parsed: {}
    };
  }
  
  if (CART_VIEW_TRIGGERS.some(t => lower.includes(t)) && !CART_ADD_TRIGGERS.some(t => lower.includes(t))) {
    return {
      intent: INTENT_TYPES.VIEW_CART,
      confidence: 0.85,
      parsed: {}
    };
  }
  
  const parsed = {};
  
  for (const { pattern, type } of PRICE_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      if (type === 'range') {
        parsed.minPrice = parseFloat(match[1]);
        parsed.maxPrice = parseFloat(match[2]);
      } else if (type === 'minPrice') {
        parsed.minPrice = parseFloat(match[1]);
      } else if (type === 'maxPrice') {
        parsed.maxPrice = parseFloat(match[1]);
      }
      break;
    }
  }
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      if (!parsed.categories) parsed.categories = [];
      parsed.categories.push(category);
    }
  }
  
  for (const [sortType, keywords] of Object.entries(SORT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      parsed.sort = sortType;
      break;
    }
  }
  
  const remainingWords = lower
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'have', 'has', 'can', 'you', 'your'].includes(w))
    .filter(w => !SEARCH_TRIGGERS.some(t => t.includes(w)))
    .filter(w => !CART_ADD_TRIGGERS.some(t => t.includes(w)));
  
  if (remainingWords.length > 0) {
    parsed.searchTerms = remainingWords.slice(0, 5);
    parsed.query = parsed.searchTerms.join(' ');
  }
  
  if (CART_ADD_TRIGGERS.some(t => lower.includes(t))) {
    return {
      intent: INTENT_TYPES.ADD_TO_CART,
      confidence: 0.85,
      parsed
    };
  }
  
  if (SEARCH_TRIGGERS.some(t => lower.includes(t)) || parsed.categories?.length > 0 || parsed.query) {
    return {
      intent: INTENT_TYPES.SEARCH,
      confidence: 0.8,
      parsed
    };
  }
  
  if (parsed.minPrice || parsed.maxPrice) {
    return {
      intent: INTENT_TYPES.FILTER_PRICE,
      confidence: 0.75,
      parsed
    };
  }
  
  return {
    intent: INTENT_TYPES.GENERAL_QUESTION,
    confidence: 0.5,
    parsed
  };
}

function buildSearchQuery(parsedIntent) {
  const params = {};
  
  if (parsedIntent.parsed?.query) {
    params.q = parsedIntent.parsed.query;
  }
  
  if (parsedIntent.parsed?.categories?.length > 0) {
    params.category = parsedIntent.parsed.categories[0];
    if (parsedIntent.parsed.categories.length > 1) {
      params.tags = parsedIntent.parsed.categories.join(',');
    }
  }
  
  if (parsedIntent.parsed?.minPrice) {
    params.minPrice = parsedIntent.parsed.minPrice;
  }
  
  if (parsedIntent.parsed?.maxPrice) {
    params.maxPrice = parsedIntent.parsed.maxPrice;
  }
  
  if (parsedIntent.parsed?.sort) {
    params.sort = parsedIntent.parsed.sort;
  }
  
  return params;
}

function formatSearchResponse(parsedIntent) {
  const parts = [];
  
  if (parsedIntent.parsed?.categories?.length > 0) {
    parts.push(`in ${parsedIntent.parsed.categories.join(' and ')}`);
  }
  
  if (parsedIntent.parsed?.maxPrice && parsedIntent.parsed?.minPrice) {
    parts.push(`between $${parsedIntent.parsed.minPrice} and $${parsedIntent.parsed.maxPrice}`);
  } else if (parsedIntent.parsed?.maxPrice) {
    parts.push(`under $${parsedIntent.parsed.maxPrice}`);
  } else if (parsedIntent.parsed?.minPrice) {
    parts.push(`over $${parsedIntent.parsed.minPrice}`);
  }
  
  if (parsedIntent.parsed?.sort) {
    const sortLabels = {
      price_asc: 'sorted by lowest price',
      price_desc: 'sorted by highest price',
      newest: 'sorted by newest',
      popular: 'sorted by popularity'
    };
    parts.push(sortLabels[parsedIntent.parsed.sort] || '');
  }
  
  return parts.filter(p => p).join(', ');
}

module.exports = {
  INTENT_TYPES,
  parseIntent,
  buildSearchQuery,
  formatSearchResponse
};
