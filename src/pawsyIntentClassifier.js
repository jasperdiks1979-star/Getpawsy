const { log } = require("./logger");

const PRODUCT_SEARCH_KEYWORDS = {
  en: [
    "buy", "purchase", "order", "price", "cost", "how much", "discount", "sale",
    "product", "products", "item", "items", "stock", "available", "in stock",
    "show me", "find", "search", "looking for", "do you have", "do you sell",
    "what do you have", "what products", "browse", "catalog", "category",
    "cheap", "affordable", "under $", "under €", "budget",
    "toy", "toys", "bed", "beds", "bowl", "bowls", "leash", "collar", "harness",
    "food", "treat", "treats", "grooming", "brush", "shampoo", "carrier",
    "crate", "kennel", "litter", "scratching", "scratcher", "feeder", "fountain",
    "best", "top", "popular", "recommend", "recommendation", "suggest", "suggestion"
  ],
  nl: [
    "kopen", "bestellen", "prijs", "kosten", "hoeveel", "korting", "aanbieding",
    "product", "producten", "artikel", "artikelen", "voorraad", "beschikbaar",
    "laat zien", "laten zien", "toon", "zoek", "zoeken", "op zoek naar",
    "hebben jullie", "verkopen jullie", "wat hebben jullie", "heb je",
    "bekijken", "catalogus", "categorie", "bladeren",
    "goedkoop", "betaalbaar", "onder €", "budget",
    "speelgoed", "speeltje", "bed", "bedden", "bak", "bakken", "bakje",
    "voerbak", "voerbakken", "voer", "riem", "halsband", "tuigje", "tuig",
    "eten", "voeding", "snoepje", "snoepjes", "verzorging", "borstel",
    "shampoo", "draagtas", "transportbox", "bench", "kattenbak",
    "krabpaal", "krabben", "voederbak", "drinkfontein", "fontein",
    "beste", "top", "populair", "aanrader", "aanbevelen", "suggestie"
  ]
};

const STORE_INFO_KEYWORDS = {
  en: [
    "shipping", "delivery", "deliver", "ship", "arrive", "when will",
    "return", "returns", "refund", "exchange", "warranty", "guarantee",
    "payment", "pay", "checkout", "cart", "tax", "vat",
    "tracking", "track", "order status", "my order", "where is",
    "contact", "support", "email", "phone", "help",
    "us warehouse", "warehouse", "from the us", "from america"
  ],
  nl: [
    "verzending", "levering", "bezorgen", "bezorging", "versturen", "wanneer",
    "retour", "retourneren", "terugsturen", "ruilen", "garantie",
    "betalen", "betaling", "afrekenen", "winkelwagen", "btw",
    "volgen", "tracken", "bestelstatus", "mijn bestelling", "waar is",
    "contact", "support", "e-mail", "telefoon", "hulp", "helpen",
    "amerikaans magazijn", "magazijn", "uit amerika"
  ]
};

const PET_ADVICE_KEYWORDS = {
  en: [
    "train", "training", "behavior", "behavioural", "barking", "biting",
    "potty", "housebreak", "crate train", "leash train", "obedience",
    "nutrition", "diet", "feed", "feeding", "calories", "weight",
    "groom", "grooming", "brush", "bathe", "bathing", "nail", "nails",
    "exercise", "walk", "walking", "play", "playtime", "activity",
    "socialize", "socialization", "anxiety", "fear", "aggression",
    "sleep", "sleeping", "rest", "bed time",
    "care", "caring", "tips", "advice", "help with",
    "how do i", "how to", "what should i", "is it normal",
    "why does my", "my dog", "my cat", "my pet", "my puppy", "my kitten",
    "scratch", "scratching", "furniture", "claws"
  ],
  nl: [
    "trainen", "training", "gedrag", "blaffen", "bijten",
    "zindelijk", "zindelijkheid", "benchtraining", "gehoorzaamheid",
    "voeding", "dieet", "voeren", "calorieen", "gewicht",
    "verzorgen", "verzorging", "borstelen", "wassen", "baden", "nagels",
    "bewegen", "beweging", "wandelen", "uitlaten", "spelen", "speeltijd",
    "socialiseren", "socialisatie", "angst", "agressie",
    "slapen", "rusten", "bedtijd",
    "verzorging", "tips", "advies", "hulp bij",
    "hoe moet ik", "hoe kan ik", "wat moet ik", "is het normaal",
    "waarom doet mijn", "mijn hond", "mijn kat", "mijn huisdier", "mijn pup", "mijn kitten",
    "krabben", "meubels", "nagels"
  ]
};

