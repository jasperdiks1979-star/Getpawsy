const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../../../data/products.json");

function readProducts() {
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

module.exports = {

  query(req, res) {
    const q = (req.query.q || "").toLowerCase();
    const min = Number(req.query.min || 0);
    const max = Number(req.query.max || Infinity);
    const cat = req.query.cat || "all";
    const sort = req.query.sort || "relevance";

    let p = readProducts();

    // TEXT SEARCH
    if (q.length > 0) {
      p = p.filter(prod =>
        prod.title.toLowerCase().includes(q) ||
        prod.description.toLowerCase().includes(q) ||
        prod.tags.join(" ").toLowerCase().includes(q)
      );
    }

    // PRICE FILTER
    p = p.filter(prod => prod.price >= min && prod.price <= max);

    // CATEGORY FILTER
    if (cat !== "all") {
      p = p.filter(prod => prod.category.toLowerCase() === cat.toLowerCase());
    }

    // SORTING
    if (sort === "price_low") p.sort((a,b) => a.price - b.price);
    if (sort === "price_high") p.sort((a,b) => b.price - a.price);
    if (sort === "recent") p.sort((a,b) => b.id - a.id);
    if (sort === "alpha") p.sort((a,b) => a.title.localeCompare(b.title));

    res.json(p);
  },

  suggest(req, res) {
    const q = (req.query.q || "").toLowerCase();
    const p = readProducts();

    const matches = p
      .filter(prod => prod.title.toLowerCase().includes(q))
      .slice(0, 10)
      .map(x => x.title);

    res.json(matches);
  }

};
