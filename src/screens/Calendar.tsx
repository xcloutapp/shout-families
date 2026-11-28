import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, dayKey, startOfDay, toIcs } from '../dates';
import { clock, useStore } from '../store';
import type { CalEvent } from '../types';
import { Avatar, Icon, Sheet, useToast } from '../ui';

const KIND = {
  away: { label: 'Away', color: 'var(--purple)', bg: '#24213a' },
  work: { label: 'Working', color: 'var(--yellow)', bg: '#2a2410' },
  event: { label: 'On', color: 'var(--blue)', bg: '#13222c' },
};

const fromKey = (k: string) => new Date(`${k}T00:00`);
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const timeLabel = (e: { start?: string; end?: string }) => {
  if (!e.start) return 'All day';
  const f = (x: string) => {
    const [h, m] = x.split(':').map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
  };
  return e.end ? `${f(e.start)}–${f(e.end)}` : f(e.start);
};

/** Is this person out at dinner time (about 6–7:30pm) on that day? */
function outForDinner(e: CalEvent) {
  if (e.kind === 'away') return !e.start || (e.start <= '19:30' && (e.end ?? '23:59') >= '18:00');
  if (e.kind === 'work') return !!e.start && e.start <= '19:30' && (e.end ?? '23:59') >= '18:00';
  return false;
}

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Calendar() {
  const s = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const today = startOfDay(new Date());
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [sel, setSel] = useState(dayKey(today));
  const [justMe, setJustMe] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [slide, setSlide] = useState<'l' | 'r' | null>(null);
  // Swipe left/right to move a week (the strip and the grid) or a day (the day card).
  const moveWeek = (n: number) => {
    setWeekStart((w) => addDays(w, 7 * n));
    setSel((k) => dayKey(addDays(fromKey(k), 7 * n)));
    setSlide(n > 0 ? 'l' : 'r');
  };
  const moveDay = (n: number) => {
    const next = addDays(fromKey(sel), n);
    setSel(dayKey(next));
    const ws = mondayOf(next);
    if (+ws !== +weekStart) {
      setWeekStart(ws);
      setSlide(n > 0 ? 'l' : 'r');
    }
  };
  const weekSwipe = useSwipe(() => moveWeek(1), () => moveWeek(-1));
  const daySwipe = useSwipe(() => moveDay(1), () => moveDay(-1));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const keys = days.map(dayKey);
  const people = justMe ? [s.me] : s.members;
  const events = useMemo(() => s.events.filter((e) => !justMe || e.personId === s.me.id), [s.events, justMe, s.me.id]);
  const cards = s.cards.filter((c) => c.due && c.status !== 'done' && (!justMe || c.forIds.includes(s.me.id) || c.createdBy === s.me.id));

  const eventsOn = (k: string) => events.filter((e) => e.days.includes(k));
  const cardsOn = (k: string) => cards.filter((c) => dayKey(new Date(c.due!)) === k);

  const selEvents = eventsOn(sel);
  const selCards = cardsOn(sel);
  const out = s.members.filter((p) => selEvents.some((e) => e.personId === p.id && outForDinner(e)));
  const home = s.members.filter((p) => !out.includes(p));
  const selDate = fromKey(sel);

  const exportWeek = () => {
    const items = keys.flatMap((k) => [
      ...eventsOn(k).map((e) => ({ uid: `${e.id}-${k}`, day: k, title: `${s.person(e.personId).name}: ${e.title}`, start: e.start, end: e.end })),
      ...cardsOn(k).map((c) => ({ uid: c.id, day: k, title: c.kind === 'run' ? `${c.stops[0].shop} run` : c.kind === 'job' ? c.title : 'Dinner', start: new Date(c.due!).toTimeString().slice(0, 5) })),
    ]);
    if (!items.length) return toast.show('Nothing to add this week yet');
    download(`shout-week-${keys[0]}.ics`, toIcs(items));
    toast.show('Opening in your calendar');
  };

  return (
    <div className="screen with-tabs" style={{ gap: 14 }}>
      <div className="between">
        <h1 style={{ fontSize: 26 }}>{fromKey(sel).toLocaleDateString('en-AU', { month: 'long' })}</h1>
        <button className="btn primary" style={{ minHeight: 40 }} onClick={() => setAdding(true)}><Icon name="plus" size={18} stroke={2.6} /> Add</button>
      </div>

      <div className="row" style={{ gap: 4 }}>
        <button className="icon-btn" aria-label="Previous week" style={{ width: 32, height: 64, borderRadius: 12 }} onClick={() => moveWeek(-1)}><Icon name="back" size={16} stroke={2.5} /></button>
        <div key={`strip-${dayKey(weekStart)}`} {...weekSwipe} className={slide ? `slide-${slide}` : ''} style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, touchAction: 'pan-y' }}>
          {days.map((d, i) => {
            const k = keys[i];
            const isSel = k === sel;
            const isToday = k === dayKey(today);
            const busy = eventsOn(k).length + cardsOn(k).length;
            return (
              <button key={k} onClick={() => setSel(k)} aria-pressed={isSel} style={{ minHeight: 64, borderRadius: 14, border: isToday && !isSel ? '1px solid var(--accent)' : 'none', background: isSel ? 'var(--accent)' : 'var(--surface-2)', color: isSel ? 'var(--accent-ink)' : 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{d.toLocaleDateString('en-AU', { weekday: 'narrow' })}</span>
                <b style={{ fontSize: 17 }}>{d.getDate()}</b>
                <span style={{ width: 5, height: 5, borderRadius: 3, background: busy ? (isSel ? 'var(--accent-ink)' : 'var(--accent)') : 'transparent' }} />
              </button>
            );
          })}
        </div>
        <button className="icon-btn" aria-label="Next week" style={{ width: 32, height: 64, borderRadius: 12 }} onClick={() => moveWeek(1)}><Icon name="chevron" size={16} stroke={2.5} /></button>
      </div>

      <div className="row">
        <button className={`pill ${!justMe ? 'on' : ''}`} onClick={() => setJustMe(false)}>Everyone</button>
        <button className={`pill ${justMe ? 'on' : ''}`} onClick={() => setJustMe(true)}>Just me</button>
      </div>

      <div className="card" {...daySwipe} style={{ touchAction: 'pan-y' }}>
        <div className="between">
          <b className="display" style={{ fontSize: 20 }}>{selDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}</b>
          {sel === dayKey(today) && <span className="tag" style={{ color: 'var(--accent)', fontSize: 11 }}>Today</span>}
        </div>
        {!justMe && (
          <div className="col" style={{ gap: 6 }}>
            <span className="tag" style={{ color: 'var(--green)', fontSize: 11 }}>Home for dinner</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {home.map((p) => <Avatar key={p.id} person={p} size={30} />)}
              {out.length > 0 && <span className="muted" style={{ marginLeft: 4 }}>Out: {out.map((p) => p.name).join(', ')}</span>}
            </div>
          </div>
        )}
        <div style={{ height: 1, background: 'var(--chip)' }} />
        {selEvents.length === 0 && selCards.length === 0 && <span className="muted">Nothing on. Tap Add, or just say it in a chat: "I'm at Matt's Friday".</span>}
        {selEvents.map((e) => {
          const k = KIND[e.kind];
          return (
            <button key={e.id} onClick={() => setOpen(e)} className="row" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', gap: 10 }}>
              <Avatar person={s.person(e.personId)} size={32} />
              <span className="col grow" style={{ gap: 1 }}>
                <b style={{ fontSize: 15 }}>{s.person(e.personId).name}: {e.title}</b>
                <span style={{ fontSize: 12, color: k.color }}>{k.label} · {timeLabel(e)}</span>
              </span>
            </button>
          );
        })}
        {selCards.map((c) => (
          <button key={c.id} onClick={() => nav(c.chatId ? `/chat/${c.chatId}` : `/card/${c.id}`)} className="row" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 16, background: '#2a1a12', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.kind === 'run' ? 'bag' : 'job'} size={16} /></span>
            <span className="col grow" style={{ gap: 1 }}>
              <b style={{ fontSize: 15 }}>{c.kind === 'run' ? `${c.stops.filter((x) => x.approved).map((x) => x.shop).join(' + ')} run closes` : c.kind === 'job' ? c.title : 'Dinner'}</b>
              <span className="muted" style={{ fontSize: 12 }}>{clock(c.due!)} · {c.createdBy === s.me.id ? 'You' : s.person(c.createdBy).name}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="between"><div className="label">{+weekStart === +mondayOf(today) ? 'This week' : `Week of ${weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}</div><span className="muted" style={{ fontSize: 11 }}>Swipe for other weeks</span></div>
      <div key={`grid-${dayKey(weekStart)}`} {...weekSwipe} className={slide ? `slide-${slide}` : ''} style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, minmax(0, 1fr))', gap: '6px 3px', alignItems: 'center', touchAction: 'pan-y' }}>
        <span />
        {days.map((d, i) => (
          <span key={keys[i]} style={{ fontSize: 10, textAlign: 'center', color: keys[i] === sel ? 'var(--accent)' : 'var(--muted)', fontWeight: 700 }}>{d.toLocaleDateString('en-AU', { weekday: 'narrow' })}</span>
        ))}
        {people.map((p) => (
          <PersonRow key={p.id} id={p.id} keys={keys} events={events.filter((e) => e.personId === p.id)} onPick={(k) => setSel(k)} />
        ))}
      </div>

      <button className="btn ghost" onClick={exportWeek}>Add this week to my phone's calendar</button>
      <span className="muted" style={{ marginTop: -8 }}>Adds a copy to Apple or Google Calendar. Later changes in Shout won't update that copy.</span>

      {adding && <AddEvent defaultDay={sel} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast.show('Added to the calendar'); }} />}
      {open && (
        <Sheet onClose={() => setOpen(null)}>
          <div className="row">
            <Avatar person={s.person(open.personId)} size={44} />
            <div className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 18 }}>{s.person(open.personId).name}: {open.title}</b>
              <span className="muted">{KIND[open.kind].label} · {timeLabel(open)} · {open.days.length === 1 ? fromKey(open.days[0]).toLocaleDateString('en-AU', { weekday: 'long' }) : `${fromKey(open.days[0]).toLocaleDateString('en-AU', { weekday: 'short' })} to ${fromKey(open.days[open.days.length - 1]).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`}</span>
            </div>
          </div>
          <button className="btn ghost" onClick={() => {
            download(`shout-${open.id}.ics`, toIcs(open.days.map((k) => ({ uid: `${open.id}-${k}`, day: k, title: `${s.person(open.personId).name}: ${open.title}`, start: open.start, end: open.end }))));
            setOpen(null);
          }}>Add to my phone's calendar</button>
          {(open.createdBy === s.me.id || open.personId === s.me.id) && (
            <button className="btn ghost" style={{ color: '#ff8a80', borderColor: '#4a2a2a' }} onClick={() => { s.deleteEvent(open.id); setOpen(null); toast.show('Removed'); }}>Remove from the calendar</button>
          )}
          <button className="btn quiet" onClick={() => setOpen(null)}>Close</button>
        </Sheet>
      )}
      {toast.node}
    </div>
  );
}

function PersonRow({ id, keys, events, onPick }: { id: string; keys: string[]; events: CalEvent[]; onPick: (k: string) => void }) {
  const s = useStore();
  return (
    <>
      <Avatar person={s.person(id)} size={30} />
      {keys.map((k) => {
        const e = events.find((x) => x.days.includes(k));
        const kd = e ? KIND[e.kind] : null;
        return (
          <button key={k} onClick={() => onPick(k)} aria-label={e ? `${s.person(id).name}: ${e.title}` : `${s.person(id).name}: nothing on`} style={{ height: 30, borderRadius: 8, border: 'none', padding: '0 2px', background: kd ? kd.bg : 'var(--surface-2)', color: kd ? kd.color : 'transparent', fontSize: 9, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {e ? e.title.replace(/^Working( at )?/, 'Work ').slice(0, 7) : '·'}
          </button>
        );
      })}
    </>
  );
}

function AddEvent({ defaultDay, onClose, onSaved }: { defaultDay: string; onClose: () => void; onSaved: () => void }) {
  const s = useStore();
  const [who, setWho] = useState(s.me.id);
  const [kind, setKind] = useState<CalEvent['kind']>('away');
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState(defaultDay);
  const [to, setTo] = useState(defaultDay);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const save = async () => {
    const days: string[] = [];
    let d = fromKey(from);
    const last = fromKey(to < from ? from : to);
    for (let i = 0; d <= last && i < 31; i++, d = addDays(d, 1)) days.push(dayKey(d));
    await s.addEvent({ personId: who, kind, title: title.trim() || (kind === 'work' ? 'Working' : kind === 'away' ? 'Away' : 'Busy'), days, start: start || undefined, end: end || undefined });
    onSaved();
  };

  return (
    <Sheet onClose={onClose}>
      <h2 style={{ fontSize: 22 }}>Add to the calendar</h2>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {s.members.map((p) => (
          <button key={p.id} className={`pill ${who === p.id ? 'on' : ''}`} onClick={() => setWho(p.id)}>{p.id === s.me.id ? 'Me' : p.name}</button>
        ))}
      </div>
      <div className="row">
        {(Object.keys(KIND) as CalEvent['kind'][]).map((k) => (
          <button key={k} className={`pill grow ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k === 'event' ? 'Something on' : KIND[k].label}</button>
        ))}
      </div>
      <input className="input" placeholder={kind === 'away' ? "Where? e.g. Sydney, Matt's" : kind === 'work' ? "Where? e.g. Domino's" : 'What? e.g. Passport photos'} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="row">
        <label className="col grow" style={{ gap: 4 }}><span className="muted">From</span><input className="input" type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></label>
        <label className="col grow" style={{ gap: 4 }}><span className="muted">To</span><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="row">
        <label className="col grow" style={{ gap: 4 }}><span className="muted">Start time (optional)</span><input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="col grow" style={{ gap: 4 }}><span className="muted">Finish</span><input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <button className="btn big primary" onClick={save}>Add</button>
    </Sheet>
  );
}

/** Left/right swipe with a finger (ignores mostly-vertical scrolls). */
function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s0 = start.current;
      start.current = null;
      if (!s0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s0.x;
      const dy = t.clientY - s0.y;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}
