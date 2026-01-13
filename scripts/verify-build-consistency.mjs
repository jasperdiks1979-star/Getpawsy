#!/usr/bin/env node
/**
 * verify-build-consistency.mjs
 * Ensures HTML and API serve the same BUILD_ID
 * Exits with code 1 if they differ (blocks deploy)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function fetchWithTimeout(url, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       BUILD CONSISTENCY VERIFICATION                   ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  
  let htmlBuildId = null;
  let apiBuildId = null;
  
  try {
    const htmlResponse = await fetchWithTimeout(`${BASE_URL}/`);
    const html = await htmlResponse.text();
    const htmlMatch = html.match(/Build:\s*([a-z0-9]+)\s*\|/i);
    htmlBuildId = htmlMatch ? htmlMatch[1] : null;
    console.log(`📄 HTML Build ID: ${htmlBuildId || 'NOT FOUND'}`);
  } catch (err) {
    console.error(`❌ Failed to fetch HTML: ${err.message}`);
    process.exit(1);
  }
  
  try {
    const apiResponse = await fetchWithTimeout(`${BASE_URL}/api/version`);
    const apiData = await apiResponse.json();
    apiBuildId = apiData.build_id;
    console.log(`🔌 API Build ID:  ${apiBuildId || 'NOT FOUND'}`);
  } catch (err) {
    console.error(`❌ Failed to fetch API version: ${err.message}`);
    process.exit(1);
  }
  
  console.log('');
  
  if (!htmlBuildId || !apiBuildId) {
    console.error('❌ BUILD CONSISTENCY CHECK FAILED');
    console.error('   Could not extract build ID from one or both sources');
    process.exit(1);
  }
  
  if (htmlBuildId !== apiBuildId) {
    console.error('❌ BUILD CONSISTENCY CHECK FAILED');
    console.error(`   HTML shows: ${htmlBuildId}`);
    console.error(`   API shows:  ${apiBuildId}`);
    console.error('');
    console.error('   This indicates TWO SERVERS are running!');
    console.error('   Fix: Ensure only server.js serves both HTML and API.');
    process.exit(1);
  }
  
  console.log('✅ BUILD CONSISTENCY CHECK PASSED');
  console.log(`   Both HTML and API show: ${htmlBuildId}`);
  process.exit(0);
}

main().catch(err => {
  console.error(`❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
