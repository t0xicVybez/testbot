// Import environment configuration
require('./config/env');

// Import dependencies
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const csrf = require('csurf');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const { Guilds } = require('./database/guilds');
const setupDatabase = require('./database/setup');
const logger = require('./utils/logger');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Ensure sessions directory exists
const sessionsDir = path.join(__dirname, '../sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// First, set up the database, then initialize the app and bot
async function startApp() {
  try {
    // Initialize the database first
    await setupDatabase();
    logger.info('Database setup completed successfully');
    
    // Now import the bot client (after database is ready)
    const client = require('./bot/index');
    
    // Initialize Express app
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

    // Session configuration with FileStore (avoids MySQL issues)
    app.use(session({
        key: 'discord_bot_session',
        secret: process.env.SESSION_SECRET || 'your-secret-key',
        store: new FileStore({
          path: './sessions',
          ttl: 86400 // 1 day in seconds
        }),
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

        // Add icon URLs to guilds
        mutualGuilds.forEach(guild => {
          if (guild.icon) {
            guild.iconURL = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
          }
        });

        // Store the filtered guilds in the user profile
        profile.guilds = mutualGuilds;
        profile.accessToken = accessToken;
        return done(null, profile);
      } catch (error) {
        logger.error('Error in Discord strategy:', error);
        return done(error, null);
      }
    }));

    // Home route
    app.get('/', (req, res) => {
      res.render('index', { user: req.user, error: null });
    });

    // Import and use route modules
    const apiRoutes = require('./dashboard/routes/api');
    const dashboardRoutes = require('./dashboard/routes/dashboard');
    const authRoutes = require('./dashboard/routes/auth');
    const pluginsRoutes = require('./dashboard/routes/plugins');

    app.use('/api', apiRoutes);
    app.use('/dashboard', dashboardRoutes);
    app.use('/dashboard/plugins', pluginsRoutes);
    app.use('/auth', authRoutes);

    // Error handler
    app.use((err, req, res, next) => {
      logger.error(err);
      
      if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
          error: 'Invalid CSRF token'
        });
      }
      
      if (err.status === 404 || err.name === 'NotFoundError') {
        return res.status(404).render('error', {
          user: req.user,
          error: 'Page not found'
        });
      }
      
      res.status(500).render('error', {
        user: req.user,
        error: process.env.NODE_ENV === 'production' 
          ? 'Something went wrong!' 
          : err.message || 'Server error'
      });
    });

    // Handle 404 errors for routes not matched
    app.use((req, res) => {
      res.status(404).render('error', {
        user: req.user,
        error: 'Page not found'
      });
    });

    // Start the server
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });

    // Login the Discord bot
    client.login(process.env.DISCORD_BOT_TOKEN)
      .then(() => {
        logger.info('Discord bot logged in');
      })
      .catch(error => {
        logger.error('Failed to log in Discord bot:', error);
        process.exit(1);
      });

    // Export the app for testing purposes
    return app;
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
const app = startApp();

// Export the app for testing
module.exports = app;