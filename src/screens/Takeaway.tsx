import { useState } from 'react';
import { useStore } from '../store';
import { TAKEAWAY } from '../seed';
import type { Place, RunCard } from '../types';
import { Avatar, Sheet } from '../ui';

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Menu and Call buttons for a saved place. */
export function PlaceButtons({ place, big, onCall }: { place: Place; big?: boolean; onCall?: () => void }) {
  const h = big ? 48 : 36;
  return (
    <div className="row" style={{ gap: 6 }}>
      {place.menuUrl && (
        <a className="btn ghost grow" style={{ minHeight: h, fontSize: 14, textDecoration: 'none' }} href={place.menuUrl} target="_blank" rel="noreferrer">
          Menu
        </a>
      )}
      {place.phone && (
        <a className="btn primary grow" style={{ minHeight: h, fontSize: 14, textDecoration: 'none' }} href={telHref(place.phone)} onClick={onCall}>
          Call {big ? place.name : ''}
        </a>
      )}
    </div>
  );
}

/** The saved place for a stop, matched by name (or the older placeId link on the first stop). */
export function usePlaceFor(c: RunCard) {
  const s = useStore();
  return (shop: string, i: number) =>
    s.takeaways.find((p) => p.name.toLowerCase() === shop.toLowerCase()) ?? (i === 0 && c.placeId ? s.takeaways.find((p) => p.id === c.placeId) : undefined);
}

const isGeneric = (shop: string) => TAKEAWAY.includes(shop);

