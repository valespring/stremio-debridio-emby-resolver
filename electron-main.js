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
    // In development, config is in __dirname
    // In production, config is in resources directory
    let configPath = path.join(__dirname, 'config.json');
    
    // Check if we're in a packaged app
    if (process.resourcesPath) {
      configPath = path.join(process.resourcesPath, 'config.json');
    }
    
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
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: false
      },
      // icon: path.join(__dirname, 'assets', 'icon.png'), // Add icon if available
      title: 'Stremio Debridio Emby Resolver'
    });

    // Load the server's web interface once it's ready
    this.mainWindow.loadURL(`http://localhost:${this.serverPort}/status`);
    
    // Inject logging overlay after page loads
    this.mainWindow.webContents.once('did-finish-load', () => {
      this.injectLoggingOverlay();
      
      // Test adding log entries directly after overlay is ready
      setTimeout(() => {
        this.mainWindow.webContents.executeJavaScript(`
          if (typeof window.addLogEntry === 'function') {
            window.addLogEntry('info', 'Direct test message from electron');
            window.addLogEntry('warn', 'Testing if log forwarding works');
          }
        `).catch(err => {
          console.error('Failed to add test log entries:', err);
        });
      }, 1000);
    });

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

  injectLoggingOverlay() {
    this.mainWindow.webContents.executeJavaScript(`
      // Create logging overlay
      const overlay = document.createElement('div');
      overlay.id = 'logging-overlay';
      overlay.style.cssText = \`
        position: fixed;
        top: 10px;
        right: 10px;
        width: 400px;
        height: 300px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        border-radius: 5px;
        z-index: 10000;
        overflow-y: auto;
        display: none;
      \`;
      
      const toggleButton = document.createElement('button');
      toggleButton.textContent = 'Show Logs';
      toggleButton.style.cssText = \`
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 10001;
        background: #007acc;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 3px;
        cursor: pointer;
      \`;
      
      const autoScrollButton = document.createElement('button');
      autoScrollButton.textContent = 'Auto-scroll: ON';
      autoScrollButton.style.cssText = \`
        position: fixed;
        top: 10px;
        right: 420px;
        z-index: 10001;
        background: #28a745;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 3px;
        cursor: pointer;
        display: none;
      \`;
      
      let autoScroll = true;
      let userScrolling = false;
      
      toggleButton.onclick = () => {
        if (overlay.style.display === 'none') {
          overlay.style.display = 'block';
          autoScrollButton.style.display = 'block';
          toggleButton.textContent = 'Hide Logs';
          toggleButton.style.top = '320px';
          autoScrollButton.style.top = '320px';
        } else {
          overlay.style.display = 'none';
          autoScrollButton.style.display = 'none';
          toggleButton.textContent = 'Show Logs';
          toggleButton.style.top = '10px';
          autoScrollButton.style.top = '10px';
        }
      };
      
      autoScrollButton.onclick = () => {
        autoScroll = !autoScroll;
        autoScrollButton.textContent = 'Auto-scroll: ' + (autoScroll ? 'ON' : 'OFF');
        autoScrollButton.style.background = autoScroll ? '#28a745' : '#6c757d';
        if (autoScroll) {
          overlay.scrollTop = overlay.scrollHeight;
        }
      };
      
      // Detect manual scrolling
      overlay.addEventListener('scroll', () => {
        const isAtBottom = overlay.scrollTop + overlay.clientHeight >= overlay.scrollHeight - 5;
        if (!isAtBottom && autoScroll) {
          // User scrolled up, temporarily disable auto-scroll
          userScrolling = true;
          setTimeout(() => {
            userScrolling = false;
          }, 3000); // Re-enable auto-scroll after 3 seconds of no manual scrolling
        } else if (isAtBottom && userScrolling) {
          // User scrolled back to bottom, re-enable auto-scroll
          userScrolling = false;
        }
      });
      
      document.body.appendChild(overlay);
      document.body.appendChild(toggleButton);
      document.body.appendChild(autoScrollButton);
      
      // Function to add log entries
      window.addLogEntry = (level, message) => {
        const logEntry = document.createElement('div');
        logEntry.style.cssText = \`
          margin: 2px 0;
          padding: 2px;
          border-left: 3px solid \${level === 'error' ? '#f44' : level === 'warn' ? '#fa0' : level === 'debug' ? '#888' : '#4af'};
          padding-left: 8px;
          opacity: \${level === 'debug' ? '0.7' : '1'};
        \`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.textContent = \`[\${timestamp}] \${message}\`;
        
        overlay.appendChild(logEntry);
        
        // Only auto-scroll if enabled and user isn't manually scrolling
        if (autoScroll && !userScrolling) {
          overlay.scrollTop = overlay.scrollHeight;
        }
        
        // Keep only last 200 entries (increased from 100)
        while (overlay.children.length > 200) {
          overlay.removeChild(overlay.firstChild);
        }
      };
      
      // Add initial message
      window.addLogEntry('info', 'Logging overlay initialized');
    `);
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
        console.log('Set secure addons URL from command line: ' + this.secureAddonsUrl);
      }

      console.log('Creating StremioPlaylistServer...');
      this.server = new StremioPlaylistServer();
      console.log('Server created, setting up callback...');
      
      // Set up log forwarding from server to electron window
      this.server.setElectronLogCallback((level, message) => {
        console.log(`Callback received: [${level}] ${message}`);
        // Send directly to the window using the same method that works
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.executeJavaScript(`
            if (typeof window.addLogEntry === 'function') {
              window.addLogEntry('${level}', ${JSON.stringify(message)});
            }
          `).catch(() => {
            // Ignore errors if page isn't ready yet
          });
        }
      });
      console.log('Callback set up, starting server...');
      
      // Modify the server to use the secure addons URL if provided
      if (this.secureAddonsUrl) {
        await this.injectSecureAddonsUrl();
      }
      
      console.log('Starting server...');
      await this.server.start();
      
      console.log('Server started successfully on port ' + this.serverPort);
      this.sendServerStatus('Running');
      
    } catch (error) {
      console.error('Failed to start server: ' + error.message);
      dialog.showErrorBox('Server Error', 'Failed to start the server: ' + error.message);
    }
  }

  

  

  sendLogToWindow(level, message) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.executeJavaScript(`
        if (typeof window.addLogEntry === 'function') {
          window.addLogEntry('${level}', ${JSON.stringify(message)});
        }
      `).catch(() => {
        // Ignore errors if page isn't ready yet
      });
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