const { db } = require('./database');
const logger = require('../utils/logger');

class Guilds {
    static settingsCache = new Map();

    static async getGuild(guildId) {
        try {
            const [rows] = await db.execute('SELECT * FROM guilds WHERE guild_id = ?', [guildId]);
            return rows[0];
        } catch (error) {
            logger.error('Error getting guild:', error);
            throw error;
        }
    }

    static async getGuildSettings(guildId) {
        try {
            // Check cache first
            const cached = this.settingsCache.get(guildId);
            if (cached) {
                return cached;
            }

            const [rows] = await db.execute('SELECT * FROM guilds WHERE guild_id = ?', [guildId]);
            
            if (rows.length === 0) {
                const defaultSettings = {
                    prefix: '!',
                    welcomeChannel: null,
                    modLogChannel: null,
                    autoRole: null,
                    commands: {}
                };
                this.settingsCache.set(guildId, defaultSettings);
                return defaultSettings;
            }

            const [commandRows] = await db.execute('SELECT * FROM command_settings WHERE guild_id = ?', [guildId]);

            const commands = {};
            commandRows.forEach(row => {
                commands[row.command_name] = {
                    enabled: row.is_enabled === 1,
                    type: row.command_type
                };
            });

            const settings = {
                prefix: rows[0].prefix || '!',
                welcomeChannel: rows[0].welcome_channel_id,
                modLogChannel: rows[0].mod_log_channel_id,
                autoRole: rows[0].auto_role_id,
                commands
            };

            // Cache the settings
            this.settingsCache.set(guildId, settings);
            return settings;
        } catch (error) {
            logger.error('Error getting guild settings:', error);
            throw error;
        }
    }

    static async setPrefix(guildId, prefix) {
        try {
            const [result] = await db.execute(
                'UPDATE guilds SET prefix = ? WHERE guild_id = ?',
                [prefix, guildId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error setting prefix:', error);
            throw error;
        }
    }

    static async isCommandEnabled(guildId, commandName, type) {
        try {
            const [rows] = await db.execute(
                'SELECT is_enabled FROM command_settings WHERE guild_id = ? AND command_name = ? AND command_type = ?',
                [guildId, commandName, type]
            );
            // If no setting exists, command is enabled by default
            return rows.length === 0 ? true : rows[0].is_enabled === 1;
        } catch (error) {
            console.error('Error checking command status:', error);
            throw error;
        }
    }

    static async setCommandEnabled(guildId, commandName, type, enabled) {
        try {
            const [existingRows] = await db.execute(
                'SELECT * FROM command_settings WHERE guild_id = ? AND command_name = ?',
                [guildId, commandName]
            );

            if (existingRows.length > 0) {
                const [result] = await db.execute(
                    'UPDATE command_settings SET is_enabled = ? WHERE guild_id = ? AND command_name = ?',
                    [enabled ? 1 : 0, guildId, commandName]
                );
                return result.affectedRows > 0;
            } else {
                const [result] = await db.execute(
                    'INSERT INTO command_settings (guild_id, command_name, command_type, is_enabled) VALUES (?, ?, ?, ?)',
                    [guildId, commandName, type, enabled ? 1 : 0]
                );
                return result.affectedRows > 0;
            }
        } catch (error) {
            logger.error('Error setting command enabled:', error);
            throw error;
        }
    }

    static async getCommandSettings(guildId) {
        try {
            const [rows] = await db.execute('SELECT * FROM command_settings WHERE guild_id = ?', [guildId]);
            
            const commands = {};
            rows.forEach(row => {
                commands[row.command_name] = {
                    enabled: row.is_enabled === 1,
                    type: row.command_type
                };
            });
            
            return commands;
        } catch (error) {
            logger.error('Error getting command settings:', error);
            throw error;
        }
    }

    static async verifyGuildSettings(guildId) {
        try {
            const [rows] = await db.execute('SELECT welcome_channel_id, mod_log_channel_id, auto_role_id FROM guilds WHERE guild_id = ?', [guildId]);
            
            if (rows.length === 0) {
                logger.warn(`No settings found for guild ${guildId}`);
                return null;
            }

            const settings = rows[0];
            logger.info(`Current settings for guild ${guildId}:`, {
                welcome_channel_id: settings.welcome_channel_id || 'Not set',
                mod_log_channel_id: settings.mod_log_channel_id || 'Not set',
                auto_role_id: settings.auto_role_id || 'Not set'
            });
            
            return settings;
        } catch (error) {
            logger.error('Error verifying guild settings:', error);
            throw error;
        }
    }

    static async updateSettings(guildId, settings) {
        try {
            const validColumns = ['prefix', 'welcome_channel_id', 'mod_log_channel_id', 'auto_role_id'];
            const updates = [];
            const values = [];

            for (const [key, value] of Object.entries(settings)) {
                if (validColumns.includes(key)) {
                    updates.push(`${key} = ?`);
                    values.push(value);
                }
            }

            if (updates.length === 0) {
                logger.warn(`No valid settings to update for guild ${guildId}`);
                return;
            }

            values.push(guildId);

            const query = `UPDATE guilds SET ${updates.join(', ')} WHERE guild_id = ?`;
            const [result] = await db.execute(query, values);
            
            // Invalidate cache
            this.settingsCache.delete(guildId);
            
            // Verify the update
            const updatedSettings = await this.getGuild(guildId);
            logger.info(`Updated settings for guild ${guildId}`, updatedSettings);

            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error updating guild settings:', error);
            throw error;
        }
    }

    static async deleteGuild(guildId) {
        try {
            const [result] = await db.execute('DELETE FROM guilds WHERE guild_id = ?', [guildId]);
            const [commandResult] = await db.execute('DELETE FROM command_settings WHERE guild_id = ?', [guildId]);
            return result.affectedRows > 0 && commandResult.affectedRows > 0;
        } catch (error) {
            console.error('Error deleting guild:', error);
            throw error;
        }
    }

    static async addGuild(guildId, name, icon, ownerId) {
        try {
            const [result] = await db.execute(
                'INSERT INTO guilds (guild_id, name, icon, owner_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, icon = ?',
                [guildId, name, icon, ownerId, name, icon]
            );
            logger.info(`Guild ${name} (${guildId}) added or updated`);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error adding guild:', error);
            throw error;
        }
    }

    static async removeGuild(guildId) {
        try {
            const [result] = await db.execute('DELETE FROM guilds WHERE guild_id = ?', [guildId]);
            const [commandResult] = await db.execute('DELETE FROM command_settings WHERE guild_id = ?', [guildId]);
            // Clear cache
            this.settingsCache.delete(guildId);
            logger.info(`Guild ${guildId} removed`);
            return result.affectedRows > 0 && commandResult.affectedRows > 0;
        } catch (error) {
            logger.error('Error removing guild:', error);
            throw error;
        }
    }

    static async getBotGuilds() {
        try {
            const [rows] = await db.execute('SELECT * FROM guilds');
            return rows;
        } catch (error) {
            logger.error('Error getting bot guilds:', error);
            throw error;
        }
    }

    static async updateCommandSettings(guildId, commandSettings) {
        try {
            for (const [commandName, settings] of Object.entries(commandSettings)) {
                await db.execute(`
                    INSERT INTO command_settings (guild_id, command_name, command_type, is_enabled)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE is_enabled = ?
                `, [guildId, commandName, settings.type || 'PREFIX', settings.enabled ? 1 : 0, settings.enabled ? 1 : 0]);
            }
            return true;
        } catch (error) {
            logger.error('Error updating command settings:', error);
            throw error;
        }
    }
}

module.exports = { Guilds }; 