const fs = require("fs");
const path = require("path");

const ORDERS_FILE = path.join(__dirname, "../../data/orders.json");
function readOrders() { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); }
function writeOrders(data) { fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2)); }

let lastOrderId = 10000;

module.exports = {
  submitOrder: async (req, res) => {
    const order = req.body;

    const orderId = ++lastOrderId;

    const fullOrder = {
      id: orderId,
      date: new Date().toISOString(),
      status: "Processing",
      ...order
    };

    const orders = readOrders();
    orders.push(fullOrder);
    writeOrders(orders);

    // Send order confirmation email
    if (order.contact && order.contact.email) {
      try {
        await fetch("http://localhost:5000/api/email/order-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: order.contact.email,
            order: fullOrder
          })
        });
      } catch (error) {
        console.error("Email send failed:", error.message);
      }
    }

    // Track order for recommendations
    if (order.contact && order.contact.email && order.items) {
      try {
        await fetch("http://localhost:5000/api/recommend/track/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: order.contact.email,
            items: order.items
          })
        });
      } catch (error) {
        console.error("Order tracking failed:", error.message);
      }
    }

    res.json(fullOrder);
  }
};
