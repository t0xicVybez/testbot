const { EmbedBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Tickets } = require('../../database/tickets');
const logger = require('../../utils/logger');

module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user) {
        try {
            // Ignore bot reactions
            if (user.bot) return;
            
            // Check if the reaction is partial
            if (reaction.partial) {
                // Fetch the message to get all reactions
                try {
                    await reaction.fetch();
                } catch (error) {
                    logger.error('Error fetching reaction:', error);
                    return;
                }
            }
            
            // Check if reaction is on a ticket panel message (we'd need to store these message IDs)
            // For now, we'll just check if it's a "🎫" emoji as an example
            if (reaction.emoji.name === '🎫') {
                logger.info(`User ${user.tag} reacted with ticket emoji`);
                
                // Check if tickets plugin is enabled for this guild
                const guildId = reaction.message.guild.id;
                const isEnabled = await Tickets.isPluginEnabled(guildId);
                
                if (!isEnabled) {
                    logger.info(`Tickets plugin not enabled for guild ${guildId}`);
                    return;
                }
                
                // Get ticket settings
                const settings = await Tickets.getTicketSettings(guildId);
                
                if (!settings.category_id || !settings.support_role_id) {
                    logger.warn(`Ticket settings not configured for guild ${guildId}`);
                    return;
                }
                
                // Check if user already has an open ticket
                const guild = reaction.message.guild;
                const category = guild.channels.cache.get(settings.category_id);
                
                if (!category) {
                    logger.warn(`Ticket category not found: ${settings.category_id}`);
                    return;
                }
                
                // Check if user has permissions to create a ticket
                const member = await guild.members.fetch(user.id);
                
                // Get next ticket number
                const [maxTicketRows] = await db.execute(
                    'SELECT MAX(ticket_number) as max_number FROM tickets WHERE guild_id = ?',
                    [guildId]
                );
                
                const ticketNumber = maxTicketRows[0].max_number ? maxTicketRows[0].max_number + 1 : 1;
                
                // Format ticket channel name
                const ticketName = settings.ticket_name_format.replace('{number}', ticketNumber);
                
                try {
                    // Create the ticket channel
                    const ticketChannel = await guild.channels.create({
                        name: ticketName,
                        type: ChannelType.GuildText,
                        parent: category,
                        permissionOverwrites: [
                            // Default permissions (hide from everyone)
                            {
                                id: guild.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            // Allow the creator to see the channel
                            {
                                id: user.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                            },
                            // Allow support role to see and manage the channel
                            {
                                id: settings.support_role_id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
                            },
                            // Allow the bot to see and manage the channel
                            {
                                id: guild.client.user.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks]
                            }
                        ]
                    });
                    
                    logger.info(`Created ticket channel: ${ticketChannel.name} (${ticketChannel.id})`);
                    
                    // Create ticket in database
                    const ticketData = {
                        channel_id: ticketChannel.id,
                        creator_id: user.id,
                        subject: `Support Ticket #${ticketNumber}`
                    };
                    
                    await Tickets.createTicket(guildId, ticketData);
                    
                    // Create buttons for ticket actions
                    const buttons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('ticket_claim')
                                .setLabel('Claim Ticket')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('👋'),
                            new ButtonBuilder()
                                .setCustomId('ticket_close')
                                .setLabel('Close Ticket')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🔒')
                        );
                    
                    // Send welcome message to ticket channel
                    const welcomeEmbed = new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle(`Ticket #${ticketNumber}`)
                        .setDescription(settings.welcome_message || 'Thank you for creating a support ticket. Please describe your issue, and a staff member will assist you shortly.')
                        .addFields(
                            { name: 'Created By', value: `<@${user.id}>`, inline: true },
                            { name: 'Status', value: '`Open`', inline: true }
                        )
                        .setFooter({ text: 'Support Ticket System' })
                        .setTimestamp();
                    
                    await ticketChannel.send({ 
                        content: `<@${user.id}> <@&${settings.support_role_id}>`,
                        embeds: [welcomeEmbed],
                        components: [buttons]
                    });
                    
                    // Send confirmation to user via DM if possible
                    try {
                        await user.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0x3498DB)
                                    .setTitle('Ticket Created')
                                    .setDescription(`Your ticket has been created in ${guild.name}.\nChannel: <#${ticketChannel.id}>`)
                                    .setFooter({ text: 'Support Ticket System' })
                            ]
                        });
                    } catch (dmError) {
                        logger.warn(`Could not send DM to user ${user.tag}: ${dmError.message}`);
                    }
                    
                    // Log ticket creation if log channel is set
                    if (settings.log_channel_id) {
                        const logChannel = guild.channels.cache.get(settings.log_channel_id);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor(0x3498DB)
                                .setTitle('Ticket Created')
                                .setDescription(`A new support ticket has been created`)
                                .addFields(
                                    { name: 'Ticket', value: `#${ticketNumber} (<#${ticketChannel.id}>)`, inline: true },
                                    { name: 'Created By', value: `<@${user.id}>`, inline: true }
                                )
                                .setFooter({ text: 'Support Ticket System' })
                                .setTimestamp();
                            
                            await logChannel.send({ embeds: [logEmbed] });
                        }
                    }
                } catch (error) {
                    logger.error('Error creating ticket channel:', error);
                    
                    // Try to notify the user
                    try {
                        await user.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xFF0000)
                                    .setTitle('Ticket Creation Failed')
                                    .setDescription(`There was an error creating your ticket in ${guild.name}.\nPlease contact a server administrator.`)
                                    .setFooter({ text: 'Support Ticket System' })
                            ]
                        });
                    } catch (dmError) {
                        logger.warn(`Could not send error DM to user ${user.tag}: ${dmError.message}`);
                    }
                }
            }
        } catch (error) {
            logger.error('Error in messageReactionAdd event:', error);
        }
    }
};