const bcrypt = require("bcrypt");

const pw = process.argv[2];
if (!pw) {
  console.log("❌ Gebruik: node tools/hash_password.js JOUW_WACHTWOORD");
  process.exit(1);
}

bcrypt.hash(pw, 12).then(hash => {
  console.log("🔐 Hashed wachtwoord:");
  console.log(hash);
  process.exit(0);
});
