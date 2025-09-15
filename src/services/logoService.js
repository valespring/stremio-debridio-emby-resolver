const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const MESSAGES = require('../messages');
const packageInfo = require('../../package.json');
const { getChannelVariations } = require('../channels/variations');

class LogoService {
  constructor(logger, config = null) {
    this.logger = logger;
    this.logoCache = new Map();
    
    // Use a writable cache directory - in packaged app, use resources directory
    if (process.resourcesPath) {
      this.cacheDir = path.join(process.resourcesPath, 'cache', 'logos');
    } else {
      this.cacheDir = path.join(__dirname, '../../cache/logos');
    }
    
    this.metadataFile = path.join(this.cacheDir, 'metadata.json');
    this.cacheMetadata = new Map();
    
    // Use config.stremio.userAgent if available, otherwise fallback to package info
    this.userAgent = config?.stremio?.userAgent ||
                     `${packageInfo.name}/${packageInfo.version} (${packageInfo.description || 'M3U playlist generator'})`;
    
    this.httpClient = axios.create({
      timeout: 5000,
      headers: {
        'User-Agent': this.userAgent
      }
    });
    
    // Initialize cache directory and load existing cache
    this.initializeCache();
  }

  async initializeCache() {
    try {
      // Ensure cache directory exists
      await fs.ensureDir(this.cacheDir);
      
      // Load existing cache metadata
      if (await fs.pathExists(this.metadataFile)) {
        const metadata = await fs.readJson(this.metadataFile);
        this.cacheMetadata = new Map(Object.entries(metadata));
        this.logger.debug(`Loaded ${this.cacheMetadata.size} cached logo entries`);
      }
    } catch (error) {
      this.logger.warn(`Failed to initialize logo cache: ${error.message}`);
    }
  }

  async getChannelLogo(channelName, debridioLogo = null) {
    const cacheKey = channelName.toLowerCase();
    
    // Ensure cache is initialized
    await this.ensureCacheInitialized();
    
    // Check in-memory cache first
    if (this.logoCache.has(cacheKey)) {
      this.logger.debug(MESSAGES.LOGO_SERVICE.CACHE_HIT(channelName));
      return this.logoCache.get(cacheKey);
    }

    // Check persistent cache
    const cachedLogo = await this.getCachedLogo(cacheKey);
    if (cachedLogo) {
      this.logger.debug(`Found cached logo for ${channelName}`);
      this.logoCache.set(cacheKey, cachedLogo);
      return cachedLogo;
    }

    this.logger.debug(MESSAGES.LOGO_SERVICE.CACHE_MISS(channelName));

    try {
      let logoUrl = null;
      let logoSource = 'placeholder';

      // 1. Try Wikimedia first (highest priority)
      this.logger.debug(`Searching Wikimedia for logo: ${channelName}`);
      const wikimediaLogo = await this.searchWikimediaLogo(channelName);
      if (wikimediaLogo) {
        logoUrl = wikimediaLogo;
        logoSource = 'wikimedia';
        this.logger.info(`Found Wikimedia logo for ${channelName}: ${wikimediaLogo}`);
      }
      // 2. Use Debridio logo if available (medium priority)
      else if (debridioLogo) {
        this.logger.debug(MESSAGES.LOGO_SERVICE.DEBRIDIO_FALLBACK(channelName));
        logoUrl = debridioLogo;
        logoSource = 'debridio';
      }
      // 3. Generate placeholder (lowest priority)
      else {
        logoUrl = this.generatePlaceholderLogo(channelName);
        logoSource = 'placeholder';
        this.logger.debug(MESSAGES.LOGO_SERVICE.PLACEHOLDER_FALLBACK(channelName));
      }

      // Cache the result (download file if it's a remote URL)
      const cachedLogoPath = await this.cacheLogo(cacheKey, logoUrl, logoSource);
      this.logoCache.set(cacheKey, cachedLogoPath || logoUrl);
      return cachedLogoPath || logoUrl;

    } catch (error) {
      this.logger.warn(MESSAGES.LOGO_SERVICE.SERVICE_ERROR(channelName, error.message));
      
      // Fallback to placeholder on error
      const placeholderLogo = this.generatePlaceholderLogo(channelName);
      const cachedPlaceholder = await this.cacheLogo(cacheKey, placeholderLogo, 'placeholder');
      this.logoCache.set(cacheKey, cachedPlaceholder || placeholderLogo);
      return cachedPlaceholder || placeholderLogo;
    }
  }

