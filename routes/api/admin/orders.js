const fs = require("fs");
const path = require("path");

const ORDERS_FILE = path.join(__dirname, "../../../data/orders.json");
function readOrders() { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); }
function writeOrders(data) { fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2)); }

module.exports = {

  list: (req, res) => {
    res.json(readOrders());
  },

  get: (req, res) => {
    const id = parseInt(req.params.id);
    const order = readOrders().find(o => o.id === id);
    res.json(order || {});
  },

  updateStatus: async (req, res) => {
    const { id, status } = req.body;
    const orders = readOrders();
    const order = orders.find(o => o.id === id);

    if (order) order.status = status;
    writeOrders(orders);

    // Send shipping update email
    if (order && order.contact && order.contact.email) {
      try {
        await fetch("http://localhost:5000/api/email/shipping-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: order.contact.email,
            orderId: order.id,
            status
          })
        });
      } catch (error) {
        console.error("Email send failed:", error.message);
      }
    }

    res.json({ success: true, order });
  }

};
