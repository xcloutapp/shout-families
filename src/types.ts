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
}

interface CardBase {
  id: string;
  groupId: string;
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
}

export interface RunCard extends CardBase {
  kind: 'run';
  stops: { shop: string; addedBy: PersonId; approved: boolean }[];
  orders: RunOrder[];
  locked: boolean;
}

export interface DinnerCard extends CardBase {
  kind: 'dinner';
  home: Record<PersonId, 'yes' | 'no'>;
  options: { label: string; votes: PersonId[] }[];
}

export interface JobCard extends CardBase {
  kind: 'job';
  title: string;
}

export type Card = RunCard | DinnerCard | JobCard;

export interface LedgerEntry {
  id: string;
  groupId: string;
  owerId: PersonId;
  owedId: PersonId;
  amount?: number;
  favour?: string;
  what: string;
  createdAt: number;
  settled: boolean;
}

export interface AppState {
  meId: PersonId;
  people: Person[];
  groups: Group[];
  activeGroupId: string;
  cards: Card[];
  ledger: LedgerEntry[];
  usuals: Record<PersonId, Record<string, string[]>>;
}
