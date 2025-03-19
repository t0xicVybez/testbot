const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) return;

                try {
                    // Check if command is enabled for this guild
                    const isEnabled = await Guilds.isCommandEnabled(
                        interaction.guildId,
                        interaction.commandName,
                        'slash'
                    );

                    if (!isEnabled) {
                        return interaction.reply({
                            content: 'This command is disabled in this server.',
                            ephemeral: true
                        });
                    }

                    await command.execute(interaction);
                } catch (error) {
                    logger.error('Error executing command:', error);
                    const errorMessage = 'There was an error executing this command.';
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: errorMessage, ephemeral: true });
                    } else {
                        await interaction.reply({ content: errorMessage, ephemeral: true });
                    }
                }
            } else if (interaction.isButton()) {
                // Handle button interactions
                const component = interaction.client.components.get(interaction.customId);
                if (!component) return;

                try {
                    await component.execute(interaction);
                } catch (error) {
                    logger.error('Error handling button interaction:', error);
                    const errorMessage = 'There was an error processing your request.';
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: errorMessage, ephemeral: true });
                    } else {
                        await interaction.reply({ content: errorMessage, ephemeral: true });
                    }
                }
            }
        } catch (error) {
            logger.error('Error in interactionCreate event:', error);
        }
    }
}; 