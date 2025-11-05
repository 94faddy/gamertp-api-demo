const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
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

// Game List Page
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const user = db.findUserById(req.session.user.id);
        const response = await axiosInstance.get(`${process.env.GAME_API_URL}/api/gamelist?provider=PG`);
        const games = response.data.games || [];
        
        res.render('games', {
            title: 'Games',
            user: user,
            games: games,
            error: null
        });
    } catch (error) {
        console.error('Error fetching games:', error.message);
        const user = db.findUserById(req.session.user.id);
        res.render('games', {
            title: 'Games',
            user: user,
            games: [],
            error: 'Failed to load games'
        });
    }
});

// Play Game
router.get('/play/:gameCode', isAuthenticated, async (req, res) => {
    try {
        const { gameCode } = req.params;
        const user = db.findUserById(req.session.user.id);
        
        const response = await axiosInstance.get(`${process.env.GAME_API_URL}/api/gamelist?provider=PG`);
        const games = response.data.games || [];
        const game = games.find(g => g.game_code === gameCode || g.game_id === gameCode);

        if (!game) {
            console.log('Game not found:', gameCode);
            return res.redirect('/games');
        }

        console.log('\n=== Game Launch Process ===');
        console.log('User:', user.username);
        console.log('Game Code:', gameCode);

        // ============================================
        // STEP 1: สร้าง/อัพเดท sessionToken
        // ============================================
        if (!user.sessionToken) {
            user.sessionToken = crypto.randomUUID();
            db.updateUser(user.id, { sessionToken: user.sessionToken });
            console.log('✅ New session token created');
        }

        console.log('Session Token:', user.sessionToken);

        // ============================================
        // STEP 2: ⭐ สร้าง User ใน Main API (CRITICAL!)
        // ============================================
        console.log('\n📡 Creating/Updating user in Main API...');
        
        try {
            // เรียก /api/setGameSetting เพื่อสร้าง user และ sessionToken ใน Main API
            const createUserResponse = await axiosInstance.post(
                `${process.env.API_ENDPOINT}/api/setGameSetting`,
                {
                    username: user.username,
                    gameCode: gameCode,
                    isPlayerSetting: true,
                    setting: [],
                    buyFeatureSetting: []
                },
                {
                    headers: { 
                        'x-api-key': process.env.API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            console.log('✅ User created/updated in Main API');
            console.log('Response:', createUserResponse.data);

            // ⚠️ สำคัญ: Main API จะ return sessionToken ใหม่
            // เราต้องใช้ token นี้แทน
            const apiSessionToken = createUserResponse.data;
            
            if (apiSessionToken && typeof apiSessionToken === 'string') {
                console.log('🔄 Using new session token from API:', apiSessionToken);
                user.sessionToken = apiSessionToken;
                db.updateUser(user.id, { sessionToken: apiSessionToken });
            }

        } catch (apiError) {
            console.error('❌ Failed to create user in Main API:', apiError.message);
            
            // ถ้าไม่สามารถสร้าง user ได้ให้แสดง error
            return res.render('error', {
                title: 'Error',
                message: 'Failed to initialize game session',
                error: {
                    message: 'Cannot connect to game server. Please try again later.',
                    details: apiError.message
                }
            });
        }

        // ============================================
        // STEP 3: สร้าง Game URL
        // ============================================
        console.log('\n🎮 Generating Game URL...');
        
        const gameUrl = `https://m.pgsoft-th.com/${gameCode}/index.html?` + 
                       `language=th&` +
                       `bet_type=1&` +
                       `operator_token=T65-AWDF-WAUE-OQ09-GST1&` +
                       `operator_player_session=${user.sessionToken}&` +
                       `or=cdn.pgsoft-th.com`;

        console.log('✅ Game URL generated');
        console.log('🔗 URL:', gameUrl);
        console.log('📌 Note: Game settings will be managed by Main API (Agent level)');

        res.render('play', {
            title: `Play ${game.game_name}`,
            user: user,
            game: game,
            gameUrl: gameUrl
        });

    } catch (error) {
        console.error('❌ Server Error:', error);
        res.render('error', {
            title: 'Error',
            message: 'Failed to launch game',
            error: error.message
        });
    }
});

module.exports = router;