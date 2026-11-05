/**
 * Deterministic prompt parsing. Runs before any AI call so the director gets
 * hard hints (duration, list count, platform...) and so the offline mock can
 * build something sensible without a model. Pure: no I/O, no randomness.
 */
import type { PromptHints } from "../providers/types";
import type { ProceduralArt } from "../schemas/catalog";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
  a: 1, an: 1, half: 0.5,
};

const toNumber = (raw: string): number | undefined => {
  const s = raw.toLowerCase().trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return NUMBER_WORDS[s];
};

const NUM = String.raw`(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety|an?|half)`;

export const parseDuration = (prompt: string): number | undefined => {
  const p = prompt.toLowerCase();
  // "1 minute 30 seconds" / "1m30s"
  const combo = p.match(new RegExp(String.raw`\b${NUM}[\s-]*(?:minutes?|mins?|m)\b[\s,and]*(\d+)[\s-]*(?:seconds?|secs?|s)\b`));
  if (combo) {
    const m = toNumber(combo[1]);
    if (m !== undefined) return Math.round(m * 60 + Number(combo[2]));
  }
  if (/\bhalf[\s-]a[\s-]minute\b/.test(p)) return 30;
  const minutes = p.match(new RegExp(String.raw`\b${NUM}[\s-]*(?:minutes?|mins?|min)\b`));
  if (minutes) {
    const m = toNumber(minutes[1]);
    const idiom = /^an?$/.test(minutes[1]) && /\b(in|wait|just|for) an? minute\b/.test(p);
    if (m !== undefined && m <= 10 && !idiom) return Math.round(m * 60);
  }
  const seconds = p.match(new RegExp(String.raw`\b${NUM}[\s-]*(?:seconds?|secs?|sec|s)\b`));
  if (seconds) {
    const s = toNumber(seconds[1]);
    if (s !== undefined && s >= 3 && s <= 600) return Math.round(s);
  }
  return undefined;
};

// Nouns that typically follow a list count ("five useful AI tools", "3 habits").
const LIST_NOUNS =
  "tools|tips|habits|ways|reasons|facts|things|ideas|apps|steps|mistakes|secrets|hacks|tricks|books|places|foods|lessons|rules|signs|myths|questions|products|features|examples|strategies|benefits|exercises|routines|websites|gadgets|movies|games|destinations|cities|countries|inventions|animals|skills|methods|principles|techniques|trends|stocks|recipes|laws|theories|discoveries|quotes|items|points|options|alternatives|keys|lies|truths";

export const parseListCount = (prompt: string): number | undefined => {
  const p = prompt.toLowerCase();
  const top = p.match(new RegExp(String.raw`\btop[\s-]+${NUM}\b`));
  if (top) {
    const n = toNumber(top[1]);
    if (n && n >= 2 && n <= 20) return n;
  }
  // number + up to 3 adjective-ish words + list noun
  const re = new RegExp(String.raw`\b${NUM}\s+(?:[a-z0-9'-]+\s+){0,3}?(?:${LIST_NOUNS})\b`);
  const m = p.match(re);
  if (m) {
    const n = toNumber(m[1]);
    if (n && Number.isInteger(n) && n >= 2 && n <= 20) {
      // avoid "30 second ... tips" style duration matches
      return n;
    }
  }
  return undefined;
};

const FORMAT_PATTERNS: [string, RegExp][] = [
  ["tutorial", /\b(how to|how-to|tutorial|step[- ]by[- ]step|guide to|walkthrough|teach me)\b/],
  ["product", /\b(product (showcase|demo|launch|video)|showcase|unboxing|our (app|product|service)|launch video)\b/],
  ["ad", /\b(ad|advert|advertisement|commercial|promo|promotional|sponsor(ed)?|marketing video)\b/],
  ["story", /\b(story|tale|narrative|short film|once upon)\b/],
  ["cinematic", /\b(cinematic|epic|trailer|dramatic)\b/],
  ["listicle", /\b(top \w+|list of|listicle|\d+ (best|ways|tips|tools|habits|reasons|facts|things))\b/],
  ["explainer", /\b(explain|explainer|why does|why do|why is|how does|how do|what is|what are|science of|breakdown)\b/],
];

export const parseFormatHint = (prompt: string, listCount?: number): string | undefined => {
  const p = prompt.toLowerCase();
  if (listCount) {
    // A counted list wins over everything except an explicit ad/product brief.
    if (FORMAT_PATTERNS[1][1].test(p) || FORMAT_PATTERNS[2][1].test(p)) return FORMAT_PATTERNS[1][1].test(p) ? "product" : "ad";
    return "listicle";
  }
  for (const [name, re] of FORMAT_PATTERNS) if (re.test(p)) return name;
  return undefined;
};

