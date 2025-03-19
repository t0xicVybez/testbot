const { db } = require('./database');
const logger = require('../utils/logger');

class Tickets {
    static settingsCache = new Map();
    
    // Plugin Management
    static async isPluginEnabled(guildId) {
        try {
            // First check plugins table
            const [pluginRows] = await db.execute(
                'SELECT is_enabled FROM plugins WHERE guild_id = ? AND plugin_name = ?',
                [guildId, 'tickets']
            );
            
            if (pluginRows.length === 0) {
                return false; // Plugin not registered
            }
            
            if (pluginRows[0].is_enabled !== 1) {
                return false; // Plugin disabled in plugins table
            }
            
            // Then check ticket_settings
            const [settingsRows] = await db.execute(
                'SELECT is_enabled FROM ticket_settings WHERE guild_id = ?',
                [guildId]
            );
            
            // Both must be enabled
            return settingsRows.length > 0 && settingsRows[0].is_enabled === 1;
        } catch (error) {
            logger.error('Error checking if tickets plugin is enabled:', error);
            return false;
        }
    }
    
    static async setPluginEnabled(guildId, enabled) {
        try {
            // Update in plugins table
            const [existingRows] = await db.execute(
                'SELECT * FROM plugins WHERE guild_id = ? AND plugin_name = ?',
                [guildId, 'tickets']
            );
            
            if (existingRows.length > 0) {
                await db.execute(
                    'UPDATE plugins SET is_enabled = ? WHERE guild_id = ? AND plugin_name = ?',
                    [enabled ? 1 : 0, guildId, 'tickets']
                );
            } else {
                await db.execute(
                    'INSERT INTO plugins (guild_id, plugin_name, is_enabled) VALUES (?, ?, ?)',
                    [guildId, 'tickets', enabled ? 1 : 0]
                );
            }
            
            // Also update or create ticket_settings
            const [settingsRows] = await db.execute(
                'SELECT * FROM ticket_settings WHERE guild_id = ?',
                [guildId]
            );
            
            if (settingsRows.length > 0) {
                await db.execute(
                    'UPDATE ticket_settings SET is_enabled = ? WHERE guild_id = ?',
                    [enabled ? 1 : 0, guildId]
                );
            } else {
                await db.execute(
                    'INSERT INTO ticket_settings (guild_id, is_enabled) VALUES (?, ?)',
                    [guildId, enabled ? 1 : 0]
                );
            }
            
            // Clear cache
            this.settingsCache.delete(guildId);
            
            return true;
        } catch (error) {
            logger.error('Error setting tickets plugin enabled:', error);
            throw error;
        }
    }
    
    // Ticket Settings
    static async getTicketSettings(guildId) {
        try {
            // Check cache first
            if (this.settingsCache.has(guildId)) {
                return this.settingsCache.get(guildId);
            }
            
            const [rows] = await db.execute(
                'SELECT * FROM ticket_settings WHERE guild_id = ?',
                [guildId]
            );
            
            if (rows.length === 0) {
                const defaultSettings = {
                    is_enabled: false,
                    category_id: null,
                    log_channel_id: null,
                    support_role_id: null,
                    welcome_message: 'Thank you for creating a support ticket. Please describe your issue, and a staff member will assist you shortly.',
                    ticket_name_format: 'ticket-{number}'
                };
                
                // Cache the default settings
                this.settingsCache.set(guildId, defaultSettings);
                return defaultSettings;
            }
            
            // Format settings for frontend use
            const settings = {
                is_enabled: rows[0].is_enabled === 1,
                category_id: rows[0].category_id,
                log_channel_id: rows[0].log_channel_id,
                support_role_id: rows[0].support_role_id,
                welcome_message: rows[0].welcome_message,
                ticket_name_format: rows[0].ticket_name_format
            };
            
            // Cache the settings
            this.settingsCache.set(guildId, settings);
            return settings;
        } catch (error) {
            logger.error('Error getting ticket settings:', error);
            throw error;
        }
    }
    
