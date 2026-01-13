const fs = require('fs');
const path = require('path');
const { loadReport, loadLastRunTime } = require('./storage');

const metricsStore = {
  cartAddFailures: [],
  cartRenderFailures: [],
  productNotFound: [],
  image404s: {}
};

function recordMetric(type, data) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  
  if (type === 'cart_add_failure') {
    metricsStore.cartAddFailures.push({ ts: now, ...data });
    metricsStore.cartAddFailures = metricsStore.cartAddFailures.filter(m => m.ts > hourAgo);
  } else if (type === 'cart_render_failure') {
    metricsStore.cartRenderFailures.push({ ts: now, ...data });
    metricsStore.cartRenderFailures = metricsStore.cartRenderFailures.filter(m => m.ts > hourAgo);
  } else if (type === 'product_not_found') {
    metricsStore.productNotFound.push({ ts: now, ...data });
    metricsStore.productNotFound = metricsStore.productNotFound.filter(m => m.ts > hourAgo);
  } else if (type === 'image_404') {
    const domain = data.domain || 'unknown';
    metricsStore.image404s[domain] = (metricsStore.image404s[domain] || 0) + 1;
  }
}

function getMetrics() {
  return {
    cartAddFailures_1h: metricsStore.cartAddFailures.length,
    cartRenderFailures_1h: metricsStore.cartRenderFailures.length,
    productNotFound_1h: metricsStore.productNotFound.length,
    top404Domains: Object.entries(metricsStore.image404s)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }))
  };
}

async function collectDiagnostics() {
  const version = require('../../version.json');
  const uptime = process.uptime();
  
  let dbConnected = false;
  try {
    const db = require('../db');
    if (db && db.pool) {
      const client = await db.pool.connect();
      client.release();
      dbConnected = true;
    }
  } catch (e) {
    dbConnected = false;
  }

  let products = { total: 0, approved: 0, blocked: 0, notPetApproved: 0, missingImages: 0, placeholderImages: 0 };
  try {
    const catalogPath = path.join(process.cwd(), 'data', 'catalog.json');
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      const prods = catalog.products || [];
      products.total = prods.length;
      products.approved = prods.filter(p => p.active !== false && p.is_pet_product !== false).length;
      products.blocked = prods.filter(p => p.blocked === true || p.nsfw === true).length;
      products.notPetApproved = prods.filter(p => p.is_pet_product === false).length;
      products.missingImages = prods.filter(p => !p.resolved_image && (!p.images || p.images.length === 0)).length;
      products.placeholderImages = prods.filter(p => 
        p.resolved_image === '/images/placeholder-product.svg' || 
        (p.primaryImageUrl && p.primaryImageUrl.includes('placeholder'))
      ).length;
    }
  } catch (e) {
    console.error('[Diagnostics] Failed to load catalog:', e.message);
  }

  const lastRun = loadLastRunTime();
  const lastReport = loadReport();
  
  const metrics = getMetrics();

  return {
    ok: true,
    version: version.version || 'unknown',
    uptime: Math.floor(uptime),
    uptimeFormatted: `${Math.floor(uptime / 60)} minutes`,
    timestamp: new Date().toISOString(),
    env: {
      deploymentMode: !!process.env.REPLIT_DEPLOYMENT,
      nodeEnv: process.env.NODE_ENV || 'development',
      jobsEnabled: process.env.ENABLE_BACKGROUND_JOBS === 'True',
      safeMode: process.env.SAFE_MODE === 'true',
      autohealEnabled: process.env.AUTOHEAL_ENABLED !== 'false'
    },
    db: {
      connected: dbConnected
    },
    products,
    cart: {
      lastAddToCartFailures_1h: metrics.cartAddFailures_1h,
      lastCartRenderFailures_1h: metrics.cartRenderFailures_1h
    },
    pdp: {
      productNotFound_1h: metrics.productNotFound_1h
    },
    images: {
      top404Domains: metrics.top404Domains
    },
    lastAutoheal: {
      ranAt: lastRun?.ranAt || null,
      status: lastReport ? (lastReport.summary?.passed ? 'pass' : 'fail') : 'never_run',
      reportExists: !!lastReport
    }
  };
}

module.exports = {
  collectDiagnostics,
  recordMetric,
  getMetrics
};
