-- Drop existing tables if they exist
DROP TABLE IF EXISTS command_settings;
DROP TABLE IF EXISTS guild_settings;
DROP TABLE IF EXISTS bot_guilds;
DROP TABLE IF EXISTS guilds;

-- Create guilds table
CREATE TABLE IF NOT EXISTS guilds (
    guild_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(255),
    owner_id VARCHAR(255) NOT NULL,
    prefix VARCHAR(10) DEFAULT '!',
    welcome_channel_id VARCHAR(255),
    mod_log_channel_id VARCHAR(255),
    auto_role_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create guild_settings table
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

-- Create command_settings table
CREATE TABLE IF NOT EXISTS command_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    command_name VARCHAR(255) NOT NULL,
    command_type ENUM('SLASH', 'PREFIX') NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_guild_command (guild_id, command_name, command_type),
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

-- Create sessions table for dashboard
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    expires BIGINT,
    data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
); 