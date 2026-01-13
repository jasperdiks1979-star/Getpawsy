#!/usr/bin/env node

const axios = require('axios');
const cjClient = require('../helpers/cjClient');

const CJ_BASE_URL = 'https://developers.cjdropshipping.com/api2.0/v1';

async function main() {
  const pid = process.argv[2] || '1992483683275927554';
  
  console.log(`Fetching product ${pid} from CJ API...`);
  
  const token = await cjClient.getAccessToken();
  
  const response = await axios.get(
    `${CJ_BASE_URL}/product/query`,
    {
      params: { pid },
      headers: { 'CJ-Access-Token': token },
      timeout: 30000
    }
  );
  
  const product = response.data?.data || response.data?.result;
  
  if (!product) {
    console.log('No product found');
    console.log('Full response:', JSON.stringify(response.data, null, 2));
    return;
  }
  
  console.log('\n=== PRODUCT INFO ===');
  console.log('pid:', product.pid);
  console.log('productNameEn:', product.productNameEn?.substring(0, 80));
  console.log('productKeyEn:', product.productKeyEn);
  console.log('productType:', product.productType);
  
  console.log('\n=== VARIANTS ===');
  console.log('variants count:', product.variants?.length || 0);
  
  if (product.variants && product.variants.length > 0) {
    product.variants.slice(0, 5).forEach((v, i) => {
      console.log(`\n--- Variant ${i + 1} ---`);
      console.log('vid:', v.vid);
      console.log('variantSku:', v.variantSku);
      console.log('variantNameEn:', v.variantNameEn);
      console.log('variantKey:', v.variantKey);
      console.log('variantImage:', v.variantImage?.substring(0, 60));
      console.log('variantSellPrice:', v.variantSellPrice);
      console.log('variantWeight:', v.variantWeight);
      console.log('All variant keys:', Object.keys(v).join(', '));
    });
  }
  
  console.log('\n=== RAW FIRST VARIANT ===');
  if (product.variants && product.variants[0]) {
    console.log(JSON.stringify(product.variants[0], null, 2));
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
