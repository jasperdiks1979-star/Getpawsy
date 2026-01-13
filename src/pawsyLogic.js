function detectIntents(text) {
  const lower = text.toLowerCase();
  const intents = [];

  if (/recommend|suggest|best|good|popular|what should/i.test(text)) intents.push("recommendation");
  if (/variant|color|colour|size|option|available/i.test(text)) intents.push("variant");
  if (/price|cost|cheap|expensive|much|afford/i.test(text)) intents.push("price");
  if (/shipping|delivery|ship|arrive|usps|ups|fedex/i.test(text)) intents.push("shipping");
  if (/dog|puppy|canine|hound/i.test(text)) intents.push("dog");
  if (/cat|kitten|feline|meow/i.test(text)) intents.push("cat");
  if (/durable|tough|strong|chew|heavy/i.test(text)) intents.push("durable");
  if (/calm|relax|sleep|sooth|anxiety/i.test(text)) intents.push("calming");
  if (/interactive|play|toy|engage|fun/i.test(text)) intents.push("interactive");

  return intents;
}

function matchProducts(products, keywords) {
  if (!keywords || keywords.length === 0) return products;
  return products.filter(p => {
    const title = (p.title || "").toLowerCase();
    const desc = (p.description || "").toLowerCase();
    return keywords.some(kw => title.includes(kw) || desc.includes(kw));
  });
}

function getPawsyResponse(message, products) {
  if (!message || !products) {
    return { reply: "I'm Pawsy 🐾 Ask me about products, shipping, sizing, or pet advice!" };
  }

  const intents = detectIntents(message);
  const lower = message.toLowerCase();

  // Recommendation intent
  if (intents.includes("recommendation")) {
    const filterKeywords = [];
    if (intents.includes("dog")) filterKeywords.push("dog", "puppy", "chew");
    if (intents.includes("cat")) filterKeywords.push("cat", "kitten", "wand", "teaser");
    if (intents.includes("durable")) filterKeywords.push("durable", "tough");
    if (intents.includes("calming")) filterKeywords.push("calm", "bed", "sleep");
    if (intents.includes("interactive")) filterKeywords.push("interactive", "toy", "play");

    let filtered = filterKeywords.length > 0 ? matchProducts(products, filterKeywords) : products;
    if (filtered.length === 0) filtered = products;

    const suggestions = filtered.slice(0, 3).map(p => {
      const variant = p.variants && p.variants[0];
      const price = variant ? variant.price : p.price;
      return { id: p.id, title: p.title, price, image: p.image };
    });

    const names = suggestions.map(s => s.title).join(", ");
    const reply = suggestions.length > 0
      ? `I'd recommend: ${names}. Great options for your needs! Click Add to check them out.`
      : "I have some great options for you! Browse our collection or tell me more.";

    return { reply, suggestions };
  }

  // Variant intent
  if (intents.includes("variant")) {
    const matched = matchProducts(products, [""]);
    if (matched.length > 0) {
      const p = matched[0];
      if (p.variants && p.variants.length > 0) {
        const sizes = new Set();
        const colors = new Set();
        p.variants.forEach(v => {
          if (v.options) {
            if (v.options.Size) sizes.add(v.options.Size);
            if (v.options.Color) colors.add(v.options.Color);
          }
        });

        let opts = [];
        if (sizes.size > 0) opts.push(`Sizes: ${Array.from(sizes).join(", ")}`);
        if (colors.size > 0) opts.push(`Colors: ${Array.from(colors).join(", ")}`);

        const reply = opts.length > 0
          ? `For ${p.title}: ${opts.join(" • ")}`
          : `${p.title} has multiple variants available!`;

        return { reply, suggestions: [{ id: p.id, title: p.title, price: p.price, image: p.image }] };
      }
    }
    return { reply: "Most products come in different options! Check the variant selector when viewing a product." };
  }

  // Price intent
  if (intents.includes("price")) {
    const matched = products.slice(0, 3);
    if (matched.length > 0) {
      const prices = matched.map(p => (p.variants && p.variants[0] ? p.variants[0].price : p.price));
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const reply = `Our prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}. We have options for every budget!`;
      return { reply, suggestions: matched.slice(0, 2).map(p => ({ id: p.id, title: p.title, price: p.price, image: p.image })) };
    }
  }

  // Shipping intent
  if (intents.includes("shipping")) {
    return { reply: "We ship fast! US warehouses mean 3–7 business days typically with USPS/UPS. Standard shipping is $4.95." };
  }

  // Default response with suggestions
  const topProducts = products.slice(0, 2);
  const suggestions = topProducts.map(p => ({ id: p.id, title: p.title, price: p.price, image: p.image }));

  return {
    reply: "I'm Pawsy 🐾 I can help with product recommendations, variants, pricing, and shipping. What would you like to know?",
    suggestions
  };
}

module.exports = { getPawsyResponse };
