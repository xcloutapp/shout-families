import { useState } from 'react';
import { clock, useStore } from '../store';
import type { Chat, JobCard } from '../types';
import { Avatar, Icon, Sheet } from '../ui';

const day = (t?: number) => (t ? new Date(t).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

/** Tap the chat name: what's not picked up, who's on what, and the done archive. */
export function JobsSheet({ chat, onClose, toast }: { chat: Chat; onClose: () => void; toast: (s: string) => void }) {
  const s = useStore();
  const [archive, setArchive] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const all = s.cards.filter((c): c is JobCard => c.kind === 'job' && (chat.everyone || c.chatId === chat.id));
  const waiting = all.filter((j) => j.status !== 'done' && !j.claimedBy);
  const onIt = all.filter((j) => j.status !== 'done' && j.claimedBy);
  const done = all.filter((j) => j.status === 'done').sort((a, b) => (b.doneAt ?? b.createdAt) - (a.doneAt ?? a.createdAt));

  if (archive) {
    const people = [...new Set(done.map((j) => j.claimedBy).filter(Boolean))] as string[];
    const list = who ? done.filter((j) => j.claimedBy === who) : done;
    return (
      <Sheet onClose={onClose}>
        <div className="between">
          <button className="btn quiet" style={{ padding: 0, minHeight: 30 }} onClick={() => setArchive(false)}>‹ Jobs</button>
          <b>Done jobs</b>
          <span style={{ width: 50 }} />
        </div>
        {people.length > 1 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className={`chip ${!who ? 'on' : ''}`} style={!who ? { background: 'var(--text)', color: '#000' } : undefined} onClick={() => setWho(null)}>Everyone</button>
            {people.map((p) => (
              <button key={p} className="chip" style={who === p ? { background: 'var(--text)', color: '#000' } : undefined} onClick={() => setWho(p)}>{p === s.me.id ? 'You' : s.person(p).name}</button>
            ))}
          </div>
        )}
        {list.length === 0 && <span className="muted">Nothing done yet.</span>}
        <div className="col" style={{ gap: 0 }}>
          {list.map((j) => (
            <div key={j.id} className="row" style={{ gap: 10, padding: '10px 0', borderBottom: '0.5px solid #2a2a2e' }}>
              <span style={{ color: '#34c759', display: 'flex' }}><Icon name="check" size={16} stroke={2.6} /></span>
              <span className="grow" style={{ fontSize: 15 }}>{j.title}</span>
              <span style={{ fontSize: 12, color: '#8e8e96', textAlign: 'right' }}>
                {j.claimedBy === s.me.id ? 'You' : s.person(j.claimedBy ?? j.createdBy).name}
                <br />
                {day(j.doneAt ?? j.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <h2 style={{ fontSize: 20, margin: 0 }}>Jobs</h2>
      <span style={{ fontSize: 12, color: 'var(--accent)' }}>Not picked up · {waiting.length}</span>
      {waiting.length === 0 && <span className="muted" style={{ fontSize: 14 }}>Nothing waiting.</span>}
      {waiting.map((j) => {
        const recent = !!j.askedAt && Date.now() - j.askedAt < 10 * 60000;
        return (
          <div key={j.id} className="row" style={{ gap: 10, padding: '6px 0', borderBottom: '0.5px solid #2a2a2e' }}>
            <span style={{ width: 16, height: 16, borderRadius: 8, border: '1.5px solid var(--accent)', flexShrink: 0 }} />
            <span className="col grow" style={{ gap: 0 }}>
              <span style={{ fontSize: 15 }}>{j.title}</span>
              <span style={{ fontSize: 12, color: '#8e8e96' }}>{j.createdBy === s.me.id ? 'You' : s.person(j.createdBy).name} asked{j.due ? ` · by ${clock(j.due)}` : ''}</span>
            </span>
            {j.createdBy !== s.me.id && <button className="btn primary" style={{ minHeight: 32, fontSize: 13 }} onClick={() => s.claim(j.id)}>I'll do it</button>}
            <button className="btn ghost" style={{ minHeight: 32, fontSize: 13 }} disabled={recent} onClick={async () => { await s.askAgain(j.id); toast('Asked again'); }}>{recent ? 'Asked' : 'Ask again'}</button>
          </div>
        );
      })}
      <span style={{ fontSize: 12, color: '#8e8e96', marginTop: 8 }}>On it · {onIt.length}</span>
      {onIt.length === 0 && <span className="muted" style={{ fontSize: 14 }}>Nobody's on anything right now.</span>}
      {onIt.map((j) => (
        <div key={j.id} className="row" style={{ gap: 10, padding: '6px 0', borderBottom: '0.5px solid #2a2a2e' }}>
          <Avatar person={s.person(j.claimedBy!)} size={22} />
          <span className="col grow" style={{ gap: 0 }}>
            <span style={{ fontSize: 15 }}>{j.title}</span>
            <span style={{ fontSize: 12, color: '#8e8e96' }}>{j.claimedBy === s.me.id ? 'You' : s.person(j.claimedBy!).name}{j.claimedAt ? ` · since ${clock(j.claimedAt)}` : ''}</span>
          </span>
          {j.claimedBy === s.me.id && <button className="btn primary" style={{ minHeight: 32, fontSize: 13 }} onClick={() => s.doneCard(j.id, true)}>Done</button>}
        </div>
      ))}
      <button className="btn quiet" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setArchive(true)}>Done jobs ({done.length}) ›</button>
    </Sheet>
  );
}
