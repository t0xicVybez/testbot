# Developer Guide

This guide provides detailed information for developers who want to contribute to or modify the Discord bot.

## Project Structure

```
src/
├── bot/
│   ├── commands/         # Bot commands (slash and prefix)
│   ├── events/          # Discord.js event handlers
│   └── index.js         # Bot initialization
├── dashboard/
│   ├── public/          # Static assets
│   │   └── css/        # Tailwind CSS
│   ├── views/          # EJS templates
│   │   ├── partials/  # Reusable template parts
│   │   └── *.ejs      # Page templates
│   └── middleware/     # Express middlewares
├── database/
│   ├── schema.sql      # Database schema
│   └── guilds.js       # Database operations
├── config/             # Configuration files
└── index.js            # Main application entry
```

## Technology Stack

- **Backend**
  - Node.js
  - Express.js
  - MySQL (via mysql2)
  - Discord.js v14
  - Passport.js (Discord OAuth2)

- **Frontend**
  - EJS Templates
  - Tailwind CSS
  - Font Awesome
  - Vanilla JavaScript

## Adding New Commands

### Slash Commands

1. Create a new file in `src/bot/commands/`:
```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commandname')
    .setDescription('Command description'),
  async execute(interaction) {
    // Command logic here
  },
};
```

2. The command will be automatically loaded by the command handler.

### Prefix Commands

1. Create a new file in `src/bot/commands/`:
```javascript
module.exports = {
  name: 'commandname',
  description: 'Command description',
  prefix: true,
  async execute(message, args) {
    // Command logic here
  },
};
```

## Database Operations

### Guild Settings

The `Guilds` class in `src/database/guilds.js` provides methods for managing guild data:

```javascript
// Get guild settings
const settings = await Guilds.getGuildSettings(guildId);

// Update settings
await Guilds.updateSettings(guildId, {
  prefix: '!',
  welcomeChannel: 'channel_id',
  modLogChannel: 'channel_id',
  autoRole: 'role_id'
});

// Enable/disable commands
await Guilds.setCommandEnabled(guildId, commandName, type, enabled);
```

## Adding Dashboard Features

1. Create a new route in `src/index.js`:
```javascript
app.get('/dashboard/new-feature', isAuthenticated, async (req, res) => {
  // Route logic
});
```

2. Create a new view in `src/dashboard/views/`:
```ejs
<%- include('partials/header') %>
<main>
  <!-- Page content -->
</main>
<%- include('partials/footer') %>
```

3. Add any necessary database operations in `src/database/guilds.js`

## Security Considerations

1. **Authentication**
   - Always use `isAuthenticated` middleware for protected routes
   - Verify guild access permissions

2. **Database**
   - Use parameterized queries to prevent SQL injection
   - Validate and sanitize all user input

3. **API Endpoints**
   - Implement rate limiting
   - Validate request bodies
   - Use CSRF protection

## Error Handling

1. **API Responses**
```javascript
try {
  // Operation
} catch (error) {
  console.error('Error:', error);
  res.status(500).json({ error: 'Error message' });
}
```

2. **Dashboard Pages**
```javascript
try {
  // Operation
} catch (error) {
  res.render('error', { 
    user: req.user,
    error: 'User-friendly error message'
  });
}
```

## Testing

1. **Bot Commands**
   - Test with different permission levels
   - Verify error handling
   - Check command cooldowns

2. **Dashboard**
   - Test with multiple servers
   - Verify settings persistence
   - Check mobile responsiveness

## Deployment

1. **Environment Setup**
   - Set `NODE_ENV=production`
   - Configure secure session settings
   - Set up proper Discord OAuth2 redirect URIs

2. **Database**
   - Use connection pooling
   - Set up proper indexes
   - Configure backup strategy

3. **Monitoring**
   - Implement logging
   - Set up error tracking
   - Monitor bot status

## Best Practices

1. **Code Style**
   - Use consistent indentation
   - Add JSDoc comments for functions
   - Follow Discord.js best practices

2. **Performance**
   - Cache frequently accessed data
   - Use connection pooling
   - Optimize database queries

3. **Maintenance**
   - Keep dependencies updated
   - Monitor Discord.js updates
   - Backup database regularly

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the style guide
4. Write clear commit messages
5. Submit a pull request

## Support

For development questions:
1. Check existing issues
2. Create a detailed new issue
3. Join the Discord server
4. Contact the maintainers 