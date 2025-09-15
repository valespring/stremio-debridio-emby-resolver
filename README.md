# Debridio Emby Resolver

A powerful desktop application that generates M3U playlists from Debridio and other streaming addons with advanced logo enhancement and caching capabilities.

## Features

- 🖥️ **Desktop Application**: Cross-platform Electron app with system tray integration
- 🎬 **Automatic Content Fetching**: Retrieves content from Debridio and other streaming addons
- 📺 **M3U Playlist Generation**: Creates properly formatted M3U playlists with enhanced logos
- 🖼️ **Advanced Logo System**: Downloads and caches high-quality logos from Wikimedia Commons
- ⚡ **Two-Phase Enhancement**: Fast initial playlist + background logo improvement
- 🔧 **Parameter Passing**: Command-line support for secure addon URLs
- 🌐 **Built-in Web Interface**: Monitor and control via integrated web UI
- 📊 **Comprehensive Logging**: Detailed logging with real-time progress tracking
- 🔄 **Cross-Platform**: Windows, macOS, and Linux desktop apps
- 💾 **Persistent Caching**: 30-day logo cache with automatic cleanup

## Installation

### Desktop Application (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd stremio-debridio-emby-resolver
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the desktop app**:
   ```bash
   npm run electron
   ```

4. **With secure addon URL parameter**:
   ```bash
   npm run electron -- --secure-addons-url="https://your-debridio-url.com/manifest.json"
   ```

### Production Builds

Build standalone desktop applications:

```bash
# Windows installer
npm run build-win

# macOS DMG
npm run build-mac

# Linux AppImage
npm run build-linux
```

### Server Mode (Legacy)

For server-only operation without desktop interface:

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
    "userAgent": "DebridioEmbyResolver/1.0.0",
    "timeout": 10000
  },
  "playlist": {
    "outputPath": "./playlist.m3u",
    "name": "Debridio Emby Playlist",
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

#### Addon Settings
- `apiUrl`: Local addon API endpoint (default: http://127.0.0.1:11470)
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
- `enabledAddons`: List of streaming addons to fetch content from (supports both built-in addon IDs and full addon URLs)
- `categories`: Content categories to include (movie, series)
- `filters`: Content filtering options (year range, genres, languages)

### Adding Custom Addons

You can add custom streaming addons by including their full manifest URLs in the `enabledAddons` array:

```json
{
  "sources": {
    "enabledAddons": [
      "com.linvo.cinemeta",
      "com.stremio.local",
      "https://debridio.com/YOUR-API-KEY-HERE/manifest.json"
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

### Desktop Application

1. **Launch the desktop app**:
   ```bash
   npm run electron
   ```

2. **With secure addon URL**:
   ```bash
   npm run electron -- --secure-addons-url="https://your-debridio-url.com/manifest.json"
   ```

3. **Windows shortcut with parameters**:
   Use the provided `launch-with-secure-addon.bat` file or create a shortcut with target:
   ```
   "C:\path\to\node.exe" "C:\path\to\index.js" --secure-addons-url="https://your-url.com/manifest.json"
   ```

4. **Access features**:
   - **System tray**: Right-click for quick access to controls
   - **Web interface**: Built-in browser interface for monitoring
   - **Playlist file**: Generated at `./playlist.m3u`
   - **Logo cache**: High-quality logos cached in `./cache/logos/`

### Server Mode

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
pm2 start index.js --name debridio-emby-resolver
pm2 startup
pm2 save
```

#### Linux/macOS (using PM2)
```bash
npm install -g pm2
pm2 start index.js --name debridio-emby-resolver
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
stremio-debridio-emby-resolver/
├── index.js                      # Main application entry point
├── electron-main.js              # Electron desktop app main process
├── config.json                   # Configuration file
├── config.secure.json.template   # Secure configuration template
├── package.json                  # Node.js dependencies and scripts
├── launch-with-secure-addon.bat  # Windows launcher with parameters
├── DESKTOP_APP_GUIDE.md          # Desktop app documentation
├── public/
│   └── index.html                # Built-in web interface
├── src/
│   ├── messages/
│   │   └── index.js              # Centralized message constants
│   ├── services/
│   │   ├── stremioService.js     # Addon API integration
│   │   ├── playlistGenerator.js  # M3U playlist generation
│   │   └── logoService.js        # Logo downloading and caching
│   ├── channels/
│   │   ├── fallback.js           # Fallback channel definitions
│   │   └── variations.js         # Channel name variations
│   └── utils/
│       └── logger.js             # Logging utility
├── cache/
│   └── logos/                    # Downloaded logo files and metadata
├── backups/                      # Playlist backups
└── logs/                         # Log files (if file logging enabled)
```

## Troubleshooting

### Common Issues

1. **Addon Connection Failed**
   - Verify addon URLs are correct and accessible
   - Check network connectivity
   - Ensure secure addon URLs are properly formatted

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
   - For desktop app, the web interface runs on a different port

5. **Logo Enhancement Issues**
   - Check internet connectivity for Wikimedia access
   - Verify cache directory permissions
   - Clear cache with `rm -rf cache/logos/*` if needed

6. **Desktop App Issues**
   - Ensure Electron dependencies are installed: `npm install`
   - Check system requirements for Electron
   - Try running in server mode first: `npm start`

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