const { EmbedBuilder } = require('discord.js');
const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');

// Define event properties
const name = 'guildMemberAdd';
const once = false;

async function execute(member) {
    try {
        logger.info(`New member joined: ${member.user.tag} (${member.id}) in guild ${member.guild.name}`);
        
        const settings = await Guilds.getGuildSettings(member.guild.id);
        logger.info(`Guild settings for welcome: ${JSON.stringify(settings)}`);
        
        if (!settings || !settings.welcomeChannel) {
            logger.warn(`No welcome channel configured for guild ${member.guild.id}`);
            return;
        }

        const welcomeChannel = member.guild.channels.cache.get(settings.welcomeChannel);
        if (!welcomeChannel) {
            logger.warn(`Welcome channel ${settings.welcomeChannel} not found in guild ${member.guild.id}`);
            return;
        }

        // Check if channel is text channel
        if (welcomeChannel.type !== 0 && welcomeChannel.type !== 'GUILD_TEXT') {
            logger.warn(`Welcome channel ${welcomeChannel.id} is not a text channel (type: ${welcomeChannel.type})`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Welcome!')
            .setDescription(`Welcome ${member} to ${member.guild.name}!`)
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true },
                { name: 'Account Created', value: member.user.createdAt.toLocaleDateString(), inline: true },
                { name: 'Bot Account', value: member.user.bot ? 'Yes' : 'No', inline: true }
            )
            .setTimestamp();

        await welcomeChannel.send({ embeds: [embed] });
        logger.info(`Welcome message sent for ${member.user.tag} in ${member.guild.name}`);

        // Apply auto role if set
        if (settings.autoRole) {
            try {
                const role = member.guild.roles.cache.get(settings.autoRole);
                if (role) {
                    await member.roles.add(role);
                    logger.info(`Auto role ${role.name} applied to ${member.user.tag} in ${member.guild.name}`);
                } else {
                    logger.warn(`Auto role ${settings.autoRole} not found in guild ${member.guild.id}`);
                }
            } catch (roleError) {
                logger.error(`Error applying auto role to ${member.user.tag} in ${member.guild.name}:`, roleError);
            }
        }
    } catch (error) {
        logger.error(`Error in guildMemberAdd event for ${member?.user?.tag || 'unknown user'}:`, error);
    }
}

module.exports = { name, once, execute };