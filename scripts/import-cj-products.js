#!/usr/bin/env node
/**
 * CJ Dropshipping Pet Products Import Script
 * Imports 250 US-warehouse pet products with proper categorization
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'products.json');
const CACHE_DIR = path.join(__dirname, '..', 'public', 'cache', 'images');
const CJ_API_BASE = 'https://developers.cjdropshipping.com/api2.0';

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Pet category ID from CJ (Pet Supplies)
const PET_CATEGORY_ID = '2409110611570657700';

// Keywords for filtering
const DOG_KEYWORDS = [
  'dog', 'puppy', 'canine', 'leash', 'harness', 'collar', 'chew', 'fetch',
  'bone', 'squeaky', 'poop bag', 'training pad', 'crate', 'kennel'
];

const CAT_KEYWORDS = [
  'cat', 'kitten', 'feline', 'litter', 'scratching', 'catnip', 'teaser',
  'climbing', 'tunnel', 'mouse toy', 'feather'
];

const DENY_KEYWORDS = [
  'human', 'women', 'men', 'kids', 'baby', 'fashion', 'dress', 'shirt',
  'pants', 'shoe', 'jewelry', 'watch', 'phone', 'electronics', 'makeup',
  'wig', 'sexy', 'lingerie', 'furniture', 'carpet', 'tool'
];

// Category mapping for dogs
const DOG_CATEGORIES = {
  toys: ['toy', 'ball', 'chew', 'squeaky', 'plush', 'fetch', 'rope', 'frisbee', 'interactive'],
  feeding: ['bowl', 'feeder', 'food', 'water', 'slow feeder', 'dish', 'treat dispenser'],
  grooming: ['brush', 'comb', 'shampoo', 'nail', 'grooming', 'bath', 'dryer', 'deshedding'],
  'health-care': ['supplement', 'vitamin', 'dental', 'health', 'medicine', 'first aid'],
  walking: ['leash', 'harness', 'collar', 'lead', 'walking', 'reflective'],
  training: ['training', 'treat', 'clicker', 'potty', 'pad', 'crate'],
  'travel-outdoor': ['carrier', 'travel', 'car seat', 'backpack', 'outdoor', 'camping'],
  'beds-comfort': ['bed', 'cushion', 'mat', 'blanket', 'sleeping', 'pillow', 'crate mat']
};

// Category mapping for cats
const CAT_CATEGORIES = {
  toys: ['toy', 'teaser', 'mouse', 'feather', 'ball', 'interactive', 'laser', 'tunnel'],
  feeding: ['bowl', 'feeder', 'fountain', 'water', 'food', 'automatic'],
  grooming: ['brush', 'comb', 'grooming', 'nail', 'shampoo'],
  'health-care': ['supplement', 'vitamin', 'dental', 'health'],
  'litter-hygiene': ['litter', 'box', 'scoop', 'tray', 'mat', 'deodorizer'],
  'beds-comfort': ['bed', 'cushion', 'mat', 'hammock', 'cave', 'tree', 'perch']
};

function log(msg) {
  console.log(`[CJ Import] ${msg}`);
}

async function httpsRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      method,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getAccessToken() {
  const email = process.env.CJ_EMAIL;
  const password = process.env.CJ_PASSWORD;
  
  if (!email || !password) {
    throw new Error('CJ_EMAIL and CJ_PASSWORD environment variables required');
  }

  log('Authenticating with CJ API...');
  
  const res = await httpsRequest('POST', `${CJ_API_BASE}/v1/authentication/getAccessToken`, {}, {
    email,
    password
  });

  const data = JSON.parse(res.body);
  if (!data.data?.accessToken) {
    throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  }
  
  log('Authentication successful');
  return data.data.accessToken;
}

async function searchProducts(token, page = 1, pageSize = 50) {
  log(`Fetching page ${page} (${pageSize} products)...`);
  
  const res = await httpsRequest('GET', 
    `${CJ_API_BASE}/v1/product/list?pageNum=${page}&pageSize=${pageSize}&categoryId=${PET_CATEGORY_ID}&countryCode=US`,
    { 'CJ-Access-Token': token }
  );

  const data = JSON.parse(res.body);
  if (!data.data?.list) {
    log(`Warning: No products in response for page ${page}`);
    return [];
  }
  
  return data.data.list;
}

async function getProductDetails(token, pid) {
  const res = await httpsRequest('GET',
    `${CJ_API_BASE}/v1/product/query?pid=${pid}`,
    { 'CJ-Access-Token': token }
  );

  const data = JSON.parse(res.body);
  return data.data || null;
}

function classifyPetType(title, description) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  
  if (DENY_KEYWORDS.some(kw => text.includes(kw))) return null;
  
  const isDog = DOG_KEYWORDS.some(kw => text.includes(kw));
  const isCat = CAT_KEYWORDS.some(kw => text.includes(kw));
  
  if (isDog && isCat) return 'both';
  if (isDog) return 'dog';
  if (isCat) return 'cat';
  
  // Default to dog if pet-related but unclear
  if (text.includes('pet')) return 'dog';
  
  return null;
}

function classifyCategory(title, description, petType) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  const categories = petType === 'cat' ? CAT_CATEGORIES : DOG_CATEGORIES;
  
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => text.includes(kw))) {
      return cat;
    }
  }
  
  return 'toys'; // Default category
}

function cleanTitle(rawTitle) {
  if (!rawTitle) return '';
  
  let title = rawTitle
    .replace(/[^\w\s\-&',()]/gi, ' ')
    .replace(/\b[A-Z0-9]{10,}\b/g, '') // Remove long codes
    .replace(/\s+/g, ' ')
    .trim();
  
  // Remove duplicate words
  const words = title.split(' ');
  const seen = new Set();
  const deduped = words.filter(w => {
    const lower = w.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
  
  title = deduped.join(' ');
  
  // Capitalize properly
  return title.split(' ').map(w => 
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ');
}

function generateProductTitle(rawTitle, petType, category) {
  let clean = cleanTitle(rawTitle);
  
  // Ensure pet type is mentioned
  const petWord = petType === 'cat' ? 'Cat' : 'Dog';
  if (!clean.toLowerCase().includes(petType)) {
    clean = `${petWord} ${clean}`;
  }
  
  // Limit length
  if (clean.length > 70) {
    clean = clean.substring(0, 67) + '...';
  }
  
  return clean;
}

function generateDescription(rawDesc, title, petType) {
  const pet = petType === 'cat' ? 'cat' : 'dog';
  const petPlural = petType === 'cat' ? 'cats' : 'dogs';
  
  if (rawDesc && rawDesc.length > 50) {
    // Clean up CJ description
    let desc = rawDesc
      .replace(/<[^>]*>/g, '') // Remove HTML
      .replace(/\s+/g, ' ')
      .trim();
    
    if (desc.length > 300) {
      desc = desc.substring(0, 297) + '...';
    }
    return desc;
  }
  
  // Generate description from title
  return `Premium quality ${title.toLowerCase()} designed specifically for your ${pet}. ` +
    `Made with durable materials that ${petPlural} love. Perfect for everyday use and built to last.`;
}

function generateHighlights(title, description, petType) {
  const pet = petType === 'cat' ? 'cat' : 'dog';
  const highlights = [];
  const text = (title + ' ' + description).toLowerCase();
  
  if (text.includes('durable') || text.includes('quality')) {
    highlights.push('Premium durable construction');
  }
  if (text.includes('safe') || text.includes('non-toxic')) {
    highlights.push('Pet-safe materials');
  }
  if (text.includes('easy') || text.includes('convenient')) {
    highlights.push('Easy to use and clean');
  }
  if (text.includes('comfort') || text.includes('soft')) {
    highlights.push('Comfortable design');
  }
  
  // Add default highlights if needed
  while (highlights.length < 3) {
    const defaults = [
      `Perfect for ${pet}s of all sizes`,
      'High-quality materials',
      'Great value for pet parents',
      'Designed with your pet in mind'
    ];
    const next = defaults.find(d => !highlights.includes(d));
    if (next) highlights.push(next);
    else break;
  }
  
  return highlights.slice(0, 5);
}

function calculatePrice(costPrice) {
  const cost = parseFloat(costPrice) || 5;
  let margin;
  
  if (cost < 5) margin = 3.0;      // 200% markup for cheap items
  else if (cost < 10) margin = 2.5;
  else if (cost < 20) margin = 2.0;
  else if (cost < 50) margin = 1.8;
  else margin = 1.5;
  
  let price = cost * margin;
  
  // Round to .99
  price = Math.floor(price) + 0.99;
  
  // Minimum price $4.99
  if (price < 4.99) price = 4.99;
  
  return price;
}

function generateSlug(title, id) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  
  return `${slug}-${id.substring(0, 6)}`;
}

function generateSEO(title, description, petType) {
  const pet = petType === 'cat' ? 'Cat' : 'Dog';
  
  let seoTitle = `${title} | GetPawsy`;
  if (seoTitle.length > 60) {
    seoTitle = title.substring(0, 47) + '... | GetPawsy';
  }
  
  let seoDesc = description;
  if (seoDesc.length > 155) {
    seoDesc = seoDesc.substring(0, 152) + '...';
  }
  
  return { seoTitle, seoDescription: seoDesc };
}

async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    // Upgrade to HTTPS
    let targetUrl = url;
    if (targetUrl.startsWith('http://')) {
      targetUrl = targetUrl.replace('http://', 'https://');
    }
    
    const urlObj = new URL(targetUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    };
    
    const req = https.get(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        downloadImage(res.headers.location, filename).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const filepath = path.join(CACHE_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        resolve(`/cache/images/${filename}`);
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function processImages(imageUrls, productId) {
  const localImages = [];
  
  for (let i = 0; i < Math.min(imageUrls.length, 8); i++) {
    const url = imageUrls[i];
    if (!url) continue;
    
    try {
      const ext = url.match(/\.([a-z]+)(\?|$)/i)?.[1] || 'jpg';
      const filename = `${productId}_${i}.${ext}`;
      const localPath = await downloadImage(url, filename);
      localImages.push(localPath);
    } catch (err) {
      // Skip failed images
    }
  }
  
  return localImages;
}

async function main() {
  log('='.repeat(60));
  log('CJ Pet Products Import - Starting');
  log('='.repeat(60));
  
  const stats = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    noImages: 0,
    nonPet: 0,
    errors: 0
  };
  
  try {
    const token = await getAccessToken();
    const products = {};
    const targetCount = 250;
    let page = 1;
    const pageSize = 50;
    
    // Fetch products from CJ
    while (stats.imported < targetCount && page <= 20) {
      const batch = await searchProducts(token, page, pageSize);
      
      if (batch.length === 0) {
        log(`No more products at page ${page}`);
        break;
      }
      
      stats.fetched += batch.length;
      
      for (const rawProduct of batch) {
        if (stats.imported >= targetCount) break;
        
        try {
          const title = rawProduct.productNameEn || rawProduct.productName || '';
          const desc = rawProduct.description || rawProduct.productDescription || '';
          
          // Check if pet product
          const petType = classifyPetType(title, desc);
          if (!petType) {
            stats.nonPet++;
            continue;
          }
          
          // Get images
          let images = [];
          if (rawProduct.productImage) images.push(rawProduct.productImage);
          if (rawProduct.productImageSet) {
            images = images.concat(rawProduct.productImageSet.split(';').filter(Boolean));
          }
          
          if (images.length === 0) {
            stats.noImages++;
            continue;
          }
          
          // Generate product ID
          const pid = rawProduct.pid || rawProduct.productId || crypto.randomUUID();
          const productId = `cj-${pid.substring(0, 12)}`;
          
          // Classify category
          const mainCategory = petType === 'cat' ? 'cats' : 'dogs';
          const subCategory = classifyCategory(title, desc, petType);
          
          // Generate clean title
          const cleanedTitle = generateProductTitle(title, petType, subCategory);
          
          // Generate description
          const cleanedDesc = generateDescription(desc, cleanedTitle, petType);
          
          // Calculate price
          const costPrice = parseFloat(rawProduct.sellPrice || rawProduct.productPrice || 10);
          const price = calculatePrice(costPrice);
          const oldPrice = Math.round((price * 1.25) * 100) / 100;
          
          // Download images locally
          log(`Processing: ${cleanedTitle.substring(0, 40)}...`);
          const localImages = await processImages(images, productId);
          
          if (localImages.length === 0) {
            stats.noImages++;
            continue;
          }
          
          // Generate product object
          const product = {
            id: productId,
            name: cleanedTitle,
            title: cleanedTitle,
            description: cleanedDesc,
            price: price,
            old_price: oldPrice,
            images: localImages,
            rating: (Math.random() * 1 + 4).toFixed(1),
            reviews_count: Math.floor(Math.random() * 500) + 10,
            stock: Math.floor(Math.random() * 200) + 50,
            category: `${mainCategory === 'cats' ? 'Cat' : 'Dog'} ${subCategory.charAt(0).toUpperCase() + subCategory.slice(1).replace('-', ' ')}`,
            categorySlug: subCategory,
            mainCategorySlug: mainCategory,
            subcategorySlug: subCategory,
            petType: petType,
            tags: [petType, subCategory, ...cleanedTitle.toLowerCase().split(' ').slice(0, 5)],
            highlights: generateHighlights(cleanedTitle, cleanedDesc, petType),
            slug: generateSlug(cleanedTitle, productId),
            ...generateSEO(cleanedTitle, cleanedDesc, petType),
            cjProductId: pid,
            cjSku: rawProduct.productSku || rawProduct.sku,
            active: true,
            importedAt: new Date().toISOString()
          };
          
          products[productId] = product;
          stats.imported++;
          
          if (stats.imported % 10 === 0) {
            log(`Progress: ${stats.imported}/${targetCount} products imported`);
          }
          
        } catch (err) {
          stats.errors++;
          log(`Error processing product: ${err.message}`);
        }
      }
      
      page++;
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Save products
    log('Saving products to database...');
    
    // Convert to array format
    const productArray = Object.values(products);
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products: productArray }, null, 2));
    
    log('='.repeat(60));
    log('Import Complete!');
    log('='.repeat(60));
    log(`Fetched from CJ: ${stats.fetched}`);
    log(`Successfully imported: ${stats.imported}`);
    log(`Skipped (non-pet): ${stats.nonPet}`);
    log(`Skipped (no images): ${stats.noImages}`);
    log(`Errors: ${stats.errors}`);
    log('='.repeat(60));
    
    return stats;
    
  } catch (err) {
    log(`FATAL ERROR: ${err.message}`);
    throw err;
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
