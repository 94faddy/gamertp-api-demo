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

// ⭐⭐⭐ Provider Configuration (Client side - UI only) ⭐⭐⭐
// ⚠️ NOTE: URLs are NOT here - they come from API!
const PROVIDERS = {
    PG: {
        name: 'PG Soft',
        code: 'PG',
        icon: '🎮',
        color: '#667eea'
    },
    JILI: {
        name: 'JILI',
        code: 'JILI',
        icon: '🎰',
        color: '#764ba2'
    },
    JOKER: {
        name: 'Joker',
        code: 'JOKER',
        icon: '♠️',
        color: '#ff6b6b'
    },
    PP: {
        name: 'Pragmatic Play',
        code: 'PP',
        icon: '🎲',
        color: '#ffa500'
    }
};

// Game List Page - Load games by provider
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const user = db.findUserById(req.session.user.id);
        const selectedProvider = req.query.provider || 'PG';
        
        let games = [];
        let error = null;

        try {
            console.log(`\n📊 Loading games from provider: ${selectedProvider}`);
            const response = await axiosInstance.get(
                `${process.env.GAME_API_URL}/api/gamelist?provider=${selectedProvider}`,
                {
                    timeout: 10000
                }
            );
            games = response.data.games || [];
            console.log(`✅ Loaded ${games.length} games from ${selectedProvider}`);
        } catch (apiError) {
            console.error(`❌ Error loading ${selectedProvider} games:`, apiError.message);
            error = `Failed to load ${selectedProvider} games`;
            games = [];
        }
        
        res.render('games', {
            title: 'Games',
            user: user,
            games: games,
            providers: PROVIDERS,
            selectedProvider: selectedProvider,
            error: error
        });
    } catch (error) {
        console.error('Error in games page:', error.message);
        const user = db.findUserById(req.session.user.id);
        res.render('games', {
            title: 'Games',
            user: user,
            games: [],
            providers: PROVIDERS,
            selectedProvider: 'PG',
            error: 'Failed to load games'
        });
    }
});

// ============================================
// 🆕 NEW ENDPOINT - POST /api/getGameUrl
// ============================================
// This endpoint is called by the Play page
// It requests the game URL from Main API

