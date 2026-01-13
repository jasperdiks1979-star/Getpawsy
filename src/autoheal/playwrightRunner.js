const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { saveReport, getScreenshotsDir, saveLastRunTime } = require('./storage');
const { AUTOHEAL_CONFIG } = require('./types');

async function runPlaywrightTests(options = {}) {
  const { timeout = 120000 } = options;
  
  const baseUrl = AUTOHEAL_CONFIG.PLAYWRIGHT_BASE_URL;
  const screenshotsDir = getScreenshotsDir();
  
  const oldScreenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'));
  oldScreenshots.forEach(f => {
    try { fs.unlinkSync(path.join(screenshotsDir, f)); } catch (e) {}
  });

  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const env = {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseUrl,
      AUTOHEAL_SCREENSHOTS_DIR: screenshotsDir
    };

    const testFile = path.join(process.cwd(), 'tests', 'autoheal.spec.js');
    
    if (!fs.existsSync(testFile)) {
      resolve({
        ok: false,
        error: 'Test file not found: tests/autoheal.spec.js',
        duration: 0,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const cmd = `npx playwright test tests/autoheal.spec.js --reporter=json --output=${screenshotsDir}`;
    
    exec(cmd, { env, timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      
      let results = null;
      try {
        const lines = stdout.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.suites || parsed.stats) {
              results = parsed;
              break;
            }
          } catch (e) {}
        }
      } catch (e) {
        console.error('[PlaywrightRunner] Failed to parse results:', e.message);
      }

      const screenshots = fs.readdirSync(screenshotsDir)
        .filter(f => f.endsWith('.png'))
        .map(f => `/api/admin/autoheal/screenshot/${f}`);

      let tests = [];
      let passed = 0;
      let failed = 0;
      let failedTests = [];

      if (results && results.suites) {
        function extractTests(suites) {
          for (const suite of suites) {
            if (suite.specs) {
              for (const spec of suite.specs) {
                for (const test of spec.tests || []) {
                  const status = test.status || test.results?.[0]?.status || 'unknown';
                  const testInfo = {
                    title: spec.title,
                    status,
                    duration: test.results?.[0]?.duration || 0
                  };
                  tests.push(testInfo);
                  if (status === 'passed' || status === 'expected') passed++;
                  else {
                    failed++;
                    failedTests.push({
                      ...testInfo,
                      error: test.results?.[0]?.error?.message || 'Unknown error'
                    });
                  }
                }
              }
            }
            if (suite.suites) extractTests(suite.suites);
          }
        }
        extractTests(results.suites);
      }

      const report = {
        ok: failed === 0 && !error,
        timestamp: new Date().toISOString(),
        duration,
        summary: {
          total: tests.length,
          passed,
          failed,
          passed: failed === 0
        },
        tests,
        failedTests,
        screenshots,
        baseUrl,
        rawError: error ? error.message : null,
        stderr: stderr?.substring(0, 2000) || null
      };

      saveReport(report);
      saveLastRunTime();

      resolve(report);
    });
  });
}

module.exports = {
  runPlaywrightTests
};
