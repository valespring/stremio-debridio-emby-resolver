const express = require('express');
const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');
const StremioService = require('./src/services/stremioService');
const PlaylistGenerator = require('./src/services/playlistGenerator');
const Logger = require('./src/utils/logger');
const MESSAGES = require('./src/messages');

// Load environment variables from .env file
require('dotenv').config();

class StremioPlaylistServer {
  constructor() {
    this.app = express();
    this.config = null;
    this.logger = null;
    this.stremioService = null;
    this.playlistGenerator = null;
    this.cronJob = null;
    this.lastUpdate = null;
    this.isUpdating = false;
    this.electronLogCallback = null; // For electron app log forwarding
  }

  // Remove the old initialize method since we're handling initialization in start()

  // Method for electron app to set up log forwarding
  setElectronLogCallback(callback) {
    this.electronLogCallback = callback;
    if (callback) {
      callback('info', 'Electron log forwarding initialized');
      // Test with a simple message
      callback('info', 'Server callback is working!');
    }
  }

  setupElectronLogForwarding() {
    if (!this.electronLogCallback) return;

    // Intercept the main logger
    this.interceptLogger(this.logger, 'Server');
    
    // Intercept service loggers after they're created
    setTimeout(() => {
      if (this.stremioService && this.stremioService.logger) {
        this.interceptLogger(this.stremioService.logger, 'StremioService');
      }
      if (this.playlistGenerator && this.playlistGenerator.logger) {
        this.interceptLogger(this.playlistGenerator.logger, 'PlaylistGenerator');
      }
      if (this.stremioService && this.stremioService.logoService && this.stremioService.logoService.logger) {
        this.interceptLogger(this.stremioService.logoService.logger, 'LogoService');
      }
    }, 100);
  }

  interceptLogger(logger, serviceName) {
    if (!logger || logger._electronIntercepted) return;

    const originalInfo = logger.info;
    const originalError = logger.error;
    const originalWarn = logger.warn;
    const originalDebug = logger.debug;

    logger.info = (message, ...args) => {
      originalInfo.call(logger, message, ...args);
      this.electronLogCallback('info', `[${serviceName}] ${message} ${args.join(' ')}`);
    };

    logger.error = (message, ...args) => {
      originalError.call(logger, message, ...args);
      this.electronLogCallback('error', `[${serviceName}] ${message} ${args.join(' ')}`);
    };

    logger.warn = (message, ...args) => {
      originalWarn.call(logger, message, ...args);
      this.electronLogCallback('warn', `[${serviceName}] ${message} ${args.join(' ')}`);
    };

    logger.debug = (message, ...args) => {
      originalDebug.call(logger, message, ...args);
      this.electronLogCallback('debug', `[${serviceName}] ${message} ${args.join(' ')}`);
    };

    logger._electronIntercepted = true;
  }

