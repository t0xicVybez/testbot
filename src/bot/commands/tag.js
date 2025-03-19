const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Tags } = require('../../database/tags');
const logger = require('../../utils/logger');

const data = new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Manage auto-response tags')
    .addSubcommand(subcommand =>
        subcommand
            .setName('get')
            .setDescription('Get a tag by name')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('The name of the tag')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List all tags'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('create')
            .setDescription('Create a new tag')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('The name of the tag')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('pattern')
                    .setDescription('Trigger pattern (use * for wildcard)')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('response')
                    .setDescription('The response message')
                    .setRequired(true))
            .addBooleanOption(option =>
                option.setName('regex')
                    .setDescription('Is this pattern a regex? (Default: false)')
                    .setRequired(false)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('delete')
            .setDescription('Delete a tag')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('The name of the tag')
                    .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function execute(interaction) {
    try {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        switch (subcommand) {
            case 'get':
                await handleGetTag(interaction, guildId);
                break;
            case 'list':
                await handleListTags(interaction, guildId);
                break;
            case 'create':
                await handleCreateTag(interaction, guildId);
                break;
            case 'delete':
                await handleDeleteTag(interaction, guildId);
                break;
        }
    } catch (error) {
        logger.error('Error in tag command:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: 'There was an error executing this command!',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: 'There was an error executing this command!',
                ephemeral: true
            });
        }
    }
}

async function handleGetTag(interaction, guildId) {
    const name = interaction.options.getString('name');
    const tag = await Tags.getTagByName(guildId, name);

    if (!tag) {
        return interaction.reply({
            content: `Tag "${name}" not found.`,
            ephemeral: true
        });
    }

    await interaction.reply({
        content: `**Tag: ${tag.name}**\nPattern: \`${tag.pattern}\`\nResponse: ${tag.response}`,
        ephemeral: false
    });
}

async function handleListTags(interaction, guildId) {
    await interaction.deferReply();
    const tags = await Tags.getAllTags(guildId);

    if (tags.length === 0) {
        return interaction.editReply('No tags found for this server.');
    }

    const tagList = tags.map(tag => 
        `**${tag.name}** - Pattern: \`${tag.pattern}\` ${tag.is_regex ? '(Regex)' : ''}${tag.is_enabled ? '' : ' (Disabled)'}`
    ).join('\n');

    await interaction.editReply({
        content: `**Server Tags:**\n${tagList}`,
        ephemeral: false
    });
}

async function handleCreateTag(interaction, guildId) {
    const name = interaction.options.getString('name');
    const pattern = interaction.options.getString('pattern');
    const response = interaction.options.getString('response');
    const isRegex = interaction.options.getBoolean('regex') || false;
    const userId = interaction.user.id;

    // Validate regex if isRegex is true
    if (isRegex) {
        try {
            new RegExp(pattern);
        } catch (e) {
            return interaction.reply({
                content: `Invalid regex pattern: ${e.message}`,
                ephemeral: true
            });
        }
    }

    try {
        const result = await Tags.createTag(guildId, {
            name,
            pattern,
            response,
            is_regex: isRegex,
            created_by: userId
        });

        if (result) {
            await interaction.reply({
                content: `Tag "${name}" created successfully!`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `Failed to create tag "${name}". It might already exist.`,
                ephemeral: true
            });
        }
    } catch (error) {
        logger.error('Error creating tag:', error);
        await interaction.reply({
            content: `Error creating tag: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleDeleteTag(interaction, guildId) {
    const name = interaction.options.getString('name');
    
    const success = await Tags.deleteTag(guildId, name);
    
    if (success) {
        await interaction.reply({
            content: `Tag "${name}" deleted successfully.`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `Tag "${name}" not found.`,
            ephemeral: true
        });
    }
}

const prefix = true;
const name = 'tag';
const description = 'Manage auto-response tags';
const aliases = ['tags', 't'];
const permissions = ['ManageGuild'];

async function executePrefix(message, args) {
    const guildId = message.guild.id;
    
    if (args.length === 0) {
        return message.reply('Usage: !tag <list|get|create|delete> [options]');
    }

    const subcommand = args[0].toLowerCase();
    
    try {
        switch (subcommand) {
            case 'list':
                const tags = await Tags.getAllTags(guildId);
                
                if (tags.length === 0) {
                    return message.reply('No tags found for this server.');
                }
                
                const tagList = tags.map(tag => 
                    `**${tag.name}** - Pattern: \`${tag.pattern}\` ${tag.is_regex ? '(Regex)' : ''}${tag.is_enabled ? '' : ' (Disabled)'}`
                ).join('\n');
                
                return message.reply({
                    content: `**Server Tags:**\n${tagList}`
                });
                
            case 'get':
                if (args.length < 2) return message.reply('Please specify a tag name.');
                const tagName = args[1];
                const tag = await Tags.getTagByName(guildId, tagName);
                
                if (!tag) {
                    return message.reply(`Tag "${tagName}" not found.`);
                }
                
                return message.reply({
                    content: `**Tag: ${tag.name}**\nPattern: \`${tag.pattern}\`\nResponse: ${tag.response}`
                });
                
            case 'create':
                if (args.length < 4) {
                    return message.reply('Usage: !tag create <name> <pattern> <response> [isRegex=false]');
                }
                
                const name = args[1];
                const pattern = args[2];
                const response = args.slice(3).join(' ').replace(/\\n/g, '\n');
                const isRegex = args[args.length - 1].toLowerCase() === 'true';
                
                // Validate regex if isRegex is true
                if (isRegex) {
                    try {
                        new RegExp(pattern);
                    } catch (e) {
                        return message.reply(`Invalid regex pattern: ${e.message}`);
                    }
                }
                
                const result = await Tags.createTag(guildId, {
                    name, 
                    pattern, 
                    response, 
                    is_regex: isRegex,
                    created_by: message.author.id
                });
                
                if (result) {
                    return message.reply(`Tag "${name}" created successfully!`);
                } else {
                    return message.reply(`Failed to create tag "${name}". It might already exist.`);
                }
                
            case 'delete':
                if (args.length < 2) return message.reply('Please specify a tag name to delete.');
                const tagToDelete = args[1];
                const success = await Tags.deleteTag(guildId, tagToDelete);
                
                if (success) {
                    return message.reply(`Tag "${tagToDelete}" deleted successfully.`);
                } else {
                    return message.reply(`Tag "${tagToDelete}" not found.`);
                }
                
            default:
                return message.reply('Unknown subcommand. Use list, get, create, or delete.');
        }
    } catch (error) {
        logger.error('Error in tag command:', error);
        return message.reply('There was an error executing this command!');
    }
}

module.exports = { data, execute, prefix, name, description, aliases, permissions, executePrefix };