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
const discordTranscripts = require('discord-html-transcripts');

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
                // Get the button's custom ID
                const customId = interaction.customId;
                
                // Handle different button types
                if (customId === 'create_ticket') {
                    // Use a proper deferReply so the user sees the bot is processing
                    await interaction.deferReply({ ephemeral: true });
                    await handleCreateTicket(interaction);
                    return;
                }
                
                // Handle ticket management buttons
                if (customId.startsWith('ticket_')) {
                    // For ticket management buttons, we'll defer the update to prevent timeouts
                    // But wrap it in try-catch to handle potential errors gracefully
                    try {
                        await interaction.deferUpdate();
                    } catch (err) {
                        logger.warn(`Failed to defer button interaction update, might be already handled: ${err.message}`);
                        // Continue anyway since we may just need to handle it with followUp
                    }
                    
                    await handleTicketButton(interaction);
                    return;
                }
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
        // Guild ID and user are already available since we deferred the reply
        const guildId = interaction.guildId;
        const user = interaction.user;

        // Check if ticket system is enabled
        const isEnabled = await Tickets.isPluginEnabled(guildId);
        if (!isEnabled) {
            return await interaction.editReply({
                content: 'The ticket system is currently disabled.'
            });
        }

        // Get ticket settings
        const settings = await Tickets.getTicketSettings(guildId);
        if (!settings.category_id || !settings.support_role_id) {
            return await interaction.editReply({
                content: 'The ticket system is not properly configured yet.'
            });
        }

        // Check if user already has an open ticket
        const guild = interaction.guild;
        const category = guild.channels.cache.get(settings.category_id);
        
        if (!category) {
            logger.warn(`Ticket category not found: ${settings.category_id}`);
            return await interaction.editReply({
                content: 'The ticket category could not be found. Please contact an administrator.'
            });
        }

        // Check for existing tickets for this user
        const existingTickets = await Tickets.getActiveTicketsByUser(guildId, user.id);
        if (existingTickets && existingTickets.length > 0) {
            const existingChannel = guild.channels.cache.get(existingTickets[0].channel_id);
            if (existingChannel) {
                return await interaction.editReply({
                    content: `You already have an open ticket: <#${existingChannel.id}>`
                });
            }
        }

        // Get next ticket number - Query all tickets, not just max to ensure we don't reuse numbers
        const [ticketsRows] = await db.execute(
            'SELECT ticket_number FROM tickets WHERE guild_id = ? ORDER BY ticket_number DESC LIMIT 1',
            [guildId]
        );
        
        // If no tickets exist, start at 1, otherwise use max + 1
        const ticketNumber = ticketsRows.length > 0 && ticketsRows[0].ticket_number 
            ? ticketsRows[0].ticket_number + 1 
            : 1;
        
        logger.info(`Creating ticket #${ticketNumber} for guild ${guildId}`);
        
        // Format ticket channel name
        const ticketName = settings.ticket_name_format 
            ? settings.ticket_name_format.replace('{number}', ticketNumber)
            : `ticket-${ticketNumber}`;
        
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
            subject: `Support Ticket #${ticketNumber}`,
            ticket_number: ticketNumber // Explicitly set the ticket number
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
        await interaction.editReply({
            content: `Your ticket has been created: <#${ticketChannel.id}>`
        });
        
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
        logger.error('Error in handleCreateTicket:', error);
        
        try {
            await interaction.editReply({
                content: 'An error occurred while creating your ticket. Please try again later.'
            });
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
            case 'ticket_unclaim':
                await handleUnclaimTicket(interaction, ticket);
                break;
            case 'ticket_close':
                await handleCloseTicket(interaction, ticket);
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
                
                // Update the buttons to include Unclaim option
                const updatedButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('ticket_unclaim')
                            .setLabel('Unclaim Ticket')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔄'),
                        new ButtonBuilder()
                            .setCustomId('ticket_close')
                            .setLabel('Close Ticket')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('🔒')
                    );
                
                await ticketMessage.edit({ 
                    embeds: [newEmbed],
                    components: [updatedButtons]
                }).catch(err => logger.error('Error updating ticket message:', err));
            } catch (embedError) {
                logger.error('Error creating or editing embed:', embedError);
            }
        }
        
        // Send confirmation message
        await interaction.channel.send({
            content: `Ticket claimed by <@${interaction.user.id}>.`,
            allowedMentions: { parse: [] }
        }).catch(err => logger.error('Error sending claim message:', err));
        
        // Send a followup to the user
        await interaction.followUp({
            content: `You have claimed this ticket.`,
            ephemeral: true
        }).catch(err => logger.error('Error sending follow-up:', err));
        
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

