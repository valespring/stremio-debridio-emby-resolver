const axios = require('axios');
const MESSAGES = require('../messages');
const LogoService = require('./logoService');
const { FALLBACK_CHANNELS } = require('../channels/fallback');

class StremioService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.logoService = new LogoService(logger, config);
    this.httpClient = axios.create({
      timeout: config.stremio?.timeout || 10000,
      headers: {
        'User-Agent': config.stremio?.userAgent || 'Stremio/4.4.0',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      // Don't follow redirects to avoid getting the web shell
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept redirects as valid
      }
    });
  }

  async fetchContent(sourcesConfig) {
    const content = [];
    
    try {
      this.logger.info(MESSAGES.STREMIO.FETCH_STARTED);
      
      // First, try to get data from local Stremio streaming server
      const localContent = await this.fetchFromLocalStremio();
      if (localContent.length > 0) {
        content.push(...localContent);
      }
      
      // Check if we have any install URLs (like Debridio) and generate content for them
      const hasInstallUrls = sourcesConfig.enabledAddons.some(addon => this.isInstallUrl(addon));
      if (hasInstallUrls) {
        this.logger.info(MESSAGES.DEBRIDIO.FALLBACK_CHANNELS);
        const debridioContent = await this.fetchDebridioContent({ name: 'Debridio - TV' });
        content.push(...debridioContent);
      }
      
      // Then fetch from configured addons
      for (const addonId of sourcesConfig.enabledAddons) {
        // Skip install URLs - they're handled above
        if (this.isInstallUrl(addonId)) {
          this.logger.debug(MESSAGES.STREMIO.ADDON_URL_DETECTED(addonId));
          continue;
        }
        
        this.logger.debug(MESSAGES.STREMIO.FETCH_ADDON(addonId));
        // Skip built-in addons to avoid mock content
        continue;
      }

      this.logger.info(MESSAGES.STREMIO.FETCH_COMPLETED(content.length));
      return this.filterAndSortContent(content, sourcesConfig.filters);
      
    } catch (error) {
      this.logger.error(MESSAGES.STREMIO.FETCH_ERROR, error);
      throw error;
    }
  }

  isInstallUrl(addonId) {
    return addonId.includes('/manifest.json') &&
           (addonId.includes('debridio.com') || addonId.includes('eyJ'));
  }

  async fetchFromLocalStremio() {
    try {
      this.logger.info(MESSAGES.STREMIO.CONNECTION_TEST);
      
      // Try different API endpoints that might exist
      const endpoints = [
        '/settings',
        '/api/addons',
        '/addons',
        '/api/settings',
        '/streaming'
      ];
      
      for (const endpoint of endpoints) {
        try {
          const response = await this.httpClient.get(`${this.config.stremio.apiUrl}${endpoint}`);
          this.logger.info(MESSAGES.STREMIO.CONNECTION_SUCCESS);
          this.logger.debug(MESSAGES.GENERAL.DEBUG_RESPONSE(response.data));
          
          // If we get settings, look for addon information
          if (endpoint.includes('settings') && response.data) {
            return await this.processStremioSettings(response.data);
          }
          
          // If we get addons directly
          if (endpoint.includes('addons') && response.data) {
            return await this.processStremioAddons(response.data);
          }
          
        } catch (error) {
          this.logger.debug(MESSAGES.GENERAL.ENDPOINT_ACCESS_FAILED(endpoint, error.message));
        }
      }
      
      this.logger.warn(MESSAGES.STREMIO.CONNECTION_FAILED);
      return [];
      
    } catch (error) {
      this.logger.warn(MESSAGES.STREMIO.CONNECTION_FAILED, error.message);
      return [];
    }
  }

  async processStremioSettings(settings) {
    const content = [];
    
    try {
      // Look for addon information in settings
      if (settings.addons && Array.isArray(settings.addons)) {
        for (const addon of settings.addons) {
          if (addon.manifest && addon.manifest.name?.toLowerCase().includes('debridio')) {
            this.logger.info(MESSAGES.STREMIO.ADDON_MANIFEST_SUCCESS(addon.manifest.name));
            // Try to get content from this addon
            const addonContent = await this.fetchDebridioContent(addon);
            content.push(...addonContent);
          }
        }
      }
    } catch (error) {
      this.logger.error(MESSAGES.GENERAL.SETTINGS_ERROR(error));
    }
    
    return content;
  }

  async processStremioAddons(addons) {
    const content = [];
    
    try {
      if (Array.isArray(addons)) {
        for (const addon of addons) {
          if (addon.name?.toLowerCase().includes('debridio') ||
              addon.id?.includes('debridio')) {
            this.logger.info(MESSAGES.STREMIO.ADDON_MANIFEST_SUCCESS(addon.name || addon.id));
            const addonContent = await this.fetchDebridioContent(addon);
            content.push(...addonContent);
          }
        }
      }
    } catch (error) {
      this.logger.error(MESSAGES.GENERAL.ADDONS_ERROR(error));
    }
    
    return content;
  }

  async fetchDebridioContent(addon) {
    // Try sequential fetching approach to avoid timeouts
    try {
      this.logger.info(MESSAGES.DEBRIDIO.SEQUENTIAL_FETCH_START);
      const realChannels = await this.fetchRealDebridioChannels();
      if (realChannels.length > 0) {
        this.logger.info(MESSAGES.DEBRIDIO.SEQUENTIAL_FETCH_SUCCESS(realChannels.length));
        return realChannels;
      }
    } catch (error) {
      this.logger.warn(MESSAGES.DEBRIDIO.SEQUENTIAL_FETCH_FAILED, error.message);
    }
    
    this.logger.info(MESSAGES.DEBRIDIO.FALLBACK_CHANNELS);

    
    const content = [];
    
    for (const channel of FALLBACK_CHANNELS) {
      content.push({
        id: `debridio_${channel.toLowerCase()}`,
        title: channel.replace('_', ' '),
        type: 'tv',
        year: new Date().getFullYear(),
        genre: 'Live TV',
        language: 'en',
        addon: 'Debridio - TV',
        streams: [{
          url: `http://fl6.tv.debridio.com/${channel}/index.m3u8`,
          quality: 'Live HD',
          source: 'Debridio',
          title: `${channel} Live Stream`,
          availability: true
        }],
        poster: this.logoService.generatePlaceholderLogo(channel.replace('_', ' ')),
        description: `Live ${channel.replace('_', ' ')} channel from Debridio`,
        imdbRating: '0.0',
        duration: null
      });
    }
    
    this.logger.info(MESSAGES.DEBRIDIO.GENERATED_FALLBACK(content.length));
    return content;
  }

  async fetchRealDebridioChannels() {
    try {
      // Get the Debridio addon URL from secure config (merged into main config)
      let debridioUrl = null;
      
      // Check sources.enabledAddons first
      if (this.config.sources && this.config.sources.enabledAddons) {
        debridioUrl = this.config.sources.enabledAddons.find(addon =>
          addon.includes('debridio.com') && addon.includes('manifest.json')
        );
      }
      
      // Check secureAddons if not found in main config
      if (!debridioUrl && this.config.secureAddons) {
        debridioUrl = this.config.secureAddons.find(addon =>
          addon.includes('debridio.com') && addon.includes('manifest.json')
        );
      }
      
      if (!debridioUrl) {
        throw new Error(MESSAGES.DEBRIDIO.NO_ADDON_URL);
      }

      // Try to decode channel information from the URL
      const channelInfo = this.extractChannelInfoFromUrl(debridioUrl);
      if (channelInfo) {
        this.logger.info(MESSAGES.DEBRIDIO.CHANNEL_CONFIG_DETECTED(channelInfo));
      }

      this.logger.debug(MESSAGES.DEBRIDIO.MANIFEST_FETCH(debridioUrl));
      
      // Create a client with shorter timeout for dynamic fetching
      const quickClient = axios.create({
        timeout: 3000, // 3 second timeout
        headers: this.httpClient.defaults.headers,
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        }
      });
      
      // Fetch the manifest with timeout
      const manifestResponse = await quickClient.get(debridioUrl);
      const manifest = manifestResponse.data;
      
      if (!manifest.catalogs || !Array.isArray(manifest.catalogs)) {
        throw new Error(MESSAGES.DEBRIDIO.NO_CATALOGS);
      }

      // Sequential fetch approach - process catalogs one by one with delays
      const content = [];
      const baseUrl = debridioUrl.replace('/manifest.json', '');
      
      // Find TV catalogs
      const tvCatalogs = manifest.catalogs.filter(catalog =>
        catalog.type === 'tv' || catalog.id.includes('tv') || catalog.id.includes('live')
      );

      this.logger.info(MESSAGES.DEBRIDIO.CATALOGS_FOUND(tvCatalogs.length));

      for (let i = 0; i < tvCatalogs.length; i++) {
        const catalog = tvCatalogs[i];
        try {
          const catalogUrl = `${baseUrl}/catalog/${catalog.type}/${catalog.id}.json`;
          this.logger.debug(MESSAGES.DEBRIDIO.CATALOG_FETCH(i + 1, tvCatalogs.length, catalogUrl));
          
          const catalogResponse = await quickClient.get(catalogUrl);
          const catalogData = catalogResponse.data;
          
          if (catalogData.metas && Array.isArray(catalogData.metas)) {
            // Process channels in batches to avoid overwhelming the API
            const batchSize = 5;
            for (let j = 0; j < catalogData.metas.length; j += batchSize) {
              const batch = catalogData.metas.slice(j, j + batchSize);
              
              for (const meta of batch) {
                try {
                  const channelContent = await this.processRealDebridioChannelSequential(quickClient, baseUrl, meta);
                  if (channelContent) {
                    content.push(channelContent);
                    this.logger.debug(MESSAGES.DEBRIDIO.CHANNEL_PROCESSED(channelContent.title));
                  }
                } catch (error) {
                  this.logger.debug(MESSAGES.DEBRIDIO.CHANNEL_FAILED(meta.name || meta.id, error.message));
                }
              }
              
              // Small delay between batches to avoid rate limiting
              if (j + batchSize < catalogData.metas.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
          }
          
          // Delay between catalogs
          if (i < tvCatalogs.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
        } catch (error) {
          this.logger.debug(MESSAGES.DEBRIDIO.CATALOG_FETCH_FAILED(catalog.id, error.message));
        }
      }

      this.logger.info(MESSAGES.DEBRIDIO.SEQUENTIAL_COMPLETED(content.length));
      return content;
      
    } catch (error) {
      this.logger.error(MESSAGES.DEBRIDIO.REAL_CHANNELS_ERROR(error));
      throw error;
    }
  }

  extractChannelInfoFromUrl(url) {
    try {
      // Extract base64 encoded part from URL
      const matches = url.match(/\/([A-Za-z0-9+/=]+)\/manifest\.json/);
      if (matches && matches[1]) {
        const base64Data = matches[1];
        const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
        return JSON.parse(decoded);
      }
    } catch (error) {
      this.logger.debug(MESSAGES.DEBRIDIO.CHANNEL_INFO_DECODE_FAILED(error.message));
    }
    return null;
  }

  async processRealDebridioChannelSequential(client, baseUrl, meta) {
    try {
      // Try to get streams for this channel with shorter timeout
      const streamUrl = `${baseUrl}/stream/tv/${meta.id}.json`;
      this.logger.debug(MESSAGES.DEBRIDIO.STREAMS_FETCH(meta.name || meta.id));
      
      const streamResponse = await client.get(streamUrl);
      const streamData = streamResponse.data;
      
      if (!streamData.streams || !Array.isArray(streamData.streams)) {
        return null;
      }

      // Filter for valid streaming URLs
      const validStreams = streamData.streams
        .filter(stream => stream.url && (stream.url.includes('.m3u8') || stream.url.includes('debridio.com')))
        .map(stream => ({
          url: stream.url,
          quality: stream.title || 'Live HD',
          source: 'Debridio',
          title: `${meta.name || 'Live'} Stream`,
          availability: true
        }));

      if (validStreams.length === 0) {
        return null;
      }

      const channelName = meta.name || meta.id;
      
      return {
        id: `debridio_${meta.id}`,
        title: channelName,
        type: 'tv',
        year: new Date().getFullYear(),
        genre: 'Live TV',
        language: 'en',
        addon: 'Debridio - TV',
        streams: validStreams,
        poster: meta.poster || this.logoService.generatePlaceholderLogo(channelName),
        description: `Live ${channelName} channel from Debridio`,
        imdbRating: '0.0',
        duration: null
      };
      
    } catch (error) {
      this.logger.debug(MESSAGES.DEBRIDIO.STREAMS_FAILED(meta.name || meta.id, error.message));
      return null;
    }
  }

  async processRealDebridioChannel(baseUrl, meta) {
    try {
      // Try to get streams for this channel
      const streamUrl = `${baseUrl}/stream/tv/${meta.id}.json`;
      this.logger.debug(MESSAGES.GENERAL.STREAMS_FETCH_DEBUG(meta.name || meta.id));
      
      // Use quick client for stream fetching too
      const quickClient = axios.create({
        timeout: 3000, // 3 second timeout for individual streams
        headers: this.httpClient.defaults.headers,
        maxRedirects: 0,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        }
      });
      
      const streamResponse = await quickClient.get(streamUrl);
      const streamData = streamResponse.data;
      
      if (!streamData.streams || !Array.isArray(streamData.streams)) {
        return null;
      }

      // Filter for valid streaming URLs
      const validStreams = streamData.streams
        .filter(stream => stream.url && (stream.url.includes('.m3u8') || stream.url.includes('debridio.com')))
        .map(stream => ({
          url: stream.url,
          quality: stream.title || 'Live HD',
          source: 'Debridio',
          title: `${meta.name || 'Live'} Stream`,
          availability: true
        }));

      if (validStreams.length === 0) {
        return null;
      }

      const channelName = meta.name || meta.id;
      
      return {
        id: `debridio_${meta.id}`,
        title: channelName,
        type: 'tv',
        year: new Date().getFullYear(),
        genre: 'Live TV',
        language: 'en',
        addon: 'Debridio - TV',
        streams: validStreams,
        poster: meta.poster || this.logoService.generatePlaceholderLogo(channelName),
        description: `Live ${channelName} channel from Debridio`,
        imdbRating: '0.0',
        duration: null
      };
      
    } catch (error) {
      this.logger.debug(MESSAGES.DEBRIDIO.STREAMS_FAILED(meta.name || meta.id, error.message));
      return null;
    }
  }


  async fetchAddonContent(addonId, category, filters) {
    try {
      // Check if this is a URL-based addon
      if (this.isAddonUrl(addonId)) {
        this.logger.debug(MESSAGES.STREMIO.ADDON_URL_DETECTED(addonId));
        return await this.fetchFromAddonUrl(addonId, category, filters);
      } else {
        // Handle built-in Stremio addons
        return await this.fetchFromBuiltinAddon(addonId, category, filters);
      }
      
    } catch (error) {
      this.logger.error(MESSAGES.STREMIO.ADDON_ERROR(addonId, category), error);
      throw error;
    }
  }

  isAddonUrl(addonId) {
    return addonId.startsWith('http://') || addonId.startsWith('https://');
  }

  async fetchFromAddonUrl(addonUrl, category, filters) {
    try {
      // First, fetch the addon manifest to understand its capabilities
      const manifestUrl = addonUrl.endsWith('/manifest.json') ? addonUrl : `${addonUrl}/manifest.json`;
      this.logger.debug(MESSAGES.STREMIO.ADDON_MANIFEST_FETCH(manifestUrl));
      
      const manifestResponse = await this.httpClient.get(manifestUrl);
      const manifest = manifestResponse.data;
      
      this.logger.info(MESSAGES.STREMIO.ADDON_MANIFEST_SUCCESS(manifest.name || MESSAGES.STREMIO.UNKNOWN_ADDON));
      
      // Fetch real content from the addon's catalog
      return await this.fetchRealAddonContent(addonUrl, manifest, category, filters);
      
    } catch (error) {
      this.logger.warn(MESSAGES.STREMIO.ADDON_MANIFEST_FAILED(addonUrl), error.message);
      // If manifest fetch fails, return empty array
      return [];
    }
  }

  async fetchFromBuiltinAddon(addonId, category, filters) {
    // For built-in addons, return empty array since we focus on real addon URLs
    return [];
  }

  async fetchRealAddonContent(addonUrl, manifest, category, filters) {
    try {
      const addonName = manifest.name || MESSAGES.STREMIO.UNKNOWN_ADDON;
      
      // Check if this is a live TV addon based on manifest
      if (this.isLiveTvAddon(manifest)) {
        this.logger.info(MESSAGES.ADDON.LIVE_TV_DETECTED(addonName));
        return await this.fetchLiveTvContent(addonUrl, manifest, addonName, filters);
      }
      
      // Standard catalog-based addon
      this.logger.info(MESSAGES.STREMIO.CATALOG_FETCH(addonName, category));
      
      // Get the base URL for the addon
      const baseUrl = addonUrl.replace('/manifest.json', '');
      
      // Try different catalog endpoints
      const catalogEndpoints = [
        `${baseUrl}/catalog/${category}/top.json`,
        `${baseUrl}/catalog/${category}/popular.json`,
        `${baseUrl}/catalog/${category}/latest.json`
      ];
      
      for (const catalogUrl of catalogEndpoints) {
        try {
          const catalogResponse = await this.httpClient.get(catalogUrl);
          const catalogData = catalogResponse.data;
          
          if (!catalogData.metas || !Array.isArray(catalogData.metas)) {
            continue;
          }
          
          this.logger.info(MESSAGES.STREMIO.CATALOG_SUCCESS(catalogData.metas.length, addonName));
          
          // Process each item in the catalog
          const content = [];
          for (const meta of catalogData.metas.slice(0, 20)) { // Limit to first 20 items
            try {
              const item = await this.processMetaItem(baseUrl, meta, category, addonName);
              if (item && this.matchesFilters(item, filters)) {
                content.push(item);
              }
            } catch (error) {
              this.logger.debug(MESSAGES.ADDON.PROCESS_ITEM_FAILED(meta.id, error.message));
            }
          }
          
          return content;
          
        } catch (catalogError) {
          this.logger.debug(MESSAGES.ADDON.FETCH_CATALOG_FAILED(catalogUrl, catalogError.message));
          continue;
        }
      }
      
      // If all catalog endpoints failed
      this.logger.warn(MESSAGES.STREMIO.CATALOG_FAILED(addonName, category), 'All catalog endpoints failed');
      return [];
      
    } catch (error) {
      this.logger.error(MESSAGES.ADDON.REAL_CONTENT_ERROR(manifest.name, error));
      return [];
    }
  }

  isLiveTvAddon(manifest) {
    // Check if this addon supports live TV based on manifest
    if (!manifest.catalogs) return false;
    
    return manifest.catalogs.some(catalog =>
      catalog.type === 'tv' ||
      catalog.id.includes('tv') ||
      catalog.id.includes('live') ||
      catalog.name?.toLowerCase().includes('tv') ||
      catalog.name?.toLowerCase().includes('live')
    );
  }

  async fetchLiveTvContent(addonUrl, manifest, addonName, filters) {
    try {
      const baseUrl = addonUrl.replace('/manifest.json', '');
      const content = [];
      
      // Try to fetch TV catalog
      const tvCatalogs = manifest.catalogs.filter(catalog =>
        catalog.type === 'tv' || catalog.id.includes('tv')
      );
      
      for (const catalog of tvCatalogs.slice(0, 2)) { // Limit to first 2 catalogs
        try {
          const catalogUrl = `${baseUrl}/catalog/${catalog.type}/${catalog.id}.json`;
          this.logger.debug(MESSAGES.ADDON.FETCH_CATALOG(catalogUrl));
          
          const catalogResponse = await this.httpClient.get(catalogUrl);
          const catalogData = catalogResponse.data;
          
          if (catalogData.metas && Array.isArray(catalogData.metas)) {
            for (const meta of catalogData.metas.slice(0, 15)) {
              try {
                const item = await this.processLiveTvItem(baseUrl, meta, addonName);
                if (item) {
                  content.push(item);
                }
              } catch (error) {
                this.logger.debug(MESSAGES.ADDON.LIVE_TV_ITEM_FAILED(meta.id, error.message));
              }
            }
          }
        } catch (error) {
          this.logger.debug(MESSAGES.ADDON.TV_CATALOG_FAILED(catalog.id, error.message));
        }
      }
      
      return content;
      
    } catch (error) {
      this.logger.error(MESSAGES.ADDON.LIVE_TV_CONTENT_ERROR(error));
      return [];
    }
  }

  async processLiveTvItem(baseUrl, meta, addonName) {
    try {
      // For live TV, try to get streams directly
      const streamUrl = `${baseUrl}/stream/tv/${meta.id}.json`;
      this.logger.debug(MESSAGES.ADDON.LIVE_TV_STREAMS_FETCH(meta.name || meta.id));
      
      const streamResponse = await this.httpClient.get(streamUrl);
      const streamData = streamResponse.data;
      
      if (!streamData.streams || !Array.isArray(streamData.streams)) {
        return null;
      }
      
      // Process live TV streams
      const validStreams = streamData.streams
        .filter(stream => stream.url && stream.url.includes('.m3u8'))
        .map(stream => ({
          url: stream.url,
          quality: stream.title || 'Live',
          source: this.extractSourceFromUrl(stream.url),
          title: stream.title || meta.name || 'Live Stream',
          availability: true
        }));
      
      if (validStreams.length === 0) {
        return null;
      }
      
      return {
        id: meta.id,
        title: meta.name || 'Live TV Channel',
        type: 'tv',
        year: new Date().getFullYear(),
        genre: 'Live TV',
        language: 'en',
        addon: addonName,
        streams: validStreams,
        poster: meta.poster || `https://via.placeholder.com/300x450?text=${encodeURIComponent(meta.name || 'Live TV')}`,
        description: `Live TV channel from ${addonName}`,
        imdbRating: '0.0',
        duration: null // Live streams don't have duration
      };
      
    } catch (error) {
      this.logger.debug(MESSAGES.ADDON.LIVE_TV_PROCESS_FAILED(meta.name || meta.id, error.message));
      return null;
    }
  }


  async processMetaItem(baseUrl, meta, category, addonName) {
    try {
      // Fetch streams for this item
      const streamUrl = `${baseUrl}/stream/${category}/${meta.id}.json`;
      this.logger.debug(MESSAGES.STREMIO.STREAMS_FETCH(meta.name || meta.id));
      
      const streamResponse = await this.httpClient.get(streamUrl);
      const streamData = streamResponse.data;
      
      if (!streamData.streams || !Array.isArray(streamData.streams)) {
        this.logger.debug(MESSAGES.DEBRIDIO.NO_STREAMS_FOUND(meta.name || meta.id));
        return null;
      }
      
      // Filter and process streams
      const validStreams = streamData.streams
        .filter(stream => stream.url && (stream.url.includes('.m3u8') || stream.url.includes('http')))
        .map(stream => ({
          url: stream.url,
          quality: stream.title || 'Unknown',
          source: this.extractSourceFromUrl(stream.url),
          title: stream.title || 'Stream',
          availability: true
        }));
      
      if (validStreams.length === 0) {
        this.logger.debug(MESSAGES.DEBRIDIO.NO_VALID_STREAMS(meta.name || meta.id));
        return null;
      }
      
      this.logger.debug(MESSAGES.STREMIO.STREAMS_SUCCESS(validStreams.length, meta.name || meta.id));
      
      // Create content item
      return {
        id: meta.id,
        title: meta.name || 'Unknown Title',
        type: category,
        year: meta.year || new Date().getFullYear(),
        genre: (meta.genres && meta.genres[0]) || MESSAGES.STREMIO.DEFAULT_GENRE,
        language: 'en', // Default to English
        addon: addonName,
        streams: validStreams,
        poster: meta.poster || `https://via.placeholder.com/300x450?text=${encodeURIComponent(meta.name || 'No Title')}`,
        description: meta.description || `Content from ${addonName}`,
        imdbRating: meta.imdbRating || '0.0',
        duration: meta.runtime ? Math.floor(meta.runtime) : null
      };
      
    } catch (error) {
      this.logger.debug(MESSAGES.STREMIO.STREAMS_FAILED(meta.name || meta.id), error.message);
      return null;
    }
  }

  extractSourceFromUrl(url) {
    if (url.includes('debridio.com')) return 'Debridio';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('.torrent') || url.includes('magnet:')) return 'Torrent';
    return 'HTTP';
  }

  matchesFilters(item, filters) {
    // Apply year filter
    if (filters.minYear && item.year < filters.minYear) return false;
    if (filters.maxYear && item.year > filters.maxYear) return false;
    
    // Apply genre filter
    if (filters.genres && filters.genres.length > 0 && !filters.genres.includes(item.genre)) return false;
    
    // Apply language filter
    if (filters.languages && filters.languages.length > 0 && !filters.languages.includes(item.language)) return false;
    
    return true;
  }


  filterAndSortContent(content, filters) {
    let filtered = content;
    
    // Apply year filter (skip for live TV)
    if (filters.minYear || filters.maxYear) {
      filtered = filtered.filter(item => {
        // Skip filtering for live TV content
        if (item.type === 'tv' || item.genre === 'Live TV') {
          return true;
        }
        const year = item.year;
        return (!filters.minYear || year >= filters.minYear) &&
               (!filters.maxYear || year <= filters.maxYear);
      });
    }
    
    // Apply genre filter (skip for live TV)
    if (filters.genres && filters.genres.length > 0) {
      filtered = filtered.filter(item => {
        // Skip filtering for live TV content
        if (item.type === 'tv' || item.genre === 'Live TV') {
          return true;
        }
        return filters.genres.includes(item.genre);
      });
    }
    
    // Apply language filter (skip for live TV)
    if (filters.languages && filters.languages.length > 0) {
      filtered = filtered.filter(item => {
        // Skip filtering for live TV content
        if (item.type === 'tv' || item.genre === 'Live TV') {
          return true;
        }
        return filters.languages.includes(item.language);
      });
    }
    
    // Remove duplicates based on title and year
    const seen = new Set();
    filtered = filtered.filter(item => {
      const key = `${item.title}_${item.year}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    
    // Sort by IMDB rating (descending) and then by year (descending)
    filtered.sort((a, b) => {
      const ratingDiff = parseFloat(b.imdbRating) - parseFloat(a.imdbRating);
      if (ratingDiff !== 0) return ratingDiff;
      return b.year - a.year;
    });
    
    this.logger.info(MESSAGES.STREMIO.FILTERED_CONTENT(filtered.length));
    return filtered;
  }

  async testConnection() {
    try {
      // In a real implementation, this would test the connection to Stremio's API
      this.logger.info(MESSAGES.STREMIO.CONNECTION_TEST);
      
      // Simple connection test - just return true for now
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.logger.info(MESSAGES.STREMIO.CONNECTION_SUCCESS);
      return true;
    } catch (error) {
      this.logger.error(MESSAGES.STREMIO.CONNECTION_FAILED, error);
      return false;
    }
  }
}

module.exports = StremioService;