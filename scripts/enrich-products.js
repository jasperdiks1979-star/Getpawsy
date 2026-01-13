#!/usr/bin/env node
/**
 * Product Enrichment Script
 * Adds premium PDP content (SEO, highlights, benefits, FAQ) to CJ pet products
 * 
 * MODE 1 (fallback): Uses CJ data + templates
 * MODE 2 (AI): Uses OpenAI GPT-4o-mini for US-market copy
 * 
 * Usage: node scripts/enrich-products.js [--limit=250] [--ai] [--source=cj-petlist-import]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '250');
const USE_AI = args.includes('--ai') || !!OPENAI_API_KEY;
const SOURCE_FILTER = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'cj-petlist-import';
const DRY_RUN = args.includes('--dry-run');

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║           GetPawsy Product Enrichment Script v1.0                 ║
╠═══════════════════════════════════════════════════════════════════╣
║  Mode: ${USE_AI ? 'AI (GPT-4o-mini)' : 'Fallback (template-based)'}
║  Limit: ${LIMIT} products
║  Source: ${SOURCE_FILTER}
║  Dry Run: ${DRY_RUN}
╚═══════════════════════════════════════════════════════════════════╝
`);

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function saveDB(db) {
  if (DRY_RUN) {
    console.log('[DRY RUN] Would save DB with changes');
    return;
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-&']/g, '')
    .trim()
    .slice(0, 80);
}

function extractPetType(product) {
  const text = `${product.title || ''} ${product.description || ''}`.toLowerCase();
  if (text.includes('dog') || text.includes('puppy') || text.includes('canine')) return 'dog';
  if (text.includes('cat') || text.includes('kitten') || text.includes('feline')) return 'cat';
  return 'pet';
}

function extractProductType(product) {
  const text = `${product.title || ''} ${product.subcategorySlug || ''}`.toLowerCase();
  if (text.includes('toy')) return 'toy';
  if (text.includes('bed') || text.includes('cushion')) return 'bed';
  if (text.includes('bowl') || text.includes('feeder')) return 'bowl';
  if (text.includes('collar') || text.includes('leash') || text.includes('harness')) return 'accessory';
  if (text.includes('groom') || text.includes('brush')) return 'grooming';
  if (text.includes('cloth') || text.includes('costume')) return 'clothing';
  if (text.includes('treat') || text.includes('food')) return 'food';
  return 'product';
}

function generateFallbackContent(product) {
  const petType = extractPetType(product);
  const productType = extractProductType(product);
  const title = cleanTitle(product.title || product.cjTitle || 'Pet Product');
  const petName = petType === 'dog' ? 'pup' : petType === 'cat' ? 'kitty' : 'furry friend';
  const petFull = petType === 'dog' ? 'dog' : petType === 'cat' ? 'cat' : 'pet';
  
  const seoTitle = `${title} | Premium ${petFull.charAt(0).toUpperCase() + petFull.slice(1)} ${productType.charAt(0).toUpperCase() + productType.slice(1)} - GetPawsy`.slice(0, 70);
  
  const seoDescription = `Treat your ${petName} to this ${title.toLowerCase()}. Quality ${productType} designed for comfort and durability. Fast US shipping, 30-day returns. Shop now!`.slice(0, 160);
  
  const highlightTemplates = {
    toy: [
      'Safe, non-toxic materials for worry-free play',
      'Durable construction withstands rough play',
      'Promotes healthy exercise and mental stimulation',
      'Perfect size for hours of fun',
      'Easy to clean and maintain'
    ],
    bed: [
      'Ultra-soft materials for maximum comfort',
      'Machine washable cover for easy cleaning',
      'Non-slip bottom keeps bed in place',
      'Orthopedic support for joints',
      'Cozy design your pet will love'
    ],
    bowl: [
      'Food-grade safe materials',
      'Non-slip base prevents spills',
      'Easy to clean and dishwasher safe',
      'Perfect portion size',
      'Durable construction for daily use'
    ],
    accessory: [
      'Adjustable for perfect fit',
      'Strong, durable hardware',
      'Comfortable padding prevents irritation',
      'Reflective elements for night safety',
      'Weather-resistant materials'
    ],
    grooming: [
      'Gentle on sensitive skin',
      'Reduces shedding effectively',
      'Ergonomic handle for comfort',
      'Professional-quality results',
      'Easy to clean after use'
    ],
    clothing: [
      'Soft, breathable fabrics',
      'Easy on/off design',
      'Machine washable',
      'Stylish and functional',
      'Comfortable fit that allows movement'
    ],
    product: [
      'Premium quality materials',
      'Designed with your pet in mind',
      'Durable and long-lasting',
      'Easy to use and maintain',
      'Great value for pet parents'
    ]
  };
  
  const benefitTemplates = {
    dog: [
      `Keep your ${petName} happy and entertained`,
      'Strengthen the bond with your furry companion',
      'Support their health and wellbeing'
    ],
    cat: [
      `Satisfy your ${petName}'s natural instincts`,
      'Create a comfortable space they\'ll love',
      'Support their curiosity and playfulness'
    ],
    pet: [
      'Enhance your pet\'s daily life',
      'Show them how much you care',
      'Quality that lasts'
    ]
  };
  
  const faqTemplates = [
    {
      question: 'Is this safe for my pet?',
      answer: 'Yes! All GetPawsy products are made with pet-safe, non-toxic materials that meet strict quality standards.'
    },
    {
      question: 'How long does shipping take?',
      answer: 'Orders ship from our US warehouse within 1-3 business days. Delivery typically takes 5-10 business days depending on your location.'
    },
    {
      question: 'What if my pet doesn\'t like it?',
      answer: 'We offer hassle-free 30-day returns. If your pet isn\'t satisfied, neither are we!'
    }
  ];
  
  return {
    seo_title: seoTitle,
    seo_description: seoDescription,
    short_title: title.slice(0, 50),
    highlights: highlightTemplates[productType] || highlightTemplates.product,
    benefits: benefitTemplates[petType] || benefitTemplates.pet,
    faq: faqTemplates,
    shipping_copy: 'Ships from US warehouse in 1-3 days. Estimated delivery: 5-10 business days.',
    returns_copy: '30-Day Happiness Guarantee: Not satisfied? Return it hassle-free for a full refund.',
    enriched_at: new Date().toISOString(),
    enrichment_mode: 'fallback'
  };
}

async function generateAIContent(product) {
  if (!OPENAI_API_KEY) {
    return generateFallbackContent(product);
  }
  
  const petType = extractPetType(product);
  const productType = extractProductType(product);
  const title = cleanTitle(product.title || product.cjTitle || 'Pet Product');
  const description = product.description || product.cjDescription || '';
  
  const prompt = `You are a premium pet product copywriter for GetPawsy, an American pet e-commerce brand.

Write compelling, conversion-focused product copy for this ${petType} ${productType}:

Product: ${title}
Description: ${description.slice(0, 500)}
Category: ${product.mainCategorySlug || 'pets'} > ${product.subcategorySlug || productType}
Price: $${product.price || 'N/A'}

Generate JSON with these EXACT fields:
{
  "seo_title": "60-70 chars, include product name and GetPawsy",
  "seo_description": "150-160 chars, compelling meta description with call-to-action",
  "short_title": "Clean product name, max 50 chars",
  "highlights": ["5 bullet points about product features"],
  "benefits": ["3 bullet points about customer benefits"],
  "faq": [{"question": "Q1", "answer": "A1"}, {"question": "Q2", "answer": "A2"}, {"question": "Q3", "answer": "A3"}]
}

RULES:
- Write in American English
- No medical claims or "guaranteed cure" language
- Focus on comfort, safety, quality, fun
- Be warm, playful, trustworthy - not salesy
- Keep it concise and scannable
- Must be valid JSON only, no markdown`;

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 800
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.error) {
            console.error(`[AI Error] ${response.error.message}`);
            resolve(generateFallbackContent(product));
            return;
          }
          
          const content = response.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.warn('[AI] Could not parse JSON, using fallback');
            resolve(generateFallbackContent(product));
            return;
          }
          
          const aiContent = JSON.parse(jsonMatch[0]);
          resolve({
            seo_title: (aiContent.seo_title || '').slice(0, 70),
            seo_description: (aiContent.seo_description || '').slice(0, 160),
            short_title: (aiContent.short_title || title).slice(0, 50),
            highlights: Array.isArray(aiContent.highlights) ? aiContent.highlights.slice(0, 5) : [],
            benefits: Array.isArray(aiContent.benefits) ? aiContent.benefits.slice(0, 3) : [],
            faq: Array.isArray(aiContent.faq) ? aiContent.faq.slice(0, 3) : [],
            shipping_copy: 'Ships from US warehouse in 1-3 days. Estimated delivery: 5-10 business days.',
            returns_copy: '30-Day Happiness Guarantee: Not satisfied? Return it hassle-free for a full refund.',
            enriched_at: new Date().toISOString(),
            enrichment_mode: 'ai'
          });
        } catch (e) {
          console.warn(`[AI] Parse error: ${e.message}, using fallback`);
          resolve(generateFallbackContent(product));
        }
      });
    });

    req.on('error', (e) => {
      console.warn(`[AI] Request error: ${e.message}, using fallback`);
      resolve(generateFallbackContent(product));
    });
    
    req.on('timeout', () => {
      req.destroy();
      console.warn('[AI] Request timeout, using fallback');
      resolve(generateFallbackContent(product));
    });

    req.write(data);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const db = loadDB();
  
  const targetProducts = db.products.filter(p => {
    if (SOURCE_FILTER && p.source !== SOURCE_FILTER) return false;
    if (p.enrichment_mode) return false;
    return true;
  }).slice(0, LIMIT);
  
  console.log(`Found ${targetProducts.length} products to enrich\n`);
  
  if (targetProducts.length === 0) {
    console.log('No products need enrichment. Exiting.');
    process.exit(0);
  }
  
  const stats = {
    enriched: 0,
    ai_used: 0,
    fallback_used: 0,
    errors: [],
    missing_images: 0
  };
  
  for (let i = 0; i < targetProducts.length; i++) {
    const product = targetProducts[i];
    const progress = `[${i + 1}/${targetProducts.length}]`;
    
    try {
      console.log(`${progress} Enriching: ${product.title?.slice(0, 50)}...`);
      
      let content;
      if (USE_AI && i < 50) {
        content = await generateAIContent(product);
        if (content.enrichment_mode === 'ai') {
          stats.ai_used++;
        } else {
          stats.fallback_used++;
        }
        await sleep(200);
      } else {
        content = generateFallbackContent(product);
        stats.fallback_used++;
      }
      
      const productIndex = db.products.findIndex(p => p.id === product.id);
      if (productIndex !== -1) {
        Object.assign(db.products[productIndex], content);
        
        if (!db.products[productIndex].image && !db.products[productIndex].images?.length) {
          stats.missing_images++;
        }
        
        stats.enriched++;
      }
      
      if (i % 25 === 0 && i > 0) {
        console.log(`  Saving progress... (${stats.enriched} enriched)`);
        saveDB(db);
      }
      
    } catch (err) {
      console.error(`${progress} Error: ${err.message}`);
      stats.errors.push({ id: product.id, error: err.message });
      if (stats.errors.length > 10) {
        console.error('Too many errors, stopping.');
        break;
      }
    }
  }
  
  saveDB(db);
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                    ENRICHMENT COMPLETE                            ║
╠═══════════════════════════════════════════════════════════════════╣
║  Enriched: ${String(stats.enriched).padEnd(5)} products
║  AI Used:  ${String(stats.ai_used).padEnd(5)} products
║  Fallback: ${String(stats.fallback_used).padEnd(5)} products
║  Missing Images: ${String(stats.missing_images).padEnd(3)} products
║  Errors:   ${String(stats.errors.length).padEnd(5)} 
╚═══════════════════════════════════════════════════════════════════╝
`);

  if (stats.errors.length > 0) {
    console.log('Errors (first 10):');
    stats.errors.slice(0, 10).forEach(e => console.log(`  - ${e.id}: ${e.error}`));
  }
  
  return stats;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, generateFallbackContent, generateAIContent };
