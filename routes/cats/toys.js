const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send("Cat Toys Category Page");
});

module.exports = router;
