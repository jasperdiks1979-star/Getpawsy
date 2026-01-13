const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send("Dog Beds Category Page");
});

module.exports = router;
