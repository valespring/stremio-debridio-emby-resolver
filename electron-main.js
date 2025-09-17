const { app, BrowserWindow, Menu, Tray, dialog, shell, ipcMain } = require('electron');
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
    this.userConfig = null;
    
    // Load user configuration
    this.loadUserConfig();
    
    // Parse command line arguments for secure Debridio URL
    this.parseCommandLineArgs();
    
    // Set up app event handlers
    this.setupAppHandlers();
    
    // Set up IPC handlers
    this.setupIPC();
  }

  loadPortFromConfig() {
    // In development, config is in __dirname
    // In production, config is in resources directory
    let configPath = path.join(__dirname, 'config.json');
    
    // Check if we're in a packaged app (app.isPackaged is more reliable)
    if (app.isPackaged && process.resourcesPath) {
      configPath = path.join(process.resourcesPath, 'config.json');
    }
    
    // Fallback: if config doesn't exist at the calculated path, try the project root
    if (!fs.existsSync(configPath)) {
      configPath = path.join(__dirname, 'config.json');
    }
    
    console.log('Loading config from:', configPath);
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.server.port;
  }

  parseCommandLineArgs() {
    // Skip command line parsing in electron app - we only use user config
    console.log('Skipping command line parsing in electron app');
  }

  setupAppHandlers() {
    app.whenReady().then(() => {
      this.killExistingInstances();
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

  loadUserConfig() {
    try {
      const userDataPath = app.getPath('userData');
      const configPath = path.join(userDataPath, 'user-config.json');
      
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        this.userConfig = JSON.parse(configData);
        console.log('Loaded user config from:', configPath);
        
        // Use saved Debridio URL if available
        if (this.userConfig.debridioUrl) {
          this.secureAddonsUrl = this.userConfig.debridioUrl;
          console.log('Using saved Debridio URL from user config');
        }
      } else {
        console.log('No user config found, will create on first setup');
        this.userConfig = {};
      }
    } catch (error) {
      console.error('Error loading user config:', error);
      this.userConfig = {};
    }
  }

  saveUserConfig() {
    try {
      const userDataPath = app.getPath('userData');
      const configPath = path.join(userDataPath, 'user-config.json');
      
      // Ensure directory exists
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      
      fs.writeFileSync(configPath, JSON.stringify(this.userConfig, null, 2));
      console.log('Saved user config to:', configPath);
    } catch (error) {
      console.error('Error saving user config:', error);
    }
  }

  setupIPC() {
    // Handle settings requests
    ipcMain.handle('get-debridio-url', () => {
      return this.userConfig.debridioUrl || '';
    });

    ipcMain.handle('save-debridio-url', (event, url) => {
      this.userConfig.debridioUrl = url;
      this.secureAddonsUrl = url;
      this.saveUserConfig();
      return true;
    });

    ipcMain.handle('restart-server', async () => {
      try {
        if (this.server) {
          await this.server.stop();
        }
        await this.startServer();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('clear-debridio-url', async () => {
      try {
        // Clear the user config
        this.userConfig.debridioUrl = '';
        this.secureAddonsUrl = null;
        this.saveUserConfig();
        
        // Clear environment variable
        delete process.env.SECURE_DEBRIDIO_URL;
        
        // Stop the server
        if (this.server) {
          await this.server.stop();
        }
        
        // Show settings dialog again
        setTimeout(() => {
          this.showSettingsDialog();
        }, 500);
        
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // Handle context menu for input fields
    ipcMain.handle('show-context-menu', (event) => {
      const template = [
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          click: () => {
            event.sender.cut();
          }
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          click: () => {
            event.sender.copy();
          }
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            event.sender.paste();
          }
        },
        { type: 'separator' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          click: () => {
            event.sender.selectAll();
          }
        }
      ];
      
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
    });
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: false,
        allowRunningInsecureContent: true,
        webSecurity: false // Allow localhost HTTP content
      },
      // icon: path.join(__dirname, 'assets', 'icon.png'), // Add icon if available
      title: 'Stremio Debridio Emby Resolver'
    });

    // Fix MaxListenersExceededWarning
    this.mainWindow.webContents.setMaxListeners(20);

    // Wait for server to be ready before deciding what to show
    setTimeout(() => {
      if (!this.secureAddonsUrl) {
        console.log('No secure addon URL found, showing settings dialog');
        this.showSettingsDialog();
      } else {
        console.log('Secure addon URL found, waiting for server then loading status page');
        // Wait for server to be fully ready
        this.waitForServerThenLoadStatus();
      }
    }, 1000);
    
    // Temporarily disable log overlay to test if it's causing the white screen
    // this.mainWindow.webContents.on('did-finish-load', () => {
    //   // Log overlay injection disabled for debugging
    // });
  }

  waitForServerThenLoadStatus() {
    console.log('Waiting for server to be ready...');
    
    // Show a loading page while waiting for server
    this.mainWindow.loadURL('data:text/html,<html><body style="background:#1a1a1a;color:#00ff00;padding:20px;font-family:monospace;text-align:center;"><h1>🎬 Stremio Debridio Emby Resolver</h1><p>Starting server...</p><div style="margin:20px;">⏳</div></body></html>');
    
    // Check if server is ready by trying to connect
    const checkServer = async () => {
      try {
        const response = await fetch(`http://localhost:${this.serverPort}/health`);
        if (response.ok) {
          console.log('Server is ready, checking if content is being fetched...');
          
          // Check if server is currently updating/fetching content
          try {
            const statusResponse = await fetch(`http://localhost:${this.serverPort}/status`);
            const statusData = await statusResponse.json();
            
            if (statusData.playlist && statusData.playlist.isUpdating) {
              console.log('Server is fetching content, showing refreshing screen');
              // Load the status page which will show the refreshing state
              this.mainWindow.loadURL(`http://localhost:${this.serverPort}/status`);
            } else {
              console.log('Server is ready and not updating, loading status page');
              this.mainWindow.loadURL(`http://localhost:${this.serverPort}/status`);
            }
          } catch (statusError) {
            console.log('Could not get status, loading status page anyway');
            this.mainWindow.loadURL(`http://localhost:${this.serverPort}/status`);
          }
        } else {
          throw new Error('Server not ready');
        }
      } catch (error) {
        console.log('Server not ready yet, retrying...');
        setTimeout(checkServer, 1000);
      }
    };
    
    // Start checking immediately since server now starts faster
    setTimeout(checkServer, 500);

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

    // Set up application menu
    this.createMenu();
  }

  showSettingsDialog() {
    const settingsHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Debridio Configuration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            color: #ffffff;
            margin: 0;
            padding: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            background: #2a2a2a;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
        }
        h1 {
            color: #00ccff;
            text-align: center;
            margin-bottom: 30px;
            font-size: 24px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #cccccc;
            font-weight: 500;
        }
        input[type="url"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #444;
            border-radius: 6px;
            background: #333;
            color: #fff;
            font-size: 14px;
            box-sizing: border-box;
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
            -webkit-touch-callout: default !important;
            -webkit-tap-highlight-color: transparent;
        }
        input[type="url"]:focus {
            outline: none;
            border-color: #00ccff;
        }
        .example {
            background: #333;
            padding: 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            margin-top: 8px;
            word-break: break-all;
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
            cursor: text;
        }
        .button-group {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-top: 30px;
        }
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .btn-primary {
            background: #007acc;
            color: white;
        }
        .btn-primary:hover {
            background: #005a99;
        }
        .btn-secondary {
            background: #666;
            color: white;
        }
        .btn-secondary:hover {
            background: #555;
        }
        .help-text {
            font-size: 12px;
            color: #999;
            margin-top: 8px;
            line-height: 1.4;
        }
        .example {
            background: #333;
            padding: 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 11px;
            margin-top: 8px;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Debridio Configuration</h1>
        <form id="settingsForm">
            <div class="form-group">
                <label for="debridioUrl">Debridio URL:</label>
                <input type="url" id="debridioUrl" placeholder="https://tv-addon.debridio.com/your-config/manifest.json" required pattern="https://.*debridio\.com/.*manifest\.json$">
                <div class="help-text">
                    Enter your Debridio addon URL. Must be a valid Debridio manifest URL ending with manifest.json
                </div>
                <div class="example">
                    Example: https://tv-addon.debridio.com/your-base64-encoded-config/manifest.json
                </div>
                <div id="urlError" style="color: #ff4444; font-size: 12px; margin-top: 4px; display: none;">
                    Please enter a valid Debridio manifest URL (must contain 'debridio.com' and end with 'manifest.json')
                </div>
            </div>
            
            <div class="button-group">
                <button type="submit" class="btn-primary">Save & Start</button>
                <button type="button" id="cancelBtn" class="btn-secondary">Cancel</button>
            </div>
        </form>
    </div>

    <script>
        const { ipcRenderer } = require('electron');
        
        // Load existing URL if available
        ipcRenderer.invoke('get-debridio-url').then(url => {
            if (url) {
                document.getElementById('debridioUrl').value = url;
            }
        });

        // Enable right-click context menu for paste functionality
        document.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            await ipcRenderer.invoke('show-context-menu');
        });

        // Enable keyboard shortcuts and ensure input works properly
        document.addEventListener('keydown', (e) => {
            // Allow all normal keyboard input
            if (e.target.tagName === 'INPUT') {
                // Don't prevent default for normal typing
                if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                    return true;
                }
                
                if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                    // Allow paste
                    return true;
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                    // Allow copy
                    return true;
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                    // Allow cut
                    return true;
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                    e.target.select();
                    e.preventDefault();
                    return false;
                }
            }
        });

        // Ensure input field is properly focusable and selectable
        document.addEventListener('DOMContentLoaded', () => {
            const input = document.getElementById('debridioUrl');
            if (input) {
                // Make sure the input can receive focus and selection
                input.addEventListener('focus', () => {
                    console.log('Input focused');
                });
                
                input.addEventListener('click', (e) => {
                    e.stopPropagation();
                    input.focus();
                });
                
                // Allow text selection on double-click
                input.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    input.select();
                });
            }
        });

        // URL validation function
        function validateDebridioUrl(url) {
            if (!url) return false;
            
            // Must be HTTPS
            if (!url.startsWith('https://')) return false;
            
            // Must contain debridio.com
            if (!url.includes('debridio.com')) return false;
            
            // Must end with manifest.json
            if (!url.endsWith('manifest.json')) return false;
            
            return true;
        }

        // Real-time validation
        document.getElementById('debridioUrl').addEventListener('input', (e) => {
            const url = e.target.value.trim();
            const errorDiv = document.getElementById('urlError');
            const submitBtn = document.querySelector('button[type="submit"]');
            
            if (url && !validateDebridioUrl(url)) {
                errorDiv.style.display = 'block';
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.5';
            } else {
                errorDiv.style.display = 'none';
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            }
        });

        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('debridioUrl').value.trim();
            
            if (!validateDebridioUrl(url)) {
                document.getElementById('urlError').style.display = 'block';
                return;
            }
            
            if (url) {
                await ipcRenderer.invoke('save-debridio-url', url);
                
                // Show loading message
                document.body.innerHTML = '<div style="background:#1a1a1a;color:#00ff00;padding:20px;font-family:monospace;text-align:center;height:100vh;display:flex;flex-direction:column;justify-content:center;"><h1>🎬 Restarting Server</h1><p>Please wait while the server restarts with your new configuration...</p><div style="margin:20px;">⏳</div></div>';
                
                // Restart server with new URL
                const result = await ipcRenderer.invoke('restart-server');
                if (result.success) {
                    // Wait for server to be ready, then redirect
                    const checkServer = async () => {
                        try {
                            const response = await fetch('http://localhost:' + ${this.serverPort} + '/health');
                            if (response.ok) {
                                window.location.href = 'http://localhost:' + ${this.serverPort} + '/status';
                            } else {
                                throw new Error('Server not ready');
                            }
                        } catch (error) {
                            setTimeout(checkServer, 1000);
                        }
                    };
                    setTimeout(checkServer, 2000);
                } else {
                    alert('Error restarting server: ' + result.error);
                }
            }
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            window.close();
        });
    </script>
