const STORE_POLICIES = {
  shipping: {
    en: {
      default: "We offer fast US shipping when products are available in our US warehouse. Typical delivery time is 3-7 business days for US-warehouse items.",
      international: "International shipping times vary depending on the supplier and destination. Most orders arrive within 7-21 business days.",
      free: "Free shipping on orders over $49 within the US."
    },
    nl: {
      default: "Wij bieden snelle verzending vanuit ons US-magazijn wanneer producten beschikbaar zijn. Typische levertijd is 3-7 werkdagen voor artikelen uit het US-magazijn.",
      international: "Internationale verzendtijden variëren afhankelijk van de leverancier en bestemming. De meeste bestellingen komen binnen 7-21 werkdagen aan.",
      free: "Gratis verzending bij bestellingen boven €49."
    }
  },
  returns: {
    en: "We accept returns within 30 days of delivery for eligible items. Items must be unused and in original packaging. Contact support@getpawsy.pet to initiate a return.",
    nl: "Wij accepteren retourzendingen binnen 30 dagen na levering voor in aanmerking komende artikelen. Artikelen moeten ongebruikt zijn en in originele verpakking. Neem contact op met support@getpawsy.pet om een retour te starten."
  },
  warranty: {
    en: "All products come with the manufacturer's warranty. If you experience any defects, contact us within 60 days and we'll help resolve the issue.",
    nl: "Alle producten worden geleverd met de fabrieksgarantie. Als u defecten ervaart, neem dan binnen 60 dagen contact met ons op en wij helpen u het probleem op te lossen."
  },
  payment: {
    en: "We accept all major credit cards, debit cards, and PayPal. All transactions are secured with SSL encryption.",
    nl: "Wij accepteren alle gangbare creditcards, debitcards en PayPal. Alle transacties zijn beveiligd met SSL-encryptie."
  },
  support: {
    en: {
      email: "support@getpawsy.pet",
      hours: "Monday - Friday, 9 AM - 6 PM EST",
      response: "We typically respond within 24 hours."
    },
    nl: {
      email: "support@getpawsy.pet",
      hours: "Maandag - Vrijdag, 9:00 - 18:00 EST",
      response: "Wij reageren doorgaans binnen 24 uur."
    }
  },
  identity: {
    name: "GetPawsy",
    tagline: {
      en: "Your one-stop pet shop for happy, healthy pets!",
      nl: "Jouw one-stop pet shop voor gelukkige, gezonde huisdieren!"
    },
    about: {
      en: "GetPawsy is an online pet store offering a curated selection of toys, beds, bowls, grooming supplies, and more for dogs and cats. We source quality products and ship from US warehouses whenever possible for fast delivery.",
      nl: "GetPawsy is een online dierenwinkel met een zorgvuldig samengestelde selectie van speelgoed, bedden, bakken, verzorgingsproducten en meer voor honden en katten. Wij leveren kwaliteitsproducten en verzenden waar mogelijk vanuit VS-magazijnen voor snelle levering."
    }
  },
  tracking: {
    en: "Once your order ships, you'll receive a tracking number via email. You can track your package using the link provided. If you haven't received tracking info within 48 hours of placing your order, please contact support.",
    nl: "Zodra uw bestelling is verzonden, ontvangt u een trackingnummer per e-mail. U kunt uw pakket volgen via de verstrekte link. Als u binnen 48 uur na het plaatsen van uw bestelling geen trackinginformatie heeft ontvangen, neem dan contact op met support."
  }
};

function getPolicy(key, language = "en", subKey = null) {
  const policy = STORE_POLICIES[key];
  if (!policy) return null;
  
  if (typeof policy === "string") return policy;
  
  if (policy[language]) {
    if (subKey && typeof policy[language] === "object" && policy[language][subKey]) {
      return policy[language][subKey];
    }
    if (typeof policy[language] === "string") {
      return policy[language];
    }
    if (typeof policy[language] === "object" && policy[language].default) {
      return policy[language].default;
    }
    return policy[language];
  }
  
  if (policy.en) {
    if (typeof policy.en === "string") return policy.en;
    if (subKey && policy.en[subKey]) return policy.en[subKey];
    if (policy.en.default) return policy.en.default;
    return policy.en;
  }
  
  return null;
}

function getShippingInfo(language = "en") {
  const shipping = STORE_POLICIES.shipping[language] || STORE_POLICIES.shipping.en;
  return `${shipping.default} ${shipping.international} ${shipping.free}`;
}

function getReturnsInfo(language = "en") {
  return STORE_POLICIES.returns[language] || STORE_POLICIES.returns.en;
}

function getSupportInfo(language = "en") {
  const support = STORE_POLICIES.support[language] || STORE_POLICIES.support.en;
  return `Email: ${support.email}. Hours: ${support.hours}. ${support.response}`;
}

function getStoreIdentity(language = "en") {
  return {
    name: STORE_POLICIES.identity.name,
    tagline: STORE_POLICIES.identity.tagline[language] || STORE_POLICIES.identity.tagline.en,
    about: STORE_POLICIES.identity.about[language] || STORE_POLICIES.identity.about.en
  };
}

function formatPolicyResponse(intent, language = "en") {
  switch (intent) {
    case "shipping":
      return getShippingInfo(language);
    case "returns":
      return getReturnsInfo(language);
    case "payment":
      return getPolicy("payment", language);
    case "warranty":
      return getPolicy("warranty", language);
    case "tracking":
      return getPolicy("tracking", language);
    case "support":
      return getSupportInfo(language);
    default:
      return null;
  }
}

module.exports = {
  STORE_POLICIES,
  getPolicy,
  getShippingInfo,
  getReturnsInfo,
  getSupportInfo,
  getStoreIdentity,
  formatPolicyResponse
};
