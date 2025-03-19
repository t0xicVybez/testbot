const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        logger.info(`Logged in as ${client.user.tag}`);

        // Update guilds in database
        client.guilds.cache.forEach(async (guild) => {
            try {
                await Guilds.addGuild(
                    guild.id,
                    guild.name,
                    guild.iconURL(),
                    guild.ownerId
                );
            } catch (error) {
                logger.error(`Error adding guild ${guild.name}:`, error);
            }
        });
    }
}; 