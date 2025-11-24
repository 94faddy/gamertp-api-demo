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

const PROVIDERS = {
    PG: { name: 'PG Soft', code: 'PG', icon: '🎮', color: '#667eea' },
    JILI: { name: 'JILI', code: 'JILI', icon: '🎰', color: '#764ba2' },
    JOKER: { name: 'Joker', code: 'JOKER', icon: '♠️', color: '#ff6b6b' },
    PP: { name: 'Pragmatic Play', code: 'PP', icon: '🎲', color: '#ffa500' }
};

// Game List Page
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
                { timeout: 10000 }
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

// Play Game - ✅ CORRECT METHOD (from working version)
router.get('/play/:provider/:gameCode', isAuthenticated, async (req, res) => {
    try {
        const { provider, gameCode } = req.params;
        const user = db.findUserById(req.session.user.id);

        if (!PROVIDERS[provider.toUpperCase()]) {
            return res.status(400).render('error', {
                title: 'Error',
                message: 'Invalid provider',
                error: { message: `Provider ${provider} not supported` }
            });
        }

        const providerInfo = PROVIDERS[provider.toUpperCase()];
        
        console.log('\n' + '='.repeat(80));
        console.log('🎮 GAME LAUNCH');
        console.log('='.repeat(80));
        console.log('Provider:', providerInfo.name);
        console.log('User:', user.username);
        console.log('Game Code:', gameCode);

        // Get game list
        let game = null;
        try {
            const response = await axiosInstance.get(
                `${process.env.GAME_API_URL}/api/gamelist?provider=${provider.toUpperCase()}`,
                { timeout: 10000 }
            );
            const games = response.data.games || [];
            game = games.find(g => g.game_code === gameCode || g.game_id === gameCode || g.code === gameCode);

            if (!game) {
                console.log(`❌ Game not found: ${gameCode}`);
                return res.redirect(`/games?provider=${provider.toUpperCase()}`);
            }
            
            console.log(`✅ Game found: ${game.game_name}`);

        } catch (error) {
            console.error('❌ Error loading game list:', error.message);
            return res.status(500).render('error', {
                title: 'Error',
                message: 'Failed to load game',
                error: { message: error.message }
            });
        }

        // ============================================
        // ✅ STEP 1: Create session in Main API
        // ============================================
        console.log('\n📡 Creating session in Main API...');
        
        let sessionToken = null;
        let gameUrl = '';
        
        try {
            // Call /api/setGameSetting (this creates the session)
            const sessionResponse = await axiosInstance.post(
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

            // ⭐ Main API returns the session token
            sessionToken = sessionResponse.data;
            
            if (!sessionToken || typeof sessionToken !== 'string') {
                throw new Error('Invalid token response: ' + JSON.stringify(sessionResponse.data));
            }
            
            console.log('✅ Got session token from Main API');
            console.log('   Token:', sessionToken.substring(0, 40) + '...');

            // Save to database
            user.sessionToken = sessionToken;
            db.updateUser(user.id, { sessionToken: sessionToken });
            console.log('💾 Token saved to database');

        } catch (sessionError) {
            console.error('❌ Failed to create session:');
            console.error('   Status:', sessionError.response?.status);
            console.error('   Message:', sessionError.response?.data?.message || sessionError.message);
            
            return res.render('error', {
                title: 'Session Error',
                message: 'Failed to create game session',
                error: { 
                    message: sessionError.response?.data?.message || 'Cannot initialize game session',
                    status: sessionError.response?.status
                }
            });
        }

        // ============================================
        // ✅ STEP 2: Build game URL with token
        // ============================================
        console.log('\n🔗 Building game URL...');
        
        try {
            gameUrl = buildGameUrl(
                provider.toUpperCase(),
                gameCode,
                sessionToken,
                game
            );
            
            console.log('✅ Game URL built successfully');
            console.log('   URL:', gameUrl.substring(0, 80) + '...');
            
        } catch (urlError) {
            console.error('❌ Failed to build URL:', urlError.message);
            return res.render('error', {
                title: 'URL Error',
                message: 'Cannot generate game URL',
                error: { message: urlError.message }
            });
        }

        console.log('='.repeat(80));
        console.log('✅ Game ready to launch\n');

        res.render('play', {
            title: `Play ${game.game_name}`,
            user: user,
            game: game,
            provider: providerInfo,
            gameUrl: gameUrl
        });

    } catch (error) {
        console.error('❌ Unexpected error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to launch game',
            error: { message: error.message }
        });
    }
});

// ⭐ BUILD GAME URL - Works with all providers
function buildGameUrl(provider, gameCode, sessionToken, gameData = {}) {
    console.log('   Provider:', provider);
    console.log('   Game Code:', gameCode);
    
    const operatorToken = 'T65-AWDF-WAUE-OQ09-GST1';
    let gameUrl = '';

    switch (provider) {
        case 'PG':
            gameUrl = `https://m.pgsoft-th.com/${gameCode}/index.html?` +
                     `language=th&bet_type=1&` +
                     `operator_token=${operatorToken}&` +
                     `operator_player_session=${sessionToken}&` +
                     `or=cdn.pgsoft-th.com`;
            break;

        case 'JILI':
            const jiliGameId = gameData.game_id || gameCode;
            gameUrl = `https://portal.cgm-game.com/play/game?` +
                     `operator_player_session=${sessionToken}&` +
                     `operator_token=${operatorToken}&` +
                     `game_code=${gameCode}&` +
                     `game_id=${jiliGameId}&` +
                     `provider=jili`;
            break;

        case 'JOKER':
            gameUrl = `https://portal.cgm-game.com/play/game?` +
                     `operator_player_session=${sessionToken}&` +
                     `operator_token=${operatorToken}&` +
                     `game_code=${gameCode}&` +
                     `game_id=${gameCode}&` +
                     `provider=joker`;
            break;

        case 'PP':
            gameUrl = `https://portal.cgm-game.com/play/game?` +
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

// Game List API
router.post('/api/gameList', isAuthenticated, async (req, res) => {
    try {
        const { provider } = req.body;

        const response = await axiosInstance.get(
            `${process.env.GAME_API_URL}/api/gamelist?provider=${provider || 'PG'}`,
            { timeout: 10000 }
        );

        const games = response.data.games || [];

        return res.json({
            success: true,
            provider: provider,
            gameCount: games.length,
            games: games
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Providers API
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
        res.status(500).json({ success: false, message: error.message });
    }
});

// Health check
router.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;