    static async updateTicketSettings(guildId, settings) {
        try {
            // Clear cache
            this.settingsCache.delete(guildId);
            
            const [existingRows] = await db.execute(
                'SELECT * FROM ticket_settings WHERE guild_id = ?',
                [guildId]
            );
            
            if (existingRows.length > 0) {
                const query = `
                    UPDATE ticket_settings 
                    SET 
                        is_enabled = ?,
                        category_id = ?,
                        log_channel_id = ?,
                        support_role_id = ?,
                        welcome_message = ?,
                        ticket_name_format = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE guild_id = ?
                `;
                
                await db.execute(query, [
                    settings.is_enabled ? 1 : 0,
                    settings.category_id,
                    settings.log_channel_id,
                    settings.support_role_id,
                    settings.welcome_message,
                    settings.ticket_name_format,
                    guildId
                ]);
            } else {
                const query = `
                    INSERT INTO ticket_settings (
                        guild_id, 
                        is_enabled, 
                        category_id, 
                        log_channel_id,
                        support_role_id,
                        welcome_message,
                        ticket_name_format
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                
                await db.execute(query, [
                    guildId,
                    settings.is_enabled ? 1 : 0,
                    settings.category_id,
                    settings.log_channel_id,
                    settings.support_role_id,
                    settings.welcome_message,
                    settings.ticket_name_format
                ]);
            }
            
            return true;
        } catch (error) {
            logger.error('Error updating ticket settings:', error);
            throw error;
        }
    }
    
    // Ticket Management
    static async createTicket(guildId, data) {
        try {
            // Ensure we have a ticket number explicitly set
            let { ticket_number } = data;
            
            // If no ticket number was provided, get the next one
            if (!ticket_number) {
                const [maxTicketRows] = await db.execute(
                    'SELECT MAX(ticket_number) as max_number FROM tickets WHERE guild_id = ?',
                    [guildId]
                );
                
                ticket_number = maxTicketRows[0].max_number ? maxTicketRows[0].max_number + 1 : 1;
            }
            
            const query = `
                INSERT INTO tickets (
                    guild_id,
                    channel_id,
                    creator_id,
                    ticket_number,
                    subject,
                    status
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            const [result] = await db.execute(query, [
                guildId,
                data.channel_id,
                data.creator_id,
                ticket_number,
                data.subject || `Support Ticket #${ticket_number}`,
                'open'
            ]);
            
            return {
                id: result.insertId,
                ticket_number
            };
        } catch (error) {
            logger.error('Error creating ticket:', error);
            throw error;
        }
    }
    
    static async getTicket(guildId, channelId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ?',
                [guildId, channelId]
            );
            
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error getting ticket:', error);
            throw error;
        }
    }
    
