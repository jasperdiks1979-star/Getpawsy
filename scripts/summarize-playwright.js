const fs = require('fs');
const path = require('path');

function safeReadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function main() {
  const rawPath = path.join(process.cwd(), 'test-results', 'results-raw.json');
  const raw = safeReadJson(rawPath);

  const summary = {
    generatedAt: new Date().toISOString(),
    rawReport: fs.existsSync(rawPath) ? 'test-results/results-raw.json' : null,
    tests: [],
  };

  if (raw && raw.suites) {
    const walk = (suite, projectName = null) => {
      if (suite.specs) {
        for (const spec of suite.specs) {
          for (const t of spec.tests || []) {
            const result = (t.results && t.results[0]) || {};
            summary.tests.push({
              project: t.projectName || projectName || null,
              title: `${spec.title}`,
              file: spec.file,
              status: result.status || 'unknown',
              durationMs: result.duration || null,
              error: result.error ? (result.error.message || String(result.error)) : null,
            });
          }
        }
      }
      for (const s of suite.suites || []) walk(s, projectName);
    };
    for (const s of raw.suites) walk(s);
  }

  writeFile(path.join(process.cwd(), 'results.json'), JSON.stringify(summary, null, 2));

  const lines = [];
  lines.push('================================================================================');
  lines.push('GetPawsy — Verification Report (Playwright Visual E2E)');
  lines.push('================================================================================');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push('');
  lines.push('ARTIFACTS:');
  lines.push('- HTML report: playwright-report/');
  lines.push('- Raw JSON: test-results/results-raw.json');
  lines.push('- Screenshots: test-results/screenshots/');
  lines.push('- Videos/Traces: test-results/ (per test output)');
  lines.push('- Summary JSON: results.json');
  lines.push('');
  lines.push('TEST SUMMARY:');
  lines.push('--------------------------------------------------------------------------------');
  
  if (summary.tests.length === 0) {
    lines.push('(No tests found in raw report. Check if Playwright run succeeded.)');
  } else {
    let passed = 0, failed = 0;
    for (const t of summary.tests) {
      const icon = t.status === 'passed' ? '[PASS]' : t.status === 'failed' ? '[FAIL]' : '[????]';
      if (t.status === 'passed') passed++;
      if (t.status === 'failed') failed++;
      lines.push(`${icon} ${t.project || 'unknown'} | ${t.title}`);
      if (t.error) {
        lines.push(`       Error: ${t.error.slice(0, 200)}`);
      }
    }
    lines.push('');
    lines.push('--------------------------------------------------------------------------------');
    lines.push(`TOTAL: ${passed} passed, ${failed} failed, ${summary.tests.length} total`);
  }
  
  lines.push('================================================================================');

  writeFile(path.join(process.cwd(), 'verification-report.txt'), lines.join('\n'));

  console.log('Summary generated:');
  console.log('  - results.json');
  console.log('  - verification-report.txt');
}

main();
