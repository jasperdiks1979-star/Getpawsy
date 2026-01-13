const nodemailer = require('nodemailer');
const { logAlert, markAlertNotified } = require('./db');
const { getMetricsSummary } = require('./telemetry');

const THRESHOLDS = {
  cart_success_rate: { min: 0.8, windowMinutes: 30, minEvents: 20 },
  pdp_not_found_rate: { max: 5, windowMinutes: 60 },
  image_failure_rate: { max: 10, windowMinutes: 60 }
};

function isAlertsEnabled() {
  return process.env.ALERTS_ENABLED === 'true';
}

async function sendSlackAlert(payload) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: 'SLACK_WEBHOOK_URL not set' };
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:warning: *GetPawsy Auto-Healer Alert*`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `Auto-Healer Alert: ${payload.type}`, emoji: true }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Severity:*\n${payload.severity}` },
              { type: 'mrkdwn', text: `*Threshold Breached:*\n${payload.thresholdName}` },
              { type: 'mrkdwn', text: `*Current Value:*\n${payload.currentValue}` },
              { type: 'mrkdwn', text: `*Expected:*\n${payload.expectedValue}` }
            ]
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Detected at ${new Date().toISOString()}` }
            ]
          }
        ]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Slack responded with ${response.status}`);
    }
    
    return { sent: true };
  } catch (error) {
    console.error('[Alerts] Slack notification failed:', error.message);
    return { sent: false, error: error.message };
  }
}

async function sendEmailAlert(payload) {
  const mailUser = process.env.MAIL_USER;
  const mailPass = process.env.MAIL_PASS;
  const alertEmailTo = process.env.ALERT_EMAIL_TO;
  
  if (!mailUser || !mailPass || !alertEmailTo) {
    return { sent: false, reason: 'SMTP credentials or ALERT_EMAIL_TO not set' };
  }
  
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: mailUser, pass: mailPass }
    });
    
    await transporter.sendMail({
      from: mailUser,
      to: alertEmailTo,
      subject: `[GetPawsy Alert] ${payload.type} - ${payload.severity}`,
      html: `
        <h2>Auto-Healer Alert: ${payload.type}</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Severity</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${payload.severity}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Threshold</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${payload.thresholdName}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Current Value</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${payload.currentValue}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Expected</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${payload.expectedValue}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Time</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${new Date().toISOString()}</td></tr>
        </table>
        <p style="margin-top: 20px; color: #666;">This is an automated alert from GetPawsy Auto-Healer.</p>
      `
    });
    
    return { sent: true };
  } catch (error) {
    console.error('[Alerts] Email notification failed:', error.message);
    return { sent: false, error: error.message };
  }
}

async function evaluateThresholds() {
  if (!isAlertsEnabled()) {
    return { evaluated: false, reason: 'Alerts disabled' };
  }
  
  const summary = getMetricsSummary(1);
  const alerts = [];
  
  const cartClicks = summary.metrics?.add_to_cart_clicked?.count || 0;
  const cartSuccess = summary.metrics?.add_to_cart_ok?.count || 0;
  
  if (cartClicks >= THRESHOLDS.cart_success_rate.minEvents) {
    const cartSuccessRate = cartClicks > 0 ? cartSuccess / cartClicks : 1;
    
    if (cartSuccessRate < THRESHOLDS.cart_success_rate.min) {
      alerts.push({
        type: 'cart_success_rate_low',
        severity: 'critical',
        thresholdName: 'Cart Success Rate',
        currentValue: `${(cartSuccessRate * 100).toFixed(1)}%`,
        expectedValue: `>= ${THRESHOLDS.cart_success_rate.min * 100}%`,
        rawValue: cartSuccessRate
      });
    }
  }
  
  const pdpNotFound = summary.metrics?.pdp_not_found?.count || 0;
  if (pdpNotFound > THRESHOLDS.pdp_not_found_rate.max) {
    alerts.push({
      type: 'pdp_not_found_high',
      severity: 'warn',
      thresholdName: 'PDP Not Found Count',
      currentValue: pdpNotFound,
      expectedValue: `<= ${THRESHOLDS.pdp_not_found_rate.max}/hour`,
      rawValue: pdpNotFound
    });
  }
  
  const imageFailures = summary.metrics?.image_render_failed?.count || 0;
  if (imageFailures > THRESHOLDS.image_failure_rate.max) {
    alerts.push({
      type: 'image_failures_high',
      severity: 'warn',
      thresholdName: 'Image Render Failures',
      currentValue: imageFailures,
      expectedValue: `<= ${THRESHOLDS.image_failure_rate.max}/hour`,
      rawValue: imageFailures
    });
  }
  
  const results = [];
  
  for (const alert of alerts) {
    try {
      const dbAlert = await logAlert({
        type: alert.type,
        severity: alert.severity,
        payload: alert
      });
      
      const slackResult = await sendSlackAlert(alert);
      if (slackResult.sent) {
        await markAlertNotified(dbAlert.id, 'slack');
      }
      
      const emailResult = await sendEmailAlert(alert);
      if (emailResult.sent) {
        await markAlertNotified(dbAlert.id, 'email');
      }
      
      results.push({
        ...alert,
        alertId: dbAlert.id,
        slack: slackResult,
        email: emailResult
      });
    } catch (error) {
      console.error('[Alerts] Failed to process alert:', error.message);
      results.push({
        ...alert,
        error: error.message
      });
    }
  }
  
  return {
    evaluated: true,
    timestamp: new Date().toISOString(),
    alerts: results
  };
}

let alertInterval = null;

function startAlertScheduler(intervalMs = 5 * 60 * 1000) {
  if (alertInterval) {
    clearInterval(alertInterval);
  }
  
  alertInterval = setInterval(async () => {
    try {
      const result = await evaluateThresholds();
      if (result.alerts && result.alerts.length > 0) {
        console.log(`[Alerts] Triggered ${result.alerts.length} alert(s)`);
      }
    } catch (error) {
      console.error('[Alerts] Scheduler error:', error.message);
    }
  }, intervalMs);
  
  console.log(`[Alerts] Scheduler started (interval: ${intervalMs / 1000}s)`);
}

function stopAlertScheduler() {
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
    console.log('[Alerts] Scheduler stopped');
  }
}

module.exports = {
  isAlertsEnabled,
  evaluateThresholds,
  sendSlackAlert,
  sendEmailAlert,
  startAlertScheduler,
  stopAlertScheduler,
  THRESHOLDS
};
