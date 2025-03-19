require('../config/env');

const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Guilds } = require('../database/guilds');
const logger = require('../utils/logger');
const loadCommands = require('./handlers/commandHandler');
const loadEvents = require('./handlers/eventHandler');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
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
const componentFiles = fs.readdirSync(componentsPath).filter(file => file.endsWith('.js'));

for (const file of componentFiles) {
    const filePath = path.join(componentsPath, file);
    const component = require(filePath);
    if ('data' in component && 'execute' in component) {
        client.components.set(component.data.name, component);
    }
}

// Login to Discord
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
    });

module.exports = client; 