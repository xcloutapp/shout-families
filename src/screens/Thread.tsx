import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { detect, detectLink, phraseKey } from '../intents';
import { DateSheet, WithDates } from './Dates';
import { BOTTLE_SHOP, SHOPS, SUPERMARKETS } from '../seed';
import { clock, timeLeft, useStore } from '../store';
import type { Card, Chat, DinnerCard, JobCard, Message, RunCard, Tokens } from '../types';
import { Avatar, Icon, Sheet, useToast } from '../ui';
import { ChatAvatar, PeopleSheet, chatTitle, chatTopic } from './Chats';
import { JobsSheet } from './Jobs';
import { ListInline, RunPlace, lateLabel, usePlaceFor } from './Takeaway';

type Store = ReturnType<typeof useStore>;

/* ---------- helpers ---------- */

/** "5:00" → today at 5pm (times before 8 are taken as afternoon/evening). */
export function dueFrom(when?: string): number | undefined {
  if (!when) return undefined;
  if (/now/i.test(when)) return Date.now() + 15 * 60000;
  const m = when.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return undefined;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (h < 8) h += 12;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() < Date.now() - 3600000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function nextTimes(): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  for (let i = 0; i < 3; i++) {
    let h = d.getHours() % 12;
    if (h === 0) h = 12;
    out.push(`${h}:${String(d.getMinutes()).padStart(2, '0')}`);
    d.setMinutes(d.getMinutes() + 30);
  }
  return out;
}

const DEFAULT_PLACES = ['school', 'work', 'the station', 'the shops'];

function baseSuggestions(s: Store, chat: Chat): string[] {
  const h = new Date().getHours();
  const kids = s.members.filter((p) => !p.adult && p.id !== s.me.id).map((p) => p.name);
  const pick = kids.length ? kids.map((k) => `Pick up ${k}`) : ['Can someone pick me up?'];
  const dinner = 'Getting dinner, what does everyone want?';
  const chores = ['Bring the washing in', 'Hang the washing out', 'Bins out', 'Clean the kitchen'];
  const learned = Object.entries(s.phrases)
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
    .slice(0, 4);
  const base = h >= 14 && h < 20 ? [dinner, ...pick, ...chores] : [...chores, dinner, ...pick];
  if (chat.kind === 'fun') return [];
  const seen = new Set<string>();
  return [...learned, ...base].filter((x) => {
    const k = phraseKey(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 8);
}

/* ---------- the thread ---------- */

export default function Thread() {
  const { cid = 'everyone' } = useParams();
  const s = useStore();
  const nav = useNavigate();
  const chat = s.chatById(cid);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [people, setPeople] = useState(false);
  const [jobs, setJobs] = useState(false);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    return onSnapshot(query(s.msgCol(cid), orderBy('createdAt', 'desc'), limit(150)), (q) =>
      setMsgs(q.docs.map((d) => ({ ...(d.data() as Message), id: d.id })).reverse()),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  // Stay at the newest message, including while photos and reel previews load in and grow the list,
  // unless you've scrolled up to read something.
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    stick.current = true;
  }, [cid]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const toBottom = () => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    };
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(toBottom);
    Array.from(el.children).forEach((c) => ro.observe(c));
    ro.observe(el);
    const mo = new MutationObserver(() => {
      Array.from(el.children).forEach((c) => ro.observe(c));
      toBottom();
    });
    mo.observe(el, { childList: true });
    // Images finishing loading don't always change layout size straight away.
    const onLoad = () => toBottom();
    el.addEventListener('load', onLoad, true);
    toBottom();
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('load', onLoad, true);
      ro.disconnect();
      mo.disconnect();
    };
  });
  useEffect(() => {
    if (msgs[msgs.length - 1]?.authorId === s.me.id) stick.current = true;
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs.length]);

  if (!chat) {
    return (
      <div className="screen">
        <button className="btn quiet" onClick={() => nav('/')}>← Chats</button>
        <span className="muted">Loading chat…</span>
      </div>
    );
  }

  const title = chatTitle(s, chat);
  const topic = chatTopic(chat);
  const openJobs = s.cards.filter((c) => c.kind === 'job' && c.status !== 'done' && (chat.everyone || c.chatId === chat.id)).length;
  const subtitle = [topic, openJobs ? `${openJobs} job${openJobs === 1 ? '' : 's'} open` : ''].filter(Boolean).join(' · ');

  // Fun chat: my hit rate this week.
  const weekAgo = Date.now() - 7 * 86400000;
  const myLinks = msgs.filter((m) => m.link && m.authorId === s.me.id && m.createdAt > weekAgo);
  const liked = myLinks.filter((m) => Object.values(m.reactions ?? {}).includes('good')).length;

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--top))' }}>
      {/* Floating header, Messages-style: the conversation scrolls up underneath it. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6, padding: '6px 12px 18px', display: 'flex', alignItems: 'flex-start', gap: 10, background: 'linear-gradient(var(--bg) 62%, rgba(0,0,0,0))', pointerEvents: 'none' }}>
        <button className="icon-btn" aria-label="Back to chats" style={{ pointerEvents: 'auto', marginTop: 8 }} onClick={() => nav('/')}><Icon name="back" size={18} stroke={2.5} /></button>
        <button className="col grow" onClick={() => setJobs(true)} style={{ pointerEvents: 'auto', gap: 4, minWidth: 0, background: 'none', border: 'none', padding: 0, alignItems: 'center', color: 'var(--text)' }}>
          <ChatAvatar people={chat.memberIds.filter((id) => id !== s.me.id).map(s.person)} size={46} />
          <span style={{ background: '#1f1f23', borderRadius: 999, padding: '4px 12px', fontSize: 14, fontWeight: 600, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title} <span style={{ color: '#8e8e96', fontWeight: 400 }}>›</span>
          </span>
          {subtitle && <span style={{ fontSize: 11, color: '#8e8e96' }}>{subtitle}</span>}
        </button>
        <button className="icon-btn" aria-label="Where's everyone" style={{ pointerEvents: 'auto', marginTop: 8 }} onClick={() => setPeople(true)}><Icon name="people" size={20} /></button>
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '128px 12px 6px', display: 'flex', flexDirection: 'column', gap: 8, overscrollBehavior: 'contain' }}>
        <div style={{ flex: '1 0 auto' }} />
      {chat.kind === 'fun' && myLinks.length > 0 && (
        <div style={{ padding: '8px 14px', fontSize: 13, color: 'var(--text-2)', background: '#16161b', borderRadius: 12, alignSelf: 'center' }}>
          This week, <b style={{ color: 'var(--text)' }}>{liked} of {myLinks.length}</b> of your reels got an "Actually good".
        </div>
      )}

        {msgs.length === 0 && (
          <div className="card flat" style={{ alignItems: 'center', textAlign: 'center', margin: '20px 0' }}>
            <b>{chat.kind === 'fun' ? 'Share reels, TikToks and photos here' : 'Say something to get started'}</b>
            <span className="muted">{chat.kind === 'fun' ? 'Everyone can tap Actually good or Not for me.' : 'Try a suggestion below, like "Getting dinner, what does everyone want?"'}</span>
          </div>
        )}
        {msgs.map((m, i) => (
          <Bubble key={m.id} m={m} prev={msgs[i - 1]} cid={cid} onHold={() => setActionsFor(m)} toast={toast.show} latestList={!!m.listShop && !msgs.slice(i + 1).some((x) => x.listShop === m.listShop)} latestCard={!!m.cardId && !msgs.slice(i + 1).some((x) => x.cardId === m.cardId)} chatKind={chat.kind} />
        ))}
        <div ref={endRef} />
      </div>

      <Composer chat={chat} toast={toast.show} />
      {people && <PeopleSheet onClose={() => setPeople(false)} />}
      {jobs && <JobsSheet chat={chat} onClose={() => setJobs(false)} toast={toast.show} />}
      {actionsFor && <QuickActions m={actionsFor} cid={cid} onClose={() => setActionsFor(null)} toast={toast.show} />}
      {toast.node}
    </div>
  );
}

/* ---------- a message ---------- */

function useLongPress(cb: () => void) {
  const t = useRef<number | undefined>(undefined);
  const start = () => {
    t.current = window.setTimeout(() => {
      navigator.vibrate?.(12);
      cb();
    }, 450);
  };
  const stop = () => window.clearTimeout(t.current);
  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerMove: stop,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      cb();
    },
  };
}

