/**
 * Admin Catalog CSV Export/Import Routes
 * Separate from pricing import - handles full product catalog management
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { requireAdminSession } = require('../src/adminAuth');
const petOnlyEngine = require('../src/lib/petOnlyEngine');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'catalog.json');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// 18-column CSV schema for full catalog import/export
const CATALOG_CSV_HEADERS = [
  'product_id', 'slug', 'title', 'description', 'category', 'sub_category', 'pet_type',
  'is_pet_product', 'active', 'tags', 'cj_product_id', 'cj_spu',
  'cost', 'price', 'currency', 'images', 'variants', 'updated_at'
];

const NON_PET_BLACKLIST = [
  'wine', 'whiskey', 'alcohol', 'beer', 'vodka', 'liquor',
  'glass', 'wine glass', 'champagne',
  'jewelry', 'earring', 'necklace', 'bracelet', 'ring', 'pendant',
  'makeup', 'lip gloss', 'lipstick', 'mascara', 'eyeshadow', 'foundation', 'cosmetic',
  'pajama', 'romper', 'dress', 'skirt', 'blouse', 'shirt', 'pants', 'jeans',
  'bedding', 'duvet', 'pillow', 'mattress', 'blanket human', 'sheets',
  'led lamp', 'ceiling light', 'chandelier', 'floor lamp',
  'clamp meter', 'multimeter', 'oscilloscope', 'soldering',
  'tool', 'wrench', 'screwdriver', 'hammer', 'drill',
  'tactical armor', 'bulletproof', 'body armor',
  'phone case', 'iphone', 'samsung case', 'tablet case',
  'human clothing', 'adult clothing', 'baby clothing', 'infant',
  'coffee maker', 'toaster', 'microwave', 'blender',
  'perfume', 'cologne', 'fragrance', 'deodorant',
  'watch', 'smartwatch', 'fitness band',
  'headphones', 'earbuds', 'speaker', 'bluetooth speaker',
  'laptop', 'computer', 'keyboard', 'mouse pad',
  'car accessory', 'car mount', 'dashboard',
  'fishing', 'hunting', 'camping tent', 'hiking boots'
];

const PET_WHITELIST = [
  'dog', 'cat', 'puppy', 'kitten', 'pet', 'pup', 'kitty', 'feline', 'canine',
  'collar', 'leash', 'harness', 'lead',
  'litter', 'litter box', 'cat litter',
  'crate', 'kennel', 'cage', 'hutch', 'terrarium', 'aquarium', 'tank',
  'feeder', 'food bowl', 'water bowl', 'fountain', 'dispenser',
  'grooming', 'brush', 'comb', 'nail clipper', 'shampoo pet', 'conditioner pet',
  'chew', 'chew toy', 'bone', 'treat', 'snack', 'biscuit',
  'toy', 'ball', 'squeaky', 'plush toy pet', 'rope toy',
  'scratching', 'scratching post', 'cat tree', 'climbing',
  'bed', 'pet bed', 'dog bed', 'cat bed', 'cushion pet', 'mat pet',
  'carrier', 'travel carrier', 'backpack pet', 'stroller pet',
  'clothing pet', 'sweater pet', 'jacket pet', 'raincoat pet', 'costume pet',
  'training', 'clicker', 'whistle', 'potty pad', 'pee pad',
  'health', 'vitamin pet', 'supplement pet', 'dental pet',
  'rabbit', 'hamster', 'guinea pig', 'bird', 'parrot', 'fish', 'reptile', 'turtle', 'ferret',
  'small animal', 'small pet', 'exotic pet'
];

function loadCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    return data.products || data || [];
  } catch (err) {
    console.error('[Admin Catalog] Failed to load catalog:', err.message);
    return [];
  }
}

function saveCatalog(products) {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    if (data.products) {
      data.products = products;
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2));
    } else {
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(products, null, 2));
    }
    return true;
  } catch (err) {
    console.error('[Admin Catalog] Failed to save catalog:', err.message);
    return false;
  }
}

function generateFingerprint() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${date}_${time}_${rand}`;
}

function backupCatalog() {
  try {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    const fingerprint = generateFingerprint();
    const backupPath = path.join(BACKUP_DIR, `catalog_${fingerprint}.json`);
    fs.copyFileSync(CATALOG_PATH, backupPath);
    console.log('[Admin Catalog] Timestamped backup created:', backupPath);
    
    // Also keep a simple .bak for quick recovery
    const simpleBak = path.join(__dirname, '..', 'data', 'catalog.json.bak');
    fs.copyFileSync(CATALOG_PATH, simpleBak);
    
    // Clean up old backups (keep last 20)
    cleanOldBackups(20);
    
    return { success: true, path: backupPath, fingerprint };
  } catch (err) {
    console.error('[Admin Catalog] Backup failed:', err.message);
    return { success: false, error: err.message };
  }
}

function cleanOldBackups(keepCount = 20) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('catalog_') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (files.length > keepCount) {
      files.slice(keepCount).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
      });
    }
  } catch (err) {
    console.error('[Admin Catalog] Backup cleanup error:', err.message);
  }
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function parseCSVLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function preprocessCSV(csvData) {
  let data = csvData;
  let bomStripped = false;
  
  if (data.charCodeAt(0) === 0xFEFF) {
    data = data.slice(1);
    bomStripped = true;
  }
  
  const tabCount = (data.match(/\t/g) || []).length;
  const commaCount = (data.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount / 2 ? '\t' : ',';
  
  return { data, bomStripped, delimiter };
}

function normalizePetType(raw) {
  if (!raw) return 'unknown';
  const pt = String(raw).toLowerCase().trim();
  if (['dog', 'dogs'].includes(pt)) return 'dog';
  if (['cat', 'cats'].includes(pt)) return 'cat';
  if (['small pets', 'small-pets', 'small_pets', 'small pet', 'small-pet'].includes(pt)) return 'small_pets';
  if (pt === 'both') return 'both';
  return 'unknown';
}

function normalizeBoolean(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).toLowerCase().trim();
  if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  return null;
}

function normalizePrice(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).replace(/[$€£,]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

const HUMAN_PRODUCT_PATTERNS = [
  /necklace|earring|bracelet|ring|pendant|jewelry/i,
  /wine.*glass|champagne.*glass/i,
  /makeup|cosmetic|lip.*gloss|mascara|eyeshadow/i,
  /pajama|romper|dress|skirt|blouse|jeans/i,
  /phone.*case|tablet.*case|laptop.*case/i,
  /perfume|cologne|fragrance|deodorant/i,
  /headphones|earbuds|speaker/i,
  /tactical.*armor|bulletproof|body.*armor/i,
  /baby.*clothing|infant.*clothing/i,
  /human.*bedding|mattress.*pad/i
];

function isPetProduct(title, description, tags) {
  const text = `${title || ''} ${description || ''} ${tags || ''}`.toLowerCase();
  
  const matchedBlacklist = NON_PET_BLACKLIST.filter(term => text.includes(term));
  const matchedWhitelist = PET_WHITELIST.filter(term => text.includes(term));
  
  const isHumanPattern = HUMAN_PRODUCT_PATTERNS.some(pattern => pattern.test(text));
  if (isHumanPattern) {
    return { isPet: false, reason: 'human product pattern: ' + matchedBlacklist.slice(0, 3).join(', ') };
  }
  
  const hasPetInTitle = /\b(dog|cat|pet|puppy|kitten|hamster|rabbit|bird|fish|reptile)\b/i.test(title || '');
  
  if (matchedWhitelist.length > 0 && matchedBlacklist.length === 0) {
    return { isPet: true, reason: null };
  }
  
  if (matchedBlacklist.length > 0 && matchedWhitelist.length === 0) {
    return { isPet: false, reason: 'blacklist: ' + matchedBlacklist.slice(0, 3).join(', ') };
  }
  
  if (matchedWhitelist.length > 0 && matchedBlacklist.length > 0) {
    if (hasPetInTitle) {
      return { isPet: true, reason: 'pet keyword in title overrides blacklist' };
    }
    if (matchedWhitelist.length > matchedBlacklist.length) {
      return { isPet: true, reason: 'whitelist majority' };
    }
    return { isPet: false, reason: 'blacklist: ' + matchedBlacklist.slice(0, 3).join(', ') };
  }
  
  return { isPet: null, reason: 'unknown - no matches' };
}

function mapCategoryToPetType(category) {
  if (!category) return null;
  const cat = category.toLowerCase();
  if (cat.includes('dog')) return 'dog';
  if (cat.includes('cat')) return 'cat';
  if (cat.includes('small') || cat.includes('rabbit') || cat.includes('hamster') || cat.includes('bird') || cat.includes('fish') || cat.includes('reptile')) return 'small_pets';
  return null;
}

function getFirstImage(product) {
  if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    const img = product.images[0];
    if (typeof img === 'string') return img;
    if (img && img.url) return img.url;
    if (img && img.src) return img.src;
  }
  if (product.image) return product.image;
  if (product.imageUrl) return product.imageUrl;
  return '';
}

function normalizePetType(petType, title = '', category = '') {
  const text = `${petType || ''} ${title} ${category}`.toLowerCase();
  if (text.includes('dog') || text.includes('puppy') || text.includes('canine') || text.includes('pup')) {
    return 'dog';
  }
  if (text.includes('cat') || text.includes('kitten') || text.includes('feline') || text.includes('kitty')) {
    return 'cat';
  }
  if (text.includes('rabbit') || text.includes('hamster') || text.includes('guinea') || 
      text.includes('bird') || text.includes('fish') || text.includes('reptile') ||
      text.includes('small pet') || text.includes('small animal')) {
    return 'small_pets';
  }
  return 'dog';
}

function normalizeCategory(petType) {
  switch (petType) {
    case 'dog': return 'Dogs';
    case 'cat': return 'Cats';
    case 'small_pets': return 'Small Pets';
    default: return 'Dogs';
  }
}

router.get('/export.csv', requireAdminSession, (req, res) => {
  try {
    const products = loadCatalog();
    console.log(`[Admin Catalog] Exporting ${products.length} products to CSV (18-column schema)`);
    
    let csv = CATALOG_CSV_HEADERS.join(',') + '\n';
    
    for (const p of products) {
      const petType = normalizePetType(p.pet_type || p.petType, p.title, p.category);
      const category = normalizeCategory(petType);
      const subCategory = p.subcategorySlug || p.subCategory || p.sub_category || 'general';
      const isPet = p.is_pet_product !== false && p.blocked !== true;
      const tags = Array.isArray(p.tags) ? p.tags.join('|') : (p.tags || '');
      
      // Format images as JSON array
      let imagesJson = '[]';
      if (p.images && Array.isArray(p.images)) {
        imagesJson = JSON.stringify(p.images);
      } else if (p.image) {
        imagesJson = JSON.stringify([p.image]);
      }
      
      // Format variants as JSON array
      let variantsJson = '[]';
      if (p.variants && Array.isArray(p.variants)) {
        variantsJson = JSON.stringify(p.variants);
      }
      
      // 18 columns: product_id, slug, title, description, category, sub_category, pet_type,
      // is_pet_product, active, tags, cj_product_id, cj_spu, cost, price, currency, images, variants, updated_at
      const row = [
        escapeCSV(p.id || p.product_id || ''),
        escapeCSV(p.slug || p.handle || ''),
        escapeCSV((p.title || p.name || '').replace(/[\r\n]+/g, ' ').substring(0, 500)),
        escapeCSV((p.description || '').replace(/[\r\n]+/g, ' ').substring(0, 2000)),
        escapeCSV(category),
        escapeCSV(subCategory),
        escapeCSV(petType),
        escapeCSV(isPet),
        escapeCSV(p.active !== false),
        escapeCSV(tags),
        escapeCSV(p.cj_product_id || p.cjProductId || ''),
        escapeCSV(p.cj_spu || p.cjSpu || p.spu || ''),
        escapeCSV(parseFloat(p.cost || 0).toFixed(2)),
        escapeCSV(parseFloat(p.price || 0).toFixed(2)),
        escapeCSV('USD'),
        escapeCSV(imagesJson),
        escapeCSV(variantsJson),
        escapeCSV(p.updated_at || p.updatedAt || new Date().toISOString())
      ];
      
      csv += row.join(',') + '\n';
    }
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="getpawsy_catalog_EXPORT_18col.csv"');
    res.send(csv);
    
  } catch (err) {
    console.error('[Admin Catalog] Export error:', err);
    res.status(500).json({ error: 'Export failed', message: err.message });
  }
});

router.post('/preview', requireAdminSession, upload.single('file'), (req, res) => {
  try {
    let csvData = null;
    if (req.file && req.file.buffer) {
      csvData = req.file.buffer.toString('utf-8');
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      csvData = req.body;
    }
    
    if (!csvData || csvData.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'No CSV data provided' });
    }
    
    const { data: cleanData, bomStripped, delimiter } = preprocessCSV(csvData);
    const lines = cleanData.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length < 2) {
      return res.status(400).json({ ok: false, error: 'CSV must have header and at least one data row' });
    }
    
    const headers = parseCSVLine(lines[0], delimiter).map(h => h.toLowerCase().trim());
    const headerMap = {};
    CATALOG_CSV_HEADERS.forEach((h, i) => {
      const idx = headers.indexOf(h.toLowerCase());
      headerMap[h] = idx;
    });
    
    if (headerMap.product_id === -1) {
      return res.status(400).json({ 
        ok: false, 
        error: 'CSV must have product_id column',
        detectedHeaders: headers
      });
    }
    
    const products = loadCatalog();
    const productMap = new Map(products.map(p => [String(p.id), p]));
    
    const stats = {
      totalRows: lines.length - 1,
      validRows: 0,
      invalidRows: 0,
      creates: 0,
      updates: 0,
      disables: 0,
      disabledByRule: 0,
      unchanged: 0
    };
    
    const invalid = [];
    const changes = [];
    const disabledByRuleIds = []; // Track IDs disabled by pet-only rule
    const categoryStats = {};
    const petTypeStats = {};
    
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], delimiter);
      const rowNum = i + 1;
      
      const productId = headerMap.product_id >= 0 ? String(cols[headerMap.product_id] || '').trim() : '';
      if (!productId) {
        invalid.push({ rowNumber: rowNum, reason: 'Missing product_id' });
        stats.invalidRows++;
        continue;
      }
      
      const existing = productMap.get(productId);
      
      const title = headerMap.title >= 0 ? (cols[headerMap.title] || '').trim() : (existing?.title || '');
      const slug = headerMap.slug >= 0 ? (cols[headerMap.slug] || '').trim() : '';
      const description = headerMap.description >= 0 ? (cols[headerMap.description] || '').trim() : '';
      const category = headerMap.category >= 0 ? (cols[headerMap.category] || '').trim() : '';
      const subCategory = headerMap.sub_category >= 0 ? (cols[headerMap.sub_category] || '').trim() : '';
      const rawPetType = headerMap.pet_type >= 0 ? (cols[headerMap.pet_type] || '').trim() : '';
      const rawIsPet = headerMap.is_pet_product >= 0 ? (cols[headerMap.is_pet_product] || '').trim() : '';
      const rawActive = headerMap.active >= 0 ? (cols[headerMap.active] || '').trim() : '';
      const rawTags = headerMap.tags >= 0 ? (cols[headerMap.tags] || '').trim() : '';
      const rawCost = headerMap.cost >= 0 ? (cols[headerMap.cost] || '').trim() : '';
      const rawPrice = headerMap.price >= 0 ? (cols[headerMap.price] || '').trim() : '';
      const rawImages = headerMap.images >= 0 ? (cols[headerMap.images] || '').trim() : '';
      const rawVariants = headerMap.variants >= 0 ? (cols[headerMap.variants] || '').trim() : '';
      
      const petType = normalizePetType(rawPetType, title, category);
      let isPet = normalizeBoolean(rawIsPet);
      let active = normalizeBoolean(rawActive);
      const cost = normalizePrice(rawCost);
      const price = normalizePrice(rawPrice);
      
      // Use petOnlyEngine for classification
      const tempProduct = { title, description, tags: rawTags, category, sub_category: subCategory };
      const classification = petOnlyEngine.classify(tempProduct);
      let ruleDisabled = false;
      let ruleReason = null;
      if (!classification.eligible) {
        isPet = false;
        active = false;
        ruleDisabled = true;
        ruleReason = classification.reasons.join(', ');
        stats.disabledByRule++;
        disabledByRuleIds.push({ id: productId, title: title.substring(0, 60), reason: ruleReason });
      }
      
      if (isPet === false) {
        active = false;
      }
      
      const finalSlug = slug || slugify(title) || (existing?.slug || '');
      
      categoryStats[category || 'uncategorized'] = (categoryStats[category || 'uncategorized'] || 0) + 1;
      petTypeStats[petType] = (petTypeStats[petType] || 0) + 1;
      
      stats.validRows++;
      
      if (!existing) {
        stats.creates++;
        if (changes.length < 100) {
          changes.push({
            product_id: productId,
            slug: finalSlug,
            action: 'create',
            fieldsChanged: ['all']
          });
        }
      } else {
        const changedFields = [];
        
        if (title && title !== existing.title) changedFields.push('title');
        if (finalSlug && finalSlug !== existing.slug) changedFields.push('slug');
        if (description && description !== existing.description) changedFields.push('description');
        if (category && category !== (existing.mainCategorySlug || existing.category)) changedFields.push('category');
        if (subCategory && subCategory !== (existing.subcategorySlug || existing.subCategory)) changedFields.push('sub_category');
        if (petType && petType !== (existing.pet_type || existing.petType)) changedFields.push('pet_type');
        if (isPet !== null && isPet !== (existing.is_pet_product !== false)) changedFields.push('is_pet_product');
        if (active !== null && active !== (existing.active !== false)) {
          changedFields.push('active');
          if (active === false) stats.disables++;
        }
        if (cost !== null && cost !== existing.cost) changedFields.push('cost');
        if (price !== null && price !== existing.price) changedFields.push('price');
        
        // Compare images by parsing JSON (handles CSV escaping)
        if (rawImages) {
          try {
            const newImages = JSON.parse(rawImages);
            const existingImages = existing.images || [];
            if (JSON.stringify(newImages) !== JSON.stringify(existingImages)) {
              changedFields.push('images');
            }
          } catch (e) {
            // If not valid JSON but different from first image, mark as changed
            if (rawImages.startsWith('http') && rawImages !== getFirstImage(existing)) {
              changedFields.push('images');
            }
          }
        }
        
        // Compare variants by parsing JSON
        if (rawVariants) {
          try {
            const newVariants = JSON.parse(rawVariants);
            const existingVariants = existing.variants || [];
            if (JSON.stringify(newVariants) !== JSON.stringify(existingVariants)) {
              changedFields.push('variants');
            }
          } catch (e) {
            // Skip invalid variants JSON
          }
        }
        
        // Products disabled by rule should always be counted as updates even if already disabled
        // This ensures the Apply button enables and the products get properly marked
        if (ruleDisabled && changedFields.length === 0) {
          // Force mark as update so Apply can re-confirm the disable
          changedFields.push('disabled_by_rule');
        }
        
        if (changedFields.length > 0) {
          stats.updates++;
          if (changes.length < 100) {
            changes.push({
              product_id: productId,
              slug: finalSlug || existing.slug,
              action: ruleDisabled ? 'disable_rule' : 'update',
              fieldsChanged: changedFields,
              ruleReason: ruleDisabled ? ruleReason : null
            });
          }
        } else {
          stats.unchanged++;
        }
      }
    }
    
    // Log preview results
    console.log(`[Admin Catalog Preview] Rows: ${stats.totalRows}, Valid: ${stats.validRows}, Creates: ${stats.creates}, Updates: ${stats.updates}, Disables: ${stats.disables}, DisabledByRule: ${stats.disabledByRule}`);
    if (changes.length > 0) {
      console.log(`[Admin Catalog Preview] First 3 actions:`, changes.slice(0, 3).map(c => `${c.action}: ${c.product_id}`).join(', '));
    }
    
    res.json({
      ok: true,
      mode: 'preview',
      counts: stats,
      invalid: invalid.slice(0, 100),
      changes: changes,
      disabledByRuleIds: disabledByRuleIds.slice(0, 100), // IDs that will be disabled by pet-only rule
      summaryByCategory: categoryStats,
      summaryByPetType: petTypeStats,
      bomStripped,
      delimiter: delimiter === '\t' ? 'TAB' : 'COMMA'
    });
    
  } catch (err) {
    console.error('[Admin Catalog] Preview error:', err);
    res.status(500).json({ ok: false, error: 'Preview failed', message: err.message });
  }
});

router.post('/apply', requireAdminSession, upload.single('file'), (req, res) => {
  try {
    let csvData = null;
    if (req.file && req.file.buffer) {
      csvData = req.file.buffer.toString('utf-8');
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      csvData = req.body;
    }
    
    if (!csvData || csvData.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'No CSV data provided' });
    }
    
    // Create timestamped backup before making changes
    const backupResult = backupCatalog();
    if (!backupResult.success) {
      console.warn('[Admin Catalog Apply] Backup failed, continuing anyway:', backupResult.error);
    }
    
    const { data: cleanData, delimiter } = preprocessCSV(csvData);
    const lines = cleanData.split(/\r?\n/).filter(l => l.trim());
    
    if (lines.length < 2) {
      return res.status(400).json({ ok: false, error: 'CSV must have header and at least one data row' });
    }
    
    const headers = parseCSVLine(lines[0], delimiter).map(h => h.toLowerCase().trim());
    const headerMap = {};
    CATALOG_CSV_HEADERS.forEach((h) => {
      headerMap[h] = headers.indexOf(h.toLowerCase());
    });
    
    if (headerMap.product_id === -1) {
      return res.status(400).json({ ok: false, error: 'CSV must have product_id column' });
    }
    
    const products = loadCatalog();
    const productMap = new Map(products.map(p => [String(p.id), p]));
    
    const stats = { created: 0, updated: 0, disabled: 0, disabledByRule: 0, errors: 0 };
    const errors = [];
    const disabledProducts = [];
    
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], delimiter);
      const rowNum = i + 1;
      
      const productId = headerMap.product_id >= 0 ? String(cols[headerMap.product_id] || '').trim() : '';
      if (!productId) {
        errors.push({ row: rowNum, error: 'Missing product_id' });
        stats.errors++;
        continue;
      }
      
      let product = productMap.get(productId);
      const isNew = !product;
      
      if (isNew) {
        product = { id: productId };
        products.push(product);
        productMap.set(productId, product);
      }
      
      const title = headerMap.title >= 0 ? (cols[headerMap.title] || '').trim() : '';
      const slug = headerMap.slug >= 0 ? (cols[headerMap.slug] || '').trim() : '';
      const description = headerMap.description >= 0 ? (cols[headerMap.description] || '').trim() : '';
      const category = headerMap.category >= 0 ? (cols[headerMap.category] || '').trim() : '';
      const subCategory = headerMap.sub_category >= 0 ? (cols[headerMap.sub_category] || '').trim() : '';
      const rawPetType = headerMap.pet_type >= 0 ? (cols[headerMap.pet_type] || '').trim() : '';
      const rawIsPet = headerMap.is_pet_product >= 0 ? (cols[headerMap.is_pet_product] || '').trim() : '';
      const rawActive = headerMap.active >= 0 ? (cols[headerMap.active] || '').trim() : '';
      const rawTags = headerMap.tags >= 0 ? (cols[headerMap.tags] || '').trim() : '';
      const rawCjProductId = headerMap.cj_product_id >= 0 ? (cols[headerMap.cj_product_id] || '').trim() : '';
      const rawCjSpu = headerMap.cj_spu >= 0 ? (cols[headerMap.cj_spu] || '').trim() : '';
      const rawCost = headerMap.cost >= 0 ? (cols[headerMap.cost] || '').trim() : '';
      const rawPrice = headerMap.price >= 0 ? (cols[headerMap.price] || '').trim() : '';
      const rawCurrency = headerMap.currency >= 0 ? (cols[headerMap.currency] || '').trim() : '';
      const rawImages = headerMap.images >= 0 ? (cols[headerMap.images] || '').trim() : '';
      const rawVariants = headerMap.variants >= 0 ? (cols[headerMap.variants] || '').trim() : '';
      const rawUpdatedAt = headerMap.updated_at >= 0 ? (cols[headerMap.updated_at] || '').trim() : '';
      
      if (title) product.title = title;
      if (slug) product.slug = slug;
      else if (!product.slug && product.title) product.slug = slugify(product.title);
      if (description) product.description = description;
      
      if (category) product.mainCategorySlug = category;
      if (subCategory) product.subcategorySlug = subCategory;
      
      const petType = normalizePetType(rawPetType, title, category);
      if (petType) product.pet_type = petType;
      
      let isPet = normalizeBoolean(rawIsPet);
      let active = normalizeBoolean(rawActive);
      
      // Use petOnlyEngine for classification
      const classification = petOnlyEngine.classify(product);
      if (!classification.eligible) {
        isPet = false;
        active = false;
        stats.disabledByRule++;
        product._disabled_reason = classification.reasons.join(', ');
      }
      
      if (isPet === false) {
        active = false;
        product.is_pet_product = false;
      } else if (isPet === true || classification.eligible) {
        product.is_pet_product = true;
        if (classification.pet_type && classification.pet_type !== 'unknown') {
          product.pet_type = classification.pet_type;
        }
      }
      
      // Track disables - if active was true and now false, count as disabled
      const wasActive = product.active !== false;
      if (active !== null) product.active = active;
      if (wasActive && active === false && !isNew) {
        stats.disabled++;
        if (disabledProducts.length < 50) {
          disabledProducts.push({ id: productId, title: (product.title || '').substring(0, 50) });
        }
      }
      
      if (rawTags) {
        product.tags = rawTags.split('|').map(t => t.trim()).filter(t => t);
      }
      
      if (rawCjProductId) product.cj_product_id = rawCjProductId;
      if (rawCjSpu) product.cj_spu = rawCjSpu;
      
      const cost = normalizePrice(rawCost);
      const price = normalizePrice(rawPrice);
      if (cost !== null) product.cost = cost;
      if (price !== null) product.price = price;
      if (rawCurrency) product.currency = rawCurrency.toUpperCase();
      
      // Parse images from JSON array or keep existing
      if (rawImages) {
        try {
          const parsedImages = JSON.parse(rawImages);
          if (Array.isArray(parsedImages) && parsedImages.length > 0) {
            product.images = parsedImages;
          }
        } catch (e) {
          // If not valid JSON, treat as single URL for backward compatibility
          if (rawImages.startsWith('http')) {
            product.images = [rawImages];
          }
        }
      }
      
      // Parse variants from JSON array
      if (rawVariants) {
        try {
          const parsedVariants = JSON.parse(rawVariants);
          if (Array.isArray(parsedVariants) && parsedVariants.length > 0) {
            product.variants = parsedVariants;
          }
        } catch (e) {
          // Skip invalid variants JSON
        }
      }
      
      product.updated_at = rawUpdatedAt || new Date().toISOString();
      
      if (isNew) stats.created++;
      else stats.updated++;
    }
    
    saveCatalog(products);
    
    const fingerprint = `CAT-${Date.now().toString(36).toUpperCase()}`;
    const totalDisabled = stats.disabled + stats.disabledByRule;
    
    // Enhanced logging with backup info
    console.log(`[Admin Catalog Apply] ═══════════════════════════════════════`);
    console.log(`[Admin Catalog Apply] Fingerprint: ${fingerprint}`);
    console.log(`[Admin Catalog Apply] Backup: ${backupResult.success ? backupResult.path : 'FAILED'}`);
    console.log(`[Admin Catalog Apply] Created: ${stats.created}, Updated: ${stats.updated}`);
    console.log(`[Admin Catalog Apply] Disabled: ${stats.disabled}, DisabledByRule: ${stats.disabledByRule}`);
    console.log(`[Admin Catalog Apply] Errors: ${stats.errors}`);
    console.log(`[Admin Catalog Apply] ═══════════════════════════════════════`);
    
    if (global.refreshCatalogCache) {
      global.refreshCatalogCache();
    }
    
    res.json({
      ok: true,
      mode: 'apply',
      fingerprint,
      counts: stats,
      disabledProducts: disabledProducts.slice(0, 20),
      errors: errors.slice(0, 50),
      message: `Applied: ${stats.created} created, ${stats.updated} updated, ${totalDisabled} disabled`
    });
    
  } catch (err) {
    console.error('[Admin Catalog] Apply error:', err);
    res.status(500).json({ ok: false, error: 'Apply failed', message: err.message });
  }
});

// BONUS: One-click disable all non-pet products using petOnlyEngine
router.post('/disable-non-pet', requireAdminSession, (req, res) => {
  try {
    const backupResult = backupCatalog();
    const products = loadCatalog();
    
    const stats = {
      totalProducts: products.length,
      disabled: 0,
      alreadyDisabled: 0,
      petProducts: 0,
      mode: petOnlyEngine.PETONLY_MODE
    };
    
    const disabledItems = [];
    
    for (const p of products) {
      // Use petOnlyEngine for classification
      const classification = petOnlyEngine.classify(p);
      
      if (!classification.eligible) {
        if (p.active === false && p.is_pet_product === false) {
          stats.alreadyDisabled++;
        } else {
          p.active = false;
          p.is_pet_product = false;
          p.isPetProduct = false;
          p.blocked = true;
          p.isBlocked = true;
          p._disabled_reason = classification.reasons.join(', ');
          stats.disabled++;
          
          if (disabledItems.length < 50) {
            disabledItems.push({
              id: p.id,
              title: (p.title || '').substring(0, 60),
              reason: classification.reasons[0] || 'not_pet'
            });
          }
        }
      } else {
        stats.petProducts++;
        // Update pet_type if detected
        if (classification.pet_type && classification.pet_type !== 'unknown') {
          p.pet_type = classification.pet_type;
        }
      }
    }
    
    saveCatalog(products);
    
    console.log(`[Admin Catalog] Disable non-pet (mode=${stats.mode}): ${stats.disabled} disabled, ${stats.alreadyDisabled} already disabled, ${stats.petProducts} pet products`);
    console.log(`[Admin Catalog] Backup: ${backupResult.success ? backupResult.path : 'FAILED'}`);
    
    if (global.refreshCatalogCache) {
      global.refreshCatalogCache();
    }
    
    res.json({
      ok: true,
      stats,
      disabledItems,
      backupPath: backupResult.success ? backupResult.path : null,
      message: `Disabled ${stats.disabled} non-pet products. ${stats.petProducts} pet products remain active.`
    });
    
  } catch (err) {
    console.error('[Admin Catalog] Disable non-pet error:', err);
    res.status(500).json({ ok: false, error: 'Failed to disable non-pet products', message: err.message });
  }
});

router.post('/purge-non-pet', requireAdminSession, express.json(), (req, res) => {
  try {
    const { mode = 'deactivate', dryRun = true } = req.body || {};
    
    if (!['deactivate', 'delete'].includes(mode)) {
      return res.status(400).json({ ok: false, error: 'Mode must be "deactivate" or "delete"' });
    }
    
    let backupResult = null;
    if (!dryRun) {
      backupResult = backupCatalog();
    }
    
    const products = loadCatalog();
    
    const stats = {
      mode,
      dryRun,
      timestamp: new Date().toISOString(),
      totalProducts: products.length,
      affected: 0,
      deleted: 0,
      deactivated: 0,
      categoryFixes: 0,
      petOnlyMode: petOnlyEngine.PETONLY_MODE
    };
    
    const affectedItems = [];
    const categoryFixes = [];
    const newProducts = [];
    
    for (const p of products) {
      const classification = petOnlyEngine.classify(p);
      
      // Only remove products with explicit eligible === false (not null/undefined)
      if (classification.eligible === false) {
        affectedItems.push({
          product_id: p.id || p.product_id,
          slug: p.slug,
          title: (p.title || '').substring(0, 60),
          reasons: classification.reasons,
          action: mode
        });
        
        if (mode === 'delete') {
          stats.deleted++;
          stats.affected++;
          if (dryRun) {
            newProducts.push(p);
          }
          continue;
        } else {
          if (!dryRun) {
            p.active = false;
            p.is_pet_product = false;
            p.isPetProduct = false;
            p.blocked = true;
            p._cleanup_reason = classification.reasons.join('; ');
            p._cleanup_at = stats.timestamp;
          }
          stats.deactivated++;
          stats.affected++;
        }
      } else {
        const title = (p.title || '').toLowerCase();
        const catTerms = ['cat', 'kitty', 'kitten', 'feline'];
        const dogTerms = ['dog', 'puppy', 'canine', 'pup'];
        const hasCat = catTerms.some(t => title.includes(t));
        const hasDog = dogTerms.some(t => title.includes(t));
        
        if (p.category === 'Dogs' && hasCat && !hasDog) {
          categoryFixes.push({
            product_id: p.id || p.product_id,
            oldCategory: p.category,
            newCategory: 'Cats'
          });
          if (!dryRun) {
            p.category = 'Cats';
            p.pet_type = 'cat';
          }
          stats.categoryFixes++;
        } else if (p.category === 'Cats' && hasDog && !hasCat) {
          categoryFixes.push({
            product_id: p.id || p.product_id,
            oldCategory: p.category,
            newCategory: 'Dogs'
          });
          if (!dryRun) {
            p.category = 'Dogs';
            p.pet_type = 'dog';
          }
          stats.categoryFixes++;
        }
      }
      
      newProducts.push(p);
    }
    
    if (!dryRun) {
      saveCatalog(mode === 'delete' ? newProducts : products);
      
      const auditPath = path.join(__dirname, '..', 'data', 'catalog-cleanup-audit.jsonl');
      const auditEntry = {
        ...stats,
        affectedIds: affectedItems.map(a => a.product_id).slice(0, 100)
      };
      fs.appendFileSync(auditPath, JSON.stringify(auditEntry) + '\n');
      
      if (global.refreshCatalogCache) {
        global.refreshCatalogCache();
      }
    }
    
    stats.newTotal = newProducts.length;
    
    console.log(`[Admin Catalog] Purge non-pet (${mode}, dryRun=${dryRun}): ${stats.affected} affected, ${stats.categoryFixes} category fixes`);
    
    res.json({
      ok: true,
      ...stats,
      affected: affectedItems.slice(0, 100),
      categoryFixes: categoryFixes.slice(0, 50),
      backupPath: backupResult?.path || null
    });
    
  } catch (err) {
    console.error('[Admin Catalog] Purge non-pet error:', err);
    res.status(500).json({ ok: false, error: 'Purge failed', message: err.message });
  }
});

router.get('/schema', requireAdminSession, (req, res) => {
  res.json({
    headers: CATALOG_CSV_HEADERS,
    description: {
      product_id: 'Unique product identifier (required)',
      slug: 'URL-friendly slug (auto-generated if empty)',
      title: 'Product title',
      description: 'Product description',
      category: 'Main category (Dogs|Cats|Small Pets|etc)',
      sub_category: 'Subcategory',
      pet_type: 'dog|cat|small_pets|both|unknown',
      is_pet_product: 'true|false',
      active: 'true|false',
      tags: 'Pipe-separated tags (e.g., crate|outdoor|travel)',
      cj_product_id: 'CJ Dropshipping product ID',
      cj_spu: 'CJ Dropshipping SPU',
      cost: 'Cost price in USD',
      price: 'Selling price in USD',
      currency: 'Currency code (default: USD)',
      images: 'JSON array of image URLs',
      variants: 'JSON array of variant objects',
      updated_at: 'ISO timestamp'
    },
    petOnlyRules: {
      blacklist: NON_PET_BLACKLIST.slice(0, 20),
      whitelist: PET_WHITELIST.slice(0, 20),
      note: 'Products matching blacklist without whitelist are auto-disabled'
    }
  });
});

module.exports = router;
