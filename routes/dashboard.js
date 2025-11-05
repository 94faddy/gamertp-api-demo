const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const db = require('../helpers/db');

const axiosInstance = axios.create({
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false
    })
});

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

// Dashboard
router.get('/', isAuthenticated, async (req, res) => {
    const user = db.findUserById(req.session.user.id);
    
    // ⭐ ดึง transactions จาก Main API แทน
    let transactions = [];
    
    try {
        const response = await axiosInstance.post(
            `${process.env.API_ENDPOINT}/api/history`,
            {
                username: user.username,
                limit: 10
            },
            {
                headers: { 
                    'x-api-key': process.env.API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            }
        );
        
        if (response.data && response.data.data) {
            transactions = response.data.data;
            console.log(`✅ Loaded ${transactions.length} transactions from Main API`);
        }
    } catch (error) {
        console.log('⚠️ Cannot load transactions from Main API:', error.message);
        // ไม่ error แค่แสดงว่าไม่มี transactions
        transactions = [];
    }
    
    res.render('dashboard', {
        title: 'Dashboard',
        user: user,
        transactions: transactions
    });
});

// Profile
router.get('/profile', isAuthenticated, (req, res) => {
    const user = db.findUserById(req.session.user.id);
    
    res.render('profile', {
        title: 'Profile',
        user: user
    });
});

module.exports = router;