// Loyalty programs: which program a provider or program name belongs to, so "Westin", "Marriott
// Bonvoy" and "Bonvoy" all mean the same account. Shared with the inbound-email function (inlined by
// scripts/build-inbound.mjs), so keep it plain JavaScript with no imports.

export const PROGRAMS = [
  ['aadvantage', 'AAdvantage', /aadvantage|\bamerican( airlines)?\b|\bamerican eagle\b/i],
  ['skymiles', 'Delta SkyMiles', /skymiles|\bdelta\b/i],
  ['mileageplus', 'United MileagePlus', /mileageplus|\bunited( airlines)?\b/i],
  ['rapidrewards', 'Southwest Rapid Rewards', /rapid rewards|southwest/i],
  ['alaska', 'Alaska Mileage Plan', /mileage plan|alaska air/i],
  ['trueblue', 'JetBlue TrueBlue', /trueblue|jetblue/i],
  ['bonvoy', 'Marriott Bonvoy', /bonvoy|marriott|ritz[- ]carlton|westin|sheraton|st\.? regis|courtyard|residence inn|autograph collection|le m[ée]ridien|fairfield|springhill|renaissance|\baloft\b|luxury collection|\bedition\b|w hotels?/i],
  ['hilton', 'Hilton Honors', /hilton|conrad|waldorf|doubletree|embassy suites|hampton inn|homewood|curio|canopy by|tapestry/i],
  ['hyatt', 'World of Hyatt', /hyatt|andaz|thompson hotels?/i],
  ['ihg', 'IHG One Rewards', /\bihg\b|intercontinental|holiday inn|kimpton|crowne plaza|six senses|hotel indigo/i],
  ['hertz', 'Hertz Gold Plus', /hertz/i],
  ['national', 'National Emerald Club', /emerald club|national car/i],
  ['avis', 'Avis Preferred', /\bavis\b/i],
  ['enterprise', 'Enterprise Plus', /enterprise/i],
  ['regent', 'Regent Seven Seas', /regent seven seas|\brssc\b/i],
  ['amawaterways', 'AmaWaterways', /ama ?waterways/i],
  ['royalcaribbean', 'Royal Caribbean Crown & Anchor', /royal caribbean|crown & anchor/i],
  ['viking', 'Viking', /\bviking\b/i],
  ['amtrak', 'Amtrak Guest Rewards', /amtrak/i],
];

// a stable id for the program a name or provider belongs to ('' when unknown)
export function programKey(text) {
  const s = String(text || '');
  if (!s.trim()) return '';
  for (const [key, , re] of PROGRAMS) if (re.test(s)) return key;
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// a known program, for a booking's provider and title (unknown providers have no program)
export function bookingProgram(provider, title) {
  const s = `${provider || ''} ${title || ''}`;
  for (const [key, name, re] of PROGRAMS) if (re.test(s)) return { key, name };
  return null;
}

// the last 4 characters of a member number, for matching masked numbers like ****1234
export const last4 = (n) => String(n || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
