# Developer Guide

This comprehensive guide provides detailed information for developers who want to contribute to or modify the Discord bot and its dashboard.

## Project Structure

```
discord-bot/
├── logs/                # Application logs
├── sessions/            # Session files for dashboard
├── src/
│   ├── bot/             # Discord bot logic
│   │   ├── commands/    # Slash and prefix commands
│   │   ├── components/  # Interactive components (buttons, etc.)
│   │   ├── events/      # Discord.js event handlers
│   │   ├── handlers/    # Command and event loading handlers
│   │   └── index.js     # Bot initialization
│   ├── config/          # Configuration files
│   │   ├── database.js  # Database connection config
│   │   └── env.js       # Environment variables loader
│   ├── dashboard/       # Web dashboard 
│   │   ├── middleware/  # Express middleware
│   │   ├── public/      # Static assets (CSS, etc.)
│   │   ├── routes/      # Express routes
│   │   └── views/       # EJS templates for dashboard
│   ├── database/        # Database operations
│   │   ├── guilds.js    # Guild settings management
│   │   ├── tags.js      # Auto-responder tags management
│   │   ├── tickets.js   # Ticket system management
│   │   ├── setup.js     # Database initialization
│   │   └── schema.sql   # SQL schema
│   ├── utils/           # Utility functions
│   │   ├── logger.js    # Winston logging setup
│   │   └── discord-logger.js # Discord channel logging
│   └── index.js         # Main application entry point
├── .env                 # Environment variables (not in repo)
├── package.json         # Project dependencies
└── tailwind.config.js   # Tailwind CSS configuration
```

## Technology Stack

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **MySQL** (via mysql2) - Database
- **Discord.js v14** - Discord API library
- **Passport.js** - Authentication (Discord OAuth2)
- **Winston** - Logging

### Frontend
- **EJS** - Templating engine
- **Tailwind CSS** - Utility-first CSS framework
- **Font Awesome** - Icon library

## Development Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create the `.env` file** with required environment variables (see README.md)

3. **Set up the database**
   ```bash
   npm run setup-db
   npm run setup-plugins
   npm run setup-tickets
   ```

4. **Register slash commands**
   ```bash
   npm run deploy
   ```

5. **Start in development mode**
   ```bash
   npm run dev
   ```

## Adding New Commands

### Slash Commands

1. Create a new file in `src/bot/commands/`:
```javascript
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');

// Define the command data
const data = new SlashCommandBuilder()
    .setName('commandname')
    .setDescription('Command description')
    .addUserOption(option => 
        option.setName('target')
            .setDescription('The target user')
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers); // Optional permissions

// Slash command execution function
async function execute(interaction) {
    try {
        // Command logic here
        await interaction.reply('Command executed successfully!');
    } catch (error) {
        logger.error('Error in command:', error);
        await interaction.reply({ 
            content: 'An error occurred while executing this command.',
            ephemeral: true 
        });
    }
}

// For prefix functionality
const prefix = true; // Mark as usable with prefix
const name = 'commandname';
const description = 'Command description';
const aliases = ['cmd', 'c']; // Optional aliases
const permissions = ['KickMembers']; // Optional required permissions

// Prefix command execution function
async function executePrefix(message, args) {
    try {
        // Command logic here
        await message.reply('Command executed successfully!');
    } catch (error) {
        logger.error('Error in command:', error);
        await message.reply('An error occurred while executing this command.');
    }
}

module.exports = { 
    data, 
    execute, 
    prefix, 
    name, 
    description, 
    aliases, 
    permissions, 
    executePrefix 
};
```

2. The command will be automatically loaded by the command handler in `src/bot/handlers/commandHandler.js`.

## Working with Database Operations

### Guild Settings

The `Guilds` class in `src/database/guilds.js` provides methods for managing guild data:

```javascript
// Import the Guilds class
const { Guilds } = require('../database/guilds');

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
await Guilds.setCommandEnabled(guildId, commandName, 'SLASH', enabled);
```

### Plugin Management

Each plugin has its own database class:

```javascript
// Auto-responder tags
const { Tags } = require('../database/tags');

// Check if plugin is enabled
const enabled = await Tags.isPluginEnabled(guildId);

// Enable/disable plugin
await Tags.setPluginEnabled(guildId, true);

// Create a new tag
await Tags.createTag(guildId, {
  name: 'tag-name',
  pattern: 'hello *',
  response: 'Hello there!',
  is_regex: false,
  created_by: userId
});

// Support tickets
const { Tickets } = require('../database/tickets');

// Get ticket settings
const settings = await Tickets.getTicketSettings(guildId);

// Update ticket settings
await Tickets.updateTicketSettings(guildId, {
  is_enabled: true,
  category_id: 'category_id',
  support_role_id: 'role_id',
  log_channel_id: 'channel_id'
});
```

## Adding Dashboard Features

### Adding a New Page

