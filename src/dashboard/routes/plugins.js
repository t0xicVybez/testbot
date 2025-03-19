const express = require('express');
const router = express.Router();
const { isAuthenticated, hasGuildAccess, addCsrfToken } = require('../middleware/auth');
const logger = require('../../utils/logger');
const { Tags } = require('../../database/tags');
const { Tickets } = require('../../database/tickets');

// Apply CSRF token to all routes
router.use(addCsrfToken);

// Available plugins list
const availablePlugins = [
    {
        id: 'tags',
        name: 'Auto Responder Tags',
        description: 'Create automatic responses to messages using patterns or regex',
        icon: 'fa-tags',
        settingsRoute: '/dashboard/plugins/tags'
    },
    {
        id: 'tickets',
        name: 'Support Tickets',
        description: 'Create a support ticket system for server members to request help',
        icon: 'fa-ticket-alt',
        settingsRoute: '/dashboard/plugins/tickets'
    }
];

// Plugins overview page
router.get('/', isAuthenticated, async (req, res) => {
    try {
        // Get enabled plugins for each guild the user has access to
        const userGuilds = req.user.guilds || [];
        
        const guildsWithPlugins = await Promise.all(
            userGuilds.map(async (guild) => {
                // For each plugin, check if it's enabled
                const pluginsStatus = await Promise.all(
                    availablePlugins.map(async (plugin) => {
                        let isEnabled = false;
                        
                        if (plugin.id === 'tags') {
                            isEnabled = await Tags.isPluginEnabled(guild.id);
                        } else if (plugin.id === 'tickets') {
                            isEnabled = await Tickets.isPluginEnabled(guild.id);
                        }
                        
                        return {
                            ...plugin,
                            isEnabled
                        };
                    })
                );
                
                return {
                    ...guild,
                    plugins: pluginsStatus
                };
            })
        );
        
        res.render('plugins/overview', {
            user: req.user,
            guilds: guildsWithPlugins,
            plugins: availablePlugins,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        logger.error('Error loading plugins page:', error);
        res.status(500).render('error', {
            user: req.user,
            error: 'Failed to load plugins page'
        });
    }
});

// Enable/disable plugin API endpoint
router.post('/toggle/:guildId/:pluginId', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId, pluginId } = req.params;
        const { enabled } = req.body;
        
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'Enabled status must be a boolean' });
        }
        
        let success = false;
        
        if (pluginId === 'tags') {
            success = await Tags.setPluginEnabled(guildId, enabled);
        } else if (pluginId === 'tickets') {
            success = await Tickets.setPluginEnabled(guildId, enabled);
        } else {
            return res.status(400).json({ error: 'Unknown plugin' });
        }
        
        if (success) {
            return res.json({ 
                success: true, 
                message: `Plugin ${enabled ? 'enabled' : 'disabled'} successfully` 
            });
        } else {
            throw new Error('Failed to update plugin status');
        }
    } catch (error) {
        logger.error('Error toggling plugin:', error);
        res.status(500).json({ error: 'Failed to update plugin status' });
    }
});

// Tags plugin routes
router.get('/tags/:guildId', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        // Check if plugin is enabled
        const isEnabled = await Tags.isPluginEnabled(guildId);
        
        // Get all tags for this guild
        const tags = await Tags.getAllTags(guildId);
        
        // Get guild info
        const guild = req.user.guilds.find(g => g.id === guildId);
        
        res.render('plugins/tags', {
            user: req.user,
            guild,
            tags,
            isEnabled,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        logger.error('Error loading tags plugin page:', error);
        res.status(500).render('error', {
            user: req.user,
            error: 'Failed to load tags plugin page'
        });
    }
});

