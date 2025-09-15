const MESSAGES = {
  SERVER: {
    INITIALIZED: 'Debridio Emby Resolver Server initialized successfully',
    STARTING: (host, port) => `Server running on http://${host}:${port}`,
    PLAYLIST_URL: (host, port) => `Playlist available at: http://${host}:${port}/playlist`,
    STATUS_URL: (host, port) => `Status endpoint: http://${host}:${port}/status`,
    STOPPED: 'Server stopped',
    SHUTDOWN_SIGINT: '\nReceived SIGINT, shutting down gracefully...',
    SHUTDOWN_SIGTERM: '\nReceived SIGTERM, shutting down gracefully...'
  },
  CONFIG: {
    LOAD_FAILED: (error) => `Failed to load config: ${error}`,
    INITIALIZE_FAILED: 'Failed to initialize server:',
    START_FAILED: 'Failed to start server:',
    SECURE_CONFIG_LOADED: 'Secure configuration loaded and merged'
  },
  PLAYLIST: {
    GENERATION_STARTED: 'Starting playlist generation',
    GENERATION_COMPLETED: (duration) => `Playlist generation completed in ${duration}ms`,
    GENERATION_FAILED: 'Playlist generation failed:',
    GENERATION_IN_PROGRESS: 'Playlist generation already in progress, skipping',
    SCHEDULED_REFRESH_STARTED: 'Scheduled playlist refresh started',
    UPDATE_SUCCESS: 'Playlist updated successfully',
    UPDATE_FAILED: 'Failed to update playlist',
    NOT_FOUND: 'Playlist not found',
    LOGO_ENHANCEMENT_STARTED: 'Starting background logo enhancement with Wikimedia search...',
    LOGO_ENHANCEMENT_SKIPPED: 'Logo enhancement skipped - Wikimedia disabled in config',
    LOGO_ENHANCEMENT_COMPLETED: (count) => `Background logo enhancement completed: ${count} logos improved`,
    LOGO_ENHANCEMENT_NO_UPDATES: 'Background logo enhancement completed: no logos needed enhancement',
    LOGO_ENHANCEMENT_FAILED: 'Background logo enhancement failed:',
    LOGO_ENHANCED: (title) => `Enhanced logo for ${title}`,
    LOGO_ENHANCEMENT_REGENERATING: (count) => `Enhanced ${count} logos, updating playlist...`,
    LOGO_ENHANCEMENT_REGENERATE_FAILED: 'Failed to regenerate playlist after logo enhancement:'
  },
  SCHEDULER: {
    SETUP: (interval) => `Scheduler setup with interval: ${interval}`
  },
  API: {
    HEALTHY: 'healthy',
    UPDATE_IN_PROGRESS: 'Update already in progress',
    INTERNAL_ERROR: 'Internal server error',
    SERVING_ERROR: 'Error serving playlist:'
  },
  REFRESH: {
    MANUAL_FAILED: 'Manual refresh failed:'
  },
  STREMIO: {
    FETCH_STARTED: 'Starting content fetch from addons',
    FETCH_ADDON: (addonId) => `Fetching content from addon: ${addonId}`,
    FETCH_FAILED: (category, addonId) => `Failed to fetch ${category} content from ${addonId}:`,
    FETCH_COMPLETED: (count) => `Fetched ${count} content items from addons`,
    FETCH_ERROR: 'Failed to fetch content from addons:',
    ADDON_ERROR: (addonId, category) => `Error fetching content from ${addonId} for ${category}:`,
    FILTERED_CONTENT: (count) => `Filtered content: ${count} items remaining`,
    CONNECTION_TEST: 'Testing addon connection...',
    CONNECTION_SUCCESS: 'Addon connection test successful',
    CONNECTION_FAILED: 'Addon connection test failed:',
    ADDON_URL_DETECTED: (addonId) => `Detected addon URL: ${addonId}`,
    ADDON_MANIFEST_FETCH: (manifestUrl) => `Fetching addon manifest from: ${manifestUrl}`,
    ADDON_MANIFEST_SUCCESS: (addonName) => `Successfully loaded addon: ${addonName}`,
    ADDON_MANIFEST_FAILED: (manifestUrl) => `Failed to fetch manifest from: ${manifestUrl}`,
    UNKNOWN_ADDON: 'Unknown Addon',
    DEFAULT_GENRE: 'Drama',
    CATALOG_FETCH: (addonName, category) => `Fetching ${category} catalog from ${addonName}`,
    CATALOG_SUCCESS: (itemCount, addonName) => `Found ${itemCount} items in ${addonName} catalog`,
    CATALOG_FAILED: (addonName, category) => `Failed to fetch ${category} catalog from ${addonName}`,
    STREAMS_FETCH: (title) => `Fetching streams for: ${title}`,
    STREAMS_SUCCESS: (streamCount, title) => `Found ${streamCount} streams for: ${title}`,
    STREAMS_FAILED: (title) => `Failed to fetch streams for: ${title}`
  },
  PLAYLIST_GENERATOR: {
    GENERATION_STARTED: 'Starting M3U playlist generation',
    GENERATION_COMPLETED: (itemCount, filePath) => `M3U playlist generated with ${itemCount} items at ${filePath}`,
    GENERATION_FAILED: 'Failed to generate M3U playlist:',
    WRITE_ERROR: 'Error writing playlist file:',
    BACKUP_CREATED: (backupPath) => `Backup created at ${backupPath}`,
    BACKUP_FAILED: 'Failed to create backup:',
    VALIDATION_STARTED: 'Validating playlist content',
    VALIDATION_COMPLETED: (validCount, totalCount) => `Playlist validation completed: ${validCount}/${totalCount} valid items`,
    STREAM_FILTERED: (originalCount, filteredCount) => `Streams filtered: ${originalCount} -> ${filteredCount} available streams`,
    STATS_ERROR: 'Error getting playlist stats:'
  },
  LOGO_SERVICE: {
    WIKIMEDIA_SEARCH: (channelName) => `Searching Wikimedia for logo: ${channelName}`,
    WIKIMEDIA_SUCCESS: (channelName, logoUrl) => `Found Wikimedia logo for ${channelName}: ${logoUrl}`,
    WIKIMEDIA_FAILED: (channelName) => `No Wikimedia logo found for ${channelName}`,
    DEBRIDIO_FALLBACK: (channelName) => `Using Debridio logo for ${channelName}`,
    PLACEHOLDER_FALLBACK: (channelName) => `Using placeholder logo for ${channelName}`,
    CACHE_HIT: (channelName) => `Logo cache hit for ${channelName}`,
    CACHE_MISS: (channelName) => `Logo cache miss for ${channelName}`,
    SERVICE_ERROR: (channelName, error) => `Logo service error for ${channelName}: ${error}`,
    WIKIMEDIA_FAILED: (channelName, error) => `Wikimedia search failed for ${channelName}: ${error}`,
    WIKIMEDIA_QUERY_FAILED: (searchTerm, error) => `Wikimedia query failed for "${searchTerm}": ${error}`,
    WIKIMEDIA_FILE_FAILED: (fileName, error) => `Failed to get Wikimedia file URL for ${fileName}: ${error}`,
    CACHE_CLEARED: 'Logo cache cleared',
    CACHE_INITIALIZED: (count) => `Logo cache initialized with ${count} entries`,
    CACHE_EXPIRED: (cacheKey) => `Cache expired for ${cacheKey}`,
    CACHE_SAVED: (cacheKey, source) => `Cached logo for ${cacheKey} from ${source}`,
    CACHE_CLEANUP: (count) => `Cleaned up ${count} expired logo cache entries`,
    CACHE_STATS: (memorySize, persistentSize) => `Cache stats - Memory: ${memorySize}, Persistent: ${persistentSize}`,
    DOWNLOAD_STARTED: (url, filename) => `Downloading logo file: ${filename} from ${url}`,
    DOWNLOAD_SUCCESS: (filename, size) => `Successfully downloaded logo: ${filename} (${size} bytes)`,
    DOWNLOAD_FAILED: (url, error) => `Failed to download logo from ${url}: ${error}`,
    FILE_CACHED: (cacheKey, filename) => `Logo file cached for ${cacheKey}: ${filename}`,
    FILE_MISSING: (cacheKey, filename) => `Cached logo file missing for ${cacheKey}: ${filename}`,
    FILE_CLEANUP: (filename) => `Removed cached logo file: ${filename}`
  },
  DEBRIDIO: {
    SEQUENTIAL_FETCH_START: 'Attempting sequential fetch of real Debridio channels...',
    SEQUENTIAL_FETCH_SUCCESS: (count) => `Successfully fetched ${count} real Debridio channels`,
    SEQUENTIAL_FETCH_FAILED: 'Sequential fetch failed, using expanded fallback:',
    FALLBACK_CHANNELS: 'Using expanded fallback channel list with real logos',
    CHANNEL_CONFIG_DETECTED: (config) => `Detected channel configuration: ${JSON.stringify(config)}`,
    MANIFEST_FETCH: (url) => `Fetching Debridio manifest from: ${url}`,
    CATALOGS_FOUND: (count) => `Found ${count} TV catalogs, processing sequentially...`,
    CATALOG_FETCH: (current, total, url) => `Fetching catalog ${current}/${total}: ${url}`,
    CHANNEL_PROCESSED: (title) => `Successfully processed channel: ${title}`,
    CHANNEL_FAILED: (name, error) => `Failed to process channel ${name}: ${error}`,
    SEQUENTIAL_COMPLETED: (count) => `Sequential fetch completed: ${count} channels processed`,
    NO_ADDON_URL: 'No Debridio addon URL found in config',
    NO_CATALOGS: 'No catalogs found in Debridio manifest',
    STREAMS_FETCH: (name) => `Fetching streams for channel: ${name}`,
    STREAMS_SUCCESS: (name) => `Successfully processed channel: ${name}`,
    STREAMS_FAILED: (name, error) => `Failed to process real Debridio channel ${name}: ${error}`,
    GENERATED_FALLBACK: (count) => `Generated ${count} Debridio channels (fallback)`,
    CATALOG_FETCH_FAILED: (catalogId, error) => `Failed to fetch catalog ${catalogId}: ${error}`,
    REAL_CHANNELS_ERROR: (error) => `Error fetching real Debridio channels: ${error}`,
    CHANNEL_INFO_DECODE_FAILED: (error) => `Could not decode channel info from URL: ${error}`,
    NO_STREAMS_FOUND: (channelName) => `No streams found for ${channelName}`,
    NO_VALID_STREAMS: (channelName) => `No valid streams found for ${channelName}`
  },

  ADDON: {
    LIVE_TV_DETECTED: (addonName) => `Detected live TV addon: ${addonName}`,
    FETCH_CATALOG: (catalogUrl) => `Fetching live TV catalog: ${catalogUrl}`,
    PROCESS_ITEM_FAILED: (itemId, error) => `Failed to process meta item ${itemId}: ${error}`,
    FETCH_CATALOG_FAILED: (catalogUrl, error) => `Failed to fetch from ${catalogUrl}: ${error}`,
    REAL_CONTENT_ERROR: (addonName, error) => `Error fetching real content from ${addonName}: ${error}`,
    LIVE_TV_ITEM_FAILED: (itemId, error) => `Failed to process live TV item ${itemId}: ${error}`,
    TV_CATALOG_FAILED: (catalogId, error) => `Failed to fetch TV catalog ${catalogId}: ${error}`,
    LIVE_TV_CONTENT_ERROR: (error) => `Error fetching live TV content: ${error}`,
    LIVE_TV_STREAMS_FETCH: (channelName) => `Fetching live TV streams for: ${channelName}`,
    LIVE_TV_PROCESS_FAILED: (channelName, error) => `Failed to process live TV item ${channelName}: ${error}`
  },

  GENERAL: {
    SETTINGS_ERROR: (error) => `Error processing addon settings: ${error}`,
    ADDONS_ERROR: (error) => `Error processing addons: ${error}`,
    ENDPOINT_ACCESS_FAILED: (endpoint, error) => `Failed to access ${endpoint}: ${error}`,
    DEBUG_RESPONSE: (data) => `Response: ${JSON.stringify(data, null, 2)}`,
    STREAMS_FETCH_DEBUG: (channelName) => `Fetching streams for channel: ${channelName}`
  }
};

module.exports = MESSAGES;