async function handleUnclaimTicket(interaction, ticket) {
    try {
        // Can only unclaim if ticket is claimed
        if (ticket.status !== 'claimed') {
            return await interaction.followUp({
                content: 'This ticket is not claimed.',
                ephemeral: true
            }).catch(err => logger.error('Failed to send follow-up:', err));
        }
        
        // Make sure the person trying to unclaim is the one who claimed it or an admin
        if (ticket.assigned_to !== interaction.user.id) {
            // Check if user is admin
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (!isAdmin) {
                return await interaction.followUp({
                    content: `Only the staff member who claimed this ticket (<@${ticket.assigned_to}>) or an administrator can unclaim it.`,
                    ephemeral: true
                }).catch(err => logger.error('Failed to send follow-up:', err));
            }
        }
        
        // Update ticket status in database
        await Tickets.updateTicketStatus(
            interaction.guildId,
            interaction.channelId,
            'open',
            null
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
                
                // Create a new embed with the appropriate fields
                const newEmbed = EmbedBuilder.from(oldEmbed)
                    .setColor(0x3498DB) // Blue for open
                    .spliceFields(1, 1, { name: 'Status', value: '`Open`', inline: true });
                    
                // Remove the "Claimed By" field
                const filteredFields = oldEmbed.fields.filter(field => 
                    field.name !== 'Claimed By'
                );
                
                newEmbed.setFields(filteredFields);
                
                // Update the buttons to standard options
                const updatedButtons = new ActionRowBuilder()
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
                
                await ticketMessage.edit({ 
                    embeds: [newEmbed],
                    components: [updatedButtons]
                }).catch(err => logger.error('Error updating ticket message:', err));
            } catch (embedError) {
                logger.error('Error creating or editing embed:', embedError);
            }
        }
        
        // Send confirmation message
        await interaction.channel.send({
            content: `Ticket unclaimed by <@${interaction.user.id}>. This ticket is now available for any staff member to claim.`,
            allowedMentions: { parse: [] }
        }).catch(err => logger.error('Error sending unclaim message:', err));
        
        // Send a followup to the user
        await interaction.followUp({
            content: `You have unclaimed this ticket.`,
            ephemeral: true
        }).catch(err => logger.error('Error sending follow-up:', err));
        
        // Log to logging channel if set
        await sendTicketLog(
            interaction.client,
            interaction.guildId,
            `Ticket #${ticket.ticket_number} unclaimed by ${interaction.user.tag}`,
            0x3498DB, // Blue
            [{ name: 'Ticket', value: `#${ticket.ticket_number}`, inline: true },
             { name: 'Unclaimed By', value: `<@${interaction.user.id}>`, inline: true }]
        );
    } catch (error) {
        logger.error('Error unclaiming ticket:', error);
        await interaction.followUp({
            content: 'An error occurred while unclaiming the ticket.',
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
        
        // First create the transcript before closing the ticket
        let transcriptUrl = null;
        let transcript = null;
        
        // Send processing message
        await interaction.channel.send({
            content: `📑 Creating transcript and closing ticket...`,
        }).catch(err => logger.error('Error sending processing message:', err));
        
        try {
            // Create transcript
            transcript = await discordTranscripts.createTranscript(interaction.channel, {
                limit: 500, // Max 500 messages
                fileName: `ticket-${ticket.ticket_number}-transcript.html`,
                poweredBy: false,
                saveImages: true,
                footerText: `Transcript created when ticket was closed by ${interaction.user.tag}`,
                returnBuffer: false,
                minify: true,
            }).catch(err => {
                logger.error('Error creating transcript:', err);
                return null;
            });
        } catch (transcriptError) {
            logger.error('Error generating transcript:', transcriptError);
            // Continue with closing even if transcript fails
        }
        
        // Update ticket status in database
        await Tickets.updateTicketStatus(
            interaction.guildId,
            interaction.channelId,
            'closed',
            interaction.user.id
        );
        
        // Only keep the reopen button
        const closeButtons = new ActionRowBuilder()
            .addComponents(
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
                
                await ticketMessage.edit({ embeds: [newEmbed], components: [closeButtons] })
                    .catch(err => logger.error('Error updating ticket message:', err));
            } catch (embedError) {
                logger.error('Error creating or editing embed:', embedError);
            }
        }
        
        // Get ticket creator info
        let creator = null;
        try {
            creator = await interaction.client.users.fetch(ticket.creator_id);
        } catch (userError) {
            logger.error('Error fetching ticket creator:', userError);
        }
        
        // Get ticket settings
        const settings = await Tickets.getTicketSettings(interaction.guildId);
        
        // Handle transcript if it was created successfully
        if (transcript) {
            // Send transcript to the log channel if available
            if (settings.log_channel_id) {
                const logChannel = interaction.client.channels.cache.get(settings.log_channel_id);
                if (logChannel) {
                    const transcriptMessage = await logChannel.send({
                        content: `📑 Transcript for Ticket #${ticket.ticket_number}`,
                        files: [transcript]
                    }).catch(err => {
                        logger.error('Error sending transcript to log channel:', err);
                        return null;
                    });
                    
                    if (transcriptMessage && transcriptMessage.attachments.size > 0) {
                        const attachment = transcriptMessage.attachments.first();
                        transcriptUrl = attachment.url;
                        
                        // Save the URL to the database
                        try {
                            await Tickets.saveTranscriptLink(
                                interaction.guildId,
                                ticket.id,
                                ticket.ticket_number,
                                interaction.user.id,
                                transcriptUrl
                            );
                            logger.info(`Transcript link saved to database for ticket #${ticket.ticket_number}`);
                        } catch (dbError) {
                            logger.error('Error saving transcript link to database:', dbError);
                        }
                    }
                }
            }
            
            // Send transcript to the creator via DM
            if (creator) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle(`Ticket #${ticket.ticket_number} Closed`)
                        .setDescription(`Your ticket in ${interaction.guild.name} has been closed by ${interaction.user.tag}.`)
                        .setTimestamp();
                        
                    await creator.send({
                        embeds: [dmEmbed],
                        files: [transcript]
                    }).catch(err => {
                        logger.warn(`Could not DM transcript to ${creator.tag}: ${err.message}`);
                    });
                } catch (dmError) {
                    logger.warn(`Error sending DM to ticket creator: ${dmError.message}`);
                }
            }
        }
        
        // Send close message
        await interaction.channel.send({
            content: `🔒 This ticket has been closed by <@${interaction.user.id}>.`,
            components: [closeButtons]
        }).catch(err => logger.error('Error sending close message:', err));
        
        // Remove permissions for the ticket creator
        const channel = interaction.channel;
        if (creator) {
            try {
                await channel.permissionOverwrites.edit(creator.id, {
                    ViewChannel: false,
                    SendMessages: false
                }).catch(err => logger.error('Error updating permissions:', err));
            } catch (permError) {
                logger.warn(`Could not update permissions for user ${creator.id}: ${permError.message}`);
            }
        }
        
        // Log to logging channel
        await sendTicketLog(
            interaction.client,
            interaction.guildId,
            `Ticket #${ticket.ticket_number} closed by ${interaction.user.tag}`,
            0xE74C3C, // Red
            [
                { name: 'Ticket', value: `#${ticket.ticket_number}`, inline: true },
                { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Transcript', value: transcriptUrl ? '[View Transcript](' + transcriptUrl + ')' : 'Not available', inline: false }
            ]
        );
        
        // Send a followup to the user
        await interaction.followUp({
            content: `You have closed this ticket. The channel will be deleted in 3 seconds.`,
            ephemeral: true
        }).catch(err => logger.error('Error sending follow-up:', err));
        
        // Delete the channel after a short delay
        setTimeout(async () => {
            try {
                await channel.delete(`Ticket #${ticket.ticket_number} closed by ${interaction.user.tag}`)
                    .catch(err => logger.error('Error deleting channel:', err));
            } catch (deleteError) {
                logger.error('Error deleting ticket channel:', deleteError);
            }
        }, 3000);
    } catch (error) {
        logger.error('Error closing ticket:', error);
        await interaction.followUp({
            content: 'An error occurred while closing the ticket.',
            ephemeral: true
        }).catch(err => logger.error('Failed to send follow-up:', err));
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
        
        // Reply to the interaction
        await interaction.followUp({
            content: `You have reopened this ticket.`,
            ephemeral: true
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

// Helper function to generate and send transcript
async function createTicketTranscript(channel, ticket, creator, user) {
    try {
        // Create transcript
        const transcript = await discordTranscripts.createTranscript(channel, {
            limit: 500, // Max 500 messages
            fileName: `ticket-${ticket.ticket_number}-transcript.html`,
            poweredBy: false,
            saveImages: true,
            footerText: `Transcript created by ${user.tag}`,
            returnBuffer: false,
            minify: true,
        }).catch(err => {
            logger.error('Error creating transcript:', err);
            return null;
        });
        
        if (!transcript) {
            return { success: false, message: 'Failed to create transcript' };
        }
        
        // Get ticket settings to find log channel
        const settings = await Tickets.getTicketSettings(channel.guild.id);
        let transcriptUrl = null;
        
        // Send to log channel if available
        if (settings.log_channel_id) {
            const logChannel = channel.client.channels.cache.get(settings.log_channel_id);
            if (logChannel) {
                const transcriptMsg = await logChannel.send({
                    content: `📑 Transcript for Ticket #${ticket.ticket_number}`,
                    files: [transcript]
                }).catch(err => {
                    logger.error('Error sending transcript to log channel:', err);
                    return null;
                });
                
                if (transcriptMsg && transcriptMsg.attachments.size > 0) {
                    const attachment = transcriptMsg.attachments.first();
                    transcriptUrl = attachment.url;
                    
                    // Save to database
                    await Tickets.saveTranscriptLink(
                        channel.guild.id,
                        ticket.id,
                        ticket.ticket_number,
                        user.id,
                        transcriptUrl
                    ).catch(err => logger.error('Error saving transcript to database:', err));
                }
            }
        }
        
        // Send to creator via DM
        if (creator) {
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle(`Ticket #${ticket.ticket_number} Transcript`)
                    .setDescription(`Here is a transcript of your ticket in ${channel.guild.name}.`)
                    .setTimestamp();
                    
                await creator.send({
                    embeds: [dmEmbed],
                    files: [transcript]
                }).catch(err => {
                    logger.warn(`Could not DM transcript to ${creator.tag}: ${err.message}`);
                });
            } catch (dmError) {
                logger.warn(`Error sending DM to ticket creator: ${dmError.message}`);
            }
        }
        
        return { 
            success: true, 
            transcript, 
            transcriptUrl 
        };
    } catch (error) {
        logger.error('Error in createTicketTranscript:', error);
        return { success: false, message: error.message };
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