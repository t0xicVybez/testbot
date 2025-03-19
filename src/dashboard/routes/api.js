const express = require('express');
const router = express.Router();
const { isAuthenticated, hasGuildAccess, rateLimit } = require('../middleware/auth');
const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');
const { EmbedBuilder } = require('discord.js');

// Apply rate limiting to all API routes - 100 requests per minute
const apiRateLimit = rateLimit(100, 60000);
router.use(apiRateLimit);

// Middleware to check if user has permission to manage guild
const hasGuildPermission = async (req, res, next) => {
    const { guildId } = req.body;
    if (!guildId) {
        return res.status(400).json({ error: 'Guild ID is required' });
    }

    const userGuilds = req.user.guilds || [];
    const guild = userGuilds.find(g => g.id === guildId);
    
    if (!guild) {
        return res.status(403).json({ error: 'You do not have access to this guild' });
    }

    // Check if user has MANAGE_GUILD permission (0x20 is the permission flag for MANAGE_GUILD)
    if (!(guild.permissions & 0x20)) {
        return res.status(403).json({ error: 'You do not have permission to manage this guild' });
    }

    next();
};

// Get guild settings
router.get('/guilds/:guildId/settings', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const settings = await Guilds.getGuildSettings(req.params.guildId);
        res.json(settings);
    } catch (error) {
        logger.error('Error fetching guild settings:', error);
        res.status(500).json({ error: 'Failed to fetch guild settings' });
    }
});

// Update guild settings
router.post('/guilds/:guildId/settings', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const settings = req.body;
        
        logger.info(`Updating settings for guild ${guildId}: ${JSON.stringify(settings)}`);

        const success = await Guilds.updateSettings(guildId, settings);
        if (!success) {
            return res.status(404).json({ error: 'Guild not found or settings not updated' });
        }

        // Send log to mod log channel if one is set
        const updatedSettings = await Guilds.getGuildSettings(guildId);
        if (updatedSettings.modLogChannel) {
            try {
                const client = req.app.get('client');
                const { sendLog } = require('../../utils/discord-logger');
                await sendLog(
                    client,
                    guildId,
                    updatedSettings.modLogChannel,
                    settings,
                    'Guild Settings Updated'
                );
            } catch (logError) {
                logger.error('Error sending log to Discord channel:', logError);
            }
        }

        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        logger.error('Error updating guild settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Test welcome message
router.post('/guilds/:guildId/welcome/test', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { channel } = req.body;

        if (!channel) {
            return res.status(400).json({ error: 'Channel ID is required' });
        }

        const client = req.app.get('client');
        const guild = await client.guilds.fetch(guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        // Get the welcome channel
        const welcomeChannel = await guild.channels.fetch(channel);
        if (!welcomeChannel) {
            return res.status(404).json({ error: 'Welcome channel not found' });
        }

        // Send test welcome message
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Welcome Test')
            .setDescription(`This is a test welcome message for ${guild.name}!`)
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: 'Member Count', value: `${guild.memberCount}`, inline: true },
                { name: 'Test', value: 'This is what new members will see', inline: true }
            )
            .setTimestamp();

        await welcomeChannel.send({ embeds: [embed] });
        logger.info(`Test welcome message sent to channel ${welcomeChannel.name} in guild ${guild.name}`);

        res.json({ message: 'Test welcome message sent successfully' });
    } catch (error) {
        logger.error('Error testing welcome message:', error);
        res.status(500).json({ error: 'Failed to send test welcome message: ' + error.message });
    }
});

// Get guild commands
router.get('/guilds/:guildId/commands', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const settings = await Guilds.getCommandSettings(req.params.guildId);
        res.json(settings);
    } catch (error) {
        logger.error('Error fetching command settings:', error);
        res.status(500).json({ error: 'Failed to fetch command settings' });
    }
});

// Toggle command status
router.post('/guilds/:guildId/commands/:commandName/toggle', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId, commandName } = req.params;
        const { enabled, type } = req.body;

        const success = await Guilds.setCommandEnabled(guildId, commandName, type, enabled);
        if (!success) {
            return res.status(404).json({ error: 'Command not found' });
        }

        res.json({ message: 'Command status updated successfully' });
    } catch (error) {
        logger.error('Error toggling command:', error);
        res.status(500).json({ error: 'Failed to update command status' });
    }
});

// Bulk toggle commands
router.post('/guilds/:guildId/commands/bulk-toggle', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { commands, type, enabled } = req.body;

        if (!Array.isArray(commands) || !type || enabled === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const results = await Promise.allSettled(
            commands.map(command => 
                Guilds.setCommandEnabled(req.params.guildId, command, type, enabled)
            )
        );

        const failed = results.filter(r => r.status === 'rejected').length;
        logger.info(`Bulk command toggle in ${req.params.guildId} by ${req.user.username}: ${results.length - failed} succeeded, ${failed} failed`);
        
        if (failed > 0) {
            res.status(207).json({
                message: `${results.length - failed} commands updated, ${failed} failed`,
                success: results.length > failed
            });
        } else {
            res.json({ success: true });
        }
    } catch (error) {
        logger.error('Error bulk toggling commands:', error);
        res.status(500).json({ error: 'Failed to update command status' });
    }
});

// Get bot guilds
router.get('/guilds', isAuthenticated, async (req, res) => {
    try {
        const guilds = await Guilds.getBotGuilds();
        res.json(guilds);
    } catch (error) {
        logger.error('Error fetching bot guilds:', error);
        res.status(500).json({ error: 'Failed to fetch bot guilds' });
    }
});

module.exports = router;