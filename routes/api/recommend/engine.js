const fs = require("fs");
const path = require("path");
const db = require("../../../db/setup");

const USER_FILE = path.join(__dirname, "../../../data/recommend_user_data.json");

function readUsers() { 
  try {
    return JSON.parse(fs.readFileSync(USER_FILE, "utf8"));
  } catch {
    return { views: [], wishlist: [], orders: [] };
  }
}

// Get all products from database
function getProducts() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM products", (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Similarity score based on category and tags
function similarity(a, b) {
  let score = 0;
  
  if (a.category === b.category) score += 3;
  
  const at = (a.tags || "").split(",").filter(t => t.trim());
  const bt = (b.tags || "").split(",").filter(t => t.trim());
  score += at.filter(t => bt.includes(t)).length;
  
  return score;
}

module.exports = {

  get: async (req, res) => {
    try {
      const user = req.query.user || "guest";
      const productId = Number(req.query.productId || -1);

      const products = await getProducts();
      const userData = readUsers();

      // 1. If product page → recommend similar items
      if (productId !== -1) {
        const base = products.find(p => p.id === productId);
        if (!base) return res.json({ type: "similar", items: [] });
        
        const ranked = products
          .filter(p => p.id !== productId)
          .map(p => ({ p, score: similarity(base, p) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map(x => x.p);

        return res.json({
          type: "similar",
          items: ranked
        });
      }

      // 2. Personalized recommendations
      const views = userData.views.filter(v => v.user === user);
      const orders = userData.orders.filter(o => o.user === user);
      const wishlist = userData.wishlist.filter(w => w.user === user);

      let scoreMap = {};

      // Boost products matching viewed items
      views.forEach(v => {
        const product = products.find(p => p.id === v.productId);
        if (!product) return;
        products.forEach(p => {
          scoreMap[p.id] = (scoreMap[p.id] || 0) + similarity(product, p);
        });
      });

      // Boost wishlist matches
      wishlist.forEach(w => {
        const product = products.find(p => p.id === w.productId);
        if (!product) return;
        products.forEach(p => {
          scoreMap[p.id] = (scoreMap[p.id] || 0) + similarity(product, p) * 2;
        });
      });

      // Boost items similar to past order items
      orders.forEach(o => {
        (o.items || []).forEach(i => {
          const product = products.find(p => p.id === i.productId || p.id === i.id);
          if (!product) return;
          products.forEach(p => {
            scoreMap[p.id] = (scoreMap[p.id] || 0) + similarity(product, p) * 3;
          });
        });
      });

      // Fallback → popular
      if (Object.keys(scoreMap).length === 0) {
        const sorted = [...products].sort((a, b) => b.stock - a.stock).slice(0, 6);
        return res.json({
          type: "popular",
          items: sorted
        });
      }

      const ranked = Object.entries(scoreMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id]) => products.find(p => p.id === Number(id)))
        .filter(p => p);

      res.json({
        type: "personalized",
        items: ranked
      });
    } catch (error) {
      console.error("Recommendation error:", error);
      res.json({ type: "error", items: [] });
    }
  }

};
