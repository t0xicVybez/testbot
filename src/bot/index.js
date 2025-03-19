require('../config/env');

const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Guilds } = require('../database/guilds');
const logger = require('../utils/logger');
const loadCommands = require('./handlers/commandHandler');
const loadEvents = require('./handlers/eventHandler');

// Create a new client instance with increased intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Important for guildMemberAdd event
        GatewayIntentBits.GuildModeration // For moderation actions
    ]
});

// Create collections for commands and components
client.commands = new Collection();
client.components = new Collection();

// Load commands and events
loadCommands(client);
loadEvents(client);

// Load components (buttons, etc.)
const componentsPath = path.join(__dirname, 'components');
if (fs.existsSync(componentsPath)) {
    const componentFiles = fs.readdirSync(componentsPath).filter(file => file.endsWith('.js'));

    for (const file of componentFiles) {
        const filePath = path.join(componentsPath, file);
        const component = require(filePath);
        if ('data' in component && 'execute' in component) {
            client.components.set(component.data.name, component);
            logger.info(`Loaded component: ${component.data.name}`);
        } else {
            logger.warn(`The component at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

// Error handling for Discord.js
client.on('error', (error) => {
    logger.error('Discord client error:', error);
});

client.on('shardError', (error) => {
    logger.error('WebSocket connection error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Login to Discord only if this file is run directly
if (require.main === module) {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
        logger.error('No bot token found in environment variables');
        process.exit(1);
    }

    client.login(token)
        .then(() => {
            logger.info('Bot is online!');
        })
        .catch(error => {
            logger.error('Error logging in:', error);
            process.exit(1);
        });
}

module.exports = client;