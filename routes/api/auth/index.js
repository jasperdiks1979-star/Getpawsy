const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const USERS_FILE = path.join(__dirname, "../../../data/users.json");
const SECRET = "GETPAWSY_SUPER_SECRET_KEY";

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

module.exports = {

  register: async (req, res) => {
    const { name, email, password } = req.body;

    const users = readUsers();
    const exists = users.find(u => u.email === email);

    if (exists) {
      return res.json({ success: false, message: "Email already exists" });
    }

    const hash = bcrypt.hashSync(password, 10);

    const newUser = {
      id: Date.now(),
      name,
      email,
      password: hash
    };

    users.push(newUser);
    writeUsers(users);

    // Send welcome email
    try {
      await fetch("http://localhost:5000/api/email/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name
        })
      });
    } catch (error) {
      console.error("Email send failed:", error.message);
    }

    res.json({ success: true });
  },

  login: (req, res) => {
    const { email, password } = req.body;

    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: "7d" });

    res.json({ success: true, token, name: user.name });
  },

  verify: (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.json({ loggedIn: false });

    try {
      const decoded = jwt.verify(token, SECRET);
      res.json({ loggedIn: true, user: decoded });
    } catch {
      res.json({ loggedIn: false });
    }
  }

};
