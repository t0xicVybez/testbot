// src/config/env.js - Fixed version
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Determine the path to the .env file
const envPath = path.join(__dirname, '../../.env');

// Check if the .env file exists
if (fs.existsSync(envPath)) {
    console.log(`Loading environment variables from ${envPath}`);
    // Load environment variables from .env file
    dotenv.config({
        path: envPath
    });
} else {
    console.warn('.env file not found, using environment variables directly');
    // Still call dotenv.config() to ensure proper setup
    dotenv.config();
}

// Validate required environment variables
const requiredEnvVars = [
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'SESSION_SECRET'
];

const missingVars = [];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        missingVars.push(envVar);
    }
}

if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = {
    token: process.env.DISCORD_BOT_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    databaseUrl: process.env.DATABASE_URL || `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}`,
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    callbackUrl: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback'
};