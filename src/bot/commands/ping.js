const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot\'s latency');

async function execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`Pong! 🏓\nLatency: ${latency}ms\nAPI Latency: ${Math.round(interaction.client.ws.ping)}ms`);
}

const prefix = true;
const name = 'ping';
const description = 'Check the bot\'s latency';
const aliases = ['p'];

async function executePrefix(message) {
    const sent = await message.channel.send('Pinging...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    await sent.edit(`Pong! 🏓\nLatency: ${latency}ms\nAPI Latency: ${Math.round(message.client.ws.ping)}ms`);
}

module.exports = { data, execute, prefix, name, description, aliases, executePrefix }; 