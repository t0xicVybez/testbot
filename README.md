# Discord Bot with Dashboard

A comprehensive Discord bot with a web-based dashboard for easy server management, featuring various plugins and customization options.

![Discord Bot Version](https://img.shields.io/badge/discord.js-v14.14.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### Bot Features
- **Server Management**
  - Custom command prefix
  - Welcome messages with auto-role assignment
  - Moderation logging
  - Command toggling (enable/disable individually)

### Moderation Tools
- Kick members with logging
- More moderation features coming soon

### Plugin System
- **Auto Responder Tags**
  - Create automatic responses using pattern matching
  - Support for wildcard and regex patterns
  - Enable/disable individual tags

- **Support Tickets**
  - Customizable ticket creation panels
  - Support staff assignment
  - Ticket claiming system
  - Transcript generation
  - Saved responses for quick replies

### Dashboard
- Modern responsive web interface
- Real-time server management
- OAuth2 authentication with Discord
- Per-server configuration
- Plugin management interface
- Command configuration
- Analytics and logs

## 📋 Requirements
- Node.js 16 or higher
- MySQL 8.0 or higher
- Discord Bot Token
- Discord OAuth2 Credentials

## 🚀 Installation

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/discord-bot.git
cd discord-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_CALLBACK_URL=http://localhost:3000/auth/discord/callback

# Database Configuration
DB_HOST=localhost
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=discord_bot

# Web Dashboard
PORT=3000
SESSION_SECRET=your_session_secret
```

### 4. Set up the database
```bash
npm run setup-db
npm run setup-plugins
npm run setup-tickets
```

### 5. Register Slash Commands
```bash
npm run deploy
```

### 6. Start the bot and dashboard
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 🔧 Bot Commands

### Slash Commands
- `/help` - Display available commands and information
- `/ping` - Check bot latency
- `/kick` - Kick a member from the server
- `/tag` - Manage auto-response tags (create, list, get, delete)

### Prefix Commands
- `!help` - Show command help (or your custom prefix)
- `!ping` - Check bot latency
- `!kick` - Kick a member
- `!tag` - Manage tags

## 🧩 Plugins

### Auto Responder Tags
Create automatic responses to messages using patterns:
- Wildcard matching (example: `hello *` will match "hello world", "hello there", etc.)
- Regex support for advanced pattern matching
- Enable/disable individual tags

### Support Tickets
Complete ticket system for user support:
- Custom ticket panels in any channel
- Support staff assignment
- Ticket claim/unclaim functionality
- Transcript generation when closing tickets
- Saved responses for common replies

## 🌐 Dashboard Usage

1. Invite the bot to your server using the OAuth2 URL
2. Log in to the dashboard with your Discord account
3. Select your server from the dashboard
4. Configure settings:
   - Set custom prefix
   - Configure welcome messages and auto-roles
   - Manage commands
   - Set up plugins (tags, tickets)

## 🛠️ Development

For development instructions, please refer to the [Developer Guide](DEVELOPERS.md).

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📸 Screenshots

*Coming soon*

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request