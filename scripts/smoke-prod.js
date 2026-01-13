#!/usr/bin/env node
"use strict";

const https = require("https");
const http = require("http");

const BASE_LOCAL = process.env.BASE_LOCAL || "http://localhost:5000";
const BASE_PROD = process.env.BASE_PROD || "https://getpawsy.pet";

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const data = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };
    const req = client.request(options, (res) => {
      let responseData = "";
      res.on("data", chunk => responseData += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: responseData, headers: res.headers }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(data);
    req.end();
  });
}

async function runTests(base, label) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SMOKE TESTS: ${label}`);
  console.log(`Base URL: ${base}`);
  console.log("=".repeat(60));
  
  const results = { passed: 0, failed: 0, tests: [] };
  
  function pass(name, details = "") {
    console.log(`  ✅ ${name}${details ? ` (${details})` : ""}`);
    results.passed++;
    results.tests.push({ name, status: "pass", details });
  }
  
  function fail(name, reason) {
    console.log(`  ❌ ${name}: ${reason}`);
    results.failed++;
    results.tests.push({ name, status: "fail", reason });
  }

  try {
    const health = await fetch(`${base}/health`);
    if (health.status === 200) {
      pass("Health check", `status=${health.status}`);
    } else {
      fail("Health check", `expected 200, got ${health.status}`);
    }
  } catch (e) {
    fail("Health check", e.message);
  }

  let products = [];
  try {
    const res = await fetch(`${base}/api/products?limit=20`);
    if (res.status === 200) {
      const data = JSON.parse(res.body);
      products = data.items || data.products || [];
      if (products.length >= 10) {
        pass("Products API", `${products.length} products returned`);
      } else {
        fail("Products API", `expected >=10 products, got ${products.length}`);
      }
    } else {
      fail("Products API", `expected 200, got ${res.status}`);
    }
  } catch (e) {
    fail("Products API", e.message);
  }

  if (products.length > 0) {
    const prices = products.map(p => p.price).filter(p => p > 0);
    const uniquePrices = [...new Set(prices)];
    if (uniquePrices.length >= 5) {
      pass("Price diversity", `${uniquePrices.length} unique prices in ${products.length} products`);
    } else {
      fail("Price diversity", `only ${uniquePrices.length} unique prices - expected at least 5`);
    }
  }

  const testSlugs = products.slice(0, 5).map(p => p.slug).filter(Boolean);
  for (const slug of testSlugs) {
    try {
      const res = await fetch(`${base}/product/${slug}`);
      if (res.status === 200) {
        if (res.body.includes("$")) {
          pass(`PDP: ${slug.substring(0, 30)}...`, "200 + has $ sign");
        } else {
          fail(`PDP: ${slug.substring(0, 30)}...`, "200 but missing $ sign");
        }
      } else {
        fail(`PDP: ${slug.substring(0, 30)}...`, `expected 200, got ${res.status}`);
      }
    } catch (e) {
      fail(`PDP: ${slug.substring(0, 30)}...`, e.message);
    }
  }

  const withImages = products.filter(p => 
    (p.thumbImage && p.thumbImage.length > 5) || 
    (p.resolved_image && p.resolved_image.length > 5) ||
    (p.image && p.image.length > 5)
  );
  if (withImages.length >= products.length * 0.8) {
    pass("Image coverage", `${withImages.length}/${products.length} products have images`);
  } else {
    fail("Image coverage", `only ${withImages.length}/${products.length} have images`);
  }

  if (products.length > 0) {
    try {
      const testProduct = products[0];
      const addRes = await postJSON(`${base}/api/cart/add`, { productId: testProduct.id, qty: 1 });
      if (addRes.status === 200) {
        const cartData = JSON.parse(addRes.body);
        if (cartData.success && cartData.count >= 1) {
          pass("Cart add endpoint", `added ${testProduct.slug.substring(0, 20)}... (count=${cartData.count})`);
        } else {
          fail("Cart add endpoint", `response ok but success=${cartData.success}`);
        }
      } else {
        fail("Cart add endpoint", `expected 200, got ${addRes.status}`);
      }
    } catch (e) {
      fail("Cart add endpoint", e.message);
    }
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`SUMMARY: ${results.passed} passed, ${results.failed} failed`);
  console.log("─".repeat(40));
  
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const target = args[0] || "local";
  
  let results;
  if (target === "prod" || target === "production") {
    results = await runTests(BASE_PROD, "PRODUCTION");
  } else if (target === "both") {
    const localResults = await runTests(BASE_LOCAL, "LOCAL");
    const prodResults = await runTests(BASE_PROD, "PRODUCTION");
    results = {
      passed: localResults.passed + prodResults.passed,
      failed: localResults.failed + prodResults.failed
    };
  } else {
    results = await runTests(BASE_LOCAL, "LOCAL");
  }
  
  console.log(`\n${"=".repeat(60)}`);
  if (results.failed === 0) {
    console.log("✅ ALL SMOKE TESTS PASSED!");
  } else {
    console.log(`⚠️  ${results.failed} TESTS FAILED`);
    process.exit(1);
  }
  console.log("=".repeat(60));
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