// Tickets plugin routes
router.get('/tickets/:guildId', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        // Check if plugin is enabled
        const isEnabled = await Tickets.isPluginEnabled(guildId);
        
        // Get ticket settings
        const settings = await Tickets.getTicketSettings(guildId);
        
        // Get guild info
        const guild = req.user.guilds.find(g => g.id === guildId);
        
        // Get client for channels and roles
        const client = req.app.get('client');
        const discordGuild = client.guilds.cache.get(guildId);
        
        let channels = [];
        let categories = [];
        let roles = [];
        let panels = [];
        
        if (discordGuild) {
            // Get text channels
            channels = discordGuild.channels.cache
                .filter(channel => channel.type === 0) // TextChannel
                .sort((a, b) => a.position - b.position)
                .map(channel => ({ id: channel.id, name: channel.name }));
                
            // Get categories
            categories = discordGuild.channels.cache
                .filter(channel => channel.type === 4) // CategoryChannel
                .sort((a, b) => a.position - b.position)
                .map(channel => ({ id: channel.id, name: channel.name }));
                
            // Get roles
            roles = discordGuild.roles.cache
                .filter(role => !role.managed && role.id !== guildId)
                .sort((a, b) => b.position - a.position)
                .map(role => ({ id: role.id, name: role.name }));
        }
        
        // Get active tickets
        const tickets = await Tickets.getActiveTickets(guildId) || [];
        
        // Get saved responses
        const responses = await Tickets.getTicketResponses(guildId) || [];
        
        // Get panels
        panels = await Tickets.getPanels(guildId) || [];
        
        res.render('plugins/tickets', {
            user: req.user,
            guild,
            isEnabled,
            settings,
            channels,
            categories,
            roles,
            tickets,
            responses,
            panels,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        logger.error('Error loading tickets plugin page:', error);
        res.status(500).render('error', {
            user: req.user,
            error: 'Failed to load tickets plugin page: ' + error.message
        });
    }
});

// Ticket settings API endpoint
router.post('/tickets/:guildId/settings', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const {
            categoryId,
            logChannelId,
            supportRoleId,
            welcomeMessage,
            ticketNameFormat
        } = req.body;
        
        logger.info(`Updating ticket settings for guild ${guildId}: ${JSON.stringify(req.body)}`);
        
        // Validate required fields
        if (!categoryId || !supportRoleId) {
            return res.status(400).json({
                error: 'Category and support role are required'
            });
        }
        
        // Update settings
        const success = await Tickets.updateTicketSettings(guildId, {
            is_enabled: true, // When updating settings, assume we want to enable
            category_id: categoryId,
            log_channel_id: logChannelId,
            support_role_id: supportRoleId,
            welcome_message: welcomeMessage,
            ticket_name_format: ticketNameFormat
        });
        
        if (success) {
            return res.json({
                success: true,
                message: 'Ticket settings updated successfully'
            });
        } else {
            throw new Error('Failed to update ticket settings');
        }
    } catch (error) {
        logger.error('Error updating ticket settings:', error);
        res.status(500).json({
            error: 'Failed to update ticket settings: ' + error.message
        });
    }
});

// Ticket panel API endpoints
router.get('/tickets/:guildId/panels/:panelId', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { panelId } = req.params;
        
        // Get panel by ID
        const panel = await Tickets.getPanelById(panelId);
        
        if (panel) {
            return res.json(panel);
        } else {
            return res.status(404).json({
                error: 'Panel not found'
            });
        }
    } catch (error) {
        logger.error('Error getting panel:', error);
        res.status(500).json({
            error: 'Failed to get panel: ' + error.message
        });
    }
});

