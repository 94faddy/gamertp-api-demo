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

// ===================================================================
// 👤 USER ENDPOINTS
// ===================================================================

/**
 * GET /api/user/balance
 * ดึง Balance ของ User ที่ Login อยู่
 */
router.get('/user/balance', (req, res) => {
    try {
        // ตรวจสอบว่า Login แล้วหรือยัง
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: Please login first'
            });
        }

        const userId = req.session.user.id;
        const user = db.findUserById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        return res.json({
            success: true,
            balance: user.balance.toFixed(2),
            currency: user.currency,
            username: user.username
        });

    } catch (error) {
        console.error('❌ Error in /api/user/balance:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// ===================================================================
// 💰 WALLET ENDPOINTS (สำหรับ Main API เรียก)
// ===================================================================

/**
 * POST /api/checkBalance
 * ตรวจสอบยอดเงิน (เรียกจาก Main API)
 */
router.post('/checkBalance', (req, res) => {
    try {
        const { username } = req.body;
        const apiKey = req.headers['x-api-key'];

        console.log('📥 CHECK BALANCE REQUEST:', { username, apiKey });

        // Validate API Key (ใช้ secret แทน apikey)
        const agent = db.findAgentBySecret(apiKey);
        if (!agent) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API Key'
            });
        }

        const user = db.findUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        return res.json({
            success: true,
            balance: user.balance.toFixed(2),
            currency: user.currency
        });

    } catch (error) {
        console.error('❌ Error in checkBalance:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/settleBets
 * หัก/เพิ่มเงินจากการเดิมพัน (เรียกจาก Main API)
 */
router.post('/settleBets', (req, res) => {
    try {
        const { username, id, txns } = req.body;
        const apiKey = req.headers['x-api-key'];

        console.log('📥 SETTLE BETS REQUEST:', { username, id, apiKey });
        console.log('📊 Transactions:', txns);

        // Validate API Key
        const agent = db.findAgentBySecret(apiKey);
        if (!agent) {
            return res.status(401).json({
                success: false,
                statusCode: 30001,
                message: 'Invalid API Key'
            });
        }

        const user = db.findUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                statusCode: 30001,
                message: 'User not found'
            });
        }

        // Process transaction
        const txn = txns[0];
        const betAmount = parseFloat(txn.betAmount) || 0;
        const payoutAmount = parseFloat(txn.payoutAmount) || 0;
        
        const balanceBefore = user.balance;
        
        // คำนวณยอดเงินหลังเดิมพัน
        const netAmount = payoutAmount - betAmount;
        
        // อัพเดทยอดเงิน
        let updatedUser;
        if (netAmount < 0) {
            // ยอดเงินลดลง (แพ้)
            updatedUser = db.updateBalance(user.id, Math.abs(netAmount), 'subtract');
        } else if (netAmount > 0) {
            // ยอดเงินเพิ่ม (ชนะ)
            updatedUser = db.updateBalance(user.id, netAmount, 'add');
        } else {
            // ยอดเงินไม่เปลี่ยน
            updatedUser = { error: false, balance: user.balance };
        }

        if (updatedUser.error) {
            return res.json({
                success: false,
                statusCode: 30002,
                message: 'Insufficient balance',
                balanceBefore: balanceBefore.toFixed(2),
                balanceAfter: balanceBefore.toFixed(2)
            });
        }

        // ⭐⭐⭐ ลบการบันทึก transaction ออก ⭐⭐⭐
        // Main API จะเก็บ transactions อยู่แล้ว
        // ไม่จำเป็นต้องเก็บซ้ำที่ Wallet API
        
        // db.addTransaction({  ← ลบออก
        //     userId: user.id,
        //     type: netAmount >= 0 ? 'win' : 'bet',
        //     amount: Math.abs(netAmount),
        //     balanceBefore: balanceBefore,
        //     balanceAfter: updatedUser.balance,
        //     metadata: { ... }
        // });

        console.log('✅ Transaction processed successfully');
        console.log('💰 Balance: Before =', balanceBefore.toFixed(2), ', After =', updatedUser.balance.toFixed(2));
        console.log('📌 Transaction history is stored in Main API only');

        return res.json({
            success: true,
            statusCode: 0,
            balanceBefore: balanceBefore.toFixed(2),
            balanceAfter: updatedUser.balance.toFixed(2),
            currency: user.currency
        });

    } catch (error) {
        console.error('❌ Error in settleBets:', error);
        return res.status(500).json({
            success: false,
            statusCode: 50001,
            message: 'Internal server error'
        });
    }
});

// ===================================================================
// 📊 HISTORY ENDPOINT (ส่งต่อไป Main API)
// ===================================================================

/**
 * POST /api/history
 * ดึงประวัติการเดิมพัน (Forward ไป Main API)
 */
router.post('/history', async (req, res) => {
    try {
        const { username, startDate, endDate, type, page = 1, limit = 50 } = req.body;
        const apiKey = req.headers['x-api-key'];

        console.log('📥 HISTORY REQUEST:', { username, apiKey });

        // Validate API Key
        const agent = db.findAgentByApiKey(apiKey);
        if (!agent) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API Key'
            });
        }

        const user = db.findUserByUsername(username);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // ⭐ Forward request ไป Main API
        console.log('📡 Forwarding request to Main API...');
        
        try {
            const response = await axiosInstance.post(
                `${process.env.API_ENDPOINT}/api/history`,
                {
                    username: username,
                    startDate: startDate,
                    endDate: endDate,
                    type: type,
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
                console.log('✅ Loaded transactions from Main API');
                return res.json(response.data);
            } else {
                return res.json({
                    success: true,
                    data: [],
                    total: 0,
                    page: page,
                    limit: limit
                });
            }
        } catch (apiError) {
            console.error('❌ Failed to fetch from Main API:', apiError.message);
            
            // Return empty result instead of error
            return res.json({
                success: true,
                data: [],
                total: 0,
                page: page,
                limit: limit,
                message: 'Cannot connect to Main API'
            });
        }

    } catch (error) {
        console.error('❌ Error in history:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router;