router.post('/api/getGameUrl', isAuthenticated, async (req, res) => {
    try {
        const { username, gameCode, provider, gameId, isPlayerSetting, setting, buyFeatureSetting } = req.body;
        const user = db.findUserById(req.session.user.id);

        console.log('\n=== GET GAME URL FROM MAIN API ===');
        console.log('📡 Backend forwarding request to Main API...');
        console.log('Provider:', provider);
        console.log('Game Code:', gameCode);
        console.log('Username:', username);

        // ============================================
        // CALL MAIN API TO GET GAME URL
        // ============================================
        try {
            const mainApiResponse = await axiosInstance.post(
                `${process.env.API_ENDPOINT}/api/getGameUrl`,
                {
                    username: username,
                    gameCode: gameCode,
                    provider: provider,
                    gameId: gameId || gameCode,
                    isPlayerSetting: isPlayerSetting || true,
                    setting: setting || [],
                    buyFeatureSetting: buyFeatureSetting || []
                },
                {
                    headers: { 
                        'x-api-key': process.env.API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );

            const gameUrl = mainApiResponse.data.gameUrl;
            const newSessionToken = mainApiResponse.data.sessionToken;

            console.log('✅ Main API Response received');
            console.log('🔗 Game URL length:', gameUrl.length, 'chars');
            
            // Update session token if provided by Main API
            if (newSessionToken && typeof newSessionToken === 'string') {
                user.sessionToken = newSessionToken;
                db.updateUser(user.id, { sessionToken: newSessionToken });
                console.log('📝 Session token updated from API');
            }

            // ✅ Return to client
            return res.json({
                success: true,
                gameUrl: gameUrl,
                sessionToken: newSessionToken || user.sessionToken,
                provider: provider,
                message: 'Game URL retrieved successfully'
            });

        } catch (mainApiError) {
            console.error('❌ Main API Error:', mainApiError.response?.status, mainApiError.message);
            
            // Log API error response for debugging
            if (mainApiError.response?.data) {
                console.error('API Response:', mainApiError.response.data);
            }

            // ⚠️ If Main API is down, we still have fallback in frontend
            throw mainApiError;
        }

    } catch (error) {
        console.error('❌ Error in getGameUrl endpoint:', error.message);
        
        // Return error to frontend
        // Frontend will use fallback URL generation
        return res.status(error.response?.status || 500).json({
            success: false,
            message: 'Failed to get game URL from API',
            error: error.message,
            note: 'Frontend will use fallback URL generation'
        });
    }
});

// Play Game - Get URL from API
router.get('/play/:provider/:gameCode', isAuthenticated, async (req, res) => {
    try {
        const { provider, gameCode } = req.params;
        const user = db.findUserById(req.session.user.id);

        // ✅ Validate Provider (UI validation only)
        if (!PROVIDERS[provider.toUpperCase()]) {
            return res.status(400).render('error', {
                title: 'Error',
                message: 'Invalid provider',
                error: {
                    message: `Provider ${provider} is not supported.`,
                    details: 'Available providers: ' + Object.keys(PROVIDERS).join(', ')
                }
            });
        }

        const providerInfo = PROVIDERS[provider.toUpperCase()];
        
        console.log('\n=== Game Launch Process ===');
        console.log('Provider:', providerInfo.name);
        console.log('User:', user.username);
        console.log('Game Code:', gameCode);

        // ============================================
        // STEP 1: ดึง Game List จาก API เพื่อหาเกม
        // ============================================
        let game = null;
        try {
            const response = await axiosInstance.get(
                `${process.env.GAME_API_URL}/api/gamelist?provider=${provider.toUpperCase()}`,
                { timeout: 10000 }
            );
            const games = response.data.games || [];
            game = games.find(g => 
                g.game_code === gameCode || 
                g.game_id === gameCode ||
                g.code === gameCode
            );

            if (!game) {
                console.log(`❌ Game not found: ${gameCode}`);
                return res.redirect(`/games?provider=${provider.toUpperCase()}`);
            }
            console.log(`✅ Game found: ${game.game_name}`);
        } catch (error) {
            console.error('❌ Error fetching game list:', error.message);
            return res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load game',
                error: { message: error.message }
            });
        }

        // ============================================
        // STEP 2: สร้าง/อัพเดท sessionToken
        // ============================================
        if (!user.sessionToken) {
            user.sessionToken = crypto.randomUUID();
            db.updateUser(user.id, { sessionToken: user.sessionToken });
            console.log('✅ New session token created');
        }

        console.log('Session Token:', user.sessionToken.substring(0, 20) + '...');

        // ============================================
        // STEP 3: ⭐⭐⭐ GET GAME URL FROM API ⭐⭐⭐
        // ============================================
        console.log('\n📡 Requesting game URL from API...');
        
        let gameUrl = '';
        
        try {
            // ⭐ Ask API for game URL
            // API knows all provider details, client doesn't
            const apiResponse = await axiosInstance.post(
                `${process.env.API_ENDPOINT}/api/getGameUrl`,
                {
                    username: user.username,
                    gameCode: gameCode,
                    provider: provider.toUpperCase(),
                    gameId: game.game_id || gameCode,
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

            // ✅ API returns URL - client just uses it!
            gameUrl = apiResponse.data.gameUrl;
            console.log('✅ Game URL received from API');
            console.log('🔗 URL length:', gameUrl.length, 'chars');
            
            // If API returns new sessionToken, use it
            if (apiResponse.data.sessionToken && typeof apiResponse.data.sessionToken === 'string') {
                console.log('📄 Using new session token from API');
                user.sessionToken = apiResponse.data.sessionToken;
                db.updateUser(user.id, { sessionToken: apiResponse.data.sessionToken });
            }

        } catch (apiError) {
            console.error('❌ Error getting game URL from API:', apiError.message);
            
            // ⚠️ Fallback: Try to generate URL on client side if API fails
            // This is TEMPORARY - only if API is down
            console.log('⚠️  Fallback: Generating URL on client side...');
            
            try {
                gameUrl = generateFallbackGameUrl(
                    provider.toUpperCase(), 
                    gameCode, 
                    user.sessionToken,
                    game
                );
                console.log('✅ Fallback URL generated');
            } catch (fallbackError) {
                console.error('❌ Fallback also failed:', fallbackError.message);
                return res.render('error', {
                    title: 'Error',
                    message: 'Failed to launch game',
                    error: {
                        message: 'Cannot connect to game server',
                        details: apiError.message
                    }
                });
            }
        }

        console.log('✅ Game URL ready');
        console.log(`🔗 Provider: ${providerInfo.name}`);

        res.render('play', {
            title: `Play ${game.game_name}`,
            user: user,
            game: game,
            provider: providerInfo,
            gameUrl: gameUrl
        });

    } catch (error) {
        console.error('❌ Server Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to launch game',
            error: {
                message: error.message,
                details: 'Please try again or contact support'
            }
        });
    }
});

// ============================================
// 🆕 NEW ENDPOINT - GET /api/gameList
// ============================================
// Alternative endpoint to get game list
// Can be called independently

router.post('/api/gameList', isAuthenticated, async (req, res) => {
    try {
        const { provider } = req.body;
        const selectedProvider = provider || 'PG';

        console.log(`\n📊 API: Fetching game list for provider: ${selectedProvider}`);

        const response = await axiosInstance.get(
            `${process.env.GAME_API_URL}/api/gamelist?provider=${selectedProvider}`,
            { timeout: 10000 }
        );

        const games = response.data.games || [];
        console.log(`✅ Fetched ${games.length} games`);

        return res.json({
            success: true,
            provider: selectedProvider,
            gameCount: games.length,
            games: games
        });

    } catch (error) {
        console.error('❌ Error fetching game list:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch game list',
            error: error.message
        });
    }
});

