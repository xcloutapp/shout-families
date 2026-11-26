import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clock, logOut, money, moneyBalances, switchGroup, useSession, useStore } from '../store';
import { Profile } from './Setup';
import { Avatar, Sheet, TabBar, useToast } from '../ui';

export function Balances() {
  const s = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [settle, setSettle] = useState(false);
  const bal = moneyBalances(s.ledger, s.me.id);
  const owed = Object.values(bal).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const owe = -Object.values(bal).filter((v) => v < 0).reduce((a, b) => a + b, 0);
  const favours = s.ledger.filter((e) => !e.settled && e.favour && (e.owerId === s.me.id || e.owedId === s.me.id));
  const others = s.members.filter((p) => p.id !== s.me.id);
  const recent = [...s.ledger].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const toSettle = others.filter((p) => Math.abs(bal[p.id] ?? 0) > 0.004);

  return (
    <>
      <div className="screen with-tabs">
        <h1 style={{ fontSize: 26 }}>Balances</h1>
        <div className="card" style={{ gap: 4 }}>
          <span className="muted">Across {s.group.name}</span>
          {owed >= owe ? (
            <span className="display" style={{ fontSize: 40, color: 'var(--green)' }}>{money(owed - owe)} <span style={{ fontSize: 16, color: 'var(--text-2)' }}>owed to you</span></span>
          ) : (
            <span className="display" style={{ fontSize: 40, color: 'var(--yellow)' }}>{money(owe - owed)} <span style={{ fontSize: 16, color: 'var(--text-2)' }}>you owe</span></span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{favours.length} favour{favours.length === 1 ? '' : 's'} on the books</span>
        </div>

        <div className="card" style={{ paddingTop: 4, paddingBottom: 4, gap: 0 }}>
          {others.map((p, i) => {
            const v = bal[p.id] ?? 0;
            const fav = favours.filter((f) => f.owerId === p.id || f.owedId === p.id);
            return (
              <div key={p.id} className="row" style={{ padding: '12px 0', borderTop: i ? '1px solid var(--chip)' : 'none' }}>
                <Avatar person={p} size={38} />
                <span className="col grow" style={{ gap: 2 }}>
                  <b>{p.name}</b>
                  <span className="muted">
                    {fav.length ? fav.map((f) => (f.owerId === s.me.id ? `You owe: ${f.what}` : `Owes you: ${f.what}`)).join(' · ') : !p.adult ? 'Under 18 · balance only' : ''}
                  </span>
                </span>
                <b style={{ color: v > 0 ? 'var(--green)' : v < 0 ? 'var(--yellow)' : 'var(--muted)' }}>
                  {v > 0 ? `owes ${money(v)}` : v < 0 ? `you owe ${money(v)}` : '$0'}
                </b>
              </div>
            );
          })}
        </div>

        {favours.filter((f) => f.owerId === s.me.id).map((f) => (
          <button key={f.id} className="card flat" style={{ border: 'none', textAlign: 'left' }} onClick={() => { s.returnFavour(f.id); toast.show('Favour returned'); }}>
            <span>You owe {s.person(f.owedId).name}: <b>{f.what}</b></span>
            <span className="muted">Tap when you've paid it back</span>
          </button>
        ))}

        <div className="label">Recent shouts</div>
        {recent.length === 0 && <span className="muted">Nothing yet. Finish a run or a job, or log a shout.</span>}
        {recent.map((e) => (
          <div key={e.id} className="between" style={{ opacity: e.settled ? 0.5 : 1 }}>
            <span className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 14 }}>{e.what}</b>
              <span className="muted">{s.person(e.owedId).name} shouted {s.person(e.owerId).name}{e.settled ? ' · settled' : ''}</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{e.amount ? money(e.amount) : 'favour'}</span>
          </div>
        ))}

        <div className="row">
          <button className="btn ghost grow" onClick={() => nav('/new/shout')}>Log a shout</button>
          <button className="btn light grow" disabled={toSettle.length === 0} onClick={() => setSettle(true)}>Settle up</button>
        </div>
      </div>
      {settle && (
        <Sheet onClose={() => setSettle(false)}>
          <h2 style={{ fontSize: 22 }}>Settle up</h2>
          <span className="muted">Pay with cash or PayID, then mark it here.</span>
          {toSettle.map((p) => {
            const v = bal[p.id];
            return (
              <div key={p.id} className="between">
                <span>{v > 0 ? `${p.name} pays you` : `You pay ${p.name}`} <b>{money(v)}</b></span>
                <button className="btn ghost" onClick={() => { s.settleWith(p.id); toast.show('Marked as paid'); }}>Paid</button>
              </div>
            );
          })}
          <button className="btn quiet" onClick={() => setSettle(false)}>Close</button>
        </Sheet>
      )}
      {toast.node}
      <TabBar />
    </>
  );
}

