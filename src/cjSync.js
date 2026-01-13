const { parseCJCSV } = require("./cjImport");
const { db } = require("./db");

async function runCJSync(source) {
  if (!source || typeof source !== "string") {
    return { ok: false, error: "Invalid source" };
  }

  try {
    const products = await parseCJCSV(source);
    
    if (products.length === 0) {
      return { ok: true, synced: 0, warning: "No valid CJ products found" };
    }

    await db.upsertProducts(products);

    const usCount = products.filter(p => p.is_us).length;
    const nonUSCount = products.length - usCount;

    return {
      ok: true,
      synced: products.length,
      us_products: usCount,
      non_us_products: nonUSCount
    };
  } catch (err) {
    console.error("[CJ Sync Error]", err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { runCJSync };
