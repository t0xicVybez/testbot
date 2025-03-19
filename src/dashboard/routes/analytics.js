const express = require('express');
const router = express.Router();
const { isAuthenticated, hasGuildAccess } = require('../middleware/auth');
const { Analytics } = require('../../database/analytics');
const logger = require('../../utils/logger');

// Analytics overview page
router.get('/:guildId', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const timeRange = req.query.timeRange || '7d';
        
        // Get the guild from the client
        const client = req.app.get('client');
        const guild = client.guilds.cache.get(guildId);
        
        if (!guild) {
            return res.status(404).render('error', {
                user: req.user,
                error: 'Guild not found'
            });
        }
        
        // Basic server stats for the overview
        const serverStats = await Analytics.getServerStats(guildId);
        
        res.render('analytics/overview', {
            user: req.user,
            guild,
            serverStats,
            timeRange,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        logger.error('Error loading analytics overview:', error);
        res.status(500).render('error', {
            user: req.user,
            error: 'Failed to load analytics'
        });
    }
});

// API endpoints to get analytics data
router.get('/api/:guildId/command-stats', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const timeRange = req.query.timeRange || '7d';
        
        const commandStats = await Analytics.getCommandStats(guildId, timeRange);
        res.json(commandStats);
    } catch (error) {
        logger.error('Error getting command stats:', error);
        res.status(500).json({ error: 'Failed to get command stats' });
    }
});

router.get('/api/:guildId/member-activity', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const timeRange = req.query.timeRange || '7d';
        
        const memberActivity = await Analytics.getMemberActivity(guildId, timeRange);
        
        // If we have the client, enhance with user data
        const client = req.app.get('client');
        const guild = client.guilds.cache.get(guildId);
        
        if (guild) {
            // Add user details to each entry
            for (const activity of memberActivity) {
                try {
                    const member = await guild.members.fetch(activity.user_id);
                    activity.username = member.user.username;
                    activity.avatar = member.user.displayAvatarURL();
                } catch (err) {
                    // User may no longer be in the guild
                    activity.username = 'Unknown User';
                    activity.avatar = null;
                }
            }
        }
        
        res.json(memberActivity);
    } catch (error) {
        logger.error('Error getting member activity:', error);
        res.status(500).json({ error: 'Failed to get member activity' });
    }
});

router.get('/api/:guildId/daily-activity', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const timeRange = req.query.timeRange || '7d';
        
        const dailyActivity = await Analytics.getDailyActivity(guildId, timeRange);
        res.json(dailyActivity);
    } catch (error) {
        logger.error('Error getting daily activity:', error);
        res.status(500).json({ error: 'Failed to get daily activity' });
    }
});

module.exports = router;
