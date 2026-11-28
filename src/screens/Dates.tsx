import { useState } from 'react';
import { dayKey, describeDays, detectEvent, findDateSpans, parseDays, parseTimes, toIcs } from '../dates';
import { useStore } from '../store';
import type { Message } from '../types';
import { Icon, Sheet } from '../ui';

/** Message text with any dates underlined and tappable, the way Messages does it. */
export function WithDates({ text, onDate }: { text: string; onDate: (phrase: string) => void }) {
  const spans = findDateSpans(text);
  if (!spans.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  spans.forEach((sp, i) => {
    if (sp.start > at) parts.push(text.slice(at, sp.start));
    const phrase = text.slice(sp.start, sp.end);
    parts.push(
      <span
        key={i}
        role="button"
        onClick={(e) => {
          e.stopPropagation();
          onDate(phrase);
        }}
        style={{ textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}
      >
        {phrase}
      </span>,
    );
    at = sp.end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

const nice = (k: string, start?: string) => {
  const d = new Date(`${k}T${start ?? '00:00'}`);
  const day = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  return start ? `${day}, ${d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : day;
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Tap a date: add it to the family calendar (and optionally your phone), or turn the message into a lift or job. */
export function DateSheet({ m, cid, phrase, onClose, toast }: { m: Message; cid: string; phrase: string; onClose: () => void; toast: (s: string) => void }) {
  const s = useStore();
  const [phone, setPhone] = useState(false);
  const text = m.text ?? '';
  const days = parseDays(phrase).map(dayKey);
  const times = parseTimes(/\d\s*(am|pm)/i.test(phrase) && !/\b(at|from|@)\b/i.test(phrase) ? phrase.replace(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i, 'at $1') : phrase);
  const ev = detectEvent(text);
  const author = s.person(m.authorId);
  const short = text.replace(/\?$/, '').slice(0, 60);
  const title = ev?.title ?? short;
  const askLike = /\b(can (someone|anyone|you|u)|could (someone|you)|pick (me|us) up|drive me|lift|need a)\b/i.test(text);
  const liftLike = /\b(pick (me|us|him|her) up|drive|lift|drop (me|us|him|her))\b/i.test(text);

  const add = async () => {
    if (!days.length) return;
    const eventId = await s.addEvent({ personId: m.authorId, kind: ev?.kind ?? 'event', title, days, start: times.start, end: times.end, chatId: cid, msgId: m.id });
    await s.updateMessage(cid, m.id, { eventId });
    if (phone) download('shout-event.ics', toIcs(days.map((d) => ({ uid: `${eventId}-${d}`, day: d, title: `${author.name}: ${title}`, start: times.start, end: times.end }))));
    onClose();
  };

  const makeJob = (lift: boolean) => {
    const due = days.length ? new Date(`${days[0]}T${times.start ?? '09:00'}`).getTime() : undefined;
    s.startJob(short, [], due, { chatId: cid, msgId: m.id, lift, tokens: { when: phrase } });
    toast(lift ? 'Made it a lift' : 'Made it a job');
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <span className="muted" style={{ textAlign: 'center', fontSize: 13 }}>{days.length ? nice(days[0], times.start) + (days.length > 1 ? ` (${describeDays(days)})` : '') : phrase}</span>
      {m.eventId ? (
        <span style={{ textAlign: 'center' }}>Already on the calendar</span>
      ) : (
        <>
          <button className="btn ghost" style={{ justifyContent: 'flex-start', gap: 10 }} onClick={add}>
            <Icon name="calendar" size={18} /> Add to calendar
          </button>
          <label className="row" style={{ gap: 8, fontSize: 14, color: 'var(--text-2)', padding: '0 4px' }}>
            <input type="checkbox" checked={phone} onChange={(e) => setPhone(e.target.checked)} style={{ width: 18, height: 18 }} />
            Also add to my phone's calendar
          </label>
        </>
      )}
      {!m.cardId && askLike && (
        <button className="btn ghost" style={{ justifyContent: 'flex-start', gap: 10 }} onClick={() => makeJob(liftLike)}>
          <Icon name={liftLike ? 'car' : 'check'} size={18} /> {liftLike ? `Make it a lift` : 'Make it a job'}
        </button>
      )}
      <button className="btn ghost" style={{ justifyContent: 'flex-start', gap: 10 }} onClick={async () => { await navigator.clipboard?.writeText(phrase).catch(() => {}); toast('Copied'); onClose(); }}>
        <Icon name="copy" size={18} /> Copy
      </button>
      <button className="btn quiet" onClick={onClose}>Cancel</button>
    </Sheet>
  );
}
