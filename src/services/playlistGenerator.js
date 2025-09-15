const fs = require('fs-extra');
const path = require('path');
const MESSAGES = require('../messages');

class PlaylistGenerator {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async generate(content) {
    try {
      this.logger.info(MESSAGES.PLAYLIST_GENERATOR.GENERATION_STARTED);
      
      // Create backup of existing playlist if it exists
      await this.createBackup();
      
      // Validate and filter content
      const validContent = await this.validateContent(content);
      
      // Generate M3U playlist content
      const playlistContent = this.generateM3UContent(validContent);
      
      // Write playlist to file
      await this.writePlaylistFile(playlistContent);
      
      this.logger.info(MESSAGES.PLAYLIST_GENERATOR.GENERATION_COMPLETED(validContent.length, this.config.outputPath));
      
    } catch (error) {
      this.logger.error(MESSAGES.PLAYLIST_GENERATOR.GENERATION_FAILED, error);
      throw error;
    }
  }

  async createBackup() {
    try {
      if (await fs.pathExists(this.config.outputPath)) {
        // Ensure backups directory exists
        const backupsDir = 'backups';
        await fs.ensureDir(backupsDir);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.basename(this.config.outputPath);
        const backupPath = path.join(backupsDir, `${filename}.backup.${timestamp}`);
        
        await fs.copy(this.config.outputPath, backupPath);
        this.logger.info(MESSAGES.PLAYLIST_GENERATOR.BACKUP_CREATED(backupPath));
      }
    } catch (error) {
      this.logger.warn(MESSAGES.PLAYLIST_GENERATOR.BACKUP_FAILED, error.message);
      // Don't throw - backup failure shouldn't stop playlist generation
    }
  }

  async validateContent(content) {
    this.logger.info(MESSAGES.PLAYLIST_GENERATOR.VALIDATION_STARTED);
    
    const validContent = [];
    
    for (const item of content) {
      if (this.isValidContentItem(item)) {
        // Filter streams to only include available ones
        const availableStreams = item.streams.filter(stream => stream.availability);
        
        if (availableStreams.length > 0) {
          validContent.push({
            ...item,
            streams: availableStreams
          });
        }
      }
    }
    
    this.logger.info(MESSAGES.PLAYLIST_GENERATOR.VALIDATION_COMPLETED(validContent.length, content.length));
    return validContent;
  }

  isValidContentItem(item) {
    return (
      item &&
      item.title &&
      item.streams &&
      Array.isArray(item.streams) &&
      item.streams.length > 0
    );
  }

  generateM3UContent(content) {
    let m3uContent = '#EXTM3U\n';
    m3uContent += `#PLAYLIST:${this.config.name}\n\n`;
    
    let channelNumber = 1;
    
    for (const item of content) {
      // Filter streams and log the filtering
      const originalStreamCount = item.streams.length;
      const availableStreams = item.streams.filter(stream => stream.availability && stream.url);
      
      if (originalStreamCount !== availableStreams.length) {
        this.logger.debug(MESSAGES.PLAYLIST_GENERATOR.STREAM_FILTERED(originalStreamCount, availableStreams.length));
      }
      
      // Add each available stream as a separate entry
      for (const stream of availableStreams) {
        const duration = item.duration ? Math.floor(item.duration * 60) : -1; // Convert minutes to seconds
        const title = this.formatTitle(item, stream);
        const groupTitle = this.getGroupTitle(item);
        
        // Generate unique channel ID for EPG matching
        const channelId = this.generateChannelId(item, stream);
        
        // Build EXTINF line with Emby-compatible attributes
        let extinfLine = `#EXTINF:${duration}`;
        
        // Add tvg-id for EPG matching
        extinfLine += ` tvg-id="${channelId}"`;
        
        // Add tvg-name for channel identification
        extinfLine += ` tvg-name="${this.sanitizeAttribute(title)}"`;
        
        // Add tvg-logo for thumbnails (Emby's preferred method)
        if (item.poster) {
          extinfLine += ` tvg-logo="${item.poster}"`;
        }
        
        // Add group-title for channel grouping
        if (groupTitle) {
          extinfLine += ` group-title="${this.sanitizeAttribute(groupTitle)}"`;
        }
        
        // Add channel number
        extinfLine += ` tvg-chno="${channelNumber}"`;
        
        // Add additional attributes for better Emby integration
        if (item.genre) {
          extinfLine += ` tvg-genre="${this.sanitizeAttribute(item.genre)}"`;
        }
        
        if (item.language && item.language !== 'en') {
          extinfLine += ` tvg-language="${item.language}"`;
        }
        
        // Add the title at the end
        extinfLine += `,${title}\n`;
        
        m3uContent += extinfLine;
        
        // Add legacy metadata for backward compatibility
        if (groupTitle) {
          m3uContent += `#EXTGRP:${groupTitle}\n`;
        }
        
        // Keep EXTIMG for players that still use it
        if (item.poster) {
          m3uContent += `#EXTIMG:${item.poster}\n`;
        }
        
        if (item.year) {
          m3uContent += `#EXTYEAR:${item.year}\n`;
        }
        
        if (item.genre) {
          m3uContent += `#EXTGENRE:${item.genre}\n`;
        }
        
        if (item.imdbRating) {
          m3uContent += `#EXTRATING:${item.imdbRating}\n`;
        }
        
        // Stream URL
        m3uContent += `${stream.url}\n\n`;
        
        channelNumber++;
      }
    }
    
    return m3uContent;
  }

