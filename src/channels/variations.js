// Channel name variations and full network names for better logo search results
// This helps the Wikimedia search find more accurate logos by trying both abbreviated and full network names

const CHANNEL_VARIATIONS = {
  'nbc': ['NBC logo', 'National Broadcasting Company logo'],
  'cbs': ['CBS logo', 'Columbia Broadcasting System logo'],
  'abc': ['ABC logo', 'American Broadcasting Company logo'],
  'fox': ['Fox logo', 'Fox Broadcasting Company logo'],
  'cnn': ['CNN logo', 'Cable News Network logo'],
  'espn': ['ESPN logo', 'Entertainment Sports Programming Network logo'],
  'hbo': ['HBO logo', 'Home Box Office logo'],
  'mtv': ['MTV logo', 'Music Television logo'],
  'vh1': ['VH1 logo', 'Video Hits One logo'],
  'discovery': ['Discovery Channel logo', 'Discovery logo'],
  'history': ['History Channel logo', 'History logo'],
  'national geographic': ['National Geographic logo', 'Nat Geo logo', 'National Geographic Channel logo'],
  'nat geo': ['National Geographic logo', 'Nat Geo logo', 'National Geographic Channel logo'],
  'cartoon network': ['Cartoon Network logo'],
  'nickelodeon': ['Nickelodeon logo', 'Nick logo'],
  'disney': ['Disney Channel logo', 'Disney logo'],
  'food network': ['Food Network logo'],
  'hgtv': ['HGTV logo', 'Home Garden Television logo'],
  'animal planet': ['Animal Planet logo'],
  'comedy central': ['Comedy Central logo'],
  'adult swim': ['Adult Swim logo'],
  'tnt': ['TNT logo', 'Turner Network Television logo'],
  'tbs': ['TBS logo', 'Turner Broadcasting System logo'],
  'usa': ['USA Network logo', 'USA logo'],
  'syfy': ['Syfy logo', 'Sci-Fi Channel logo'],
  'amc': ['AMC logo', 'American Movie Classics logo'],
  'bravo': ['Bravo logo', 'Bravo TV logo'],
  'lifetime': ['Lifetime logo', 'Lifetime Television logo'],
  'tlc': ['TLC logo', 'The Learning Channel logo'],
  'weather channel': ['Weather Channel logo', 'The Weather Channel logo'],
  'travel channel': ['Travel Channel logo'],
  'cooking channel': ['Cooking Channel logo'],
  'diy': ['DIY Network logo', 'Do It Yourself Network logo'],
  'golf channel': ['Golf Channel logo', 'The Golf Channel logo'],
  'science channel': ['Science Channel logo', 'The Science Channel logo'],
  'oxygen': ['Oxygen logo', 'Oxygen Network logo'],
  'we tv': ['WE tv logo', 'Women\'s Entertainment logo'],
  'own': ['OWN logo', 'Oprah Winfrey Network logo'],
  'bet': ['BET logo', 'Black Entertainment Television logo'],
  'cmt': ['CMT logo', 'Country Music Television logo'],
  'fuse': ['Fuse logo', 'Fuse TV logo'],
  'showtime': ['Showtime logo', 'Showtime Networks logo'],
  'starz': ['Starz logo', 'Starz Entertainment logo'],
  'cinemax': ['Cinemax logo', 'HBO Cinemax logo'],
  'epix': ['Epix logo', 'MGM Epix logo'],
  'msnbc': ['MSNBC logo', 'Microsoft NBC logo'],
  'cnbc': ['CNBC logo', 'Consumer News Business Channel logo'],
  'bloomberg': ['Bloomberg logo', 'Bloomberg Television logo'],
  'newsmax': ['Newsmax logo', 'Newsmax TV logo'],
  'oan': ['OAN logo', 'One America News logo'],
  'pbs': ['PBS logo', 'Public Broadcasting Service logo'],
  'cw': ['CW logo', 'The CW logo'],
  'fx': ['FX logo', 'FX Networks logo'],
  'fxx': ['FXX logo', 'FXX Networks logo']
};

function getChannelVariations(channelName) {
  const variations = [];
  const name = channelName.toLowerCase();
  
  // Check each variation pattern
  for (const [key, values] of Object.entries(CHANNEL_VARIATIONS)) {
    if (name.includes(key)) {
      variations.push(...values);
    }
  }
  
  return variations;
}

module.exports = {
  CHANNEL_VARIATIONS,
  getChannelVariations
};