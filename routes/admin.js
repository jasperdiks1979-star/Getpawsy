const express = require("express");
const router = express.Router();
const productCatalog = require("../services/productCatalog");

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect("/login");
}

router.get("/", requireAuth, (req, res) => {
  res.sendFile("admin.html", { root: "views" });
});

router.post("/cleanup-non-pet", requireAuth, (req, res) => {
  console.log("[Admin] Running non-pet product cleanup...");
  
  const statsBefore = productCatalog.getCatalogStats();
  console.log(`[Admin] Before cleanup: ${statsBefore.total} products (dogs: ${statsBefore.dogs}, cats: ${statsBefore.cats})`);
  
  const result = productCatalog.cleanupNonPetProducts();
  
  const statsAfter = productCatalog.getCatalogStats();
  console.log(`[Admin] After cleanup: ${statsAfter.total} products (dogs: ${statsAfter.dogs}, cats: ${statsAfter.cats})`);
  
  res.json({
    success: result.success,
    message: result.success 
      ? `Cleanup complete: removed ${result.removed} non-pet products` 
      : `Cleanup failed: ${result.error}`,
    before: {
      total: statsBefore.total,
      dogs: statsBefore.dogs,
      cats: statsBefore.cats
    },
    after: {
      total: statsAfter.total,
      dogs: statsAfter.dogs,
      cats: statsAfter.cats
    },
    removed: result.removed || 0,
    hiddenProducts: result.hiddenProducts || []
  });
});

router.get("/catalog-stats", requireAuth, (req, res) => {
  const stats = productCatalog.getCatalogStats();
  res.json(stats);
});

module.exports = router;
