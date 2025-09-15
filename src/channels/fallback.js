// Fallback channel list for when real API calls fail
// This provides a comprehensive list of popular TV channels
const FALLBACK_CHANNELS = [
  // Major Networks - East Coast
  'NBC_EAST', 'CBS_EAST', 'ABC_EAST', 'FOX_EAST', 'CW_EAST', 'PBS_EAST',
  // Major Networks - West Coast
  'NBC_WEST', 'CBS_WEST', 'ABC_WEST', 'FOX_WEST', 'CW_WEST', 'PBS_WEST',
  // News Networks
  'CNN', 'FOX_NEWS', 'MSNBC', 'CNBC', 'BBC_NEWS', 'BLOOMBERG', 'NEWSMAX', 'OAN',
  // Sports Networks
  'ESPN', 'ESPN2', 'FOX_SPORTS_1', 'FOX_SPORTS_2', 'NFL_NETWORK', 'NBA_TV', 'MLB_NETWORK', 'NHL_NETWORK',
  // Premium Networks
  'HBO', 'HBO2', 'SHOWTIME', 'STARZ', 'CINEMAX', 'EPIX',
  // Cable Networks
  'TNT', 'TBS', 'USA', 'FX', 'FXX', 'AMC', 'SYFY', 'COMEDY_CENTRAL', 'ADULT_SWIM',
  // Discovery Networks
  'DISCOVERY', 'DISCOVERY_SCIENCE', 'ANIMAL_PLANET', 'FOOD_NETWORK', 'HGTV', 'TLC',
  // History & Learning
  'HISTORY', 'HISTORY2', 'NATIONAL_GEOGRAPHIC', 'NAT_GEO_WILD', 'SCIENCE_CHANNEL',
  // Entertainment
  'BRAVO', 'E_ENTERTAINMENT', 'LIFETIME', 'OXYGEN', 'WE_TV', 'OWN',
  // Kids Networks
  'DISNEY_CHANNEL', 'DISNEY_XD', 'NICKELODEON', 'NICK_JR', 'CARTOON_NETWORK', 'BOOMERANG',
  // Music Networks
  'MTV', 'VH1', 'CMT', 'BET', 'FUSE',
  // International
  'BBC_ONE', 'BBC_TWO', 'ITV', 'CHANNEL_4', 'SKY_NEWS', 'EURONEWS',
  // Specialty
  'WEATHER_CHANNEL', 'TRAVEL_CHANNEL', 'COOKING_CHANNEL', 'DIY_NETWORK', 'GOLF_CHANNEL'
];

module.exports = {
  FALLBACK_CHANNELS
};