const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
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

function getProducts() {
    const cjPath = path.join(DATA_DIR, 'products_cj.json');
    if (!fs.existsSync(cjPath)) {
        throw new Error('FATAL: products_cj.json not found - API-only mode');
    }
    try {
        const data = JSON.parse(fs.readFileSync(cjPath, 'utf8'));
        const products = data.products || [];
        if (products.length === 0) {
            throw new Error('FATAL: products_cj.json is empty');
        }
        return products;
    } catch (err) {
        if (err.message.startsWith('FATAL:')) throw err;
        throw new Error(`FATAL: Failed to load products_cj.json: ${err.message}`);
    }
}

function getUserData(userId) {
    const users = readJSON('users.json');
    return users.find(u => u.id === userId) || null;
}

function getUserOrders(userId) {
    const orders = readJSON('orders.json');
    return orders.filter(o => o.userId === userId);
}

function getUserWishlist(userId) {
    const wishlists = readJSON('wishlist.json');
    const userWishlist = wishlists.find(w => w.userId === userId);
    return userWishlist ? userWishlist.items : [];
}

function getUserRewards(userId) {
    const rewards = readJSON('rewards.json');
    const userRewards = rewards.find(r => r.userId === userId);
    return userRewards || { userId, points: 0, tier: 'Bronze', lifetimeSpend: 0, history: [] };
}

function calculateTier(points) {
    if (points >= 5000) return 'Platinum';
    if (points >= 1500) return 'Gold';
    if (points >= 500) return 'Silver';
    return 'Bronze';
}

async function callAI(prompt, maxTokens = 500) {
    try {
        const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
        if (!key) {
            console.log('No OpenAI API key available, using fallback');
            return null;
        }

        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are Pawsy, a helpful AI assistant for GetPawsy pet store. You help customers find the perfect products for their furry friends. Be friendly, knowledgeable, and enthusiastic about pets. Keep responses concise and actionable.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: maxTokens,
                temperature: 0.7
            })
        });

        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
    } catch (err) {
        console.error('AI call error:', err);
        return null;
    }
}

router.post('/recommend/homepage', async (req, res) => {
    try {
        const products = getProducts();
        const userId = req.session?.user?.id;
        
        let userContext = '';
        if (userId) {
            const orders = getUserOrders(userId);
            const wishlist = getUserWishlist(userId);
            const userData = getUserData(userId);
            
            if (orders.length > 0) {
                const recentItems = orders.slice(0, 3).flatMap(o => o.items.map(i => i.name));
                userContext += `Customer has purchased: ${recentItems.join(', ')}. `;
            }
            if (wishlist.length > 0) {
                userContext += `Wishlist includes: ${wishlist.slice(0, 5).map(i => i.name).join(', ')}. `;
            }
            if (userData?.petProfile?.name) {
                userContext += `Pet: ${userData.petProfile.name}, ${userData.petProfile.size || 'unknown size'}, ${userData.petProfile.age || 'unknown age'}. `;
            }
        }

        const productList = products.slice(0, 20).map(p => `${p.name} ($${p.price})`).join(', ');
        
        const prompt = `Based on available products: ${productList}. ${userContext}
Recommend 4 products that would be perfect for a pet owner. Return as JSON array with format:
[{"id": "product-id", "reason": "short reason why recommended"}]
Only return the JSON, no other text.`;

        const aiResponse = await callAI(prompt);
        let recommendations = [];
        
        try {
            const jsonMatch = aiResponse?.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                recommendations = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            recommendations = products.slice(0, 4).map(p => ({
                id: p.id,
                reason: 'Popular choice for pet owners'
            }));
        }

        const enrichedRecs = recommendations.map(rec => {
            const product = products.find(p => 
                p.id === rec.id || 
                p.name.toLowerCase().includes(rec.id?.toLowerCase() || '')
            );
            return product ? { ...product, aiReason: rec.reason } : null;
        }).filter(Boolean);

        if (enrichedRecs.length < 4) {
            const fallbackProducts = products
                .filter(p => !enrichedRecs.find(r => r.id === p.id))
                .slice(0, 4 - enrichedRecs.length)
                .map(p => ({ ...p, aiReason: 'Top rated by pet parents' }));
            enrichedRecs.push(...fallbackProducts);
        }

        res.json({
            success: true,
            recommendations: enrichedRecs.slice(0, 4),
            personalized: !!userId
        });
    } catch (err) {
        console.error('Homepage AI error:', err);
        res.status(500).json({ error: 'Failed to generate recommendations' });
    }
});

