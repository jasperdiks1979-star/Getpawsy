#!/usr/bin/env node
const nodemailer = require("nodemailer");

const MAIL_HOST = process.env.MAIL_HOST || "smtp-mail.outlook.com";
const MAIL_PORT = parseInt(process.env.MAIL_PORT) || 587;
const MAIL_SECURE = process.env.MAIL_SECURE === "true";
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;
const MAIL_FROM = process.env.MAIL_FROM || `GetPawsy <${MAIL_USER}>`;
const RECIPIENT = process.argv[2] || "jasperdiks@hotmail.com";

if (!MAIL_USER || !MAIL_PASS) {
  console.error("ERROR: MAIL_USER and MAIL_PASS environment variables required");
  console.error("Set these in Replit Secrets panel");
  console.error("");
  console.error("Required secrets:");
  console.error("  MAIL_USER - Your Outlook email (e.g., getpawsyshop@outlook.com)");
  console.error("  MAIL_PASS - Your Outlook password");
  console.error("");
  console.error("Optional secrets:");
  console.error("  MAIL_HOST - SMTP host (default: smtp.office365.com)");
  console.error("  MAIL_PORT - SMTP port (default: 587)");
  console.error("  MAIL_FROM - From address (default: GetPawsy <MAIL_USER>)");
  process.exit(1);
}

console.log("=== GetPawsy SMTP Test (Outlook/Office365) ===");
console.log(`SMTP Host: ${MAIL_HOST}`);
console.log(`SMTP Port: ${MAIL_PORT}`);
console.log(`Secure: ${MAIL_SECURE}`);
console.log(`Mail User: ${MAIL_USER.substring(0, 5)}***`);
console.log(`Mail From: ${MAIL_FROM}`);
console.log(`Recipient: ${RECIPIENT}`);
console.log("");

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
  }
});

async function test() {
  console.log("1. Verifying SMTP connection...");
  try {
    await transporter.verify();
    console.log("   ✓ SMTP connection verified");
  } catch (err) {
    console.error(`   ✗ SMTP verify failed: ${err.message}`);
    console.error("");
    console.error("TROUBLESHOOTING:");
    console.error("- Ensure MAIL_USER is your full Outlook email address");
    console.error("- Ensure MAIL_PASS is your Outlook password");
    console.error("- For Office365/work accounts, you may need admin approval for SMTP");
    console.error("- Check if 2FA is enabled - you may need an app password");
    console.error("");
    console.error("Full error:", err.code, err.responseCode);
    process.exit(1);
  }

  console.log("");
  console.log("2. Sending test email...");
  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to: RECIPIENT,
      subject: "GetPawsy SMTP Test OK ✓",
      html: `
        <h1>GetPawsy SMTP Test Successful!</h1>
        <p>This test email confirms your Outlook mail configuration is working.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>SMTP Host:</strong> ${MAIL_HOST}</p>
        <p><strong>Mail User:</strong> ${MAIL_USER.substring(0, 5)}***</p>
        <p style="color: green; font-weight: bold;">✓ Email system is operational!</p>
      `
    });
    console.log(`   ✓ Email sent successfully`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log("");
    console.log("=== TEST PASSED ===");
    console.log(`Check ${RECIPIENT} inbox for the test email`);
  } catch (err) {
    console.error(`   ✗ Send failed: ${err.message}`);
    console.error("Full error:", err.code, err.responseCode);
    process.exit(1);
  }
}

test().catch(err => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
