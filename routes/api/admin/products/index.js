const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../../../../data/products.json");

function read() { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
function write(data) { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }

module.exports = {

  list(req, res) {
    res.json(read());
  },

  get(req, res) {
    const id = parseInt(req.params.id);
    const product = read().find(p => p.id === id);
    res.json(product || {});
  },

  add(req, res) {
    const products = read();
    const newProduct = {
      id: Date.now(),
      title: req.body.title,
      price: req.body.price,
      stock: req.body.stock,
      category: req.body.category,
      description: req.body.description,
      tags: req.body.tags || [],
      sku: req.body.sku || ("SKU-" + Date.now()),
      images: req.body.images || []
    };
    products.push(newProduct);
    write(products);
    res.json({ success: true, product: newProduct });
  },

  update(req, res) {
    const products = read();
    const id = req.body.id;
    const p = products.find(pr => pr.id === id);

    if (!p) return res.json({ success: false });

    Object.assign(p, req.body);
    write(products);

    res.json({ success: true, product: p });
  },

  delete(req, res) {
    let products = read();
    products = products.filter(p => p.id !== req.body.id);
    write(products);
    res.json({ success: true });
  }

};
