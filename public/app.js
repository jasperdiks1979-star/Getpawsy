const $ = (id) => document.getElementById(id);

async function loadHomeSections() {
  const sections = [
    { id: 'dogGrid', petType: 'dog' },
    { id: 'catGrid', petType: 'cat' },
    { id: 'smallPetGrid', petType: 'small' },
    { id: 'bestSellersGrid', limit: 12 },
    { id: 'trendingGrid', limit: 12 }
  ];

  for (const section of sections) {
    const el = document.getElementById(section.id);
    if (!el) continue;

    try {
      let url = `/api/products?limit=${section.limit || 12}&fields=listing`;
      if (section.petType) url += `&petType=${section.petType}`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      let items = (data && data.items && data.items.length > 0) ? data.items : [];
      
      if (items.length === 0) {
        const fallbackRes = await fetch('/api/products?limit=12&fields=listing');
        const fallbackData = await fallbackRes.json();
        if (fallbackData && fallbackData.items) items = fallbackData.items;
      }

      if (items.length > 0) {
        el.innerHTML = items.map(p => {
          const petType = p.petType || p.pet_type || '';
          const petTypeBadge = petType ? `<span class="pet-type-pill pet-type-${petType}">${petType==='dog'?'🐕 Dog':petType==='cat'?'🐱 Cat':'🐾 Both'}</span>` : '';
          const image = p.thumbImage || p.resolved_image || '/images/placeholder-pawsy.webp';
          const price = typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : (p.price || '');
          
          return `
            <div class="product-card" data-id="${p.id}">
              <a href="/product/${p.slug || p.id}" class="product-link">
                <div class="product-image-wrap">
                  <img src="${image}" alt="${p.title}" loading="lazy" class="product-image">
                  ${p.is_best_seller ? '<span class="badge badge-best">Best Seller</span>' : ''}
                  ${petTypeBadge}
                </div>
                <div class="product-info">
                  <h3 class="product-title">${p.title}</h3>
                  <div class="product-meta">
                    <span class="product-price">${price}</span>
                  </div>
                </div>
              </a>
            </div>
          `;
        }).join('');
        
        const wrap = el.closest('.product-carousel-wrap');
        if (wrap) {
          const track = wrap.querySelector('.product-carousel-track');
          const prev = wrap.querySelector('.prev');
          const next = wrap.querySelector('.next');
          if (track && prev && next) {
            prev.onclick = (e) => { e.preventDefault(); track.scrollBy({ left: -300, behavior: 'smooth' }); };
            next.onclick = (e) => { e.preventDefault(); track.scrollBy({ left: 300, behavior: 'smooth' }); };
          }
        }
        el.closest('section')?.classList.remove('hidden');
      }
    } catch (err) {
      // Production silent error
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHomeSections);
} else {
  loadHomeSections();
}
document.addEventListener('pawsy:navigate', loadHomeSections);
