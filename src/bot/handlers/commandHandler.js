const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const logger = require('../../utils/logger');

async function registerCommands(commands) {
    try {
        const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
        
        logger.info('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        );
        
        logger.info('Successfully reloaded application (/) commands.');
    } catch (error) {
        logger.error('Error registering commands:', error);
    }
}

module.exports = (client) => {
    try {
        const commands = [];
        const commandsPath = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                logger.info(`Loaded command: ${command.data.name}`);
            } else {
                logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }

        // Register commands with Discord
        registerCommands(commands);
    } catch (error) {
        logger.error('Error loading commands:', error);
    }
}; 