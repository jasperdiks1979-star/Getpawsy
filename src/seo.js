function generateSEOMeta(options = {}) {
  const {
    title = "GetPawsy – Premium Pet Essentials with Fast US Shipping",
    description = "Shop premium dog & cat products with fast US shipping. Pawsy AI helps you choose the best for your pet.",
    url = "https://getpawsy.com",
    image = "https://getpawsy.com/img/og-image.png",
    type = "website"
  } = options;

  return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta charset="utf-8" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
  `;
}

function generateProductStructuredData(product) {
  if (!product) return "";

  const offers = product.variants && product.variants.length > 0
    ? {
        "@type": "AggregateOffer",
        "priceCurrency": "USD",
        "lowPrice": Math.min(...product.variants.map(v => v.price || product.price)),
        "highPrice": Math.max(...product.variants.map(v => v.price || product.price)),
        "offerCount": product.variants.length,
        "availability": "https://schema.org/InStock"
      }
    : {
        "@type": "Offer",
        "priceCurrency": "USD",
        "price": (product.price || 0).toFixed(2),
        "availability": "https://schema.org/InStock"
      };

  const skus = product.variants && product.variants.length > 0
    ? product.variants.map(v => v.sku).filter(Boolean)
    : [product.id];

  const structured = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.title || "",
    "description": (product.description || "").substring(0, 500),
    "image": product.image || "",
    "sku": skus.join(", "),
    "offers": offers,
    "brand": {
      "@type": "Brand",
      "name": "GetPawsy"
    }
  };

  return `<script type="application/ld+json">${JSON.stringify(structured)}</script>`;
}

function generateOrganizationStructuredData() {
  const structured = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "GetPawsy",
    "url": "https://getpawsy.com",
    "email": "info@skidzo.com",
    "sameAs": []
  };

  return `<script type="application/ld+json">${JSON.stringify(structured)}</script>`;
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function injectSEOIntoHTML(html, seoMeta, structuredData = "", hreflangTags = "") {
  let result = html;
  result = result.replace("<!-- SEO_META -->", seoMeta + hreflangTags);
  result = result.replace("<!-- STRUCTURED_DATA -->", structuredData);
  return result;
}

function generateHreflangTags(path, baseUrl = "https://getpawsy.pet") {
  const languages = [
    { code: 'en', locale: 'en-US' },
    { code: 'nl', locale: 'nl-NL' }
  ];
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  let tags = languages.map(({ code, locale }) => 
    `<link rel="alternate" hreflang="${code}" href="${baseUrl}${cleanPath}?lang=${code}" />`
  ).join('\n    ');
  
  tags += `\n    <link rel="alternate" hreflang="x-default" href="${baseUrl}${cleanPath}" />`;
  
  return `\n    ${tags}`;
}

function generateProductSEOMeta(product, baseUrl) {
  if (!product) return generateSEOMeta({});
  
  const title = `${product.title} | GetPawsy – Premium Pet Essentials`;
  const description = product.description 
    ? product.description.substring(0, 155) + (product.description.length > 155 ? '...' : '')
    : `Shop ${product.title} with fast US shipping. Pawsy AI helps you choose the best for your pet.`;
  const url = `${baseUrl}/product/${product.id}`;
  const image = product.image && !product.image.includes('placeholder') 
    ? (product.image.startsWith('http') ? product.image : `${baseUrl}${product.image}`)
    : `${baseUrl}/img/og-image.png`;

  return generateSEOMeta({
    title,
    description,
    url,
    image,
    type: "product"
  });
}

function generateSitemap(products = [], host = "getpawsy.com", collections = []) {
  const baseUrl = `https://${host}`;
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <priority>1.0</priority>
    <changefreq>daily</changefreq>
  </url>
  <url>
    <loc>${baseUrl}/dogs</loc>
    <priority>0.9</priority>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>${baseUrl}/cats</loc>
    <priority>0.9</priority>
    <changefreq>weekly</changefreq>
  </url>`;

  if (collections && Array.isArray(collections)) {
    collections.forEach(c => {
      xml += `
  <url>
    <loc>${baseUrl}/collections/${c.slug}</loc>
    <priority>0.85</priority>
    <changefreq>weekly</changefreq>
  </url>`;
    });
  }

  if (products && Array.isArray(products)) {
    products.forEach(p => {
      xml += `
  <url>
    <loc>${baseUrl}/product/${p.id}</loc>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>`;
    });
  }

  xml += `
</urlset>`;

  return xml;
}

module.exports = {
  generateSEOMeta,
  generateProductSEOMeta,
  generateProductStructuredData,
  generateOrganizationStructuredData,
  escapeHtml,
  injectSEOIntoHTML,
  generateSitemap,
  generateHreflangTags
};