// ============================================
// ⭐ FALLBACK FUNCTION ONLY
// ============================================
// ⚠️ This should be removed once API provides getGameUrl endpoint
// Only used if API is temporarily down or not yet implemented

function generateFallbackGameUrl(provider, gameCode, sessionToken, gameData = {}) {
    console.log('⚠️  Using client-side URL generation (TEMPORARY FALLBACK)');
    
    const operatorToken = 'T65-AWDF-WAUE-OQ09-GST1';
    let gameUrl = '';

    switch (provider) {
        case 'PG':
            gameUrl = `https://m.pgsoft-th.com/${gameCode}/index.html?` +
                     `language=th&` +
                     `bet_type=1&` +
                     `operator_token=${operatorToken}&` +
                     `operator_player_session=${sessionToken}&` +
                     `or=cdn.pgsoft-th.com`;
            break;

        case 'JILI':
            gameUrl = `https://jili-server.foxi-bet.com/play/jili?` +
                     `operator_player_session=${sessionToken}&` +
                     `operator_token=${operatorToken}&` +
                     `game_code=${gameCode}&` +
                     `game_id=${gameData.game_id || gameCode}`;
            break;

        case 'JOKER':
            gameUrl = `https://joker.onsen168.com/play/joker?` +
                     `operator_player_session=${sessionToken}&` +
                     `operator_token=${operatorToken}&` +
                     `game_code=${gameCode}&` +
                     `game_id=${gameCode}`;
            break;

        case 'PP':
            gameUrl = `https://onsen168.com/play/game?` +
                     `operator_player_session=${sessionToken}&` +
                     `operator_token=${operatorToken}&` +
                     `game_code=${gameCode}&` +
                     `game_id=${gameCode}&` +
                     `provider=pracmatic`;
            break;

        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }

    return gameUrl;
}

// ⭐ API Endpoint - Get providers list
router.get('/api/providers', (req, res) => {
    try {
        res.json({
            success: true,
            providers: Object.entries(PROVIDERS).map(([key, value]) => ({
                code: value.code,
                name: value.name,
                icon: value.icon,
                color: value.color
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================
// 🆕 NEW ENDPOINT - GET /api/health
// ============================================
// Health check endpoint
// Use this to test if backend is responding

router.get('/api/health', (req, res) => {
    return res.json({
        success: true,
        status: 'OK',
        timestamp: new Date().toISOString(),
        endpoints: {
            gameList: 'GET /games?provider={PROVIDER}',
            playGame: 'GET /games/play/{provider}/{gameCode}',
            getGameUrl: 'POST /api/getGameUrl',
            getProviders: 'GET /api/providers',
            health: 'GET /api/health'
        }
    });
});

module.exports = router;