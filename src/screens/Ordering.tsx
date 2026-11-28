import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { SUPERMARKETS } from '../seed';
import { useStore } from '../store';
import type { RunCard, RunOrder } from '../types';
import { Icon } from '../ui';
import { lateLabel, usePlaceFor } from './Takeaway';

interface Line {
  key: string;
  text: string;
  note?: string;
  orders: RunOrder[];
}

/** "2× Satay chicken noodles": identical orders (same place, same words, same note) read out once. */
function combine(orders: RunOrder[]): Line[] {
  const map = new Map<string, Line>();
  for (const o of orders) {
    const key = `${o.stop}|${o.text.trim().toLowerCase()}|${(o.note ?? '').trim().toLowerCase()}`;
    const line = map.get(key) ?? { key, text: o.text.trim(), note: o.note && o.note !== 'from the list' ? o.note : undefined, orders: [] };
    line.orders.push(o);
    map.set(key, line);
  }
  return [...map.values()];
}

/** Keeps the phone screen on while you read out the order. */
function useScreenAwake() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock;
    if (!wl) return;
    let lock: Lock | null = null;
    const get = () => wl.request('screen').then((l) => (lock = l)).catch(() => {});
    const onVis = () => document.visibilityState === 'visible' && get();
    get();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, []);
}

