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
# Windows installer (run as Administrator)
npm run build-win

# macOS DMG (may require sudo)
npm run build-mac

# Linux AppImage (may require sudo)
npm run build-linux
```

**Note:** On Windows, run Command Prompt or PowerShell as Administrator. On macOS/Linux, you may need to use `sudo` if you encounter permission errors during the build process.

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
    "port": 3333,
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
- `port`: Port number for the web server (default: 3333)
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
      "https://your-addon-url.com/manifest.json"
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
    "port": 3333,
    "enabledAddons": [...],
    "categories": [...]
  }
}
```

## Usage

### Desktop Application

#### Basic Launch
Launch the desktop app without any additional configuration:
```bash
npm run electron
```

#### Running with Secure Addons Configuration

The electron app supports passing secure addon URLs directly via command line parameters, which is useful for:
- Testing with different addon configurations
- Running with sensitive URLs containing API keys
- Automated deployment scenarios
- Development and debugging

**Development Mode:**
```bash
# Single secure addon URL
npm run electron -- --secure-addons-url="https://your-debridio-url.com/manifest.json"

# Alternative format with equals sign
npm run electron -- --secure-addons-url=https://your-debridio-url.com/manifest.json

# Development mode with secure addon
npm run electron-dev -- --secure-addons-url="https://your-debridio-url.com/manifest.json"
```

**Production Builds:**
After building the application (`npm run build-win`, `npm run build-mac`, or `npm run build-linux`), you can run the executable with the same parameters:

```bash
# Windows
"Stremio Debridio Emby Resolver.exe" --secure-addons-url="https://your-url.com/manifest.json"

# macOS
./Stremio\ Debridio\ Emby\ Resolver.app/Contents/MacOS/Stremio\ Debridio\ Emby\ Resolver --secure-addons-url="https://your-url.com/manifest.json"

# Linux
./stremio-debridio-emby-resolver --secure-addons-url="https://your-url.com/manifest.json"
```

**Windows Batch File:**
Use the provided [`launch-with-secure-addon.bat`](launch-with-secure-addon.bat) file for easy Windows deployment:
```cmd
launch-with-secure-addon.bat "https://your-secure-addon-url.com/manifest.json"
```

**How It Works:**
- The `--secure-addons-url` parameter is parsed by the electron main process
- The URL is automatically added to a temporary `config.secure.json` file
- The secure addon is merged with regular addons at runtime
- No sensitive URLs are stored in the main configuration file
- The app works normally if no secure addon URL is provided

**Desktop Shortcuts:**
Create desktop shortcuts with embedded secure addon URLs:

*Windows:*
- Target: `"C:\path\to\Stremio Debridio Emby Resolver.exe" --secure-addons-url="https://your-url.com/manifest.json"`
- Start in: `"C:\path\to\app\directory"`

*macOS:*
Create an Automator application or use Terminal command in a script

*Linux:*
Create a `.desktop` file with the appropriate Exec line including the parameter

#### Application Features
Once launched, access these features:
- **Configuration UI**: Built-in settings dialog for easy Debridio URL configuration
- **Settings Menu**: Access settings via File → Settings or Cmd/Ctrl+, keyboard shortcut
- **System tray**: Right-click for quick access to controls (if tray icon is available)
- **Web interface**: Built-in browser interface for monitoring and control
- **Playlist file**: Generated M3U playlist at `./playlist.m3u`
- **Logo cache**: High-quality logos cached in `./cache/logos/`
- **Real-time updates**: Live status and progress monitoring

#### Configuration UI
The desktop app includes a built-in configuration interface:

**First Launch:**
- If no Debridio URL is configured, the app automatically opens the settings dialog
- Enter your Debridio addon URL (e.g., `https://your-debridio-url.com/manifest.json`)
- The URL is securely stored in your user data directory
- Click "Save & Start Server" to begin content fetching

**Changing Settings:**
- Access settings via the File menu → Settings
- Use keyboard shortcut: Cmd+, (macOS) or Ctrl+, (Windows/Linux)
- Paste functionality available with right-click context menu
- "Clear Debridio URL" button to reset configuration

**Settings Storage:**
- Configuration is stored in `user-config.json` in your system's user data directory
- Settings persist between app launches
- Safe for packaged applications (no file system access required)

### Server Mode

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Access your playlist**:
   - Direct download: `http://localhost:3333/playlist`
   - Server status: `http://localhost:3333/status`
   - Manual refresh: `POST http://localhost:3333/refresh`

3. **Use in media players**:
   Add `http://localhost:3333/playlist` as a playlist URL in your media player

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