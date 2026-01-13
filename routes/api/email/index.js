const fs = require("fs");
const path = require("path");
const transporter = require("./config.js");

const LOG_FILE = path.join(__dirname, "../../../data/email_logs.json");

function readLogs() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeLogs(data) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2));
}

async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: "GetPawsy <no-reply@getpawsy.pet>",
      to,
      subject,
      html
    });

    const logs = readLogs();
    logs.push({
      id: Date.now(),
      to,
      subject,
      timestamp: new Date().toISOString(),
      status: "sent"
    });
    writeLogs(logs);

    return { success: true, info };
  } catch (error) {
    console.error("Email error:", error.message);
    const logs = readLogs();
    logs.push({
      id: Date.now(),
      to,
      subject,
      timestamp: new Date().toISOString(),
      status: "failed",
      error: error.message
    });
    writeLogs(logs);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmail,

  orderConfirmation: async (req, res) => {
    const { email, order } = req.body;

    const html = `
      <h1>Your GetPawsy Order is Confirmed! 🐾</h1>
      <p>Order ID: <strong>${order.id}</strong></p>
      <p>Total: $${order.total.toFixed(2)}</p>
      <p>Estimated Delivery: 3-5 business days</p>
      <p>Thank you for supporting our small business!</p>
    `;

    const result = await sendEmail(email, "Your GetPawsy Order Confirmation", html);
    res.json(result);
  },

  paymentSuccess: async (req, res) => {
    const { email, amount, tx } = req.body;

    const html = `
      <h1>Payment Successful 💳</h1>
      <p>Amount: $${amount.toFixed(2)}</p>
      <p>Transaction ID: <strong>${tx}</strong></p>
      <p>Your order is being processed and will ship soon!</p>
    `;

    const result = await sendEmail(email, "Payment Successful — GetPawsy", html);
    res.json(result);
  },

  shippingUpdate: async (req, res) => {
    const { email, orderId, status } = req.body;

    const html = `
      <h1>Shipping Update 🚚</h1>
      <p>Your order <strong>#${orderId}</strong> is now:</p>
      <h2>${status}</h2>
      <p>Track your order on your account dashboard!</p>
    `;

    const result = await sendEmail(email, "Shipping Update — GetPawsy", html);
    res.json(result);
  },

  welcome: async (req, res) => {
    const { email, name } = req.body;

    const html = `
      <h1>Welcome to GetPawsy! 🐶🐱</h1>
      <p>Hi ${name || "Pet Lover"},</p>
      <p>Your account has been created successfully!</p>
      <p>Start browsing our amazing pet products now.</p>
    `;

    const result = await sendEmail(email, "Welcome to GetPawsy!", html);
    res.json(result);
  },

  resetPassword: async (req, res) => {
    const { email, link } = req.body;

    const html = `
      <h1>Reset Your Password</h1>
      <p>Click the link below to create a new password:</p>
      <a href="${link}">${link}</a>
      <p>This link expires in 24 hours.</p>
    `;

    const result = await sendEmail(email, "Password Reset Request", html);
    res.json(result);
  }

};
