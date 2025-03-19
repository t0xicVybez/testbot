const express = require('express');
const router = express.Router();
const { isAuthenticated, hasGuildAccess, addCsrfToken } = require('../middleware/auth');
const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');
const { getGuildSettings, updateGuildSettings } = require('../../database/guilds');

// Apply CSRF token to all routes
router.use(addCsrfToken);

// Dashboard home
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const guilds = req.user.guilds;
        res.render('dashboard', { user: req.user, guilds });
    } catch (error) {
        logger.error('Error rendering dashboard:', error);
        res.status(500).render('error', {
            user: req.user,
            error: 'Failed to load dashboard'
        });
    }
});

// Guild-specific welcome configuration
router.get('/servers/:guildId/welcome', isAuthenticated, hasGuildAccess, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const guildSettings = await Guilds.getGuildSettings(guildId);
    const guild = req.client.guilds.cache.get(guildId);

    if (!guild) {
      return res.status(404).render('error', {
        user: req.user,
        error: 'Guild not found'
      });
    }

    res.render('welcome', {
      user: req.user,
      guild,
      guildSettings
    });
  } catch (error) {
    logger.error(`Error rendering welcome config for guild ${req.params.guildId}:`, error);
    res.status(500).render('error', {
      user: req.user,
      error: 'Failed to load welcome configuration'
    });
  }
});

// Guild-specific command management
router.get('/servers/:guildId/commands', isAuthenticated, hasGuildAccess, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const guildSettings = await Guilds.getGuildSettings(guildId);
    const commandSettings = await Guilds.getCommandSettings(guildId);
    const prefix = guildSettings.prefix || '!';

    // Get all commands from the bot and merge with settings
    const slashCommands = Array.from(req.app.get('client').commands.values())
      .filter(cmd => cmd.data)
      .map(cmd => {
        const settings = commandSettings[cmd.data.name];
        return {
          name: cmd.data.name,
          description: cmd.data.description,
          enabled: settings ? settings.enabled : true
        };
      });

    const prefixCommands = Array.from(req.app.get('client').commands.values())
      .filter(cmd => cmd.prefix)
      .map(cmd => {
        const settings = commandSettings[cmd.name];
        return {
          name: cmd.name,
          description: cmd.description || 'No description available',
          enabled: settings ? settings.enabled : true
        };
      });

    res.render('commands', {
      user: req.user,
      guild: { id: guildId },
      prefix,
      slashCommands,
      prefixCommands,
      error: null
    });
  } catch (error) {
    logger.error(`Error rendering command management for guild ${req.params.guildId}:`, error);
    res.status(500).render('error', {
      user: req.user,
      error: 'Failed to load command management'
    });
  }
});

// Logs page
router.get('/logs', isAuthenticated, (req, res) => {
  res.render('logs', { 
    user: req.user
  });
});

// Guild settings page
router.get('/servers/:guildId/settings', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const guild = req.app.get('client').guilds.cache.get(req.params.guildId);
        if (!guild) {
            return res.redirect('/dashboard');
        }

        const guildSettings = await Guilds.getGuildSettings(guild.id);
        const channels = guild.channels.cache
            .filter(channel => channel.type === 0)
            .sort((a, b) => a.position - b.position);
        const roles = guild.roles.cache
            .filter(role => role.id !== guild.id && !role.managed)
            .sort((a, b) => b.position - a.position);

        res.render('settings', {
            guild,
            settings: guildSettings,
            channels: channels.map(c => ({ id: c.id, name: c.name })),
            roles: roles.map(r => ({ id: r.id, name: r.name })),
            user: req.user,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        logger.error('Error loading settings page:', error);
        res.redirect('/dashboard');
    }
});

// Guild settings page - POST handler
router.post('/servers/:guildId/settings', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const guild = req.app.get('client').guilds.cache.get(req.params.guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const settings = {
            prefix: req.body.prefix,
            welcome_channel_id: req.body.welcomeChannel || null,
            mod_log_channel_id: req.body.modLogChannel || null,
            auto_role_id: req.body.autoRole || null
        };

        await Guilds.updateSettings(guild.id, settings);

        // Send log to mod log channel if one is set
        if (settings.mod_log_channel_id) {
            await sendLog(
                req.app.get('client'),
                guild.id,
                settings.mod_log_channel_id,
                settings,
                'Guild Settings Updated'
            );
        }

        if (req.body.commands) {
            await Guilds.updateCommandSettings(guild.id, req.body.commands);
        }

        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        logger.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router; 