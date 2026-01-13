const express = require("express");
const router = express.Router();

router.get("/api/product/customize/:id", (req, res) => {
    const { id } = req.params;

    res.json({
        product_id: id,
        available_colors: ["red", "blue", "pink", "green"],
        engraving: true,
        font_styles: ["cute", "bold", "comic", "script"],
        demo_preview_url: `/ultra_v4/previews/${id}.png`
    });
});

router.post("/api/product/customize/submit", (req, res) => {
    const config = req.body;
    res.json({ success: true, saved: config });
});

module.exports = router;
