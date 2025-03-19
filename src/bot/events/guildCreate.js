const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');

module.exports = {
    name: 'guildCreate',
    execute(guild) {
        logger.info(`New guild joined: ${guild.name} (${guild.id})`);

        // Add guild to database
        Guilds.addGuild(
            guild.id,
            guild.name,
            guild.iconURL(),
            guild.ownerId
        ).catch(error => {
            logger.error(`Error adding guild ${guild.name}:`, error);
        });
    }
}; 