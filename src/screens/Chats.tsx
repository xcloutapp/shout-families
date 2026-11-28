import { NotifyBanner } from './Notify';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clock, useStore } from '../store';
import type { Person, StatusLabel } from '../types';
import { Avatar, Icon, Sheet, useToast } from '../ui';

export const STATUS: Record<StatusLabel, { label: string; color: string }> = {
  home: { label: 'Home', color: 'var(--green)' },
  work: { label: 'Work', color: 'var(--yellow)' },
  out: { label: 'Out', color: 'var(--blue)' },
  away: { label: 'Away', color: 'var(--purple)' },
};

const LIFE360 = /android/i.test(navigator.userAgent)
  ? 'https://play.google.com/store/apps/details?id=com.life360.android.safetymapd'
  : 'https://apps.apple.com/app/id384830320';

function when(t: number) {
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return clock(t);
  const days = Math.floor((today.getTime() - t) / 86400000);
  return days < 7 ? d.toLocaleDateString('en-AU', { weekday: 'short' }) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** The family circles with each person's status. Tap one to open the people sheet. */
export function PeopleRow({ size = 52, onOpen }: { size?: number; onOpen: () => void }) {
  const s = useStore();
  return (
    <div className="row" style={{ gap: 12, overflowX: 'auto', paddingBottom: 2 }}>
      {s.members.map((p) => {
        const st = s.status(p.id);
        return (
          <button key={p.id} onClick={onOpen} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: size + 6, flexShrink: 0 }}>
            <Avatar person={p} size={size} ring={st ? STATUS[st].color : undefined} />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{p.id === s.me.id ? 'You' : p.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: st ? STATUS[st].color : 'transparent', textTransform: 'uppercase' }}>{st ? STATUS[st].label : '·'}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PeopleSheet({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const mine = s.status(s.me.id);
  return (
    <Sheet onClose={onClose}>
      <h2 style={{ fontSize: 22 }}>Where's everyone?</h2>
      <div className="col" style={{ gap: 8 }}>
        <b style={{ fontSize: 14 }}>You're…</b>
        <div className="row">
          {(Object.keys(STATUS) as StatusLabel[]).map((k) => (
            <button key={k} className={`pill grow ${mine === k ? 'on' : ''}`} onClick={() => s.setStatus(k)}>{STATUS[k].label}</button>
          ))}
        </div>
        <span className="muted">Statuses clear themselves overnight. Only what you tap is shared, never your location.</span>
      </div>
      {s.members.filter((p) => p.id !== s.me.id).map((p) => {
        const st = s.status(p.id);
        return (
          <div key={p.id} className="between">
            <div className="row">
              <Avatar person={p} size={40} ring={st ? STATUS[st].color : undefined} />
              <div className="col" style={{ gap: 0 }}>
                <b>{p.name}</b>
                <span className="muted">{st ? STATUS[st].label : 'No status yet'}</span>
              </div>
            </div>
          </div>
        );
      })}
      <a className="btn ghost" href={LIFE360} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Open Life360</a>
      <button className="btn quiet" onClick={onClose}>Close</button>
    </Sheet>
  );
}

const STATUS_DOT: Record<StatusLabel, string> = { home: '#34c759', work: '#ffcc00', out: '#0A84FF', away: '#bf5af2' };

/** Chats are named by who's in them; a topic ("Japan trip", "Fun") is a small tag. */
export function chatTitle(s: ReturnType<typeof useStore>, c: { everyone: boolean; memberIds: string[]; kind: string }) {
  if (c.everyone) return s.group.name;
  const others = c.memberIds.filter((id) => id !== s.me.id).map((id) => s.person(id).name);
  if (!others.length) return 'Just you';
  return others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} & ${others[others.length - 1]}`;
}
export const chatTopic = (c: { kind: string; name?: string; everyone: boolean }) => (c.kind === 'fun' ? 'Fun' : c.everyone ? '' : c.name || '');

export function ChatList() {
  const s = useStore();
  const nav = useNavigate();
  const [people, setPeople] = useState(false);
  const [q, setQ] = useState('');
  const others = s.members.filter((p) => p.id !== s.me.id);

  /** Something in this chat is waiting on me (shown in orange). */
  const needsMe = (cid: string): string | null => {
    for (const c of s.cards) {
      if (c.chatId !== cid || c.status === 'done') continue;
      if (c.kind === 'run' && !c.locked && c.createdBy !== s.me.id && !c.orders.some((o) => o.personId === s.me.id) && !c.notMe.includes(s.me.id)) return `${c.stops[0]?.shop} run open · add yours`;
      if (c.kind === 'dinner' && !c.home[s.me.id] && Date.now() - c.createdAt < 12 * 3600000) return 'Dinner · are you home?';
      if (c.kind === 'job' && !c.claimedBy && c.createdBy !== s.me.id && (c.forIds.length !== 1 || c.forIds[0] === s.me.id)) return `${c.lift ? 'Lift' : 'Job'} needs someone: ${c.title}`;
    }
    return null;
  };

  const openWith = async (pid: string) => {
    const pair = [s.me.id, pid].sort().join();
    const same = s.chats.find((c) => c.kind === 'home' && !c.name && [...c.memberIds].sort().join() === pair);
    if (same) return nav(`/chat/${same.id}`);
    const id = await s.createChat([pid]);
    nav(`/chat/${id}`);
  };

  const shown = s.chats.filter((c) => {
    if (!q.trim()) return true;
    const hay = `${chatTitle(s, c)} ${chatTopic(c)} ${c.lastText ?? ''}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <>
      <div className="screen with-tabs" style={{ gap: 10, paddingBottom: 'calc(var(--tabbar-h) + var(--obar-h, 0px) + 70px)' }}>
        <div className="between" style={{ alignItems: 'center' }}>
          <span style={{ width: 40 }} />
          <b style={{ fontSize: 17 }}>Chats</b>
          <button className="icon-btn" aria-label="Where's everyone" style={{ width: 40, height: 40 }} onClick={() => setPeople(true)}><Icon name="people" size={19} /></button>
        </div>
        <NotifyBanner />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', rowGap: 14, padding: '6px 0 8px' }}>
          {others.map((p) => {
            const st = s.status(p.id);
            return (
              <button key={p.id} onClick={() => openWith(p.id)} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ position: 'relative' }}>
                  <Avatar person={p} size={64} />
                  {st && <span style={{ position: 'absolute', right: 1, bottom: 1, width: 15, height: 15, borderRadius: 8, background: STATUS_DOT[st], border: '2.5px solid var(--bg)' }} />}
                </span>
                <span style={{ fontSize: 12, color: '#c7c7cc' }}>{p.name}</span>
              </button>
            );
          })}
        </div>
        <div style={{ margin: '0 -20px' }}>
          {shown.map((c) => {
            const members = c.memberIds.filter((id) => id !== s.me.id).map(s.person);
            const topic = chatTopic(c);
            const alert = needsMe(c.id);
            return (
              <button key={c.id} onClick={() => nav(`/chat/${c.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px 0 20px', background: 'none', border: 'none', textAlign: 'left', color: 'var(--text)' }}>
                <span style={{ paddingTop: 2 }}><ChatAvatar people={members} /></span>
                <span className="col grow" style={{ gap: 2, minWidth: 0, paddingBottom: 10, borderBottom: '0.5px solid #2a2a2e' }}>
                  <span className="between" style={{ gap: 8 }}>
                    <b style={{ fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chatTitle(s, c)}</b>
                    <span style={{ fontSize: 14, color: '#8e8e96', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {alert && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--accent)' }} />}
                      {when(c.lastAt)} <span style={{ fontSize: 16 }}>›</span>
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {topic && <span style={{ flexShrink: 0, fontSize: 11, color: '#c7c7cc', background: '#1f1f23', borderRadius: 6, padding: '2px 6px' }}>{topic}</span>}
                    <span style={{ fontSize: 15, color: '#8e8e96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastText ?? (c.kind === 'fun' ? 'Reels, TikToks and photos' : 'No messages yet')}</span>
                  </span>
                  {alert && <span style={{ fontSize: 13, color: '#ff9a66', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alert}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--tabbar-h) + var(--obar-h, 0px))', padding: '8px 16px', background: 'linear-gradient(transparent, var(--bg) 40%)' }}>
        <div className="row" style={{ maxWidth: 448, margin: '0 auto', gap: 10 }}>
          <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#1c1c1f', borderRadius: 999, padding: '0 14px', height: 42 }}>
            <Icon name="search" size={17} />
            <input aria-label="Search chats" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, border: 'none', background: 'none', fontSize: 16, outline: 'none', color: 'var(--text)' }} />
          </label>
          <button className="icon-btn" aria-label="New chat" style={{ width: 42, height: 42, background: '#1c1c1f' }} onClick={() => nav('/new-chat')}><Icon name="pencil" size={19} /></button>
        </div>
      </div>
      {people && <PeopleSheet onClose={() => setPeople(false)} />}
    </>
  );
}

function ChatAvatar({ people }: { people: Person[] }) {
  const [a, b, c] = people;
  if (!a) return <span style={{ width: 52, height: 52, flexShrink: 0 }} />;
  if (!b) return <Avatar person={a} size={52} />;
  const mono = (p: Person, size: number, style: React.CSSProperties) => (
    <span style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, background: 'linear-gradient(180deg, #6d6782, #463f5b)', color: '#fff', fontSize: size * 0.44, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>{p.name[0]?.toUpperCase()}</span>
  );
  return (
    <span style={{ width: 52, height: 52, borderRadius: 26, background: '#26252a', position: 'relative', flexShrink: 0, display: 'block' }}>
      {c ? (
        <>
          {mono(a, 24, { left: 6, top: 7 })}
          {mono(b, 18, { right: 6, top: 12 })}
          {mono(c, 16, { left: 15, bottom: 5 })}
        </>
      ) : (
        <>
          {mono(a, 26, { left: 5, top: 7 })}
          {mono(b, 20, { right: 5, bottom: 8 })}
        </>
      )}
    </span>
  );
}

export function NewChat() {
  const s = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const others = s.members.filter((p) => p.id !== s.me.id);
  const away = (id: string) => ['work', 'out', 'away'].includes(s.status(id) ?? '');
  const homeIds = others.filter((p) => !away(p.id)).map((p) => p.id);
  const [sel, setSel] = useState<string[]>(homeIds.length ? homeIds : others.map((p) => p.id));
  const [name, setName] = useState('');
  const left = others.filter((p) => away(p.id) && !sel.includes(p.id));
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const saved = s.chats.filter((c) => !c.everyone && c.name);

  const start = async () => {
    const all = [...new Set([s.me.id, ...sel])].sort();
    const everyone = [...s.group.memberIds].sort();
    if (all.join() === everyone.join()) return nav('/chat/everyone', { replace: true });
    const same = s.chats.find((c) => c.kind === 'home' && [...c.memberIds].sort().join() === all.join());
    if (same && !name.trim()) return nav(`/chat/${same.id}`, { replace: true });
    const id = await s.createChat(sel, name.trim());
    toast.show('Chat started');
    nav(`/chat/${id}`, { replace: true });
  };

  return (
    <div className="screen">
      <div className="between">
        <button className="btn quiet" style={{ padding: 0 }} onClick={() => nav(-1)}>Cancel</button>
        <b>New chat</b>
        <span style={{ width: 52 }} />
      </div>

      {left.length > 0 && (
        <div className="card" style={{ background: '#1f1a14', border: '1px solid #4a3420' }}>
          <span style={{ fontSize: 14 }}><b>{left.map((p) => p.name).join(' and ')}</b> {left.length > 1 ? 'are' : 'is'} out, so we've left them out. Tap to add them back.</span>
        </div>
      )}

      <div className="label">Tap to add or remove</div>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        {others.map((p) => {
          const on = sel.includes(p.id);
          const st = s.status(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} aria-pressed={on} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 62 }}>
              <Avatar person={p} size={58} ring={on ? 'var(--accent)' : 'dashed'} dim={!on} />
              <span style={{ fontSize: 12, color: on ? 'var(--text)' : '#8a8a95' }}>{p.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: st ? STATUS[st].color : 'transparent', textTransform: 'uppercase' }}>{st ? STATUS[st].label : '·'}</span>
            </button>
          );
        })}
      </div>

      <div className="label">Quick picks</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className={`pill ${sel.length === others.length ? 'on' : ''}`} onClick={() => setSel(others.map((p) => p.id))}>Everyone</button>
        <button className="pill" onClick={() => setSel(homeIds)}>Who's home</button>
        {saved.map((c) => (
          <button key={c.id} className="pill" onClick={() => nav(`/chat/${c.id}`, { replace: true })}>{c.name}</button>
        ))}
      </div>

      <input className="input" placeholder="Topic (optional), e.g. Japan trip" value={name} onChange={(e) => setName(e.target.value)} />
      <span className="muted" style={{ marginTop: -8 }}>A topic lets you have more than one chat with the same people.</span>

      <div className="grow" />
      <button className="btn big primary" disabled={sel.length === 0} onClick={start}>Start chat</button>
      {toast.node}
    </div>
  );
}
