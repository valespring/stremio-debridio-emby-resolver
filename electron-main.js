const { app, BrowserWindow, Menu, Tray, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const StremioPlaylistServer = require('./index');

class ElectronApp {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.server = null;
    this.serverPort = this.loadPortFromConfig();
    this.secureAddonsUrl = null;
    
    // Parse command line arguments for secureAddons URL
    this.parseCommandLineArgs();
    
    // Set up app event handlers
    this.setupAppHandlers();
  }

  loadPortFromConfig() {
    const configPath = path.join(__dirname, 'config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.server.port;
  }

  parseCommandLineArgs() {
    const args = process.argv.slice(2);
    
    // Look for --secure-addons-url parameter
    const secureAddonsIndex = args.findIndex(arg => 
      arg === '--secure-addons-url' || arg.startsWith('--secure-addons-url=')
    );
    
    if (secureAddonsIndex !== -1) {
      if (args[secureAddonsIndex].includes('=')) {
        // Format: --secure-addons-url=https://example.com
        this.secureAddonsUrl = args[secureAddonsIndex].split('=')[1];
      } else if (args[secureAddonsIndex + 1]) {
        // Format: --secure-addons-url https://example.com
        this.secureAddonsUrl = args[secureAddonsIndex + 1];
      }
    }

    console.log('Parsed secure addons URL:', this.secureAddonsUrl);
  }

  setupAppHandlers() {
    app.whenReady().then(() => {
      this.createWindow();
      this.createTray();
      this.startServer();
    });

    app.on('window-all-closed', () => {
      // On macOS, keep app running even when all windows are closed
      if (process.platform !== 'darwin') {
        this.cleanup();
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false
      },
      // icon: path.join(__dirname, 'assets', 'icon.png'), // Add icon if available
      title: 'Stremio Debridio Emby Resolver'
    });

    // Load the server's web interface once it's ready
    this.mainWindow.loadURL(`http://localhost:${this.serverPort}/status`);

    // Open external links in default browser
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    // Hide window instead of closing on close button
    this.mainWindow.on('close', (event) => {
      if (!app.isQuiting) {
        event.preventDefault();
        this.mainWindow.hide();
      }
    });
  }

  createTray() {
    // Create system tray icon - use a simple fallback if icon doesn't exist
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    const fs = require('fs');
    
    // Skip tray creation if icon doesn't exist
    if (!fs.existsSync(iconPath)) {
      console.log('Tray icon not found, skipping tray creation');
      return;
    }
    
    this.tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show App',
        click: () => {
          this.mainWindow.show();
        }
      },
      {
        label: 'Open Playlist URL',
        click: () => {
          shell.openExternal(`http://localhost:${this.serverPort}/playlist`);
        }
      },
      {
        label: 'Open Status Page',
        click: () => {
          shell.openExternal(`http://localhost:${this.serverPort}/status`);
        }
      },
      { type: 'separator' },
      {
        label: 'Refresh Playlist',
        click: async () => {
          try {
            const response = await fetch(`http://localhost:${this.serverPort}/refresh`, {
              method: 'POST'
            });
            const result = await response.json();
            
            dialog.showMessageBox(this.mainWindow, {
              type: 'info',
              title: 'Playlist Refresh',
              message: result.message || 'Playlist refreshed successfully'
            });
          } catch (error) {
            dialog.showErrorBox('Refresh Error', 'Failed to refresh playlist: ' + error.message);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuiting = true;
          app.quit();
        }
      }
    ]);

    if (this.tray) {
      this.tray.setContextMenu(contextMenu);
      this.tray.setToolTip('Stremio Debridio Emby Resolver');
      
      // Show window on tray click
      this.tray.on('click', () => {
        this.mainWindow.show();
      });
    }
  }

  async startServer() {
    try {
      // If secureAddonsUrl is provided, inject it into the environment or config
      if (this.secureAddonsUrl) {
        process.env.SECURE_ADDONS_URL = this.secureAddonsUrl;
        this.sendLogToWindow('info', 'Set secure addons URL from command line: ' + this.secureAddonsUrl);
      }

      this.server = new StremioPlaylistServer();
      
      // Intercept console logs from the server
      this.interceptServerLogs();
      
      // Modify the server to use the secure addons URL if provided
      if (this.secureAddonsUrl) {
        await this.injectSecureAddonsUrl();
      }
      
      this.sendLogToWindow('info', 'Starting server...');
      await this.server.start();
      
      this.sendLogToWindow('info', 'Server started successfully on port ' + this.serverPort);
      this.sendServerStatus('Running');
      
    } catch (error) {
      this.sendLogToWindow('error', 'Failed to start server: ' + error.message);
      dialog.showErrorBox('Server Error', 'Failed to start the server: ' + error.message);
    }
  }

  interceptServerLogs() {
    // Store original console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    // Override console methods to send logs to window
    console.log = (...args) => {
      originalLog.apply(console, args);
      this.sendLogToWindow('info', args.join(' '));
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      this.sendLogToWindow('error', args.join(' '));
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      this.sendLogToWindow('warn', args.join(' '));
    };

    console.info = (...args) => {
      originalInfo.apply(console, args);
      this.sendLogToWindow('info', args.join(' '));
    };
  }

  sendLogToWindow(level, message) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('log-message', { level, message });
    }
  }

  sendServerStatus(status) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('server-status', status);
    }
  }

  async injectSecureAddonsUrl() {
    const fs = require('fs-extra');
    const path = require('path');
    
    try {
      // Create or update secure config with the provided URL
      const secureConfigPath = path.join(__dirname, 'config.secure.json');
      let secureConfig = {};
      
      if (await fs.pathExists(secureConfigPath)) {
        const configData = await fs.readFile(secureConfigPath, 'utf8');
        secureConfig = JSON.parse(configData);
      }
      
      // Add the secure addons URL to the config
      if (!secureConfig.secureAddons) {
        secureConfig.secureAddons = [];
      }
      
      // Add the URL if it's not already present
      if (!secureConfig.secureAddons.includes(this.secureAddonsUrl)) {
        secureConfig.secureAddons.push(this.secureAddonsUrl);
      }
      
      await fs.writeFile(secureConfigPath, JSON.stringify(secureConfig, null, 2));
      console.log('Updated secure config with provided URL');
      
    } catch (error) {
      console.error('Failed to inject secure addons URL:', error);
    }
  }

  cleanup() {
    if (this.server) {
      this.server.stop();
    }
  }
}

// Create and start the Electron app
const electronApp = new ElectronApp();