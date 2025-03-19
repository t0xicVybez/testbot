// This module provides functions for tracking and retrieving analytics data
// from the database.
const { db } = require('./database');
const logger = require('../utils/logger');

class Analytics {
    // Store a new event
    static async trackEvent(guildId, eventType, data = {}) {
        try {
            const query = `
                INSERT INTO analytics_events (
                    guild_id,
                    event_type,
                    event_data,
                    timestamp
                ) VALUES (?, ?, ?, NOW())
            `;
            
            await db.execute(query, [
                guildId,
                eventType,
                JSON.stringify(data)
            ]);
            
            return true;
        } catch (error) {
            logger.error('Error tracking analytics event:', error);
            return false;
        }
    }
    
    // Get command usage statistics
    static async getCommandStats(guildId, timeRange = '7d') {
        try {
            let timeFilter = '';
            
            switch(timeRange) {
                case '24h':
                    timeFilter = 'AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 DAY)';
                    break;
                case '7d':
                    timeFilter = 'AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
                    break;
                case '30d':
                    timeFilter = 'AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
                    break;
                case 'all':
                default:
                    timeFilter = '';
                    break;
            }
            
            const query = `
                SELECT 
                    event_data->>'$.commandName' as command_name,
                    COUNT(*) as count
                FROM analytics_events
                WHERE guild_id = ?
                AND event_type = 'command_used'
                ${timeFilter}
                GROUP BY command_name
                ORDER BY count DESC
            `;
            
            const [rows] = await db.execute(query, [guildId]);
            return rows;
        } catch (error) {
            logger.error('Error getting command stats:', error);
            throw error;
        }
    }
    
    // Get member activity statistics
    static async getMemberActivity(guildId, timeRange = '7d') {
        try {
            let timeFilter = '';
            
            switch(timeRange) {
                case '24h':
                    timeFilter = 'AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 DAY)';
                    break;
                case '7d':
                    timeFilter = 'AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
                    break;
                case '30d':
                    timeFilter = 'AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
                    break;
                case 'all':
                default:
                    timeFilter = '';
                    break;
            }
            
            const query = `
                SELECT 
                    event_data->>'$.userId' as user_id,
                    COUNT(*) as activity_count
                FROM analytics_events
                WHERE guild_id = ?
                AND event_type IN ('message_sent', 'command_used', 'voice_joined')
                ${timeFilter}
                GROUP BY user_id
                ORDER BY activity_count DESC
                LIMIT 10
            `;
            
            const [rows] = await db.execute(query, [guildId]);
            return rows;
        } catch (error) {
            logger.error('Error getting member activity:', error);
            throw error;
        }
    }
    
    // Get daily activity breakdown
    static async getDailyActivity(guildId, timeRange = '7d') {
        try {
            let days = 7;
            
            switch(timeRange) {
                case '24h':
                    days = 1;
                    break;
                case '7d':
                    days = 7;
                    break;
                case '30d':
                    days = 30;
                    break;
                case 'all':
                default:
                    days = 30; // Default to 30 days for "all time" to limit data points
                    break;
            }
            
            const query = `
                SELECT 
                    DATE(timestamp) as date,
                    COUNT(*) as event_count,
                    event_type
                FROM analytics_events
                WHERE guild_id = ?
                AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY DATE(timestamp), event_type
                ORDER BY date
            `;
            
            const [rows] = await db.execute(query, [guildId, days]);
            
            // Process data for charting
            const dates = [...new Set(rows.map(row => row.date))].sort();
            const eventTypes = [...new Set(rows.map(row => row.event_type))];
            
            const result = {
                labels: dates,
                datasets: eventTypes.map(type => {
                    const data = dates.map(date => {
                        const match = rows.find(row => row.date === date && row.event_type === type);
                        return match ? match.event_count : 0;
                    });
                    
                    return {
                        label: type.replace('_', ' ').toUpperCase(),
                        data: data
                    };
                })
            };
            
            return result;
        } catch (error) {
            logger.error('Error getting daily activity:', error);
            throw error;
        }
    }
    
    // Get overall server statistics
    static async getServerStats(guildId) {
        try {
            // Get total events
            const [totalEvents] = await db.execute(
                'SELECT COUNT(*) as count FROM analytics_events WHERE guild_id = ?',
                [guildId]
            );
            
            // Get commands used
            const [commandsUsed] = await db.execute(
                'SELECT COUNT(*) as count FROM analytics_events WHERE guild_id = ? AND event_type = "command_used"',
                [guildId]
            );
            
            // Get unique users
            const [uniqueUsers] = await db.execute(
                `SELECT COUNT(DISTINCT event_data->>'$.userId') as count 
                FROM analytics_events 
                WHERE guild_id = ?`,
                [guildId]
            );
            
            // Get most active day
            const [mostActiveDay] = await db.execute(
                `SELECT 
                    DATE(timestamp) as date,
                    COUNT(*) as count
                FROM analytics_events
                WHERE guild_id = ?
                GROUP BY DATE(timestamp)
                ORDER BY count DESC
                LIMIT 1`,
                [guildId]
            );
            
            return {
                totalEvents: totalEvents[0].count,
                commandsUsed: commandsUsed[0].count,
                uniqueUsers: uniqueUsers[0].count,
                mostActiveDay: mostActiveDay[0] || { date: 'N/A', count: 0 }
            };
        } catch (error) {
            logger.error('Error getting server stats:', error);
            throw error;
        }
    }
}

module.exports = { Analytics };