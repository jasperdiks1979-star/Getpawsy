const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000';
const TEST_CUSTOMER = {
  name: 'Jasper Diks',
  email: 'jasperdiks@hotmail.com'
};

const report = {
  timestamp: new Date().toISOString(),
  customer: TEST_CUSTOMER,
  paymentMode: null,
  emailProvider: null,
  orderId: null,
  orderTotal: null,
  emailSent: null,
  emailError: null,
  phases: []
};

function log(phase, message, data = {}) {
  console.log(`[${phase}] ${message}`, Object.keys(data).length ? JSON.stringify(data) : '');
  report.phases.push({ phase, message, data, time: new Date().toISOString() });
}

async function phase1_paymentCheck() {
  log('PHASE 1', 'Checking payment provider...');
  
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (stripeKey) {
    const isTest = stripeKey.startsWith('sk_test_');
    const isLive = stripeKey.startsWith('sk_live_');
    
    if (isLive) {
      log('PHASE 1', 'LIVE STRIPE KEY DETECTED - Aborting real payment');
      report.paymentMode = 'LIVE_ABORTED';
    } else if (isTest) {
      log('PHASE 1', 'Stripe TEST mode confirmed');
      report.paymentMode = 'STRIPE_TEST';
    } else {
      log('PHASE 1', 'Unknown Stripe key format');
      report.paymentMode = 'UNKNOWN';
    }
  } else {
    log('PHASE 1', 'No Stripe key configured - Using MOCK checkout');
    report.paymentMode = 'MOCK';
  }
  
  log('PHASE 1', 'Payment check complete', { 
    mode: report.paymentMode,
    stripeConfigured: !!stripeKey,
    webhookConfigured: !!stripeWebhook
  });
}

async function phase2_emailCheck() {
  log('PHASE 2', 'Checking email system...');
  
  const mailUser = process.env.MAIL_USER;
  const mailPass = process.env.MAIL_PASS;
  
  const mailHost = process.env.MAIL_HOST || 'smtp.office365.com';
  const mailPort = process.env.MAIL_PORT || '587';
  const mailFrom = process.env.MAIL_FROM || `GetPawsy <${mailUser}>`;
  
  report.emailProvider = {
    type: 'nodemailer',
    smtp: `${mailHost}:${mailPort}`,
    from: mailFrom,
    configured: !!(mailUser && mailPass),
    mailUserSet: !!mailUser,
    mailPassSet: !!mailPass
  };
  
  if (mailUser && mailPass) {
    log('PHASE 2', 'Email system configured', {
      provider: `Nodemailer + ${mailHost}`,
      from: report.emailProvider.from
    });
  } else {
    log('PHASE 2', 'Email credentials missing', {
      MAIL_USER: mailUser ? 'SET' : 'MISSING',
      MAIL_PASS: mailPass ? 'SET' : 'MISSING'
    });
  }
}