/** Full screen for the person placing the order: big, combined, tick as you say it. */
export function Ordering() {
  const { id } = useParams();
  const s = useStore();
  const nav = useNavigate();
  useScreenAwake();
  const c = s.cards.find((x) => x.id === id) as RunCard | undefined;
  const placeFor = usePlaceFor(c ?? ({ placeId: undefined } as RunCard));
  if (!c || c.kind !== 'run') return <div className="screen"><span className="muted">Loading…</span></div>;

  const stops = c.stops.filter((x) => x.approved);
  const isShop = stops.some((x) => SUPERMARKETS.includes(x.shop));
  const orderers = [...new Set(c.orders.map((o) => o.personId))].filter((p) => p !== s.me.id && !p.startsWith('guest:')).map((p) => s.person(p).name);
  const who = (os: RunOrder[]) => [...new Set(os.map((o) => (o.personId === s.me.id ? 'You' : o.personId.startsWith('guest:') ? o.personId.slice(6) : s.person(o.personId).name)))].join(', ');

  const LineRow = ({ l, late }: { l: Line; late?: boolean }) => {
    const done = l.orders.every((o) => o.ticked);
    return (
      <button
        onClick={() => s.tickMany(c.id, l.orders.map((o) => o.id), !done)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 14, width: '100%', padding: '14px 0', background: 'none', border: 'none', borderBottom: '0.5px solid #2a2a2e', textAlign: 'left', color: 'var(--text)' }}
      >
        <span style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${done ? '#34c759' : late ? '#ff8a7a' : '#5a5a62'}`, background: done ? '#34c759' : 'none', color: '#fff' }}>
          {done && <Icon name="check" size={16} stroke={3} />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 21, fontWeight: 600, color: done ? '#6f6f77' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
            {l.orders.length}× {l.text}
          </span>
          <span style={{ display: 'block', fontSize: 14, color: '#8e8e96', marginTop: 2 }}>
            {who(l.orders)}{late && l.orders[0].at ? ` · ${new Date(l.orders[0].at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()}` : ''}
          </span>
          {l.note && <span style={{ display: 'block', fontSize: 15, color: '#f2c48d', marginTop: 3 }}>{l.note}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="screen" style={{ gap: 10, paddingBottom: 140 }}>
      <div className="between head">
        <span style={{ fontSize: 13, color: '#8e8e96' }}>{isShop ? "You're shopping" : "You're ordering"} · screen stays on</span>
        <button className="icon-btn" aria-label="Close" style={{ width: 34, height: 34 }} onClick={() => nav(-1)}><Icon name="close" size={16} /></button>
      </div>

      {stops.map((st, i) => {
        const place = placeFor(st.shop, i);
        const mine = c.orders.filter((o) => o.stop === st.shop || (stops.length === 1 && !stops.some((x) => x.shop === o.stop)));
        const onTime = combine(mine.filter((o) => !lateLabel(c, o.at)));
        const late = combine(mine.filter((o) => lateLabel(c, o.at)));
        return (
          <div key={st.shop} className="col" style={{ gap: 0 }}>
            <h1 style={{ fontSize: 28, margin: '4px 0 10px' }}>{place?.name ?? st.shop}</h1>
            {(place?.phone || place?.menuUrl) && (
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                {place?.phone && (
                  <a className="btn primary grow" style={{ minHeight: 46, textDecoration: 'none', fontSize: 16 }} href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} onClick={() => s.markCalled(c.id)}>
                    Call
                  </a>
                )}
                {place?.menuUrl && <a className="btn ghost grow" style={{ minHeight: 46, textDecoration: 'none', fontSize: 16 }} href={place.menuUrl} target="_blank" rel="noreferrer">Menu</a>}
              </div>
            )}
            <span style={{ fontSize: 12, color: '#8e8e96', marginTop: 4 }}>{mine.length} order{mine.length === 1 ? '' : 's'} · tap each as you {isShop ? 'get it' : 'say it'}</span>
            {onTime.map((l) => <LineRow key={l.key} l={l} />)}
            {onTime.length === 0 && late.length === 0 && <span className="muted" style={{ padding: '14px 0' }}>Nothing for here yet</span>}
            {late.length > 0 && (
              <>
                <span style={{ fontSize: 12, color: '#ff8a7a', marginTop: 16 }}>{c.calledAt ? 'Added after you called' : 'Added after you locked in'}</span>
                {late.map((l) => <LineRow key={l.key} l={l} late />)}
              </>
            )}
          </div>
        );
      })}

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--tabbar-h) + 0px)', padding: '12px 20px', background: 'linear-gradient(transparent, var(--bg) 30%)' }}>
        <div style={{ maxWidth: 440, margin: '0 auto' }} className="col">
          {c.orderedAt ? (
            <button className="btn ghost big" onClick={() => nav(`/card/${c.id}`)}>Add costs</button>
          ) : (
            <button className="btn primary big" onClick={async () => { await s.markOrdered(c.id); nav(-1); }}>
              {isShop ? 'Got everything' : 'Ordered'} <Icon name="check" size={18} stroke={2.6} />
            </button>
          )}
          {!c.orderedAt && orderers.length > 0 && <span style={{ textAlign: 'center', fontSize: 12, color: '#8e8e96', marginTop: 6 }}>Lets {orderers.join(', ').replace(/, ([^,]*)$/, ' and $1')} know</span>}
        </div>
      </div>
    </div>
  );
}

/** Small pill above the bottom buttons (like Now Playing) while you have a recent run waiting to be ordered. */
export function OrderingBar() {
  const s = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const run = s.cards.find(
    (c): c is RunCard => c.kind === 'run' && c.createdBy === s.me.id && c.status !== 'done' && !c.orderedAt && c.orders.length > 0 && Date.now() - c.createdAt < 8 * 3600000,
  );
  const show = !!run && !loc.pathname.startsWith('/order/') && !loc.pathname.startsWith('/chat/') && !loc.pathname.startsWith('/card/');
  useEffect(() => {
    document.documentElement.style.setProperty('--obar-h', show ? '52px' : '0px');
  }, [show]);
  if (!show || !run) return null;
  const name = run.stops.filter((x) => x.approved).map((x) => x.shop).join(' + ');
  return (
    <button
      onClick={() => nav(`/order/${run.id}`)}
      style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(var(--tabbar-h) + 6px)', maxWidth: 456, margin: '0 auto', zIndex: 9, display: 'flex', alignItems: 'center', gap: 10, height: 44, border: 'none', borderRadius: 22, background: '#2a1a12', color: '#ffb38a', padding: '0 16px', fontSize: 14, fontWeight: 600, textAlign: 'left' }}
    >
      <Icon name="bag" size={17} />
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name} run · {run.orders.length} order{run.orders.length === 1 ? '' : 's'}</span>
      <span style={{ flexShrink: 0 }}>Order ›</span>
    </button>
  );
}
