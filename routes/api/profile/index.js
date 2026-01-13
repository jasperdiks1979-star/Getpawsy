const fs = require("fs");
const path = require("path");

const ADDR_FILE = path.join(__dirname, "../../../data/addresses.json");
const WISH_FILE = path.join(__dirname, "../../../data/wishlist.json");
const REV_FILE = path.join(__dirname, "../../../data/reviews.json");
const ORDERS_FILE = path.join(__dirname, "../../../data/orders.json");

function read(file){ 
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")); 
  } catch {
    return [];
  }
}
function write(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

module.exports = {

  // GET USER ORDERS (uses authenticated user from JWT)
  orders(req, res) {
    const userEmail = req.user.email;
    const orders = read(ORDERS_FILE).filter(o => o.customer?.email === userEmail);
    res.json(orders.reverse());
  },

  // GET USER ADDRESSES (uses authenticated user from JWT)
  addresses(req, res) {
    const userEmail = req.user.email;
    const list = read(ADDR_FILE).filter(a => a.user === userEmail);
    res.json(list);
  },

  // ADD NEW ADDRESS (uses authenticated user from JWT)
  addAddress(req, res) {
    const userEmail = req.user.email;
    const addrs = read(ADDR_FILE);
    const entry = { id: Date.now(), user: userEmail, ...req.body };
    addrs.push(entry);
    write(ADDR_FILE, addrs);
    res.json({ success: true, entry });
  },

  // WISHLIST (uses authenticated user from JWT)
  wishlist(req, res) {
    const userEmail = req.user.email;
    const list = read(WISH_FILE).filter(w => w.user === userEmail);
    res.json(list);
  },

  addWishlist(req, res) {
    const userEmail = req.user.email;
    const wl = read(WISH_FILE);
    const exists = wl.find(w => w.user === userEmail && w.product === req.body.product);

    if (!exists) wl.push({ id: Date.now(), user: userEmail, product: req.body.product });

    write(WISH_FILE, wl);
    res.json({ success: true });
  },

  removeWishlist(req, res) {
    const userEmail = req.user.email;
    let wl = read(WISH_FILE);
    wl = wl.filter(w => !(w.user === userEmail && w.product === req.body.product));
    write(WISH_FILE, wl);
    res.json({ success: true });
  },

  // REVIEWS (public - product reviews can be viewed by anyone)
  reviews(req, res) {
    const product = req.query.product;
    const list = read(REV_FILE).filter(r => r.product === product);
    res.json(list);
  },

  addReview(req, res) {
    const userEmail = req.user.email;
    const rv = read(REV_FILE);
    const entry = { 
      id: Date.now(), 
      date: new Date().toISOString(), 
      user: userEmail,
      product: req.body.product,
      rating: req.body.rating,
      text: req.body.text
    };
    rv.push(entry);
    write(REV_FILE, rv);
    res.json({ success: true, entry });
  }
};
