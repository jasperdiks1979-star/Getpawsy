const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    console.warn("Could not load JSON:", filePath);
  }
  return [];
}

function getStats() {
  const productsPath = path.join(process.cwd(), "data", "products_cj.json");
  const ordersPath = path.join(process.cwd(), "data", "orders.json");
  const usersPath = path.join(process.cwd(), "data", "users.json");
  
  const productsData = loadJSON(productsPath);
  const products = productsData.products || productsData || [];
  const orders = loadJSON(ordersPath);
  const users = loadJSON(usersPath);
  
  return {
    products: Array.isArray(products) ? products.length : 0,
    orders: Array.isArray(orders) ? orders.length : 0,
    users: Array.isArray(users) ? users.length : 0
  };
}

router.get("/", (req, res) => {
  const stats = getStats();
  res.render("admin/dashboard", {
    title: "Admin Dashboard",
    active: "dashboard",
    pageTitle: "Dashboard",
    stats
  });
});

router.get("/products", (req, res) => {
  const productsPath = path.join(process.cwd(), "data", "products_cj.json");
  const productsData = loadJSON(productsPath);
  const products = productsData.products || productsData || [];
  
  res.render("admin/products", {
    title: "Products",
    active: "products",
    pageTitle: "Products",
    products
  });
});

router.get("/orders", (req, res) => {
  const ordersPath = path.join(process.cwd(), "data", "orders.json");
  const orders = loadJSON(ordersPath);
  
  res.render("admin/orders", {
    title: "Orders",
    active: "orders",
    pageTitle: "Orders",
    orders
  });
});

router.get("/users", (req, res) => {
  const usersPath = path.join(process.cwd(), "data", "users.json");
  const users = loadJSON(usersPath);
  
  res.render("admin/users", {
    title: "Users",
    active: "users",
    pageTitle: "Users",
    users
  });
});

router.get("/loyalty", (req, res) => {
  res.render("admin/loyalty", {
    title: "Loyalty Program",
    active: "loyalty",
    pageTitle: "Loyalty Program"
  });
});

router.get("/settings", (req, res) => {
  res.render("admin/settings", {
    title: "Settings",
    active: "settings",
    pageTitle: "Settings"
  });
});

router.get("/analytics", (req, res) => {
  res.render("admin/analytics", {
    title: "Analytics",
    active: "analytics",
    pageTitle: "Analytics"
  });
});

module.exports = router;