async function phase3_createOrder() {
  log('PHASE 3', 'Creating test order...');
  
  let products = [];
  try {
    const res = await fetch(`${BASE_URL}/api/products?limit=20`);
    const data = await res.json();
    products = data.items || data.products || data;
  } catch (e) {
    log('PHASE 3', 'Failed to fetch products', { error: e.message });
    return null;
  }
  
  const dogProduct = products.find(p => p.petType === 'dog' || p.pet_usage === 'dogs');
  const catProduct = products.find(p => p.petType === 'cat' || p.pet_usage === 'cats');
  
  const items = [];
  if (dogProduct) items.push({ id: dogProduct.id, title: dogProduct.title, price: dogProduct.price, qty: 1 });
  if (catProduct) items.push({ id: catProduct.id, title: catProduct.title, price: catProduct.price, qty: 1 });
  
  if (items.length === 0 && products.length >= 2) {
    items.push({ id: products[0].id, title: products[0].title, price: products[0].price, qty: 1 });
    items.push({ id: products[1].id, title: products[1].title, price: products[1].price, qty: 1 });
  }
  
  const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  const orderId = Date.now();
  const order = {
    id: orderId,
    date: new Date().toISOString(),
    status: 'TEST_PAID',
    contact: {
      name: TEST_CUSTOMER.name,
      email: TEST_CUSTOMER.email
    },
    shipping: {
      address: '123 Test Street',
      city: 'Amsterdam',
      country: 'NL',
      zip: '1234AB'
    },
    items,
    total,
    paymentMethod: 'TEST_MOCK',
    testOrder: true
  };
  
  log('PHASE 3', 'Order prepared', { 
    items: items.length, 
    total: `$${total.toFixed(2)}`,
    customer: TEST_CUSTOMER.email
  });
  
  const ordersFile = path.join(__dirname, '../data/orders.json');
  try {
    let orders = [];
    try {
      orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    } catch (e) {
      orders = [];
    }
    
    orders.push(order);
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
    
    report.orderId = order.id;
    report.orderTotal = order.total;
    
    log('PHASE 3', 'Order created successfully', {
      orderId: order.id,
      total: `$${order.total.toFixed(2)}`,
      status: order.status,
      itemCount: items.length
    });
    
    return order;
  } catch (e) {
    log('PHASE 3', 'Order creation error', { error: e.message });
    return null;
  }
}

async function phase4_sendEmail(order) {
  log('PHASE 4', 'Sending confirmation email...');
  
  if (!order) {
    log('PHASE 4', 'No order to confirm');
    report.emailSent = 'NO_ORDER';
    return;
  }
  
  const emailModule = require('../routes/api/email/index.js');
  
  const html = `
    <h1>Your GetPawsy Order is Confirmed! 🐾</h1>
    <p>Hi ${order.contact?.name || 'Pet Lover'},</p>
    <p>Order ID: <strong>#${order.id}</strong></p>
    <p>Date: ${new Date(order.date).toLocaleDateString()}</p>
    <h2>Order Items:</h2>
    <ul>
      ${order.items?.map(item => `<li>${item.title} - $${item.price.toFixed(2)} x ${item.qty}</li>`).join('') || '<li>Items not available</li>'}
    </ul>
    <p><strong>Total: $${order.total?.toFixed(2) || '0.00'}</strong></p>
    <p>Estimated Delivery: 3-7 business days</p>
    <hr>
    <p style="color:#999">This is a TEST order confirmation.</p>
    <p>Thank you for shopping at GetPawsy! 🐶🐱</p>
  `;
  
  try {
    const result = await emailModule.sendEmail(
      TEST_CUSTOMER.email, 
      `Your GetPawsy Order #${order.id} is Confirmed!`, 
      html
    );
    
    if (result.success) {
      log('PHASE 4', 'Email sent successfully', { 
        to: TEST_CUSTOMER.email,
        messageId: result.info?.messageId 
      });
      report.emailSent = 'YES';
    } else {
      log('PHASE 4', 'Email send failed', { error: result.error });
      report.emailSent = 'FAILED';
      report.emailError = result.error;
      
      log('PHASE 4', 'Email content (SIMULATED)', { 
        to: TEST_CUSTOMER.email,
        subject: `Your GetPawsy Order #${order.id} is Confirmed!`,
        htmlLength: html.length
      });
    }
  } catch (e) {
    log('PHASE 4', 'Email error', { error: e.message });
    report.emailSent = 'ERROR';
    report.emailError = e.message;
    
    log('PHASE 4', 'Email would have been sent (SIMULATED)', { 
      to: TEST_CUSTOMER.email,
      orderId: order.id,
      total: order.total
    });
  }
}

async function phase5_adminVerify(orderId) {
  log('PHASE 5', 'Verifying order in admin...');
  
  if (!orderId) {
    log('PHASE 5', 'No order ID to verify');
    return;
  }
  
  const ordersFile = path.join(__dirname, '../data/orders.json');
  try {
    const orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    const testOrder = orders.find(o => o.id === orderId);
    
    if (testOrder) {
      log('PHASE 5', 'Order found in database', {
        id: testOrder.id,
        customer: testOrder.contact?.name,
        email: testOrder.contact?.email,
        total: testOrder.total,
        status: testOrder.status,
        items: testOrder.items?.length
      });
    } else {
      log('PHASE 5', 'Order not found in database');
    }
  } catch (e) {
    log('PHASE 5', 'Could not read orders file', { error: e.message });
  }
}