router.post('/recommend/wishlist', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const wishlist = getUserWishlist(userId);
        const products = getProducts();

        if (wishlist.length === 0) {
            return res.json({
                success: true,
                analysis: 'Your wishlist is empty! Start adding products you love to get personalized recommendations.',
                suggestions: products.slice(0, 3).map(p => ({ ...p, aiReason: 'Popular choice' }))
            });
        }

        const wishlistNames = wishlist.map(i => i.name).join(', ');
        const prompt = `Customer's wishlist contains: ${wishlistNames}.
Analyze their preferences and suggest 3 complementary products they might like.
Also provide a brief analysis of their shopping style (1-2 sentences).
Return as JSON: {"analysis": "brief analysis", "suggestions": [{"name": "product name", "reason": "why they'd like it"}]}`;

        const aiResponse = await callAI(prompt);
        let result = { analysis: '', suggestions: [] };

        try {
            const jsonMatch = aiResponse?.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            result = {
                analysis: `You have ${wishlist.length} items saved. Great taste in pet products!`,
                suggestions: []
            };
        }

        const suggestedProducts = result.suggestions?.map(s => {
            const product = products.find(p => 
                p.name.toLowerCase().includes(s.name?.toLowerCase() || '')
            );
            return product ? { ...product, aiReason: s.reason } : null;
        }).filter(Boolean) || [];

        res.json({
            success: true,
            analysis: result.analysis || `You have ${wishlist.length} amazing items saved!`,
            suggestions: suggestedProducts.length > 0 ? suggestedProducts : 
                products.slice(0, 3).map(p => ({ ...p, aiReason: 'Pairs well with your wishlist' })),
            wishlistCount: wishlist.length
        });
    } catch (err) {
        console.error('Wishlist AI error:', err);
        res.status(500).json({ error: 'Failed to analyze wishlist' });
    }
});

router.post('/recommend/orders', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const orders = getUserOrders(userId);
        const products = getProducts();

        if (orders.length === 0) {
            return res.json({
                success: true,
                insights: 'No orders yet! Start shopping to get personalized insights.',
                reorderSuggestions: [],
                newSuggestions: products.slice(0, 3).map(p => ({ ...p, aiReason: 'Perfect for first-time buyers' }))
            });
        }

        const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
        const allItems = orders.flatMap(o => o.items.map(i => i.name));
        const uniqueItems = [...new Set(allItems)];

        const prompt = `Customer order history: ${uniqueItems.slice(0, 10).join(', ')}.
Total orders: ${orders.length}. Total spent: $${totalSpent.toFixed(2)}.
Provide: 1) Brief shopping insight (1-2 sentences), 2) Items they might need to reorder, 3) New products to try.
Return as JSON: {"insights": "brief insight", "reorder": ["item names"], "newProducts": ["product suggestions"]}`;

        const aiResponse = await callAI(prompt);
        let result = { insights: '', reorder: [], newProducts: [] };

        try {
            const jsonMatch = aiResponse?.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            result = {
                insights: `You've placed ${orders.length} orders totaling $${totalSpent.toFixed(2)}. Great customer!`,
                reorder: [],
                newProducts: []
            };
        }

        res.json({
            success: true,
            insights: result.insights || `You've made ${orders.length} orders with us!`,
            totalSpent: totalSpent.toFixed(2),
            orderCount: orders.length,
            reorderSuggestions: result.reorder?.slice(0, 3) || [],
            newSuggestions: products.slice(0, 3).map(p => ({ ...p, aiReason: 'Based on your history' }))
        });
    } catch (err) {
        console.error('Orders AI error:', err);
        res.status(500).json({ error: 'Failed to analyze orders' });
    }
});

