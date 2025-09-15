# Stremio M3U Playlist Generator

A Node.js/Express application that automatically generates M3U playlists from Stremio content with hourly refresh functionality.

## Features

- 🎬 **Automatic Content Fetching**: Retrieves content from Stremio addons
- 📺 **M3U Playlist Generation**: Creates properly formatted M3U playlists
- ⏰ **Scheduled Refresh**: Automatically updates playlists every hour (configurable)
- 🔧 **Configurable Settings**: Easy configuration via JSON file
- 🌐 **REST API**: Manual refresh and status endpoints
- 📊 **Logging System**: Comprehensive logging with configurable levels
- 🔄 **Cross-Platform**: Works on Windows, macOS, and Linux
- 💾 **Backup System**: Automatic backup of existing playlists

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd stremio-emby-playlist
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure the application**:
   - Edit `config.json` to match your preferences (see Configuration section below)
   - For secure addon URLs, copy `config.secure.json.template` to `config.secure.json` and add your secure addon URLs

4. **Start the application**:
   ```bash
   npm start
   ```

## Configuration

The application is configured via the `config.json` file:

```json
{
  "server": {
    "port": 3000,
    "host": "localhost"
  },
  "stremio": {
    "apiUrl": "http://127.0.0.1:11470",
    "userAgent": "Stremio/4.4.0",
    "timeout": 10000
  },
  "playlist": {
    "outputPath": "./playlist.m3u",
    "name": "Stremio Playlist",
    "refreshInterval": "0 0 * * * *",
    "maxRetries": 3,
    "retryDelay": 5000
  },
  "logging": {
    "level": "info",
    "enableConsole": true,
    "enableFile": false,
    "logFile": "./logs/app.log"
  },
  "sources": {
    "enabledAddons": [
      "com.linvo.cinemeta",
      "com.stremio.local"
    ],
    "categories": [
      "movie",
      "series"
    ],
    "filters": {
      "minYear": 2000,
      "maxYear": 2024,
      "genres": [],
      "languages": ["en"]
    }
  }
}
```

### Configuration Options

#### Server Settings
- `port`: Port number for the web server (default: 3000)
- `host`: Host address to bind to (default: localhost)

