#!/usr/bin/env node

const { runMirrorJob, getMediaStats } = require('../src/mirrorJob');

async function main() {
  console.log('=== GetPawsy Media Mirror Job ===');
  console.log('Starting full media mirror...\n');

  const args = process.argv.slice(2);
  const options = {
    skipExisting: !args.includes('--force'),
    includeVideos: args.includes('--videos'),
    limit: null
  };

  const limitArg = args.find(a => a.startsWith('--limit='));
  if (limitArg) {
    options.limit = parseInt(limitArg.split('=')[1], 10);
  }

  console.log('Options:', options);
  console.log('');

  const startTime = Date.now();
  
  try {
    const result = await runMirrorJob(options);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n=== Mirror Job Complete ===');
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${duration}s`);
    console.log('');
    console.log('Progress:');
    console.log(`  Total products: ${result.progress.total}`);
    console.log(`  Processed: ${result.progress.processed}`);
    console.log(`  Downloaded: ${result.progress.downloaded}`);
    console.log(`  Skipped: ${result.progress.skipped}`);
    console.log(`  Failed: ${result.progress.failed}`);
    console.log('');

    const stats = getMediaStats();
    console.log('Media Stats:');
    console.log(`  Products with local media: ${stats.withLocalMedia}/${stats.totalProducts} (${stats.percentMirrored}%)`);
    console.log(`  Total local images: ${stats.totalLocalImages}`);

    if (result.error) {
      console.error('\nError:', result.error);
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

main();
