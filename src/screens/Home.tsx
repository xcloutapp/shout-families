import { useNavigate } from 'react-router-dom';
import { money, moneyBalances, timeLeft, useStore } from '../store';
import type { Card, PersonId } from '../types';
import { Avatar, Icon, TabBar, useToast } from '../ui';

const KIND: Record<Card['kind'], { label: string; color: string }> = {
  run: { label: 'Run', color: 'var(--accent)' },
  dinner: { label: 'Dinner', color: 'var(--green)' },
  job: { label: 'Job', color: 'var(--purple)' },
};

/** Does this card need something from this person right now? */
export function needsMe(c: Card, me: PersonId): boolean {
  if (c.status === 'done' || !c.forIds.includes(me) || c.notMe.includes(me)) return false;
  if (c.kind === 'run') return !c.locked && !c.orders.some((o) => o.personId === me);
  if (c.kind === 'dinner') return !c.home[me];
  return c.status === 'open';
}

export default function Home() {
  const s = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const open = s.cards.filter((c) => c.status !== 'done');
  open.sort((a, b) => Number(needsMe(b, s.me.id)) - Number(needsMe(a, s.me.id)) || b.createdAt - a.createdAt);

  const bal = moneyBalances(s.ledger, s.me.id);
  const owed = Object.values(bal).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const owe = Object.values(bal).filter((v) => v < 0).reduce((a, b) => a + b, 0);
  const favours = s.ledger.filter((e) => !e.settled && e.favour && e.owerId === s.me.id).length;

  return (
    <>
      <div className="screen with-tabs">
        <div className="between">
          <h1 style={{ fontSize: 26 }}>{s.group.name}</h1>
          <span className="muted">You're {s.me.name}</span>
        </div>

        <div className="row" style={{ gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {s.members.map((p) => {
            const pending = open.some((c) => needsMe(c, p.id));
            return (
              <div key={p.id} className="col" style={{ alignItems: 'center', gap: 6, width: 58 }}>
                <Avatar person={p} size={58} ring={pending ? 'var(--accent)' : undefined} />
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.id === s.me.id ? 'You' : p.name}</span>
              </div>
            );
          })}
        </div>

        <div className="label">Open now</div>
        {open.length === 0 && (
          <div className="card flat" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
            <b>All caught up</b>
            <span className="muted">Tap + to start a run, a job or ask about dinner.</span>
          </div>
        )}

        {open.map((c) => (
          <CardTile key={c.id} card={c} onOpen={() => nav(`/card/${c.id}`)} onNotMe={() => { s.notMe(c.id); toast.show('Got it'); }} />
        ))}

        <button className="card flat" style={{ border: 'none', textAlign: 'left' }} onClick={() => nav('/balances')}>
          <div className="between">
            <span style={{ color: 'var(--text-2)', fontSize: 14 }}>
              {owed === 0 && owe === 0 && favours === 0 ? (
                'All square with everyone'
              ) : (
                <>
                  {owed > 0 && <>You're owed <b style={{ color: 'var(--text)' }}>{money(owed)}</b> </>}
                  {owe < 0 && <>· you owe <b style={{ color: 'var(--text)' }}>{money(owe)}</b> </>}
                  {favours > 0 && <>· {favours} favour{favours > 1 ? 's' : ''} to return</>}
                </>
              )}
            </span>
            <Icon name="chevron" size={16} stroke={2.5} />
          </div>
        </button>
      </div>
      {toast.node}
      <TabBar />
    </>
  );
}

function CardTile({ card: c, onOpen, onNotMe }: { card: Card; onOpen: () => void; onNotMe: () => void }) {
  const s = useStore();
  const k = KIND[c.kind];
  const mine = needsMe(c, s.me.id);
  const by = s.person(c.createdBy);
  let title = '';
  let sub = '';
  let cta = 'Open';

  if (c.kind === 'run') {
    const shops = c.stops.filter((x) => x.approved).map((x) => x.shop).join(' + ');
    const answered = new Set([...c.orders.map((o) => o.personId), ...c.notMe]);
    const waiting = c.forIds.filter((id) => !answered.has(id)).map((id) => s.person(id).name);
    title = c.createdBy === s.me.id ? `You're going to ${shops}` : `${by.name} is going to ${shops}`;
    sub = c.locked ? 'Locked in · on the way' : `${c.orders.length} order${c.orders.length === 1 ? '' : 's'}${waiting.length ? ` · waiting on ${waiting.join(', ')}` : ''}`;
    cta = c.createdBy === s.me.id ? 'See the list' : 'Add my order';
  } else if (c.kind === 'dinner') {
    const yes = Object.values(c.home).filter((v) => v === 'yes').length;
    const no = Object.values(c.home).filter((v) => v === 'no').length;
    title = "Who's home tonight?";
    sub = `${yes} home · ${no} out · ${c.forIds.length - yes - no} waiting`;
    cta = 'Answer';
  } else {
    title = c.title;
    sub = c.claimedBy ? `${c.claimedBy === s.me.id ? 'You' : s.person(c.claimedBy).name} ${c.claimedBy === s.me.id ? 'are' : 'is'} on it` : `Asked by ${by.id === s.me.id ? 'you' : by.name} · anyone`;
    cta = c.claimedBy ? 'Open' : "I've got it";
  }

  return (
    <div className={`card ${mine ? 'hot' : ''}`}>
      <div className="between">
        <span className="tag" style={{ color: k.color }}>{k.label}</span>
        {c.due && <span className="muted">{c.kind === 'run' && !('locked' in c && c.locked) ? `closes in ${timeLeft(c.due)}` : ''}</span>}
      </div>
      <button onClick={onOpen} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }}>
        <div className="display" style={{ fontSize: 20 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>{sub}</div>
      </button>
      <div className="row">
        <button className={`btn grow ${mine ? 'primary' : 'ghost'}`} onClick={onOpen}>{cta}</button>
        {mine && c.createdBy !== s.me.id && (
          <button className="btn ghost" onClick={onNotMe}>Not me</button>
        )}
      </div>
    </div>
  );
}
