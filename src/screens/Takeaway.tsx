import { useState } from 'react';
import { useStore } from '../store';
import { TAKEAWAY } from '../seed';
import type { Place, RunCard } from '../types';
import { Avatar, Sheet } from '../ui';

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Menu and Call buttons for a saved place. */
export function PlaceButtons({ place, big }: { place: Place; big?: boolean }) {
  const h = big ? 48 : 36;
  return (
    <div className="row" style={{ gap: 6 }}>
      {place.menuUrl && (
        <a className="btn ghost grow" style={{ minHeight: h, fontSize: 14, textDecoration: 'none' }} href={place.menuUrl} target="_blank" rel="noreferrer">
          Menu
        </a>
      )}
      {place.phone && (
        <a className="btn primary grow" style={{ minHeight: h, fontSize: 14, textDecoration: 'none' }} href={telHref(place.phone)}>
          Call {big ? place.name : ''}
        </a>
      )}
    </div>
  );
}

/** On a takeaway run: which place it's from, with Menu and Call. */
export function RunPlace({ c }: { c: RunCard }) {
  const s = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Place | null>(null);
  const shop = c.stops[0].shop;
  const place = c.placeId ? s.takeaways.find((p) => p.id === c.placeId) : undefined;
  const isFood = TAKEAWAY.includes(shop) || !!place;
  if (!isFood || c.status === 'done') return null;

  if (place) {
    return (
      <div className="col" style={{ gap: 6, background: '#16161b', borderRadius: 12, padding: 10 }}>
        <div className="between">
          <b style={{ fontSize: 14 }}>{place.name}</b>
          <button className="btn quiet" style={{ minHeight: 24, padding: 0, fontSize: 12 }} onClick={() => s.setRunPlace(c.id, null)}>Change</button>
        </div>
        {!place.phone && !place.menuUrl ? (
          <button className="btn quiet" style={{ minHeight: 28, padding: 0, fontSize: 13, alignSelf: 'flex-start' }} onClick={() => setEditing(place)}>+ Add phone number or menu</button>
        ) : (
          <PlaceButtons place={place} />
        )}
        {editing && <PlaceSheet cuisine={shop} place={editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
      </div>
    );
  }

  const choices = s.takeaways.filter((p) => p.cuisine === shop || shop === 'Takeaway');
  return (
    <div className="col" style={{ gap: 6 }}>
      <span className="muted" style={{ fontSize: 12 }}>Where from?</span>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {choices.map((p) => (
          <button key={p.id} className="chip" onClick={() => s.setRunPlace(c.id, p.id)}>{p.name}</button>
        ))}
        <button className="chip" onClick={() => setAdding(true)}>+ {choices.length ? 'Somewhere else' : `Add a ${shop === 'Takeaway' ? 'place' : `${shop} place`}`}</button>
      </div>
      {adding && <PlaceSheet cuisine={shop} onClose={() => setAdding(false)} onSaved={(id) => { s.setRunPlace(c.id, id); setAdding(false); }} />}
    </div>
  );
}

/** Save a place once: name, phone, menu link. */
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
    const data = { name: name.trim(), phone: phone.trim() || undefined, menuUrl: fixUrl(menu) || undefined };
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
      <h2 style={{ fontSize: 20, margin: 0 }}>{place ? place.name : `Save a ${cuisine === 'Takeaway' ? 'takeaway' : cuisine} place`}</h2>
      <span className="muted" style={{ fontSize: 14 }}>Saved for the whole group. Next time, just pick it.</span>
      {!place && <input placeholder="Name, e.g. Chilli Basil" value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
      <input placeholder="Phone number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input placeholder="Menu link (paste from their website)" inputMode="url" value={menu} onChange={(e) => setMenu(e.target.value)} />
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