  async ensureCacheInitialized() {
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }
  }

  async getCachedLogo(cacheKey) {
    try {
      const metadata = this.cacheMetadata.get(cacheKey);
      if (!metadata) return null;

      // Check if cache is still valid (30 days)
      const cacheAge = Date.now() - metadata.timestamp;
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
      
      if (cacheAge > maxAge) {
        this.logger.debug(`Cache expired for ${cacheKey}`);
        await this.removeCachedLogo(cacheKey);
        return null;
      }

      // Check if local file exists
      if (metadata.localPath) {
        const localFilePath = path.join(this.cacheDir, metadata.localPath);
        if (await fs.pathExists(localFilePath)) {
          return localFilePath;
        } else {
          // File was deleted, remove from cache
          this.logger.debug(`Cached file missing for ${cacheKey}, removing from cache`);
          await this.removeCachedLogo(cacheKey);
          return null;
        }
      }

      // Fallback to URL if no local file
      return metadata.url;
    } catch (error) {
      this.logger.debug(`Failed to get cached logo for ${cacheKey}: ${error.message}`);
      return null;
    }
  }

  async cacheLogo(cacheKey, logoUrl, source) {
    try {
      let localPath = null;
      let finalUrl = logoUrl;

      // Download and store file locally for remote URLs
      if (source === 'wikimedia' || source === 'debridio') {
        try {
          const downloadResult = await this.downloadLogoFile(logoUrl, cacheKey);
          if (downloadResult) {
            localPath = downloadResult.filename;
            finalUrl = downloadResult.fullPath;
            this.logger.debug(`Downloaded logo file for ${cacheKey}: ${localPath}`);
          }
        } catch (downloadError) {
          this.logger.debug(`Failed to download logo for ${cacheKey}: ${downloadError.message}`);
          // Continue with URL fallback
        }
      }

      const metadata = {
        url: logoUrl,
        localPath: localPath,
        source: source,
        timestamp: Date.now()
      };

      this.cacheMetadata.set(cacheKey, metadata);
      
      // Save metadata to file
      await this.saveCacheMetadata();
      
      this.logger.debug(`Cached logo for ${cacheKey} from ${source}${localPath ? ' (downloaded)' : ' (URL only)'}`);
      
      // Return the local path if available, otherwise the original URL
      return finalUrl;
    } catch (error) {
      this.logger.debug(`Failed to cache logo for ${cacheKey}: ${error.message}`);
      return null;
    }
  }

  async removeCachedLogo(cacheKey) {
    try {
      const metadata = this.cacheMetadata.get(cacheKey);
      
      // Remove local file if it exists
      if (metadata?.localPath) {
        const localFilePath = path.join(this.cacheDir, metadata.localPath);
        try {
          await fs.remove(localFilePath);
          this.logger.debug(`Removed cached file: ${metadata.localPath}`);
        } catch (fileError) {
          this.logger.debug(`Failed to remove cached file ${metadata.localPath}: ${fileError.message}`);
        }
      }
      
      this.cacheMetadata.delete(cacheKey);
      await this.saveCacheMetadata();
    } catch (error) {
      this.logger.debug(`Failed to remove cached logo for ${cacheKey}: ${error.message}`);
    }
  }

  async saveCacheMetadata() {
    try {
      const metadata = Object.fromEntries(this.cacheMetadata);
      await fs.writeJson(this.metadataFile, metadata, { spaces: 2 });
    } catch (error) {
      this.logger.debug(`Failed to save cache metadata: ${error.message}`);
    }
  }

  async searchWikimediaLogo(channelName) {
    try {
      this.logger.debug(MESSAGES.LOGO_SERVICE.WIKIMEDIA_SEARCH(channelName));

      // Generate search terms for the channel
      const searchTerms = this.generateSearchTerms(channelName);
      
      for (const searchTerm of searchTerms) {
        const logo = await this.queryWikimediaForTerm(searchTerm);
        if (logo) {
          this.logger.info(MESSAGES.LOGO_SERVICE.WIKIMEDIA_SUCCESS(channelName, logo));
          return logo;
        }
      }

      this.logger.debug(MESSAGES.LOGO_SERVICE.WIKIMEDIA_FAILED(channelName));
      return null;

    } catch (error) {
      this.logger.debug(MESSAGES.LOGO_SERVICE.WIKIMEDIA_FAILED(channelName, error.message));
      return null;
    }
  }

  generateSearchTerms(channelName) {
    const terms = [];
    const cleanName = channelName.replace(/\s+/g, ' ').trim();
    
    // Generate variations of the channel name for search
    const baseTerms = [
      cleanName,
      `${cleanName} logo`,
      `${cleanName} television logo`,
      `${cleanName} TV logo`,
      `${cleanName} network logo`,
      `${cleanName} channel logo`
    ];

    // Add common variations and abbreviations
    const variations = getChannelVariations(cleanName);
    
    // Combine all terms
    terms.push(...baseTerms, ...variations);
    
    // Remove duplicates and return
    return [...new Set(terms)];
  }


  async queryWikimediaForTerm(searchTerm) {
    try {
      // Use Wikimedia Commons API to search for logo files
      const searchUrl = 'https://commons.wikimedia.org/w/api.php';
      const params = {
        action: 'query',
        format: 'json',
        list: 'search',
        srsearch: `${searchTerm} filetype:svg|png|jpg`,
        srnamespace: 6, // File namespace
        srlimit: 10,
        origin: '*'
      };

      const searchResponse = await this.httpClient.get(searchUrl, { params });
      const searchResults = searchResponse.data?.query?.search;

      if (!searchResults || searchResults.length === 0) {
        return null;
      }

      // Try to get the actual file URL for the most relevant results
      for (const result of searchResults) {
        // Filter for logo files and current/recent versions
        if (this.isValidLogoFile(result.title, searchTerm)) {
          const fileUrl = await this.getWikimediaFileUrl(result.title);
          if (fileUrl) {
            return fileUrl;
          }
        }
      }

      return null;

    } catch (error) {
      this.logger.debug(MESSAGES.LOGO_SERVICE.WIKIMEDIA_QUERY_FAILED(searchTerm, error.message));
      return null;
    }
  }

  async getWikimediaFileUrl(fileName) {
    try {
      const apiUrl = 'https://commons.wikimedia.org/w/api.php';
      const params = {
        action: 'query',
        format: 'json',
        titles: fileName,
        prop: 'imageinfo',
        iiprop: 'url|size',
        iiurlwidth: 200, // Get a 200px wide thumbnail
        origin: '*'
      };

      const response = await this.httpClient.get(apiUrl, {
        params,
        headers: {
          'User-Agent': this.userAgent
        }
      });
      const pages = response.data?.query?.pages;
      
      if (!pages) return null;

      const page = Object.values(pages)[0];
      const imageInfo = page?.imageinfo?.[0];
      
      // Prefer thumbnail URL for consistent sizing, fallback to original
      return imageInfo?.thumburl || imageInfo?.url || null;

    } catch (error) {
      this.logger.debug(MESSAGES.LOGO_SERVICE.WIKIMEDIA_FILE_FAILED(fileName, error.message));
      return null;
    }
  }

  isValidLogoFile(fileName, searchTerm) {
    const name = fileName.toLowerCase();
    const term = searchTerm.toLowerCase();
    
    // Must be a valid image format
    const validFormat = /\.(svg|png|jpg|jpeg)$/i.test(name);
    if (!validFormat) return false;
    
    // Should contain "logo" or be clearly a logo file
    const hasLogo = name.includes('logo') || name.includes('wordmark') || name.includes('brand');
    if (!hasLogo) return false;
    
    // Exclude unwanted file types
    const excludeTerms = [
      'screenshot', 'poster', 'banner', 'wallpaper', 'icon', 'favicon',
      'old', 'former', 'previous', 'historic', 'vintage', 'retro',
      'concept', 'draft', 'proposal', 'mockup', 'variant'
    ];
    const hasExcludedTerm = excludeTerms.some(exclude => name.includes(exclude));
    if (hasExcludedTerm) return false;
    
    // Prefer current/recent logos
    const currentTerms = ['2024', '2023', '2022', '2021', '2020', 'current', 'new'];
    const isCurrent = currentTerms.some(current => name.includes(current));
    
    // Extract key terms from search to match against filename
    const searchWords = term.replace(/\s+logo.*$/, '').split(/\s+/);
    const matchesSearch = searchWords.some(word => 
      word.length > 2 && name.includes(word.toLowerCase())
    );
    
    // Prioritize files that match search terms and are current
    return matchesSearch && (isCurrent || !name.match(/\d{4}/)); // Prefer current or undated
  }

  generatePlaceholderLogo(channelName) {
    const encodedName = encodeURIComponent(channelName);
    return `https://via.placeholder.com/200x200/1e3a8a/ffffff?text=${encodedName}`;
  }

  clearCache() {
    this.logoCache.clear();
    this.logger.info(MESSAGES.LOGO_SERVICE.CACHE_CLEARED);
  }

  getCacheSize() {
    return this.logoCache.size;
  }

  getCacheStats() {
    return {
      size: this.logoCache.size,
      entries: Array.from(this.logoCache.keys())
    };
  }

  async downloadLogoFile(url, cacheKey) {
    try {
      // Get file extension from URL
      const urlPath = new URL(url).pathname;
      const extension = path.extname(urlPath) || '.png';
      
      // Generate safe filename
      const safeKey = cacheKey.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeKey}${extension}`;
      const fullPath = path.join(this.cacheDir, filename);

      // Download the file
      const response = await this.httpClient.get(url, {
        responseType: 'stream',
        timeout: 10000 // 10 second timeout for downloads
      });

      // Create write stream and pipe the response
      const writer = fs.createWriteStream(fullPath);
      response.data.pipe(writer);

      // Wait for download to complete
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Verify file was created and has content
      const stats = await fs.stat(fullPath);
      if (stats.size === 0) {
        await fs.remove(fullPath);
        throw new Error('Downloaded file is empty');
      }

      this.logger.debug(`Successfully downloaded logo: ${filename} (${stats.size} bytes)`);
      
      return {
        filename: filename,
        fullPath: fullPath,
        size: stats.size
      };

    } catch (error) {
      this.logger.debug(`Failed to download logo from ${url}: ${error.message}`);
      return null;
    }
  }

  async cleanupExpiredFiles() {
    try {
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      const now = Date.now();
      
      for (const [cacheKey, metadata] of this.cacheMetadata.entries()) {
        if (now - metadata.timestamp > maxAge) {
          await this.removeCachedLogo(cacheKey);
          this.logger.debug(`Cleaned up expired cache entry: ${cacheKey}`);
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to cleanup expired files: ${error.message}`);
    }
  }
}

module.exports = LogoService;