// src/database/setup-feedback.js
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

async function setupFeedbackTables() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'discord_bot'
        });

        logger.info('Connected to MySQL database for feedback system setup');

        // Create ticket_categories table
        const createCategoriesTable = `
            CREATE TABLE IF NOT EXISTS ticket_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                category_id VARCHAR(255) NOT NULL,
                support_role_id VARCHAR(255),
                log_channel_id VARCHAR(255),
                welcome_message TEXT,
                ticket_name_format VARCHAR(100) DEFAULT 'ticket-{number}',
                is_feedback_enabled BOOLEAN DEFAULT FALSE,
                feedback_message TEXT DEFAULT 'Please rate your experience with our support team:',
                sort_order INT DEFAULT 0,
                is_enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_guild_category_name (guild_id, name),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createCategoriesTable);
        logger.info('Ticket categories table created successfully');

        // Check if ticket_panels table exists and add category_id column if needed
        const [panelColumns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ticket_panels' AND COLUMN_NAME = 'ticket_category_id'
        `, [process.env.DB_NAME || 'discord_bot']);
        
        if (panelColumns.length === 0) {
            // Add category_id to ticket_panels table
            await connection.execute(`
                ALTER TABLE ticket_panels 
                ADD COLUMN ticket_category_id INT DEFAULT NULL,
                ADD CONSTRAINT fk_panels_category FOREIGN KEY (ticket_category_id) 
                REFERENCES ticket_categories(id) ON DELETE SET NULL
            `);
            logger.info('Added ticket_category_id column to ticket_panels table');
        }

        // Check if tickets table exists and add category_id column if needed
        const [ticketColumns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tickets' AND COLUMN_NAME = 'category_id'
        `, [process.env.DB_NAME || 'discord_bot']);
        
        if (ticketColumns.length === 0) {
            // Add category_id to tickets table
            await connection.execute(`
                ALTER TABLE tickets 
                ADD COLUMN category_id INT DEFAULT NULL,
                ADD CONSTRAINT fk_tickets_category FOREIGN KEY (category_id) 
                REFERENCES ticket_categories(id) ON DELETE SET NULL
            `);
            logger.info('Added category_id column to tickets table');
        }

        // Create ticket_feedback table
        const createFeedbackTable = `
            CREATE TABLE IF NOT EXISTS ticket_feedback (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                ticket_id INT NOT NULL,
                ticket_number INT NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
                feedback_text TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_ticket_feedback (ticket_id),
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createFeedbackTable);
        logger.info('Ticket feedback table created successfully');

        // Check if ticket_settings table exists and add default_category_id column if needed
        const [settingsColumns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ticket_settings' AND COLUMN_NAME = 'default_category_id'
        `, [process.env.DB_NAME || 'discord_bot']);
        
        if (settingsColumns.length === 0) {
            // Add default_category_id to ticket_settings table
            await connection.execute(`
                ALTER TABLE ticket_settings
                ADD COLUMN default_category_id INT DEFAULT NULL,
                ADD CONSTRAINT fk_default_category FOREIGN KEY (default_category_id)
                REFERENCES ticket_categories(id) ON DELETE SET NULL
            `);
            logger.info('Added default_category_id column to ticket_settings table');
        }

        // Migrate existing tickets to use category system if needed
        const [existingSettings] = await connection.execute(`
            SELECT guild_id, category_id, support_role_id, log_channel_id, welcome_message, ticket_name_format
            FROM ticket_settings
            WHERE category_id IS NOT NULL
        `);

        // Create a default category for each guild that has existing tickets
        for (const settings of existingSettings) {
            // Check if guild already has categories
            const [existingCategories] = await connection.execute(`
                SELECT id FROM ticket_categories WHERE guild_id = ?
            `, [settings.guild_id]);

            if (existingCategories.length === 0) {
                // Create a default category
                const [result] = await connection.execute(`
                    INSERT INTO ticket_categories (
                        guild_id, name, description, category_id, support_role_id, log_channel_id, 
                        welcome_message, ticket_name_format, is_enabled
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    settings.guild_id,
                    'General Support',
                    'General support tickets',
                    settings.category_id,
                    settings.support_role_id,
                    settings.log_channel_id,
                    settings.welcome_message,
                    settings.ticket_name_format,
                    true
                ]);
                
                const categoryId = result.insertId;
                
                // Set as default category
                await connection.execute(`
                    UPDATE ticket_settings SET default_category_id = ? WHERE guild_id = ?
                `, [categoryId, settings.guild_id]);
                
                // Update existing tickets to use this category
                await connection.execute(`
                    UPDATE tickets SET category_id = ? WHERE guild_id = ? AND category_id IS NULL
                `, [categoryId, settings.guild_id]);
                
                // Update existing panels to use this category
                await connection.execute(`
                    UPDATE ticket_panels SET ticket_category_id = ? WHERE guild_id = ? AND ticket_category_id IS NULL
                `, [categoryId, settings.guild_id]);
                
                logger.info(`Created default category for guild ${settings.guild_id} and updated existing tickets`);
            }
        }

        logger.info('Feedback system database setup completed successfully');
        return true;
    } catch (error) {
        logger.error('Error setting up feedback system tables:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the setup if called directly
if (require.main === module) {
    setupFeedbackTables()
        .then(() => {
            logger.info('Feedback system database setup completed');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Error setting up feedback system database:', error);
            process.exit(1);
        });
}

module.exports = setupFeedbackTables;