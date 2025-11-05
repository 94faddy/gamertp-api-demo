const axios = require('axios');
const https = require('https');

// สร้าง axios instance ที่ปิด SSL verification
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false
    }),
    timeout: 10000
});

class SeamlessAPI {
    constructor() {
        this.endpoint = process.env.API_ENDPOINT || 'https://web-api.cryteksoft.cloud';
        this.apiKey = process.env.API_KEY || '';
        this.apiSecret = process.env.API_SECRET || '';
    }

    // Login User to Game
    async loginUser(username, gameCode, sessionToken) {
        try {
            // ลอง username หลายรูปแบบ
            const usernameVariations = [
                username,
                username.split('-').pop(),
                username.replace('demo-01-', ''),
                `demo-01-${username.split('-').pop()}`
            ];

            // ลอง parameter หลายรูปแบบ
            const paramVariations = [
                { token: sessionToken },
                { sessionToken: sessionToken },
                { token: sessionToken, platform: 'web' },
                { sessionToken: sessionToken, platform: 'web' },
                { token: sessionToken, lang: 'th' },
                { sessionToken: sessionToken, lang: 'th' }
            ];

            console.log('\n=== Testing Login Combinations ===');
            console.log('Username variations:', usernameVariations);
            console.log('Total attempts:', usernameVariations.length * paramVariations.length);

            let attemptNumber = 0;

            for (const testUsername of usernameVariations) {
                for (const params of paramVariations) {
                    attemptNumber++;
                    
                    const payload = {
                        username: testUsername,
                        gameCode: gameCode,
                        language: "th",
                        ...params
                    };

                    try {
                        const config = {
                            method: 'post',
                            maxBodyLength: Infinity,
                            url: `${this.endpoint}/api/login`,
                            headers: { 
                                'x-api-key': this.apiKey,
                                'Content-Type': 'application/json'
                            },
                            data: JSON.stringify(payload)
                        };
                        
                        console.log(`\n🔄 Attempt ${attemptNumber}:`, payload);
                        
                        const result = await axiosInstance.request(config);
                        
                        if (result.data && result.data.success !== false) {
                            if (result.data.url || result.data.gameUrl) {
                                console.log('✅ SUCCESS! Working format found!');
                                console.log('Response:', result.data);
                                return result.data;
                            } else {
                                console.log('⚠️  Response received but no URL:', result.data);
                            }
                        } else {
                            console.log('❌ Failed:', result.data);
                        }
                        
                    } catch (err) {
                        const status = err.response?.status;
                        const data = err.response?.data;
                        
                        if (status === 400) {
                            console.log(`❌ 400:`, data?.message || data);
                        } else if (status === 401) {
                            console.log(`❌ 401: API Key invalid`);
                            return { 
                                error: true, 
                                message: 'API Key is invalid or expired',
                                status: 401
                            };
                        } else if (status === 404) {
                            console.log(`❌ 404: Endpoint not found`);
                            return { 
                                error: true, 
                                message: 'API endpoint not found',
                                status: 404
                            };
                        } else if (status) {
                            console.log(`❌ ${status}:`, data);
                        } else {
                            console.log(`❌ Network error:`, err.message);
                        }
                    }
                }
            }

            // ถ้าทุกอันล้มเหลว
            console.log('\n❌ All attempts failed');
            return { 
                error: true, 
                message: 'All login attempts failed',
                details: 'User may not exist in Seamless API or parameters are incorrect',
                suggestion: 'Please contact API provider to verify user registration'
            };

        } catch (err) {
            console.error('❌ Critical error:', err.message);
            return { error: true, message: err.message };
        }
    }

    // Create Session
    async createSession(username) {
        try {
            const data = JSON.stringify({
                username: username
            });

            const config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: `${this.endpoint}/api/createSession`,
                headers: { 
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                data: data
            };
            
            console.log('Creating session for:', username);
            const result = await axiosInstance.request(config);
            console.log('Session created:', result.data);
            return result.data;
        } catch (err) {
            console.error('Error creating session:', err.message);
            if (err.response) {
                console.error('Response:', err.response.data);
                return { 
                    error: true, 
                    message: err.message,
                    status: err.response.status,
                    data: err.response.data
                };
            }
            return { error: true, message: err.message };
        }
    }

    // Get All Games
    async getAllGames() {
        try {
            const config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `${this.endpoint}/api/games`,
                headers: { 
                    'x-api-key': this.apiKey
                }
            };
            
            const result = await axiosInstance.request(config);
            return result.data;
        } catch (err) {
            console.error('Error fetching games:', err.message);
            if (err.response) {
                return { 
                    error: true, 
                    message: err.message,
                    data: err.response.data
                };
            }
            return { error: true, message: err.message };
        }
    }

    // Get Game by Code
    async getGameByCode(gameCode) {
        try {
            const config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `${this.endpoint}/api/game/${gameCode}`,
                headers: { 
                    'x-api-key': this.apiKey
                }
            };
            
            const result = await axiosInstance.request(config);
            return result.data;
        } catch (err) {
            console.error('Error fetching game:', err.message);
            if (err.response) {
                return { 
                    error: true, 
                    message: err.message,
                    data: err.response.data
                };
            }
            return { error: true, message: err.message };
        }
    }

    // Get User Balance
    async getUserBalance(username) {
        try {
            const config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `${this.endpoint}/api/balance/${username}`,
                headers: { 
                    'x-api-key': this.apiKey
                }
            };
            
            const result = await axiosInstance.request(config);
            return result.data;
        } catch (err) {
            console.error('Error getting user balance:', err.message);
            if (err.response) {
                return { 
                    error: true, 
                    message: err.message,
                    data: err.response.data
                };
            }
            return { error: true, message: err.message };
        }
    }

    // Update User Balance
    async updateUserBalance(username, amount, type = 'deposit') {
        try {
            const data = JSON.stringify({
                username: username,
                amount: amount,
                type: type
            });

            const config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: `${this.endpoint}/api/updateBalance`,
                headers: { 
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                data: data
            };
            
            const result = await axiosInstance.request(config);
            return result.data;
        } catch (err) {
            console.error('Error updating balance:', err.message);
            if (err.response) {
                return { 
                    error: true, 
                    message: err.message,
                    data: err.response.data
                };
            }
            return { error: true, message: err.message };
        }
    }

    // Get Transaction History
    async getTransactions(username, limit = 50) {
        try {
            const config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `${this.endpoint}/api/transactions/${username}?limit=${limit}`,
                headers: { 
                    'x-api-key': this.apiKey
                }
            };
            
            const result = await axiosInstance.request(config);
            return result.data;
        } catch (err) {
            console.error('Error getting transactions:', err.message);
            if (err.response) {
                return { 
                    error: true, 
                    message: err.message,
                    data: err.response.data
                };
            }
            return { error: true, message: err.message };
        }
    }

    // Test Connection
    async testConnection() {
        try {
            const config = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `${this.endpoint}/health`,
                headers: { 
                    'x-api-key': this.apiKey
                }
            };
            
            console.log('Testing API connection...');
            const result = await axiosInstance.request(config);
            console.log('✅ API connection successful:', result.data);
            return { success: true, data: result.data };
        } catch (err) {
            console.error('❌ API connection failed:', err.message);
            if (err.response) {
                console.error('Response:', err.response.status, err.response.data);
                return { 
                    error: true, 
                    message: err.message,
                    status: err.response.status,
                    data: err.response.data
                };
            }
            return { error: true, message: err.message };
        }
    }
}

module.exports = new SeamlessAPI();