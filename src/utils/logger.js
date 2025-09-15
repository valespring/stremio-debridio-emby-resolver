const fs = require('fs-extra');
const path = require('path');

class Logger {
  constructor(config = {}) {
    this.config = {
      level: config.level || 'info',
      enableConsole: config.enableConsole !== false,
      enableFile: config.enableFile || false,
      logFile: config.logFile || './logs/app.log',
      ...config
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    // Ensure log directory exists if file logging is enabled
    if (this.config.enableFile) {
      this.ensureLogDirectory();
    }
  }

  async ensureLogDirectory() {
    try {
      const logDir = path.dirname(this.config.logFile);
      await fs.ensureDir(logDir);
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.config.level];
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
  }

  async log(level, message, ...args) {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, ...args);

    // Console logging
    if (this.config.enableConsole) {
      switch (level) {
        case 'error':
          console.error(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'debug':
          console.debug(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    }

    // File logging
    if (this.config.enableFile) {
      try {
        await fs.appendFile(this.config.logFile, formattedMessage + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  error(message, ...args) {
    return this.log('error', message, ...args);
  }

  warn(message, ...args) {
    return this.log('warn', message, ...args);
  }

  info(message, ...args) {
    return this.log('info', message, ...args);
  }

  debug(message, ...args) {
    return this.log('debug', message, ...args);
  }
}

module.exports = Logger;