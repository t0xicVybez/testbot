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

        // Create ticket_categories table
        const createCategoriesTable = `
            CREATE TABLE IF NOT EXISTS ticket_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                category_id VARCHAR(255) NOT NULL,
                support_role_id VARCHAR(255),
                welcome_message TEXT,
                ticket_name_format VARCHAR(100) DEFAULT 'ticket-{category}-{number}',
                feedback_enabled BOOLEAN DEFAULT TRUE,
                color VARCHAR(10) DEFAULT '#3498DB',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_guild_category_name (guild_id, name),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createCategoriesTable);
        logger.info('Ticket categories table created successfully');

        // Update ticket_settings table
        const createTicketSettingsTable = `
            CREATE TABLE IF NOT EXISTS ticket_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                is_enabled BOOLEAN DEFAULT FALSE,
                log_channel_id VARCHAR(255),
                default_category_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createTicketSettingsTable);
        logger.info('Ticket settings table created successfully');

        // Add foreign key to default_category_id if it doesn't exist
        try {
            await connection.execute(`
                ALTER TABLE ticket_settings 
                ADD CONSTRAINT fk_default_category 
                FOREIGN KEY (default_category_id) 
                REFERENCES ticket_categories(id) 
                ON DELETE SET NULL
            `);
            logger.info('Added foreign key to default_category_id in ticket_settings table');
        } catch (error) {
            // Constraint might already exist, which is fine
            logger.info('Foreign key constraint for default_category_id might already exist');
        }

        // Update tickets table to include category_id
        const createTicketsTable = `
            CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                channel_id VARCHAR(255) NOT NULL,
                creator_id VARCHAR(255) NOT NULL, 
                assigned_to VARCHAR(255),
                ticket_number INT NOT NULL,
                category_id INT,
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

        // Add foreign key to category_id if it doesn't exist
        try {
            await connection.execute(`
                ALTER TABLE tickets 
                ADD CONSTRAINT fk_ticket_category 
                FOREIGN KEY (category_id) 
                REFERENCES ticket_categories(id) 
                ON DELETE SET NULL
            `);
            logger.info('Added foreign key to category_id in tickets table');
        } catch (error) {
            // Constraint might already exist, which is fine
            logger.info('Foreign key constraint for category_id might already exist');
        }

        // Create ticket_feedback table
        const createFeedbackTable = `
            CREATE TABLE IF NOT EXISTS ticket_feedback (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                ticket_id INT NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                rating INT NOT NULL,
                comments TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createFeedbackTable);
        logger.info('Ticket feedback table created successfully');

        // Update ticket_panels table to include category_id
        const createPanelsTable = `
            CREATE TABLE IF NOT EXISTS ticket_panels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                channel_id VARCHAR(255) NOT NULL,
                message_id VARCHAR(255) NOT NULL,
                category_id INT,
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

        // Add foreign key to category_id if it doesn't exist
        try {
            await connection.execute(`
                ALTER TABLE ticket_panels 
                ADD CONSTRAINT fk_panel_category 
                FOREIGN KEY (category_id) 
                REFERENCES ticket_categories(id) 
                ON DELETE CASCADE
            `);
            logger.info('Added foreign key to category_id in ticket_panels table');
        } catch (error) {
            // Constraint might already exist, which is fine
            logger.info('Foreign key constraint for category_id in panels might already exist');
        }

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
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
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

        // Migrate existing ticket settings if needed
        const migrateExistingSettings = `
            INSERT IGNORE INTO ticket_categories (
                guild_id, 
                name, 
                category_id, 
                support_role_id, 
                welcome_message, 
                ticket_name_format
            )
            SELECT 
                ts.guild_id, 
                'General', 
                ts.category_id, 
                ts.support_role_id, 
                ts.welcome_message, 
                ts.ticket_name_format
            FROM ticket_settings ts
            WHERE ts.category_id IS NOT NULL
        `;

        try {
            await connection.execute(migrateExistingSettings);
            logger.info('Migrated existing ticket settings to categories');
        } catch (error) {
            logger.warn('Error during migration of existing settings (might be expected):', error.message);
        }

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