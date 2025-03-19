const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({
    path: path.join(__dirname, '../../.env')
});

// Validate required environment variables
const requiredEnvVars = [
    'DISCORD_BOT_TOKEN',
    'DATABASE_URL'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}

module.exports = {
    token: process.env.DISCORD_BOT_TOKEN,
    databaseUrl: process.env.DATABASE_URL,
    environment: process.env.NODE_ENV || 'development'
}; 