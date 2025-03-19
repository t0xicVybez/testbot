const { db } = require('./database');
const logger = require('../utils/logger');

class Tags {
    static tagsCache = new Map();
    
    // Get all tags for a guild
    static async getAllTags(guildId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM tags WHERE guild_id = ? ORDER BY name ASC',
                [guildId]
            );
            return rows;
        } catch (error) {
            logger.error('Error getting tags:', error);
            throw error;
        }
    }
    
    // Get a tag by name
    static async getTagByName(guildId, name) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM tags WHERE guild_id = ? AND name = ? LIMIT 1',
                [guildId, name]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error getting tag by name:', error);
            throw error;
        }
    }
    
    // Create a new tag
    static async createTag(guildId, tagData) {
        try {
            // Clear cache first
            this.tagsCache.delete(guildId);
            
            const { name, pattern, response, is_regex, created_by } = tagData;
            
            const [result] = await db.execute(
                'INSERT INTO tags (guild_id, name, pattern, response, is_regex, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [guildId, name, pattern, response, is_regex ? 1 : 0, created_by, created_by]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error creating tag:', error);
            throw error;
        }
    }
    
    // Update an existing tag
    static async updateTag(guildId, name, tagData) {
        try {
            // Clear cache first
            this.tagsCache.delete(guildId);
            
            const { pattern, response, is_regex, is_enabled, updated_by } = tagData;
            
            logger.info(`Updating tag ${name} in guild ${guildId} with data:`, {
                pattern,
                response: response?.substring(0, 30) + '...',
                is_regex,
                is_enabled,
                updated_by
            });
            
            // Convert boolean values to integers for MySQL
            const isRegexValue = is_regex ? 1 : 0;
            const isEnabledValue = is_enabled ? 1 : 0;
            
            logger.info(`Converted values: is_regex=${isRegexValue}, is_enabled=${isEnabledValue}`);
            
            const [result] = await db.execute(
                'UPDATE tags SET pattern = ?, response = ?, is_regex = ?, is_enabled = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND name = ?',
                [pattern, response, isRegexValue, isEnabledValue, updated_by, guildId, name]
            );
            
            logger.info(`Update result: ${JSON.stringify(result)}`);
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error updating tag:', error);
            throw error;
        }
    }
    
    // Delete a tag
    static async deleteTag(guildId, name) {
        try {
            // Clear cache first
            this.tagsCache.delete(guildId);
            
            const [result] = await db.execute(
                'DELETE FROM tags WHERE guild_id = ? AND name = ?',
                [guildId, name]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error deleting tag:', error);
            throw error;
        }
    }
    
    // Get all active tags for a guild (optimized for message processing)
    static async getActiveTags(guildId) {
        try {
            // Check cache first
            if (this.tagsCache.has(guildId)) {
                return this.tagsCache.get(guildId);
            }
            
            const [rows] = await db.execute(
                'SELECT * FROM tags WHERE guild_id = ? AND is_enabled = 1',
                [guildId]
            );
            
            // Prepare regex objects for regex tags
            const tags = rows.map(tag => {
                if (tag.is_regex) {
                    try {
                        tag.regexObj = new RegExp(tag.pattern, 'i');
                    } catch (e) {
                        logger.error(`Invalid regex in tag ${tag.name}:`, e);
                        tag.regexObj = null;
                    }
                }
                return tag;
            });
            
            // Cache the result
            this.tagsCache.set(guildId, tags);
            
            return tags;
        } catch (error) {
            logger.error('Error getting active tags:', error);
            throw error;
        }
    }
    
    // Check if plugin is enabled for a guild
    static async isPluginEnabled(guildId) {
        try {
            const [rows] = await db.execute(
                'SELECT is_enabled FROM plugins WHERE guild_id = ? AND plugin_name = ?',
                [guildId, 'tags']
            );
            
            return rows.length > 0 ? rows[0].is_enabled === 1 : false;
        } catch (error) {
            logger.error('Error checking if tags plugin is enabled:', error);
            return false;
        }
    }
    
    // Enable or disable the tags plugin
    static async setPluginEnabled(guildId, enabled) {
        try {
            const [existingRows] = await db.execute(
                'SELECT * FROM plugins WHERE guild_id = ? AND plugin_name = ?',
                [guildId, 'tags']
            );
            
            if (existingRows.length > 0) {
                const [result] = await db.execute(
                    'UPDATE plugins SET is_enabled = ? WHERE guild_id = ? AND plugin_name = ?',
                    [enabled ? 1 : 0, guildId, 'tags']
                );
                return result.affectedRows > 0;
            } else {
                const [result] = await db.execute(
                    'INSERT INTO plugins (guild_id, plugin_name, is_enabled) VALUES (?, ?, ?)',
                    [guildId, 'tags', enabled ? 1 : 0]
                );
                return result.affectedRows > 0;
            }
        } catch (error) {
            logger.error('Error setting tags plugin enabled:', error);
            throw error;
        }
    }
    
    // Convert wildcard pattern to regex
    static wildcardToRegex(pattern) {
        return pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
            .replace(/\*/g, '.*'); // Convert * to .*
    }
    
    // Process a message against tags
    static async processMessage(message) {
        try {
            // Check if the plugin is enabled
            const isEnabled = await this.isPluginEnabled(message.guild.id);
            if (!isEnabled) return null;
            
            // Get active tags
            const tags = await this.getActiveTags(message.guild.id);
            if (!tags || tags.length === 0) return null;
            
            const content = message.content.trim();
            
            // Check each tag
            for (const tag of tags) {
                let matches = false;
                
                if (tag.is_regex && tag.regexObj) {
                    // Use regex pattern
                    matches = tag.regexObj.test(content);
                } else {
                    // Use wildcard pattern
                    const wildcardRegex = new RegExp(`^${this.wildcardToRegex(tag.pattern)}$`, 'i');
                    matches = wildcardRegex.test(content);
                }
                
                if (matches) {
                    return tag.response;
                }
            }
            
            return null;
        } catch (error) {
            logger.error('Error processing message against tags:', error);
            return null;
        }
    }
}

module.exports = { Tags };