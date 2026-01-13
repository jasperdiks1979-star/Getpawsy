// ========================================
// PET PROFILE PERSONALIZATION SYSTEM
// ========================================
const PET_PROFILE_KEY = 'getpawsy_pet_profile';
const PET_PROFILE_MODAL_SHOWN = 'getpawsy_profile_modal_shown';

const PetProfile = {
  defaults: {
    petType: null,
    ageGroup: null,
    size: null,
    traits: [],
    createdAt: null,
    updatedAt: null
  },

  get() {
    try {
      const stored = localStorage.getItem(PET_PROFILE_KEY);
      if (!stored) return null;
      const profile = JSON.parse(stored);
      window.PAWSY_PET_PROFILE = Object.freeze({ ...profile });
      return profile;
    } catch (e) {
      console.warn('[PetProfile] Failed to load:', e);
      return null;
    }
  },

  save(profile) {
    try {
      const now = new Date().toISOString();
      const data = {
        ...this.defaults,
        ...profile,
        updatedAt: now,
        createdAt: profile.createdAt || now
      };
      localStorage.setItem(PET_PROFILE_KEY, JSON.stringify(data));
      window.PAWSY_PET_PROFILE = Object.freeze({ ...data });
      console.log('[PetProfile] Saved:', data);
      return data;
    } catch (e) {
      console.error('[PetProfile] Failed to save:', e);
      return null;
    }
  },

  clear() {
    localStorage.removeItem(PET_PROFILE_KEY);
    window.PAWSY_PET_PROFILE = null;
  },

  hasProfile() {
    const p = this.get();
    return p && p.petType;
  },

  shouldShowModal() {
    if (this.hasProfile()) return false;
    const shown = localStorage.getItem(PET_PROFILE_MODAL_SHOWN);
    return !shown;
  },

  markModalShown() {
    localStorage.setItem(PET_PROFILE_MODAL_SHOWN, 'true');
  },

  matchesProduct(product) {
    const profile = this.get();
    if (!profile || !profile.petType) return true;
    
    const pType = (product.petType || '').toLowerCase();
    const uType = profile.petType.toLowerCase();
    
    if (pType === 'both') return true;
    if (pType === uType) return true;
    if (!pType) return true;
    return false;
  },

  getRelevanceScore(product) {
    const profile = this.get();
    if (!profile) return 0;
    
    let score = 0;
    const text = ((product.title || '') + ' ' + (product.description || '')).toLowerCase();
    
    if (profile.petType === 'dog') {
      if (text.includes('dog') || text.includes('puppy')) score += 2;
    } else if (profile.petType === 'cat') {
      if (text.includes('cat') || text.includes('kitten')) score += 2;
    }
    
    if (profile.ageGroup === 'puppy' || profile.ageGroup === 'kitten') {
      if (text.includes('puppy') || text.includes('kitten') || text.includes('young')) score += 1;
    } else if (profile.ageGroup === 'senior') {
      if (text.includes('senior') || text.includes('older') || text.includes('comfort')) score += 1;
    }
    
    if (profile.size) {
      if (text.includes(profile.size)) score += 1;
    }
    
    if (profile.traits && profile.traits.length) {
      profile.traits.forEach(trait => {
        if (text.includes(trait)) score += 1;
      });
    }
    
    return score;
  }
};

window.PetProfile = PetProfile;
window.PAWSY_PET_PROFILE = PetProfile.get();

function usePetProfile() {
  return {
    profile: PetProfile.get(),
    save: PetProfile.save.bind(PetProfile),
    clear: PetProfile.clear.bind(PetProfile),
    hasProfile: PetProfile.hasProfile.bind(PetProfile),
    matchesProduct: PetProfile.matchesProduct.bind(PetProfile)
  };
}

window.usePetProfile = usePetProfile;

