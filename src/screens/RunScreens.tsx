import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FAST_FOOD, SHOPS, BOTTLE_SHOP } from '../seed';
import { PlaceButtons, RunPlace, lateLabel, orderTime, usePlaceFor } from './Takeaway';
import { clock, timeLeft, useStore } from '../store';
import type { RunCard } from '../types';
import { Avatar, Icon, Sheet, TopBar, useToast } from '../ui';

export function AddOrder({ card: c }: { card: RunCard }) {
  const s = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const stops = c.stops.filter((x) => x.approved);
  const [stopPicked, setStop] = useState(stops[0].shop);
  const stop = stops.some((x) => x.shop === stopPicked) ? stopPicked : stops[stops.length - 1].shop;
  const usuals = s.state.usuals[s.me.id]?.[stop] ?? [];
  const [pick, setPick] = useState<string | null>(usuals[0] ?? null);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [saveIt, setSaveIt] = useState(true);
  const [stopSheet, setStopSheet] = useState(false);
  const mine = c.orders.filter((o) => o.personId === s.me.id);
  const pending = c.stops.filter((x) => !x.approved);
  const buyer = s.person(c.createdBy);
  const text = typed.trim() || pick || '';
  const isFood = FAST_FOOD.includes(stop);
  const placeFor = usePlaceFor(c);

  if (c.locked) {
    return (
      <div className="screen">
        <TopBar tag="Run" />
        <h1 style={{ fontSize: 28 }}>{buyer.name}'s run is locked in</h1>
        <div className="muted">Orders closed. {mine.length ? 'Yours is on the list:' : "You didn't add anything this time."}</div>
        {mine.map((o) => (
          <div key={o.id} className="card"><b>{o.text}</b><span className="muted">{o.stop}{o.missing ? ` · ${o.missing}` : o.ticked ? ' · got it' : ''}</span></div>
        ))}
      </div>
    );
  }

  const add = () => {
    s.addOrder(c.id, stop, text, note.trim() || undefined);
    if (typed.trim() && saveIt) s.saveUsual(stop, typed.trim());
    setTyped('');
    setNote('');
    toast.show('Added to the run');
  };

  return (
    <div className="screen">
      <div className="row head">
        <button className="icon-btn" aria-label="Back" onClick={() => nav(-1)}><Icon name="back" size={18} stroke={2.5} /></button>
        <div className="col" style={{ gap: 2 }}>
          <span className="muted">{c.createdBy === s.me.id ? 'Your run' : `${buyer.name}'s going to`}</span>
          <b style={{ fontSize: 16 }}>{stops.map((x, i) => placeFor(x.shop, i)?.name ?? x.shop).join(' + ')}</b>
        </div>
      </div>
      <RunPlace c={c} />

      {c.due && (
        <div className="between" style={{ background: '#2a1a12', borderRadius: 16, padding: '12px 14px' }}>
          <span style={{ color: '#ffc9a8', fontSize: 14 }}>Orders close at {clock(c.due)}</span>
          <span className="display" style={{ fontSize: 20, color: '#ff9a66' }}>{timeLeft(c.due)}</span>
        </div>
      )}

      {stops.length > 1 && (
        <div className="row">
          {stops.map((x) => (
            <button key={x.shop} className={`pill ${stop === x.shop ? 'on' : ''}`} onClick={() => { setStop(x.shop); setPick(s.state.usuals[s.me.id]?.[x.shop]?.[0] ?? null); }}>{x.shop}</button>
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <div className="card flat">
          <div className="label">You've added</div>
          {mine.map((o) => (
            <div key={o.id} className="between">
              <span>{o.text} <span className="muted">· {o.stop}{o.at ? ` · ${orderTime(o.at)}` : ''}</span></span>
              <button className="btn quiet" style={{ minHeight: 36 }} onClick={() => s.removeOrder(c.id, o.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {usuals.length > 0 && (
        <div className="col">
          <div className="label">Your usuals</div>
          {usuals.map((u) => (
            <button key={u} className={`choice ${pick === u && !typed ? 'on' : ''}`} onClick={() => { setPick(u); setTyped(''); }}>
              <b style={{ fontSize: 15 }}>{u}</b>
              <span className={`check ${pick === u && !typed ? 'on' : ''}`}>{pick === u && !typed && <Icon name="check" size={16} stroke={3} />}</span>
            </button>
          ))}
        </div>
      )}

      <div className="col">
        <div className="label">{usuals.length ? 'Or type something' : isFood ? 'What do you want?' : 'What do you need?'}</div>
        <input className="input" placeholder={isFood ? 'e.g. Chicken burrito, no pico' : 'e.g. Milk 2L'} value={typed} onChange={(e) => setTyped(e.target.value)} />
        {typed.trim() && (
          <label className="row muted" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={saveIt} onChange={(e) => setSaveIt(e.target.checked)} /> Save as a usual for {stop}
          </label>
        )}
        <input className="input" placeholder={`Note for ${buyer.name} (optional)`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {pending.length > 0 && <span className="muted">Waiting for {buyer.name} to OK a stop at {pending.map((p) => p.shop).join(', ')}.</span>}
      {c.stops.length < 3 && c.createdBy !== s.me.id && (
        <button className="card flat" style={{ border: 'none', flexDirection: 'row', alignItems: 'center', textAlign: 'left' }} onClick={() => setStopSheet(true)}>
          <span style={{ color: 'var(--accent)' }}><Icon name="pin" size={20} /></span>
          <span className="grow">Want something from another shop?</span>
          <b style={{ color: 'var(--accent)', fontSize: 14 }}>Add a stop</b>
        </button>
      )}

      <div className="grow" />
      <div className="row">
        {c.createdBy !== s.me.id && mine.length === 0 && (
          <button className="btn big ghost" onClick={() => { s.notMe(c.id); nav(-1); }}>Not me</button>
        )}
        <button className="btn big primary grow" disabled={!text} onClick={add}>Add to run</button>
      </div>
      {mine.length > 0 && <button className="btn quiet" onClick={() => nav(-1)}>Done</button>}

      {stopSheet && (
        <Sheet onClose={() => setStopSheet(false)}>
          <h2 style={{ fontSize: 22 }}>Ask {buyer.name} to stop at…</h2>
          <div className="shop-grid">
            {SHOPS.filter((x) => x !== 'Other' && !c.stops.some((st) => st.shop === x) && (x !== BOTTLE_SHOP || s.me.adult)).map((x) => (
              <button key={x} className="shop" onClick={() => { s.askStop(c.id, x); setStopSheet(false); toast.show(`Asked ${buyer.name}`); }}>{x}</button>
            ))}
          </div>
        </Sheet>
      )}
      {toast.node}
    </div>
  );
}

export function BuyerList({ card: c }: { card: RunCard }) {
  const s = useStore();
  const nav = useNavigate();
  const [amountsOpen, setAmountsOpen] = useState(false);
  const [missingFor, setMissingFor] = useState<string | null>(null);
  const [missingNote, setMissingNote] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const stops = c.stops.filter((x) => x.approved);
  const pending = c.stops.filter((x) => !x.approved);
  const answered = new Set([...c.orders.map((o) => o.personId), ...c.notMe]);
  const notOrdering = c.notMe.map((id) => s.person(id).name);
  const noAnswer = c.forIds.filter((id) => !answered.has(id) && id !== s.me.id).map((id) => s.person(id).name);
  const ticked = c.orders.filter((o) => o.ticked).length;
  const people = [...new Set(c.orders.map((o) => o.personId))];
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const placeFor = usePlaceFor(c);

  if (showAdd) return <AddOrderInline card={c} onBack={() => setShowAdd(false)} />;

  return (
    <div className="screen">
      <div className="between head">
        <button className="icon-btn" aria-label="Back" onClick={() => nav(-1)}><Icon name="back" size={18} stroke={2.5} /></button>
        <span className="tag" style={{ color: c.locked ? 'var(--green)' : 'var(--accent)', background: c.locked ? '#1a2621' : '#2a1a12', padding: '6px 10px', borderRadius: 999 }}>
          {c.locked ? 'Locked in' : timeLeft(c.due) === 'closed' ? 'Orders closed' : `Open · closes in ${timeLeft(c.due)}`}
        </span>
      </div>
      <div>
        <h1 style={{ fontSize: 30 }}>Your run</h1>
        <div className="muted">{stops.length} stop{stops.length > 1 ? 's' : ''} · {c.orders.length} order{c.orders.length === 1 ? '' : 's'}{c.locked ? ` · ${ticked} of ${c.orders.length} ticked` : ''}</div>
      </div>

      {pending.map((p) => (
        <div key={p.shop} className="card hot">
          <b>{s.person(p.addedBy).name} wants to add {p.shop}. Add the stop?</b>
          <div className="row">
            <button className="btn primary grow" onClick={() => s.answerStop(c.id, p.shop, true)}>Yes</button>
            <button className="btn ghost grow" onClick={() => s.answerStop(c.id, p.shop, false)}>No</button>
          </div>
        </div>
      ))}

      {stops.map((st, i) => {
        const orders = c.orders.filter((o) => o.stop === st.shop);
        return (
          <div key={st.shop} className="card" style={{ paddingTop: 6, paddingBottom: 6, gap: 0 }}>
            <div className="between" style={{ padding: '10px 0 6px' }}>
              <span className="tag" style={{ color: 'var(--accent)' }}>Stop {i + 1} · {st.shop}</span>
              <span className="muted">{st.addedBy !== c.createdBy ? `added by ${s.person(st.addedBy).name}` : `${orders.length} order${orders.length === 1 ? '' : 's'}`}</span>
            </div>
            {(() => {
              const p = placeFor(st.shop, i);
              return p && (p.phone || p.menuUrl) ? <div style={{ paddingBottom: 8 }}><PlaceButtons place={p} onCall={() => s.markCalled(c.id)} /></div> : null;
            })()}
            {orders.length === 0 && <div className="order-row muted">Nothing yet</div>}
            {orders.map((o) => (
              <div key={o.id} className="order-row">
                {c.locked && (
                  <button className={`box ${o.ticked ? 'on' : ''}`} aria-label={o.ticked ? 'Untick' : 'Tick off'} onClick={() => s.tick(c.id, o.id)}>
                    {o.ticked && <Icon name="check" size={16} stroke={3} />}
                  </button>
                )}
                <Avatar person={s.person(o.personId)} size={34} />
                <span className="col grow" style={{ gap: 2, opacity: o.ticked ? 0.5 : 1 }}>
                  <b style={{ fontSize: 15 }}>{o.text}</b>
                  <span className="muted">{o.personId === s.me.id ? 'You' : s.person(o.personId).name}{o.at ? ` · ${orderTime(o.at)}` : ''}{o.note ? ` · ${o.note}` : ''}{o.missing ? ` · ${o.missing}` : ''}</span>
                  {lateLabel(c, o.at) && <span style={{ fontSize: 12, fontWeight: 700, color: '#ff8a7a' }}>Late: {lateLabel(c, o.at)}</span>}
                </span>
                {c.locked && !o.ticked && (
                  <button className="btn quiet" style={{ minHeight: 36, padding: '0 6px', fontSize: 13 }} onClick={() => setMissingFor(o.id)}>Can't get</button>
                )}
                <button className="icon-btn" aria-label={`Delete ${o.text}`} style={{ width: 32, height: 32, background: 'none', color: 'var(--muted)' }}
                  onClick={() => confirm(`Delete "${o.text}"?`) && s.removeOrder(c.id, o.id)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        );
      })}

      <div className="col" style={{ gap: 6, padding: '0 4px' }}>
        {notOrdering.length > 0 && <div style={{ fontSize: 14, color: 'var(--text-2)' }}><b style={{ color: 'var(--text)' }}>Not ordering:</b> {notOrdering.join(', ')}</div>}
        {noAnswer.length > 0 && <div style={{ fontSize: 14, color: 'var(--text-2)' }}><b style={{ color: 'var(--text)' }}>No answer yet:</b> {noAnswer.join(', ')}</div>}
      </div>

      <div className="grow" />
      {!c.locked ? (
        <div className="col">
          <button className="btn big primary" onClick={() => s.lockRun(c.id)}>Lock it in · I'm leaving</button>
          <button className="btn quiet" onClick={() => setShowAdd(true)}>Add something for me</button>
        </div>
      ) : (
        <button className="btn big primary" onClick={() => setAmountsOpen(true)}>Done · add amounts</button>
      )}

      {missingFor && (
        <Sheet onClose={() => setMissingFor(null)}>
          <h2 style={{ fontSize: 22 }}>Couldn't get it?</h2>
          <input className="input" placeholder="e.g. No 2L, got 2 x 1L" value={missingNote} onChange={(e) => setMissingNote(e.target.value)} />
          <button className="btn big primary" onClick={() => { s.markMissing(c.id, missingFor, missingNote.trim()); setMissingFor(null); setMissingNote(''); }}>Let them know</button>
        </Sheet>
      )}

      {amountsOpen && (
        <Sheet onClose={() => setAmountsOpen(false)}>
          <h2 style={{ fontSize: 22 }}>What does everyone owe?</h2>
          <span className="muted">Receipt scanning is coming. For now, type each person's total.</span>
          {people.filter((id) => id.startsWith('guest:')).length > 0 && (
            <span className="muted">{people.filter((id) => id.startsWith('guest:')).map((id) => id.slice(6)).join(', ')} ordered from a link, so settle up with them directly.</span>
          )}
          {people.filter((id) => id !== s.me.id && !id.startsWith('guest:')).map((id) => (
            <label key={id} className="row">
              <Avatar person={s.person(id)} size={36} />
              <span className="grow">{s.person(id).name}</span>
              <input className="input" style={{ width: 120 }} inputMode="decimal" placeholder="$0.00" value={amounts[id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [id]: e.target.value })} />
            </label>
          ))}
          {people.filter((id) => id !== s.me.id && !id.startsWith('guest:')).length === 0 && <span className="muted">Only your own order on this run, so nothing to split.</span>}
          <button
            className="btn big primary"
            onClick={() => {
              const parsed = Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, parseFloat(v) || 0]));
              s.finishRun(c.id, parsed);
              nav('/balances', { replace: true });
            }}
          >
            Finish run
          </button>
        </Sheet>
      )}
    </div>
  );
}

function AddOrderInline({ card, onBack }: { card: RunCard; onBack: () => void }) {
  return (
    <div>
      <div style={{ padding: '16px 20px 0' }}>
        <button className="btn quiet" onClick={onBack}>← Back to the list</button>
      </div>
      <AddOrder card={card} />
    </div>
  );
}
