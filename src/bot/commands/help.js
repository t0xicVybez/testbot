const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Guilds } = require('../../database/guilds');

const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all commands or info about a specific command')
    .addStringOption(option =>
        option.setName('command')
            .setDescription('The command to get info about')
            .setRequired(false));

async function execute(interaction) {
    try {
        const { commands } = interaction.client;
        const commandName = interaction.options.getString('command');

        if (commandName) {
            const command = commands.get(commandName);
            if (!command) {
                return interaction.reply({
                    content: `Command \`${commandName}\` not found!`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Command: ${command.data.name}`)
                .setDescription(command.data.description)
                .addFields(
                    { name: 'Usage', value: `\`/${command.data.name}\``, inline: true },
                    { name: 'Type', value: 'Slash Command', inline: true }
                );

            if (command.prefix) {
                embed.addFields(
                    { name: 'Prefix Usage', value: `\`${command.name}\``, inline: true },
                    { name: 'Aliases', value: command.aliases.join(', ') || 'None', inline: true }
                );
            }

            return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Available Commands')
            .setDescription('Here are all the available commands:')
            .addFields(
                { name: 'Slash Commands', value: commands.filter(cmd => !cmd.prefix).map(cmd => `\`/${cmd.data.name}\` - ${cmd.data.description}`).join('\n') },
                { name: 'Prefix Commands', value: commands.filter(cmd => cmd.prefix).map(cmd => `\`${cmd.name}\` - ${cmd.description}`).join('\n') }
            );

        return interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in help command:', error);
        return interaction.reply({
            content: 'There was an error executing this command!',
            ephemeral: true
        });
    }
}

const prefix = true;
const name = 'help';
const description = 'List all commands or info about a specific command';
const aliases = ['h', 'commands'];

async function executePrefix(message, args) {
    try {
        const { commands } = message.client;
        const commandName = args[0];

        if (commandName) {
            const command = commands.get(commandName);
            if (!command) {
                return message.reply(`Command \`${commandName}\` not found!`);
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Command: ${command.name}`)
                .setDescription(command.description)
                .addFields(
                    { name: 'Usage', value: `\`${command.name}\``, inline: true },
                    { name: 'Type', value: 'Prefix Command', inline: true },
                    { name: 'Aliases', value: command.aliases.join(', ') || 'None', inline: true }
                );

            return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Available Commands')
            .setDescription('Here are all the available commands:')
            .addFields(
                { name: 'Slash Commands', value: commands.filter(cmd => !cmd.prefix).map(cmd => `\`/${cmd.data.name}\` - ${cmd.data.description}`).join('\n') },
                { name: 'Prefix Commands', value: commands.filter(cmd => cmd.prefix).map(cmd => `\`${cmd.name}\` - ${cmd.description}`).join('\n') }
            );

        return message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in help command:', error);
        return message.reply('There was an error executing this command!');
    }
}

module.exports = { data, execute, prefix, name, description, aliases, executePrefix }; 