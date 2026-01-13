// GetPawsy Internationalization (i18n) System
// Supports: en (English), nl (Dutch), de (German), fr (French), es (Spanish)

const LANG_STORAGE_KEY = 'gp_lang';
const SUPPORTED_LANGS = ['en', 'nl', 'de', 'fr', 'es'];
const DEFAULT_LANG = 'en';

// UI Translation Dictionary
const translations = {
  en: {
    // Header & Navigation
    searchPlaceholder: "Search products…",
    cart: "Cart",
    navDogs: "Dogs",
    navCats: "Cats",
    navSmallPets: "Small Pets",
    navCategories: "Categories",
    
    // Hero
    heroHeadline: "Premium Pet Essentials",
    heroSubheadline: "Hand-picked products for happy dogs and cats. Fast US shipping, curated by Pawsy AI.",
    shopDogs: "Shop Dogs",
    shopCats: "Shop Cats",
    browseAll: "Browse All",
    
    // Trust
    usShipping: "US Shipping",
    curatedPicks: "Curated Picks",
    easyReturns: "Easy Returns",
    fastShipping: "Fast Shipping",
    secureCheckout: "Secure checkout",
    thirtyDayReturns: "30-day returns",
    
    // Product
    addToCart: "Add to Cart",
    viewDetails: "View full details",
    shipsFromUs: "Ships from US warehouse (3–7 business days)",
    fastUsShipping: "Fast US shipping when available",
    frequentlyBought: "Frequently bought together",
    youMayLike: "You may also like",
    selectOption: "Select option",
    chooseSize: "Choose size",
    chooseColor: "Choose color",
    chooseSizeColor: "Choose size / color",
    
    // Reviews
    customerReviews: "Customer Reviews",
    noReviews: "No reviews yet. Be the first to review this product!",
    writeReview: "Write a Review",
    yourRating: "Your Rating:",
    yourName: "Your name",
    yourEmail: "Your email (not shown publicly)",
    reviewTitle: "Review title",
    reviewPlaceholder: "Tell us about your experience...",
    submitReview: "Submit Review",
    reviewSubmitted: "Thank you! Your review has been submitted for moderation.",
    
    // Product Tabs
    tabDescription: "Description",
    tabHighlights: "Highlights",
    tabShipping: "Shipping & Returns",
    tabSpecs: "Specs",
    shippingTitle: "Shipping",
    shippingText: "We ship across the USA from our warehouse. Standard delivery takes 3-7 business days. Express shipping available at checkout.",
    returnsTitle: "Returns",
    returnsText: "Not happy? Return within 30 days for a full refund. Items must be unused and in original packaging. Contact support to initiate a return.",
    
    // Cart
    yourCart: "Your cart",
    total: "Total",
    checkout: "Checkout",
    cartEmpty: "Your cart is empty",
    
    // Quick View
    handPickedBy: "Hand-picked by Pawsy AI",
    satisfactionGuarantee: "Secure checkout • 30-day satisfaction guarantee",
    
    // Footer
    privacy: "Privacy",
    terms: "Terms",
    returns: "Returns",
    shipping: "Shipping",
    contact: "Contact",
    cookiePreferences: "Cookie Preferences",
    
    // Cookie Consent
    cookieTitle: "We value your privacy",
    cookieText: "We use cookies to enhance your browsing experience, serve personalized ads, and analyze our traffic. By clicking \"Accept All\", you consent to our use of cookies.",
    rejectAll: "Reject All",
    customize: "Customize",
    acceptAll: "Accept All",
    
    // Sections
    topPicks: "Top Picks for You",
    topPicksSubtitle: "Hand-selected favorites, curated by Pawsy AI",
    allProducts: "All Products",
    topPicksDogs: "Top Picks for Dogs",
    topPicksCats: "Top Picks for Cats",
    dogPicksSubtitle: "Hand-picked favorites for happy pups",
    catPicksSubtitle: "Curated essentials for curious kitties",
    
    // Features
    curatedPicksTitle: "Curated Picks",
    curatedPicksDesc: "Hand-selected products for happy pets",
    fastShippingTitle: "Fast Shipping",
    fastShippingDesc: "US warehouse delivery in 3-7 days",
    pawsyAiTitle: "Pawsy AI Help",
    pawsyAiDesc: "24/7 smart assistant for pet advice",
    
    // Editorial
    whyPetParentsLove: "Why pet parents love GetPawsy",
    missionStatement: "We're on a mission to make pet parenting easier. Every product is hand-picked for quality, safety, and your pet's happiness.",
    petFirstQuality: "Pet-First Quality",
    petFirstQualityDesc: "Only non-toxic, durable products make the cut",
    happinessGuaranteed: "Happiness Guaranteed",
    happinessGuaranteedDesc: "30-day returns, no questions asked",
    surpriseDelight: "Surprise & Delight",
    surpriseDelightDesc: "New curated picks added weekly",
    
    // Pawsy
    pawsyGreeting: "Hi! I'm Pawsy 🐾 Ask me about shipping, products, or pet advice!",
    askPawsy: "Ask about shipping, sizing, pet advice…",
    send: "Send",
    
    // Trust bar
    trustBar: "Fast US shipping when available • Secure checkout • 30-day returns",
    
    // Back link
    backToProducts: "← Back to products"
  },
  
  nl: {
    // Header
    searchPlaceholder: "Zoek producten…",
    cart: "Winkelwagen",
    
    // Hero
    heroHeadline: "Premium Huisdier Essentials",
    heroSubheadline: "Handgeselecteerde producten voor gelukkige honden en katten. Snelle verzending vanuit de VS, samengesteld door Pawsy AI.",
    shopDogs: "Shop Honden",
    shopCats: "Shop Katten",
    browseAll: "Bekijk Alles",
    
    // Trust
    usShipping: "VS Verzending",
    curatedPicks: "Geselecteerde Picks",
    easyReturns: "Eenvoudig Retour",
    fastShipping: "Snelle Verzending",
    secureCheckout: "Veilig afrekenen",
    thirtyDayReturns: "30 dagen retour",
    
    // Product
    addToCart: "In Winkelwagen",
    viewDetails: "Bekijk alle details",
    shipsFromUs: "Verzending vanuit VS magazijn (3-7 werkdagen)",
    fastUsShipping: "Snelle VS verzending indien beschikbaar",
    frequentlyBought: "Vaak samen gekocht",
    youMayLike: "Misschien vind je dit ook leuk",
    selectOption: "Selecteer optie",
    chooseSize: "Kies maat",
    chooseColor: "Kies kleur",
    chooseSizeColor: "Kies maat / kleur",
    
    // Reviews
    customerReviews: "Klantbeoordelingen",
    noReviews: "Nog geen beoordelingen. Schrijf de eerste review!",
    writeReview: "Schrijf een Review",
    yourRating: "Jouw Beoordeling:",
    yourName: "Je naam",
    yourEmail: "Je e-mail (niet openbaar)",
    reviewTitle: "Review titel",
    reviewPlaceholder: "Vertel over je ervaring...",
    submitReview: "Verstuur Review",
    reviewSubmitted: "Bedankt! Je review is ingediend ter moderatie.",
    
    // Product Tabs
    tabDescription: "Beschrijving",
    tabHighlights: "Highlights",
    tabShipping: "Verzending & Retour",
    tabSpecs: "Specificaties",
    shippingTitle: "Verzending",
    shippingText: "Wij verzenden door de VS vanuit ons magazijn. Standaard levering duurt 3-7 werkdagen. Express verzending beschikbaar bij afrekenen.",
    returnsTitle: "Retourneren",
    returnsText: "Niet tevreden? Retourneer binnen 30 dagen voor volledige terugbetaling. Artikelen moeten ongebruikt zijn in originele verpakking. Neem contact op met support om een retour te starten.",
    
    // Cart
    yourCart: "Je winkelwagen",
    total: "Totaal",
    checkout: "Afrekenen",
    cartEmpty: "Je winkelwagen is leeg",
    
    // Quick View
    handPickedBy: "Handgeselecteerd door Pawsy AI",
    satisfactionGuarantee: "Veilig afrekenen • 30 dagen tevredenheidsgarantie",
    
    // Footer
    privacy: "Privacy",
    terms: "Voorwaarden",
    returns: "Retourneren",
    shipping: "Verzending",
    contact: "Contact",
    cookiePreferences: "Cookie Voorkeuren",
    
    // Cookie Consent
    cookieTitle: "Wij waarderen je privacy",
    cookieText: "We gebruiken cookies om je surfervaring te verbeteren en gepersonaliseerde advertenties te tonen. Door op \"Accepteer Alle\" te klikken, stem je in met ons cookiegebruik.",
    rejectAll: "Alles Weigeren",
    customize: "Aanpassen",
    acceptAll: "Accepteer Alle",
    
    // Sections
    topPicks: "Top Picks voor Jou",
    topPicksSubtitle: "Handgeselecteerde favorieten, samengesteld door Pawsy AI",
    allProducts: "Alle Producten",
    topPicksDogs: "Top Picks voor Honden",
    topPicksCats: "Top Picks voor Katten",
    dogPicksSubtitle: "Handgeselecteerde favorieten voor blije pups",
    catPicksSubtitle: "Zorgvuldig geselecteerde essentials voor nieuwsgierige katten",
    
    // Features
    curatedPicksTitle: "Geselecteerde Picks",
    curatedPicksDesc: "Handgeselecteerde producten voor gelukkige huisdieren",
    fastShippingTitle: "Snelle Verzending",
    fastShippingDesc: "VS magazijn levering in 3-7 dagen",
    pawsyAiTitle: "Pawsy AI Hulp",
    pawsyAiDesc: "24/7 slimme assistent voor huisdier advies",
    
    // Editorial
    whyPetParentsLove: "Waarom huisdiereigenaren van GetPawsy houden",
    missionStatement: "Wij maken huisdier ouderschap makkelijker. Elk product is handgeselecteerd voor kwaliteit, veiligheid en het geluk van je huisdier.",
    petFirstQuality: "Huisdier-Eerst Kwaliteit",
    petFirstQualityDesc: "Alleen niet-giftige, duurzame producten",
    happinessGuaranteed: "Geluk Gegarandeerd",
    happinessGuaranteedDesc: "30 dagen retour, geen vragen",
    surpriseDelight: "Verras & Verblijd",
    surpriseDelightDesc: "Wekelijks nieuwe picks toegevoegd",
    
    // Pawsy
    pawsyGreeting: "Hoi! Ik ben Pawsy 🐾 Vraag me over verzending, producten of huisdier advies!",
    askPawsy: "Vraag over verzending, maten, huisdier advies…",
    send: "Verstuur",
    
    // Trust bar
    trustBar: "Snelle VS verzending • Veilig afrekenen • 30 dagen retour",
    
    // Back link
    backToProducts: "← Terug naar producten"
  },
  
  de: {
    // Header
    searchPlaceholder: "Produkte suchen…",
    cart: "Warenkorb",
    
    // Hero
    heroHeadline: "Premium Haustier Essentials",
    heroSubheadline: "Handverlesene Produkte für glückliche Hunde und Katzen. Schneller US-Versand, kuratiert von Pawsy AI.",
    shopDogs: "Shop Hunde",
    shopCats: "Shop Katzen",
    browseAll: "Alle Ansehen",
    
    // Trust
    usShipping: "US Versand",
    curatedPicks: "Kuratierte Auswahl",
    easyReturns: "Einfache Rückgabe",
    fastShipping: "Schneller Versand",
    secureCheckout: "Sichere Zahlung",
    thirtyDayReturns: "30 Tage Rückgabe",
    
    // Product
    addToCart: "In den Warenkorb",
    viewDetails: "Alle Details anzeigen",
    shipsFromUs: "Versand aus US-Lager (3-7 Werktage)",
    fastUsShipping: "Schneller US-Versand wenn verfügbar",
    frequentlyBought: "Häufig zusammen gekauft",
    youMayLike: "Das könnte dir auch gefallen",
    selectOption: "Option wählen",
    chooseSize: "Größe wählen",
    chooseColor: "Farbe wählen",
    chooseSizeColor: "Größe / Farbe wählen",
    
    // Reviews
    customerReviews: "Kundenbewertungen",
    noReviews: "Noch keine Bewertungen. Sei der Erste!",
    writeReview: "Bewertung Schreiben",
    yourRating: "Deine Bewertung:",
    yourName: "Dein Name",
    yourEmail: "Deine E-Mail (nicht öffentlich)",
    reviewTitle: "Bewertungstitel",
    reviewPlaceholder: "Erzähl von deiner Erfahrung...",
    submitReview: "Bewertung Abschicken",
    reviewSubmitted: "Danke! Deine Bewertung wurde zur Moderation eingereicht.",
    
    // Product Tabs
    tabDescription: "Beschreibung",
    tabHighlights: "Highlights",
    tabShipping: "Versand & Rückgabe",
    tabSpecs: "Spezifikationen",
    shippingTitle: "Versand",
    shippingText: "Wir versenden in die USA aus unserem Lager. Standardlieferung dauert 3-7 Werktage. Expressversand an der Kasse verfügbar.",
    returnsTitle: "Rückgabe",
    returnsText: "Nicht zufrieden? Rückgabe innerhalb von 30 Tagen für volle Rückerstattung. Artikel müssen unbenutzt und in Originalverpackung sein. Kontaktieren Sie den Support für eine Rückgabe.",
    
    // Cart
    yourCart: "Dein Warenkorb",
    total: "Gesamt",
    checkout: "Zur Kasse",
    cartEmpty: "Dein Warenkorb ist leer",
    
    // Quick View
    handPickedBy: "Handverlesen von Pawsy AI",
    satisfactionGuarantee: "Sichere Zahlung • 30 Tage Zufriedenheitsgarantie",
    
    // Footer
    privacy: "Datenschutz",
    terms: "AGB",
    returns: "Rückgabe",
    shipping: "Versand",
    contact: "Kontakt",
    cookiePreferences: "Cookie Einstellungen",
    
    // Cookie Consent
    cookieTitle: "Wir schätzen Ihre Privatsphäre",
    cookieText: "Wir verwenden Cookies, um Ihr Surferlebnis zu verbessern und personalisierte Werbung zu zeigen. Mit \"Alle Akzeptieren\" stimmen Sie unserer Cookie-Nutzung zu.",
    rejectAll: "Alle Ablehnen",
    customize: "Anpassen",
    acceptAll: "Alle Akzeptieren",
    
    // Sections
    topPicks: "Top Picks für Dich",
    topPicksSubtitle: "Handverlesene Favoriten, kuratiert von Pawsy AI",
    allProducts: "Alle Produkte",
    topPicksDogs: "Top Picks für Hunde",
    topPicksCats: "Top Picks für Katzen",
    dogPicksSubtitle: "Handverlesene Favoriten für glückliche Welpen",
    catPicksSubtitle: "Kuratierte Essentials für neugierige Kätzchen",
    
    // Features
    curatedPicksTitle: "Kuratierte Auswahl",
    curatedPicksDesc: "Handverlesene Produkte für glückliche Haustiere",
    fastShippingTitle: "Schneller Versand",
    fastShippingDesc: "US-Lager Lieferung in 3-7 Tagen",
    pawsyAiTitle: "Pawsy AI Hilfe",
    pawsyAiDesc: "24/7 KI-Assistent für Haustier Beratung",
    
    // Editorial
    whyPetParentsLove: "Warum Tierbesitzer GetPawsy lieben",
    missionStatement: "Wir machen das Leben mit Haustieren einfacher. Jedes Produkt wird handverlesen für Qualität, Sicherheit und das Glück deines Haustieres.",
    petFirstQuality: "Haustier-Erste Qualität",
    petFirstQualityDesc: "Nur ungiftige, langlebige Produkte",
    happinessGuaranteed: "Zufriedenheit Garantiert",
    happinessGuaranteedDesc: "30 Tage Rückgabe, ohne Fragen",
    surpriseDelight: "Überraschung & Freude",
    surpriseDelightDesc: "Wöchentlich neue kuratierte Picks",
    
    // Pawsy
    pawsyGreeting: "Hallo! Ich bin Pawsy 🐾 Frag mich über Versand, Produkte oder Haustier-Tipps!",
    askPawsy: "Frag über Versand, Größen, Haustier Beratung…",
    send: "Senden",
    
    // Trust bar
    trustBar: "Schneller US-Versand • Sichere Zahlung • 30 Tage Rückgabe",
    
    // Back link
    backToProducts: "← Zurück zu Produkten"
  },
  
  fr: {
    // Header
    searchPlaceholder: "Rechercher des produits…",
    cart: "Panier",
    
    // Hero
    heroHeadline: "Essentiels Premium pour Animaux",
    heroSubheadline: "Produits sélectionnés à la main pour des chiens et chats heureux. Expédition rapide depuis les États-Unis, curatée par Pawsy AI.",
    shopDogs: "Shop Chiens",
    shopCats: "Shop Chats",
    browseAll: "Voir Tout",
    
    // Trust
    usShipping: "Livraison US",
    curatedPicks: "Sélections Curées",
    easyReturns: "Retours Faciles",
    fastShipping: "Livraison Rapide",
    secureCheckout: "Paiement sécurisé",
    thirtyDayReturns: "Retours 30 jours",
    
    // Product
    addToCart: "Ajouter au Panier",
    viewDetails: "Voir tous les détails",
    shipsFromUs: "Expédié depuis l'entrepôt US (3-7 jours ouvrables)",
    fastUsShipping: "Livraison US rapide si disponible",
    frequentlyBought: "Souvent achetés ensemble",
    youMayLike: "Vous pourriez aussi aimer",
    selectOption: "Sélectionner une option",
    chooseSize: "Choisir la taille",
    chooseColor: "Choisir la couleur",
    chooseSizeColor: "Choisir taille / couleur",
    
    // Reviews
    customerReviews: "Avis Clients",
    noReviews: "Pas encore d'avis. Soyez le premier à évaluer ce produit !",
    writeReview: "Écrire un Avis",
    yourRating: "Votre Note :",
    yourName: "Votre nom",
    yourEmail: "Votre email (non affiché publiquement)",
    reviewTitle: "Titre de l'avis",
    reviewPlaceholder: "Parlez-nous de votre expérience...",
    submitReview: "Soumettre l'Avis",
    reviewSubmitted: "Merci ! Votre avis a été soumis pour modération.",
    
    // Product Tabs
    tabDescription: "Description",
    tabHighlights: "Points Forts",
    tabShipping: "Livraison & Retours",
    tabSpecs: "Caractéristiques",
    shippingTitle: "Livraison",
    shippingText: "Nous expédions aux États-Unis depuis notre entrepôt. La livraison standard prend 3-7 jours ouvrables. Livraison express disponible au paiement.",
    returnsTitle: "Retours",
    returnsText: "Pas satisfait ? Retournez sous 30 jours pour un remboursement complet. Les articles doivent être non utilisés dans leur emballage d'origine. Contactez le support pour initier un retour.",
    
    // Cart
    yourCart: "Votre panier",
    total: "Total",
    checkout: "Commander",
    cartEmpty: "Votre panier est vide",
    
    // Quick View
    handPickedBy: "Sélectionné à la main par Pawsy AI",
    satisfactionGuarantee: "Paiement sécurisé • Garantie satisfaction 30 jours",
    
    // Footer
    privacy: "Confidentialité",
    terms: "CGV",
    returns: "Retours",
    shipping: "Livraison",
    contact: "Contact",
    cookiePreferences: "Préférences Cookies",
    
    // Cookie Consent
    cookieTitle: "Nous valorisons votre vie privée",
    cookieText: "Nous utilisons des cookies pour améliorer votre expérience de navigation et afficher des publicités personnalisées. En cliquant sur \"Tout Accepter\", vous consentez à notre utilisation des cookies.",
    rejectAll: "Tout Refuser",
    customize: "Personnaliser",
    acceptAll: "Tout Accepter",
    
    // Sections
    topPicks: "Top Sélections pour Vous",
    topPicksSubtitle: "Favoris sélectionnés à la main, curés par Pawsy AI",
    allProducts: "Tous les Produits",
    topPicksDogs: "Top Sélections pour Chiens",
    topPicksCats: "Top Sélections pour Chats",
    dogPicksSubtitle: "Favoris sélectionnés pour des chiots heureux",
    catPicksSubtitle: "Essentiels curés pour des chatons curieux",
    
    // Features
    curatedPicksTitle: "Sélections Curées",
    curatedPicksDesc: "Produits sélectionnés à la main pour des animaux heureux",
    fastShippingTitle: "Livraison Rapide",
    fastShippingDesc: "Livraison entrepôt US en 3-7 jours",
    pawsyAiTitle: "Aide Pawsy AI",
    pawsyAiDesc: "Assistant IA 24/7 pour conseils animaux",
    
    // Editorial
    whyPetParentsLove: "Pourquoi les propriétaires d'animaux aiment GetPawsy",
    missionStatement: "Notre mission est de faciliter la vie avec un animal. Chaque produit est sélectionné pour la qualité, la sécurité et le bonheur de votre animal.",
    petFirstQuality: "Qualité Animal d'Abord",
    petFirstQualityDesc: "Seuls les produits non-toxiques et durables passent le test",
    happinessGuaranteed: "Bonheur Garanti",
    happinessGuaranteedDesc: "Retours 30 jours, sans questions",
    surpriseDelight: "Surprise & Délice",
    surpriseDelightDesc: "Nouvelles sélections curées chaque semaine",
    
    // Pawsy
    pawsyGreeting: "Bonjour ! Je suis Pawsy 🐾 Demandez-moi sur la livraison, les produits ou les conseils animaux !",
    askPawsy: "Demandez sur la livraison, les tailles, conseils animaux…",
    send: "Envoyer",
    
    // Trust bar
    trustBar: "Livraison US rapide • Paiement sécurisé • Retours 30 jours",
    
    // Back link
    backToProducts: "← Retour aux produits"
  },
  
  es: {
    // Header
    searchPlaceholder: "Buscar productos…",
    cart: "Carrito",
    
    // Hero
    heroHeadline: "Esenciales Premium para Mascotas",
    heroSubheadline: "Productos seleccionados a mano para perros y gatos felices. Envío rápido desde EE.UU., curado por Pawsy AI.",
    shopDogs: "Shop Perros",
    shopCats: "Shop Gatos",
    browseAll: "Ver Todo",
    
    // Trust
    usShipping: "Envío EE.UU.",
    curatedPicks: "Selecciones Curadas",
    easyReturns: "Devoluciones Fáciles",
    fastShipping: "Envío Rápido",
    secureCheckout: "Pago seguro",
    thirtyDayReturns: "Devoluciones 30 días",
    
    // Product
    addToCart: "Añadir al Carrito",
    viewDetails: "Ver todos los detalles",
    shipsFromUs: "Enviado desde almacén EE.UU. (3-7 días hábiles)",
    fastUsShipping: "Envío rápido EE.UU. cuando esté disponible",
    frequentlyBought: "Comprados frecuentemente juntos",
    youMayLike: "También te puede gustar",
    selectOption: "Seleccionar opción",
    chooseSize: "Elegir talla",
    chooseColor: "Elegir color",
    chooseSizeColor: "Elegir talla / color",
    
    // Reviews
    customerReviews: "Opiniones de Clientes",
    noReviews: "Aún no hay opiniones. ¡Sé el primero en opinar!",
    writeReview: "Escribir una Opinión",
    yourRating: "Tu Puntuación:",
    yourName: "Tu nombre",
    yourEmail: "Tu email (no se muestra públicamente)",
    reviewTitle: "Título de la opinión",
    reviewPlaceholder: "Cuéntanos tu experiencia...",
    submitReview: "Enviar Opinión",
    reviewSubmitted: "¡Gracias! Tu opinión ha sido enviada para moderación.",
    
    // Product Tabs
    tabDescription: "Descripción",
    tabHighlights: "Destacados",
    tabShipping: "Envío y Devoluciones",
    tabSpecs: "Especificaciones",
    shippingTitle: "Envío",
    shippingText: "Enviamos a EE.UU. desde nuestro almacén. La entrega estándar tarda 3-7 días hábiles. Envío exprés disponible en el checkout.",
    returnsTitle: "Devoluciones",
    returnsText: "¿No estás satisfecho? Devuelve en 30 días para un reembolso completo. Los artículos deben estar sin usar y en su embalaje original. Contacta soporte para iniciar una devolución.",
    
    // Cart
    yourCart: "Tu carrito",
    total: "Total",
    checkout: "Finalizar Compra",
    cartEmpty: "Tu carrito está vacío",
    
    // Quick View
    handPickedBy: "Seleccionado a mano por Pawsy AI",
    satisfactionGuarantee: "Pago seguro • Garantía de satisfacción 30 días",
    
    // Footer
    privacy: "Privacidad",
    terms: "Términos",
    returns: "Devoluciones",
    shipping: "Envío",
    contact: "Contacto",
    cookiePreferences: "Preferencias de Cookies",
    
    // Cookie Consent
    cookieTitle: "Valoramos tu privacidad",
    cookieText: "Usamos cookies para mejorar tu experiencia de navegación y mostrar anuncios personalizados. Al hacer clic en \"Aceptar Todo\", consientes nuestro uso de cookies.",
    rejectAll: "Rechazar Todo",
    customize: "Personalizar",
    acceptAll: "Aceptar Todo",
    
    // Sections
    topPicks: "Top Selecciones para Ti",
    topPicksSubtitle: "Favoritos seleccionados a mano, curados por Pawsy AI",
    allProducts: "Todos los Productos",
    topPicksDogs: "Top Selecciones para Perros",
    topPicksCats: "Top Selecciones para Gatos",
    dogPicksSubtitle: "Favoritos seleccionados para cachorros felices",
    catPicksSubtitle: "Esenciales curados para gatitos curiosos",
    
    // Features
    curatedPicksTitle: "Selecciones Curadas",
    curatedPicksDesc: "Productos seleccionados a mano para mascotas felices",
    fastShippingTitle: "Envío Rápido",
    fastShippingDesc: "Entrega desde almacén EE.UU. en 3-7 días",
    pawsyAiTitle: "Ayuda Pawsy AI",
    pawsyAiDesc: "Asistente IA 24/7 para consejos de mascotas",
    
    // Editorial
    whyPetParentsLove: "Por qué los dueños de mascotas aman GetPawsy",
    missionStatement: "Nuestra misión es facilitar la vida con mascotas. Cada producto está seleccionado por calidad, seguridad y la felicidad de tu mascota.",
    petFirstQuality: "Calidad Mascota Primero",
    petFirstQualityDesc: "Solo productos no tóxicos y duraderos pasan el test",
    happinessGuaranteed: "Felicidad Garantizada",
    happinessGuaranteedDesc: "Devoluciones 30 días, sin preguntas",
    surpriseDelight: "Sorpresa y Alegría",
    surpriseDelightDesc: "Nuevas selecciones curadas cada semana",
    
    // Pawsy
    pawsyGreeting: "¡Hola! Soy Pawsy 🐾 ¡Pregúntame sobre envíos, productos o consejos de mascotas!",
    askPawsy: "Pregunta sobre envío, tallas, consejos de mascotas…",
    send: "Enviar",
    
    // Trust bar
    trustBar: "Envío rápido EE.UU. • Pago seguro • Devoluciones 30 días",
    
    // Back link
    backToProducts: "← Volver a productos"
  }
};

