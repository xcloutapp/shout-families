import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { seedState } from './seed';
import type { AppState, Card, DinnerCard, JobCard, LedgerEntry, Person, PersonId, RunCard } from './types';

const KEY = 'shout-family-v1';

const uid = () => Math.random().toString(36).slice(2, 10);

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* storage unavailable: start fresh */
  }
  return seedState();
}

function useAppState() {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const group = state.groups.find((g) => g.id === state.activeGroupId)!;
  const members = group.memberIds.map((id) => state.people.find((p) => p.id === id)!);
  const me = state.people.find((p) => p.id === state.meId)!;

  const updateCard = <T extends Card>(id: string, fn: (c: T) => T) =>
    setState((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? fn(c as T) : c)) }));

  const addLedger = (entries: Omit<LedgerEntry, 'id' | 'groupId' | 'createdAt' | 'settled'>[]) =>
    setState((s) => ({
      ...s,
      ledger: [
        ...s.ledger,
        ...entries.map((e) => ({ ...e, id: uid(), groupId: s.activeGroupId, createdAt: Date.now(), settled: false })),
      ],
    }));

  const base = (forIds: PersonId[], due?: number) => ({
    id: uid(),
    groupId: state.activeGroupId,
    createdBy: state.meId,
    createdAt: Date.now(),
    forIds,
    due,
    status: 'open' as const,
    notMe: [] as PersonId[],
  });

  const actions = {
    switchPerson: (id: PersonId) => setState((s) => ({ ...s, meId: id })),
    reset: () => setState(seedState()),

    startRun(shop: string, forIds: PersonId[], due: number): string {
      const card: RunCard = {
        ...base(forIds, due),
        kind: 'run',
        stops: [{ shop, addedBy: state.meId, approved: true }],
        orders: [],
        locked: false,
      };
      setState((s) => ({ ...s, cards: [card, ...s.cards] }));
      return card.id;
    },
    addOrder(cardId: string, stop: string, text: string, note?: string) {
      updateCard<RunCard>(cardId, (c) => ({
        ...c,
        notMe: c.notMe.filter((p) => p !== state.meId),
        orders: [...c.orders, { id: uid(), personId: state.meId, stop, text, note, ticked: false }],
      }));
    },
    removeOrder(cardId: string, orderId: string) {
      updateCard<RunCard>(cardId, (c) => ({ ...c, orders: c.orders.filter((o) => o.id !== orderId) }));
    },
    askStop(cardId: string, shop: string) {
      updateCard<RunCard>(cardId, (c) =>
        c.stops.some((s) => s.shop === shop) || c.stops.length >= 3
          ? c
          : { ...c, stops: [...c.stops, { shop, addedBy: state.meId, approved: false }] },
      );
    },
    answerStop(cardId: string, shop: string, yes: boolean) {
      updateCard<RunCard>(cardId, (c) => ({
        ...c,
        stops: yes
          ? c.stops.map((s) => (s.shop === shop ? { ...s, approved: true } : s))
          : c.stops.filter((s) => s.shop !== shop),
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
      const card = state.cards.find((c) => c.id === cardId) as RunCard;
      const shops = card.stops.filter((s) => s.approved).map((s) => s.shop).join(' + ');
      addLedger(
        Object.entries(amounts)
          .filter(([pid, amt]) => pid !== card.createdBy && amt > 0)
          .map(([pid, amt]) => ({ owerId: pid, owedId: card.createdBy, amount: amt, what: `${shops} run` })),
      );
      updateCard(cardId, (c) => ({ ...c, status: 'done' }));
    },

    startDinner(forIds: PersonId[], options: string[]): string {
      const card: DinnerCard = {
        ...base(forIds),
        kind: 'dinner',
        home: {},
        options: options.filter(Boolean).map((label) => ({ label, votes: [] })),
      };
      setState((s) => ({ ...s, cards: [card, ...s.cards] }));
      return card.id;
    },
    answerHome(cardId: string, ans: 'yes' | 'no') {
      updateCard<DinnerCard>(cardId, (c) => ({ ...c, home: { ...c.home, [state.meId]: ans } }));
    },
    vote(cardId: string, label: string) {
      updateCard<DinnerCard>(cardId, (c) => ({
        ...c,
        options: c.options.map((o) => ({
          ...o,
          votes: o.label === label ? [...o.votes.filter((v) => v !== state.meId), state.meId] : o.votes.filter((v) => v !== state.meId),
        })),
      }));
    },
    addOption(cardId: string, label: string) {
      updateCard<DinnerCard>(cardId, (c) =>
        c.options.some((o) => o.label.toLowerCase() === label.toLowerCase())
          ? c
          : { ...c, options: [...c.options, { label, votes: [state.meId] }] },
      );
    },

    startJob(title: string, forIds: PersonId[], due?: number): string {
      const card: JobCard = { ...base(forIds, due), kind: 'job', title };
      setState((s) => ({ ...s, cards: [card, ...s.cards] }));
      return card.id;
    },
    claim(cardId: string) {
      updateCard(cardId, (c) => ({ ...c, status: 'claimed', claimedBy: state.meId }));
    },
    unclaim(cardId: string) {
      updateCard(cardId, (c) => ({ ...c, status: 'open', claimedBy: undefined }));
    },
    notMe(cardId: string) {
      updateCard(cardId, (c) => ({ ...c, notMe: [...new Set([...c.notMe, state.meId])] }));
    },
    doneCard(cardId: string, logFavour: boolean) {
      const card = state.cards.find((c) => c.id === cardId);
      if (card && card.kind === 'job' && logFavour && card.createdBy !== state.meId) {
        addLedger([{ owerId: card.createdBy, owedId: state.meId, favour: card.title, what: card.title }]);
      }
      updateCard(cardId, (c) => ({ ...c, status: 'done', claimedBy: c.claimedBy ?? state.meId }));
    },
    deleteCard(cardId: string) {
      setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== cardId) }));
    },

    logShout(owerId: PersonId, owedId: PersonId, what: string, amount?: number) {
      addLedger([{ owerId, owedId, what, amount, favour: amount ? undefined : what }]);
    },
    settleWith(otherId: PersonId) {
      setState((s) => ({
        ...s,
        ledger: s.ledger.map((e) =>
          e.amount &&
          ((e.owerId === s.meId && e.owedId === otherId) || (e.owerId === otherId && e.owedId === s.meId))
            ? { ...e, settled: true }
            : e,
        ),
      }));
    },
    returnFavour(entryId: string) {
      setState((s) => ({ ...s, ledger: s.ledger.map((e) => (e.id === entryId ? { ...e, settled: true } : e)) }));
    },
    saveUsual(shop: string, text: string) {
      setState((s) => {
        const mine = s.usuals[s.meId] ?? {};
        const list = mine[shop] ?? [];
        if (list.includes(text)) return s;
        return { ...s, usuals: { ...s.usuals, [s.meId]: { ...mine, [shop]: [text, ...list].slice(0, 6) } } };
      });
    },
  };

  const person = (id: PersonId): Person => state.people.find((p) => p.id === id)!;
  const groupCards = state.cards.filter((c) => c.groupId === state.activeGroupId);
  const groupLedger = state.ledger.filter((e) => e.groupId === state.activeGroupId);

  return { state, group, members, me, person, cards: groupCards, ledger: groupLedger, ...actions };
}

type Store = ReturnType<typeof useAppState>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useAppState();
  const value = useMemo(() => store, [store]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
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

export const clock = (t: number) =>
  new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
