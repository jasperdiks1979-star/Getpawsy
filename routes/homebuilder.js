const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const layoutFile = path.join(__dirname, "../data/home_layout.json");

// GET – load homepage layout
router.get("/api/homebuilder/layout", (req, res) => {
    if (!fs.existsSync(layoutFile)) return res.json({ sections: [] });
    const data = JSON.parse(fs.readFileSync(layoutFile));
    res.json(data);
});

// POST – save new layout
router.post("/api/homebuilder/save", (req, res) => {
    fs.writeFileSync(layoutFile, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

module.exports = router;
