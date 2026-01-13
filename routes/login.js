const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const USERS_FILE = path.join(__dirname, "../data/users.json");
const SECRET = "GETPAWSY_SUPER_SECRET_KEY";

function readUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
            if (Array.isArray(data)) return data;
            if (data && Array.isArray(data.users)) return data.users;
        }
    } catch (err) {
        console.error("Error reading users file:", err);
    }
    return [];
}

router.get('/', (req, res) => {
    res.render('login', {
        title: 'Login - GetPawsy',
        user: req.session?.user || null,
        error: null
    });
});

router.post('/', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', {
            title: 'Login - GetPawsy',
            user: null,
            error: 'Please enter both email and password'
        });
    }

    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
        return res.render('login', {
            title: 'Login - GetPawsy',
            user: null,
            error: 'Invalid email or password'
        });
    }

    if (!bcrypt.compareSync(password, user.password)) {
        return res.render('login', {
            title: 'Login - GetPawsy',
            user: null,
            error: 'Invalid email or password'
        });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: "7d" });

    req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'customer',
        token: token
    };

    res.redirect('/account');
});

module.exports = router;