</body>
</html>`;

    try {
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(settingsHtml);
      console.log('Loading settings dialog...');
      this.mainWindow.loadURL(dataUrl);
    } catch (error) {
      console.error('Error loading settings dialog:', error);
      // Fallback to a simple settings page
      this.mainWindow.loadURL('data:text/html,<html><body style="background:#1a1a1a;color:#fff;padding:20px;"><h1>Settings Error</h1><p>Please restart the app.</p></body></html>');
    }
  }

  createMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Settings...',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.showSettingsDialog();
            }
          },
          { type: 'separator' },
          {
            label: 'Refresh Playlist',
            accelerator: 'CmdOrCtrl+R',
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
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.isQuiting = true;
              app.quit();
            }
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Status Page',
            accelerator: 'CmdOrCtrl+1',
            click: () => {
              this.mainWindow.loadURL(`http://localhost:${this.serverPort}/status`);
            }
          },
          {
            label: 'Download Playlist',
            accelerator: 'CmdOrCtrl+2',
            click: () => {
              shell.openExternal(`http://localhost:${this.serverPort}/playlist`);
            }
          },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      }
    ];

    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      });

      // Window menu
      template[3].submenu = [
        { role: 'close' },
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ];
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  injectLoggingOverlay() {
    try {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        console.log('Cannot inject logging overlay - window not available');
        return;
      }
      
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
    } catch (error) {
      console.error('Error injecting logging overlay:', error);
    }
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
    console.log('=== ELECTRON startServer() method called ===');
    try {
      // If secureAddonsUrl is provided, inject it into the environment
      // Clear any existing environment variable to prevent duplicates
      delete process.env.SECURE_DEBRIDIO_URL;
      
      // Set the environment variable ONLY if we have a URL from user config
      if (this.secureAddonsUrl) {
        process.env.SECURE_DEBRIDIO_URL = this.secureAddonsUrl;
        console.log('Set secure Debridio URL for server: ' + this.secureAddonsUrl);
      } else {
        console.log('No Debridio URL configured - server will run without Debridio content');
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
      
      // Test if callback is actually set
      console.log('Testing callback immediately...');
      if (this.server.electronLogCallback) {
        console.log('Callback exists, calling it...');
        this.server.electronLogCallback('info', 'Immediate callback test');
      } else {
        console.log('ERROR: Callback was not set properly');
      }
      
      // Note: No need to inject into config file anymore,
      // the server will read from environment variable directly
      
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


  killExistingInstances() {
    const { exec } = require('child_process');
    const os = require('os');
    
    if (os.platform() === 'darwin') {
      // macOS
      exec('pkill -f "Electron.*stremio-debridio-emby-resolver"', (error) => {
        if (error && error.code !== 1) { // code 1 means no processes found, which is fine
          console.log('Note: Could not kill existing processes:', error.message);
        } else {
          console.log('Killed any existing Electron instances');
        }
      });
    } else if (os.platform() === 'win32') {
      // Windows
      exec('taskkill /f /im electron.exe', (error) => {
        if (error && error.code !== 128) { // code 128 means no processes found
          console.log('Note: Could not kill existing processes:', error.message);
        } else {
          console.log('Killed any existing Electron instances');
        }
      });
    } else {
      // Linux
      exec('pkill -f electron', (error) => {
        if (error && error.code !== 1) {
          console.log('Note: Could not kill existing processes:', error.message);
        } else {
          console.log('Killed any existing Electron instances');
        }
      });
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