1. Create a new route in the appropriate file in `src/dashboard/routes/`:
```javascript
// In src/dashboard/routes/dashboard.js
const { isAuthenticated, hasGuildAccess } = require('../middleware/auth');

// Add the route
router.get('/servers/:guildId/new-feature', isAuthenticated, hasGuildAccess, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const client = req.app.get('client');
    const guild = client.guilds.cache.get(guildId);
    
    // Page-specific logic here
    
    res.render('new-feature', {
      user: req.user,
      guild,
      csrfToken: req.csrfToken()
    });
  } catch (error) {
    logger.error('Error rendering page:', error);
    res.status(500).render('error', {
      user: req.user,
      error: 'Failed to load page'
    });
  }
});
```

2. Create a new view in `src/dashboard/views/`:
```ejs
<%- include('partials/header') %>

<main class="container mx-auto px-4 py-8">
  <div class="flex items-center justify-between mb-8">
    <h1 class="text-3xl font-bold">New Feature</h1>
    <a href="/dashboard" class="text-gray-400 hover:text-white transition-colors">
      <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
    </a>
  </div>
  
  <div class="bg-gray-800 rounded-lg p-6">
    <!-- Your page content here -->
  </div>
</main>

<%- include('partials/footer') %>
```

3. Add any necessary API routes for data operations:
```javascript
// In src/dashboard/routes/api.js
router.post('/guilds/:guildId/new-feature', isAuthenticated, hasGuildAccess, async (req, res) => {
  try {
    const { guildId } = req.params;
    const data = req.body;
    
    // Process data and update database
    
    res.json({ success: true });
  } catch (error) {
    logger.error('API error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});
```

## Event Handling

Add event handlers in the `src/bot/events/` directory:

```javascript
// src/bot/events/messageCreate.js
const { Guilds } = require('../../database/guilds');
const logger = require('../../utils/logger');

module.exports = {
    name: 'messageCreate', // The event name as defined in discord.js
    once: false, // Whether the event should only be triggered once
    async execute(message) {
        try {
            // Event handling logic
        } catch (error) {
            logger.error('Error in messageCreate event:', error);
        }
    }
};
```

The event will be automatically loaded by the event handler in `src/bot/handlers/eventHandler.js`.

## Plugin Development

### Creating a New Plugin

1. Create database tables for your plugin:
```javascript
// src/database/setup-newplugin.js
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

async function setupNewPluginTables() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'discord_bot'
        });

        // Create your tables
        const createMainTable = `
            CREATE TABLE IF NOT EXISTS new_plugin (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                enabled BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
            )
        `;
        
        await connection.execute(createMainTable);
        logger.info('New plugin tables created successfully');

        // Register in plugins table
        const insertDefaultPlugin = `
            INSERT IGNORE INTO plugins (guild_id, plugin_name, is_enabled)
            SELECT guild_id, 'new_plugin', FALSE FROM guilds
        `;
        
        await connection.execute(insertDefaultPlugin);
        
        return true;
    } catch (error) {
        logger.error('Error setting up new plugin tables:', error);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

if (require.main === module) {
    setupNewPluginTables()
        .then(() => {
            logger.info('New plugin database setup completed');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Error setting up new plugin database:', error);
            process.exit(1);
        });
}

module.exports = setupNewPluginTables;
```

2. Create a database class for the plugin:
```javascript
// src/database/newplugin.js
const { db } = require('./database');
const logger = require('../utils/logger');

class NewPlugin {
    static async isPluginEnabled(guildId) {
        try {
            const [rows] = await db.execute(
                'SELECT is_enabled FROM plugins WHERE guild_id = ? AND plugin_name = ?',
                [guildId, 'new_plugin']
            );
            
            return rows.length > 0 ? rows[0].is_enabled === 1 : false;
        } catch (error) {
            logger.error('Error checking if new plugin is enabled:', error);
            return false;
        }
    }
    
    static async setPluginEnabled(guildId, enabled) {
        try {
            const [existingRows] = await db.execute(
                'SELECT * FROM plugins WHERE guild_id = ? AND plugin_name = ?',
                [guildId, 'new_plugin']
            );
            
            if (existingRows.length > 0) {
                await db.execute(
                    'UPDATE plugins SET is_enabled = ? WHERE guild_id = ? AND plugin_name = ?',
                    [enabled ? 1 : 0, guildId, 'new_plugin']
                );
            } else {
                await db.execute(
                    'INSERT INTO plugins (guild_id, plugin_name, is_enabled) VALUES (?, ?, ?)',
                    [guildId, 'new_plugin', enabled ? 1 : 0]
                );
            }
            
            return true;
        } catch (error) {
            logger.error('Error setting new plugin enabled:', error);
            throw error;
        }
    }
    
    // Add your plugin-specific methods here
}

module.exports = { NewPlugin };
```