// Detect visitor's preferred language
// Priority: 1) ?lang= URL param  2) localStorage  3) Default "en"
// NOTE: We do NOT auto-detect browser language - English is default for US market
function detectLanguage() {
  // 1. Check URL parameter (highest priority, always override)
  const urlParams = new URLSearchParams(window.location.search);
  const urlLang = urlParams.get('lang');
  if (urlLang && SUPPORTED_LANGS.includes(urlLang.toLowerCase())) {
    const lang = urlLang.toLowerCase();
    localStorage.setItem(LANG_STORAGE_KEY, lang); // Save preference
    console.log(`[i18n] URL param ?lang=${lang} detected, saved to localStorage`);
    return lang;
  }
  
  // 2. Check localStorage for saved preference (validate it's not corrupt)
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  if (saved) {
    if (SUPPORTED_LANGS.includes(saved)) {
      return saved;
    } else {
      // Corrupt/unknown value - reset to English
      console.log(`[i18n] Corrupt localStorage lang "${saved}" - resetting to "en"`);
      localStorage.setItem(LANG_STORAGE_KEY, DEFAULT_LANG);
      return DEFAULT_LANG;
    }
  }
  
  // 3. No preference set - default to English (US market)
  // Do NOT use browser language - we want English as default
  return DEFAULT_LANG;
}

