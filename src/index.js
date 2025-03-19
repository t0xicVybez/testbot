require('./config/env');

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const { Guilds } = require('./database/guilds');
const csrf = require('csurf');
const { isAuthenticated, csrfProtection, addCsrfToken } = require('./dashboard/middleware/auth');
const client = require('./bot/index');

const app = express();

// Make client available to routes
app.set('client', client);

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Express middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/css', express.static(path.join(__dirname, 'dashboard', 'public', 'css')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'dashboard', 'views'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// CSRF Protection
app.use(csrf({
    cookie: false, // We're using sessions instead of cookies
    sessionKey: 'session' // Use the express-session middleware
}));

// Add CSRF token to all responses
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});

// Passport setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Discord Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Get all guilds the bot is in
    const botGuilds = await Guilds.getBotGuilds();
    const botGuildIds = botGuilds.map(guild => guild.guild_id);

    // Filter user's guilds to only include those where the bot is present
    const mutualGuilds = profile.guilds.filter(guild => 
      botGuildIds.includes(guild.id) && 
      (guild.owner || (guild.permissions & 0x20) === 0x20)
    );

    // Store the filtered guilds in the user profile
    profile.guilds = mutualGuilds;
    profile.accessToken = accessToken;
    return done(null, profile);
  } catch (error) {
    console.error('Error in Discord strategy:', error);
    return done(error, null);
  }
}));

// Routes
app.get('/', (req, res) => {
  res.render('index', { user: req.user, error: null });
});

// Import and use route modules
const apiRoutes = require('./dashboard/routes/api');
const dashboardRoutes = require('./dashboard/routes/dashboard');
const authRoutes = require('./dashboard/routes/auth');

app.use('/api', apiRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/auth', authRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      error: 'Invalid CSRF token'
    });
  }
  res.status(500).render('error', {
    user: req.user,
    error: 'Something went wrong!'
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Login the Discord bot
client.login(process.env.DISCORD_BOT_TOKEN); 