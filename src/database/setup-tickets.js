const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

async function setupTicketsTables() {
    let connection;
    try {
        // Create connection with the existing database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'discord_bot'
        });

        logger.info('Connected to MySQL database for tickets setup');

        // Create ticket_settings table
        const createTicketSettingsTable = `
            CREATE TABLE IF NOT EXISTS ticket_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                is_enabled BOOLEAN DEFAULT FALSE,
                category_id VARCHAR(255),
                log_channel_id VARCHAR(255),
                support_role_id VARCHAR(255),
                welcome_message TEXT,
                ticket_name_format VARCHAR(100) DEFAULT 'ticket-{number}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createTicketSettingsTable);
        logger.info('Ticket settings table created successfully');

        // Create tickets table
        const createTicketsTable = `
            CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                channel_id VARCHAR(255) NOT NULL,
                creator_id VARCHAR(255) NOT NULL, 
                assigned_to VARCHAR(255),
                ticket_number INT NOT NULL,
                subject VARCHAR(255),
                status ENUM('open', 'claimed', 'closed', 'archived') DEFAULT 'open',
                priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                closed_at TIMESTAMP NULL,
                closed_by VARCHAR(255),
                UNIQUE KEY unique_ticket_channel (guild_id, channel_id),
                UNIQUE KEY unique_ticket_number (guild_id, ticket_number),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createTicketsTable);
        logger.info('Tickets table created successfully');

        // Create ticket_responses table for canned responses
        const createResponsesTable = `
            CREATE TABLE IF NOT EXISTS ticket_responses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                created_by VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_response_name (guild_id, name),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createResponsesTable);
        logger.info('Ticket responses table created successfully');

        // Create ticket_panels table for UI components
        const createPanelsTable = `
            CREATE TABLE IF NOT EXISTS ticket_panels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                channel_id VARCHAR(255) NOT NULL,
                message_id VARCHAR(255) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                button_text VARCHAR(80) DEFAULT 'Create Ticket',
                color VARCHAR(10) DEFAULT '#3498DB',
                created_by VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_panel_message (guild_id, channel_id, message_id),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createPanelsTable);
        logger.info('Ticket panels table created successfully');

        // Create ticket_transcripts table for storing transcript links
        const createTranscriptsTable = `
            CREATE TABLE IF NOT EXISTS ticket_transcripts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                ticket_id INT NOT NULL,
                ticket_number INT NOT NULL,
                created_by VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                transcript_url VARCHAR(1000),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createTranscriptsTable);
        logger.info('Ticket transcripts table created successfully');

        // Make sure the tickets plugin is registered in the plugins table
        const insertDefaultPlugin = `
            INSERT IGNORE INTO plugins (guild_id, plugin_name, is_enabled)
            SELECT guild_id, 'tickets', FALSE FROM guilds
        `;
        
        await connection.execute(insertDefaultPlugin);
        logger.info('Default tickets plugin entries created for existing guilds');

        logger.info('Tickets database setup completed successfully');
        return true;
    } catch (error) {
        logger.error('Error setting up tickets tables:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the setup if called directly
if (require.main === module) {
    setupTicketsTables()
        .then(() => {
            logger.info('Tickets database setup completed');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Error setting up tickets database:', error);
            process.exit(1);
        });
}

module.exports = setupTicketsTables;