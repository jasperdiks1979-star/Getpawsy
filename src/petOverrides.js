const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const OVERRIDES_FILE = path.join(__dirname, '..', 'data', 'pet_overrides.json');

function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_FILE)) {
      return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`[PetOverrides] Error loading overrides: ${e.message}`);
  }
  return { approved: {}, updatedAt: null };
}

function saveOverrides(data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(data, null, 2));
}

function isOverrideApproved(productId) {
  const data = loadOverrides();
  const override = data.approved[productId];
  return override && override.active === true;
}

function getOverride(productId) {
  const data = loadOverrides();
  return data.approved[productId] || null;
}

function approveProduct(productId, { reason, adminUser = 'admin', originalRejectReason = null }) {
  const data = loadOverrides();
  
  data.approved[productId] = {
    active: true,
    reason: reason || 'Admin override',
    originalRejectReason,
    approvedBy: adminUser,
    approvedAt: new Date().toISOString()
  };
  
  saveOverrides(data);
  log(`[PetOverrides] Product ${productId} force-approved by ${adminUser}: ${reason}`);
  return data.approved[productId];
}

function revokeApproval(productId, adminUser = 'admin') {
  const data = loadOverrides();
  
  if (data.approved[productId]) {
    data.approved[productId].active = false;
    data.approved[productId].revokedBy = adminUser;
    data.approved[productId].revokedAt = new Date().toISOString();
    saveOverrides(data);
    log(`[PetOverrides] Product ${productId} approval revoked by ${adminUser}`);
    return true;
  }
  return false;
}

function listOverrides() {
  const data = loadOverrides();
  return Object.entries(data.approved).map(([productId, info]) => ({
    productId,
    ...info
  }));
}

function getActiveOverrides() {
  return listOverrides().filter(o => o.active === true);
}

module.exports = {
  isOverrideApproved,
  getOverride,
  approveProduct,
  revokeApproval,
  listOverrides,
  getActiveOverrides
};