const HEALTH_KEYWORDS = {
  en: [
    "sick", "ill", "illness", "disease", "symptom", "symptoms",
    "vomit", "vomiting", "diarrhea", "constipation", "blood",
    "cough", "coughing", "sneeze", "sneezing", "fever",
    "pain", "painful", "hurt", "hurting", "limp", "limping",
    "lump", "bump", "swelling", "swollen", "rash", "itch", "itching",
    "infection", "infected", "wound", "injury", "injured",
    "breathing", "breathe", "panting", "lethargy", "lethargic", "tired",
    "not eating", "won't eat", "loss of appetite", "drinking",
    "urinate", "urinating", "pee", "poop", "stool",
    "seizure", "seizures", "collapse", "paralysis", "bloat",
    "emergency", "urgent", "vet", "veterinarian", "doctor",
    "medication", "medicine", "treatment", "diagnose", "diagnosis"
  ],
  nl: [
    "ziek", "ziekte", "symptoom", "symptomen",
    "overgeven", "braken", "diarree", "obstipatie", "bloed",
    "hoesten", "niezen", "koorts",
    "pijn", "pijnlijk", "zeer", "mank", "manken",
    "bult", "zwelling", "gezwollen", "uitslag", "jeuk", "jeuken",
    "infectie", "geinfecteerd", "wond", "verwonding", "gewond",
    "ademen", "ademhaling", "hijgen", "moe", "lusteloos", "sloom",
    "niet eten", "wil niet eten", "geen eetlust", "drinken",
    "plassen", "poepen", "ontlasting",
    "toeval", "aanval", "in elkaar zakken", "verlamming", "opgeblazen buik",
    "noodgeval", "dringend", "dierenarts", "vee arts",
    "medicijn", "medicatie", "behandeling", "diagnose"
  ]
};

const RED_FLAG_PATTERNS = [
  /trouble\s+breath/i, /can'?t\s+breath/i, /difficulty\s+breath/i,
  /repeated(ly)?\s+vomit/i, /constant(ly)?\s+vomit/i, /vomiting\s+(blood|a\s+lot)/i,
  /blood\s+in\s+(stool|vomit|pee|urine)/i, /bloody\s+(stool|vomit)/i,
  /seizure/i, /having\s+seizures/i, /convuls/i,
  /severe(ly)?\s+(lethar|tired|weak)/i, /won'?t\s+move/i, /can'?t\s+(stand|walk|move)/i,
  /bloat/i, /swollen\s+(belly|stomach|abdomen)/i, /distended/i,
  /can'?t\s+(pee|urinate)/i, /straining\s+to\s+(pee|urinate)/i, /blocked/i,
  /collapse/i, /passed\s+out/i, /unconscious/i,
  /sudden\s+paralysis/i, /can'?t\s+move\s+(legs|back)/i,
  /poison/i, /ate\s+(chocolate|xylitol|grapes|onion|garlic)/i, /toxic/i,
  /moeilijk\s+ademen/i, /kan\s+niet\s+ademen/i, /ademhalingsproblemen/i,
  /veel\s+braken/i, /bloed\s+in/i, /bloederig/i,
  /toeval/i, /aanval(len)?/i, /stuip/i,
  /erg\s+(moe|sloom|zwak)/i, /kan\s+niet\s+(staan|lopen|bewegen)/i,
  /opgeblazen\s+buik/i,
  /kan\s+niet\s+plassen/i, /problemen\s+met\s+plassen/i,
  /in\s+elkaar\s+gezakt/i, /bewusteloos/i,
  /vergif/i, /chocolade\s+gegeten/i, /giftig/i
];

