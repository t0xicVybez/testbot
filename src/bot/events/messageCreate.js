const { Guilds } = require('../../database/guilds');
const { Tags } = require('../../database/tags');
const { Analytics } = require('../../database/analytics');
const logger = require('../../utils/logger');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        try {
            // Ignore messages from bots
            if (message.author.bot) return;
            
            // Only process messages in guilds
            if (!message.guild) return;
            
            // Track message analytics
            Analytics.trackEvent(message.guild.id, 'message_sent', {
                userId: message.author.id,
                channelId: message.channel.id,
                messageId: message.id,
                timestamp: new Date().toISOString()
            }).catch(err => logger.warn('Failed to track message analytics:', err));
            
            // Check for auto-response tags first
            try {
                const response = await Tags.processMessage(message);
                if (response) {
                    await message.channel.send(response);
                    
                    // Track tag trigger event
                    Analytics.trackEvent(message.guild.id, 'tag_triggered', {
                        userId: message.author.id,
                        messageId: message.id,
                        channelId: message.channel.id,
                        timestamp: new Date().toISOString()
                    }).catch(err => logger.warn('Failed to track tag analytics:', err));
                    
                    // If we sent an auto-response, we still continue to process commands
                }
            } catch (tagError) {
                logger.error('Error processing tags:', tagError);
                // Continue with command processing even if tag processing fails
            }
            
            // Get guild settings for prefix
            const guildSettings = await Guilds.getGuildSettings(message.guildId);
            const prefix = guildSettings?.prefix || '!';

            if (!message.content.startsWith(prefix)) return;

            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            // Only get commands that are specifically marked for prefix use
            const command = [...message.client.commands.values()].find(
                cmd => cmd.prefix && (cmd.name === commandName || (cmd.aliases && cmd.aliases.includes(commandName)))
            );

            if (!command) {
                // Don't respond to unknown commands to avoid confusion with other bots
                return;
            }

            // Check if command is enabled for this guild
            const isEnabled = await Guilds.isCommandEnabled(
                message.guildId,
                command.name,
                'PREFIX'
            );

            if (!isEnabled) {
                return message.reply({ 
                    content: 'This command is disabled in this server.',
                    allowedMentions: { repliedUser: false }
                });
            }

            // Track command usage for analytics
            Analytics.trackEvent(message.guild.id, 'command_used', {
                commandName: command.name,
                commandType: 'PREFIX',
                userId: message.author.id,
                channelId: message.channel.id,
                messageId: message.id,
                args: args,
                timestamp: new Date().toISOString()
            }).catch(err => logger.warn('Failed to track command analytics:', err));

            try {
                await command.executePrefix(message, args);
            } catch (error) {
                logger.error(`Error executing prefix command ${command.name}:`, error);
                await message.reply({ 
                    content: 'There was an error executing this command.',
                    allowedMentions: { repliedUser: false }
                });
            }
        } catch (error) {
            logger.error('Error handling message:', error);
        }
    }
};