  formatTitle(item, stream) {
    let title = item.title;
    
    if (item.year) {
      title += ` (${item.year})`;
    }
    
    if (stream.quality) {
      title += ` [${stream.quality}]`;
    }
    
    if (stream.source && stream.source !== 'HTTP') {
      title += ` - ${stream.source}`;
    }
    
    return title;
  }

  getGroupTitle(item) {
    const parts = [];
    
    if (item.type) {
      parts.push(item.type.charAt(0).toUpperCase() + item.type.slice(1) + 's');
    }
    
    if (item.genre) {
      parts.push(item.genre);
    }
    
    if (item.language && item.language !== 'en') {
      parts.push(item.language.toUpperCase());
    }
    
    return parts.join(' - ') || 'General';
  }

  generateChannelId(item, stream) {
    // Create a unique but consistent channel ID for EPG matching
    const baseId = item.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);
    
    const streamId = stream.source
      ? stream.source.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10)
      : 'default';
    
    return `${baseId}-${streamId}`;
  }

  sanitizeAttribute(value) {
    // Sanitize attribute values for M3U format
    if (!value) return '';
    
    return value
      .replace(/"/g, "'")  // Replace double quotes with single quotes
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/\r/g, ' ') // Replace carriage returns with spaces
      .trim();
  }

  async writePlaylistFile(content) {
    try {
      // Ensure output directory exists
      const outputDir = path.dirname(this.config.outputPath);
      await fs.ensureDir(outputDir);
      
      // Write playlist file
      await fs.writeFile(this.config.outputPath, content, 'utf8');
      
    } catch (error) {
      this.logger.error(MESSAGES.PLAYLIST_GENERATOR.WRITE_ERROR, error);
      throw error;
    }
  }

  async getPlaylistStats() {
    try {
      if (await fs.pathExists(this.config.outputPath)) {
        const content = await fs.readFile(this.config.outputPath, 'utf8');
        const lines = content.split('\n');
        const entryCount = lines.filter(line => line.startsWith('#EXTINF:')).length;
        const stats = await fs.stat(this.config.outputPath);
        
        return {
          exists: true,
          entryCount,
          fileSize: stats.size,
          lastModified: stats.mtime,
          path: this.config.outputPath
        };
      }
      
      return {
        exists: false,
        entryCount: 0,
        fileSize: 0,
        lastModified: null,
        path: this.config.outputPath
      };
    } catch (error) {
      this.logger.error(MESSAGES.PLAYLIST_GENERATOR.STATS_ERROR, error);
      return {
        exists: false,
        entryCount: 0,
        fileSize: 0,
        lastModified: null,
        path: this.config.outputPath,
        error: error.message
      };
    }
  }
}

module.exports = PlaylistGenerator;