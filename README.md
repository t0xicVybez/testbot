# Discord Bot

A versatile Discord bot with a web dashboard for easy server management.

## Features

### Server Management
- Custom prefix support
- Welcome messages
- Auto-role assignment
- Moderation logging
- Command management

### Dashboard
- User-friendly web interface
- Real-time server management
- Command configuration
- Role management
- Channel settings

## Requirements
- Node.js 16 or higher
- MySQL 8.0 or higher
- Discord Bot Token
- Discord OAuth2 Credentials

## Installation

```bash
git clone https://github.com/yourusername/discord-bot.git
cd discord-bot
npm install
```

## Configuration

1. Create a `.env` file in the root directory:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback

# Database Configuration
DB_HOST=localhost
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=discord_bot

# Web Dashboard
PORT=3000
SESSION_SECRET=your_session_secret
```

2. Set up the database:
```bash
mysql -u your_user -p your_database < src/database/schema.sql
```

## Commands

### Slash Commands
- `/help` - Display help information
- `/ping` - Check bot latency
- `/settings` - Configure server settings
- `/welcome` - Configure welcome messages
- `/autorole` - Set up automatic role assignment

### Dashboard Features
- Enable/Disable commands
- Configure server settings
- Manage welcome messages
- Set up auto-roles
- View server statistics

## Usage

1. Invite the bot to your server using the OAuth2 URL
2. Configure server settings through the dashboard
3. Set up welcome messages and auto-roles as needed

## Development

To start the bot in development mode:

```bash
npm run dev
```

To build and start in production:

```bash
npm run build
npm start
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 