const SMALL_TALK_PATTERNS = {
  en: [/^(hi|hello|hey|howdy|greetings|yo|sup)\b/i, /^how are you/i, /^what's up/i, /^good (morning|afternoon|evening)/i],
  nl: [/^(hoi|hallo|hey|dag|goedemorgen|goedemiddag|goedenavond)\b/i, /^hoe gaat het/i, /^wat is er/i]
};

function detectLanguage(text) {
  const lower = text.toLowerCase();
  const dutchIndicators = ["ik", "je", "jij", "jullie", "hebben", "heb", "wat", "voor", "mijn", "een", "de", "het", "en", "maar", "aan", "ook"];
  const englishIndicators = ["i", "you", "we", "have", "has", "what", "for", "my", "a", "an", "the", "and", "but", "to", "also"];
  
  let dutchScore = 0;
  let englishScore = 0;
  
  const words = lower.split(/\s+/);
  for (const word of words) {
    if (dutchIndicators.includes(word)) dutchScore++;
    if (englishIndicators.includes(word)) englishScore++;
  }
  
  if (dutchScore > englishScore) return "nl";
  if (/jullie|hebben|heb|mijn|hond|kat|voer|laten\s+zien|zoek|kopen|bestellen/.test(lower)) return "nl";
  
  return "en";
}

function detectPetType(text) {
  const lower = text.toLowerCase();
  const dogWords = ["dog", "puppy", "hond", "pup", "hondje", "honden"];
  const catWords = ["cat", "kitten", "kat", "poes", "katje", "katten"];
  
  let hasDog = dogWords.some(w => lower.includes(w));
  let hasCat = catWords.some(w => lower.includes(w));
  
  if (hasDog && hasCat) return "BOTH";
  if (hasDog) return "DOG";
  if (hasCat) return "CAT";
  return null;
}

function countKeywordMatches(text, keywordSets) {
  const lower = text.toLowerCase();
  let count = 0;
  
  for (const lang of ["en", "nl"]) {
    if (keywordSets[lang]) {
      for (const kw of keywordSets[lang]) {
        if (lower.includes(kw.toLowerCase())) count++;
      }
    }
  }
  
  return count;
}

function isSmallTalk(text) {
  for (const lang of ["en", "nl"]) {
    for (const pattern of SMALL_TALK_PATTERNS[lang]) {
      if (pattern.test(text)) return true;
    }
  }
  return false;
}

function hasRedFlags(text) {
  for (const pattern of RED_FLAG_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function extractCategoryHints(text) {
  const lower = text.toLowerCase();
  const hints = [];
  
  const categories = {
    toy: ["toy", "toys", "speelgoed", "speeltje", "ball", "bal", "mouse", "muis"],
    bed: ["bed", "beds", "bedden", "cushion", "kussen", "sleeping", "slapen", "calming"],
    bowl: ["bowl", "bowls", "bak", "bakken", "voerbak", "waterbak", "food bowl", "water bowl"],
    collar: ["collar", "collars", "halsband", "halsbanden", "leash", "riem", "harness", "tuig"],
    food: ["food", "voer", "voeding", "treats", "snoepjes", "snacks"],
    grooming: ["brush", "borstel", "grooming", "verzorging", "shampoo", "nail", "nagel"],
    litter: ["litter", "kattenbak", "litter box", "cat litter"],
    scratcher: ["scratcher", "scratching", "krabpaal", "krabben", "scratch post"],
    carrier: ["carrier", "draagtas", "transportbox", "travel", "reizen"],
    fountain: ["fountain", "fontein", "water fountain", "drinkfontein"]
  };
  
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) hints.push(cat);
  }
  
  return hints;
}

function extractPriceMax(text) {
  const patterns = [
    /under\s*\$\s*(\d+)/i,
    /below\s*\$\s*(\d+)/i,
    /less\s+than\s*\$\s*(\d+)/i,
    /max\s*\$\s*(\d+)/i,
    /budget\s*\$\s*(\d+)/i,
    /onder\s*€?\s*(\d+)/i,
    /onder\s+de\s*€?\s*(\d+)/i,
    /max\s*€?\s*(\d+)/i,
    /maximaal\s*€?\s*(\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1]);
  }
  
  return null;
}

