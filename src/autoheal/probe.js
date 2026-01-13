const fs = require('fs');
const path = require('path');
const { getScreenshotsDir, ensureDir, AUTOHEAL_DIR } = require('./storage');

const PROBE_RESULTS_FILE = path.join(AUTOHEAL_DIR, 'probe-results.json');

function isPlaywrightAvailable() {
  try {
    require.resolve('playwright');
    return true;
  } catch (e) {
    return false;
  }
}

async function runFetchProbe(baseUrl = 'http://localhost:5000') {
  const results = {
    ok: true,
    timestamp: new Date().toISOString(),
    baseUrl,
    mode: 'synthetic_fetch',
    message: 'Playwright unavailable — synthetic E2E used',
    checks: [],
    summary: { passed: 0, failed: 0, total: 0 },
    metrics: {}
  };

  const check = (name, passed, value = null) => {
    results.checks.push({ name, passed, value });
    if (passed) results.summary.passed++;
    else results.summary.failed++;
    results.summary.total++;
    return passed;
  };

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    check('api_health', healthRes.status === 200, `status: ${healthRes.status}`);
  } catch (e) {
    check('api_health', false, e.message);
    results.ok = false;
    saveProbeResults(results);
    return results;
  }

  try {
    const productsRes = await fetch(`${baseUrl}/api/products?limit=12`);
    const productsData = await productsRes.json();
    const products = productsData.products || productsData;
    const hasValidProducts = Array.isArray(products) && products.length > 0 &&
      products.every(p => p.id && p.title && p.price !== undefined);
    check('api_products', hasValidProducts, `count: ${products?.length || 0}`);
    
    if (hasValidProducts) {
      const withImages = products.filter(p => p.resolved_image || p.image || (p.images && p.images.length));
      results.metrics.imageRate = Math.round((withImages.length / products.length) * 100);
      check('products_have_images', withImages.length >= products.length * 0.8, `${withImages.length}/${products.length}`);
    }
  } catch (e) {
    check('api_products', false, e.message);
  }

  try {
    const cartRes = await fetch(`${baseUrl}/api/cart/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'test-probe', sku: 'test', qty: 1 })
    });
    check('api_cart_add', cartRes.status === 200 || cartRes.status === 201, `status: ${cartRes.status}`);
  } catch (e) {
    check('api_cart_add', false, e.message);
  }

  try {
    const diagnosticsRes = await fetch(`${baseUrl}/api/health/diagnostics`);
    const diag = await diagnosticsRes.json();
    check('diagnostics_available', diag && diag.products !== undefined, 
      diag ? `products: ${diag.products?.total}` : 'no data');
  } catch (e) {
    check('diagnostics_available', false, e.message);
  }

  results.ok = results.summary.failed === 0;
  saveProbeResults(results);
  return results;
}

async function runSyntheticProbe(options = {}) {
  const { 
    baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5000',
    timeout = 30000,
    forceFetch = false
  } = options;

  const isDeploy = process.env.REPLIT_DEPLOYMENT === '1';
  if (isDeploy || forceFetch || !isPlaywrightAvailable()) {
    console.log('[Probe] Using fetch-based synthetic E2E (Playwright unavailable or deployment mode)');
    return runFetchProbe(baseUrl);
  }
  
  const results = {
    ok: true,
    timestamp: new Date().toISOString(),
    baseUrl,
    mode: 'playwright',
    checks: [],
    summary: {
      passed: 0,
      failed: 0,
      total: 0
    },
    metrics: {
      imageLoadRate: null,
      cartFunctional: null,
      homepageLoadTime: null
    }
  };

  let browser = null;
  let page = null;

  try {
    const { chromium } = require('playwright');
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'GetPawsy-Probe/1.0'
    });
    
    page = await context.newPage();
    
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });
    
    const startTime = Date.now();
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout });
    results.metrics.homepageLoadTime = Date.now() - startTime;
    
    results.checks.push({
      name: 'homepage_load',
      passed: true,
      duration: results.metrics.homepageLoadTime
    });
    results.summary.passed++;
    results.summary.total++;
    
    const title = await page.title();
    const hasTitle = title && title.length > 0;
    results.checks.push({
      name: 'homepage_has_title',
      passed: hasTitle,
      value: title
    });
    if (hasTitle) results.summary.passed++;
    else results.summary.failed++;
    results.summary.total++;
    
    await page.waitForTimeout(1000);
    
    const images = await page.$$eval('img', imgs => 
      imgs.map(img => ({
        src: img.src,
        loaded: img.complete && img.naturalWidth > 0,
        width: img.naturalWidth,
        height: img.naturalHeight
      }))
    );
    
    const loadedImages = images.filter(i => i.loaded).length;
    const totalImages = images.length;
    results.metrics.imageLoadRate = totalImages > 0 
      ? Math.round((loadedImages / totalImages) * 100) 
      : 100;
    
    const imageCheckPassed = results.metrics.imageLoadRate >= 80;
    results.checks.push({
      name: 'image_load_rate',
      passed: imageCheckPassed,
      value: `${results.metrics.imageLoadRate}%`,
      details: { loaded: loadedImages, total: totalImages }
    });
    if (imageCheckPassed) results.summary.passed++;
    else results.summary.failed++;
    results.summary.total++;
    
    const productLink = await page.$('a[href*="/product/"]');
    if (productLink) {
      await productLink.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      
      const onProductPage = page.url().includes('/product/');
      results.checks.push({
        name: 'product_page_navigation',
        passed: onProductPage,
        value: page.url()
      });
      if (onProductPage) results.summary.passed++;
      else results.summary.failed++;
      results.summary.total++;
      
      await page.waitForTimeout(500);
      
      const addToCartBtn = await page.$('[data-add], button:has-text("Add to Cart"), .add-to-cart-btn');
      if (addToCartBtn) {
        await addToCartBtn.click();
        await page.waitForTimeout(1500);
        
        const cartBadge = await page.$('.cart-badge, [data-cart-count]');
        let cartCount = 0;
        
        if (cartBadge) {
          const countText = await cartBadge.textContent();
          cartCount = parseInt(countText, 10) || 0;
        }
        
        const cartWorking = cartCount > 0;
        results.metrics.cartFunctional = cartWorking;
        
        results.checks.push({
          name: 'add_to_cart',
          passed: cartWorking,
          value: `Cart count: ${cartCount}`
        });
        if (cartWorking) results.summary.passed++;
        else results.summary.failed++;
        results.summary.total++;
        
        const cartDrawer = await page.$('.cart-drawer, #cart-drawer, [data-cart-drawer]');
        if (cartDrawer) {
          const isVisible = await cartDrawer.isVisible();
          results.checks.push({
            name: 'cart_drawer_visible',
            passed: isVisible,
            value: isVisible ? 'visible' : 'hidden'
          });
          if (isVisible) results.summary.passed++;
          else results.summary.failed++;
          results.summary.total++;
        }
      } else {
        results.checks.push({
          name: 'add_to_cart',
          passed: false,
          value: 'Add to cart button not found'
        });
        results.summary.failed++;
        results.summary.total++;
      }
    } else {
      results.checks.push({
        name: 'product_page_navigation',
        passed: false,
        value: 'No product links found on homepage'
      });
      results.summary.failed++;
      results.summary.total++;
    }
    
    const screenshotsDir = getScreenshotsDir();
    const screenshotPath = path.join(screenshotsDir, `probe-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    results.screenshot = `/api/admin/autoheal/screenshot/probe-${Date.now()}.png`;
    
    results.consoleErrors = consoleMessages
      .filter(m => m.type === 'error')
      .slice(0, 10);
    
  } catch (error) {
    results.ok = false;
    results.error = error.message;
    results.checks.push({
      name: 'probe_execution',
      passed: false,
      error: error.message
    });
    results.summary.failed++;
    results.summary.total++;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
  
  results.ok = results.summary.failed === 0;
  
  saveProbeResults(results);
  
  return results;
}

function saveProbeResults(results) {
  try {
    ensureDir(AUTOHEAL_DIR);
    fs.writeFileSync(PROBE_RESULTS_FILE, JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('[Probe] Failed to save results:', err.message);
  }
}

function loadProbeResults() {
  try {
    if (fs.existsSync(PROBE_RESULTS_FILE)) {
      return JSON.parse(fs.readFileSync(PROBE_RESULTS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[Probe] Failed to load results:', err.message);
  }
  return null;
}

module.exports = {
  runSyntheticProbe,
  runFetchProbe,
  isPlaywrightAvailable,
  loadProbeResults,
  saveProbeResults,
  PROBE_RESULTS_FILE
};
