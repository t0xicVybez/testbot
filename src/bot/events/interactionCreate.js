const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits, 
    ChannelType 
} = require('discord.js');
const { Tickets } = require('../../database/tickets');
const { Guilds } = require('../../database/guilds');
const { db } = require('../../database/database');
const logger = require('../../utils/logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) return;

                try {
                    // Check if command is enabled for this guild
                    if (interaction.guildId) {
                        const isEnabled = await Guilds.isCommandEnabled(
                            interaction.guildId,
                            interaction.commandName,
                            'slash'
                        );

                        if (!isEnabled) {
                            return interaction.reply({
                                content: 'This command is disabled in this server.',
                                ephemeral: true
                            }).catch(err => logger.error('Failed to reply:', err));
                        }
                    }

                    await command.execute(interaction);
                } catch (error) {
                    logger.error('Error executing command:', error);
                    const errorMessage = 'There was an error executing this command.';
                    
                    try {
                        if (interaction.replied || interaction.deferred) {
                            await interaction.followUp({ content: errorMessage, ephemeral: true });
                        } else {
                            await interaction.reply({ content: errorMessage, ephemeral: true });
                        }
                    } catch (replyError) {
                        logger.error('Error sending command error message:', replyError);
                    }
                }
                return;
            }
            
            // Handle button interactions
            if (interaction.isButton()) {
                // Immediately defer the update to prevent interaction timeout
                await interaction.deferUpdate().catch(error => {
                    logger.warn('Failed to defer button interaction update:', error);
                });
                
                // Ticket creation button
                if (interaction.customId === 'create_ticket') {
                    await handleCreateTicket(interaction);
                    return;
                }
                
                // Handle ticket management buttons
                if (interaction.customId.startsWith('ticket_')) {
                    await handleTicketButton(interaction);
                    return;
                }
                
                // Handle other buttons (if any)
                // ...
            }
            
            // Handle other interaction types if needed
            // ...
            
        } catch (error) {
            logger.error('Error in interactionCreate event:', error);
            
            try {
                const errorResponse = 'An error occurred while processing this interaction.';
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorResponse, ephemeral: true })
                        .catch(err => logger.error('Failed to follow up with error:', err));
                } else {
                    await interaction.reply({ content: errorResponse, ephemeral: true })
                        .catch(err => logger.error('Failed to reply with error:', err));
                }
            } catch (replyError) {
                logger.error('Error replying to interaction error:', replyError);
            }
        }
    }
};