    static async getTicketById(ticketId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM tickets WHERE id = ?',
                [ticketId]
            );
            
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error getting ticket by ID:', error);
            throw error;
        }
    }
    
    static async getTicketByNumber(guildId, ticketNumber) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM tickets WHERE guild_id = ? AND ticket_number = ?',
                [guildId, ticketNumber]
            );
            
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error getting ticket by number:', error);
            throw error;
        }
    }
    
    static async updateTicketStatus(guildId, channelId, status, userId = null) {
        try {
            let query;
            let params;
            
            if (status === 'closed') {
                query = `
                    UPDATE tickets 
                    SET status = ?, closed_at = CURRENT_TIMESTAMP, closed_by = ?
                    WHERE guild_id = ? AND channel_id = ?
                `;
                params = [status, userId, guildId, channelId];
            } else if (status === 'claimed') {
                query = `
                    UPDATE tickets 
                    SET status = ?, assigned_to = ?
                    WHERE guild_id = ? AND channel_id = ?
                `;
                params = [status, userId, guildId, channelId];
            } else {
                query = `
                    UPDATE tickets 
                    SET status = ?
                    WHERE guild_id = ? AND channel_id = ?
                `;
                params = [status, guildId, channelId];
            }
            
            const [result] = await db.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error updating ticket status:', error);
            throw error;
        }
    }
    
    static async deleteTicket(guildId, channelId) {
        try {
            const [result] = await db.execute(
                'DELETE FROM tickets WHERE guild_id = ? AND channel_id = ?',
                [guildId, channelId]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error deleting ticket:', error);
            throw error;
        }
    }
    
    static async getActiveTickets(guildId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM tickets WHERE guild_id = ? AND status != "archived" ORDER BY created_at DESC',
                [guildId]
            );
            
            return rows;
        } catch (error) {
            logger.error('Error getting active tickets:', error);
            throw error;
        }
    }
    
    static async getActiveTicketsByUser(guildId, userId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status != "archived" AND status != "closed"',
                [guildId, userId]
            );
            
            return rows;
        } catch (error) {
            logger.error('Error getting active tickets for user:', error);
            throw error;
        }
    }
    
    // Ticket Responses (Canned Responses)
    static async getTicketResponses(guildId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM ticket_responses WHERE guild_id = ? ORDER BY name ASC',
                [guildId]
            );
            
            return rows;
        } catch (error) {
            logger.error('Error getting ticket responses:', error);
            throw error;
        }
    }
    
    static async getTicketResponseByName(guildId, name) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM ticket_responses WHERE guild_id = ? AND name = ?',
                [guildId, name]
            );
            
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error getting ticket response:', error);
            throw error;
        }
    }
    
    static async createTicketResponse(guildId, data) {
        try {
            const query = `
                INSERT INTO ticket_responses (
                    guild_id,
                    name,
                    content,
                    created_by
                ) VALUES (?, ?, ?, ?)
            `;
            
            const [result] = await db.execute(query, [
                guildId,
                data.name,
                data.content,
                data.created_by
            ]);
            
            return result.insertId;
        } catch (error) {
            logger.error('Error creating ticket response:', error);
            throw error;
        }
    }
    
    static async updateTicketResponse(guildId, name, content, updatedBy) {
        try {
            const query = `
                UPDATE ticket_responses 
                SET content = ?, created_by = ?, updated_at = CURRENT_TIMESTAMP
                WHERE guild_id = ? AND name = ?
            `;
            
            const [result] = await db.execute(query, [
                content,
                updatedBy,
                guildId,
                name
            ]);
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error updating ticket response:', error);
            throw error;
        }
    }
    
    static async deleteTicketResponse(guildId, name) {
        try {
            const [result] = await db.execute(
                'DELETE FROM ticket_responses WHERE guild_id = ? AND name = ?',
                [guildId, name]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error deleting ticket response:', error);
            throw error;
        }
    }
    
    // Ticket Panels (for ticket creation UI)
    static async getPanels(guildId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM ticket_panels WHERE guild_id = ? ORDER BY created_at DESC',
                [guildId]
            );
            
            return rows;
        } catch (error) {
            logger.error('Error getting ticket panels:', error);
            throw error;
        }
    }

    static async getPanelById(panelId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM ticket_panels WHERE id = ?',
                [panelId]
            );
            
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error getting ticket panel by ID:', error);
            throw error;
        }
    }

    static async createPanel(guildId, panelData) {
        try {
            const {
                name,
                channel_id,
                message_id,
                title,
                description,
                button_text,
                color,
                created_by
            } = panelData;
            
            const [result] = await db.execute(
                `INSERT INTO ticket_panels (
                    guild_id, name, channel_id, message_id, title, description, 
                    button_text, color, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    guildId, 
                    name, 
                    channel_id, 
                    message_id, 
                    title, 
                    description, 
                    button_text, 
                    color, 
                    created_by
                ]
            );
            
            return result.insertId;
        } catch (error) {
            logger.error('Error creating ticket panel:', error);
            throw error;
        }
    }

    static async updatePanel(panelId, panelData) {
        try {
            const {
                name,
                title,
                description,
                button_text,
                color,
                message_id
            } = panelData;
            
            const [result] = await db.execute(
                `UPDATE ticket_panels SET 
                    name = ?, 
                    title = ?, 
                    description = ?, 
                    button_text = ?, 
                    color = ?,
                    message_id = COALESCE(?, message_id),
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?`,
                [name, title, description, button_text, color, message_id, panelId]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error updating ticket panel:', error);
            throw error;
        }
    }

    static async saveTranscriptLink(guildId, ticketId, ticketNumber, createdBy, transcriptUrl) {
        try {
            const query = `
                INSERT INTO ticket_transcripts (
                    guild_id,
                    ticket_id,
                    ticket_number,
                    created_by,
                    transcript_url
                ) VALUES (?, ?, ?, ?, ?)
            `;
            
            const [result] = await db.execute(query, [
                guildId,
                ticketId,
                ticketNumber,
                createdBy,
                transcriptUrl
            ]);
            
            return result.insertId;
        } catch (error) {
            logger.error('Error saving transcript link:', error);
            throw error;
        }
    }

    static async getGuildTranscripts(guildId) {
        try {
            const query = `
                SELECT * FROM ticket_transcripts
                WHERE guild_id = ?
                ORDER BY created_at DESC
            `;
            
            const [rows] = await db.execute(query, [guildId]);
            return rows;
        } catch (error) {
            logger.error('Error getting guild transcripts:', error);
            throw error;
        }
    }
    
    static async getTicketTranscripts(guildId, ticketNumber) {
        try {
            const query = `
                SELECT * FROM ticket_transcripts
                WHERE guild_id = ? AND ticket_number = ?
                ORDER BY created_at DESC
            `;
            
            const [rows] = await db.execute(query, [guildId, ticketNumber]);
            return rows;
        } catch (error) {
            logger.error('Error getting ticket transcripts:', error);
            throw error;
        }
    }
    
    static async getLatestTicketTranscript(guildId, ticketNumber) {
        try {
            const query = `
                SELECT * FROM ticket_transcripts
                WHERE guild_id = ? AND ticket_number = ?
                ORDER BY created_at DESC
                LIMIT 1
            `;
            
            const [rows] = await db.execute(query, [guildId, ticketNumber]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error getting latest ticket transcript:', error);
            throw error;
        }
    }

    static async deletePanel(panelId) {
        try {
            const [result] = await db.execute(
                'DELETE FROM ticket_panels WHERE id = ?',
                [panelId]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error deleting ticket panel:', error);
            throw error;
        }
    }
}

module.exports = { Tickets };