router.post('/recommend/cart', requireLogin, async (req, res) => {
    try {
        const cart = req.session.cart || [];
        const products = getProducts();

        if (cart.length === 0) {
            return res.json({
                success: true,
                message: 'Your cart is empty!',
                upsells: products.slice(0, 2).map(p => ({ ...p, aiReason: 'Popular add-on' }))
            });
        }

        const cartItems = cart.map(c => c.name || c.title).join(', ');
        const prompt = `Cart contains: ${cartItems}.
Suggest 2 complementary products to add. Return as JSON array: [{"name": "product", "reason": "why add it"}]`;

        const aiResponse = await callAI(prompt, 200);
        let suggestions = [];

        try {
            const jsonMatch = aiResponse?.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                suggestions = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            suggestions = [];
        }

        const upsellProducts = suggestions.map(s => {
            const product = products.find(p => 
                p.name.toLowerCase().includes(s.name?.toLowerCase() || '')
            );
            return product ? { ...product, aiReason: s.reason } : null;
        }).filter(Boolean);

        res.json({
            success: true,
            cartCount: cart.length,
            upsells: upsellProducts.length > 0 ? upsellProducts : 
                products.slice(0, 2).map(p => ({ ...p, aiReason: 'Frequently bought together' }))
        });
    } catch (err) {
        console.error('Cart AI error:', err);
        res.status(500).json({ error: 'Failed to get cart recommendations' });
    }
});

router.get('/petprofile', requireLogin, (req, res) => {
    try {
        const userId = req.session.user.id;
        const userData = getUserData(userId);
        
        const petProfile = userData?.petProfile || {
            name: '',
            type: 'dog',
            breed: '',
            age: '',
            size: '',
            notes: ''
        };

        res.json({
            success: true,
            petProfile
        });
    } catch (err) {
        console.error('Pet profile error:', err);
        res.status(500).json({ error: 'Failed to get pet profile' });
    }
});

router.post('/petprofile/update', requireLogin, (req, res) => {
    try {
        const userId = req.session.user.id;
        const { name, type, breed, age, size, notes } = req.body;

        let users = readJSON('users.json');
        const userIndex = users.findIndex(u => u.id === userId);

        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        users[userIndex].petProfile = {
            name: name || '',
            type: type || 'dog',
            breed: breed || '',
            age: age || '',
            size: size || '',
            notes: notes || '',
            updatedAt: new Date().toISOString()
        };

        writeJSON('users.json', users);

        res.json({
            success: true,
            message: 'Pet profile updated!',
            petProfile: users[userIndex].petProfile
        });
    } catch (err) {
        console.error('Pet profile update error:', err);
        res.status(500).json({ error: 'Failed to update pet profile' });
    }
});

router.post('/loyalty/boost', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { action, orderId, amount } = req.body;

        let rewards = readJSON('rewards.json');
        let userRewards = rewards.find(r => r.userId === userId);

        if (!userRewards) {
            userRewards = { 
                userId, 
                points: 0, 
                tier: 'Bronze', 
                lifetimeSpend: 0, 
                history: [],
                dailyBonus: null
            };
            rewards.push(userRewards);
        }

        let pointsEarned = 0;
        let reason = '';

        switch (action) {
            case 'purchase':
                pointsEarned = Math.floor((amount || 0) * 1);
                reason = `Purchase reward ($${amount})`;
                userRewards.lifetimeSpend = (userRewards.lifetimeSpend || 0) + (amount || 0);
                break;
            case 'review':
                pointsEarned = 50;
                reason = 'Product review bonus';
                break;
            case 'referral':
                pointsEarned = 100;
                reason = 'Friend referral bonus';
                break;
            case 'social':
                pointsEarned = 25;
                reason = 'Social share bonus';
                break;
            default:
                pointsEarned = 10;
                reason = 'Activity bonus';
        }

        userRewards.points += pointsEarned;
        userRewards.tier = calculateTier(userRewards.points);
        userRewards.history.unshift({
            type: 'earn',
            points: pointsEarned,
            reason,
            date: new Date().toISOString()
        });

        if (userRewards.history.length > 50) {
            userRewards.history = userRewards.history.slice(0, 50);
        }

        writeJSON('rewards.json', rewards);

        res.json({
            success: true,
            pointsEarned,
            totalPoints: userRewards.points,
            tier: userRewards.tier,
            message: `+${pointsEarned} points earned!`
        });
    } catch (err) {
        console.error('Loyalty boost error:', err);
        res.status(500).json({ error: 'Failed to add loyalty points' });
    }
});

