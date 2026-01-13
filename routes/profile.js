const path = require("path");

module.exports = (req, res) => {
  res.sendFile(path.join(__dirname, "../public/components/profile/profile.html"));
};
