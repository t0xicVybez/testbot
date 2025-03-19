const fetch = require('node-fetch');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
};

// Middleware to check if user has access to a specific guild
const hasGuildAccess = async (req, res, next) => {
    try {
        const guildId = req.params.guildId;
        const userGuilds = req.user.guilds;
        
        const hasAccess = userGuilds.some(guild => guild.id === guildId);
        if (!hasAccess) {
            return res.status(403).render('error', {
                user: req.user,
                error: 'You do not have access to this guild'
            });
        }
        
        next();
    } catch (error) {
        console.error('Error checking guild access:', error);
        res.status(500).render('error', {
            user: req.user,
            error: 'Error checking guild access'
        });
    }
};

// Rate limiting middleware
const rateLimit = (maxRequests, timeWindow) => {
    const requests = new Map();
    
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        
        if (requests.has(key)) {
            const { count, firstRequest } = requests.get(key);
            
            if (now - firstRequest > timeWindow) {
                // Reset if time window has passed
                requests.set(key, { count: 1, firstRequest: now });
                next();
            } else if (count >= maxRequests) {
                // Too many requests
                res.status(429).json({
                    error: 'Too many requests, please try again later'
                });
            } else {
                // Increment request count
                requests.set(key, { 
                    count: count + 1, 
                    firstRequest 
                });
                next();
            }
        } else {
            // First request from this IP
            requests.set(key, { count: 1, firstRequest: now });
            next();
        }
    };
};

// Middleware to add CSRF token to all responses
const addCsrfToken = (req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
};

module.exports = {
    isAuthenticated,
    hasGuildAccess,
    rateLimit,
    addCsrfToken
}; 