router.post('/loyalty/daily', requireLogin, (req, res) => {
    try {
        const userId = req.session.user.id;

        let rewards = readJSON('rewards.json');
        let userRewards = rewards.find(r => r.userId === userId);

        if (!userRewards) {
            userRewards = { 
                userId, 
                points: 0, 
                tier: 'Bronze', 
                lifetimeSpend: 0, 
                history: [],
                dailyBonus: null,
                streak: 0
            };
            rewards.push(userRewards);
        }

        const today = new Date().toDateString();
        const lastBonus = userRewards.dailyBonus ? new Date(userRewards.dailyBonus).toDateString() : null;

        if (lastBonus === today) {
            return res.json({
                success: false,
                message: 'Daily bonus already claimed today!',
                nextBonus: 'Come back tomorrow',
                streak: userRewards.streak || 0
            });
        }

        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (lastBonus === yesterday) {
            userRewards.streak = (userRewards.streak || 0) + 1;
        } else {
            userRewards.streak = 1;
        }

        const streakBonus = Math.min(userRewards.streak * 5, 50);
        const dailyPoints = 10 + streakBonus;

        userRewards.points += dailyPoints;
        userRewards.tier = calculateTier(userRewards.points);
        userRewards.dailyBonus = new Date().toISOString();
        userRewards.history.unshift({
            type: 'earn',
            points: dailyPoints,
            reason: `Daily bonus (${userRewards.streak} day streak)`,
            date: new Date().toISOString()
        });

        writeJSON('rewards.json', rewards);

        res.json({
            success: true,
            pointsEarned: dailyPoints,
            totalPoints: userRewards.points,
            tier: userRewards.tier,
            streak: userRewards.streak,
            message: `+${dailyPoints} daily bonus! Streak: ${userRewards.streak} days`
        });
    } catch (err) {
        console.error('Daily bonus error:', err);
        res.status(500).json({ error: 'Failed to claim daily bonus' });
    }
});

router.post('/loyalty/reward', requireLogin, (req, res) => {
    try {
        const userId = req.session.user.id;
        const { rewardId, pointsCost } = req.body;

        let rewards = readJSON('rewards.json');
        let userRewards = rewards.find(r => r.userId === userId);

        if (!userRewards) {
            return res.status(400).json({ error: 'No loyalty account found' });
        }

        const cost = parseInt(pointsCost) || 0;
        if (userRewards.points < cost) {
            return res.status(400).json({ 
                error: 'Not enough points',
                required: cost,
                available: userRewards.points
            });
        }

        const rewardNames = {
            'discount-5': '$5 Off Coupon',
            'free-shipping': 'Free Shipping',
            'discount-10pct': '10% Off Order',
            'discount-20': '$20 Off Coupon'
        };

        userRewards.points -= cost;
        userRewards.tier = calculateTier(userRewards.points);
        userRewards.history.unshift({
            type: 'redeem',
            points: cost,
            reason: `Redeemed: ${rewardNames[rewardId] || rewardId}`,
            date: new Date().toISOString()
        });

        writeJSON('rewards.json', rewards);

        res.json({
            success: true,
            reward: rewardNames[rewardId] || rewardId,
            pointsSpent: cost,
            remainingPoints: userRewards.points,
            tier: userRewards.tier,
            message: `Successfully redeemed ${rewardNames[rewardId] || rewardId}!`
        });
    } catch (err) {
        console.error('Reward redeem error:', err);
        res.status(500).json({ error: 'Failed to redeem reward' });
    }
});

router.get('/loyalty/status', requireLogin, (req, res) => {
    try {
        const userId = req.session.user.id;
        const userRewards = getUserRewards(userId);
        
        const tierThresholds = {
            'Bronze': { min: 0, max: 499, next: 'Silver', nextAt: 500 },
            'Silver': { min: 500, max: 1499, next: 'Gold', nextAt: 1500 },
            'Gold': { min: 1500, max: 4999, next: 'Platinum', nextAt: 5000 },
            'Platinum': { min: 5000, max: Infinity, next: null, nextAt: null }
        };

        const tierInfo = tierThresholds[userRewards.tier];
        const progress = tierInfo.next ? 
            ((userRewards.points - tierInfo.min) / (tierInfo.nextAt - tierInfo.min)) * 100 : 100;

        res.json({
            success: true,
            points: userRewards.points,
            tier: userRewards.tier,
            lifetimeSpend: userRewards.lifetimeSpend || 0,
            progress: Math.min(progress, 100),
            nextTier: tierInfo.next,
            pointsToNext: tierInfo.next ? tierInfo.nextAt - userRewards.points : 0,
            streak: userRewards.streak || 0,
            history: (userRewards.history || []).slice(0, 10)
        });
    } catch (err) {
        console.error('Loyalty status error:', err);
        res.status(500).json({ error: 'Failed to get loyalty status' });
    }
});

module.exports = router;
