const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send("Cat Scratchers Category Page");
});

module.exports = router;
