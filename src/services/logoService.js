const axios = require('axios');
const MESSAGES = require('../messages');
const packageInfo = require('../../package.json');
const { getChannelVariations } = require('../channels/variations');

class LogoService {
  constructor(logger, config = null) {
    this.logger = logger;
    this.logoCache = new Map();
    
    // Use config.stremio.userAgent if available, otherwise fallback to package info
    this.userAgent = config?.stremio?.userAgent ||
                     `${packageInfo.name}/${packageInfo.version} (${packageInfo.description || 'M3U playlist generator'})`;
    
    this.httpClient = axios.create({
      timeout: 5000,
      headers: {
        'User-Agent': this.userAgent
      }
    });
  }

  async getChannelLogo(channelName, debridioLogo = null) {
    const cacheKey = channelName.toLowerCase();
    
    // Check cache first
    if (this.logoCache.has(cacheKey)) {
      this.logger.debug(MESSAGES.LOGO_SERVICE.CACHE_HIT(channelName));
      return this.logoCache.get(cacheKey);
    }

    this.logger.debug(MESSAGES.LOGO_SERVICE.CACHE_MISS(channelName));

    try {
      // 1. Try Wikimedia first (highest priority)
      const wikimediaLogo = await this.searchWikimediaLogo(channelName);
      if (wikimediaLogo) {
        this.logoCache.set(cacheKey, wikimediaLogo);
        return wikimediaLogo;
      }

      // 2. Use Debridio logo if available (medium priority)
      if (debridioLogo) {
        this.logger.debug(MESSAGES.LOGO_SERVICE.DEBRIDIO_FALLBACK(channelName));
        this.logoCache.set(cacheKey, debridioLogo);
        return debridioLogo;
      }

      // 3. Generate placeholder (lowest priority)
      const placeholderLogo = this.generatePlaceholderLogo(channelName);
      this.logger.debug(MESSAGES.LOGO_SERVICE.PLACEHOLDER_FALLBACK(channelName));
      this.logoCache.set(cacheKey, placeholderLogo);
      return placeholderLogo;

    } catch (error) {
      this.logger.warn(MESSAGES.LOGO_SERVICE.SERVICE_ERROR(channelName, error.message));
      
      // Fallback to placeholder on error
      const placeholderLogo = this.generatePlaceholderLogo(channelName);
      this.logoCache.set(cacheKey, placeholderLogo);
      return placeholderLogo;
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
}

module.exports = LogoService;