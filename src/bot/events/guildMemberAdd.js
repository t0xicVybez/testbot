const { EmbedBuilder } = require('discord.js');
const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');

const name = 'guildMemberAdd';
const once = false;

async function execute(member) {
    try {
        const settings = await Guilds.getGuildSettings(member.guild.id);
        if (!settings.settings.welcome_channel_id) return;

        const welcomeChannel = member.guild.channels.cache.get(settings.settings.welcome_channel_id);
        if (!welcomeChannel) return;

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Welcome!')
            .setDescription(`Welcome ${member} to ${member.guild.name}!`)
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true },
                { name: 'Account Created', value: member.user.createdAt.toLocaleDateString(), inline: true }
            )
            .setTimestamp();

        await welcomeChannel.send({ embeds: [embed] });
        logger.info(`Welcome message sent for ${member.user.tag} in ${member.guild.name}`);
    } catch (error) {
        logger.error('Error in guildMemberAdd event:', error);
    }
}

module.exports = { name, once, execute }; 