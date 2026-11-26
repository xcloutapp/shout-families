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
  [/\b(domino'?s|dom'?s)\b/i, "Domino's"],
  [/\b(squeaky wheel)\b/i, 'Squeaky Wheel'],
];

export function findShop(text: string): string | null {
  for (const [re, name] of SHOP_ALIASES) if (re.test(text)) return name;
  return null;
}

export type Intent =
  | { kind: 'run'; shop: string }
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

export function detect(text: string, people: Person[], opts: { runOpen: boolean }): Intent {
  const t = text.trim();
  if (!t || /https?:\/\//i.test(t)) return null;
  const shop = findShop(t);

  // "Going to GYG", "heading to coles", "I'll grab maccas", "getting KFC"
  if (shop && /\b(going|heading|off|popping|driving|stopping|grabbing|getting|i'?ll grab|i'?ll get|doing a|at)\b/i.test(t) && !/\b(can i|could i|can you|can u)\b/i.test(t)) {
    return { kind: 'run', shop };
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
