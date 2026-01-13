#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const MEDIA_DIR = path.join(__dirname, '..', 'public', 'media', 'products');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function downloadProductMedia(product) {
  const productDir = path.join(MEDIA_DIR, String(product.id));
  const imagesDir = path.join(productDir, 'images');
  const videosDir = path.join(productDir, 'videos');
  
  ensureDir(imagesDir);
  ensureDir(videosDir);
  
  const localImages = [];
  const localVideos = [];
  
  const originalImages = product.originalImages || [];
  for (let i = 0; i < originalImages.length; i++) {
    const url = originalImages[i];
    if (!url || !url.startsWith('http')) continue;
    
    const ext = path.extname(url).split('?')[0] || '.jpg';
    const filename = `image-${i + 1}${ext.toLowerCase()}`;
    const destPath = path.join(imagesDir, filename);
    const localPath = `/media/products/${product.id}/images/${filename}`;
    
    if (fs.existsSync(destPath)) {
      localImages.push(localPath);
      continue;
    }
    
    try {
      await downloadFile(url, destPath);
      localImages.push(localPath);
      console.log(`  ✓ ${filename}`);
    } catch (err) {
      console.warn(`  ✗ Failed: ${url} - ${err.message}`);
    }
  }
  
  const originalVideos = product.originalVideos || [];
  for (let i = 0; i < originalVideos.length; i++) {
    const url = originalVideos[i];
    if (!url || !url.startsWith('http')) continue;
    
    const ext = path.extname(url).split('?')[0] || '.mp4';
    const filename = `video-${i + 1}${ext.toLowerCase()}`;
    const destPath = path.join(videosDir, filename);
    const localPath = `/media/products/${product.id}/videos/${filename}`;
    
    if (fs.existsSync(destPath)) {
      localVideos.push(localPath);
      continue;
    }
    
    try {
      await downloadFile(url, destPath);
      localVideos.push(localPath);
      console.log(`  ✓ ${filename}`);
    } catch (err) {
      console.warn(`  ✗ Failed video: ${url} - ${err.message}`);
    }
  }
  
  return { localImages, localVideos };
}

async function main() {
  console.log('='.repeat(60));
  console.log('[Media Sync] Starting CJ media download...');
  console.log('='.repeat(60));
  
  if (!fs.existsSync(CATALOG_PATH)) {
    console.error('ERROR: catalog.json not found at', CATALOG_PATH);
    process.exit(1);
  }
  
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const products = catalog.products || [];
  
  console.log(`Found ${products.length} products to process`);
  
  let processed = 0;
  let skipped = 0;
  
  for (const product of products) {
    if (product.withLocalMedia && product.mediaSource === 'local') {
      const hasLocalImages = (product.images || []).every(img => img.startsWith('/media/'));
      if (hasLocalImages && (product.images || []).length > 0) {
        skipped++;
        continue;
      }
    }
    
    console.log(`\n[${processed + 1}/${products.length}] ${product.id}: ${(product.title || '').slice(0, 50)}...`);
    
    const { localImages, localVideos } = await downloadProductMedia(product);
    
    if (localImages.length > 0) {
      product.images = localImages;
      product.imageUrl = localImages[0];
    }
    if (localVideos.length > 0) {
      product.videos = localVideos;
      product.videoUrl = localVideos[0];
    }
    
    product.withLocalMedia = true;
    product.mediaSource = 'local';
    product.hasLocalMedia = true;
    
    processed++;
  }
  
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log(`[Media Sync] Complete!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (already local): ${skipped}`);
  console.log(`  Total products: ${products.length}`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
