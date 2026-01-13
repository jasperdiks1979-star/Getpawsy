const nodemailer = require("nodemailer");

const MAIL_HOST = process.env.MAIL_HOST || "smtp-mail.outlook.com";
const MAIL_PORT = parseInt(process.env.MAIL_PORT) || 587;
const MAIL_SECURE = process.env.MAIL_SECURE === "true";
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;
const MAIL_FROM = process.env.MAIL_FROM || `GetPawsy <${MAIL_USER}>`;

const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: MAIL_SECURE,
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS
  },
  tls: {
    ciphers: "SSLv3",
    rejectUnauthorized: false
  },
  requireTLS: true
});

transporter.mailConfig = {
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: MAIL_SECURE,
  user: MAIL_USER ? `${MAIL_USER.substring(0, 5)}***` : "NOT SET",
  from: MAIL_FROM,
  configured: !!(MAIL_USER && MAIL_PASS)
};

module.exports = transporter;
