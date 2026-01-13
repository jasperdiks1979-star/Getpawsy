const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../../../data/recommend_user_data.json");

function read() { 
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { views: [], wishlist: [], orders: [] };
  }
}

function write(data) { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }

module.exports = {
  
  view: (req, res) => {
    const data = read();
    data.views.push({
      user: req.body.user || "guest",
      productId: req.body.productId,
      time: Date.now()
    });
    write(data);
    res.json({ success: true });
  },

  wishlist: (req, res) => {
    const data = read();
    data.wishlist.push({
      user: req.body.user,
      productId: req.body.productId,
      time: Date.now()
    });
    write(data);
    res.json({ success: true });
  },

  order: (req, res) => {
    const data = read();
    data.orders.push({
      user: req.body.user,
      items: req.body.items,
      time: Date.now()
    });
    write(data);
    res.json({ success: true });
  }

};