async function handleCreateTicket(interaction) {
    try {
        // Guild ID and user are already available since we deferred the update
        const guildId = interaction.guildId;
        const user = interaction.user;

        // Check if ticket system is enabled
        const isEnabled = await Tickets.isPluginEnabled(guildId);
        if (!isEnabled) {
            return await interaction.followUp({
                content: 'The ticket system is currently disabled.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }

        // Get ticket settings
        const settings = await Tickets.getTicketSettings(guildId);
        if (!settings.category_id || !settings.support_role_id) {
            return await interaction.followUp({
                content: 'The ticket system is not properly configured yet.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }

        // Check if user already has an open ticket
        const guild = interaction.guild;
        const category = guild.channels.cache.get(settings.category_id);
        
        if (!category) {
            logger.warn(`Ticket category not found: ${settings.category_id}`);
            return await interaction.followUp({
                content: 'The ticket category could not be found. Please contact an administrator.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }

        // Check for existing tickets for this user
        const existingTickets = await Tickets.getActiveTicketsByUser(guildId, user.id);
        if (existingTickets && existingTickets.length > 0) {
            const existingChannel = guild.channels.cache.get(existingTickets[0].channel_id);
            if (existingChannel) {
                return await interaction.followUp({
                    content: `You already have an open ticket: <#${existingChannel.id}>`,
                    ephemeral: true
                }).catch(err => logger.error('Failed to send follow-up:', err));
            }
        }

        // Get next ticket number
        const [maxTicketRows] = await db.execute(
            'SELECT MAX(ticket_number) as max_number FROM tickets WHERE guild_id = ?',
            [guildId]
        );
        
        const ticketNumber = maxTicketRows[0].max_number ? maxTicketRows[0].max_number + 1 : 1;
        
        // Format ticket channel name
        const ticketName = settings.ticket_name_format 
            ? settings.ticket_name_format.replace('{number}', ticketNumber)
            : `ticket-${ticketNumber}`;
        
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
            }).catch(err => logger.error('Error sending welcome message:', err));
            
            // Reply to the user with confirmation
            await interaction.followUp({
                content: `Your ticket has been created: <#${ticketChannel.id}>`,
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
            
            // Log ticket creation if log channel is set
            if (settings.log_channel_id) {
                try {
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
                        
                        await logChannel.send({ embeds: [logEmbed] })
                            .catch(err => logger.error('Error sending log message:', err));
                    }
                } catch (logError) {
                    logger.error('Error sending ticket creation log:', logError);
                }
            }
        } catch (error) {
            logger.error('Error creating ticket channel:', error);
            
            await interaction.followUp({
                content: 'There was an error creating your ticket. Please try again later or contact an administrator.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }
    } catch (error) {
        logger.error('Error in handleCreateTicket:', error);
        
        try {
            await interaction.followUp({
                content: 'An error occurred while creating your ticket. Please try again later.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send error follow-up:', err));
        } catch (replyError) {
            logger.error('Error replying to ticket creation:', replyError);
        }
    }
}

async function handleTicketButton(interaction) {
    try {
        const { customId, channelId, guildId, user } = interaction;
        
        // Get ticket from database
        const ticket = await Tickets.getTicket(guildId, channelId);
        if (!ticket) {
            return await interaction.followUp({
                content: 'This channel is not a valid ticket.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }
        
        // Get ticket settings
        const settings = await Tickets.getTicketSettings(guildId);
        
        // Check if user has permission to manage tickets (either support role or admin)
        const member = await interaction.guild.members.fetch(user.id);
        const hasPermission = member.roles.cache.has(settings.support_role_id) || 
                            member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (!hasPermission && user.id !== ticket.creator_id) {
            return await interaction.followUp({
                content: 'You do not have permission to manage this ticket.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }
        
        switch (customId) {
            case 'ticket_claim':
                await handleClaimTicket(interaction, ticket);
                break;
            case 'ticket_close':
                await handleCloseTicket(interaction, ticket);
                break;
            case 'ticket_delete':
                await handleDeleteTicket(interaction, ticket);
                break;
            case 'ticket_transcript':
                await handleTicketTranscript(interaction, ticket);
                break;
            case 'ticket_reopen':
                await handleReopenTicket(interaction, ticket);
                break;
        }
    } catch (error) {
        logger.error('Error in handleTicketButton:', error);
        await interaction.followUp({
            content: 'An error occurred while processing this action.',
            ephemeral: true
        }).catch(err => logger.error('Failed to send follow-up:', err));
    }
}

async function handleClaimTicket(interaction, ticket) {
    try {
        // Prevent claiming if ticket is already closed
        if (ticket.status === 'closed') {
            return await interaction.followUp({
                content: 'This ticket is already closed and cannot be claimed.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }
        
        // Prevent claiming if already claimed by someone else
        if (ticket.status === 'claimed' && ticket.assigned_to && ticket.assigned_to !== interaction.user.id) {
            return await interaction.followUp({
                content: `This ticket is already claimed by <@${ticket.assigned_to}>.`,
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }
        
        // Update ticket status in database
        await Tickets.updateTicketStatus(
            interaction.guildId,
            interaction.channelId,
            'claimed',
            interaction.user.id
        );
        
        // Update the embed in the channel
        const messagesCollection = await interaction.channel.messages.fetch({ limit: 10 })
            .catch(err => {
                logger.error('Error fetching messages:', err);
                return { filter: () => new Map() };
            });
            
        const botMessages = messagesCollection.filter(m => 
            m.author && m.author.id === interaction.client.user.id);
        
        // Look for the initial ticket message with embed
        let ticketMessage = null;
        for (const [_, message] of botMessages) {
            if (message.embeds && message.embeds.length > 0 && message.embeds[0].title && message.embeds[0].title.includes('Ticket')) {
                ticketMessage = message;
                break;
            }
        }
        
        if (ticketMessage) {
            try {
                const oldEmbed = ticketMessage.embeds[0];
                
                const newEmbed = EmbedBuilder.from(oldEmbed)
                    .setColor(0x9B59B6) // Purple for claimed
                    .spliceFields(1, 1, { name: 'Status', value: '`Claimed`', inline: true })
                    .addFields({ name: 'Claimed By', value: `<@${interaction.user.id}>`, inline: true });
                
                await ticketMessage.edit({ embeds: [newEmbed] })
                    .catch(err => logger.error('Error updating ticket message:', err));
            } catch (embedError) {
                logger.error('Error creating or editing embed:', embedError);
            }
        }
        
        // Send confirmation
        await interaction.editReply({
            content: `Ticket claimed by <@${interaction.user.id}>.`,
            components: []
        }).catch(err => {
            logger.error('Error editing reply:', err);
            // Try follow-up as fallback
            interaction.followUp({
                content: `Ticket claimed by <@${interaction.user.id}>.`,
                allowedMentions: { parse: [] }
            }).catch(e => logger.error('Failed to send follow-up after edit error:', e));
        });
        
        // Log to logging channel if set
        await sendTicketLog(
            interaction.client,
            interaction.guildId,
            `Ticket #${ticket.ticket_number} claimed by ${interaction.user.tag}`,
            0x9B59B6, // Purple
            [{ name: 'Ticket', value: `#${ticket.ticket_number}`, inline: true },
             { name: 'Claimed By', value: `<@${interaction.user.id}>`, inline: true }]
        );
    } catch (error) {
        logger.error('Error claiming ticket:', error);
        await interaction.followUp({
            content: 'An error occurred while claiming the ticket.',
            ephemeral: true
        }).catch(err => logger.error('Failed to send follow-up:', err));
    }
}

async function handleCloseTicket(interaction, ticket) {
    try {
        // Can't close an already closed ticket
        if (ticket.status === 'closed') {
            return await interaction.followUp({
                content: 'This ticket is already closed.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }
        
        // Update ticket status in database
        await Tickets.updateTicketStatus(
            interaction.guildId,
            interaction.channelId,
            'closed',
            interaction.user.id
        );
        
        // Create close buttons
        const closeButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_delete')
                    .setLabel('Delete Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('ticket_transcript')
                    .setLabel('Save Transcript')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📑'),
                new ButtonBuilder()
                    .setCustomId('ticket_reopen')
                    .setLabel('Reopen Ticket')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🔓')
            );
        
        // Update the embed in the channel
        const messagesCollection = await interaction.channel.messages.fetch({ limit: 10 })
            .catch(err => {
                logger.error('Error fetching messages:', err);
                return { filter: () => new Map() };
            });
            
        const botMessages = messagesCollection.filter(m => 
            m.author && m.author.id === interaction.client.user.id);
        
        // Look for the initial ticket message with embed
        let ticketMessage = null;
        for (const [_, message] of botMessages) {
            if (message.embeds && message.embeds.length > 0 && message.embeds[0].title && message.embeds[0].title.includes('Ticket')) {
                ticketMessage = message;
                break;
            }
        }
        
        if (ticketMessage) {
            try {
                const oldEmbed = ticketMessage.embeds[0];
                
                const newEmbed = EmbedBuilder.from(oldEmbed)
                    .setColor(0xE74C3C) // Red for closed
                    .spliceFields(1, 1, { name: 'Status', value: '`Closed`', inline: true })
                    .addFields({ name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true })
                    .setTimestamp();
                
                await ticketMessage.edit({ embeds: [newEmbed], components: [] })
                    .catch(err => logger.error('Error updating ticket message:', err));
            } catch (embedError) {
                logger.error('Error creating or editing embed:', embedError);
            }
        }
        
        // Send close message
        await interaction.channel.send({
            content: `🔒 This ticket has been closed by <@${interaction.user.id}>.`,
            components: [closeButtons]
        }).catch(err => logger.error('Error sending close message:', err));
        
        // Update the original interaction
        await interaction.editReply({
            components: [] // Remove buttons from original interaction
        }).catch(err => logger.error('Error editing reply:', err));
        
        // Remove permissions for the ticket creator
        const channel = interaction.channel;
        const ticketCreator = ticket.creator_id;
        
        try {
            await channel.permissionOverwrites.edit(ticketCreator, {
                ViewChannel: false,
                SendMessages: false
            }).catch(err => logger.error('Error updating permissions:', err));
        } catch (permError) {
            logger.warn(`Could not update permissions for user ${ticketCreator}: ${permError.message}`);
        }
        
        // Log to logging channel if set
        await sendTicketLog(
            interaction.client,
            interaction.guildId,
            `Ticket #${ticket.ticket_number} closed by ${interaction.user.tag}`,
            0xE74C3C, // Red
            [{ name: 'Ticket', value: `#${ticket.ticket_number}`, inline: true },
             { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true }]
        );
    } catch (error) {
        logger.error('Error closing ticket:', error);
        await interaction.followUp({
            content: 'An error occurred while closing the ticket.',
            ephemeral: true
        }).catch(err => logger.error('Failed to send follow-up:', err));
    }
}

async function handleDeleteTicket(interaction, ticket) {
    try {
        // Send confirmation message to the channel
        await interaction.channel.send({
            content: '⚠️ This ticket will be deleted in 5 seconds...',
        }).catch(err => logger.error('Error sending delete message:', err));
        
        // Update original interaction
        await interaction.editReply({
            components: [] // Remove buttons from original interaction
        }).catch(err => logger.error('Error editing reply:', err));
        
        // Log to logging channel before deleting
        await sendTicketLog(
            interaction.client,
            interaction.guildId,
            `Ticket #${ticket.ticket_number} deleted by ${interaction.user.tag}`,
            0x000000, // Black
            [{ name: 'Ticket', value: `#${ticket.ticket_number}`, inline: true },
             { name: 'Subject', value: ticket.subject || 'No subject', inline: true },
             { name: 'Deleted By', value: `<@${interaction.user.id}>`, inline: true }]
        );
        
        // Give a short delay before deleting
        setTimeout(async () => {
            try {
                // Delete from database first
                await Tickets.deleteTicket(interaction.guildId, interaction.channelId)
                    .catch(err => logger.error('Error deleting ticket from database:', err));
                
                // Then delete the channel
                await interaction.channel.delete(`Ticket deleted by ${interaction.user.tag}`)
                    .catch(err => logger.error('Error deleting channel:', err));
            } catch (deleteError) {
                logger.error('Error during ticket deletion:', deleteError);
                await interaction.channel.send('Error deleting this ticket. Please try again or contact an administrator.')
                    .catch(err => logger.error('Error sending error message:', err));
            }
        }, 5000);
    } catch (error) {
        logger.error('Error handling ticket deletion:', error);
    }
}

async function handleReopenTicket(interaction, ticket) {
    try {
        // Can only reopen closed tickets
        if (ticket.status !== 'closed') {
            return await interaction.followUp({
                content: 'This ticket is not closed.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }
        
        // Update ticket status in database
        await Tickets.updateTicketStatus(
            interaction.guildId,
            interaction.channelId,
            'open'
        );
        
        // Create buttons for open ticket
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
        
        // Update the embed in the channel
        const messagesCollection = await interaction.channel.messages.fetch({ limit: 10 })
            .catch(err => {
                logger.error('Error fetching messages:', err);
                return { filter: () => new Map() };
            });
            
        const botMessages = messagesCollection.filter(m => 
            m.author && m.author.id === interaction.client.user.id);
        
        // Look for the initial ticket message with embed
        let ticketMessage = null;
        for (const [_, message] of botMessages) {
            if (message.embeds && message.embeds.length > 0 && message.embeds[0].title && message.embeds[0].title.includes('Ticket')) {
                ticketMessage = message;
                break;
            }
        }
        
        if (ticketMessage) {
            try {
                const oldEmbed = ticketMessage.embeds[0];
                
                const newEmbed = EmbedBuilder.from(oldEmbed)
                    .setColor(0x3498DB) // Blue for open
                    .spliceFields(1, 1, { name: 'Status', value: '`Open`', inline: true });
                    
                // Remove any "Claimed By" or "Closed By" fields
                const filteredFields = oldEmbed.fields.filter(field => 
                    field.name !== 'Claimed By' && field.name !== 'Closed By'
                );
                
                newEmbed.setFields(filteredFields);
                
                await ticketMessage.edit({ embeds: [newEmbed], components: [buttons] })
                    .catch(err => logger.error('Error updating ticket message:', err));
            } catch (embedError) {
                logger.error('Error creating or editing embed:', embedError);
            }
        }
        
        // Restore permissions for the ticket creator
        const channel = interaction.channel;
        const ticketCreator = ticket.creator_id;
        
        try {
            await channel.permissionOverwrites.edit(ticketCreator, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            }).catch(err => logger.error('Error updating permissions:', err));
        } catch (permError) {
            logger.warn(`Could not update permissions for user ${ticketCreator}: ${permError.message}`);
        }
        
        // Send reopen message
        await interaction.channel.send({
            content: `🔓 This ticket has been reopened by <@${interaction.user.id}>.`
        }).catch(err => logger.error('Error sending reopen message:', err));
        
        // Update original interaction
        await interaction.editReply({
            components: [] // Remove buttons from original interaction
        }).catch(err => logger.error('Error editing reply:', err));
        
        // Log to logging channel if set
        await sendTicketLog(
            interaction.client,
            interaction.guildId,
            `Ticket #${ticket.ticket_number} reopened by ${interaction.user.tag}`,
            0x3498DB, // Blue
            [{ name: 'Ticket', value: `#${ticket.ticket_number}`, inline: true },
             { name: 'Reopened By', value: `<@${interaction.user.id}>`, inline: true }]
        );
    } catch (error) {
        logger.error('Error reopening ticket:', error);
        await interaction.followUp({
            content: 'An error occurred while reopening the ticket.',
            ephemeral: true
        }).catch(err => logger.error('Failed to send follow-up:', err));
    }
}

async function handleTicketTranscript(interaction, ticket) {
    try {
        // Send transcript message
        await interaction.channel.send({
            content: '📑 Creating transcript...',
        }).catch(err => logger.error('Error sending transcript message:', err));
        
        // Update original interaction
        await interaction.editReply({
            components: [] // Remove buttons from original interaction
        }).catch(err => logger.error('Error editing reply:', err));
        
        // Simulate transcript creation with a delay
        setTimeout(async () => {
            await interaction.channel.send({
                content: 'Transcript functionality is still in development. This would create a transcript of all messages in this ticket.',
            }).catch(err => logger.error('Error sending transcript follow-up:', err));
        }, 2000);
    } catch (error) {
        logger.error('Error creating transcript:', error);
    }
}

// Helper function to send logs to the log channel
async function sendTicketLog(client, guildId, title, color, fields) {
    try {
        const settings = await Tickets.getTicketSettings(guildId);
        
        if (!settings || !settings.log_channel_id) {
            return;
        }
        
        const logChannel = client.channels.cache.get(settings.log_channel_id);
        if (!logChannel) {
            logger.warn(`Log channel ${settings.log_channel_id} not found`);
            return;
        }
        
        const logEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .addFields(fields)
            .setFooter({ text: 'Support Ticket System' })
            .setTimestamp();
        
        await logChannel.send({ embeds: [logEmbed] })
            .catch(err => logger.error('Error sending log message:', err));
    } catch (error) {
        logger.error('Error sending ticket log:', error);
    }
}