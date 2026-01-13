const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database(":memory:");

// Initialize database synchronously
db.configure("busyTimeout", 10000);

// Create tables and seed data
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      price REAL,
      category TEXT,
      image TEXT,
      description TEXT
    );
  `);

  const seed = db.prepare(
    "INSERT INTO products (name, price, category, image, description) VALUES (?,?,?,?,?)"
  );

  for (let i = 1; i <= 20; i++) {
    seed.run(
      `Pet Toy ${i}`,
      (Math.random() * 20 + 5).toFixed(2),
      "dog",
      `/images/products/product${i > 12 ? (i % 12 || 12) : i}.jpg`,
      "A wonderful pet product!"
    );
  }

  seed.finalize();
});

module.exports = db;
