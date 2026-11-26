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

export function ChatList() {
  const s = useStore();
  const nav = useNavigate();
  const [people, setPeople] = useState(false);
  const runOpenIn = (cid: string) => s.cards.some((c) => c.chatId === cid && c.kind === 'run' && c.status !== 'done');

  return (
    <>
      <div className="screen with-tabs" style={{ gap: 12 }}>
        <div className="between">
          <h1 style={{ fontSize: 30 }}>Chats</h1>
          <button className="icon-btn" aria-label="New chat" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }} onClick={() => nav('/new-chat')}>
            <Icon name="pencil" size={20} stroke={2.2} />
          </button>
        </div>
        <NotifyBanner />
        <PeopleRow onOpen={() => setPeople(true)} />
        <div style={{ borderTop: '1px solid #1f1f26', margin: '0 -20px' }}>
          {s.chats.map((c) => {
            const members = c.memberIds.filter((id) => id !== s.me.id).map(s.person);
            const name = c.name || members.map((m) => m.name).join(', ') || 'Just you';
            const who = c.kind === 'fun' ? 'Reels, TikToks and photos' : c.everyone ? 'Everyone' : members.length === 1 ? 'Just you two' : `You, ${members.map((m) => m.name).join(', ')}`;
            return (
              <button key={c.id} onClick={() => nav(`/chat/${c.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'none', border: 'none', borderBottom: '1px solid #18181d', textAlign: 'left' }}>
                <ChatAvatar people={members} fun={c.kind === 'fun'} />
                <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                  <span className="between">
                    <b style={{ fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</b>
                    <span style={{ fontSize: 12, color: '#8a8a95', flexShrink: 0 }}>{when(c.lastAt)}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{who}</span>
                  <span style={{ fontSize: 14, color: runOpenIn(c.id) ? '#ff9a66' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {runOpenIn(c.id) ? 'Run open · tap to add your order' : c.lastText ?? ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {people && <PeopleSheet onClose={() => setPeople(false)} />}
    </>
  );
}

function ChatAvatar({ people, fun }: { people: Person[]; fun?: boolean }) {
  if (fun) {
    return (
      <span style={{ width: 52, height: 52, borderRadius: 26, background: '#2a1a12', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name="spark" size={24} />
      </span>
    );
  }
  const [a, b] = people;
  if (!a) return <span style={{ width: 52, height: 52, flexShrink: 0 }} />;
  if (!b) return <Avatar person={a} size={52} />;
  return (
    <span style={{ width: 52, height: 52, position: 'relative', flexShrink: 0 }}>
      <span style={{ position: 'absolute', left: 0, top: 0 }}><Avatar person={a} size={36} /></span>
      <span style={{ position: 'absolute', right: 0, bottom: 0 }}><Avatar person={b} size={36} /></span>
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

      <input className="input" placeholder="Name it (optional), e.g. The boys" value={name} onChange={(e) => setName(e.target.value)} />
      <span className="muted" style={{ marginTop: -8 }}>Named chats show up as a quick pick next time.</span>

      <div className="grow" />
      <button className="btn big primary" disabled={sel.length === 0} onClick={start}>Start chat</button>
      {toast.node}
    </div>
  );
}
