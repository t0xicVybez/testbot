module.exports = {
  name: 'ping',
  description: 'Replies with Pong!',
  async execute(message, args) {
    const sent = await message.reply('Pinging...');
    await sent.edit(`Pong! Latency is ${sent.createdTimestamp - message.createdTimestamp}ms.`);
  },
}; 