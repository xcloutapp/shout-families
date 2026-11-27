export type PersonId = string;

export interface Person {
  id: PersonId;
  name: string;
  color: string;
  adult: boolean;
}

export type GroupType = 'family' | 'house' | 'mates';

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  ownerId: PersonId;
  memberIds: PersonId[];
  members: Record<PersonId, Omit<Person, 'id'>>;
  status?: Record<PersonId, { label: 'home' | 'work' | 'out' | 'away'; at: number }>;
  createdAt: number;
}

export interface UserDoc {
  name: string;
  color: string;
  adult: boolean;
  groupIds: string[];
  activeGroupId?: string;
  groupNames?: Record<string, string>;
  usuals?: Record<string, string[]>;
  phrases?: Record<string, number>;
  places?: string[];
}

interface CardBase {
  id: string;
  chatId?: string;
  shareToken?: string;
  createdBy: PersonId;
  createdAt: number;
  forIds: PersonId[];
  due?: number;
  status: 'open' | 'claimed' | 'done';
  claimedBy?: PersonId;
  notMe: PersonId[];
}

export interface RunOrder {
  id: string;
  personId: PersonId;
  stop: string;
  text: string;
  note?: string;
  ticked: boolean;
  missing?: string;
  /** When the order was added. */
  at?: number;
}

export interface RunCard extends CardBase {
  kind: 'run';
  stops: { shop: string; addedBy: PersonId; approved: boolean }[];
  orders: RunOrder[];
  locked: boolean;
  /** A saved place (menu + phone) for this run. */
  placeId?: string;
  /** When the buyer locked the run in, and when they last tapped Call (orders after either are flagged). */
  lockedAt?: number;
  calledAt?: number;
}

/** A saved takeaway place: tap Menu or Call from a run. */
export interface Place {
  id: string;
  name: string;
  cuisine: string;
  phone?: string;
  menuUrl?: string;
  addedBy: PersonId;
  at: number;
}

export interface ListItem {
  id: string;
  text: string;
  by: PersonId;
  at: number;
}

/** "Next time someone's at Coles…" items, waiting for the next run there. Doc id = shop name. */
export interface ShopList {
  id: string;
  shop: string;
  items: ListItem[];
}

export interface DinnerCard extends CardBase {
  kind: 'dinner';
  home: Record<PersonId, 'yes' | 'no'>;
  options: { label: string; votes: PersonId[] }[];
}

export interface JobCard extends CardBase {
  kind: 'job';
  title: string;
  lift?: boolean;
  tokens?: { who?: string; where?: string; when?: string };
}

export type Card = RunCard | DinnerCard | JobCard;

export interface LedgerEntry {
  id: string;
  owerId: PersonId;
  owedId: PersonId;
  amount?: number;
  favour?: string;
  what: string;
  createdAt: number;
  createdBy: PersonId;
  settled: boolean;
}

export type StatusLabel = 'home' | 'work' | 'out' | 'away';

export interface MemberStatus {
  label: StatusLabel;
  at: number;
}

export interface Chat {
  id: string;
  name?: string;
  kind: 'home' | 'fun';
  everyone: boolean;
  memberIds: PersonId[];
  createdAt: number;
  createdBy: PersonId;
  lastAt: number;
  lastText?: string;
}

export interface Tokens {
  who?: string;
  where?: string;
  when?: string;
}

export interface Message {
  id: string;
  authorId: PersonId;
  createdAt: number;
  text?: string;
  tokens?: Tokens;
  cardId?: string;
  link?: { url: string; platform: 'instagram' | 'tiktok' | 'youtube' | 'web' };
  photoId?: string;
  reactions?: Record<PersonId, 'good' | 'nah'>;
  replies?: Record<PersonId, string>;
  note?: string;
  eventId?: string;
  dismissed?: boolean;
  /** This message added to a shopping list (shows the list). */
  listShop?: string;
}

export interface Share {
  gid: string;
  cardId: string;
  chatId: string;
  buyerName: string;
  shops: string[];
  names: string[];
  orders: { name: string; text: string }[];
  closesAt?: number;
  open: boolean;
}

export interface CalEvent {
  id: string;
  personId: PersonId;
  kind: 'away' | 'work' | 'event';
  title: string;
  days: string[]; // "2026-11-30"
  start?: string; // "17:00"
  end?: string;
  createdBy: PersonId;
  createdAt: number;
  chatId?: string;
  msgId?: string;
}
