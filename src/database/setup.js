const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

async function setupDatabase() {
    let connection;
    try {
        // Create initial connection without database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
        });

        // Create database if it doesn't exist
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'discord_bot'}`);
        await connection.query(`USE ${process.env.DB_NAME || 'discord_bot'}`);

        // Read and execute schema.sql
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');

        // Split the schema into individual statements
        const statements = schema
            .split(';')
            .map(statement => statement.trim())
            .filter(statement => statement.length > 0);

        // Execute each statement
        for (const statement of statements) {
            await connection.query(statement);
            logger.info('Executed SQL statement successfully');
        }

        logger.info('Database setup completed successfully');
    } catch (error) {
        logger.error('Error setting up database:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run setup if this file is run directly
if (require.main === module) {
    setupDatabase()
        .then(() => {
            logger.info('Database setup completed');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Database setup failed:', error);
            process.exit(1);
        });
}

module.exports = setupDatabase; 