const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option =>
        option.setName('target')
            .setDescription('The member to kick')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('The reason for kicking'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

async function execute(interaction) {
    try {
        const target = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target) {
            return interaction.reply({
                content: 'Please provide a valid member to kick.',
                ephemeral: true
            });
        }

        if (!target.kickable) {
            return interaction.reply({
                content: 'I cannot kick this member.',
                ephemeral: true
            });
        }

        await target.kick(reason);
        await interaction.reply({
            content: `Successfully kicked ${target.user.tag} for: ${reason}`,
            ephemeral: true
        });

        // Log the kick action
        const settings = await Guilds.getGuildSettings(interaction.guild.id);
        if (settings.settings.mod_log_channel_id) {
            const logChannel = interaction.guild.channels.cache.get(settings.settings.mod_log_channel_id);
            if (logChannel) {
                await logChannel.send({
                    content: `👢 ${target.user.tag} was kicked by ${interaction.user.tag}\nReason: ${reason}`
                });
            }
        }
    } catch (error) {
        logger.error('Error executing kick command:', error);
        await interaction.reply({
            content: 'There was an error executing this command!',
            ephemeral: true
        });
    }
}

const prefix = true;
const name = 'kick';
const description = 'Kick a member from the server';
const aliases = ['k'];
const permissions = ['KickMembers'];

async function executePrefix(message, args) {
    try {
        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!target) {
            return message.reply('Please provide a valid member to kick.');
        }

        if (!target.kickable) {
            return message.reply('I cannot kick this member.');
        }

        await target.kick(reason);
        await message.reply(`Successfully kicked ${target.user.tag} for: ${reason}`);

        // Log the kick action
        const settings = await Guilds.getGuildSettings(message.guild.id);
        if (settings.settings.mod_log_channel_id) {
            const logChannel = message.guild.channels.cache.get(settings.settings.mod_log_channel_id);
            if (logChannel) {
                await logChannel.send({
                    content: `👢 ${target.user.tag} was kicked by ${message.author.tag}\nReason: ${reason}`
                });
            }
        }
    } catch (error) {
        logger.error('Error executing kick command:', error);
        await message.reply('There was an error executing this command!');
    }
}

module.exports = { data, execute, prefix, name, description, aliases, permissions, executePrefix }; 