// Get current language
function getCurrentLang() {
  // Always run detectLanguage() to handle ?lang= param and corruption
  return detectLanguage();
}

// Set language preference
function setLanguage(lang) {
  if (SUPPORTED_LANGS.includes(lang)) {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    document.documentElement.lang = lang; // Update <html lang="">
    applyTranslations();
    console.log(`[i18n] Language set to: ${lang}`);
    return true;
  }
  console.log(`[i18n] Invalid language: ${lang}`);
  return false;
}

// Get translation for a key
function t(key, fallback) {
  const lang = getCurrentLang();
  const dict = translations[lang] || translations[DEFAULT_LANG];
  return dict[key] || translations[DEFAULT_LANG][key] || fallback || key;
}

// Apply translations to DOM elements with data-i18n attribute
function applyTranslations() {
  const lang = getCurrentLang();
  console.log(`[i18n] Applying translations for: ${lang}`);
  
  // Set html lang attribute
  document.documentElement.lang = lang;
  
  // Translate elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = t(key);
    if (translation) {
      el.textContent = translation;
    }
  });
  
  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = t(key);
    if (translation) {
      el.placeholder = translation;
    }
  });
  
  // Translate aria-labels
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    const translation = t(key);
    if (translation) {
      el.setAttribute('aria-label', translation);
    }
  });
}

// Initialize language switcher in header
function initLangSwitcher() {
  const switcher = document.getElementById('langSwitcher');
  if (!switcher) return;
  
  const buttons = switcher.querySelectorAll('.lang-btn');
  const currentLang = getCurrentLang();
  
  buttons.forEach(btn => {
    const lang = btn.getAttribute('data-lang');
    
    if (lang === currentLang) {
      btn.classList.add('active');
    }
    
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      setLanguage(lang);
      
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    });
  });
}

// Initialize i18n on page load
function initI18n() {
  const lang = detectLanguage();
  console.log(`[i18n] Initialized with language: ${lang}`);
  
  // Ensure <html lang=""> is set correctly
  document.documentElement.lang = lang;
  
  applyTranslations();
  initLangSwitcher();
}

// Export for use in other scripts
window.i18n = {
  t,
  getCurrentLang,
  setLanguage,
  detectLanguage,
  applyTranslations,
  SUPPORTED_LANGS,
  DEFAULT_LANG
};

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initI18n);
} else {
  initI18n();
}
