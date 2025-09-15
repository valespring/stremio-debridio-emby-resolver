const express = require('express');
const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');
const StremioService = require('./src/services/stremioService');
const PlaylistGenerator = require('./src/services/playlistGenerator');
const Logger = require('./src/utils/logger');
const MESSAGES = require('./src/messages');

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
  }

  async initialize() {
    try {
      // Load configuration
      await this.loadConfig();
      
      // Initialize logger
      this.logger = new Logger(this.config.logging);
      
      // Initialize services
      this.stremioService = new StremioService(this.config, this.logger);
      this.playlistGenerator = new PlaylistGenerator(this.config.playlist, this.logger);
      
      // Setup Express middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup scheduled refresh
      this.setupScheduler();
      
      // Initial playlist generation
      await this.generatePlaylist();
      
      this.logger.info(MESSAGES.SERVER.INITIALIZED);
    } catch (error) {
      console.error(MESSAGES.CONFIG.INITIALIZE_FAILED, error);
      process.exit(1);
    }
  }

  async loadConfig() {
    try {
      // Load main config
      const configPath = path.join(__dirname, 'config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);
      
      // Load secure config if it exists
      const secureConfigPath = path.join(__dirname, 'config.secure.json');
      if (await fs.pathExists(secureConfigPath)) {
        const secureConfigData = await fs.readFile(secureConfigPath, 'utf8');
        const secureConfig = JSON.parse(secureConfigData);
        
        // Merge secure addons with regular addons and also keep them separate
        if (secureConfig.secureAddons && Array.isArray(secureConfig.secureAddons)) {
          this.config.sources.enabledAddons = [
            ...this.config.sources.enabledAddons,
            ...secureConfig.secureAddons
          ];
          // Also keep them in secureAddons for the service to find
          this.config.secureAddons = secureConfig.secureAddons;
        }
        
        this.logger?.info(MESSAGES.CONFIG.SECURE_CONFIG_LOADED);
      }
    } catch (error) {
      throw new Error(MESSAGES.CONFIG.LOAD_FAILED(error.message));
    }
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static('public'));
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
  }

  setupRoutes() {
    // Serve the main interface at root
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    this.app.get('/status', (req, res) => {
      res.json({
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: require('./package.json').version
        },
        playlist: {
          lastUpdate: this.lastUpdate,
          isUpdating: this.isUpdating,
          outputPath: this.config.playlist.outputPath,
          refreshInterval: this.config.playlist.refreshInterval
        },
        config: {
          port: this.config.server.port,
          enabledAddons: this.config.sources.enabledAddons,
          categories: this.config.sources.categories
        }
      });
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
      
      // Start background logo enhancement (don't await - run in background)
      this.enhanceLogosInBackground(content);
      
    } catch (error) {
      this.logger.error(MESSAGES.PLAYLIST.GENERATION_FAILED, error);
      throw error;
    } finally {
      this.isUpdating = false;
    }
  }

  enhanceLogosInBackground(content) {
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
              
              // Always try to enhance - even if we have a Debridio poster, Wikimedia might be better
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
    await this.initialize();
    
    const port = this.config.server.port;
    const host = this.config.server.host;
    
    this.app.listen(port, host, () => {
      this.logger.info(MESSAGES.SERVER.STARTING(host, port));
      this.logger.info(MESSAGES.SERVER.PLAYLIST_URL(host, port));
      this.logger.info(MESSAGES.SERVER.STATUS_URL(host, port));
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