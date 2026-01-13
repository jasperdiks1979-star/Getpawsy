const fs = require('fs');
const path = require('path');

const resultsFile = path.join(__dirname, '../qa-results.json');
const reportFile = path.join(__dirname, '../qa-report.md');

if (!fs.existsSync(resultsFile)) {
  console.log('No QA results found. Run `npm run qa:full` first.');
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

console.log('\n' + '='.repeat(60));
console.log('        GETPAWSY QA REPORT');
console.log('='.repeat(60));
console.log(`\nGenerated: ${results.timestamp}`);
console.log(`Base URL: ${results.baseUrl}`);
console.log(`\nStatus: ${results.summary.status}`);
console.log(`Pass Rate: ${results.summary.passRate}`);
console.log(`\nTests: ${results.summary.passed}/${results.summary.total} passed`);
console.log(`Failures: ${results.summary.failed}`);

if (results.summary.failed > 0) {
  console.log('\n⚠️ Some tests failed. Check tests/qa-report.md for details.');
} else {
  console.log('\n✅ All tests passed!');
}

console.log('\n' + '='.repeat(60));

if (fs.existsSync(reportFile)) {
  console.log('\nFull report available at: tests/qa-report.md');
}