function Bubble({ m, prev, cid, onHold, toast, latestList, latestCard, chatKind }: { m: Message; prev?: Message; cid: string; onHold: () => void; toast: (s: string) => void; latestList?: boolean; latestCard?: boolean; chatKind?: Chat['kind'] }) {
  const s = useStore();
  const mine = m.authorId === s.me.id;
  const author = s.person(m.authorId);
  const card = m.cardId ? s.cards.find((c) => c.id === m.cardId) : undefined;
  const press = useLongPress(onHold);
  const showTime = !prev || m.createdAt - prev.createdAt > 30 * 60000;
  const showName = !mine && (!prev || prev.authorId !== m.authorId || showTime);
  const [editing, setEditing] = useState<keyof Tokens | null>(null);
  const replies = Object.entries(m.replies ?? {});
  const [open, setOpen] = useState(false);
  const [dateFor, setDateFor] = useState<string | null>(null);
  const finished = card ? cardFinished(card) : false;
  const showStrip = !!card && latestCard && (!finished || open);

  const undo = async () => {
    if (!card) return;
    await deleteDoc(doc(db, 'groups', s.group.id, 'cards', card.id));
    await s.clearCard(cid, m.id);
    toast('Turned back into a message');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
      {showTime && <div style={{ alignSelf: 'center', fontSize: 11, color: '#8a8a95', margin: '6px 0' }}>{new Date(m.createdAt).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>}
      {showName && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 36 }}>{author.name}</span>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: '86%', flexDirection: mine ? 'row-reverse' : 'row' }}>
        {!mine && <span style={{ visibility: showName ? 'visible' : 'hidden' }}><Avatar person={author} size={28} /></span>}
        <div className="col" style={{ gap: 6, alignItems: mine ? 'flex-end' : 'flex-start', minWidth: 0 }}>
          {(m.text || m.tokens) && (
            <div {...press} onClick={() => finished && setOpen((x) => !x)} style={{ userSelect: 'none', WebkitUserSelect: 'none', background: mine ? 'var(--imsg-blue)' : 'var(--imsg-grey)', color: mine ? '#fff' : 'var(--text)', borderRadius: mine ? '18px 18px 6px 18px' : '18px 18px 18px 6px', padding: '8px 13px', fontSize: 16, lineHeight: 1.3, fontWeight: 400, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', wordBreak: 'break-word' }}>
              <span>{chatKind !== 'fun' ? <WithDates text={m.text ?? ''} onDate={setDateFor} /> : m.text}</span>
              {(['who', 'where', 'when'] as const).map((k) =>
                m.tokens?.[k] ? (
                  <button key={k} onClick={() => mine && setEditing(k)} style={{ border: 'none', background: mine ? 'rgba(255,255,255,.22)' : '#3a3a3e', color: 'inherit', borderRadius: 8, padding: '2px 7px', fontWeight: 700, fontSize: 14, cursor: mine ? 'pointer' : 'default' }}>
                    {k === 'where' ? `at ${m.tokens[k]}` : k === 'when' ? `${m.tokens[k]}` : m.tokens[k]}
                  </button>
                ) : null,
              )}
            </div>
          )}
          {m.photoId && <Photo gid={s.group.id} id={m.photoId} press={press} />}
          {m.link && <div {...press}><LinkCard m={m} cid={cid} /></div>}
          {showStrip && <CardInline card={card!} toast={toast} />}
          {card && latestCard && finished && !open && <DoneCaption c={card} />}
          {m.eventId && <span style={{ fontSize: 12, color: '#8e8e96', display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}><span style={{ color: '#34c759', display: 'flex' }}><Icon name="calendar" size={12} /></span>On the calendar</span>}
          {m.listShop && <ListInline shop={m.listShop} latest={!!latestList} />}
          {m.note && !m.note.startsWith('Added to the calendar') && <span style={{ fontSize: 12, color: '#8e8e96', padding: '0 6px' }}>{m.note}</span>}
          {mine && card && Date.now() - m.createdAt < 10 * 60000 && card.status === 'open' && (
            <button className="btn quiet" style={{ minHeight: 22, padding: '0 6px', fontSize: 11, color: '#6f6f77' }} onClick={undo}>Not a {card.kind === 'job' ? ((card as JobCard).lift ? 'lift' : 'job') : card.kind}? Undo</button>
          )}
          {replies.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {replies.map(([pid, r]) => (
                <span key={pid} className="chip">{s.person(pid).name}: {r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {dateFor && <DateSheet m={m} cid={cid} phrase={dateFor} onClose={() => setDateFor(null)} toast={toast} />}
      {editing && (
        <Sheet onClose={() => setEditing(null)}>
          <h2 style={{ fontSize: 20 }}>Change {editing}</h2>
          <TokenOptions kind={editing} onPick={async (v) => {
            const tokens = { ...(m.tokens ?? {}), [editing]: v };
            await s.updateMessage(cid, m.id, { tokens });
            if (card && editing === 'when') s.updateCardFields(card.id, { due: dueFrom(v) });
            if (card && card.kind === 'job') s.updateCardFields(card.id, { tokens } as Partial<Card>);
            setEditing(null);
            toast('Updated for everyone');
          }} />
        </Sheet>
      )}
    </div>
  );
}

function Photo({ gid, id, press }: { gid: string; id: string; press: ReturnType<typeof useLongPress> }) {
  const [src, setSrc] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  useEffect(() => {
    getDoc(doc(db, 'groups', gid, 'photos', id)).then((d) => setSrc((d.data() as { data: string } | undefined)?.data ?? null));
  }, [gid, id]);
  if (!src) return <div style={{ width: 200, height: 150, borderRadius: 16, background: '#1b1b21' }} />;
  return (
    <>
      <img {...press} src={src} alt="Shared photo" onClick={() => setBig(true)} style={{ maxWidth: 240, maxHeight: 320, borderRadius: 16, display: 'block' }} />
      {big && (
        <div className="sheet-bg" style={{ alignItems: 'center' }} onClick={() => setBig(false)}>
          <img src={src} alt="Shared photo, full size" style={{ maxWidth: '100%', maxHeight: '90vh' }} />
        </div>
      )}
    </>
  );
}

const PLATFORM = {
  instagram: { label: 'Instagram', color: '#e1306c' },
  tiktok: { label: 'TikTok', color: '#25f4ee' },
  youtube: { label: 'YouTube', color: '#ff4e45' },
  web: { label: 'Link', color: 'var(--blue)' },
};

function LinkCard({ m, cid }: { m: Message; cid: string }) {
  const s = useStore();
  const p = PLATFORM[m.link!.platform];
  const mine = m.authorId === s.me.id;
  const r = m.reactions ?? {};
  const good = Object.entries(r).filter(([, v]) => v === 'good').map(([k]) => s.person(k).name);
  const nah = Object.entries(r).filter(([, v]) => v === 'nah').map(([k]) => s.person(k).name);
  const myR = r[s.me.id];
  let host = '';
  try {
    host = new URL(m.link!.url).hostname.replace(/^www\./, '');
  } catch {
    host = m.link!.url;
  }
  return (
    <div style={{ width: 260, background: '#1b1b21', borderRadius: 18, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <a href={m.link!.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)' }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: '#26262e', color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </span>
        <span className="col" style={{ gap: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>{p.label}</b>
          <span className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{host} · tap to watch</span>
        </span>
      </a>
      {mine ? (
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {good.length || nah.length ? (
            <>
              {good.length > 0 && <><b style={{ color: 'var(--green)' }}>Actually good:</b> {good.join(', ')} </>}
              {nah.length > 0 && <><b style={{ color: 'var(--muted)' }}>Not for me:</b> {nah.join(', ')}</>}
            </>
          ) : (
            'No reactions yet'
          )}
        </span>
      ) : (
        <div className="row" style={{ gap: 6 }}>
          <button className={`pill grow ${myR === 'good' ? 'on' : ''}`} style={{ minHeight: 36, fontSize: 13 }} onClick={() => s.react(cid, m.id, myR === 'good' ? null : 'good')}>Actually good</button>
          <button className={`pill grow ${myR === 'nah' ? 'on' : ''}`} style={{ minHeight: 36, fontSize: 13 }} onClick={() => s.react(cid, m.id, myR === 'nah' ? null : 'nah')}>Not for me</button>
        </div>
      )}
    </div>
  );
}

/* ---------- cards shown inside the chat ---------- */

const STRIP: React.CSSProperties = { width: 260, maxWidth: '100%', background: '#1b1b20', borderRadius: 14, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, boxSizing: 'border-box' };
const SBTN: React.CSSProperties = { minHeight: 32, fontSize: 13, borderRadius: 10, padding: '0 10px' };
const hm = (t?: number) => (t ? clock(t) : '');

/** Is this card finished (its strip hides until the message is tapped)? */
export function cardFinished(c: Card): boolean {
  if (c.status === 'done') return true;
  if (c.kind === 'dinner') return Date.now() - c.createdAt > 12 * 3600000;
  if (c.kind === 'run') return c.orderedAt ? Date.now() - c.orderedAt > 6 * 3600000 : Date.now() - c.createdAt > 12 * 3600000;
  return false;
}

/** One small grey line under a message once its card is finished. */
export function DoneCaption({ c }: { c: Card }) {
  const s = useStore();
  const tick = <Icon name="check" size={11} stroke={3} />;
  let text = '';
  if (c.kind === 'job') text = `Done by ${c.claimedBy === s.me.id ? 'you' : s.person(c.claimedBy ?? c.createdBy).name}${c.doneAt ? ` · ${hm(c.doneAt)}` : ''}`;
  else if (c.kind === 'run') text = `${c.stops.filter((x) => x.approved).map((x) => x.shop).join(' + ')} run · ${c.orders.length} order${c.orders.length === 1 ? '' : 's'} · ${c.status === 'done' ? 'finished' : c.orderedAt ? 'ordered' : 'closed'}`;
  else text = 'Dinner sorted';
  return (
    <span style={{ fontSize: 12, color: '#8e8e96', display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
      <span style={{ color: '#34c759', display: 'flex' }}>{tick}</span>{text}
    </span>
  );
}

function CardInline({ card: c, toast }: { card: Card; toast: (s: string) => void }) {
  const s = useStore();
  const nav = useNavigate();

  if (c.kind === 'run') return <RunInline c={c} toast={toast} />;

  if (c.kind === 'dinner') {
    const d = c as DinnerCard;
    const yes = Object.values(d.home).filter((v) => v === 'yes').length;
    const no = Object.values(d.home).filter((v) => v === 'no').length;
    const mineAns = d.home[s.me.id];
    return (
      <div style={STRIP}>
        <span style={{ fontSize: 12, color: '#8e8e96' }}>{yes} home · {no} out · {Math.max(0, d.forIds.length - yes - no)} waiting</span>
        <div className="row" style={{ gap: 6 }}>
          <button className={`btn grow ${mineAns ? (mineAns === 'yes' ? 'green' : 'ghost') : 'primary'}`} style={SBTN} onClick={() => s.answerHome(c.id, 'yes')}>I'm home</button>
          <button className={`btn grow ${mineAns === 'no' ? 'light' : 'ghost'}`} style={SBTN} onClick={() => s.answerHome(c.id, 'no')}>Not tonight</button>
        </div>
        <button className="btn quiet" style={{ minHeight: 24, padding: 0, fontSize: 12, alignSelf: 'flex-start' }} onClick={() => nav(`/card/${c.id}`)}>Vote on what to eat ›</button>
      </div>
    );
  }

  const j = c as JobCard;
  const forMe = j.forIds.includes(s.me.id) || j.forIds.length === 0 || j.forIds.length > 1;
  const askedRecently = !!j.askedAt && Date.now() - j.askedAt < 10 * 60000;
  if (j.claimedBy) {
    const claimer = s.person(j.claimedBy);
    const mineJob = j.claimedBy === s.me.id;
    return (
      <div style={{ ...STRIP, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar person={claimer} size={22} />
        <span className="grow" style={{ fontSize: 13 }}>{mineJob ? "You're on it" : `${claimer.name} is on it`}</span>
        {mineJob ? (
          <button className="btn primary" style={SBTN} onClick={() => s.doneCard(c.id, true)}>Done</button>
        ) : (
          <span style={{ fontSize: 12, color: '#8e8e96' }}>{hm(j.claimedAt)}</span>
        )}
      </div>
    );
  }
  const waitingOn = j.forIds.length === 1 ? ` · for ${j.forIds[0] === s.me.id ? 'you' : s.person(j.forIds[0]).name}` : '';
  const due = j.due ? ` · by ${clock(j.due)}` : '';
  return (
    <div style={STRIP}>
      <span style={{ fontSize: 12, color: '#8e8e96' }}>Not picked up yet{waitingOn}{due}</span>
      <div className="row" style={{ gap: 6 }}>
        {forMe && j.createdBy !== s.me.id && (
          <>
            <button className="btn primary grow" style={SBTN} onClick={() => s.claim(c.id)}>I'll do it</button>
            {!j.notMe.includes(s.me.id) && <button className="btn ghost grow" style={SBTN} onClick={() => s.notMe(c.id)}>Can't</button>}
          </>
        )}
        <button className="btn ghost grow" style={SBTN} disabled={askedRecently} onClick={async () => { await s.askAgain(c.id); toast('Asked again'); }}>
          {askedRecently ? `Asked again ${hm(j.askedAt)}` : 'Ask again'}
        </button>
      </div>
      {j.notMe.length > 0 && <span style={{ fontSize: 12, color: '#8e8e96' }}>Can't: {j.notMe.map((id) => s.person(id).name).join(', ')}</span>}
    </div>
  );
}

function RunInline({ c, toast }: { c: RunCard; toast: (s: string) => void }) {
  const s = useStore();
  const nav = useNavigate();
  const shops = c.stops.filter((x) => x.approved).map((x) => x.shop).join(' + ');
  const answered = new Set([...c.orders.map((o) => o.personId), ...c.notMe]);
  const waiting = c.forIds.filter((id) => !answered.has(id) && id !== c.createdBy).map((id) => s.person(id).name);
  const mineBuyer = c.createdBy === s.me.id;
  const done = c.status === 'done';
  const pending = c.stops.filter((x) => !x.approved);
  const placeFor = usePlaceFor(c);
  const approved = c.stops.filter((x) => x.approved);
  // With one place, Call (buyer) or Menu (everyone else) sits on the button row. With several, they're on the list.
  const callPlace = approved.length === 1 ? placeFor(approved[0].shop, 0) : undefined;
  useGuestOrders(c, mineBuyer);

  const share = async () => {
    const url = await s.shareRun(c.id);
    const text = `${s.person(c.createdBy).name}'s going to ${shops}. Add your order:`;
    try {
      if (navigator.share) await navigator.share({ title: 'Shout run', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast('Link copied. Paste it into any chat');
      }
    } catch {
      /* cancelled */
    }
  };

  const orderedNames = (() => {
    const shown = c.orders.slice(0, 3);
    return shown;
  })();
  const isShop = approved.some((x) => SUPERMARKETS.includes(x.shop));
  const status = c.orderedAt
    ? `Ordered ${hm(c.orderedAt)}`
    : c.locked
      ? 'Locked in'
      : timeLeft(c.due) === 'closed'
        ? 'Orders closed'
        : `closes ${c.due ? clock(c.due) : ''}`;
  const answeredMe = answered.has(s.me.id);

  return (
    <div style={STRIP}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
        <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="bag" size={16} /></span>
        {approved.map((x, i) => placeFor(x.shop, i)?.name ?? x.shop).join(' + ')}
      </span>
      <span style={{ fontSize: 12, color: '#8e8e96', marginTop: -3 }}>
        {c.orders.length} order{c.orders.length === 1 ? '' : 's'} · {status}
      </span>
      <RunPlace c={c} mode="card" />
      {orderedNames.map((o) => (
        <div key={o.id} className="row" style={{ gap: 6 }}>
          <span className="grow" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {o.text} <span style={{ color: '#8e8e96' }}>· {o.personId === s.me.id ? 'you' : s.person(o.personId).name}</span>
          </span>
          {lateLabel(c, o.at) && <span style={{ fontSize: 11, color: '#ff8a7a', fontWeight: 700 }}>late</span>}
        </div>
      ))}
      {c.orders.length > 3 && <span style={{ fontSize: 12, color: '#8e8e96' }}>+{c.orders.length - 3} more</span>}
      {!c.locked && waiting.length > 0 && <span style={{ fontSize: 12, color: '#8e8e96' }}>Waiting on {waiting.join(', ')}</span>}
      {mineBuyer && pending.map((p) => (
        <div key={p.shop} className="col" style={{ gap: 6 }}>
          <span style={{ fontSize: 13 }}>{s.person(p.addedBy).name} wants {p.shop} too</span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary grow" style={SBTN} onClick={() => s.answerStop(c.id, p.shop, true)}>Add it</button>
            <button className="btn ghost grow" style={SBTN} onClick={() => s.answerStop(c.id, p.shop, false)}>No</button>
          </div>
        </div>
      ))}
      {!done && (
        <div className="row" style={{ gap: 6 }}>
          {mineBuyer ? (
            c.orderedAt ? (
              <button className="btn ghost grow" style={SBTN} onClick={() => nav(`/card/${c.id}`)}>Add costs</button>
            ) : (
              <button className="btn primary grow" style={SBTN} onClick={() => nav(`/order/${c.id}`)}>{isShop ? 'Start shopping' : 'Start ordering'}</button>
            )
          ) : (
            !c.locked && (
              <>
                <button className={`btn grow ${answeredMe ? 'ghost' : 'primary'}`} style={SBTN} onClick={() => nav(`/card/${c.id}`)}>{c.orders.some((o) => o.personId === s.me.id) ? 'Change mine' : 'Add mine'}</button>
                {!answeredMe && <button className="btn ghost" style={SBTN} onClick={() => s.notMe(c.id)}>Not me</button>}
              </>
            )
          )}
          {callPlace && !mineBuyer && callPlace.menuUrl && (
            <a className="btn ghost" style={{ ...SBTN, textDecoration: 'none' }} href={callPlace.menuUrl} target="_blank" rel="noreferrer">Menu</a>
          )}
          {!c.locked && (
            <button className="btn ghost" aria-label="Share link to another chat" style={{ ...SBTN, width: 36, padding: 0 }} onClick={share}><Icon name="share" size={15} /></button>
          )}
        </div>
      )}
    </div>
  );
}

/** The buyer's phone pulls in orders people added from a shared link without the app. */
function useGuestOrders(c: RunCard, active: boolean) {
  const s = useStore();
  useEffect(() => {
    if (!active || !c.shareToken || c.locked) return;
    const token = c.shareToken;
    const col = query(s.guestCol(token));
    return onSnapshot(col, async (q) => {
      for (const d of q.docs) {
        const g = d.data() as { name: string; text: string };
        const member = s.members.find((p) => p.name.toLowerCase() === g.name.toLowerCase());
        await s.addOrderFor(c.id, member ? member.id : `guest:${g.name}`, c.stops[0].shop, g.text);
        await deleteDoc(d.ref);
      }
    }, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, c.shareToken, c.locked]);
}

/* ---------- press-and-hold quick actions ---------- */

function QuickActions({ m, cid, onClose, toast }: { m: Message; cid: string; onClose: () => void; toast: (s: string) => void }) {
  const s = useStore();
  const card = m.cardId ? s.cards.find((c) => c.id === m.cardId) : undefined;
  const author = s.person(m.authorId);
  const chat = s.chatById(cid)!;
  const reply = (t: string) => {
    s.quickReply(cid, m.id, t);
    onClose();
  };
  const gotIt = () => {
    if (card && card.kind === 'job') s.claim(card.id);
    else if (!card && m.text) {
      s.startJob(m.text, chat.memberIds.filter((id) => id !== m.authorId), undefined, { chatId: cid, msgId: m.id, claim: true });
    }
    s.quickReply(cid, m.id, "I've got it");
    toast(`Told ${author.name} you've got it`);
    onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <div style={{ background: '#26262e', borderRadius: 16, padding: '10px 14px', fontSize: 15 }}>{m.text ?? 'Message'}</div>
      <div className="col" style={{ gap: 8 }}>
        {m.authorId !== s.me.id && (!card || card.kind === 'job') && <button className="btn big primary" style={{ background: 'var(--purple)', color: '#16132b' }} onClick={gotIt}>I've got it</button>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {['On my way', '5 mins', 'After dinner', 'Not me', 'Thanks!'].map((t) => (
            <button key={t} className="pill" onClick={() => reply(t)}>{t}</button>
          ))}
        </div>
      </div>
      {m.authorId === s.me.id && (
        <button className="btn ghost" style={{ color: '#ff8a80', borderColor: '#4a2a2a' }} onClick={async () => {
          await s.deleteMessage(cid, m);
          toast('Message deleted');
          onClose();
        }}>Delete message</button>
      )}
      <button className="btn quiet" onClick={onClose}>Close</button>
    </Sheet>
  );
}

/* ---------- the composer ---------- */

function TokenOptions({ kind, onPick }: { kind: keyof Tokens; onPick: (v: string) => void }) {
  const s = useStore();
  const [custom, setCustom] = useState('');
  const opts = kind === 'when' ? ['Now', ...nextTimes()] : kind === 'where' ? [...new Set([...s.places, ...DEFAULT_PLACES])].slice(0, 6) : s.members.filter((p) => p.id !== s.me.id).map((p) => p.name);
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {opts.map((o) => (
          <button key={o} className="pill" onClick={() => onPick(o)}>{o}</button>
        ))}
      </div>
      <div className="row">
        <input className="input" type={kind === 'when' ? 'time' : 'text'} placeholder={kind === 'where' ? 'Somewhere else' : kind === 'who' ? 'Someone else' : ''} value={custom} onChange={(e) => setCustom(e.target.value)} style={{ minHeight: 42 }} />
        <button className="btn ghost" disabled={!custom.trim()} onClick={() => {
          let v = custom.trim();
          if (kind === 'when') {
            const [h, mm] = v.split(':').map(Number);
            v = `${h % 12 || 12}:${String(mm).padStart(2, '0')}`;
          }
          if (kind === 'where') s.learnPlace(v);
          onPick(v);
        }}>Add</button>
      </div>
    </div>
  );
}

function Composer({ chat, toast }: { chat: Chat; toast: (s: string) => void }) {
  const s = useStore();
  const nav = useNavigate();
  const [text, setText] = useState(() => {
    try {
      const shared = sessionStorage.getItem('shout-shared');
      if (shared && chat.kind === 'fun') {
        sessionStorage.removeItem('shout-shared');
        return shared;
      }
    } catch {
      /* ignore */
    }
    return '';
  });
  const [tokens, setTokens] = useState<Tokens>({});
  const [picked, setPicked] = useState(false);
  const [adding, setAdding] = useState<keyof Tokens | null>(null);
  const [plus, setPlus] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cid = chat.id;

  const openRun = useMemo(
    () => s.cards.find((c): c is RunCard => c.kind === 'run' && c.chatId === cid && !c.locked && c.status !== 'done'),
    [s.cards, cid],
  );
  const suggestions = useMemo(() => baseSuggestions(s, chat), [s, chat]);
  const runCovers = openRun
    ? openRun.stops.flatMap((x) => [x.shop, s.takeaways.find((p) => p.name.toLowerCase() === x.shop.toLowerCase())?.cuisine ?? ''].filter(Boolean))
    : [];
  const intent = text.trim() ? detect(text, s.members, { runOpen: !!openRun, places: s.takeaways, runCovers }) : null;
  const orderOffer = openRun && openRun.createdBy !== s.me.id && text.trim() && !intent && !detectLink(text) && !/\?$/.test(text.trim()) && text.trim().length > 2;
  const stopOffer = openRun && intent?.kind === 'stop' && openRun.createdBy !== s.me.id;
  const under18 = chat.memberIds.some((id) => !s.person(id).adult);

  const reset = () => {
    setText('');
    setTokens({});
    setPicked(false);
    setAdding(null);
  };

  const send = async (opts?: { asOrder?: boolean; asStop?: boolean }) => {
    const t = text.trim();
    if (!t && !tokens.when && !tokens.where) return;
    const link = detectLink(t);
    reset();

    if (link) {
      const target = chat.kind === 'fun' ? cid : 'fun';
      await s.sendMessage(target, { text: t.replace(link.url, '').trim() || undefined, link });
      if (target !== cid) toast('Sent to the Fun chat');
      return;
    }
    if (opts?.asOrder && openRun) {
      s.addOrder(openRun.id, openRun.stops[0].shop, t);
      await s.sendMessage(cid, { text: t, note: `Added to ${s.person(openRun.createdBy).name}'s ${openRun.stops[0].shop} run` });
      return;
    }
    if (opts?.asStop && openRun && intent?.kind === 'stop') {
      s.askStop(openRun.id, intent.shop);
      await s.sendMessage(cid, { text: t, note: `Asked ${s.person(openRun.createdBy).name} to add a ${intent.shop} stop` });
      return;
    }

    if (intent?.kind === 'list') {
      const where = await s.addToList(intent.shop, intent.items);
      const label = intent.shop === 'Groceries' ? 'shopping list' : `${intent.shop} list`;
      if (where === 'run') {
        await s.sendMessage(cid, { text: t, note: `Added to the ${intent.shop === 'Groceries' ? '' : `${intent.shop} `}run that's on now` });
      } else {
        await s.sendMessage(cid, { text: t, listShop: intent.shop, note: `Added to the ${label}: ${intent.items.join(', ')}` });
      }
      return;
    }

    const hasTokens = Object.keys(tokens).length > 0;
    s.learnPhrase(t);
    const msgId = await s.sendMessage(cid, { text: t, tokens: hasTokens ? tokens : undefined });
    // Dates aren't added automatically any more: they're underlined, and a tap offers Add to calendar.
    if (!intent) return;
    const others = chat.memberIds.filter((id) => id !== s.me.id);
    if (intent.kind === 'run') {
      if (intent.shop === BOTTLE_SHOP && under18) {
        await s.updateMessage(cid, msgId, { note: "Bottle shop runs can't include under-18s. Start a chat without them." });
        return;
      }
      const waiting = s.lists.filter((l) => l.items.length && (l.shop === intent.shop || (l.shop === 'Groceries' && SUPERMARKETS.includes(intent.shop))));
      s.startRun(intent.shop, chat.memberIds, Date.now() + 20 * 60000, cid, msgId, intent.placeId);
      const n = waiting.reduce((a, l) => a + l.items.length, 0);
      if (n) toast(`Added ${n} thing${n > 1 ? 's' : ''} from the shopping list`);
    } else if (intent.kind === 'job') {
      s.startJob(intent.title, others, dueFrom(tokens.when), { chatId: cid, msgId, assignee: intent.assignee, tokens: hasTokens ? tokens : undefined });
    } else if (intent.kind === 'lift') {
      s.startJob(intent.title, others, dueFrom(tokens.when), { chatId: cid, msgId, lift: true, tokens: hasTokens ? tokens : undefined });
    } else if (intent.kind === 'dinner') {
      s.startDinner(chat.memberIds, [], cid, msgId);
    }
  };

  const showChips = false;

  return (
    <div style={{ background: 'var(--bg)', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
      {orderOffer && (
        <OfferBar icon="bag" text={<>Add this to <b>{s.person(openRun.createdBy).name}'s {openRun.stops[0].shop} run</b>?</>} yes="Add as my order" onYes={() => send({ asOrder: true })} onNo={() => send()} />
      )}
      {stopOffer && intent?.kind === 'stop' && (
        <OfferBar icon="pin" text={<>Ask {s.person(openRun!.createdBy).name} to add a <b>{intent.shop}</b> stop?</>} yes="Ask" onYes={() => send({ asStop: true })} onNo={() => send()} />
      )}
      {openRun && openRun.createdBy !== s.me.id && !text && (s.state.usuals[s.me.id]?.[openRun.stops[0].shop]?.length ?? 0) > 0 && !openRun.orders.some((o) => o.personId === s.me.id) && (
        <div className="row" style={{ padding: '8px 12px 0', gap: 6, overflowX: 'auto' }}>
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>Your usual:</span>
          {s.state.usuals[s.me.id][openRun.stops[0].shop].slice(0, 2).map((u) => (
            <button key={u} className="pill" style={{ whiteSpace: 'nowrap', minHeight: 34, fontSize: 13 }} onClick={() => setText(u)}>{u}</button>
          ))}
        </div>
      )}

      {chat.kind === 'fun' && !text && (
        <div className="row" style={{ padding: '8px 12px 0', gap: 6 }}>
          <button className="pill" style={{ minHeight: 34, fontSize: 13, background: '#1b1b21' }} onClick={async () => {
            try {
              const clip = await navigator.clipboard.readText();
              if (detectLink(clip)) setText(clip.trim());
              else toast('Copy a link first: in Instagram tap Share, then Copy link');
            } catch {
              toast('Tap and hold the text box, then Paste');
            }
          }}>Paste the link you copied</button>
        </div>
      )}
      {showChips && (
        <div className="row" style={{ padding: '8px 12px 0', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {suggestions.map((x) => (
            <button key={x} className="pill" style={{ whiteSpace: 'nowrap', minHeight: 34, fontSize: 13, background: '#1b1b21' }} onClick={() => { setText(x); setPicked(true); }}>{x}</button>
          ))}
        </div>
      )}

      {picked && text && (
        <div className="col" style={{ padding: '8px 12px 0', gap: 8 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {(['who', 'where', 'when'] as const).map((k) => (
              <button key={k} className={`pill ${adding === k ? 'on' : ''}`} style={{ minHeight: 34, fontSize: 13 }} onClick={() => setAdding(adding === k ? null : k)}>
                {tokens[k] ? `${k === 'who' ? 'Who' : k === 'where' ? 'Where' : 'When'}: ${tokens[k]}` : `+ ${k === 'who' ? 'Who' : k === 'where' ? 'Where' : 'When'}`}
              </button>
            ))}
            <span className="muted" style={{ alignSelf: 'center' }}>all optional</span>
          </div>
          {adding && <TokenOptions kind={adding} onPick={(v) => { setTokens({ ...tokens, [adding]: v }); setAdding(null); }} />}
        </div>
      )}

      <div className="row" style={{ padding: '8px 12px 10px', gap: 8 }}>
        <button className="icon-btn" aria-label="More" style={{ width: 40, height: 40 }} onClick={() => setPlus(true)}><Icon name="plus" size={20} stroke={2.4} /></button>
        <div style={{ flex: 1, minHeight: 40, borderRadius: 20, border: `1px solid ${text ? 'var(--accent)' : 'var(--line)'}`, background: '#16161b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '4px 6px 4px 14px' }}>
          <input aria-label="Message" value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setPicked(false); }} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder={`Message ${chat.name ?? ''}`.trim()} style={{ flex: 1, minWidth: 120, border: 'none', background: 'none', fontSize: 16, minHeight: 30, outline: 'none' }} />
          {(['who', 'where', 'when'] as const).map((k) => tokens[k] ? <span key={k} style={{ background: k === 'when' ? 'var(--accent)' : '#26262e', color: k === 'when' ? 'var(--accent-ink)' : 'var(--text)', borderRadius: 8, padding: '1px 6px', fontSize: 13, fontWeight: 700 }}>{tokens[k]}</span> : null)}
        </div>
        {text.trim() ? (
          <button className="icon-btn" aria-label="Send" style={{ width: 40, height: 40, background: 'var(--imsg-blue)', color: '#fff' }} onClick={() => send()}><Icon name="send" size={18} stroke={2.6} /></button>
        ) : (
          <button className="icon-btn" aria-label="Send a photo" style={{ width: 40, height: 40 }} onClick={() => fileRef.current?.click()}><Icon name="camera" size={20} /></button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          toast('Sending photo…');
          await s.uploadPhoto(cid, f).catch(() => toast('That photo didn’t send. Try a smaller one.'));
        }} />
      </div>

      {plus && (
        <Sheet onClose={() => setPlus(false)}>
          {suggestions.length > 0 && (
            <>
              <div className="label">Quick messages</div>
              <div className="col" style={{ gap: 6 }}>
                {suggestions.slice(0, 6).map((x) => (
                  <button key={x} className="pill" style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 40, fontSize: 14, background: '#1b1b21' }} onClick={() => { setText(x); setPicked(true); setPlus(false); }}>{x}</button>
                ))}
              </div>
            </>
          )}
          <div className="label">I'm going to…</div>
          <div className="shop-grid">
            {SHOPS.filter((x) => x !== 'Other' && (x !== BOTTLE_SHOP || (s.me.adult && !under18))).map((x) => (
              <button key={x} className="shop" onClick={() => { s.startRun(x, chat.memberIds, Date.now() + 20 * 60000, cid); setPlus(false); }}>{x}</button>
            ))}
          </div>
          <div className="row">
            <button className="btn ghost grow" onClick={() => { s.startDinner(chat.memberIds, [], cid); setPlus(false); }}>Who's home for dinner?</button>
            <button className="btn ghost grow" onClick={() => { setPlus(false); fileRef.current?.click(); }}>Photo</button>
          </div>
          <button className="btn ghost" onClick={() => { setPlus(false); nav('/new/shout'); }}>Log a shout</button>
          <span className="muted">Tip: you can also just type "Going to GYG" in the chat.</span>
        </Sheet>
      )}
    </div>
  );
}

function OfferBar({ icon, text, yes, onYes, onNo }: { icon: string; text: React.ReactNode; yes: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="col" style={{ padding: '10px 12px 0', gap: 8 }}>
      <div className="row" style={{ gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 10, background: '#2a1a12', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={17} /></span>
        <span style={{ fontSize: 14 }}>{text}</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary grow" style={{ minHeight: 40, fontSize: 14 }} onClick={onYes}>{yes}</button>
        <button className="btn ghost" style={{ minHeight: 40, fontSize: 14 }} onClick={onNo}>Just send</button>
      </div>
    </div>
  );
}