  async loadConfig() {
    try {
      // Determine config path - in packaged app, look in resources directory
      let configPath = path.join(__dirname, 'config.json');
      
      // Check if we're in a packaged app (when running via electron)
      // Use app.isPackaged if available, otherwise check process.resourcesPath
      const isPackaged = (typeof require !== 'undefined' &&
                         require.main &&
                         require.main.filename.includes('app.asar')) ||
                        (process.resourcesPath && !__dirname.includes('node_modules'));
      
      if (isPackaged && process.resourcesPath) {
        // In packaged apps, always try resources directory first for main config
        const resourcesConfigPath = path.join(process.resourcesPath, 'config.json');
        if (await fs.pathExists(resourcesConfigPath)) {
          configPath = resourcesConfigPath;
          console.log('Using config from resources:', configPath);
        } else {
          console.log('Config not found in resources, using fallback:', configPath);
        }
      }
      
      // Fallback: if config doesn't exist at the calculated path, try the project root
      if (!await fs.pathExists(configPath)) {
        configPath = path.join(__dirname, 'config.json');
        console.log('Config not found at calculated path, using fallback:', configPath);
      }
      
      // Load main config
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      // Initialize arrays to track all addon URLs for deduplication
      // Normalize URLs by removing /manifest.json and handling URL encoding for comparison
      const normalizeUrl = (url) => {
        // Remove /manifest.json suffix
        let normalized = url.replace(/\/manifest\.json$/, '');
        // Decode any URL encoding to normalize %3D vs = differences
        try {
          normalized = decodeURIComponent(normalized);
        } catch (e) {
          // If decoding fails, use original
        }
        return normalized;
      };
      
      // Track both normalized URLs and their original forms
      const urlMap = new Map(); // normalized -> original
      
      // Add existing enabled addons (normalized)
      this.config.sources.enabledAddons.forEach(url => {
        const normalized = normalizeUrl(url);
        if (!urlMap.has(normalized)) {
          urlMap.set(normalized, url);
        }
      });
      
      // Check for secure Debridio URL from environment (.env file or electron)
      if (process.env.SECURE_DEBRIDIO_URL) {
        console.log('Found secure Debridio URL from environment:', process.env.SECURE_DEBRIDIO_URL);
        
        // Only decode if it's double-encoded (contains %25 which is encoded %)
        let cleanUrl = process.env.SECURE_DEBRIDIO_URL;
        if (cleanUrl.includes('%253D')) {
          cleanUrl = decodeURIComponent(cleanUrl);
          console.log('Decoded double-encoded URL from:', process.env.SECURE_DEBRIDIO_URL, 'to:', cleanUrl);
        } else {
          console.log('Using URL as-is (properly encoded):', cleanUrl);
        }
        
        // Add to secure addons array
        if (!this.config.secureAddons) {
          this.config.secureAddons = [];
        }
        if (!this.config.secureAddons.includes(cleanUrl)) {
          this.config.secureAddons.push(cleanUrl);
        }
        
        // Add normalized URL to the map for deduplication
        const normalized = normalizeUrl(cleanUrl);
        if (!urlMap.has(normalized)) {
          urlMap.set(normalized, cleanUrl);
        }
        
        console.log('Added secure Debridio URL from environment to config');
      }
      
      // Convert to final addon URLs using the original forms
      const finalAddonUrls = Array.from(urlMap.values()).map(originalUrl => {
        // For built-in addons, return as-is
        if (!originalUrl.startsWith('http')) {
          return originalUrl;
        }
        
        // For HTTP URLs, ensure they have /manifest.json
        if (!originalUrl.endsWith('/manifest.json')) {
          return originalUrl + '/manifest.json';
        }
        
        return originalUrl;
      });
      
      // Update enabled addons with deduplicated list
      this.config.sources.enabledAddons = finalAddonUrls;
      
      console.log('Final enabled addons (deduplicated):', this.config.sources.enabledAddons);
    } catch (error) {
      throw new Error(MESSAGES.CONFIG.LOAD_FAILED(error.message));
    }
  }

  setupMiddleware() {
    this.app.use(express.json());
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
  }