/** On a run: each stop's place with Menu and Call, "Where from?" for a stop like "Thai", and adding another place. */
export function RunPlace({ c, mode = 'full' }: { c: RunCard; mode?: 'card' | 'manage' | 'full' }) {
  const s = useStore();
  const placeFor = usePlaceFor(c);
  const [picking, setPicking] = useState<{ replace?: string; cuisine: string } | null>(null);
  const [editing, setEditing] = useState<Place | null>(null);
  const stops = c.stops.filter((x) => x.approved);
  const foodRun = stops.some((x, i) => isGeneric(x.shop) || placeFor(x.shop, i)) || FOODISH.includes(stops[0]?.shop);
  if (!foodRun || c.status === 'done') return null;
  const mineBuyer = c.createdBy === s.me.id;

  const pick = (name: string) => {
    if (picking?.replace) s.setStopPlace(c.id, picking.replace, name);
    else s.addPlaceStop(c.id, name);
    setPicking(null);
  };

  return (
    <div className="col" style={{ gap: 6 }}>
      {stops.map((x, i) => {
        const place = placeFor(x.shop, i);
        if (isGeneric(x.shop) && !place) {
          if (mode === 'card' && !mineBuyer) return null;
          const saved = s.takeaways.filter((p) => p.cuisine === x.shop || x.shop === 'Takeaway');
          return (
            <div key={x.shop} className="col" style={{ gap: 6, background: '#16161b', borderRadius: 12, padding: 10 }}>
              <span className="muted" style={{ fontSize: 12 }}>{x.shop === 'Takeaway' ? 'Where from?' : `Which ${x.shop} place?`}</span>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {saved.slice(0, 5).map((p) => (
                  <button key={p.id} className="chip" onClick={() => s.setStopPlace(c.id, x.shop, p.name)}>{p.name}</button>
                ))}
                <button className="chip" onClick={() => setPicking({ replace: x.shop, cuisine: x.shop })}>+ Type the name</button>
              </div>
            </div>
          );
        }
        if (!place && !FOODISH.includes(x.shop)) return null;
        // In the chat, a known place shows only as Call/Menu on the card's button row.
        if (mode === 'card') return null;
        // On the buyer's list, Call/Menu sit on each stop; here only offer to fill in missing details.
        if (mode === 'manage' && place && (place.phone || place.menuUrl)) return null;
        return (
          <div key={x.shop} className="col" style={{ gap: 6, background: '#16161b', borderRadius: 12, padding: 10 }}>
            <div className="between">
              <b style={{ fontSize: 14 }}>{place?.name ?? x.shop}</b>
              {(place?.phone || place?.menuUrl) && (
                <button className="btn quiet" style={{ minHeight: 24, padding: 0, fontSize: 12 }} onClick={() => setEditing(place!)}>Edit</button>
              )}
            </div>
            {place && (place.phone || place.menuUrl) ? (
              <PlaceButtons place={place} onCall={c.createdBy === s.me.id ? () => s.markCalled(c.id) : undefined} />
            ) : (
              <button className="btn quiet" style={{ minHeight: 28, padding: 0, fontSize: 13, alignSelf: 'flex-start' }}
                onClick={async () => setEditing(place ?? { id: await s.addTakeaway({ name: x.shop, cuisine: 'Takeaway' }), name: x.shop, cuisine: 'Takeaway', addedBy: s.me.id, at: Date.now() })}>
                + Add their phone number or menu
              </button>
            )}
          </div>
        );
      })}
      {stops.length < 4 && mode !== 'card' && (
        <button className="chip" style={{ alignSelf: 'flex-start' }} onClick={() => setPicking({ cuisine: 'Takeaway' })}>
          + {mineBuyer ? 'Another place' : `Ask ${s.person(c.createdBy).name} to add a place`}
        </button>
      )}
      {picking && <PlacePicker cuisine={picking.cuisine} exclude={stops.map((x) => x.shop)} onClose={() => setPicking(null)} onPick={pick} />}
      {editing && <PlaceSheet cuisine={editing.cuisine} place={editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </div>
  );
}

/** Fast-food chains count as food places too (so Domino's can get a phone number and menu). */
const FOODISH = ['Maccas', 'GYG', 'KFC', 'Subway', "Hungry Jack's", "Domino's", 'Squeaky Wheel'];

/** Pick a saved place, or type a new one. Phone and menu are optional. */
export function PlacePicker({ cuisine, exclude = [], onClose, onPick }: { cuisine: string; exclude?: string[]; onClose: () => void; onPick: (name: string) => void }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [more, setMore] = useState(false);
  const [phone, setPhone] = useState('');
  const [menu, setMenu] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = s.takeaways.filter((p) => !exclude.includes(p.name) && (cuisine === 'Takeaway' || p.cuisine === cuisine || p.cuisine === 'Takeaway'));
  const fixUrl = (u: string) => (u.trim() && !/^https?:\/\//i.test(u.trim()) ? `https://${u.trim()}` : u.trim());

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const existing = s.takeaways.find((p) => p.name.toLowerCase() === n.toLowerCase());
      if (existing) {
        if (phone.trim() || menu.trim()) await s.updateTakeaway(existing.id, { ...(phone.trim() ? { phone: phone.trim() } : {}), ...(menu.trim() ? { menuUrl: fixUrl(menu) } : {}) });
        onPick(existing.name);
      } else {
        await s.addTakeaway({ name: n, cuisine, ...(phone.trim() ? { phone: phone.trim() } : {}), ...(menu.trim() ? { menuUrl: fixUrl(menu) } : {}) });
        onPick(n);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <h2 style={{ fontSize: 20, margin: 0 }}>Where from?</h2>
      {saved.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {saved.slice(0, 8).map((p) => (
            <button key={p.id} className="chip" onClick={() => onPick(p.name)}>{p.name}</button>
          ))}
        </div>
      )}
      <input className="input" placeholder="Type the place, e.g. Otter Thai" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !more && save()} />
      {!more ? (
        <button className="btn quiet" style={{ alignSelf: 'flex-start', minHeight: 28, padding: 0, fontSize: 13 }} onClick={() => setMore(true)}>+ Phone number or menu (optional)</button>
      ) : (
        <>
          <input className="input" placeholder="Phone number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="input" placeholder="Menu link (paste from their website)" inputMode="url" value={menu} onChange={(e) => setMenu(e.target.value)} />
        </>
      )}
      <button className="btn primary" disabled={busy || !name.trim()} onClick={save}>Done</button>
    </Sheet>
  );
}

/** Add or change a saved place's phone and menu. */
export function PlaceSheet({ cuisine, place, onClose, onSaved }: { cuisine: string; place?: Place; onClose: () => void; onSaved: (id: string) => void }) {
  const s = useStore();
  const [name, setName] = useState(place?.name ?? '');
  const [phone, setPhone] = useState(place?.phone ?? '');
  const [menu, setMenu] = useState(place?.menuUrl ?? '');
  const [busy, setBusy] = useState(false);
  const fixUrl = (u: string) => (u.trim() && !/^https?:\/\//i.test(u.trim()) ? `https://${u.trim()}` : u.trim());

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const data = { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), ...(menu.trim() ? { menuUrl: fixUrl(menu) } : {}) };
    try {
      if (place) {
        await s.updateTakeaway(place.id, data);
        onSaved(place.id);
      } else onSaved(await s.addTakeaway({ ...data, cuisine }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <h2 style={{ fontSize: 20, margin: 0 }}>{place ? place.name : 'Save a place'}</h2>
      <span className="muted" style={{ fontSize: 14 }}>Saved for the whole group.</span>
      {!place && <input className="input" placeholder="Name, e.g. Otter Thai" value={name} onChange={(e) => setName(e.target.value)} />}
      <input className="input" placeholder="Phone number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus={!!place} />
      <input className="input" placeholder="Menu link (paste from their website)" inputMode="url" value={menu} onChange={(e) => setMenu(e.target.value)} />
      <button className="btn primary" disabled={busy || !name.trim()} onClick={save}>Save</button>
    </Sheet>
  );
}

/** The shopping list shown under a "next time someone's at Coles…" message. */
export function ListInline({ shop, latest }: { shop: string; latest: boolean }) {
  const s = useStore();
  const list = s.lists.find((l) => l.shop === shop);
  const items = list?.items ?? [];
  if (!latest) return null;
  return (
    <div style={{ width: 300, background: '#1b1b21', border: '1px solid var(--green)', borderRadius: 20, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="between">
        <span className="tag" style={{ color: 'var(--green)', fontSize: 11 }}>{shop === 'Groceries' ? 'Shopping list' : `${shop} list`}</span>
        <span className="muted" style={{ fontSize: 11 }}>{items.length} thing{items.length === 1 ? '' : 's'}</span>
      </div>
      {items.length === 0 && <span className="muted">All picked up</span>}
      {items.map((i) => (
        <div key={i.id} className="row" style={{ gap: 8 }}>
          <button className="box" aria-label={`Got ${i.text}`} style={{ width: 24, height: 24, borderRadius: 7 }} onClick={() => s.removeListItem(shop, i.id)} />
          <span className="grow" style={{ fontSize: 14 }}>{i.text}</span>
          <Avatar person={s.person(i.by)} size={20} />
        </div>
      ))}
      {items.length > 0 && (
        <span className="muted" style={{ fontSize: 12 }}>
          Goes into the next {shop === 'Groceries' ? 'Coles, Woolies, IGA or Aldi' : shop} run automatically.
        </span>
      )}
    </div>
  );
}

/** "5:42pm" */
export const orderTime = (t?: number) => (t ? new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase() : '');

/** Was this order added after the buyer phoned the order through or locked the run in? */
export function lateLabel(c: RunCard, at?: number): string | null {
  if (!at) return null;
  if (c.lockedAt && at > c.lockedAt) return 'added after it was locked in';
  if (c.calledAt && at > c.calledAt) return 'added after the call';
  return null;
}
