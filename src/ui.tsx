import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Person } from './types';

const paths: Record<string, ReactNode> = {
  home: <path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  balances: <path d="M7 7h13M17 4l3 3-3 3M17 17H4M7 14l-3 3 3 3" />,
  me: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" />
    </>
  ),
  back: <path d="M15 6l-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12l5 5 9-10" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  bag: (
    <>
      <path d="M5 8h14l-1.5 12h-11z" />
      <path d="M9 8V6a3 3 0 016 0v2" />
    </>
  ),
  bowl: (
    <>
      <path d="M4 13h16" />
      <path d="M5 13a7 7 0 0014 0" />
      <path d="M12 6v3" />
    </>
  ),
  job: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  shout: (
    <>
      <path d="M12 3v3M18.4 18.4a9 9 0 10-12.8 0" />
      <path d="M12 12l3-3" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13 7l4 4" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  share: (
    <>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 13v6h14v-6" />
    </>
  ),
  chats: <path d="M4 5h16v11H9l-5 4z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.5-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2 .7 3.2 2.6 3.5 5.5" />
    </>
  ),
  thumb: <path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 013 2l-1 4h6a2 2 0 012 2.3l-1.3 6A2 2 0 0117.7 20H7" />,
  pin: (
    <>
      <path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z" />
      <path d="M12 7v6M9 10h6" />
    </>
  ),
};

export function Icon({ name, size = 22, stroke = 2 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Avatar({ person, size = 54, ring, dim }: { person: Person; size?: number; ring?: string; dim?: boolean }) {
  return (
    <span className="avatar" style={{ width: size, height: size, borderColor: ring && ring !== 'dashed' ? ring : '#3a3a44', borderStyle: ring === 'dashed' ? 'dashed' : 'solid' }}>
      <span style={{ background: person.color, fontSize: size * 0.3, opacity: dim ? 0.4 : 1 }}>{person.name[0]}</span>
    </span>
  );
}

export function TopBar({ title, tag, tagColor = 'var(--accent)' }: { title?: string; tag?: string; tagColor?: string }) {
  const nav = useNavigate();
  return (
    <div className="between">
      <button className="icon-btn" aria-label="Back" onClick={() => nav(-1)}>
        <Icon name="back" size={18} stroke={2.5} />
      </button>
      {tag && (
        <span className="tag" style={{ color: tagColor }}>
          {tag}
        </span>
      )}
      {title && <span style={{ fontWeight: 600 }}>{title}</span>}
      <span style={{ width: 44 }} />
    </div>
  );
}

export function TabBar() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const isOn = (path: string) => (path === '/' ? pathname === '/' || pathname.startsWith('/chat') || pathname.startsWith('/card') || pathname === '/new-chat' : pathname.startsWith(path));
  const tab = (path: string, icon: string, label: string) => (
    <button className={`tab ${isOn(path) ? 'on' : ''}`} aria-label={label} aria-current={isOn(path) ? 'page' : undefined} onClick={() => nav(path)}>
      <Icon name={icon} size={24} stroke={isOn(path) ? 2.4 : 2} />
    </button>
  );
  return (
    <div className="tabbar">
      <nav>
        {tab('/', 'chats', 'Chats')}
        {tab('/calendar', 'calendar', 'Calendar')}
        {tab('/balances', 'balances', 'Balances')}
        {tab('/me', 'me', 'Me')}
      </nav>
    </div>
  );
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        {children}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    if ('vibrate' in navigator) navigator.vibrate?.(15);
    const t = setTimeout(() => setMsg(null), 1800);
    return () => clearTimeout(t);
  }, [msg]);
  return { show: setMsg, node: msg ? <div className="toast">{msg}</div> : null };
}

export function PeoplePicker({ people, selected, onToggle }: { people: Person[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
      {people.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button key={p.id} onClick={() => onToggle(p.id)} aria-pressed={on} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Avatar person={p} ring={on ? 'var(--accent)' : 'dashed'} dim={!on} />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