3. Add dashboard routes for the plugin:
```javascript
// In src/dashboard/routes/plugins.js
router.get('/new-plugin/:guildId', isAuthenticated, hasGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        // Get plugin status
        const isEnabled = await NewPlugin.isPluginEnabled(guildId);
        
        // Get guild info
        const guild = req.user.guilds.find(g => g.id === guildId);
        
        res.render('plugins/new-plugin', {
            user: req.user,
            guild,
            isEnabled,
            csrfToken: req.csrfToken()
        });
    } catch (error) {
        logger.error('Error loading new plugin page:', error);
        res.status(500).render('error', {
            user: req.user,
            error: 'Failed to load plugin page'
        });
    }
});
```

4. Create view templates for the plugin dashboard:
```ejs
<!-- src/dashboard/views/plugins/new-plugin.ejs -->
<%- include('../partials/header') %>

<main class="flex-grow container mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-8">
        <div>
            <h1 class="text-3xl font-bold">New Plugin</h1>
            <p class="text-gray-400">Server: <%= guild.name %></p>
        </div>
        <div class="space-x-2">
            <a href="/dashboard/plugins" class="text-gray-400 hover:text-white transition-colors">
                <i class="fas fa-arrow-left mr-2"></i>
                Back to Plugins
            </a>
        </div>
    </div>

    <!-- Plugin settings -->
    <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <!-- Plugin code here -->
    </div>
</main>

<%- include('../partials/footer') %>
```

## Authentication and Security

### Authentication

The application uses Passport.js with the Discord strategy for authentication:

```javascript
// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/login');
};

// Middleware to check if user has access to a specific guild
const hasGuildAccess = async (req, res, next) => {
    const guildId = req.params.guildId;
    if (!req.user || !req.user.guilds) {
        return res.status(403).render('error', {
            error: 'Authentication required'
        });
    }
    
    const userGuilds = req.user.guilds;
    const hasAccess = userGuilds.some(guild => guild.id === guildId);
    
    if (!hasAccess) {
        return res.status(403).render('error', {
            error: 'You do not have access to this guild'
        });
    }
    
    next();
};
```

### Security Best Practices

1. **Input Validation**
   - Always validate and sanitize user input
   - Use parameterized queries for database operations

2. **CSRF Protection**
   - The application uses the csurf middleware for CSRF protection
   - Include the CSRF token in all forms and AJAX requests:
   ```html
   <input type="hidden" name="_csrf" value="<%= csrfToken %>">
   ```
   ```javascript
   // In AJAX requests
   headers: {
       'Content-Type': 'application/json',
       'CSRF-Token': '<%= csrfToken %>'
   }
   ```

3. **Rate Limiting**
   - API routes use rate limiting to prevent abuse:
   ```javascript
   const rateLimit = (maxRequests, timeWindow) => {
       const requests = new Map();
       
       return (req, res, next) => {
           // Rate limiting logic
       };
   };
   ```

4. **Error Handling**
   - Always catch and properly handle errors
   - Use the logger for error tracking
   - Don't expose sensitive information in error messages

## Deployment

### Preparation
1. Set up environment variables for production
2. Ensure the database is properly configured
3. Run `npm run deploy` to register slash commands

### Hosting Options
1. **VPS/Dedicated Server**
   - Install Node.js and MySQL
   - Set up a reverse proxy (Nginx/Apache)
   - Use PM2 for process management
   
2. **Container-based (Docker)**
   - Create a Dockerfile and docker-compose.yml
   - Configure environment variables
   - Set up volume mounts for persistent data

### Process Management
Use PM2 to manage the Node.js process:
```bash
# Install PM2
npm install -g pm2

# Start the application
pm2 start src/index.js --name discord-bot

# Setup auto-restart
pm2 startup
pm2 save
```

## Testing

Unit and integration tests can be added using frameworks like Jest:

```javascript
// Example test for a utility function
const { someUtil } = require('../src/utils/someutil');

describe('Utility function tests', () => {
  test('should perform expected operation', () => {
    const result = someUtil('input');
    expect(result).toBe('expected output');
  });
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the style guidelines (consistent indentation, comments, etc.)
4. Write clear commit messages
5. Submit a pull request

## Additional Resources

- [Discord.js Documentation](https://discord.js.org/#/docs)
- [Express.js Documentation](https://expressjs.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [MySQL Documentation](https://dev.mysql.com/doc/)

## Troubleshooting

### Common Issues

1. **Bot doesn't respond to commands**
   - Check if the bot is online and has proper permissions
   - Verify slash commands are registered (`npm run deploy`)
   - Check if command is enabled for the guild

2. **Database connection errors**
   - Verify MySQL is running
   - Check connection credentials in `.env`
   - Ensure the database exists (`npm run setup-db`)

3. **Dashboard authentication issues**
   - Verify Discord OAuth2 credentials
   - Check redirect URI configuration in Discord Developer Portal
   - Clear cookies and try again