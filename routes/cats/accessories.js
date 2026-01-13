const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send("Cat Accessories Category Page");
});

module.exports = router;