router.post('/tickets/:guildId/panels/create', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { name, channelId, title, description, buttonText, color } = req.body;
        
        logger.info(`Creating ticket panel for guild ${guildId}`, {
            name,
            channelId,
            title,
            description: description ? description.substring(0, 30) + '...' : null,
            buttonText,
            color
        });
        
        // Validate required fields
        if (!name || !channelId || !title || !description) {
            return res.status(400).json({
                error: 'Name, channel, title, and description are required'
            });
        }
        
        // Create embed message in the Discord channel
        const client = req.app.get('client');
        
        // Make sure client exists
        if (!client) {
            logger.error('Discord client not found in app');
            return res.status(500).json({ error: 'Discord client not available' });
        }
        
        try {
            const channel = await client.channels.fetch(channelId);
            
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found' });
            }
            
            // Create the embed message
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            
            const embed = new EmbedBuilder()
                .setColor(color || '#3498DB')
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: 'Click the button below to create a ticket' });
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_ticket')
                        .setLabel(buttonText || 'Create Ticket')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                );
            
            const message = await channel.send({
                embeds: [embed],
                components: [row]
            });
            
            // Save panel data to database
            const panelId = await Tickets.createPanel(guildId, {
                name,
                channel_id: channelId,
                message_id: message.id,
                title,
                description,
                button_text: buttonText || 'Create Ticket',
                color: color || '#3498DB',
                created_by: req.user.id
            });
            
            if (panelId) {
                return res.json({
                    success: true,
                    message: 'Panel created successfully',
                    id: panelId
                });
            } else {
                throw new Error('Failed to create panel in database');
            }
        } catch (error) {
            logger.error('Error creating Discord embed:', error);
            return res.status(500).json({ 
                error: 'Error communicating with Discord: ' + error.message
            });
        }
    } catch (error) {
        logger.error('Error creating ticket panel:', error);
        return res.status(500).json({
            error: 'Failed to create panel: ' + error.message
        });
    }
});

router.post('/tickets/:guildId/panels/update/:panelId', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId, panelId } = req.params;
        const { name, channelId, title, description, buttonText, color } = req.body;
        
        logger.info(`Updating ticket panel ${panelId} for guild ${guildId}`);
        
        // Validate required fields
        if (!name || !title || !description) {
            return res.status(400).json({
                error: 'Name, title, and description are required'
            });
        }
        
        // Get existing panel data
        const panel = await Tickets.getPanelById(panelId);
        if (!panel) {
            return res.status(404).json({ error: 'Panel not found' });
        }
        
        // Update the Discord message if channel has changed
        let messageId = panel.message_id;
        const client = req.app.get('client');
        
        if (channelId !== panel.channel_id) {
            // Delete old message
            try {
                const oldChannel = await client.channels.fetch(panel.channel_id);
                if (oldChannel) {
                    const oldMessage = await oldChannel.messages.fetch(panel.message_id);
                    if (oldMessage) {
                        await oldMessage.delete();
                    }
                }
            } catch (error) {
                logger.warn(`Could not delete old panel message: ${error.message}`);
            }
            
            // Create new message in new channel
            const newChannel = await client.channels.fetch(channelId);
            if (!newChannel) {
                return res.status(404).json({ error: 'New channel not found' });
            }
            
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            
            const embed = new EmbedBuilder()
                .setColor(color || '#3498DB')
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: 'Click the button below to create a ticket' });
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_ticket')
                        .setLabel(buttonText || 'Create Ticket')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                );
            
            const newMessage = await newChannel.send({
                embeds: [embed],
                components: [row]
            });
            
            messageId = newMessage.id;
        } else {
            // Update existing message
            try {
                const channel = await client.channels.fetch(panel.channel_id);
                if (channel) {
                    const message = await channel.messages.fetch(panel.message_id);
                    if (message) {
                        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                        
                        const embed = new EmbedBuilder()
                            .setColor(color || '#3498DB')
                            .setTitle(title)
                            .setDescription(description)
                            .setFooter({ text: 'Click the button below to create a ticket' });
                        
                        const row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('create_ticket')
                                    .setLabel(buttonText || 'Create Ticket')
                                    .setStyle(ButtonStyle.Primary)
                                    .setEmoji('🎫')
                            );
                        
                        await message.edit({
                            embeds: [embed],
                            components: [row]
                        });
                    }
                }
            } catch (error) {
                logger.warn(`Could not update panel message: ${error.message}`);
                return res.status(500).json({
                    error: 'Failed to update panel message: ' + error.message
                });
            }
        }
        
        // Update panel in database
        const success = await Tickets.updatePanel(panelId, {
            name,
            title,
            description,
            button_text: buttonText || 'Create Ticket',
            color: color || '#3498DB',
            message_id: messageId
        });
        
        if (success) {
            return res.json({
                success: true,
                message: 'Panel updated successfully'
            });
        } else {
            throw new Error('Failed to update panel');
        }
    } catch (error) {
        logger.error('Error updating ticket panel:', error);
        res.status(500).json({
            error: 'Failed to update panel: ' + error.message
        });
    }
});

