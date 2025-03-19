const { InteractionType } = require('discord.js');
const logger = require('../../utils/logger');

async function handleInteractionError(interaction, error) {
    logger.error('Error handling interaction:', error);
    
    try {
        const errorMessage = 'An error occurred while processing your request.';
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        } else if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
        } else {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
    } catch (followUpError) {
        logger.error('Error sending error message:', followUpError);
    }
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) return;

                try {
                    await command.execute(interaction);
                } catch (error) {
                    await handleInteractionError(interaction, error);
                }
                return;
            }

            // Handle buttons
            if (interaction.isButton()) {
                // Add button handlers here if needed
                return;
            }

            // Handle modals
            if (interaction.type === InteractionType.ModalSubmit) {
                // Add modal handlers here if needed
                return;
            }

            // Handle select menus
            if (interaction.isStringSelectMenu()) {
                // Add select menu handlers here if needed
                return;
            }

        } catch (error) {
            await handleInteractionError(interaction, error);
        }
    }
}; 