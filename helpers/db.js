const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database.json');

// In-memory cache of database
let dbCache = null;

// Load database
function loadDatabase() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const initialData = {
                agents: [],
                users: [],
                settings: {
                    defaultBalance: 1000,
                    currency: 'THB'
                }
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
            dbCache = initialData;
            return initialData;
        }
        
        const data = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(data);
        
        // ตรวจสอบว่ามี properties ครบ
        if (!parsed.agents) {
            parsed.agents = [];
        }
        if (!parsed.users) {
            parsed.users = [];
        }
        if (!parsed.settings) {
            parsed.settings = {
                defaultBalance: 1000,
                currency: 'THB'
            };
        }
        
        // ⭐ ลบ transactions ออก - ไม่เก็บใน database.json อีกต่อไป
        // transactions จะดึงจาก Main API เท่านั้น
        
        dbCache = parsed;
        return parsed;
    } catch (error) {
        console.error('Error loading database:', error);
        const fallbackData = {
            agents: [],
            users: [],
            settings: {
                defaultBalance: 1000,
                currency: 'THB'
            }
        };
        dbCache = fallbackData;
        return fallbackData;
    }
}

// Save database - รองรับทั้งแบบมี parameter และไม่มี
function saveDatabase(data) {
    try {
        // ถ้าไม่ส่ง data มา ให้ใช้ cache หรือ load ใหม่
        if (!data) {
            if (dbCache) {
                data = dbCache;
            } else {
                console.warn('saveDatabase called without data and no cache available');
                data = loadDatabase();
            }
        }
        
        // ตรวจสอบว่ามี properties ครบ
        if (!data.agents) {
            data.agents = [];
        }
        if (!data.users) {
            data.users = [];
        }
        if (!data.settings) {
            data.settings = {
                defaultBalance: 1000,
                currency: 'THB'
            };
        }
        
        // ⭐ ลบ transactions ออกก่อน save - ไม่ต้องเก็บ
        if (data.transactions) {
            delete data.transactions;
        }
        
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        dbCache = data; // อัพเดท cache
        return true;
    } catch (error) {
        console.error('Error saving database:', error);
        return false;
    }
}

// ⭐⭐⭐ ลบฟังก์ชันทั้งหมดที่เกี่ยวกับ transactions ⭐⭐⭐
// เพราะจะดึงจาก Main API เท่านั้น

// Find user by ID
function findUserById(userId) {
    const db = loadDatabase();
    return db.users.find(user => user.id === userId);
}

// Find user by username
function findUserByUsername(username) {
    const db = loadDatabase();
    return db.users.find(user => user.username === username);
}

// Find user by token
function findUserByToken(token) {
    const db = loadDatabase();
    return db.users.find(user => user.sessionToken === token);
}

// Update user
function updateUser(userId, updates) {
    try {
        const db = loadDatabase();
        const userIndex = db.users.findIndex(user => user.id === userId);
        
        if (userIndex !== -1) {
            db.users[userIndex] = { ...db.users[userIndex], ...updates };
            saveDatabase(db);
            return db.users[userIndex];
        }
        
        return null;
    } catch (error) {
        console.error('Error updating user:', error);
        return null;
    }
}

// Update balance
function updateBalance(userId, amount, operation = 'add') {
    try {
        const db = loadDatabase();
        const user = db.users.find(user => user.id === userId);
        
        if (!user) {
            return { error: true, message: 'User not found' };
        }
        
        if (operation === 'add') {
            user.balance += amount;
        } else if (operation === 'subtract') {
            if (user.balance < amount) {
                return { error: true, message: 'Insufficient balance' };
            }
            user.balance -= amount;
        }
        
        saveDatabase(db);
        return { error: false, balance: user.balance };
    } catch (error) {
        console.error('Error updating balance:', error);
        return { error: true, message: error.message };
    }
}

// Add user
function addUser(user) {
    try {
        const db = loadDatabase();
        const newUser = {
            id: `user-${Date.now()}`,
            createdAt: new Date().toISOString(),
            balance: 0,
            currency: 'THB',
            ...user
        };
        db.users.push(newUser);
        saveDatabase(db);
        return newUser;
    } catch (error) {
        console.error('Error adding user:', error);
        return null;
    }
}

// Get all users
function getAllUsers() {
    try {
        const db = loadDatabase();
        return db.users || [];
    } catch (error) {
        console.error('Error getting all users:', error);
        return [];
    }
}

// Find agent by ID
function findAgentById(agentId) {
    try {
        const db = loadDatabase();
        return db.agents.find(agent => agent.id === agentId);
    } catch (error) {
        console.error('Error finding agent by ID:', error);
        return null;
    }
}

// Find agent by API key
function findAgentByApiKey(apikey) {
    try {
        const db = loadDatabase();
        return db.agents.find(agent => agent.apikey === apikey);
    } catch (error) {
        console.error('Error finding agent by API key:', error);
        return null;
    }
}

// Find agent by secret key
function findAgentBySecret(secret) {
    try {
        const db = loadDatabase();
        return db.agents.find(agent => agent.secret === secret);
    } catch (error) {
        console.error('Error finding agent by secret:', error);
        return null;
    }
}

// Get settings
function getSettings() {
    try {
        const db = loadDatabase();
        return db.settings || {
            defaultBalance: 1000,
            currency: 'THB'
        };
    } catch (error) {
        console.error('Error getting settings:', error);
        return {
            defaultBalance: 1000,
            currency: 'THB'
        };
    }
}

module.exports = {
    loadDatabase,
    saveDatabase,
    // ⭐ ลบ transaction functions ออกจาก exports
    // getUserTransactions, 
    // getAllTransactions, 
    // addTransaction,
    findUserById,
    findUserByUsername,
    findUserByToken,
    updateUser,
    updateBalance,
    addUser,
    getAllUsers,
    findAgentById,
    findAgentByApiKey,
    findAgentBySecret,
    getSettings
};