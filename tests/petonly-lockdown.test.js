import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5000';

describe('PET-ONLY LOCKDOWN MODE', () => {
  
  describe('/api/products endpoint', () => {
    
    it('should exclude products with "sock" in title', async () => {
      const res = await fetch(`${BASE_URL}/api/products?limit=1000&fields=listing`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      const sockProducts = data.items.filter(p => 
        (p.title || '').toLowerCase().includes('sock')
      );
      
      expect(sockProducts.length).toBe(0);
    });
    
    it('should exclude products in "office" category', async () => {
      const res = await fetch(`${BASE_URL}/api/products?limit=1000&fields=listing`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      const officeProducts = data.items.filter(p => {
        const title = (p.title || '').toLowerCase();
        return title.includes('office chair') || 
               title.includes('desk chair') ||
               title.includes('office desk');
      });
      
      expect(officeProducts.length).toBe(0);
    });
    
    it('should only return pet products (dogs, cats, small_pets)', async () => {
      const res = await fetch(`${BASE_URL}/api/products?limit=100&fields=listing`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      
      const validPetTypes = ['dog', 'dogs', 'cat', 'cats', 'both', 'small_pets', 'small-pets', 'smallpets', 'rabbit', 'hamster', 'guinea_pig', 'bird', 'fish', 'reptile', 'ferret'];
      
      for (const item of data.items) {
        const petType = (item.pet_type || '').toLowerCase();
        if (petType) {
          const isValid = validPetTypes.some(vt => petType.includes(vt));
          expect(isValid).toBe(true);
        }
      }
    });
    
    it('should return debug stats when debug=1', async () => {
      const res = await fetch(`${BASE_URL}/api/products?debug=1&limit=10`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data._debug).toBeDefined();
      expect(data._debug.lockdownEnabled).toBe(true);
      expect(data._debug.petOnlyMode).toBeDefined();
      expect(data._debug.countBefore).toBeGreaterThan(0);
      expect(data._debug.countAfterPetFilter).toBeDefined();
    });
    
  });
  
  describe('isPetApproved function', () => {
    
    it('should reject human clothing products', async () => {
      const { isPetApproved } = await import('../src/lib/petOnlyEngine.js');
      
      const humanProduct = {
        id: 'test-sock',
        title: 'Warm Winter Socks for Women',
        category: 'clothing',
        active: true,
        price: 9.99,
        images: ['https://example.com/sock.jpg']
      };
      
      const result = isPetApproved(humanProduct);
      expect(result.approved).toBe(false);
      expect(result.reason).toBeDefined();
    });
    
    it('should reject office furniture products', async () => {
      const { isPetApproved } = await import('../src/lib/petOnlyEngine.js');
      
      const officeProduct = {
        id: 'test-chair',
        title: 'Ergonomic Office Chair',
        category: 'furniture',
        active: true,
        price: 199.99,
        images: ['https://example.com/chair.jpg']
      };
      
      const result = isPetApproved(officeProduct);
      expect(result.approved).toBe(false);
      expect(result.reason).toBeDefined();
    });
    
    it('should approve dog products', async () => {
      const { isPetApproved } = await import('../src/lib/petOnlyEngine.js');
      
      const dogProduct = {
        id: 'test-dog-collar',
        title: 'Premium Dog Collar with Reflective Strip',
        category: 'dogs',
        pet_type: 'dog',
        active: true,
        is_pet_product: true,
        price: 24.99,
        images: ['https://example.com/collar.jpg']
      };
      
      const result = isPetApproved(dogProduct);
      expect(result.approved).toBe(true);
      expect(result.pet_type).toBe('dog');
    });
    
    it('should approve cat products', async () => {
      const { isPetApproved } = await import('../src/lib/petOnlyEngine.js');
      
      const catProduct = {
        id: 'test-cat-toy',
        title: 'Interactive Cat Toy with Feathers',
        category: 'cats',
        pet_type: 'cat',
        active: true,
        is_pet_product: true,
        price: 12.99,
        images: ['https://example.com/cattoy.jpg']
      };
      
      const result = isPetApproved(catProduct);
      expect(result.approved).toBe(true);
      expect(result.pet_type).toBe('cat');
    });
    
    it('should reject inactive products', async () => {
      const { isPetApproved } = await import('../src/lib/petOnlyEngine.js');
      
      const inactiveProduct = {
        id: 'test-inactive',
        title: 'Dog Leash',
        category: 'dogs',
        pet_type: 'dog',
        active: false,
        is_pet_product: true,
        price: 19.99,
        images: ['https://example.com/leash.jpg']
      };
      
      const result = isPetApproved(inactiveProduct);
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('inactive');
    });
    
    it('should reject products without images', async () => {
      const { isPetApproved } = await import('../src/lib/petOnlyEngine.js');
      
      const noImageProduct = {
        id: 'test-no-image',
        title: 'Dog Bowl',
        category: 'dogs',
        pet_type: 'dog',
        active: true,
        is_pet_product: true,
        price: 14.99,
        images: []
      };
      
      const result = isPetApproved(noImageProduct);
      expect(result.approved).toBe(false);
      expect(result.reason).toBe('no_valid_image');
    });
    
    it('should allow pet clothing (dog hoodie)', async () => {
      const { isPetApproved } = await import('../src/lib/petOnlyEngine.js');
      
      const dogClothing = {
        id: 'test-dog-hoodie',
        title: 'Warm Dog Hoodie Winter Coat',
        category: 'dogs',
        pet_type: 'dog',
        active: true,
        is_pet_product: true,
        price: 29.99,
        images: ['https://example.com/doghoodie.jpg']
      };
      
      const result = isPetApproved(dogClothing);
      expect(result.approved).toBe(true);
    });
    
  });
  
  describe('SEO bulk job pet-only filter', () => {
    
    it('should only include pet-approved products', async () => {
      const { getProductsForMode } = await import('../src/seoBulkJob.js');
      const { isPetApproved } = await import('../src/lib/petOnlyEngine.js');
      
      const products = getProductsForMode('all', true);
      
      for (const product of products.slice(0, 10)) {
        const check = isPetApproved(product);
        expect(check.approved).toBe(true);
      }
    });
    
  });
  
});