router.post('/tickets/:guildId/panels/delete/:panelId', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId, panelId } = req.params;
        
        logger.info(`Deleting ticket panel ${panelId} for guild ${guildId}`);
        
        // Get panel data
        const panel = await Tickets.getPanelById(panelId);
        if (!panel) {
            return res.status(404).json({ error: 'Panel not found' });
        }
        
        // Delete Discord message
        try {
            const client = req.app.get('client');
            const channel = await client.channels.fetch(panel.channel_id);
            if (channel) {
                const message = await channel.messages.fetch(panel.message_id);
                if (message) {
                    await message.delete();
                }
            }
        } catch (error) {
            logger.warn(`Could not delete panel message: ${error.message}`);
        }
        
        // Delete panel from database
        const success = await Tickets.deletePanel(panelId);
        
        if (success) {
            return res.json({
                success: true,
                message: 'Panel deleted successfully'
            });
        } else {
            throw new Error('Failed to delete panel');
        }
    } catch (error) {
        logger.error('Error deleting ticket panel:', error);
        res.status(500).json({
            error: 'Failed to delete panel: ' + error.message
        });
    }
});

// Ticket response API endpoints
router.post('/tickets/:guildId/responses/create', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { name, content } = req.body;
        
        logger.info(`Creating ticket response for guild ${guildId}: ${JSON.stringify(req.body)}`);
        
        // Validate required fields
        if (!name || !content) {
            return res.status(400).json({
                error: 'Name and content are required'
            });
        }
        
        // Create response
        const responseId = await Tickets.createTicketResponse(guildId, {
            name,
            content,
            created_by: req.user.id
        });
        
        if (responseId) {
            return res.json({
                success: true,
                message: 'Response created successfully',
                id: responseId
            });
        } else {
            throw new Error('Failed to create response');
        }
    } catch (error) {
        logger.error('Error creating ticket response:', error);
        res.status(500).json({
            error: 'Failed to create response: ' + error.message
        });
    }
});

router.post('/tickets/:guildId/responses/update/:responseName', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId, responseName } = req.params;
        const { content } = req.body;
        
        logger.info(`Updating ticket response "${responseName}" for guild ${guildId}`);
        
        // Validate required fields
        if (!content) {
            return res.status(400).json({
                error: 'Content is required'
            });
        }
        
        // Update response
        const success = await Tickets.updateTicketResponse(guildId, responseName, content, req.user.id);
        
        if (success) {
            return res.json({
                success: true,
                message: 'Response updated successfully'
            });
        } else {
            return res.status(404).json({
                error: 'Response not found'
            });
        }
    } catch (error) {
        logger.error('Error updating ticket response:', error);
        res.status(500).json({
            error: 'Failed to update response: ' + error.message
        });
    }
});

router.post('/tickets/:guildId/responses/delete/:responseName', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId, responseName } = req.params;
        
        logger.info(`Deleting ticket response "${responseName}" for guild ${guildId}`);
        
        // Delete response
        const success = await Tickets.deleteTicketResponse(guildId, responseName);
        
        if (success) {
            return res.json({
                success: true,
                message: 'Response deleted successfully'
            });
        } else {
            return res.status(404).json({
                error: 'Response not found'
            });
        }
    } catch (error) {
        logger.error('Error deleting ticket response:', error);
        res.status(500).json({
            error: 'Failed to delete response: ' + error.message
        });
    }
});

