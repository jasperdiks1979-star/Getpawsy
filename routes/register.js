const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, "../data/users.json");

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

function writeUsers(users) {
    try {
        const dir = path.dirname(USERS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("Error writing users file:", err);
    }
}

router.get('/', (req, res) => {
    res.render('register', {
        title: 'Create Account - GetPawsy',
        user: req.session?.user || null,
        error: null
    });
});

router.post('/', async (req, res) => {
    const { firstName, lastName, email, password, confirmPassword, newsletter } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.render('register', {
            title: 'Create Account - GetPawsy',
            user: null,
            error: 'Please fill in all required fields'
        });
    }

    if (password !== confirmPassword) {
        return res.render('register', {
            title: 'Create Account - GetPawsy',
            user: null,
            error: 'Passwords do not match'
        });
    }

    if (password.length < 8) {
        return res.render('register', {
            title: 'Create Account - GetPawsy',
            user: null,
            error: 'Password must be at least 8 characters'
        });
    }

    const users = readUsers();
    const exists = users.find(u => u.email === email);

    if (exists) {
        return res.render('register', {
            title: 'Create Account - GetPawsy',
            user: null,
            error: 'An account with this email already exists'
        });
    }

    const hash = bcrypt.hashSync(password, 10);
    const name = `${firstName} ${lastName}`;

    const newUser = {
        id: Date.now(),
        name,
        firstName,
        lastName,
        email,
        password: hash,
        newsletter: newsletter === 'on',
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeUsers(users);

    try {
        const fetch = (await import("node-fetch")).default;
        await fetch("http://localhost:5000/api/email/welcome", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, name })
        });
    } catch (error) {
        console.error("Welcome email send failed:", error.message);
    }

    req.session.user = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email
    };

    res.redirect('/account');
});

module.exports = router;
