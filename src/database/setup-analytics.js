// src/database/setup-analytics.js
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

async function setupAnalyticsTables() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'discord_bot'
        });

        logger.info('Connected to MySQL database for analytics setup');

        // Create analytics_events table
        const createEventsTable = `
            CREATE TABLE IF NOT EXISTS analytics_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                event_data JSON,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_guild_timestamp (guild_id, timestamp),
                INDEX idx_guild_event_type (guild_id, event_type),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createEventsTable);
        logger.info('Analytics events table created successfully');

        logger.info('Analytics database setup completed successfully');
        return true;
    } catch (error) {
        logger.error('Error setting up analytics tables:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    setupAnalyticsTables()
        .then(() => {
            logger.info('Analytics database setup completed');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Error setting up analytics database:', error);
            process.exit(1);
        });
}

module.exports = setupAnalyticsTables;