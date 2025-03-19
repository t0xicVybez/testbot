const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

module.exports = (client) => {
    try {
        // Load event files
        const eventsPath = path.join(__dirname, '../events');
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            const event = require(filePath);
            
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args));
            } else {
                client.on(event.name, (...args) => event.execute(...args));
            }

            logger.info(`Loaded event: ${event.name}`);
        }
    } catch (error) {
        logger.error('Error loading events:', error);
    }
};