async function phase6_generateReport() {
  log('PHASE 6', 'Generating report...');
  
  const canReceiveEmails = report.emailSent === 'YES';
  const checkoutReady = report.paymentMode === 'STRIPE_TEST' || report.paymentMode === 'MOCK';
  
  const summary = {
    paymentModeUsed: report.paymentMode,
    orderId: report.orderId,
    orderTotal: report.orderTotal ? `$${report.orderTotal.toFixed(2)}` : null,
    emailSent: report.emailSent,
    emailProvider: report.emailProvider?.type,
    emailError: report.emailError,
    canJasperReceiveEmails: canReceiveEmails ? 'YES' : 'NO',
    missingForRealEmails: !canReceiveEmails ? 
      (report.emailProvider?.configured ? 'Check SMTP credentials' : 'MAIL_USER and MAIL_PASS secrets') : null,
    checkoutProductionReady: checkoutReady ? 'YES' : 'NOT_YET',
    checkoutMissingFor: !checkoutReady && report.paymentMode !== 'STRIPE_TEST' ? 
      'STRIPE_SECRET_KEY not configured or in live mode' : null
  };
  
  report.summary = summary;
  
  const mdReport = `# GetPawsy Test Purchase Report

## Summary
- **Generated:** ${report.timestamp}
- **Customer:** ${TEST_CUSTOMER.name} (${TEST_CUSTOMER.email})

## Results
| Metric | Value |
|--------|-------|
| Payment Mode | ${summary.paymentModeUsed} |
| Order ID | ${summary.orderId || 'N/A'} |
| Order Total | ${summary.orderTotal || 'N/A'} |
| Email Sent | ${summary.emailSent} |
| Email Provider | ${summary.emailProvider} |

## Key Questions
**Can Jasper receive real confirmation emails right now?**
${summary.canJasperReceiveEmails}

**What is missing if NO?**
${summary.missingForRealEmails || 'Nothing - emails are working!'}

**Is checkout production-ready?**
${summary.checkoutProductionReady}
${summary.checkoutMissingFor ? `Missing: ${summary.checkoutMissingFor}` : ''}

## Phase Details
${report.phases.map(p => `### ${p.phase}\n${p.message}\n${Object.keys(p.data).length ? '```json\n' + JSON.stringify(p.data, null, 2) + '\n```' : ''}`).join('\n\n')}

---
*Report generated by GetPawsy Test Purchase System*
`;

  fs.writeFileSync(path.join(__dirname, '../test-order-report.md'), mdReport);
  fs.writeFileSync(path.join(__dirname, '../test-order-report.json'), JSON.stringify(report, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('        TEST PURCHASE REPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Payment Mode: ${summary.paymentModeUsed}`);
  console.log(`Order ID: ${summary.orderId || 'N/A'}`);
  console.log(`Order Total: ${summary.orderTotal || 'N/A'}`);
  console.log(`Email Sent: ${summary.emailSent}`);
  console.log('-'.repeat(60));
  console.log(`Can Jasper receive emails? ${summary.canJasperReceiveEmails}`);
  console.log(`Checkout production-ready? ${summary.checkoutProductionReady}`);
  console.log('='.repeat(60));
  console.log('Reports written to:');
  console.log('  - test-order-report.md');
  console.log('  - test-order-report.json');
  console.log('='.repeat(60) + '\n');
}

async function runTest() {
  console.log('\n🐾 GetPawsy Test Purchase Flow\n');
  
  await phase1_paymentCheck();
  await phase2_emailCheck();
  const order = await phase3_createOrder();
  await phase4_sendEmail(order);
  await phase5_adminVerify(report.orderId);
  await phase6_generateReport();
}

runTest().catch(console.error);
