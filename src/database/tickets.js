const { db } = require('./database');
const logger = require('../utils/logger');

class Tickets {
    static settingsCache = new Map();
    static categoriesCache = new Map();
    
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
                    log_channel_id: null,
                    default_category_id: null
                };
                
                // Cache the default settings
                this.settingsCache.set(guildId, defaultSettings);
                return defaultSettings;
            }
            
            // Format settings for frontend use
            const settings = {
                is_enabled: rows[0].is_enabled === 1,
                log_channel_id: rows[0].log_channel_id,
                default_category_id: rows[0].default_category_id
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
                        log_channel_id = ?,
                        default_category_id = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE guild_id = ?
                `;
                
                await db.execute(query, [
                    settings.is_enabled ? 1 : 0,
                    settings.log_channel_id,
                    settings.default_category_id,
                    guildId
                ]);
            } else {
                const query = `
                    INSERT INTO ticket_settings (
                        guild_id, 
                        is_enabled, 
                        log_channel_id,
                        default_category_id
                    ) VALUES (?, ?, ?, ?)
                `;
                
                await db.execute(query, [
                    guildId,
                    settings.is_enabled ? 1 : 0,
                    settings.log_channel_id,
                    settings.default_category_id
                ]);
            }
            
            return true;
        } catch (error) {
            logger.error('Error updating ticket settings:', error);
            throw error;
        }
    }

    // Category Management
    static async getCategories(guildId) {
        try {
            // Check cache first
            if (this.categoriesCache.has(guildId)) {
                return this.categoriesCache.get(guildId);
            }
            
            const [rows] = await db.execute(
                'SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY name ASC',
                [guildId]
            );
            
            const categories = rows.map(row => ({
                ...row,
                feedback_enabled: row.feedback_enabled === 1
            }));
            
            // Cache the categories
            this.categoriesCache.set(guildId, categories);
            return categories;
        } catch (error) {
            logger.error('Error getting ticket categories:', error);
            throw error;
        }
    }
    
    static async getCategoryById(categoryId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM ticket_categories WHERE id = ?',
                [categoryId]
            );
            
            if (rows.length === 0) return null;
            
            return {
                ...rows[0],
                feedback_enabled: rows[0].feedback_enabled === 1
            };
        } catch (error) {
            logger.error('Error getting ticket category by ID:', error);
            throw error;
        }
    }
    
    static async createCategory(guildId, categoryData) {
        try {
            // Clear cache
            this.categoriesCache.delete(guildId);
            
            const {
                name,
                description,
                category_id,
                support_role_id,
                welcome_message,
                ticket_name_format,
                feedback_enabled,
                color
            } = categoryData;
            
            const query = `
                INSERT INTO ticket_categories (
                    guild_id,
                    name,
                    description,
                    category_id,
                    support_role_id,
                    welcome_message,
                    ticket_name_format,
                    feedback_enabled,
                    color
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [result] = await db.execute(query, [
                guildId,
                name,
                description,
                category_id,
                support_role_id,
                welcome_message,
                ticket_name_format || 'ticket-{number}',
                feedback_enabled ? 1 : 0,
                color || '#3498DB'
            ]);
            
            return result.insertId;
        } catch (error) {
            logger.error('Error creating ticket category:', error);
            throw error;
        }
    }
    
    static async updateCategory(categoryId, categoryData) {
        try {
            const category = await this.getCategoryById(categoryId);
            if (!category) throw new Error('Category not found');
            
            // Clear cache
            this.categoriesCache.delete(category.guild_id);
            
            const {
                name,
                description,
                category_id,
                support_role_id,
                welcome_message,
                ticket_name_format,
                feedback_enabled,
                color
            } = categoryData;
            
            const query = `
                UPDATE ticket_categories 
                SET 
                    name = ?,
                    description = ?,
                    category_id = ?,
                    support_role_id = ?,
                    welcome_message = ?,
                    ticket_name_format = ?,
                    feedback_enabled = ?,
                    color = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            
            await db.execute(query, [
                name,
                description,
                category_id,
                support_role_id,
                welcome_message,
                ticket_name_format,
                feedback_enabled ? 1 : 0,
                color,
                categoryId
            ]);
            
            return true;
        } catch (error) {
            logger.error('Error updating ticket category:', error);
            throw error;
        }
    }
    
    static async deleteCategory(categoryId) {
        try {
            const category = await this.getCategoryById(categoryId);
            if (!category) throw new Error('Category not found');
            
            // Clear cache
            this.categoriesCache.delete(category.guild_id);
            
            await db.execute('DELETE FROM ticket_categories WHERE id = ?', [categoryId]);
            return true;
        } catch (error) {
            logger.error('Error deleting ticket category:', error);
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
                    category_id,
                    subject,
                    status
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [result] = await db.execute(query, [
                guildId,
                data.channel_id,
                data.creator_id,
                ticket_number,
                data.category_id || null,
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
                'SELECT t.*, c.name as category_name, c.feedback_enabled FROM tickets t LEFT JOIN ticket_categories c ON t.category_id = c.id WHERE t.guild_id = ? AND t.channel_id = ?',
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
                'SELECT t.*, c.name as category_name, c.feedback_enabled FROM tickets t LEFT JOIN ticket_categories c ON t.category_id = c.id WHERE t.id = ?',
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
                'SELECT t.*, c.name as category_name, c.feedback_enabled FROM tickets t LEFT JOIN ticket_categories c ON t.category_id = c.id WHERE t.guild_id = ? AND t.ticket_number = ?',
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
                `SELECT 
                    t.*, 
                    c.name as category_name 
                FROM 
                    tickets t 
                LEFT JOIN 
                    ticket_categories c ON t.category_id = c.id 
                WHERE 
                    t.guild_id = ? AND t.status != "archived" 
                ORDER BY 
                    t.created_at DESC`,
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
                `SELECT 
                    t.*, 
                    c.name as category_name 
                FROM 
                    tickets t 
                LEFT JOIN 
                    ticket_categories c ON t.category_id = c.id 
                WHERE 
                    t.guild_id = ? AND t.creator_id = ? AND t.status != "archived" AND t.status != "closed"`,
                [guildId, userId]
            );
            
            return rows;
        } catch (error) {
            logger.error('Error getting active tickets for user:', error);
            throw error;
        }
    }
    
    // Feedback Management
    static async createFeedback(guildId, ticketId, userId, rating, comments) {
        try {
            // Verify the ticket exists and feedback is enabled for its category
            const ticket = await this.getTicketById(ticketId);
            if (!ticket) throw new Error('Ticket not found');
            
            const category = ticket.category_id ? await this.getCategoryById(ticket.category_id) : null;
            if (!category || !category.feedback_enabled) {
                throw new Error('Feedback is not enabled for this ticket category');
            }
            
            // Check if feedback already exists
            const [existingFeedback] = await db.execute(
                'SELECT id FROM ticket_feedback WHERE ticket_id = ?',
                [ticketId]
            );
            
            if (existingFeedback.length > 0) {
                throw new Error('Feedback has already been submitted for this ticket');
            }
            
            const query = `
                INSERT INTO ticket_feedback (
                    guild_id,
                    ticket_id,
                    user_id,
                    rating,
                    comments
                ) VALUES (?, ?, ?, ?, ?)
            `;
            
            await db.execute(query, [guildId, ticketId, userId, rating, comments]);
            return true;
        } catch (error) {
            logger.error('Error creating ticket feedback:', error);
            throw error;
        }
    }
    
    static async getFeedback(ticketId) {
        try {
            const [rows] = await db.execute(
                'SELECT * FROM ticket_feedback WHERE ticket_id = ?',
                [ticketId]
            );
            
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error('Error getting ticket feedback:', error);
            throw error;
        }
    }
    
    static async getFeedbackStats(guildId, categoryId = null) {
        try {
            let query = `
                SELECT 
                    COUNT(*) as total_feedback,
                    AVG(rating) as average_rating,
                    COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
                    COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
                    COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
                    COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
                    COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
                FROM ticket_feedback f
                JOIN tickets t ON f.ticket_id = t.id
                WHERE f.guild_id = ?
            `;
            
            const params = [guildId];
            
            if (categoryId) {
                query += ' AND t.category_id = ?';
                params.push(categoryId);
            }
            
            const [rows] = await db.execute(query, params);
            
            return {
                total_feedback: rows[0].total_feedback,
                average_rating: parseFloat(rows[0].average_rating) || 0,
                rating_distribution: {
                    five_star: rows[0].five_star,
                    four_star: rows[0].four_star,
                    three_star: rows[0].three_star,
                    two_star: rows[0].two_star,
                    one_star: rows[0].one_star
                }
            };
        } catch (error) {
            logger.error('Error getting feedback stats:', error);
            throw error;
        }
    }
    
    static async getRecentFeedback(guildId, categoryId = null, limit = 10) {
        try {
            let query = `
                SELECT 
                    f.*,
                    t.number as ticket_number,
                    t.title as ticket_title,
                    c.name as category_name
                FROM ticket_feedback f
                JOIN tickets t ON f.ticket_id = t.id
                LEFT JOIN ticket_categories c ON t.category_id = c.id
                WHERE f.guild_id = ?
            `;
            
            const params = [guildId];
            
            if (categoryId) {
                query += ' AND t.category_id = ?';
                params.push(categoryId);
            }
            
            query += ' ORDER BY f.created_at DESC LIMIT ?';
            params.push(limit);
            
            const [rows] = await db.execute(query, params);
            return rows;
        } catch (error) {
            logger.error('Error getting recent feedback:', error);
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
                'SELECT p.*, c.name as category_name FROM ticket_panels p LEFT JOIN ticket_categories c ON p.category_id = c.id WHERE p.guild_id = ? ORDER BY p.created_at DESC',
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
                'SELECT p.*, c.name as category_name FROM ticket_panels p LEFT JOIN ticket_categories c ON p.category_id = c.id WHERE p.id = ?',
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
                created_by,
                category_id
            } = panelData;
            
            // Verify category exists if provided
            if (category_id) {
                const category = await this.getCategoryById(category_id);
                if (!category) throw new Error('Category not found');
            }
            
            const query = `
                INSERT INTO ticket_panels (
                    guild_id,
                    name,
                    channel_id,
                    message_id,
                    title,
                    description,
                    button_text,
                    color,
                    created_by,
                    category_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [result] = await db.execute(query, [
                guildId,
                name,
                channel_id,
                message_id,
                title,
                description,
                button_text || 'Create Ticket',
                color || '#3498DB',
                created_by,
                category_id
            ]);
            
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
                channel_id,
                message_id,
                title,
                description,
                button_text,
                color,
                category_id
            } = panelData;
            
            // Verify category exists if provided
            if (category_id) {
                const category = await this.getCategoryById(category_id);
                if (!category) throw new Error('Category not found');
            }
            
            const query = `
                UPDATE ticket_panels 
                SET 
                    name = ?,
                    channel_id = ?,
                    message_id = ?,
                    title = ?,
                    description = ?,
                    button_text = ?,
                    color = ?,
                    category_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            
            await db.execute(query, [
                name,
                channel_id,
                message_id,
                title,
                description,
                button_text,
                color,
                category_id,
                panelId
            ]);
            
            return true;
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
    
    // Utility method to check if feedback is enabled for a ticket
    static async isFeedbackEnabled(ticketId) {
        try {
            const query = `
                SELECT 
                    tc.feedback_enabled
                FROM 
                    tickets t
                JOIN 
                    ticket_categories tc ON t.category_id = tc.id
                WHERE 
                    t.id = ?
            `;
            
            const [rows] = await db.execute(query, [ticketId]);
            
            if (rows.length === 0) {
                return false; // Ticket or category not found
            }
            
            return rows[0].feedback_enabled === 1;
        } catch (error) {
            logger.error('Error checking if feedback is enabled:', error);
            return false;
        }
    }
    
    // Check if a ticket already has feedback
    static async hasFeedback(ticketId) {
        try {
            const [rows] = await db.execute(
                'SELECT COUNT(*) as count FROM ticket_feedback WHERE ticket_id = ?',
                [ticketId]
            );
            
            return rows[0].count > 0;
        } catch (error) {
            logger.error('Error checking if ticket has feedback:', error);
            return false;
        }
    }
}

module.exports = { Tickets };