export function Calendar() {
  const s = useStore();
  const nav = useNavigate();
  const [justMe, setJustMe] = useState(false);
  const items = s.cards
    .filter((c) => c.due && c.status !== 'done')
    .filter((c) => !justMe || c.forIds.includes(s.me.id) || c.createdBy === s.me.id)
    .sort((a, b) => a.due! - b.due!);
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const has = (d: Date) => items.some((c) => new Date(c.due!).toDateString() === d.toDateString());
  const label = (kind: string) => ({ run: ['Run', 'var(--accent)'], dinner: ['Dinner', 'var(--green)'], job: ['Job', 'var(--purple)'] } as Record<string, string[]>)[kind];

  return (
    <>
      <div className="screen with-tabs">
        <div className="between">
          <h1 style={{ fontSize: 26 }}>{today.toLocaleDateString('en-AU', { month: 'long' })}</h1>
          <button className="pill" disabled title="Coming soon">Add to my calendar</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {days.map((d) => {
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={d.toISOString()} className="col" style={{ alignItems: 'center', gap: 4, minHeight: 64, justifyContent: 'center', borderRadius: 16, background: isToday ? 'var(--accent)' : 'var(--surface-2)', color: isToday ? 'var(--accent-ink)' : 'var(--text)' }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{d.toLocaleDateString('en-AU', { weekday: 'narrow' })}</span>
                <b style={{ fontSize: 18 }}>{d.getDate()}</b>
                <span style={{ width: 5, height: 5, borderRadius: 3, background: has(d) ? (isToday ? 'var(--accent-ink)' : 'var(--accent)') : 'transparent' }} />
              </div>
            );
          })}
        </div>
        <div className="row">
          <button className={`pill ${!justMe ? 'on' : ''}`} onClick={() => setJustMe(false)}>Everyone</button>
          <button className={`pill ${justMe ? 'on' : ''}`} onClick={() => setJustMe(true)}>Just me</button>
        </div>
        <div className="label">Coming up</div>
        {items.length === 0 && <span className="muted">Nothing with a time yet. Runs and jobs with a deadline show up here.</span>}
        {items.map((c) => {
          const [l, color] = label(c.kind);
          const title = c.kind === 'run' ? `${c.stops.filter((x) => x.approved).map((x) => x.shop).join(' + ')} run · orders close` : c.kind === 'job' ? c.title : 'Dinner';
          return (
            <button key={c.id} className="row" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', alignItems: 'stretch' }} onClick={() => nav(`/card/${c.id}`)}>
              <span style={{ width: 56, fontSize: 13, fontWeight: 600, color: 'var(--text-2)', paddingTop: 12 }}>{clock(c.due!)}</span>
              <span className="card grow" style={{ gap: 3, padding: '10px 14px' }}>
                <span className="tag" style={{ color, fontSize: 11 }}>{l}</span>
                <b>{title}</b>
                <span className="muted">{c.createdBy === s.me.id ? 'You' : s.person(c.createdBy).name}</span>
              </span>
            </button>
          );
        })}
      </div>
      <TabBar />
    </>
  );
}

export function Me() {
  const s = useStore();
  const { userDoc } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const link = `${location.origin}${location.pathname}#/join/${s.group.id}`;
  if (editing) return <Profile editing onDone={() => setEditing(false)} />;

  const share = async () => {
    const text = `Join ${s.group.name} on Shout`;
    try {
      if (navigator.share) await navigator.share({ title: 'Shout', text, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast.show('Invite link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <>
      <div className="screen with-tabs">
        <div className="between">
          <h1 style={{ fontSize: 26 }}>Me</h1>
          <button className="btn quiet" onClick={() => setEditing(true)}>Edit profile</button>
        </div>
        <div className="row">
          <Avatar person={s.me} size={64} ring="var(--accent)" />
          <div className="col" style={{ gap: 2 }}>
            <b style={{ fontSize: 18 }}>{s.me.name}</b>
            <span className="muted">{s.me.adult ? 'Adult' : 'Under 18'}</span>
          </div>
        </div>

        <div className="card">
          <div className="between">
            <div className="col" style={{ gap: 2 }}>
              <b>{s.group.name}</b>
              <span className="muted">{s.members.length} member{s.members.length === 1 ? '' : 's'} · owner {s.person(s.group.ownerId).name}</span>
            </div>
          </div>
          <button className="btn primary" onClick={share}>Invite people</button>
          {s.members.map((p) => (
            <div key={p.id} className="between" style={{ borderTop: '1px solid var(--chip)', paddingTop: 10 }}>
              <div className="row">
                <Avatar person={p} size={36} />
                <span>{p.name}{p.id === s.me.id ? ' (you)' : ''}</span>
              </div>
              {s.isOwner && p.id !== s.me.id ? (
                <button className={`pill ${p.adult ? '' : 'on'}`} onClick={() => s.setAdult(p.id, !p.adult)}>{p.adult ? 'Adult' : 'Under 18'}</button>
              ) : (
                <span className="muted">{p.adult ? 'Adult' : 'Under 18'}</span>
              )}
            </div>
          ))}
          {s.isOwner && <span className="muted">As the owner, you can change who counts as under 18.</span>}
        </div>

        {(userDoc?.groupIds.length ?? 0) > 1 && (
          <div className="card">
            <div className="label">Your groups</div>
            {userDoc!.groupIds.map((g) => (
              <button key={g} className={`pill ${g === s.group.id ? 'on' : ''}`} onClick={() => switchGroup(g)}>{g === s.group.id ? s.group.name : 'Switch to another group'}</button>
            ))}
          </div>
        )}

        <button className="btn ghost" onClick={logOut}>Sign out</button>
      </div>
      {toast.node}
      <TabBar />
    </>
  );
}
