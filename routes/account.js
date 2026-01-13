const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '../data');

function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }
    next();
}

function readJSON(filename) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (err) {
        console.error(`Error reading ${filename}:`, err);
    }
    return [];
}

function writeJSON(filename, data) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`Error writing ${filename}:`, err);
        return false;
    }
}

function getUserOrders(userId) {
    const orders = readJSON('orders.json');
    return orders.filter(o => o.userId === userId);
}

function getUserAddresses(userId) {
    const addresses = readJSON('addresses.json');
    return addresses.filter(a => a.userId === userId);
}

function getUserWishlist(userId) {
    const wishlists = readJSON('wishlist.json');
    const userWishlist = wishlists.find(w => w.userId === userId);
    return userWishlist ? userWishlist.items : [];
}

function getUserRewards(userId) {
    const rewards = readJSON('rewards.json');
    const userRewards = rewards.find(r => r.userId === userId);
    if (userRewards) return userRewards;
    return { userId, points: 0, tier: 'Bronze', lifetimeSpend: 0, history: [] };
}

function calculateTier(points) {
    if (points >= 5000) return 'Platinum';
    if (points >= 1500) return 'Gold';
    if (points >= 500) return 'Silver';
    return 'Bronze';
}

function getNextTierInfo(points) {
    const tiers = [
        { name: 'Bronze', min: 0 },
        { name: 'Silver', min: 500 },
        { name: 'Gold', min: 1500 },
        { name: 'Platinum', min: 5000 }
    ];
    for (let i = 0; i < tiers.length - 1; i++) {
        if (points < tiers[i + 1].min) {
            return {
                nextTier: tiers[i + 1].name,
                pointsNeeded: tiers[i + 1].min - points,
                progress: ((points - tiers[i].min) / (tiers[i + 1].min - tiers[i].min)) * 100
            };
        }
    }
    return { nextTier: null, pointsNeeded: 0, progress: 100 };
}

router.get('/', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const orders = getUserOrders(userId);
    const addresses = getUserAddresses(userId);
    const wishlist = getUserWishlist(userId);
    const rewards = getUserRewards(userId);
    const tierInfo = getNextTierInfo(rewards.points);

    res.render('account/index', {
        title: 'My Account - GetPawsy',
        user: req.session.user,
        orders,
        addresses,
        wishlist,
        rewards,
        tierInfo
    });
});

router.get('/orders', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const orders = getUserOrders(userId);

    res.render('account/orders', {
        title: 'My Orders - GetPawsy',
        user: req.session.user,
        orders
    });
});

router.get('/orders/:id', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const orderId = req.params.id;
    const orders = readJSON('orders.json');
    const order = orders.find(o => o.id === orderId && o.userId === userId);

    if (!order) {
        return res.status(404).render('404', { 
            title: 'Order Not Found',
            user: req.session.user 
        });
    }

    res.render('account/order-details', {
        title: `Order ${orderId} - GetPawsy`,
        user: req.session.user,
        order
    });
});

router.get('/addresses', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const addresses = getUserAddresses(userId);

    res.render('account/addresses', {
        title: 'My Addresses - GetPawsy',
        user: req.session.user,
        addresses
    });
});

router.post('/addresses/add', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const { label, name, street, city, state, zip, country, isDefault } = req.body;

    const addresses = readJSON('addresses.json');
    
    if (isDefault === 'true' || isDefault === true) {
        addresses.forEach(addr => {
            if (addr.userId === userId) addr.isDefault = false;
        });
    }

    const newAddress = {
        id: `addr-${Date.now()}`,
        userId,
        label: label || 'Address',
        name,
        street,
        city,
        state,
        zip,
        country: country || 'USA',
        isDefault: isDefault === 'true' || isDefault === true,
        createdAt: new Date().toISOString()
    };

    addresses.push(newAddress);
    writeJSON('addresses.json', addresses);

    res.redirect('/account/addresses');
});

router.post('/addresses/delete/:id', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const addressId = req.params.id;

    let addresses = readJSON('addresses.json');
    addresses = addresses.filter(a => !(a.id === addressId && a.userId === userId));
    writeJSON('addresses.json', addresses);

    res.redirect('/account/addresses');
});

router.get('/wishlist', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const wishlist = getUserWishlist(userId);

    res.render('account/wishlist', {
        title: 'My Wishlist - GetPawsy',
        user: req.session.user,
        wishlist
    });
});

router.post('/wishlist/add/:productId', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.productId;
    const { name, price, image } = req.body;

    let wishlists = readJSON('wishlist.json');
    let userWishlist = wishlists.find(w => w.userId === userId);

    if (!userWishlist) {
        userWishlist = { userId, items: [] };
        wishlists.push(userWishlist);
    }

    const exists = userWishlist.items.find(i => i.productId === productId);
    if (!exists) {
        userWishlist.items.push({
            productId,
            name: name || 'Product',
            price: parseFloat(price) || 0,
            image: image || '/public/images/placeholder.png',
            addedAt: new Date().toISOString()
        });
        writeJSON('wishlist.json', wishlists);
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Added to wishlist' });
    }
    res.redirect('/account/wishlist');
});

router.post('/wishlist/remove/:productId', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.productId;

    let wishlists = readJSON('wishlist.json');
    let userWishlist = wishlists.find(w => w.userId === userId);

    if (userWishlist) {
        userWishlist.items = userWishlist.items.filter(i => i.productId !== productId);
        writeJSON('wishlist.json', wishlists);
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Removed from wishlist' });
    }
    res.redirect('/account/wishlist');
});

router.get('/rewards', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const rewards = getUserRewards(userId);
    const tierInfo = getNextTierInfo(rewards.points);

    res.render('account/rewards', {
        title: 'Loyalty Rewards - GetPawsy',
        user: req.session.user,
        rewards,
        tierInfo
    });
});

router.get('/settings', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const users = readJSON('users.json');
    const user = users.find(u => u.id === userId) || req.session.user;

    res.render('account/settings', {
        title: 'Account Settings - GetPawsy',
        user: { ...req.session.user, ...user },
        success: req.query.success,
        error: req.query.error
    });
});

router.post('/settings/update', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const { name, email, phone, currentPassword, newPassword, confirmPassword } = req.body;

    let users = readJSON('users.json');
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
        return res.redirect('/account/settings?error=User not found');
    }

    const user = users[userIndex];

    if (newPassword) {
        if (!currentPassword) {
            return res.redirect('/account/settings?error=Current password required');
        }
        if (!bcrypt.compareSync(currentPassword, user.password)) {
            return res.redirect('/account/settings?error=Current password is incorrect');
        }
        if (newPassword !== confirmPassword) {
            return res.redirect('/account/settings?error=New passwords do not match');
        }
        if (newPassword.length < 6) {
            return res.redirect('/account/settings?error=Password must be at least 6 characters');
        }
        user.password = bcrypt.hashSync(newPassword, 10);
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;

    user.updatedAt = new Date().toISOString();
    users[userIndex] = user;
    writeJSON('users.json', users);

    req.session.user = {
        ...req.session.user,
        name: user.name,
        email: user.email
    };

    res.redirect('/account/settings?success=Settings updated successfully');
});

module.exports = router;