function classifyIntent(message) {
  const text = (message || "").trim();
  if (!text) return { 
    intent: "SMALL_TALK", 
    confidence: 0, 
    language: "en",
    petType: null,
    categoryHints: [],
    priceMax: null,
    isHealthConcern: false, 
    hasRedFlags: false 
  };
  
  const language = detectLanguage(text);
  const petType = detectPetType(text);
  const categoryHints = extractCategoryHints(text);
  const priceMax = extractPriceMax(text);
  
  const productScore = countKeywordMatches(text, PRODUCT_SEARCH_KEYWORDS);
  const storeInfoScore = countKeywordMatches(text, STORE_INFO_KEYWORDS);
  const petAdviceScore = countKeywordMatches(text, PET_ADVICE_KEYWORDS);
  const healthScore = countKeywordMatches(text, HEALTH_KEYWORDS);
  
  const isHealthConcern = healthScore >= 1;
  const redFlagsDetected = hasRedFlags(text);
  
  let intent = "GENERAL_PET_KNOWLEDGE";
  let confidence = 0.5;
  
  if (isSmallTalk(text)) {
    intent = "SMALL_TALK";
    confidence = 0.95;
  } else if (redFlagsDetected || (isHealthConcern && healthScore >= 2)) {
    intent = "PET_ADVICE";
    confidence = Math.min(0.95, 0.6 + healthScore * 0.1);
  } else if (productScore > storeInfoScore && productScore > petAdviceScore && productScore > healthScore) {
    intent = categoryHints.length > 0 || priceMax ? "PRODUCT_SEARCH" : "PRODUCT_RECOMMENDATION";
    confidence = Math.min(0.95, 0.5 + productScore * 0.1);
  } else if (storeInfoScore > productScore && storeInfoScore > petAdviceScore) {
    intent = "STORE_INFO";
    confidence = Math.min(0.95, 0.6 + storeInfoScore * 0.1);
  } else if (petAdviceScore >= productScore && !isHealthConcern) {
    intent = "GENERAL_PET_KNOWLEDGE";
    confidence = Math.min(0.95, 0.5 + petAdviceScore * 0.1);
  } else if (categoryHints.length > 0) {
    intent = "PRODUCT_SEARCH";
    confidence = 0.7;
  }
  
  log(`[Intent] "${text.substring(0, 40)}..." → ${intent} (lang:${language} product:${productScore} store:${storeInfoScore} pet:${petAdviceScore} health:${healthScore}) redFlags:${redFlagsDetected}`);
  
  return {
    intent,
    confidence,
    language,
    petType,
    categoryHints,
    priceMax,
    isHealthConcern,
    hasRedFlags: redFlagsDetected,
    scores: { 
      product: productScore, 
      storeInfo: storeInfoScore, 
      petAdvice: petAdviceScore, 
      health: healthScore 
    }
  };
}

module.exports = { 
  classifyIntent, 
  hasRedFlags, 
  detectLanguage, 
  detectPetType, 
  extractCategoryHints, 
  extractPriceMax,
  HEALTH_KEYWORDS 
};