  setupRoutes() {
    // Root endpoint - redirect to status
    this.app.get('/', (req, res) => {
      res.redirect('/status');
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: MESSAGES.API.HEALTHY,
        lastUpdate: this.lastUpdate,
        isUpdating: this.isUpdating,
        uptime: process.uptime()
      });
    });

    // Get playlist
    this.app.get('/playlist', async (req, res) => {
      try {
        const playlistPath = this.config.playlist.outputPath;
        if (await fs.pathExists(playlistPath)) {
          res.setHeader('Content-Type', 'audio/x-mpegurl');
          res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
          const playlist = await fs.readFile(playlistPath, 'utf8');
          res.send(playlist);
        } else {
          res.status(404).json({ error: MESSAGES.PLAYLIST.NOT_FOUND });
        }
      } catch (error) {
        this.logger.error(MESSAGES.API.SERVING_ERROR, error);
        res.status(500).json({ error: MESSAGES.API.INTERNAL_ERROR });
      }
    });

    // Manual refresh
    this.app.post('/refresh', async (req, res) => {
      if (this.isUpdating) {
        return res.status(429).json({ error: MESSAGES.API.UPDATE_IN_PROGRESS });
      }

      try {
        await this.generatePlaylist();
        res.json({ 
          message: MESSAGES.PLAYLIST.UPDATE_SUCCESS,
          lastUpdate: this.lastUpdate
        });
      } catch (error) {
        this.logger.error(MESSAGES.REFRESH.MANUAL_FAILED, error);
        res.status(500).json({ error: MESSAGES.PLAYLIST.UPDATE_FAILED });
      }
    });

    // Get status
    this.app.get('/status', async (req, res) => {
      // Get channel count from playlist file
      let channelCount = 0;
      try {
        if (await fs.pathExists(this.config.playlist.outputPath)) {
          const playlistContent = await fs.readFile(this.config.playlist.outputPath, 'utf8');
          // Count #EXTINF lines (each represents a channel)
          channelCount = (playlistContent.match(/#EXTINF/g) || []).length;
        }
      } catch (error) {
        console.error('Error reading playlist for channel count:', error);
      }

      const statusData = {
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: require('./package.json').version
        },
        playlist: {
          lastUpdate: this.lastUpdate,
          isUpdating: this.isUpdating,
          outputPath: this.config.playlist.outputPath,
          refreshInterval: this.config.playlist.refreshInterval,
          channelCount: channelCount
        },
        config: {
          port: this.config.server.port,
          enabledAddons: this.config.sources.enabledAddons,
          categories: this.config.sources.categories
        }
      };

      // Check if request accepts HTML (from browser)
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Stremio Debridio Emby Resolver - Status</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            background: #1a1a1a;
            color: #00ff00;
            margin: 20px;
            line-height: 1.4;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #00ccff;
            text-align: center;
            margin-bottom: 30px;
        }
        pre {
            background: #000;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #333;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .refresh-btn {
            background: #007acc;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-bottom: 20px;
            font-size: 14px;
        }
        .refresh-btn:hover {
            background: #005a99;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-box {
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #444;
        }
        .stat-title {
            color: #00ccff;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .stat-box div, pre {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Stremio Debridio Emby Resolver</h1>
        
        <button class="refresh-btn" onclick="location.reload()">🔄 Refresh Status</button>
        <button class="refresh-btn" onclick="clearDebridioUrl()" style="background: #dc3545; margin-left: 10px;">🗑️ Clear Debridio URL</button>
        
        <div class="stats">
            <div class="stat-box">
                <div class="stat-title">📊 Server Status</div>
                <div>Uptime: ${Math.floor(statusData.server.uptime / 60)}m ${Math.floor(statusData.server.uptime % 60)}s</div>
                <div>Memory: ${Math.round(statusData.server.memory.rss / 1024 / 1024)}MB</div>
                <div>Version: ${statusData.server.version}</div>
            </div>
            
            <div class="stat-box">
                <div class="stat-title">📺 Playlist Info</div>
                <div>Last Update: ${statusData.playlist.lastUpdate ? new Date(statusData.playlist.lastUpdate).toLocaleString() : 'Never'}</div>
                <div>Status: ${statusData.playlist.isUpdating ? '🔄 Updating' : '✅ Ready'}</div>
                <div>Channels: ${statusData.playlist.channelCount}</div>
            </div>
            
            <div class="stat-box">
                <div class="stat-title">⚙️ Configuration</div>
                <div>Port: ${statusData.config.port}</div>
                <div>Categories: ${statusData.config.categories.join(', ')}</div>
            </div>
        </div>
        
        <div class="stat-title">📋 Full Status JSON:</div>
        <pre id="statusJson" style="cursor: text;">${JSON.stringify(statusData, null, 2)}</pre>
        
        <script>
            // Enable better text selection for JSON
            document.getElementById('statusJson').addEventListener('click', function() {
                this.focus();
            });
            
            // Add double-click to select all JSON
            document.getElementById('statusJson').addEventListener('dblclick', function() {
                const range = document.createRange();
                range.selectNodeContents(this);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
            });
            
            // Function to clear Debridio URL (only works in electron)
            function clearDebridioUrl() {
                if (typeof require !== 'undefined') {
                    try {
                        const { ipcRenderer } = require('electron');
                        if (confirm('Are you sure you want to clear the Debridio URL? This will restart the app with the settings dialog.')) {
                            ipcRenderer.invoke('clear-debridio-url').then(() => {
                                location.reload();
                            });
                        }
                    } catch (error) {
                        alert('This feature is only available in the Electron app.');
                    }
                } else {
                    alert('This feature is only available in the Electron app.');
                }
            }
        </script>
        
        <div style="text-align: center; margin-top: 30px; color: #666;">
            <a href="/playlist" style="color: #00ccff;">📺 Download Playlist</a> |
            <a href="/" style="color: #00ccff;">🏠 Home</a>
        </div>
    </div>
</body>
</html>`;
        res.send(html);
      } else {
        // Return JSON for API requests
        res.json(statusData);
      }
    });
  }

  setupScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
    }

    this.cronJob = cron.schedule(this.config.playlist.refreshInterval, async () => {
      this.logger.info(MESSAGES.PLAYLIST.SCHEDULED_REFRESH_STARTED);
      await this.generatePlaylist();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.logger.info(MESSAGES.SCHEDULER.SETUP(this.config.playlist.refreshInterval));
  }

  async generatePlaylist() {
    if (this.isUpdating) {
      this.logger.warn(MESSAGES.PLAYLIST.GENERATION_IN_PROGRESS);
      return;
    }

    this.isUpdating = true;
    const startTime = Date.now();

    try {
      this.logger.info(MESSAGES.PLAYLIST.GENERATION_STARTED);
      
      // Fetch content from Stremio (now uses Debridio logos or placeholders - fast!)
      const content = await this.stremioService.fetchContent(this.config.sources);
      
      // Generate M3U playlist immediately
      await this.playlistGenerator.generate(content);
      
      this.lastUpdate = new Date().toISOString();
      const duration = Date.now() - startTime;
      
      this.logger.info(MESSAGES.PLAYLIST.GENERATION_COMPLETED(duration));
      
      // Mark as no longer updating BEFORE starting background enhancement
      this.isUpdating = false;
      
      // Start background logo enhancement (don't await - run in background)
      // This runs AFTER the playlist is completely generated and saved
      this.enhanceLogosInBackground(content);
      
    } catch (error) {
      this.logger.error(MESSAGES.PLAYLIST.GENERATION_FAILED, error);
      this.isUpdating = false; // Make sure to reset on error
      throw error;
    }
  }

  enhanceLogosInBackground(content) {
    // Only run logo enhancement if Wikimedia is enabled
    if (!this.config.logos?.enableWikimedia) {
      this.logger.info(MESSAGES.PLAYLIST.LOGO_ENHANCEMENT_SKIPPED);
      return;
    }

    // Run logo enhancement in background without blocking
    setImmediate(async () => {
      try {
        this.logger.info(MESSAGES.PLAYLIST.LOGO_ENHANCEMENT_STARTED);
        this.logger.info(`Processing ${content.length} items for logo enhancement`);
        let logosEnhanced = 0;
        let processed = 0;
        
        // Process items in batches to avoid overwhelming the API
        const batchSize = 3;
        const totalBatches = Math.ceil(content.length / batchSize);
        
        for (let i = 0; i < content.length; i += batchSize) {
          const batch = content.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          
          this.logger.info(`Processing batch ${batchNum}/${totalBatches} (items ${i + 1}-${Math.min(i + batchSize, content.length)})`);
          
          await Promise.all(batch.map(async (item) => {
            try {
              const originalPoster = item.poster;
              processed++;
              
              this.logger.debug(`[${processed}/${content.length}] Checking "${item.title}" (poster: ${originalPoster ? 'has poster' : 'no poster'})`);
              
              // Try to enhance with Wikimedia logos
              const enhancedPoster = await this.stremioService.logoService.getChannelLogo(item.title, originalPoster);
              
              // Only update if we got a different/better logo
              if (enhancedPoster !== originalPoster) {
                item.poster = enhancedPoster;
                logosEnhanced++;
                this.logger.info(`✓ Enhanced "${item.title}": ${originalPoster || 'none'} -> ${enhancedPoster}`);
              } else {
                this.logger.debug(`- No enhancement needed for "${item.title}"`);
              }
            } catch (error) {
              this.logger.warn(`Failed to enhance logo for "${item.title}": ${error.message}`);
            }
          }));
          
          // Small delay between batches to be nice to APIs
          if (i + batchSize < content.length) {
            this.logger.debug(`Waiting 1 second before next batch...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        this.logger.info(`Logo enhancement processing completed: ${processed} items processed, ${logosEnhanced} logos enhanced`);
        
        // Always regenerate the playlist to ensure any changes are saved
        if (logosEnhanced > 0) {
          this.logger.info(MESSAGES.PLAYLIST.LOGO_ENHANCEMENT_REGENERATING(logosEnhanced));
          
          try {
            await this.playlistGenerator.generate(content);
            this.lastUpdate = new Date().toISOString();
            this.logger.info(MESSAGES.PLAYLIST.LOGO_ENHANCEMENT_COMPLETED(logosEnhanced));
          } catch (error) {
            this.logger.warn(MESSAGES.PLAYLIST.LOGO_ENHANCEMENT_REGENERATE_FAILED, error.message);
          }
        } else {
          this.logger.info(MESSAGES.PLAYLIST.LOGO_ENHANCEMENT_NO_UPDATES);
        }
        
      } catch (error) {
        this.logger.warn(MESSAGES.PLAYLIST.LOGO_ENHANCEMENT_FAILED, error.message);
      }
    });
  }

  async start() {
    // Load configuration first
    await this.loadConfig();
    
    // Initialize logger
    this.logger = new Logger(this.config.logging);
    
    // Set up electron log forwarding if callback is provided
    if (this.electronLogCallback) {
      this.electronLogCallback('info', 'Setting up electron log forwarding...');
      this.setupElectronLogForwarding();
    }
    
    // Initialize services
    this.stremioService = new StremioService(this.config, this.logger);
    this.playlistGenerator = new PlaylistGenerator(this.config.playlist, this.logger);
    
    // Setup Express middleware and routes
    this.setupMiddleware();
    this.setupRoutes();
    
    // Start the server FIRST, before playlist generation
    const port = this.config.server.port;
    const host = this.config.server.host;
    
    this.app.listen(port, host, () => {
      this.logger.info(MESSAGES.SERVER.STARTING(host, port));
      this.logger.info(MESSAGES.SERVER.PLAYLIST_URL(host, port));
      this.logger.info(MESSAGES.SERVER.STATUS_URL(host, port));
      
      // Now start the initial playlist generation in the background
      this.generateInitialPlaylist();
    });
    
    // Setup scheduled refresh
    this.setupScheduler();
    
    this.logger.info(MESSAGES.SERVER.INITIALIZED);
  }

  async generateInitialPlaylist() {
    // Run initial playlist generation in background
    setImmediate(async () => {
      try {
        await this.generatePlaylist();
      } catch (error) {
        this.logger.error('Initial playlist generation failed:', error);
      }
    });
  }

  async stop() {
    if (this.cronJob) {
      this.cronJob.stop();
    }
    this.logger.info(MESSAGES.SERVER.STOPPED);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(MESSAGES.SERVER.SHUTDOWN_SIGINT);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(MESSAGES.SERVER.SHUTDOWN_SIGTERM);
  process.exit(0);
});

// Start the server
if (require.main === module) {
  const server = new StremioPlaylistServer();
  server.start().catch(error => {
    console.error(messages.config.startFailed, error);
    process.exit(1);
  });
}

module.exports = StremioPlaylistServer;