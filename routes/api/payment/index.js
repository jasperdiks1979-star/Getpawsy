const fs = require("fs");
const path = require("path");

const PAY_FILE = path.join(__dirname, "../../../data/payments.json");

function readPayments() {
  return JSON.parse(fs.readFileSync(PAY_FILE, "utf8"));
}

function writePayments(data) {
  fs.writeFileSync(PAY_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  process: async (req, res) => {
    const { orderId, cardNumber, exp, cvc, amount, email } = req.body;

    const payments = readPayments();

    // Simuleer kans op mislukken
    const failChance = Math.random() < 0.05; // 5% kans op failure

    const entry = {
      id: Date.now(),
      orderId,
      amount,
      cardLast4: cardNumber.slice(-4),
      status: failChance ? "failed" : "success",
      timestamp: new Date().toISOString()
    };

    payments.push(entry);
    writePayments(payments);

    if (failChance) {
      return res.json({ success: false, message: "Payment could not be processed." });
    }

    // Send payment success email
    if (email) {
      try {
        await fetch("http://localhost:5000/api/email/payment-success", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            amount,
            tx: entry.id
          })
        });
      } catch (error) {
        console.error("Email send failed:", error.message);
      }
    }

    res.json({
      success: true,
      transactionId: entry.id
    });
  }
};
