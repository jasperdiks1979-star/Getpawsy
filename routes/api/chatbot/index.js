const fs = require("fs");
const path = require("path");

const CHAT_FILE = path.join(__dirname, "../../../data/chat_history.json");
const FAQ_FILE = path.join(__dirname, "../../../data/pawsy_faq.json");
const MEM_FILE = path.join(__dirname, "../../../data/pawsy_memory.json");
const PRODUCTS_FILE = path.join(__dirname, "../../../data/products.json");

function read(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return fp === MEM_FILE ? { users: {} } : fp === CHAT_FILE ? [] : [];
  }
}

function write(fp, data) {
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
}

// Basic scoring search
function searchProducts(query, products) {
  const q = query.toLowerCase();
  return products
    .map(p => {
      let score = 0;
      if (p.title && p.title.toLowerCase().includes(q)) score += 3;
      if (p.description && p.description.toLowerCase().includes(q)) score += 2;
      if (p.tags && p.tags.some(t => t.toLowerCase().includes(q))) score += 2;
      return { p, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(r => r.p);
}

async function callOpenAI(messages) {
  try {
    const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      return "I'm having trouble connecting to my AI brain right now. Try asking me about products or pet care instead! 🐾";
    }

    const fetch = (await import("node-fetch")).default;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages
      })
    });

    const j = await r.json();
    return j.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again!";
  } catch (e) {
    console.error("OpenAI error:", e);
    return "Sorry, I encountered a connection issue. Try asking about products or pet care tips! 🐾";
  }
}

function saveChat(type, text) {
  try {
    const h = read(CHAT_FILE);
    if (!Array.isArray(h)) return;
    h.push({ type, text, time: Date.now() });
    write(CHAT_FILE, h);
  } catch (e) {
    console.error("Chat save error:", e);
  }
}

function rememberUser(email, key, value) {
  try {
    const m = read(MEM_FILE);
    if (!m.users) m.users = {};
    if (!m.users[email]) m.users[email] = {};
    m.users[email][key] = value;
    write(MEM_FILE, m);
  } catch (e) {
    console.error("Memory save error:", e);
  }
}

module.exports = {
  async ask(req, res) {
    try {
      const msg = req.body.message || "";
      const email = req.body.user || "guest";

      saveChat("user", msg);

      const faqs = read(FAQ_FILE);
      const mem = read(MEM_FILE);
      const products = read(PRODUCTS_FILE);

      // 1 — MEMORY TRIGGER
      if (/my dog|my cat|i have a dog|i have a cat/i.test(msg)) {
        rememberUser(email, "pet", msg);
      }

      // 2 — FAQ MATCH
      const faq = faqs.find(f => msg.toLowerCase().includes(f.q.toLowerCase()));
      if (faq) {
        saveChat("bot", faq.a);
        return res.json({ reply: faq.a });
      }

      // 3 — INLINE PRODUCT SEARCH
      const matches = searchProducts(msg, products);
      if (matches.length > 0) {
        const reply = "Here are some great options I found for you! 🛒";
        saveChat("bot", reply);
        return res.json({
          reply,
          products: matches
        });
      }

      // 4 — ADD TO CART
      if (/add.*cart|buy.*that|i want to buy/i.test(msg)) {
        const found = searchProducts(msg, products)[0];
        if (found) {
          const reply = `I added **${found.title}** to your cart! 🛒`;
          saveChat("bot", reply);
          return res.json({
            reply,
            addToCart: found.id
          });
        }
      }

      // 5 — CHECKOUT MODE
      if (/checkout|place order|finish order/i.test(msg)) {
        const reply = "Your order has been placed! 🎉🐾";
        saveChat("bot", reply);
        return res.json({
          reply,
          placeOrder: true
        });
      }

      // 6 — MEMORY BASED RECOMMENDATION
      if (mem.users && mem.users[email] && mem.users[email].pet) {
        const pet = mem.users[email].pet;
        const contextHint = `User owns this pet: ${pet}. Adapt recommendations accordingly.`;
        const ai = await callOpenAI([
          { role: "system", content: "You are Pawsy, a friendly, playful pet assistant." },
          { role: "user", content: contextHint + "\n\n" + msg }
        ]);
        saveChat("bot", ai);
        return res.json({ reply: ai });
      }

      // 7 — GENERAL AI REPLY
      const ai = await callOpenAI([
        { role: "system", content: "You are Pawsy, a friendly pet shopping assistant for GetPawsy. Keep responses concise and helpful." },
        { role: "user", content: msg }
      ]);

      saveChat("bot", ai);
      res.json({ reply: ai });
    } catch (e) {
      console.error("Chatbot error:", e);
      res.status(500).json({ reply: "Sorry, something went wrong. Please try again!" });
    }
  }
};
