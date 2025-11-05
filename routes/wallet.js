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

// Wallet Page
router.get('/', isAuthenticated, async (req, res) => {
    const user = db.findUserById(req.session.user.id);
    
    // ⭐ ดึง transactions จาก Main API
    let transactions = [];
    
    try {
        const response = await axiosInstance.post(
            `${process.env.API_ENDPOINT}/api/history`,
            {
                username: user.username,
                limit: 20
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
        }
    } catch (error) {
        console.log('⚠️ Cannot load transactions from Main API:', error.message);
        transactions = [];
    }
    
    res.render('wallet', {
        title: 'Wallet',
        user: user,
        transactions: transactions,
        success: null,
        error: null
    });
});

// Add Balance (Deposit)
router.post('/deposit', isAuthenticated, async (req, res) => {
    const { amount } = req.body;
    const user = db.findUserById(req.session.user.id);

    try {
        const depositAmount = parseFloat(amount);
        
        if (isNaN(depositAmount) || depositAmount <= 0) {
            const transactions = [];
            return res.render('wallet', {
                title: 'Wallet',
                user: user,
                transactions: transactions,
                success: null,
                error: 'Invalid amount'
            });
        }

        const updatedUser = db.updateBalance(user.id, depositAmount, 'add');

        if (updatedUser.error) {
            const transactions = [];
            return res.render('wallet', {
                title: 'Wallet',
                user: user,
                transactions: transactions,
                success: null,
                error: updatedUser.error
            });
        }

        // ⭐⭐⭐ ลบการบันทึก transaction ออก ⭐⭐⭐
        // Main API จะเก็บ transactions อยู่แล้ว
        
        // db.addTransaction({ ... }); ← ลบออก

        // ดึง transactions ใหม่
        let transactions = [];
        try {
            const response = await axiosInstance.post(
                `${process.env.API_ENDPOINT}/api/history`,
                {
                    username: user.username,
                    limit: 20
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
            }
        } catch (error) {
            transactions = [];
        }

        const finalUser = db.findUserById(user.id);
        res.render('wallet', {
            title: 'Wallet',
            user: finalUser,
            transactions: transactions,
            success: `Successfully deposited ${depositAmount.toFixed(2)} ${user.currency}`,
            error: null
        });

    } catch (error) {
        console.error('Deposit error:', error);
        const transactions = [];
        res.render('wallet', {
            title: 'Wallet',
            user: user,
            transactions: transactions,
            success: null,
            error: 'An error occurred during deposit'
        });
    }
});

// Subtract Balance (Withdraw)
router.post('/withdraw', isAuthenticated, async (req, res) => {
    const { amount } = req.body;
    const user = db.findUserById(req.session.user.id);

    try {
        const withdrawAmount = parseFloat(amount);
        
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            const transactions = [];
            return res.render('wallet', {
                title: 'Wallet',
                user: user,
                transactions: transactions,
                success: null,
                error: 'Invalid amount'
            });
        }

        if (user.balance < withdrawAmount) {
            const transactions = [];
            return res.render('wallet', {
                title: 'Wallet',
                user: user,
                transactions: transactions,
                success: null,
                error: 'Insufficient balance'
            });
        }

        const updatedUser = db.updateBalance(user.id, withdrawAmount, 'subtract');

        if (updatedUser.error) {
            const transactions = [];
            return res.render('wallet', {
                title: 'Wallet',
                user: user,
                transactions: transactions,
                success: null,
                error: updatedUser.error
            });
        }

        // ⭐⭐⭐ ลบการบันทึก transaction ออก ⭐⭐⭐
        // Main API จะเก็บ transactions อยู่แล้ว
        
        // db.addTransaction({ ... }); ← ลบออก

        // ดึง transactions ใหม่
        let transactions = [];
        try {
            const response = await axiosInstance.post(
                `${process.env.API_ENDPOINT}/api/history`,
                {
                    username: user.username,
                    limit: 20
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
            }
        } catch (error) {
            transactions = [];
        }

        const finalUser = db.findUserById(user.id);
        res.render('wallet', {
            title: 'Wallet',
            user: finalUser,
            transactions: transactions,
            success: `Successfully withdrew ${withdrawAmount.toFixed(2)} ${user.currency}`,
            error: null
        });

    } catch (error) {
        console.error('Withdraw error:', error);
        const transactions = [];
        res.render('wallet', {
            title: 'Wallet',
            user: user,
            transactions: transactions,
            success: null,
            error: 'An error occurred during withdrawal'
        });
    }
});

module.exports = router;