#### Stremio Settings
- `apiUrl`: Stremio API endpoint (default: http://127.0.0.1:11470)
- `userAgent`: User agent string for API requests
- `timeout`: Request timeout in milliseconds

#### Playlist Settings
- `outputPath`: Path where the M3U file will be saved
- `name`: Name of the playlist (appears in M3U header)
- `refreshInterval`: Cron expression for automatic refresh (default: every hour)
- `maxRetries`: Maximum retry attempts for failed operations
- `retryDelay`: Delay between retries in milliseconds

#### Logging Settings
- `level`: Log level (error, warn, info, debug)
- `enableConsole`: Enable console logging
- `enableFile`: Enable file logging
- `logFile`: Path to log file

#### Source Settings
- `enabledAddons`: List of Stremio addons to fetch content from (supports both built-in addon IDs and full addon URLs)
- `categories`: Content categories to include (movie, series)
- `filters`: Content filtering options (year range, genres, languages)

### Adding Custom Addons

You can add custom Stremio addons by including their full manifest URLs in the `enabledAddons` array:

```json
{
  "sources": {
    "enabledAddons": [
      "com.linvo.cinemeta",
      "com.stremio.local",
      "https://tv-addon.debridio.com/YOUR-API-KEY-HERE/manifest.json"
    ]
  }
}
```

The application will automatically detect URL-based addons and fetch their manifests to understand their capabilities.

### Secure Configuration

For sensitive addon URLs (containing API keys or tokens), use the secure configuration system:

1. **Copy the template**:
   ```bash
   cp config.secure.json.template config.secure.json
   ```

2. **Add your secure addon URLs**:
   ```json
   {
     "secureAddons": [
       "https://your-secure-addon-url-with-api-key/manifest.json"
     ]
   }
   ```

3. **Security Features**:
   - `config.secure.json` is automatically git-ignored
   - Secure addons are merged with regular addons at runtime
   - No sensitive URLs stored in the main configuration file
   - Safe for version control and sharing

**Note**: The `config.secure.json` file will be automatically loaded if it exists. If it doesn't exist, the application will run normally with only the addons specified in `config.json`.

## API Endpoints

### GET /health
Returns server health status and basic information.

**Response:**
```json
{
  "status": "healthy",
  "lastUpdate": "2025-09-15T00:51:18.990Z",
  "isUpdating": false,
  "uptime": 123.456
}
```

### GET /playlist
Downloads the current M3U playlist file.

**Response:** M3U file content with appropriate headers

### POST /refresh
Manually triggers a playlist refresh.

**Response:**
```json
{
  "message": "Playlist updated successfully",
  "lastUpdate": "2025-09-15T00:51:18.990Z"
}
```

### GET /status
Returns detailed server and playlist status information.

**Response:**
```json
{
  "server": {
    "uptime": 123.456,
    "memory": {...},
    "version": "1.0.0"
  },
  "playlist": {
    "lastUpdate": "2025-09-15T00:51:18.990Z",
    "isUpdating": false,
    "outputPath": "./playlist.m3u",
    "refreshInterval": "0 0 * * * *"
  },
  "config": {
    "port": 3000,
    "enabledAddons": [...],
    "categories": [...]
  }
}
```

## Usage

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Access your playlist**:
   - Direct download: `http://localhost:3000/playlist`
   - Server status: `http://localhost:3000/status`
   - Manual refresh: `POST http://localhost:3000/refresh`

3. **Use in media players**:
   Add `http://localhost:3000/playlist` as a playlist URL in your media player

## Cross-Platform Deployment

### Windows
The application works natively on Windows. Make sure Node.js is installed and run:
```cmd
npm install
npm start
```

### macOS/Linux
Standard Node.js installation:
```bash
npm install
npm start
```

### Running as a Service

#### Windows (using PM2)
```cmd
npm install -g pm2
pm2 start index.js --name stremio-playlist
pm2 startup
pm2 save
```

#### Linux/macOS (using PM2)
```bash
npm install -g pm2
pm2 start index.js --name stremio-playlist
pm2 startup
pm2 save
```

## Development

### Running in Development Mode
```bash
npm run dev
```

This uses nodemon for automatic restarts when files change.

### Project Structure
```
stremio-emby-playlist/
├── index.js                 # Main application entry point
├── config.json             # Configuration file
├── package.json            # Node.js dependencies and scripts
├── .gitignore              # Git ignore rules
├── README.md               # This file
├── src/
│   ├── messages/
│   │   └── index.js        # Centralized message constants
│   ├── services/
│   │   ├── stremioService.js    # Stremio API integration
│   │   └── playlistGenerator.js # M3U playlist generation
│   └── utils/
│       └── logger.js       # Logging utility
└── logs/                   # Log files (if file logging enabled)
```

## Troubleshooting

### Common Issues

1. **Stremio Connection Failed**
   - Ensure Stremio is running on your system
   - Verify the `apiUrl` in config.json points to the correct Stremio instance
   - Default Stremio URL is `http://127.0.0.1:11470`

2. **Playlist Not Updating**
   - Check the cron expression in `refreshInterval`
   - Verify server logs for any errors
   - Try manual refresh via `/refresh` endpoint

3. **Permission Errors**
   - Ensure the application has write permissions to the output directory
   - Check that the log directory is writable (if file logging enabled)

4. **Port Already in Use**
   - Change the `port` setting in config.json
   - Kill any existing processes using the port

### Logs
Check the console output or log files (if enabled) for detailed error information.

## License

ISC License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions, please create an issue in the repository.