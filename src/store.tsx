import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  getDocs,
  where,
  increment,
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
  deleteField,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { CalEvent, Card, Chat, DinnerCard, Group, GroupType, JobCard, LedgerEntry, Message, Person, PersonId, Place, RunCard, RunOrder, Share, ShopList, StatusLabel, Tokens, UserDoc } from './types';
import { GENERAL_LIST, SUPERMARKETS } from './seed';
import { DIRECTORY } from './data/takeaways';

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
  chats: Chat[];
  events: CalEvent[];
  lists: ShopList[];
  takeaways: Place[];
}

const SessionCtx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [userDoc, setUserDoc] = useState<UserDoc | null | undefined>(undefined);
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [cards, setCards] = useState<Card[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [lists, setLists] = useState<ShopList[]>([]);
  const [takeaways, setTakeaways] = useState<Place[]>([]);

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
    setChats([]);
    setEvents([]);
    setLists([]);
    setTakeaways([]);
    if (!gid || !user) return;
    ensureDefaultChats(gid).catch((e) => console.error('default chats', e));
    const unsubs = [
      onSnapshot(query(collection(db, 'groups', gid, 'chats'), where('memberIds', 'array-contains', user.uid)), (q) =>
        setChats(q.docs.map((d) => ({ ...(d.data() as Chat), id: d.id })).sort((a, b) => b.lastAt - a.lastAt)),
      (e) => console.error('chats', e)),
      onSnapshot(doc(db, 'groups', gid), (s) => setGroup(s.exists() ? ({ id: s.id, ...s.data() } as Group) : null), () => setGroup(null)),
      onSnapshot(query(collection(db, 'groups', gid, 'cards'), orderBy('createdAt', 'desc'), limit(150)), (q) =>
        setCards(q.docs.map((d) => ({ ...(d.data() as Card), id: d.id }))),
      ),
      onSnapshot(query(collection(db, 'groups', gid, 'events'), orderBy('createdAt', 'desc'), limit(300)), (q) =>
        setEvents(q.docs.map((d) => ({ ...(d.data() as CalEvent), id: d.id }))),
      () => {}),
      onSnapshot(collection(db, 'groups', gid, 'lists'), (q) => setLists(q.docs.map((d) => ({ ...(d.data() as ShopList), id: d.id }))), () => {}),
      onSnapshot(collection(db, 'groups', gid, 'places'), (q) =>
        setTakeaways(q.docs.map((d) => ({ ...(d.data() as Place), id: d.id })).sort((a, b) => b.at - a.at)),
      () => {}),
      onSnapshot(query(collection(db, 'groups', gid, 'ledger'), orderBy('createdAt', 'desc'), limit(300)), (q) =>
        setLedger(q.docs.map((d) => ({ ...(d.data() as LedgerEntry), id: d.id }))),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [gid, user]);

  let phase: Phase = 'loading';
  if (user === null) phase = 'signedOut';
  else if (user && userDoc === null) phase = 'profile';
  else if (user && userDoc && !gid) phase = 'group';
  else if (user && userDoc && gid && group === null) phase = 'group';
  else if (user && userDoc && group) phase = 'ready';

  return (
    <SessionCtx.Provider value={{ phase, user: user ?? null, userDoc: userDoc ?? null, group: group ?? null, cards, ledger, chats, events, lists, takeaways }}>
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

/** Every group has a family chat (everyone) and a Fun chat (reels and photos). Fixed ids so two phones can't make duplicates. */
export async function ensureDefaultChats(gid: string) {
  const u = auth.currentUser;
  if (!u) return;
  const g = (await getDoc(doc(db, 'groups', gid))).data() as Omit<Group, 'id'> | undefined;
  if (!g) return;
  for (const id of ['everyone', 'fun'] as const) {
    const ref = doc(db, 'groups', gid, 'chats', id);
    await runTransaction(db, async (t) => {
      const s = await t.get(ref);
      if (!s.exists()) {
        const chat: Omit<Chat, 'id'> = {
          kind: id === 'fun' ? 'fun' : 'home',
          name: id === 'fun' ? 'Fun' : g.name,
          everyone: true,
          memberIds: g.memberIds,
          createdAt: Date.now(),
          createdBy: u.uid,
          lastAt: id === 'fun' ? Date.now() - 1 : Date.now(),
          lastText: id === 'fun' ? 'Reels, TikToks and photos go here' : 'Say hi to the family',
        };
        t.set(ref, chat);
      } else if (!(s.data() as Chat).memberIds.includes(u.uid)) {
        t.update(ref, { memberIds: arrayUnion(u.uid) });
      }
    }).catch((e) => console.error('ensure chat', id, e));
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
  await updateDoc(doc(db, 'users', u.uid), { groupIds: arrayUnion(ref.id), activeGroupId: ref.id, [`groupNames.${ref.id}`]: name });
  return ref.id;
}

/** Accepts "groupId" or "groupId/inviteId" (from a named invite link). */
export async function joinGroup(joinRef: string): Promise<'joined' | 'already' | 'missing'> {
  const [groupId, inviteId] = joinRef.split('/');
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
  if (result !== 'missing') {
    const gname = ((await getDoc(doc(db, 'groups', groupId))).data() as { name?: string } | undefined)?.name ?? 'Group';
    await updateDoc(doc(db, 'users', u.uid), { groupIds: arrayUnion(groupId), activeGroupId: groupId, [`groupNames.${groupId}`]: gname });
    // Join every "everyone" chat in the group.
    const everyone = await getDocs(query(collection(db, 'groups', groupId, 'chats'), where('everyone', '==', true)));
    for (const c of everyone.docs) await updateDoc(c.ref, { memberIds: arrayUnion(u.uid) }).catch(() => {});
    if (inviteId && result === 'joined') {
      await updateDoc(doc(db, 'groups', groupId, 'invites', inviteId), { status: 'accepted', acceptedBy: u.uid, acceptedName: me.name, acceptedAt: Date.now() }).catch(() => {});
    }
  }
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
  const person = (id: PersonId): Person =>
    people.find((p) => p.id === id) ?? (id.startsWith('guest:') ? { id, name: id.slice(6), color: '#c9c9d1', adult: true } : { id, name: 'Someone', color: '#888', adult: true });
  const me = person(meId);
  const cardRef = (id: string) => doc(db, 'groups', gid, 'cards', id);

  const updateCard = <T extends Card>(id: string, fn: (c: T) => T) =>
    runTransaction(db, async (t) => {
      const s = await t.get(cardRef(id));
      if (!s.exists()) return;
      const next = fn({ ...(s.data() as T), id }) as T & { id: string };
      const { id: _drop, ...rest } = next;
      void _drop;
      t.set(cardRef(id), rest);
      // Keep a shared run link up to date for guests.
      if (next.kind === 'run' && next.shareToken) {
        t.update(doc(db, 'shares', next.shareToken), {
          orders: next.orders.map((o) => ({ name: person(o.personId).name, text: o.text })),
          shops: next.stops.filter((x) => x.approved).map((x) => x.shop),
          open: !next.locked && next.status !== 'done',
        });
      }
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

  const msgCol = (cid: string) => collection(db, 'groups', gid, 'chats', cid, 'messages');

  const sendMessage = async (cid: string, m: Omit<Message, 'id' | 'authorId' | 'createdAt'>): Promise<string> => {
    const ref = doc(msgCol(cid));
    const msg = { ...m, authorId: meId, createdAt: Date.now() };
    await setDoc(ref, msg);
    const preview = m.text ?? (m.link ? `${m.link.platform === 'web' ? 'Link' : m.link.platform === 'tiktok' ? 'TikTok' : 'Reel'}` : m.photoId ? 'Photo' : '');
    updateDoc(doc(db, 'groups', gid, 'chats', cid), { lastAt: msg.createdAt, lastText: `${me.name}: ${preview}`.slice(0, 120) }).catch(() => {});
    return ref.id;
  };

  /** Creates a card in a chat: the message shows the card inline. */
  const postCard = async <T extends Card>(cid: string, text: string, card: Omit<T, 'id'>, existingMsg?: string) => {
    const cardDoc = doc(collection(db, 'groups', gid, 'cards'));
    await setDoc(cardDoc, { ...card, chatId: cid });
    if (existingMsg) await updateDoc(doc(msgCol(cid), existingMsg), { cardId: cardDoc.id });
    else await sendMessage(cid, { text, cardId: cardDoc.id });
    return cardDoc.id;
  };

  const chatsList = sess.chats;
  const chatById = (cid: string) => chatsList.find((c) => c.id === cid);

  return {
    chats: chatsList,
    chatById,
    sendMessage,
    postCard,
    msgCol,
    updateMessage: (cid: string, mid: string, patch: Partial<Message>) => updateDoc(doc(msgCol(cid), mid), patch),
    async deleteMessage(cid: string, m: Message) {
      if (m.authorId !== meId) return;
      const card = m.cardId ? sess.cards.find((c) => c.id === m.cardId) : undefined;
      // A card nobody has used yet goes with the message.
      if (card && card.createdBy === meId && card.status === 'open' && !(card.kind === 'run' && card.orders.length > 0)) {
        await deleteDoc(cardRef(card.id)).catch(() => {});
      }
      if (m.photoId) await deleteDoc(doc(db, 'groups', gid, 'photos', m.photoId)).catch(() => {});
      await deleteDoc(doc(msgCol(cid), m.id));
    },
    clearCard: (cid: string, mid: string) => updateDoc(doc(msgCol(cid), mid), { cardId: deleteField(), dismissed: true }),
    guestCol: (token: string) => collection(db, 'shares', token, 'guestOrders'),
    addOrderFor(cardId: string, personId: PersonId, stop: string, text: string) {
      return updateCard<RunCard>(cardId, (c) => ({
        ...c,
        notMe: c.notMe.filter((p) => p !== personId),
        orders: [...c.orders, { id: uid(), personId, stop, text, ticked: false, at: Date.now() }],
      }));
    },
    react: (cid: string, mid: string, val: 'good' | 'nah' | null) =>
      updateDoc(doc(msgCol(cid), mid), { [`reactions.${meId}`]: val ?? deleteField() }),
    quickReply: (cid: string, mid: string, text: string) => updateDoc(doc(msgCol(cid), mid), { [`replies.${meId}`]: text }),
    learnPhrase: (text: string) => {
      const k = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (k.length < 4) return;
      updateDoc(doc(db, 'users', meId), { [`phrases.${k.replace(/\./g, '')}`]: increment(1) }).catch(() => {});
    },
    learnPlace: (place: string) => {
      const list = userDoc.places ?? [];
      if (!list.includes(place)) updateDoc(doc(db, 'users', meId), { places: [place, ...list].slice(0, 8) }).catch(() => {});
    },
    phrases: userDoc.phrases ?? {},
    places: userDoc.places ?? [],
    events: sess.events,
    async addEvent(e: Omit<CalEvent, 'id' | 'createdBy' | 'createdAt'>): Promise<string> {
      const ref = doc(collection(db, 'groups', gid, 'events'));
      await setDoc(ref, { ...e, createdBy: meId, createdAt: Date.now() });
      return ref.id;
    },
    deleteEvent: (id: string) => deleteDoc(doc(db, 'groups', gid, 'events', id)),
    async createInvite(name: string): Promise<string> {
      const ref = doc(collection(db, 'groups', gid, 'invites'));
      await setDoc(ref, { name: name.trim(), createdBy: meId, createdAt: Date.now(), status: 'pending' });
      return `${location.origin}${location.pathname}#/join/${gid}/${ref.id}`;
    },
    inviteLink: (inviteId: string) => `${location.origin}${location.pathname}#/join/${gid}/${inviteId}`,
    cancelInvite: (inviteId: string) => deleteDoc(doc(db, 'groups', gid, 'invites', inviteId)),
    invitesCol: () => query(collection(db, 'groups', gid, 'invites'), orderBy('createdAt', 'desc')),
    async createChat(memberIds: PersonId[], name?: string) {
      const ref = doc(collection(db, 'groups', gid, 'chats'));
      const ids = [...new Set([meId, ...memberIds])];
      await setDoc(ref, { kind: 'home', name: name || undefined, everyone: false, memberIds: ids, createdAt: Date.now(), createdBy: meId, lastAt: Date.now() } satisfies Omit<Chat, 'id'>);
      return ref.id;
    },
    status: (id: PersonId): StatusLabel | undefined => {
      const st = group.status?.[id];
      if (!st) return undefined;
      // Statuses go stale after 16 hours.
      return Date.now() - st.at < 16 * 3600000 ? st.label : undefined;
    },
    setStatus: (label: StatusLabel) => updateDoc(doc(db, 'groups', gid), { [`status.${meId}`]: { label, at: Date.now() } }),
    async shareRun(cardId: string): Promise<string> {
      const card = sess.cards.find((c) => c.id === cardId) as RunCard | undefined;
      if (!card) throw new Error('no card');
      let token = card.shareToken;
      if (!token) {
        token = doc(collection(db, 'shares')).id + Math.random().toString(36).slice(2, 8);
        const share: Share = {
          gid,
          cardId,
          chatId: card.chatId ?? 'everyone',
          buyerName: person(card.createdBy).name,
          shops: card.stops.filter((s) => s.approved).map((s) => s.shop),
          names: people.map((p) => p.name),
          orders: card.orders.map((o) => ({ name: person(o.personId).name, text: o.text })),
          closesAt: card.due,
          open: !card.locked,
        };
        await setDoc(doc(db, 'shares', token), share);
        await updateDoc(cardRef(cardId), { shareToken: token });
      }
      return `${location.origin}${location.pathname}#/r/${token}`;
    },
    async uploadPhoto(cid: string, file: File) {
      const data = await compressImage(file);
      const ref = doc(collection(db, 'groups', gid, 'photos'));
      await setDoc(ref, { data, by: meId, at: Date.now() });
      await sendMessage(cid, { photoId: ref.id });
    },

    state: { usuals: { [meId]: userDoc.usuals ?? {} } as Record<PersonId, Record<string, string[]>> },
    group,
    members: people,
    me,
    person,
    cards: sess.cards,
    ledger: sess.ledger,
    isOwner: group.ownerId === meId,

    setAdult: (id: PersonId, adult: boolean) => updateDoc(doc(db, 'groups', gid), { [`members.${id}.adult`]: adult }),

    startRun(shop: string, forIds: PersonId[], due: number, chatId?: string, msgId?: string, placeId?: string): string {
      // Anything waiting on the shopping list for this shop goes straight into the run.
      const fromLists = sess.lists.filter((l) => l.items.length && (l.shop === shop || (l.shop === GENERAL_LIST && SUPERMARKETS.includes(shop))));
      const orders: RunOrder[] = fromLists.flatMap((l) => l.items.map((i) => ({ id: uid(), personId: i.by, stop: shop, text: i.text, note: 'from the list', ticked: false, at: i.at })));
      fromLists.forEach((l) => updateDoc(doc(db, 'groups', gid, 'lists', l.id), { items: [] }).catch(() => {}));
      const card: Omit<RunCard, 'id'> = { ...base(forIds, due), kind: 'run', stops: [{ shop, addedBy: meId, approved: true }], orders, locked: false, ...(placeId ? { placeId } : {}) };
      if (chatId) {
        const ref = doc(collection(db, 'groups', gid, 'cards'));
        setDoc(ref, { ...card, chatId }).then(async () => {
          if (msgId) await updateDoc(doc(msgCol(chatId), msgId), { cardId: ref.id });
          else await sendMessage(chatId, { text: `Going to ${shop}`, cardId: ref.id });
        });
        return ref.id;
      }
      return newCard<RunCard>(card);
    },
    lists: sess.lists,
    takeaways: [
      // The family's own places, filling any gaps (phone, menu) from the built-in list.
      ...sess.takeaways.map((t) => {
        const d = DIRECTORY.find((x) => x.name.toLowerCase() === t.name.toLowerCase() || x.aliases?.some((a) => a.toLowerCase() === t.name.toLowerCase()));
        return d ? { ...t, phone: t.phone || d.phone, menuUrl: t.menuUrl || d.menuUrl, aliases: d.aliases } : t;
      }),
      ...DIRECTORY.filter((d) => !sess.takeaways.some((t) => t.name.toLowerCase() === d.name.toLowerCase() || d.aliases?.some((a) => a.toLowerCase() === t.name.toLowerCase()))).map(
        (d): Place => ({ id: `dir:${d.name}`, name: d.name, cuisine: d.cuisine, phone: d.phone, menuUrl: d.menuUrl, aliases: d.aliases, addedBy: '', at: 0 }),
      ),
    ],
    /** Add items to a shop's list, or straight into an open run there. Returns where they went. */
    async addToList(shop: string, items: string[]): Promise<'run' | 'list'> {
      const run = sess.cards.find(
        (c): c is RunCard => c.kind === 'run' && !c.locked && c.status !== 'done' && c.stops.some((x) => x.approved && (x.shop === shop || (shop === GENERAL_LIST && SUPERMARKETS.includes(x.shop)))),
      );
      if (run) {
        const stop = run.stops.find((x) => x.approved && (x.shop === shop || SUPERMARKETS.includes(x.shop)))!.shop;
        updateCard<RunCard>(run.id, (c) => ({ ...c, orders: [...c.orders, ...items.map((text) => ({ id: uid(), personId: meId, stop, text, ticked: false, at: Date.now() }))] }));
        return 'run';
      }
      const ref = doc(db, 'groups', gid, 'lists', shop);
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        const have = cur.exists() ? ((cur.data() as ShopList).items ?? []) : [];
        const fresh = items.filter((t) => !have.some((h) => h.text.toLowerCase() === t.toLowerCase()));
        tx.set(ref, { shop, items: [...have, ...fresh.map((text) => ({ id: uid(), text, by: meId, at: Date.now() }))] });
      });
      return 'list';
    },
    removeListItem(shop: string, itemId: string) {
      const ref = doc(db, 'groups', gid, 'lists', shop);
      return runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists()) return;
        tx.update(ref, { items: ((cur.data() as ShopList).items ?? []).filter((i) => i.id !== itemId) });
      });
    },
    async addTakeaway(p: { name: string; cuisine: string; phone?: string; menuUrl?: string }): Promise<string> {
      const ref = doc(collection(db, 'groups', gid, 'places'));
      await setDoc(ref, { ...p, addedBy: meId, at: Date.now() });
      return ref.id;
    },
    async updateTakeaway(id: string, p: Partial<Pick<Place, 'name' | 'phone' | 'menuUrl'>>) {
      // A built-in place: save the family's own copy with their changes.
      if (id.startsWith('dir:')) {
        const d = DIRECTORY.find((x) => `dir:${x.name}` === id);
        if (!d) return;
        const ref = doc(collection(db, 'groups', gid, 'places'));
        const merged = { name: d.name, cuisine: d.cuisine, ...(d.phone ? { phone: d.phone } : {}), ...(d.menuUrl ? { menuUrl: d.menuUrl } : {}), ...p };
        await setDoc(ref, { ...merged, addedBy: meId, at: Date.now() });
        return;
      }
      await updateDoc(doc(db, 'groups', gid, 'places', id), p);
    },
    /** Turn a stop like "Thai" or "Takeaway" into a real place ("Otter Thai"); orders move with it. */
    setStopPlace(cardId: string, oldShop: string, name: string) {
      updateCard<RunCard>(cardId, (c) => {
        const { placeId: _p, ...rest } = c;
        void _p;
        if (c.stops.some((x) => x.shop === name)) return { ...rest, stops: rest.stops.filter((x) => x.shop !== oldShop), orders: rest.orders.map((o) => (o.stop === oldShop ? { ...o, stop: name } : o)) };
        return {
          ...rest,
          stops: rest.stops.map((x) => (x.shop === oldShop ? { ...x, shop: name } : x)),
          orders: rest.orders.map((o) => (o.stop === oldShop ? { ...o, stop: name } : o)),
        };
      });
    },
    /** Add another place to a run. The buyer adds it straight away; anyone else asks the buyer. */
    addPlaceStop(cardId: string, name: string) {
      updateCard<RunCard>(cardId, (c) =>
        c.stops.some((x) => x.shop === name) || c.stops.length >= 4 ? c : { ...c, stops: [...c.stops, { shop: name, addedBy: meId, approved: c.createdBy === meId }] },
      );
    },
    setRunPlace(cardId: string, placeId: string | null) {
      updateCard<RunCard>(cardId, (c) => {
        const { placeId: _old, ...rest } = c;
        void _old;
        return placeId ? { ...rest, placeId } : rest;
      });
    },
    addOrder(cardId: string, stop: string, text: string, note?: string) {
      updateCard<RunCard>(cardId, (c) => ({
        ...c,
        notMe: c.notMe.filter((p) => p !== meId),
        orders: [...c.orders, { id: uid(), personId: meId, stop, text, note, ticked: false, at: Date.now() }],
      }));
    },
    markCalled(cardId: string) {
      updateCard<RunCard>(cardId, (c) => ({ ...c, calledAt: Date.now() }));
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
      updateCard<RunCard>(cardId, (c) => ({ ...c, locked: true, lockedAt: Date.now(), status: 'claimed', claimedBy: c.createdBy }));
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

    startDinner(forIds: PersonId[], options: string[], chatId?: string, msgId?: string): string {
      const card: Omit<DinnerCard, 'id'> = { ...base(forIds), kind: 'dinner', home: {}, options: options.filter(Boolean).map((label) => ({ label, votes: [] })) };
      if (chatId) {
        const ref = doc(collection(db, 'groups', gid, 'cards'));
        setDoc(ref, { ...card, chatId }).then(async () => {
          if (msgId) await updateDoc(doc(msgCol(chatId), msgId), { cardId: ref.id });
          else await sendMessage(chatId, { text: "Who's home for dinner?", cardId: ref.id });
        });
        return ref.id;
      }
      return newCard<DinnerCard>(card);
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

    startJob(title: string, forIds: PersonId[], due?: number, extra?: { chatId?: string; msgId?: string; lift?: boolean; tokens?: Tokens; claim?: boolean; assignee?: PersonId }): string {
      const card: Omit<JobCard, 'id'> = {
        ...base(extra?.assignee ? [extra.assignee] : forIds, due),
        kind: 'job',
        title,
        lift: extra?.lift,
        tokens: extra?.tokens,
        ...(extra?.claim ? { status: 'claimed' as const, claimedBy: meId } : {}),
      };
      if (extra?.chatId) {
        const ref = doc(collection(db, 'groups', gid, 'cards'));
        const cid = extra.chatId;
        setDoc(ref, { ...card, chatId: cid }).then(async () => {
          if (extra.msgId) await updateDoc(doc(msgCol(cid), extra.msgId), { cardId: ref.id });
          else await sendMessage(cid, { text: title, cardId: ref.id });
        });
        return ref.id;
      }
      return newCard<JobCard>(card);
    },
    updateCardFields: (id: string, patch: Partial<Card>) => updateDoc(cardRef(id), patch as Record<string, unknown>),
    claim(cardId: string) {
      updateCard(cardId, (c) => (c.claimedBy ? c : { ...c, status: 'claimed', claimedBy: meId, claimedAt: Date.now() }));
    },
    unclaim(cardId: string) {
      updateCard(cardId, (c) => ({ ...c, status: 'open', claimedBy: undefined, claimedAt: undefined }));
    },
    notMe(cardId: string) {
      updateCard(cardId, (c) => ({ ...c, notMe: [...new Set([...c.notMe, meId])] }));
    },
    doneCard(cardId: string, logFavour: boolean) {
      const card = sess.cards.find((c) => c.id === cardId);
      if (card && card.kind === 'job' && logFavour && card.createdBy !== meId) {
        addLedger([{ owerId: card.createdBy, owedId: meId, favour: card.title, what: card.title }]);
      }
      updateCard(cardId, (c) => ({ ...c, status: 'done', claimedBy: c.claimedBy ?? meId, doneAt: Date.now() }));
    },
    /** Nobody's picked it up: post it again so it's back at the bottom of the chat and everyone gets notified. */
    async askAgain(cardId: string) {
      const card = sess.cards.find((c) => c.id === cardId);
      if (!card || card.kind !== 'job' || !card.chatId) return;
      await sendMessage(card.chatId, { text: `Still need someone: ${card.title}`, cardId });
      updateCard<JobCard>(cardId, (c) => ({ ...c, askedAt: Date.now() }));
    },
    /** The buyer has placed the order. Tells only the people who ordered. */
    async markOrdered(cardId: string) {
      const card = sess.cards.find((c) => c.id === cardId) as RunCard | undefined;
      if (!card) return;
      updateCard<RunCard>(cardId, (c) => ({ ...c, locked: true, lockedAt: c.lockedAt ?? Date.now(), orderedAt: Date.now(), status: 'claimed', claimedBy: c.createdBy }));
      const placeNames = card.stops.filter((x) => x.approved).map((x) => x.shop).join(' and ');
      const orderers = [...new Set(card.orders.map((o) => o.personId))].filter((id) => id !== meId && !id.startsWith('guest:'));
      if (card.chatId) await sendMessage(card.chatId, { text: `Ordered from ${placeNames} ✓`, notifyOnly: orderers });
    },
    tickMany(cardId: string, orderIds: string[], ticked: boolean) {
      updateCard<RunCard>(cardId, (c) => ({ ...c, orders: c.orders.map((o) => (orderIds.includes(o.id) ? { ...o, ticked, missing: undefined } : o)) }));
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

/** Shrink a photo to about 900px so it fits in a database document (no separate file storage needed). */
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.75;
    let out = c.toDataURL('image/jpeg', q);
    while (out.length > 700_000 && q > 0.3) {
      q -= 0.15;
      out = c.toDataURL('image/jpeg', q);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
