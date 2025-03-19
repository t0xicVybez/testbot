const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');

module.exports = {
    name: 'guildDelete',
    execute(guild) {
        logger.info(`Left guild: ${guild.name} (${guild.id})`);

        // Remove guild from database
        Guilds.removeGuild(guild.id).catch(error => {
            logger.error(`Error removing guild ${guild.name}:`, error);
        });
    }
}; 