// Reads an ordinary chat message and works out whether it's a run, job, lift or dinner question.
// Rule-based for now (fast, free, works offline); an AI step can replace this later.

import type { Person } from './types';

export const SHOP_ALIASES: [RegExp, string][] = [
  [/\b(maccas|mc ?donald'?s|mcdonalds)\b/i, 'Maccas'],
  [/\b(gyg|guzman( y gomez)?)\b/i, 'GYG'],
  [/\bkfc\b/i, 'KFC'],
  [/\bcoles\b/i, 'Coles'],
  [/\b(woolies|woolworths)\b/i, 'Woolies'],
  [/\biga\b/i, 'IGA'],
  [/\bdan ?murphy'?s\b|\bbottle ?(shop|o)\b/i, "Dan Murphy's"],
  [/\baldi\b/i, 'Aldi'],
  [/\bsubway\b/i, 'Subway'],
  [/\bhungry ?jack'?s?\b/i, "Hungry Jack's"],
  [/\b(domino'?s|dominoe?s|dom'?s)\b/i, "Domino's"],
  [/\b(squeaky wheel)\b/i, 'Squeaky Wheel'],
  // Food types (a saved place can be picked on the run)
  [/\bthai\b/i, 'Thai'],
  [/\b(indian|curry|curries)\b/i, 'Indian'],
  [/\bchinese\b/i, 'Chinese'],
  [/\bpizzas?\b/i, 'Pizza'],
  [/\bsushi\b/i, 'Sushi'],
  [/\bjapanese\b/i, 'Japanese'],
  [/\b(vietnamese|pho|banh mi)\b/i, 'Vietnamese'],
  [/\bkorean\b/i, 'Korean'],
  [/\bburgers?\b/i, 'Burgers'],
  [/\bfish (and|n|&) chips\b/i, 'Fish and chips'],
  [/\b(kebabs?|hsp|snack pack)\b/i, 'Kebabs'],
  [/\bmexican\b/i, 'Mexican'],
];

export interface PlaceRef {
  id: string;
  name: string;
  cuisine: string;
}

/** The first shop, food type or saved place mentioned in the text. */
export function findShopAt(text: string, places: PlaceRef[] = []): { shop: string; placeId?: string; index: number; end: number } | null {
  let best: { shop: string; placeId?: string; index: number; end: number } | null = null;
  const consider = (re: RegExp, shop: string, placeId?: string) => {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index || (m.index === best.index && placeId))) best = { shop, placeId, index: m.index, end: m.index + m[0].length };
  };
  for (const p of places) consider(new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), p.cuisine, p.id);
  for (const [re, name] of SHOP_ALIASES) consider(new RegExp(re.source, 'i'), name);
  return best;
}

export function findShop(text: string, places: PlaceRef[] = []): string | null {
  return findShopAt(text, places)?.shop ?? null;
}

const SUPERMARKET_NAMES = ['Coles', 'Woolies', 'IGA', 'Aldi'];

/** Split "toilet paper and tiny teddies, milk" into items. */
export function splitItems(text: string): string[] {
  return text
    .replace(/[.!?]+$/, '')
    .split(/\s*(?:,|\band\b|&|\+)\s*/i)
    .map((x) => x.replace(/^(?:also |please |pls |some |more |a few |a |an )+/i, '').replace(/\s+(?:please|pls|thanks)$/i, '').trim())
    .filter((x) => x.length > 1 && x.length < 60)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
}

/** "Next time someone's at Coles get toilet paper", "add milk to the Coles list", "we need bread". */
export function detectList(text: string): { shop: string; items: string[] } | null {
  const t = text.trim();
  const at = findShopAt(t);
  const supermarket = at && SUPERMARKET_NAMES.includes(at.shop) ? at.shop : null;
  let m = t.match(/\badd (.+?) to the (?:(\w[\w' ]*?) )?(?:shopping )?list\b/i);
  if (m) {
    const items = splitItems(m[1]);
    const named = m[2] ? findShop(m[2]) : null;
    return items.length ? { shop: named && SUPERMARKET_NAMES.includes(named) ? named : 'Groceries', items } : null;
  }
  if (/\bnext time\b/i.test(t) && supermarket && at) {
    let rest = t.slice(at.end).replace(/^['’]?s?\b/, '');
    rest = rest.replace(/^[\s,.:;-]*(?:can (?:you|someone|u|anyone) )?(?:please |pls )?(?:get|grab|pick up|buy|grab us|get us)?\s*(?:some |more )?/i, '');
    const items = splitItems(rest);
    return items.length ? { shop: supermarket, items } : null;
  }
  m = t.match(/^(coles|woolies|woolworths|iga|aldi|shopping) list[:,-]?\s+(.+)$/i);
  if (m) {
    const items = splitItems(m[2]);
    const named = findShop(m[1]);
    return items.length ? { shop: named && SUPERMARKET_NAMES.includes(named) ? named : 'Groceries', items } : null;
  }
  m = t.match(/^(?:we(?:'?re| are) (?:out of|low on|running low on)|we need (?!to\b)(?:more |some )?|need more |out of )(.+)$/i);
  if (m && !/\?$/.test(t) && !/\b(lift|ride|pick|help|someone|anyone|talk|chat|money|cash|time|hand|break|holiday|plan)\b/i.test(t)) {
    const items = splitItems(m[1].replace(/\s+(?:from|at) (coles|woolies|woolworths|iga|aldi)\b.*$/i, ''));
    return items.length && items.length <= 8 ? { shop: supermarket ?? 'Groceries', items } : null;
  }
  return null;
}

export type Intent =
  | { kind: 'run'; shop: string; placeId?: string }
  | { kind: 'list'; shop: string; items: string[] }
  | { kind: 'job'; title: string; assignee?: string }
  | { kind: 'lift'; title: string; who?: string }
  | { kind: 'dinner' }
  | { kind: 'stop'; shop: string }
  | null;

const JOB_PATTERNS = [
  /\b(bring|get|take|hang|put)\b.{0,25}\b(washing|clothes|bins?|rubbish|recycling|cans)\b/i,
  /\b(washing|bins?|rubbish|recycling)\b.{0,15}\b(in|out)\b/i,
  /\bclean\b.{0,20}\b(kitchen|bathroom|room|up|car)\b/i,
  /\b(dishwasher|dishes|vacuum|hoover|mow|walk the dog|feed the (dog|cat))\b/i,
  /\bkitchen duty\b/i,
];

function tidy(text: string) {
  let t = text.trim().replace(/\s+/g, ' ');
  t = t.replace(/^(can|could) (someone|somebody|anyone|you)( please)? /i, '');
  t = t.replace(/^(please|pls) /i, '');
  t = t.replace(/(,? ?(please|pls|thanks|thank you))?[.!?]*$/i, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Who the message is addressed to, if it starts with a family member's name ("Lewis, bins"). */
function addressee(text: string, people: Person[]): Person | undefined {
  const first = text.trim().split(/[\s,:]+/)[0]?.toLowerCase();
  return people.find((p) => p.name.toLowerCase() === first);
}

export function detect(text: string, people: Person[], opts: { runOpen: boolean; places?: PlaceRef[] }): Intent {
  const t = text.trim();
  if (!t || /https?:\/\//i.test(t)) return null;
  const list = detectList(t);
  if (list) return { kind: 'list', ...list };
  const found = findShopAt(t, opts.places);
  const shop = found?.shop ?? null;
  const placeId = found?.placeId;

  // "Going to GYG", "heading to coles", "I'll grab maccas", "getting KFC"
  if (shop && /\b(going|heading|off|popping|driving|stopping|grabbing|getting|i'?ll grab|i'?ll get|doing a|at)\b/i.test(t) && !/\b(can i|could i|can you|can u)\b/i.test(t)) {
    return { kind: 'run', shop, placeId };
  }
  // "Send me your Thai orders", "Who wants pizza?", "Ordering Thai from Chilli Basil"
  if (shop && !opts.runOpen && /\b(orders?|who wants|anyone want|does anyone want|what does everyone want|ordering|order from)\b/i.test(t)) {
    return { kind: 'run', shop, placeId };
  }
  // "Getting dinner, what does everyone want?" (no shop named yet)
  if (/\b(getting|grabbing|picking up|ordering)\b.{0,15}\b(dinner|takeaway|food|lunch)\b/i.test(t) && /\b(want|anyone|everyone|orders?)\b/i.test(t)) {
    return { kind: 'run', shop: 'Takeaway' };
  }
  // "Can I have KFC?" while a run is open = ask for another stop
  if (shop && opts.runOpen && /\b(can i|could i|can you|can u|also|and)\b/i.test(t)) {
    return { kind: 'stop', shop };
  }
  if (/\bwho'?s (home|in) (for|tonight)|\bhome for dinner\b|\bwhat (should we|do (you|we) want|does everyone want) (have |to have )?for dinner\b|\bwhat'?s for dinner\b/i.test(t)) {
    return { kind: 'dinner' };
  }
  const lift = t.match(/\bpick (?:up )?(\w+)(?: up)?\b|\b(?:drop|take) (\w+) (?:off|to)\b|\b(?:can someone|can anyone)\b.{0,15}\b(?:pick me up|give me a lift|get me)\b/i);
  if (lift) {
    const name = (lift[1] || lift[2] || '').toLowerCase();
    const who = people.find((p) => p.name.toLowerCase() === name)?.name ?? (/\bme\b/i.test(t) ? undefined : undefined);
    return { kind: 'lift', title: tidy(t), who };
  }
  if (JOB_PATTERNS.some((re) => re.test(t))) {
    const to = addressee(t, people);
    return { kind: 'job', title: tidy(to ? t.replace(new RegExp(`^${to.name}[\\s,:]*`, 'i'), '') : t), assignee: to?.id };
  }
  return null;
}

export function detectLink(text: string): { url: string; platform: 'instagram' | 'tiktok' | 'youtube' | 'web' } | null {
  const m = text.match(/https?:\/\/\S+/i);
  if (!m) return null;
  const url = m[0].replace(/[),.]+$/, '');
  if (/instagram\.com/i.test(url)) return { url, platform: 'instagram' };
  if (/tiktok\.com/i.test(url)) return { url, platform: 'tiktok' };
  if (/(youtube\.com|youtu\.be)/i.test(url)) return { url, platform: 'youtube' };
  return { url, platform: 'web' };
}

/** Normalise a sent message so repeats ("Bins out!", "bins out") count as the same phrase. */
export const phraseKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
