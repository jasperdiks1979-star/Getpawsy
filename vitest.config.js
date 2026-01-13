const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    reporters: ['verbose', 'json'],
    outputFile: 'tests/vitest-results.json',
    env: {
      BASE_URL: 'http://localhost:5000'
    }
  },
});
