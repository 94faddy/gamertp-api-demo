const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const axios = require('axios');
const https = require('https');
const db = require('../helpers/db');

// สร้าง axios instance
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false
    })
});

// Login Page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', { 
        title: 'Login',
        error: null 
    });
});

// Login Handler
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // ค้นหา user
        const user = db.findUserByUsername(username);
        
        if (!user) {
            return res.render('login', {
                title: 'Login',
                error: 'Invalid username or password'
            });
        }

        // ตรวจสอบ password
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.render('login', {
                title: 'Login',
                error: 'Invalid username or password'
            });
        }

        // สร้าง sessionToken แบบ random (จะใช้ตอนเรียก API)
        user.sessionToken = crypto.randomBytes(32).toString('hex');
        db.saveDatabase();
        
        console.log('User logged in:', username);
        console.log('Session token:', user.sessionToken);

        // Set session
        req.session.user = {
            id: user.id,
            username: user.username,
            balance: user.balance,
            currency: user.currency
        };

        res.redirect('/dashboard');

    } catch (error) {
        console.error('Login error:', error);
        res.render('login', {
            title: 'Login',
            error: 'An error occurred. Please try again.'
        });
    }
});

// Register Page
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register', { 
        title: 'Register',
        error: null 
    });
});

// Register Handler
router.post('/register', async (req, res) => {
    try {
        const { username, password, confirmPassword } = req.body;

        // Validation
        if (!username || !password || !confirmPassword) {
            return res.render('register', {
                title: 'Register',
                error: 'All fields are required'
            });
        }

        if (password !== confirmPassword) {
            return res.render('register', {
                title: 'Register',
                error: 'Passwords do not match'
            });
        }

        if (password.length < 6) {
            return res.render('register', {
                title: 'Register',
                error: 'Password must be at least 6 characters'
            });
        }

        // ตรวจสอบว่า username ซ้ำหรือไม่
        const existingUser = db.findUserByUsername(username);
        if (existingUser) {
            return res.render('register', {
                title: 'Register',
                error: 'Username already exists'
            });
        }

        console.log('Registering new user:', username);

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // สร้าง user ในฐานข้อมูลท้องถิ่น
        const newUser = {
            id: `user-${Date.now()}`,
            agentId: 'agent-001',
            username: username,
            password: hashedPassword,
            balance: 1000,
            currency: 'THB',
            sessionToken: null,
            createdAt: new Date().toISOString()
        };

        db.addUser(newUser);

        console.log('✅ User registered successfully:', username);
        console.log('⚠️  User will be created in Seamless API when they play their first game');

        // Redirect ไป login
        res.redirect('/auth/login?registered=1');

    } catch (error) {
        console.error('Register error:', error);
        res.render('register', {
            title: 'Register',
            error: 'An error occurred. Please try again.'
        });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/auth/login');
    });
});

module.exports = router;