const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

async function setupPluginsTables() {
    let connection;
    try {
        // Create connection with the existing database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'discord_bot'
        });

        logger.info('Connected to MySQL database for plugins setup');

        // Create plugins table
        const createPluginsTable = `
            CREATE TABLE IF NOT EXISTS plugins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                plugin_name VARCHAR(50) NOT NULL,
                is_enabled BOOLEAN DEFAULT FALSE,
                settings JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_guild_plugin (guild_id, plugin_name),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createPluginsTable);
        logger.info('Plugins table created successfully');

        // Create tables for plugs
        const createTagsTable = `
            CREATE TABLE IF NOT EXISTS tags (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                pattern VARCHAR(500) NOT NULL,
                response TEXT NOT NULL,
                is_regex BOOLEAN DEFAULT FALSE,
                is_enabled BOOLEAN DEFAULT TRUE,
                created_by VARCHAR(255),
                updated_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_guild_tag_name (guild_id, name),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createTagsTable);
        logger.info('Tags table created successfully');

        logger.info('Plugins database setup completed successfully');
        return true;
    } catch (error) {
        logger.error('Error setting up plugins tables:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the setup if called directly
if (require.main === module) {
    setupPluginsTables()
        .then(() => {
            logger.info('Plugins database setup completed');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Error setting up plugins database:', error);
            process.exit(1);
        });
}

module.exports = setupPluginsTables;