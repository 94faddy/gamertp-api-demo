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

const JILI_GAME_MAP = {
    '4': 'tislot',
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

// GET GAME URL ENDPOINT
router.post('/api/getGameUrl', isAuthenticated, async (req, res) => {
    try {
        const { username, gameCode, provider, gameId } = req.body;
        const user = db.findUserById(req.session.user.id);

        console.log('\n' + '='.repeat(60));
        console.log('🎮 GET GAME URL REQUEST');
        console.log('='.repeat(60));
        console.log('📨 Request:', { username, gameCode, provider });

        if (!username || !gameCode || !provider) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        if (!user.sessionToken) {
            user.sessionToken = crypto.randomUUID();
            db.updateUser(user.id, { sessionToken: user.sessionToken });
        }

        console.log('\n📡 Trying Main API endpoint: /api/getGameUrl');
        
        try {
            const mainApiResponse = await axiosInstance.post(
                `${process.env.API_ENDPOINT}/api/getGameUrl`,
                { username, gameCode, provider, gameId: gameId || gameCode },
                {
                    headers: { 
                        'x-api-key': process.env.API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );

            const gameUrl = mainApiResponse.data.gameUrl;
            if (!gameUrl) throw new Error('Empty gameUrl');

            console.log('✅ Got URL from Main API');
            
            if (mainApiResponse.data.sessionToken) {
                user.sessionToken = mainApiResponse.data.sessionToken;
                db.updateUser(user.id, { sessionToken: mainApiResponse.data.sessionToken });
            }

            return res.json({
                success: true,
                gameUrl: gameUrl,
                sessionToken: user.sessionToken,
                provider: provider
            });

        } catch (mainApiError) {
            console.error('⚠️ Main API failed:', mainApiError.response?.status);
            console.log('📌 Using Fallback URL generation...\n');
            
            try {
                const fallbackUrl = generateFallbackGameUrl(
                    provider,
                    gameCode,
                    user.sessionToken,
                    { game_id: gameId || gameCode }
                );

                return res.json({
                    success: true,
                    gameUrl: fallbackUrl,
                    sessionToken: user.sessionToken,
                    provider: provider,
                    fallback: true
                });

            } catch (fallbackError) {
                console.error('❌ Fallback failed:', fallbackError.message);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to generate game URL'
                });
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Play Game
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
        
        console.log('\n' + '='.repeat(60));
        console.log('🎮 GAME LAUNCH');
        console.log('='.repeat(60));
        console.log('Provider:', providerInfo.name);
        console.log('User:', user.username);
        console.log('Game Code:', gameCode);

        // ดึง game list
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

        // Session token
        if (!user.sessionToken) {
            user.sessionToken = crypto.randomUUID();
            db.updateUser(user.id, { sessionToken: user.sessionToken });
        }

        console.log('Session:', user.sessionToken.substring(0, 20) + '...');
        console.log('\n📡 Getting game URL...');
        
        let gameUrl = '';
        let usedFallback = false;
        
        try {
            const gameUrl = generateFallbackGameUrl(
                provider.toUpperCase(), 
                gameCode, 
                user.sessionToken,
                game
            );

            gameUrl = apiResponse.data.gameUrl;
            if (!gameUrl) throw new Error('Empty gameUrl');
            
            console.log('✅ Got URL from Main API');

            if (apiResponse.data.sessionToken) {
                user.sessionToken = apiResponse.data.sessionToken;
                db.updateUser(user.id, { sessionToken: apiResponse.data.sessionToken });
            }

        } catch (apiError) {
            console.error('⚠️ Main API error, using fallback');
            
            try {
                gameUrl = generateFallbackGameUrl(
                    provider.toUpperCase(), 
                    gameCode, 
                    user.sessionToken,
                    game
                );
                usedFallback = true;
            } catch (fallbackError) {
                console.error('❌ Fallback failed:', fallbackError.message);
                return res.render('error', {
                    title: 'Error',
                    message: 'Failed to launch game',
                    error: { message: fallbackError.message }
                });
            }
        }

        console.log('✅ Game ready');
        console.log(`📌 Fallback used: ${usedFallback ? 'YES' : 'NO'}`);

        res.render('play', {
            title: `Play ${game.game_name}`,
            user: user,
            game: game,
            provider: providerInfo,
            gameUrl: gameUrl
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to launch game',
            error: { message: error.message }
        });
    }
});

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

// ⭐⭐⭐ FALLBACK URL GENERATOR - สำคัญมาก!
function generateFallbackGameUrl(provider, gameCode, sessionToken, gameData = {}) {
    console.log('\n⚠️ FALLBACK URL GENERATION');
    console.log('='.repeat(60));
    console.log('Provider:', provider);
    console.log('Game Code:', gameCode);
    console.log('Session Token:', sessionToken.substring(0, 30) + '...');
    
    const operatorToken = 'T65-AWDF-WAUE-OQ09-GST1';
    let gameUrl = '';

    switch (provider) {
        case 'PG':
            gameUrl = `https://m.pgsoft-th.com/${gameCode}/index.html?` +
                     `language=th&bet_type=1&operator_token=${operatorToken}&` +
                     `operator_player_session=${sessionToken}&or=cdn.pgsoft-th.com`;
            
            console.log('\n🔗 PG URL Breakdown:');
            console.log('   Host: m.pgsoft-th.com');
            console.log('   Game Code:', gameCode);
            console.log('   Operator Token:', operatorToken);
            break;

        case 'JILI':
            const jiliGameId = JILI_GAME_MAP[gameCode] || gameData.game_id || gameCode;
            gameUrl = `https://portal.cgm-game.com/play/game?` +
                     `operator_player_session=${sessionToken}&` +
                     `operator_token=${operatorToken}&` +
                     `game_code=${gameCode}&game_id=${jiliGameId}&provider=jili`;
            
            console.log('\n🔗 JILI URL Breakdown:');
            console.log('   Host: portal.cgm-game.com');
            console.log('   Game Code:', gameCode);
            console.log('   Game ID:', jiliGameId);
            break;

        case 'JOKER':
            gameUrl = `https://portal.cgm-game.com/play/game?` +
                     `operator_player_session=${sessionToken}&` +
                     `operator_token=${operatorToken}&` +
                     `game_code=${gameCode}&game_id=${gameCode}&provider=joker`;
            
            console.log('\n🔗 JOKER URL Breakdown:');
            console.log('   Host: portal.cgm-game.com');
            console.log('   Game Code:', gameCode);
            break;

        case 'PP':
            gameUrl = `https://portal.cgm-game.com/play/game?` +
                     `operator_player_session=${sessionToken}&` +
                     `operator_token=${operatorToken}&` +
                     `game_code=${gameCode}&game_id=${gameCode}&provider=pracmatic`;
            
            console.log('\n🔗 PP URL Breakdown:');
            console.log('   Host: portal.cgm-game.com');
            console.log('   Game Code:', gameCode);
            break;

        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }

    console.log('\n✅ Generated URL:');
    console.log(gameUrl);
    console.log('\n📊 URL Length:', gameUrl.length, 'chars');
    console.log('='.repeat(60));
    
    return gameUrl;
}

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