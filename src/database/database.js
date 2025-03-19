const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

// Create the connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'discord_bot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test the connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        logger.info('Database connection established successfully');
        connection.release();
    } catch (error) {
        logger.error('Error connecting to database:', error);
        throw error;
    }
}

// Initialize database
async function initializeDatabase() {
    try {
        // Create database if it doesn't exist
        const tempPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD
        });

        await tempPool.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'discord_bot'}`);
        await tempPool.end();

        // Test the connection to the actual database
        await testConnection();
    } catch (error) {
        logger.error('Error initializing database:', error);
        throw error;
    }
}

// Initialize the database
initializeDatabase();

module.exports = {
    db: pool,
    testConnection
}; 