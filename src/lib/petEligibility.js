// src/lib/petEligibility.js
// Strict pet eligibility rules - no ambiguity

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9\s\-&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAny = (text, words) => words.some(w => text.includes(w));

const HARD_DENY = [
  "women","womens","woman","ladies","lingerie","bra","panties","underwear","bikini",
  "t-shirt","tee","hoodie","sweater","jacket","dress","skirt","jeans","pants","shorts",
  "pajama","sleepwear","swimwear","sock","hat","cap","beanie","scarf","gloves","shoe","sneaker",
  "handbag","purse","wallet","belt",
  "jewelry","jewel","necklace","bracelet","earring","ring","pendant","brooch","anklet",
  "phone case","iphone","android","airpods","earbuds","headphone","charger","charging",
  "bluetooth","camera","tripod","microphone","gaming","gamepad","controller","console",
  "makeup","cosmetic","lipstick","mascara","skincare","shampoo","conditioner",
  "kitchen","cookware","pan","pot","knife","cutlery","spoon","fork","plate","bowl set",
  "mug","cup","bottle","thermos",
  "bathroom","shower","toothbrush","towel",
  "curtain","bedsheet","duvet","pillowcase",
  "sex","sexy","erotic","adult","lingerie set",
  "baby","toddler","kids","children","doll","lego","stroller",
  "drill","screwdriver","wrench","tool","hardware",
  "car part","motorcycle","engine","tire","oil filter",
  "rug","carpet","tapijt","floor mat","doormat","area rug",
  "strapping","strapping tool","packing tape","packaging","box tape",
  "nail gun","nail","nails","pneumatic","staple gun","stapler",
  "beauty","facial","face mask","serum","cream",
  "furniture","chair","table","desk","sofa","couch",
  "garden","lawn","mower","sprinkler","hose",
  "office","stapler","binder","folder","paper",
  "fishing","hunting","rifle","gun","ammo",
  "wine","beer","alcohol","cigarette","vape",
  "cat-eye","cat eye","cateye","gift box","string lights","christmas lights","ornament","decoration","decorative light",
  "led light","fairy lights","night light","lamp","lantern","candle","home decor","wall art","picture frame",
  "kitten heel","flip flop","flip flops","high heel","heels","sandals","for women","for men",
  "plush doll","doll plush","stuffed doll","robot puppy","wireless speaker","busy board","activity wall",
  "mink cashmere","cashmere knitted","crew-neck sweater","hoodie for","sweater for","jacket for",
  "backpack cute","acrylic desktop","brooch","ice-cream cone","down quilt","quilt cover","bedding set",
  "coral fleece hand towel","hand towel kitchen","door lintel","scrapbook diy","carbon steel knife",
  "inflatable christmas","inflatable santa",
];

// HARD_ALLOW - functional pet keywords that strongly indicate pet products
const HARD_ALLOW = [
  "dog","puppy","canine",
  "cat","kitten","feline",
  "pet","pets",
  "treat","treats","kibble","chew","chews","snack","snacks",
  "catnip","scratching post","scratcher",
  "toy","toys","ball","rope toy","chew toy","squeaky","squeaker","fetch",
  "collar","leash","harness","lead","tag","id tag",
  "pet bowl","dog bowl","cat bowl","feeder","slow feeder","water fountain",
  "pet bed","dog bed","cat bed","mat","blanket","crate","kennel",
  "grooming","brush","deshedding","nail clipper","fur","lint roller","pet hair",
  "litter","litter box","scoop","cat litter",
  "training","clicker","muzzle","bark","anti bark","puzzle feeder",
  "pet carrier","carrier","car seat","seat cover","pet barrier","car barrier",
  "stroller for pet","pet ramp","dog ramp","pet door","dog door",
  "tick","flea","deworm","supplement","probiotic","calming",
  "pet wheelchair","dog wheelchair","pet playpen","dog playpen",
];

// ALLOW_KEYWORDS for scoring
const ALLOW_KEYWORDS = [
  "pet","dog","puppy","cat","kitten",
  "leash","harness","collar","tag",
  "bed","crate","kennel","carrier",
  "toy","chew","squeaky","ball","rope",
  "bowl","feeder","fountain",
  "litter","scoop",
  "groom","grooming","brush","fur","hair remover",
  "training","clicker",
  "scratch","scratcher","scratching post",
  "cat tree","tower",
  "treat","snack","kibble",
  "poop bag","waste bag",
  "pet gate","pet barrier","dog gate",
  "seat cover","car seat",
  "reflective",
  "interactive",
  "ramp","wheelchair","playpen","door",
];

const DENY_KEYWORDS = [
  "fashion","outfit",
  "necklace","ring","bracelet",
  "phone","case","iphone","android",
  "makeup","cosmetic","beauty",
  "kitchen","cook","pan","pot",
  "women","womens","lingerie",
  "shoes","sneakers",
  "toy for kids","kids",
  "camera","bluetooth",
];

function inferPetUsage(textRaw) {
  const t = norm(textRaw);
  const hasDog = includesAny(t, ["dog","puppy","canine"]);
  const hasCat = includesAny(t, ["cat","kitten","feline","catnip","litter","scratcher","cat tree"]);
  if (hasDog && hasCat) return "both";
  if (hasDog) return "dogs";
  if (hasCat) return "cats";
  return "unknown";
}

function isPetEligible(input) {
  const combined = [
    input.title,
    input.description,
    Array.isArray(input.tags) ? input.tags.join(" ") : input.tags,
    input.category,
    input.type,
  ]
    .filter(Boolean)
    .join(" ");

  const t = norm(combined);
  const reasons = [];

  if (includesAny(t, HARD_DENY)) {
    reasons.push("HARD_DENY keyword matched");
    return { eligible: false, score: -999, usage: inferPetUsage(t), reasons };
  }

  let score = 0;
  if (includesAny(t, HARD_ALLOW)) {
    score += 8;
    reasons.push("HARD_ALLOW matched (+8)");
  }

  const allowHits = ALLOW_KEYWORDS.filter(k => t.includes(k));
  const denyHits = DENY_KEYWORDS.filter(k => t.includes(k));

  score += Math.min(allowHits.length, 10) * 2;
  score -= Math.min(denyHits.length, 10) * 3;

  if (allowHits.length) reasons.push(`ALLOW hits: ${allowHits.slice(0, 10).join(", ")} (+${Math.min(allowHits.length, 10) * 2})`);
  if (denyHits.length) reasons.push(`DENY hits: ${denyHits.slice(0, 10).join(", ")} (-${Math.min(denyHits.length, 10) * 3})`);

  const hasPetSignal = includesAny(t, ["pet","dog","puppy","cat","kitten","feline","canine"]);
  if (!hasPetSignal) {
    score -= 10;
    reasons.push("No pet-signal words (-10)");
  }

  const eligible = score >= 6;
  reasons.push(`THRESHOLD: score=${score} -> eligible=${eligible}`);

  return { eligible, score, usage: inferPetUsage(t), reasons };
}

module.exports = { HARD_DENY, HARD_ALLOW, ALLOW_KEYWORDS, DENY_KEYWORDS, inferPetUsage, isPetEligible };
