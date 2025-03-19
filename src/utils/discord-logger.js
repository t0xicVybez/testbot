const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

/**
 * Sends a log message to a specified Discord channel
 * @param {Client} client - Discord.js client instance
 * @param {string} guildId - ID of the guild
 * @param {string} channelId - ID of the channel to send the log to
 * @param {Object} data - The data to log
 * @param {string} action - The action that was performed
 * @returns {Promise<void>}
 */
async function sendLog(client, guildId, channelId, data, action) {
    try {
        logger.info(`Attempting to send log to channel ${channelId} in guild ${guildId}`);
        logger.info('Log data:', data);
        
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            logger.warn(`Could not find channel ${channelId} for logging in guild ${guildId}`);
            return;
        }

        logger.info(`Found channel: ${channel.name}`);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Dashboard Action Log')
            .setDescription(`Action: ${action}`)
            .setTimestamp();

        // Add fields based on what was changed
        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                // Format channel and role mentions
                if (key.includes('channel_id') && value) {
                    value = `<#${value}>`;
                } else if (key.includes('role_id') && value) {
                    value = `<@&${value}>`;
                }
                
                // Convert arrays to strings
                if (Array.isArray(value)) {
                    value = value.join('\n');
                }
                
                // Handle objects by converting to JSON string
                if (typeof value === 'object' && value !== null) {
                    value = JSON.stringify(value, null, 2);
                }

                embed.addFields({ name: key.replace(/_/g, ' ').toUpperCase(), value: value.toString() });
            }
        });

        logger.info('Sending embed to channel');
        await channel.send({ embeds: [embed] });
        logger.info('Successfully sent log message');
    } catch (error) {
        logger.error('Error sending log to Discord channel:', error);
    }
}

module.exports = {
    sendLog
}; 