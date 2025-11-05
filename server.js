require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make user available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const walletRoutes = require('./routes/wallet');
const gameRoutes = require('./routes/games');
const apiRoutes = require('./routes/api');
const transactionsRoutes = require('./routes/transactions');

app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/wallet', walletRoutes);
app.use('/games', gameRoutes);
app.use('/api', apiRoutes);
app.use('/transactions', transactionsRoutes);

// Home Route
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});

// 404 Handler
app.use((req, res) => {
    res.status(404).render('404', { 
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.' 
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).render('error', { 
        title: 'Error',
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`🎮 Games: http://localhost:${PORT}/games`);
    console.log(`📜 Transactions: http://localhost:${PORT}/transactions`);
    console.log(`📌 NOTE: Game settings are managed by Main API (Agent level)`);
});

module.exports = app;