/**
 * CJ Dropshipping API Client
 * Provides authenticated access to CJ API for product details, variants, and inventory
 * 
 * API Documentation: https://developers.cjdropshipping.cn/en/api/api2/api/product.html
 */

const axios = require('axios');

const CJ_BASE_URL = process.env.CJ_API_BASE || 'https://developers.cjdropshipping.com/api2.0/v1';
const CJ_EMAIL = process.env.CJ_EMAIL;
const CJ_API_KEY = process.env.CJ_API_KEY;

let cachedToken = null;
let tokenExpiry = 0;
const TOKEN_BUFFER_MS = 5 * 60 * 1000;

/**
 * Get access token for CJ API
 * Caches token and refreshes before expiry
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - TOKEN_BUFFER_MS) {
    return cachedToken;
  }

  if (!CJ_EMAIL || !CJ_API_KEY) {
    throw new Error('CJ_EMAIL and CJ_API_KEY environment variables required');
  }

  try {
    const response = await axios.post(`${CJ_BASE_URL}/authentication/getAccessToken`, {
      email: CJ_EMAIL,
      password: CJ_API_KEY
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (response.data?.code === 200 && response.data?.data?.accessToken) {
      cachedToken = response.data.data.accessToken;
      const expiresIn = response.data.data.accessTokenExpiryDate 
        ? new Date(response.data.data.accessTokenExpiryDate).getTime()
        : Date.now() + 24 * 60 * 60 * 1000;
      tokenExpiry = expiresIn;
      console.log('[CJ API] Token refreshed, expires:', new Date(tokenExpiry).toISOString());
      return cachedToken;
    }

    throw new Error(response.data?.message || 'Failed to get access token');
  } catch (err) {
    console.error('[CJ API] Token error:', err.message);
    throw err;
  }
}

/**
 * Make authenticated request to CJ API
 * @param {string} endpoint - API endpoint (e.g., '/product/query')
 * @param {object} params - Query parameters
 * @param {string} method - HTTP method (GET or POST)
 * @returns {Promise<object>} API response data
 */
async function cjRequest(endpoint, params = {}, method = 'GET') {
  const token = await getAccessToken();
  
  const config = {
    method,
    url: `${CJ_BASE_URL}${endpoint}`,
    headers: {
      'CJ-Access-Token': token,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  };

  if (method === 'GET') {
    config.params = params;
  } else {
    config.data = params;
  }

  try {
    const response = await axios(config);
    
    if (response.data?.code !== 200) {
      const errorMsg = response.data?.message || 'CJ API error';
      console.error('[CJ API] Error:', errorMsg, 'Endpoint:', endpoint);
      throw new Error(errorMsg);
    }
    
    return response.data;
  } catch (err) {
    if (err.response?.status === 401) {
      cachedToken = null;
      tokenExpiry = 0;
    }
    console.error('[CJ API] Request failed:', endpoint, err.message);
    throw err;
  }
}

/**
 * Get product details by product ID (PID/SPU)
 * @param {string} pid - CJ Product ID
 * @returns {Promise<object>} Product details
 */
async function getProductDetails(pid) {
  if (!pid) throw new Error('Product ID required');
  
  const response = await cjRequest('/product/query', { pid });
  return response.data;
}

/**
 * Get all variants for a product
 * @param {string} pid - CJ Product ID
 * @returns {Promise<array>} Array of variants
 */
async function getProductVariants(pid) {
  if (!pid) throw new Error('Product ID required');
  
  try {
    const response = await cjRequest('/product/variant/query', { pid });
    return response.data?.variants || response.data || [];
  } catch (err) {
    console.warn('[CJ API] Variants fetch failed for', pid, '- returning empty');
    return [];
  }
}

/**
 * Get inventory for a product by PID
 * @param {string} pid - CJ Product ID
 * @returns {Promise<object>} Inventory data with warehouse breakdown
 */
async function getProductInventory(pid) {
  if (!pid) throw new Error('Product ID required');
  
  try {
    const response = await cjRequest('/product/stock/getInventoryByPid', { pid });
    return response.data || { inventories: [], variantInventories: [] };
  } catch (err) {
    console.warn('[CJ API] Inventory fetch failed for', pid);
    return { inventories: [], variantInventories: [] };
  }
}

/**
 * Get inventory for a product by SKU
 * @param {string} sku - CJ Variant SKU
 * @returns {Promise<object>} Inventory data
 */
async function getInventoryBySku(sku) {
  if (!sku) throw new Error('SKU required');
  
  try {
    const response = await cjRequest('/product/stock/getInventoryBySku', { sku });
    return response.data || {};
  } catch (err) {
    console.warn('[CJ API] SKU inventory fetch failed for', sku);
    return {};
  }
}

/**
 * Search products by keyword
 * @param {string} keyword - Search term
 * @param {number} pageNum - Page number (default 1)
 * @param {number} pageSize - Results per page (default 20)
 * @returns {Promise<object>} Search results with products array
 */
async function searchProducts(keyword, pageNum = 1, pageSize = 20) {
  const response = await cjRequest('/product/list', {
    productNameEn: keyword,
    pageNum,
    pageSize
  }, 'POST');
  
  return {
    products: response.data?.list || [],
    total: response.data?.total || 0,
    pageNum,
    pageSize
  };
}

/**
 * Get full product data with variants and inventory
 * @param {string} pid - CJ Product ID
 * @returns {Promise<object>} Complete product with variants and stock
 */
async function getFullProductData(pid) {
  const [details, variants, inventory] = await Promise.all([
    getProductDetails(pid),
    getProductVariants(pid),
    getProductInventory(pid)
  ]);

  return {
    product: details,
    variants: variants,
    inventory: inventory,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Test CJ API connection
 * @returns {Promise<object>} Connection status
 */
async function testConnection() {
  try {
    const token = await getAccessToken();
    return {
      success: true,
      hasToken: !!token,
      tokenExpiry: new Date(tokenExpiry).toISOString(),
      baseUrl: CJ_BASE_URL
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      baseUrl: CJ_BASE_URL
    };
  }
}

/**
 * Clear cached token (for testing or forced refresh)
 */
function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}

module.exports = {
  getAccessToken,
  cjRequest,
  getProductDetails,
  getProductVariants,
  getProductInventory,
  getInventoryBySku,
  searchProducts,
  getFullProductData,
  testConnection,
  clearTokenCache,
  CJ_BASE_URL
};