function showPetProfileModal() {
  if (document.getElementById('petProfileModal')) return;
  
  const modal = document.createElement('div');
  modal.id = 'petProfileModal';
  modal.className = 'pet-profile-modal';
  modal.innerHTML = `
    <div class="pet-profile-overlay" onclick="closePetProfileModal()"></div>
    <div class="pet-profile-content">
      <button class="pet-profile-close" onclick="closePetProfileModal()" aria-label="Close">&times;</button>
      <div class="pet-profile-header">
        <span class="pet-profile-icon">🐾</span>
        <h2>Tell Pawsy about your pet</h2>
        <p>So we can pick the best products for you (20 seconds)</p>
      </div>
      
      <form id="petProfileForm" class="pet-profile-form">
        <div class="pet-profile-step active" data-step="1">
          <label class="pet-profile-label">What type of pet do you have?</label>
          <div class="pet-profile-options pet-type-options">
            <button type="button" class="pet-option" data-value="dog" data-field="petType">
              <span class="pet-option-icon">🐕</span>
              <span class="pet-option-text">Dog</span>
            </button>
            <button type="button" class="pet-option" data-value="cat" data-field="petType">
              <span class="pet-option-icon">🐈</span>
              <span class="pet-option-text">Cat</span>
            </button>
          </div>
        </div>
        
        <div class="pet-profile-step" data-step="2">
          <label class="pet-profile-label">How old is your pet?</label>
          <div class="pet-profile-options">
            <button type="button" class="pet-option" data-value="puppy" data-field="ageGroup">
              <span class="pet-option-text">Young (under 1 year)</span>
            </button>
            <button type="button" class="pet-option" data-value="adult" data-field="ageGroup">
              <span class="pet-option-text">Adult (1-7 years)</span>
            </button>
            <button type="button" class="pet-option" data-value="senior" data-field="ageGroup">
              <span class="pet-option-text">Senior (7+ years)</span>
            </button>
          </div>
        </div>
        
        <div class="pet-profile-step" data-step="3">
          <label class="pet-profile-label">What size is your pet?</label>
          <div class="pet-profile-options">
            <button type="button" class="pet-option" data-value="small" data-field="size">
              <span class="pet-option-text">Small</span>
            </button>
            <button type="button" class="pet-option" data-value="medium" data-field="size">
              <span class="pet-option-text">Medium</span>
            </button>
            <button type="button" class="pet-option" data-value="large" data-field="size">
              <span class="pet-option-text">Large</span>
            </button>
          </div>
        </div>
        
        <div class="pet-profile-step" data-step="4">
          <label class="pet-profile-label">Any special traits? (optional)</label>
          <div class="pet-profile-options traits-options">
            <button type="button" class="pet-option trait-option" data-value="active" data-field="traits">Active</button>
            <button type="button" class="pet-option trait-option" data-value="anxious" data-field="traits">Anxious</button>
            <button type="button" class="pet-option trait-option" data-value="indoor" data-field="traits">Indoor</button>
            <button type="button" class="pet-option trait-option" data-value="outdoor" data-field="traits">Outdoor</button>
            <button type="button" class="pet-option trait-option" data-value="sensitive" data-field="traits">Sensitive</button>
          </div>
          <button type="button" class="btn pet-profile-submit" onclick="submitPetProfile()">
            Find My Products
          </button>
        </div>
      </form>
      
      <button class="pet-profile-skip" onclick="skipPetProfile()">
        Skip for now
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  setTimeout(() => modal.classList.add('active'), 10);
  
  const form = document.getElementById('petProfileForm');
  const profileData = { petType: null, ageGroup: null, size: null, traits: [] };
  let currentStep = 1;
  
  form.querySelectorAll('.pet-option').forEach(btn => {
    btn.addEventListener('click', function() {
      const field = this.dataset.field;
      const value = this.dataset.value;
      
      if (field === 'traits') {
        this.classList.toggle('selected');
        if (this.classList.contains('selected')) {
          if (!profileData.traits.includes(value)) {
            profileData.traits.push(value);
          }
        } else {
          profileData.traits = profileData.traits.filter(t => t !== value);
        }
      } else {
        this.closest('.pet-profile-options').querySelectorAll('.pet-option').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        profileData[field] = value;
        
        setTimeout(() => {
          currentStep++;
          showStep(currentStep);
        }, 200);
      }
      
      window._petProfileFormData = profileData;
    });
  });
  
  function showStep(step) {
    form.querySelectorAll('.pet-profile-step').forEach(s => {
      s.classList.remove('active');
      if (parseInt(s.dataset.step) === step) {
        s.classList.add('active');
      }
    });
  }
  
  console.log('[PetProfile] Modal shown');
}

function closePetProfileModal() {
  const modal = document.getElementById('petProfileModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
  PetProfile.markModalShown();
}

function skipPetProfile() {
  closePetProfileModal();
  console.log('[PetProfile] Skipped by user');
}

function submitPetProfile() {
  const data = window._petProfileFormData || {};
  if (!data.petType) {
    alert('Please select your pet type');
    return;
  }
  
  PetProfile.save(data);
  closePetProfileModal();
  
  if (typeof refreshHomepageForProfile === 'function') {
    refreshHomepageForProfile();
  }
  
  console.log('[PetProfile] Profile submitted:', data);
}

window.showPetProfileModal = showPetProfileModal;
window.closePetProfileModal = closePetProfileModal;
window.skipPetProfile = skipPetProfile;
window.submitPetProfile = submitPetProfile;

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (PetProfile.shouldShowModal() && window.location.pathname === '/') {
      showPetProfileModal();
    }
  }, 2000);
});

console.log('[PetProfile] Module loaded');
