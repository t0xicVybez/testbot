const express = require('express');
const passport = require('passport');
const router = express.Router();

// Login route
router.get('/login', (req, res) => {
    res.render('auth/login', { user: req.user, error: null });
});

// Discord OAuth routes
router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback', 
    passport.authenticate('discord', {
        failureRedirect: '/auth/login',
        successRedirect: '/dashboard'
    })
);

// Logout route
router.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

module.exports = router; 