// Tag API endpoints
router.post('/tags/:guildId/create', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { name, pattern, response, isRegex } = req.body;
        
        logger.info(`Creating tag for guild ${guildId}: ${JSON.stringify(req.body)}`);
        
        // Validate input
        if (!name || !pattern || !response) {
            return res.status(400).json({ error: 'Name, pattern, and response are required' });
        }
        
        // Validate regex if isRegex is true
        if (isRegex) {
            try {
                new RegExp(pattern);
            } catch (e) {
                return res.status(400).json({ error: `Invalid regex pattern: ${e.message}` });
            }
        }
        
        const success = await Tags.createTag(guildId, {
            name,
            pattern,
            response,
            is_regex: isRegex === true,
            created_by: req.user.id
        });
        
        if (success) {
            logger.info(`Successfully created tag "${name}" for guild ${guildId}`);
            return res.json({
                success: true,
                message: `Tag "${name}" created successfully`
            });
        } else {
            logger.warn(`Failed to create tag "${name}" for guild ${guildId}`);
            return res.status(400).json({ error: 'Failed to create tag. It might already exist.' });
        }
    } catch (error) {
        logger.error('Error creating tag:', error);
        res.status(500).json({ error: 'Failed to create tag: ' + error.message });
    }
});

router.post('/tags/:guildId/update/:tagName', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId, tagName } = req.params;
        const { pattern, response, isRegex, isEnabled } = req.body;
        
        logger.info(`Updating tag "${tagName}" for guild ${guildId}: ${JSON.stringify(req.body)}`);
        logger.info(`isEnabled value: ${isEnabled}, type: ${typeof isEnabled}`);
        
        // Validate input
        if (!pattern || !response) {
            return res.status(400).json({ error: 'Pattern and response are required' });
        }
        
        // Validate regex if isRegex is true
        if (isRegex) {
            try {
                new RegExp(pattern);
            } catch (e) {
                return res.status(400).json({ error: `Invalid regex pattern: ${e.message}` });
            }
        }
        
        // Explicitly convert isEnabled to boolean to handle edge cases
        const enabledStatus = isEnabled === true || isEnabled === 'true';
        logger.info(`Converted isEnabled value: ${enabledStatus}`);
        
        const success = await Tags.updateTag(guildId, tagName, {
            pattern,
            response,
            is_regex: isRegex === true,
            is_enabled: enabledStatus,
            updated_by: req.user.id
        });
        
        if (success) {
            logger.info(`Successfully updated tag "${tagName}" for guild ${guildId} with enabled status: ${enabledStatus}`);
            return res.json({
                success: true,
                message: `Tag "${tagName}" updated successfully`
            });
        } else {
            logger.warn(`Failed to update tag "${tagName}" for guild ${guildId}`);
            return res.status(404).json({ error: 'Tag not found' });
        }
    } catch (error) {
        logger.error('Error updating tag:', error);
        res.status(500).json({ error: 'Failed to update tag: ' + error.message });
    }
});

router.post('/tags/:guildId/delete/:tagName', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId, tagName } = req.params;
        
        logger.info(`Deleting tag "${tagName}" for guild ${guildId}`);
        
        const success = await Tags.deleteTag(guildId, tagName);
        
        if (success) {
            logger.info(`Successfully deleted tag "${tagName}" for guild ${guildId}`);
            return res.json({
                success: true,
                message: `Tag "${tagName}" deleted successfully`
            });
        } else {
            logger.warn(`Failed to delete tag "${tagName}" for guild ${guildId}, tag not found`);
            return res.status(404).json({ error: 'Tag not found' });
        }
    } catch (error) {
        logger.error('Error deleting tag:', error);
        res.status(500).json({ error: 'Failed to delete tag: ' + error.message });
    }
});

module.exports = router;