const STYLE_WORDS = [
  "cinematic", "minimal", "minimalist", "retro", "vintage", "futuristic", "neon", "cyberpunk", "dark", "moody",
  "bright", "colorful", "colourful", "playful", "elegant", "luxury", "documentary", "bold", "modern", "clean",
  "dreamy", "epic", "dramatic", "calm", "energetic", "funny", "humorous", "educational", "techy", "tech",
  "anime", "cartoon", "watercolor", "watercolour", "3d", "photorealistic", "realistic", "vaporwave", "noir",
  "pastel", "warm", "cozy", "corporate", "professional", "gritty", "whimsical", "mysterious", "inspirational", "motivational",
];

export const parseStyleHints = (prompt: string): string[] => {
  const p = prompt.toLowerCase();
  const found = new Set<string>();
  for (const w of STYLE_WORDS) if (new RegExp(String.raw`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(p)) found.add(w);
  return [...found];
};

export const parsePlatform = (prompt: string): string | undefined => {
  const p = prompt.toLowerCase();
  if (/\btik ?tok\b/.test(p)) return "tiktok";
  if (/\b(instagram )?reels?\b/.test(p) || /\binstagram\b/.test(p)) return "reels";
  if (/\bshorts\b|\byoutube short\b/.test(p)) return "shorts";
  if (/\byoutube\b/.test(p)) return "youtube";
  return undefined;
};

const KNOWN_PEOPLE = [
  "elon musk", "taylor swift", "donald trump", "joe biden", "barack obama", "kamala harris", "jeff bezos", "bill gates",
  "mark zuckerberg", "steve jobs", "tim cook", "sam altman", "oprah", "beyonce", "beyoncé", "kim kardashian", "kanye",
  "cristiano ronaldo", "lionel messi", "lebron james", "michael jordan", "einstein", "albert einstein", "king charles",
  "putin", "vladimir putin", "xi jinping", "zelensky", "mrbeast", "pope francis", "pope leo", "warren buffett",
];
const PERSON_WORDS = /\b(celebrity|celebrities|celeb|president|prime minister|senator|ceo of|founder of|actor|actress|singer|rapper|influencer|politician|king|queen|prince|princess|billionaire|athlete|footballer|youtuber)\b/;

// Capitalised words that are not names (sentence starters, places, brands, generic topics).
const NOT_NAMES = new Set([
  "The", "A", "An", "Make", "Create", "Explain", "Why", "How", "What", "When", "Where", "Who", "Top", "Best", "Five", "Three", "Ten",
  "AI", "Artificial", "Intelligence", "New", "York", "San", "Francisco", "Los", "Angeles", "United", "States", "Kingdom", "North",
  "South", "East", "West", "Pacific", "Atlantic", "Ocean", "Moon", "Earth", "Mars", "Sun", "Solar", "System", "World", "War",
  "TikTok", "YouTube", "Shorts", "Reels", "Instagram", "Google", "Apple", "Microsoft", "Amazon", "Netflix", "Open", "Black",
  "Friday", "Monday", "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday", "January", "February", "March", "April", "May",
  "June", "July", "August", "September", "October", "November", "December", "Christmas", "Halloween", "Roman", "Empire",
  "Great", "Wall", "Milky", "Way", "Big", "Bang", "Black", "Hole", "Deep", "Space", "Station", "International", "European",
  "Union", "Middle", "Ages", "Stone", "Age", "Silicon", "Valley", "Hong", "Kong", "Machine", "Learning", "Chat", "GPT", "Claude",
]);

export const mentionsRealPerson = (prompt: string): boolean => {
  const lower = prompt.toLowerCase();
  if (KNOWN_PEOPLE.some((n) => new RegExp(String.raw`\b${n}\b`).test(lower))) return true;
  if (PERSON_WORDS.test(lower)) return true;
  // Two consecutive Capitalised words not at the start of a sentence and not in NOT_NAMES.
  const re = /(?<![.!?]\s|^)\b([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\s+([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g;
  for (const m of prompt.matchAll(re)) {
    if (!NOT_NAMES.has(m[1]) && !NOT_NAMES.has(m[2])) return true;
  }
  // Also check sentence-initial pairs like "Taylor Swift's tour" when the second word has a possessive.
  if (/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)'s\b/.test(prompt)) {
    const m = prompt.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)'s\b/)!;
    if (!NOT_NAMES.has(m[1]) && !NOT_NAMES.has(m[2])) return true;
  }
  return false;
};

export const isTimeSensitive = (prompt: string): boolean =>
  /\b(latest|today|tonight|yesterday|this (week|month|year)|right now|currently|current|breaking|news|recent(ly)?|just (announced|released|launched)|20[2-9]\d|price of|stock price|how much (is|does)|election|update[sd]?|new release)\b/i.test(prompt);

export const isFictional = (prompt: string): boolean =>
  /\b(story about|a story|short story|fictional|fiction|imagine a|fairy ?tale|once upon a time|bedtime story|myth about|legend of|a tale)\b/i.test(prompt);

export const isSpeculative = (prompt: string): boolean =>
  /\b(what if|what would happen|imagine if|hypothetical(ly)?|in an alternate|alternate (history|universe)|could we ever|would it be possible)\b/i.test(prompt);

export const parsePromptHints = (prompt: string): PromptHints => {
  const listCount = parseListCount(prompt);
  const speculative = isSpeculative(prompt);
  const fictional = isFictional(prompt);
  let formatHint = parseFormatHint(prompt, listCount);
  if (!formatHint && (speculative || fictional)) formatHint = fictional ? "story" : "cinematic";
  return {
    requestedDurationSeconds: parseDuration(prompt),
    listCount,
    formatHint,
    styleHints: parseStyleHints(prompt),
    platformHint: parsePlatform(prompt),
    mentionsRealPerson: mentionsRealPerson(prompt),
    timeSensitive: isTimeSensitive(prompt),
    fictional,
    speculative,
  };
};

/* ------------------------------------------------------------------ */
/* Procedural art suggestion (shared by the mock LLM and the storyboard */
/* repair step when a motion-graphics scene arrives without `art`).     */
/* ------------------------------------------------------------------ */

const ART_KEYWORDS: [ProceduralArt, RegExp][] = [
  ["lightning-bolt", /\b(lightning|thunderbolt|electric(ity)?|spark)\b/],
  ["charge-separation", /\b(charge|charges|static|ions?|polari[sz]ed?)\b/],
  ["thunder-wave", /\b(thunder|shock ?wave|sound wave|sonic|boom)\b/],
  ["storm-clouds", /\b(storm|clouds?|rain|weather|hurricane|tornado)\b/],
  ["two-moons-horizon", /\b(two moons|second moon|alien (sky|planet))\b/],
  ["earth-two-moons", /\b(earth.*moons|moons.*earth)\b/],
  ["tides", /\b(tides?|tidal)\b/],
  ["eclipse", /\b(eclipse)\b/],
  ["orbit-diagram", /\b(orbits?|orbital|planets?|solar system|gravity|satellites?|moon)\b/],
  ["starfield", /\b(space|stars?|galax(y|ies)|universe|cosmos|cosmic|nebula|astronaut|black hole|telescope)\b/],
  ["ocean-depths", /\b(ocean|sea|deep sea|underwater|marine|whales?|sharks?|fish|coral)\b/],
  ["sunrise", /\b(morning|sunrise|wake up|dawn|motivation|new beginning|start your day)\b/],
  ["focus-timer", /\b(focus|pomodoro|timer|deep work|minutes a day|time management|countdown)\b/],
  ["phone-focus", /\b(phone|notifications?|social media|screen time|distraction|scrolling|doomscroll)\b/],
  ["calendar-blocks", /\b(calendar|schedule|routine|planning|plan your|week|habits?)\b/],
  ["checklist", /\b(checklist|to-?do|tasks?|steps?|tips|list)\b/],
  ["bar-chart", /\b(money|finance|invest(ing|ment)?|stocks?|growth|revenue|budget|savings?|statistics?|percent|economy|price|market)\b/],
  ["wireframe-globe", /\b(global|world|countries|travel|internet|international|globe|map)\b/],
  ["particle-network", /\b(ai|a\.i\.|artificial intelligence|machine learning|neural|tech|technology|software|data|network|computer|robots?|apps?|tools?|code|coding|crypto|blockchain)\b/],
  ["flow-arrows", /\b(process|how it works|cause|effect|pipeline|workflow|steps|stages|leads to)\b/],
];

/** Picks the procedural art that best matches free text; falls back to a neutral gradient. */
export const suggestArt = (text: string, fallback: ProceduralArt = "aurora-gradient"): ProceduralArt => {
  const t = text.toLowerCase();
  for (const [art, re] of ART_KEYWORDS) if (re.test(t)) return art;
  return fallback;
};

/** All art that matches (ordered by table priority), for picking varied art across scenes. */
export const suggestArts = (text: string): ProceduralArt[] => {
  const t = text.toLowerCase();
  return ART_KEYWORDS.filter(([, re]) => re.test(t)).map(([a]) => a);
};
