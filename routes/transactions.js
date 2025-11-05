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

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
};

// GET Transactions Page
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const user = db.findUserById(req.session.user.id);
        
        // Filters
        const filters = {
            startDate: req.query.startDate || '',
            endDate: req.query.endDate || '',
            type: req.query.type || ''
        };
        
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        
        // ดึง transactions จาก API หลัก
        let transactions = [];
        let stats = {
            totalBets: 0,
            totalWins: 0,
            totalBetAmount: 0,
            totalWinAmount: 0
        };
        
        try {
            // เรียก API หลักเพื่อดึง transactions
            const response = await axiosInstance.post(
                `${process.env.API_ENDPOINT}/api/history`,
                {
                    username: user.username,
                    startDate: filters.startDate,
                    endDate: filters.endDate,
                    type: filters.type,
                    page: page,
                    limit: limit
                },
                {
                    headers: { 
                        'x-api-key': process.env.API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            
            if (response.data) {
                transactions = response.data.data || response.data || [];
                console.log(`✅ Loaded ${transactions.length} transactions from API`);
                
                // คำนวณ stats
                transactions.forEach(txn => {
                    if (txn.betAmount > 0) {
                        stats.totalBets++;
                        stats.totalBetAmount += txn.betAmount;
                    }
                    if (txn.payoutAmount > 0) {
                        stats.totalWins++;
                        stats.totalWinAmount += txn.payoutAmount;
                    }
                });
            }
        } catch (apiError) {
            console.log('⚠️ Cannot load transactions from API:', apiError.message);
            // Fallback: ใช้ transactions ท้องถิ่น
            transactions = db.getUserTransactions(user.id, limit);
            
            transactions.forEach(txn => {
                if (txn.type === 'bet') {
                    stats.totalBets++;
                    stats.totalBetAmount += txn.amount;
                } else if (txn.type === 'win') {
                    stats.totalWins++;
                    stats.totalWinAmount += txn.amount;
                }
            });
        }
        
        // Apply local filters if needed
        if (filters.startDate || filters.endDate || filters.type) {
            transactions = transactions.filter(txn => {
                let match = true;
                
                if (filters.startDate) {
                    const txnDate = new Date(txn.createdDate || txn.timestamp);
                    const startDate = new Date(filters.startDate);
                    if (txnDate < startDate) match = false;
                }
                
                if (filters.endDate) {
                    const txnDate = new Date(txn.createdDate || txn.timestamp);
                    const endDate = new Date(filters.endDate);
                    endDate.setHours(23, 59, 59);
                    if (txnDate > endDate) match = false;
                }
                
                if (filters.type) {
                    // Determine type from transaction data
                    let txnType = '';
                    if (txn.betAmount > 0 && txn.payoutAmount === 0) {
                        txnType = 'bet';
                    } else if (txn.payoutAmount > 0) {
                        txnType = 'win';
                    } else if (txn.type) {
                        txnType = txn.type;
                    }
                    
                    if (txnType !== filters.type) match = false;
                }
                
                return match;
            });
        }
        
        res.render('transactions', {
            title: 'Transactions',
            user: user,
            transactions: transactions,
            stats: stats,
            filters: filters,
            pagination: {
                page: page,
                limit: limit,
                total: transactions.length
            }
        });
    } catch (error) {
        console.error('Transactions page error:', error);
        res.render('error', {
            title: 'Error',
            message: 'Cannot load transactions',
            error: error
        });
    }
});

// GET Transaction Details (Modal/API)
router.get('/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const user = db.findUserById(req.session.user.id);
        
        // ดึงรายละเอียด transaction จาก API
        const response = await axiosInstance.get(
            `${process.env.API_ENDPOINT}/api/transaction/${id}`,
            {
                headers: { 
                    'x-api-key': process.env.API_KEY
                },
                timeout: 5000
            }
        );
        
        res.json(response.data);
    } catch (error) {
        console.error('Transaction detail error:', error);
        res.status(500).json({
            error: 'Cannot load transaction details'
        });
    }
});

module.exports = router;