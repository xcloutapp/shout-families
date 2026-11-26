import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Card, DinnerCard, Group, GroupType, JobCard, LedgerEntry, Person, PersonId, RunCard, UserDoc } from './types';

export const COLORS = ['#FFB38A', '#F5C6E0', '#B3A6FF', '#8FD3FF', '#6FD3A8', '#FFD27A', '#FF9AA2', '#C3E88D'];

const uid = () => Math.random().toString(36).slice(2, 10);

type Phase = 'loading' | 'signedOut' | 'profile' | 'group' | 'ready';

interface Session {
  phase: Phase;
  user: User | null;
  userDoc: UserDoc | null;
  group: Group | null;
  cards: Card[];
  ledger: LedgerEntry[];
}

const SessionCtx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [userDoc, setUserDoc] = useState<UserDoc | null | undefined>(undefined);
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [cards, setCards] = useState<Card[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  useEffect(() => {
    setUserDoc(undefined);
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (s) => setUserDoc(s.exists() ? (s.data() as UserDoc) : null));
  }, [user]);

  const gid = userDoc?.activeGroupId ?? userDoc?.groupIds?.[0];
  useEffect(() => {
    setGroup(undefined);
    setCards([]);
    setLedger([]);
    if (!gid) return;
    const unsubs = [
      onSnapshot(doc(db, 'groups', gid), (s) => setGroup(s.exists() ? ({ id: s.id, ...s.data() } as Group) : null), () => setGroup(null)),
      onSnapshot(query(collection(db, 'groups', gid, 'cards'), orderBy('createdAt', 'desc'), limit(150)), (q) =>
        setCards(q.docs.map((d) => ({ ...(d.data() as Card), id: d.id }))),
      ),
      onSnapshot(query(collection(db, 'groups', gid, 'ledger'), orderBy('createdAt', 'desc'), limit(300)), (q) =>
        setLedger(q.docs.map((d) => ({ ...(d.data() as LedgerEntry), id: d.id }))),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [gid]);

  let phase: Phase = 'loading';
  if (user === null) phase = 'signedOut';
  else if (user && userDoc === null) phase = 'profile';
  else if (user && userDoc && !gid) phase = 'group';
  else if (user && userDoc && gid && group === null) phase = 'group';
  else if (user && userDoc && group) phase = 'ready';

  return (
    <SessionCtx.Provider value={{ phase, user: user ?? null, userDoc: userDoc ?? null, group: group ?? null, cards, ledger }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('useSession outside provider');
  return s;
}

/* ---------- setup actions (before a group exists) ---------- */

export async function saveProfile(name: string, adult: boolean, color: string) {
  const u = auth.currentUser!;
  const ref = doc(db, 'users', u.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const d = existing.data() as UserDoc;
    await updateDoc(ref, { name, adult, color });
    for (const g of d.groupIds ?? []) {
      await updateDoc(doc(db, 'groups', g), { [`members.${u.uid}`]: { name, adult, color } }).catch(() => {});
    }
  } else {
    await setDoc(ref, { name, adult, color, groupIds: [] } satisfies UserDoc);
  }
}

export async function createGroup(name: string, type: GroupType) {
  const u = auth.currentUser!;
  const me = (await getDoc(doc(db, 'users', u.uid))).data() as UserDoc;
  const ref = doc(collection(db, 'groups'));
  const group: Omit<Group, 'id'> = {
    name,
    type,
    ownerId: u.uid,
    memberIds: [u.uid],
    members: { [u.uid]: { name: me.name, adult: me.adult, color: me.color } },
    createdAt: Date.now(),
  };
  await setDoc(ref, group);
  await updateDoc(doc(db, 'users', u.uid), { groupIds: arrayUnion(ref.id), activeGroupId: ref.id });
  return ref.id;
}

export async function joinGroup(groupId: string): Promise<'joined' | 'already' | 'missing'> {
  const u = auth.currentUser!;
  const me = (await getDoc(doc(db, 'users', u.uid))).data() as UserDoc;
  const ref = doc(db, 'groups', groupId);
  const result = await runTransaction(db, async (t) => {
    const s = await t.get(ref);
    if (!s.exists()) return 'missing' as const;
    const g = s.data() as Omit<Group, 'id'>;
    if (g.memberIds.includes(u.uid)) return 'already' as const;
    t.update(ref, {
      memberIds: [...g.memberIds, u.uid],
      [`members.${u.uid}`]: { name: me.name, adult: me.adult, color: me.color },
    });
    return 'joined' as const;
  });
  if (result !== 'missing') await updateDoc(doc(db, 'users', u.uid), { groupIds: arrayUnion(groupId), activeGroupId: groupId });
  return result;
}

export const switchGroup = (groupId: string) => updateDoc(doc(db, 'users', auth.currentUser!.uid), { activeGroupId: groupId });
export const logOut = () => signOut(auth);

/* ---------- the main store (once in a group) ---------- */

export function useStore() {
  const sess = useSession();
  const { user, userDoc, group } = sess;
  if (!user || !userDoc || !group) throw new Error('useStore before ready');
  const meId = user.uid;
  const gid = group.id;

  const people: Person[] = group.memberIds.map((id) => ({ id, ...(group.members[id] ?? { name: 'Someone', color: '#888', adult: true }) }));
  const person = (id: PersonId): Person => people.find((p) => p.id === id) ?? { id, name: 'Someone', color: '#888', adult: true };
  const me = person(meId);
  const cardRef = (id: string) => doc(db, 'groups', gid, 'cards', id);

  const updateCard = <T extends Card>(id: string, fn: (c: T) => T) =>
    runTransaction(db, async (t) => {
      const s = await t.get(cardRef(id));
      if (!s.exists()) return;
      const { id: _drop, ...rest } = fn({ ...(s.data() as T), id }) as T & { id: string };
      void _drop;
      t.set(cardRef(id), rest);
    }).catch((e) => console.error('card update failed', e));

  const addLedger = (entries: Omit<LedgerEntry, 'id' | 'createdAt' | 'settled' | 'createdBy'>[]) => {
    const b = writeBatch(db);
    for (const e of entries) {
      b.set(doc(collection(db, 'groups', gid, 'ledger')), { ...e, createdAt: Date.now(), createdBy: meId, settled: false });
    }
    return b.commit();
  };

  const newCard = <T extends Card>(card: Omit<T, 'id'>): string => {
    const ref = doc(collection(db, 'groups', gid, 'cards'));
    setDoc(ref, card).catch((e) => console.error('create failed', e));
    return ref.id;
  };

  const base = (forIds: PersonId[], due?: number) => ({
    createdBy: meId,
    createdAt: Date.now(),
    forIds,
    due,
    status: 'open' as const,
    notMe: [] as PersonId[],
  });

  return {
    state: { usuals: { [meId]: userDoc.usuals ?? {} } as Record<PersonId, Record<string, string[]>> },
    group,
    members: people,
    me,
    person,
    cards: sess.cards,
    ledger: sess.ledger,
    isOwner: group.ownerId === meId,

    setAdult: (id: PersonId, adult: boolean) => updateDoc(doc(db, 'groups', gid), { [`members.${id}.adult`]: adult }),

    startRun(shop: string, forIds: PersonId[], due: number): string {
      return newCard<RunCard>({ ...base(forIds, due), kind: 'run', stops: [{ shop, addedBy: meId, approved: true }], orders: [], locked: false });
    },
    addOrder(cardId: string, stop: string, text: string, note?: string) {
      updateCard<RunCard>(cardId, (c) => ({
        ...c,
        notMe: c.notMe.filter((p) => p !== meId),
        orders: [...c.orders, { id: uid(), personId: meId, stop, text, note, ticked: false }],
      }));
    },
    removeOrder(cardId: string, orderId: string) {
      updateCard<RunCard>(cardId, (c) => ({ ...c, orders: c.orders.filter((o) => o.id !== orderId) }));
    },
    askStop(cardId: string, shop: string) {
      updateCard<RunCard>(cardId, (c) =>
        c.stops.some((s) => s.shop === shop) || c.stops.length >= 3 ? c : { ...c, stops: [...c.stops, { shop, addedBy: meId, approved: false }] },
      );
    },
    answerStop(cardId: string, shop: string, yes: boolean) {
      updateCard<RunCard>(cardId, (c) => ({
        ...c,
        stops: yes ? c.stops.map((s) => (s.shop === shop ? { ...s, approved: true } : s)) : c.stops.filter((s) => s.shop !== shop),
        orders: yes ? c.orders : c.orders.filter((o) => o.stop !== shop),
      }));
    },
    lockRun(cardId: string) {
      updateCard<RunCard>(cardId, (c) => ({ ...c, locked: true, status: 'claimed', claimedBy: c.createdBy }));
    },
    tick(cardId: string, orderId: string) {
      updateCard<RunCard>(cardId, (c) => ({
        ...c,
        orders: c.orders.map((o) => (o.id === orderId ? { ...o, ticked: !o.ticked, missing: undefined } : o)),
      }));
    },
    markMissing(cardId: string, orderId: string, note: string) {
      updateCard<RunCard>(cardId, (c) => ({
        ...c,
        orders: c.orders.map((o) => (o.id === orderId ? { ...o, ticked: false, missing: note || 'Couldn’t get it' } : o)),
      }));
    },
    finishRun(cardId: string, amounts: Record<PersonId, number>) {
      const card = sess.cards.find((c) => c.id === cardId) as RunCard;
      const shops = card.stops.filter((s) => s.approved).map((s) => s.shop).join(' + ');
      addLedger(
        Object.entries(amounts)
          .filter(([pid, amt]) => pid !== card.createdBy && amt > 0)
          .map(([pid, amt]) => ({ owerId: pid, owedId: card.createdBy, amount: Math.round(amt * 100) / 100, what: `${shops} run` })),
      );
      updateCard(cardId, (c) => ({ ...c, status: 'done' }));
    },

    startDinner(forIds: PersonId[], options: string[]): string {
      return newCard<DinnerCard>({ ...base(forIds), kind: 'dinner', home: {}, options: options.filter(Boolean).map((label) => ({ label, votes: [] })) });
    },
    answerHome(cardId: string, ans: 'yes' | 'no') {
      updateCard<DinnerCard>(cardId, (c) => ({ ...c, home: { ...c.home, [meId]: ans } }));
    },
    vote(cardId: string, label: string) {
      updateCard<DinnerCard>(cardId, (c) => ({
        ...c,
        options: c.options.map((o) => ({
          ...o,
          votes: o.label === label ? [...o.votes.filter((v) => v !== meId), meId] : o.votes.filter((v) => v !== meId),
        })),
      }));
    },
    addOption(cardId: string, label: string) {
      updateCard<DinnerCard>(cardId, (c) =>
        c.options.some((o) => o.label.toLowerCase() === label.toLowerCase()) ? c : { ...c, options: [...c.options, { label, votes: [meId] }] },
      );
    },

    startJob(title: string, forIds: PersonId[], due?: number): string {
      return newCard<JobCard>({ ...base(forIds, due), kind: 'job', title });
    },
    claim(cardId: string) {
      updateCard(cardId, (c) => (c.claimedBy ? c : { ...c, status: 'claimed', claimedBy: meId }));
    },
    unclaim(cardId: string) {
      updateCard(cardId, (c) => ({ ...c, status: 'open', claimedBy: undefined }));
    },
    notMe(cardId: string) {
      updateCard(cardId, (c) => ({ ...c, notMe: [...new Set([...c.notMe, meId])] }));
    },
    doneCard(cardId: string, logFavour: boolean) {
      const card = sess.cards.find((c) => c.id === cardId);
      if (card && card.kind === 'job' && logFavour && card.createdBy !== meId) {
        addLedger([{ owerId: card.createdBy, owedId: meId, favour: card.title, what: card.title }]);
      }
      updateCard(cardId, (c) => ({ ...c, status: 'done', claimedBy: c.claimedBy ?? meId }));
    },
    deleteCard(cardId: string) {
      deleteDoc(cardRef(cardId));
    },

    logShout(owerId: PersonId, owedId: PersonId, what: string, amount?: number) {
      addLedger([{ owerId, owedId, what, amount, favour: amount ? undefined : what }]);
    },
    settleWith(otherId: PersonId) {
      const b = writeBatch(db);
      for (const e of sess.ledger) {
        if (!e.settled && e.amount && ((e.owerId === meId && e.owedId === otherId) || (e.owerId === otherId && e.owedId === meId))) {
          b.update(doc(db, 'groups', gid, 'ledger', e.id), { settled: true });
        }
      }
      b.commit();
    },
    returnFavour(entryId: string) {
      updateDoc(doc(db, 'groups', gid, 'ledger', entryId), { settled: true });
    },
    saveUsual(shop: string, text: string) {
      const list = userDoc.usuals?.[shop] ?? [];
      if (list.includes(text)) return;
      updateDoc(doc(db, 'users', meId), { [`usuals.${shop}`]: [text, ...list].slice(0, 6) });
    },
  };
}

/** Net money balance with each other member, from my point of view. Positive = they owe me. */
export function moneyBalances(ledger: LedgerEntry[], meId: PersonId): Record<PersonId, number> {
  const out: Record<PersonId, number> = {};
  for (const e of ledger) {
    if (e.settled || !e.amount) continue;
    if (e.owedId === meId) out[e.owerId] = (out[e.owerId] ?? 0) + e.amount;
    else if (e.owerId === meId) out[e.owedId] = (out[e.owedId] ?? 0) - e.amount;
  }
  return out;
}

export const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

export function timeLeft(due?: number): string {
  if (!due) return '';
  const mins = Math.round((due - Date.now()) / 60000);
  if (mins <= 0) return 'closed';
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export const clock = (t: number) => new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
