import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clock, createGroup, joinGroup, logOut, money, moneyBalances, switchGroup, useSession, useStore } from '../store';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { GroupType } from '../types';
import { Profile } from './Setup';
import { Avatar, Sheet, useToast } from '../ui';

export function Balances() {
  const s = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [settle, setSettle] = useState(false);
  const bal = moneyBalances(s.ledger, s.me.id);
  const owed = Object.values(bal).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const owe = -Object.values(bal).filter((v) => v < 0).reduce((a, b) => a + b, 0);
  const favours = s.ledger.filter((e) => !e.settled && e.favour && (e.owerId === s.me.id || e.owedId === s.me.id));
  const others = s.members.filter((p) => p.id !== s.me.id);
  const recent = [...s.ledger].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const toSettle = others.filter((p) => Math.abs(bal[p.id] ?? 0) > 0.004);

  return (
    <>
      <div className="screen with-tabs">
        <h1 style={{ fontSize: 26 }}>Balances</h1>
        <div className="card" style={{ gap: 4 }}>
          <span className="muted">Across {s.group.name}</span>
          {owed >= owe ? (
            <span className="display" style={{ fontSize: 40, color: 'var(--green)' }}>{money(owed - owe)} <span style={{ fontSize: 16, color: 'var(--text-2)' }}>owed to you</span></span>
          ) : (
            <span className="display" style={{ fontSize: 40, color: 'var(--yellow)' }}>{money(owe - owed)} <span style={{ fontSize: 16, color: 'var(--text-2)' }}>you owe</span></span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{favours.length} favour{favours.length === 1 ? '' : 's'} on the books</span>
        </div>

        <div className="card" style={{ paddingTop: 4, paddingBottom: 4, gap: 0 }}>
          {others.map((p, i) => {
            const v = bal[p.id] ?? 0;
            const fav = favours.filter((f) => f.owerId === p.id || f.owedId === p.id);
            return (
              <div key={p.id} className="row" style={{ padding: '12px 0', borderTop: i ? '1px solid var(--chip)' : 'none' }}>
                <Avatar person={p} size={38} />
                <span className="col grow" style={{ gap: 2 }}>
                  <b>{p.name}</b>
                  <span className="muted">
                    {fav.length ? fav.map((f) => (f.owerId === s.me.id ? `You owe: ${f.what}` : `Owes you: ${f.what}`)).join(' · ') : !p.adult ? 'Under 18 · balance only' : ''}
                  </span>
                </span>
                <b style={{ color: v > 0 ? 'var(--green)' : v < 0 ? 'var(--yellow)' : 'var(--muted)' }}>
                  {v > 0 ? `owes ${money(v)}` : v < 0 ? `you owe ${money(v)}` : '$0'}
                </b>
              </div>
            );
          })}
        </div>

        {favours.filter((f) => f.owerId === s.me.id).map((f) => (
          <button key={f.id} className="card flat" style={{ border: 'none', textAlign: 'left' }} onClick={() => { s.returnFavour(f.id); toast.show('Favour returned'); }}>
            <span>You owe {s.person(f.owedId).name}: <b>{f.what}</b></span>
            <span className="muted">Tap when you've paid it back</span>
          </button>
        ))}

        <div className="label">Recent shouts</div>
        {recent.length === 0 && <span className="muted">Nothing yet. Finish a run or a job, or log a shout.</span>}
        {recent.map((e) => (
          <div key={e.id} className="between" style={{ opacity: e.settled ? 0.5 : 1 }}>
            <span className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 14 }}>{e.what}</b>
              <span className="muted">{s.person(e.owedId).name} shouted {s.person(e.owerId).name}{e.settled ? ' · settled' : ''}</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{e.amount ? money(e.amount) : 'favour'}</span>
          </div>
        ))}

        <div className="row">
          <button className="btn ghost grow" onClick={() => nav('/new/shout')}>Log a shout</button>
          <button className="btn light grow" disabled={toSettle.length === 0} onClick={() => setSettle(true)}>Settle up</button>
        </div>
      </div>
      {settle && (
        <Sheet onClose={() => setSettle(false)}>
          <h2 style={{ fontSize: 22 }}>Settle up</h2>
          <span className="muted">Pay with cash or PayID, then mark it here.</span>
          {toSettle.map((p) => {
            const v = bal[p.id];
            return (
              <div key={p.id} className="between">
                <span>{v > 0 ? `${p.name} pays you` : `You pay ${p.name}`} <b>{money(v)}</b></span>
                <button className="btn ghost" onClick={() => { s.settleWith(p.id); toast.show('Marked as paid'); }}>Paid</button>
              </div>
            );
          })}
          <button className="btn quiet" onClick={() => setSettle(false)}>Close</button>
        </Sheet>
      )}
      {toast.node}
    </>
  );
}

export function Calendar() {
  const s = useStore();
  const nav = useNavigate();
  const [justMe, setJustMe] = useState(false);
  const items = s.cards
    .filter((c) => c.due && c.status !== 'done')
    .filter((c) => !justMe || c.forIds.includes(s.me.id) || c.createdBy === s.me.id)
    .sort((a, b) => a.due! - b.due!);
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const has = (d: Date) => items.some((c) => new Date(c.due!).toDateString() === d.toDateString());
  const label = (kind: string) => ({ run: ['Run', 'var(--accent)'], dinner: ['Dinner', 'var(--green)'], job: ['Job', 'var(--purple)'] } as Record<string, string[]>)[kind];

  return (
    <>
      <div className="screen with-tabs">
        <div className="between">
          <h1 style={{ fontSize: 26 }}>{today.toLocaleDateString('en-AU', { month: 'long' })}</h1>
          <button className="pill" disabled title="Coming soon">Add to my calendar</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {days.map((d) => {
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={d.toISOString()} className="col" style={{ alignItems: 'center', gap: 4, minHeight: 64, justifyContent: 'center', borderRadius: 16, background: isToday ? 'var(--accent)' : 'var(--surface-2)', color: isToday ? 'var(--accent-ink)' : 'var(--text)' }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{d.toLocaleDateString('en-AU', { weekday: 'narrow' })}</span>
                <b style={{ fontSize: 18 }}>{d.getDate()}</b>
                <span style={{ width: 5, height: 5, borderRadius: 3, background: has(d) ? (isToday ? 'var(--accent-ink)' : 'var(--accent)') : 'transparent' }} />
              </div>
            );
          })}
        </div>
        <div className="row">
          <button className={`pill ${!justMe ? 'on' : ''}`} onClick={() => setJustMe(false)}>Everyone</button>
          <button className={`pill ${justMe ? 'on' : ''}`} onClick={() => setJustMe(true)}>Just me</button>
        </div>
        <div className="label">Coming up</div>
        {items.length === 0 && <span className="muted">Nothing with a time yet. Runs and jobs with a deadline show up here.</span>}
        {items.map((c) => {
          const [l, color] = label(c.kind);
          const title = c.kind === 'run' ? `${c.stops.filter((x) => x.approved).map((x) => x.shop).join(' + ')} run · orders close` : c.kind === 'job' ? c.title : 'Dinner';
          return (
            <button key={c.id} className="row" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', alignItems: 'stretch' }} onClick={() => nav(`/card/${c.id}`)}>
              <span style={{ width: 56, fontSize: 13, fontWeight: 600, color: 'var(--text-2)', paddingTop: 12 }}>{clock(c.due!)}</span>
              <span className="card grow" style={{ gap: 3, padding: '10px 14px' }}>
                <span className="tag" style={{ color, fontSize: 11 }}>{l}</span>
                <b>{title}</b>
                <span className="muted">{c.createdBy === s.me.id ? 'You' : s.person(c.createdBy).name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

interface Invite {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  status: 'pending' | 'accepted';
  acceptedBy?: string;
  acceptedName?: string;
  acceptedAt?: number;
}

const shortDate = (t: number) => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

export function Me() {
  const s = useStore();
  const { userDoc } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [newGroup, setNewGroup] = useState(false);
  const [gName, setGName] = useState('');
  const [gType, setGType] = useState<GroupType>('mates');
  const [joining, setJoining] = useState(false);
  const [joinLink, setJoinLink] = useState('');

  useEffect(() => onSnapshot(s.invitesCol(), (q) => setInvites(q.docs.map((d) => ({ ...(d.data() as Invite), id: d.id }))), () => {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.group.id]);
  useEffect(() => {
    (userDoc?.groupIds ?? []).forEach((g) =>
      getDoc(doc(db, 'groups', g)).then((d) => d.exists() && setGroupNames((x) => ({ ...x, [g]: (d.data() as { name: string }).name }))).catch(() => {}),
    );
  }, [userDoc?.groupIds]);

  if (editing) return <Profile editing onDone={() => setEditing(false)} />;

  const shareLink = async (url: string, who?: string) => {
    const text = who ? `${who}, join ${s.group.name} on Shout` : `Join ${s.group.name} on Shout`;
    try {
      if (navigator.share) await navigator.share({ title: 'Shout', text, url });
      else {
        await navigator.clipboard.writeText(`${text}: ${url}`);
        toast.show('Invite link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const sendInvite = async () => {
    const name = inviteName.trim();
    const url = await s.createInvite(name);
    setInviting(false);
    setInviteName('');
    await shareLink(url, name);
  };

  const pending = invites.filter((i) => i.status === 'pending');
  const accepted = invites.filter((i) => i.status === 'accepted');

  return (
    <>
      <div className="screen with-tabs">
        <div className="between">
          <h1 style={{ fontSize: 26 }}>Me</h1>
          <button className="btn quiet" onClick={() => setEditing(true)}>Edit profile</button>
        </div>
        <div className="row">
          <Avatar person={s.me} size={64} ring="var(--accent)" />
          <div className="col" style={{ gap: 2 }}>
            <b style={{ fontSize: 18 }}>{s.me.name}</b>
            <span className="muted">{s.me.adult ? 'Adult' : 'Under 18'}</span>
          </div>
        </div>

        <div className="card">
          <div className="col" style={{ gap: 2 }}>
            <b>{s.group.name}</b>
            <span className="muted">{s.members.length} member{s.members.length === 1 ? '' : 's'} · owner {s.person(s.group.ownerId).name}</span>
          </div>
          <button className="btn primary" onClick={() => setInviting(true)}>Invite people</button>

          <div className="label" style={{ marginTop: 6 }}>In the group</div>
          {s.members.map((p) => {
            const inv = accepted.find((i) => i.acceptedBy === p.id);
            return (
              <div key={p.id} className="between">
                <div className="row">
                  <Avatar person={p} size={36} />
                  <span className="col" style={{ gap: 0 }}>
                    <span>{p.name}{p.id === s.me.id ? ' (you)' : ''}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {p.id === s.group.ownerId ? 'Owner' : inv ? `Accepted ${shortDate(inv.acceptedAt ?? inv.createdAt)}` : 'Joined'}
                    </span>
                  </span>
                </div>
                {s.isOwner && p.id !== s.me.id ? (
                  <button className={`pill ${p.adult ? '' : 'on'}`} onClick={() => s.setAdult(p.id, !p.adult)}>{p.adult ? 'Adult' : 'Under 18'}</button>
                ) : (
                  <span className="muted">{p.adult ? 'Adult' : 'Under 18'}</span>
                )}
              </div>
            );
          })}

          {pending.length > 0 && <div className="label" style={{ marginTop: 6 }}>Invited, not joined yet</div>}
          {pending.map((i) => (
            <div key={i.id} className="between">
              <div className="row">
                <span style={{ width: 36, height: 36, borderRadius: 18, border: '2px dashed #3a3a44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontWeight: 700 }}>{(i.name || '?')[0]}</span>
                <span className="col" style={{ gap: 0 }}>
                  <span>{i.name || 'Open invite'}</span>
                  <span className="muted" style={{ fontSize: 12 }}>Pending · sent {shortDate(i.createdAt)} by {i.createdBy === s.me.id ? 'you' : s.person(i.createdBy).name}</span>
                </span>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="pill" style={{ minHeight: 34, fontSize: 13 }} onClick={() => shareLink(s.inviteLink(i.id), i.name)}>Resend</button>
                <button className="pill" style={{ minHeight: 34, fontSize: 13 }} aria-label={`Cancel invite for ${i.name}`} onClick={() => s.cancelInvite(i.id)}>Cancel</button>
              </div>
            </div>
          ))}
          {s.isOwner && <span className="muted">As the owner, you can change who counts as under 18.</span>}
        </div>

        <div className="card">
          <div className="label">Your groups</div>
          {(userDoc?.groupIds ?? []).map((g) => (
            <button key={g} className="between" onClick={() => g !== s.group.id && switchGroup(g)} style={{ background: 'none', border: 'none', padding: '6px 0', textAlign: 'left' }}>
              <span style={{ fontWeight: g === s.group.id ? 700 : 400 }}>{g === s.group.id ? s.group.name : userDoc?.groupNames?.[g] ?? groupNames[g] ?? 'Group'}</span>
              <span className="muted">{g === s.group.id ? 'Open now' : 'Switch'}</span>
            </button>
          ))}
          <div className="row">
            <button className="btn ghost grow" onClick={() => setNewGroup(true)}>New group</button>
            <button className="btn ghost grow" onClick={() => setJoining(true)}>Join with a link</button>
          </div>
          <span className="muted">Make separate groups for family, your share house or mates. Each has its own chats and balances.</span>
        </div>

        <button className="btn ghost" onClick={logOut}>Sign out</button>
      </div>

      {inviting && (
        <Sheet onClose={() => setInviting(false)}>
          <h2 style={{ fontSize: 22 }}>Who are you inviting?</h2>
          <input className="input" autoFocus placeholder="Their name, e.g. Katrina" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
          <span className="muted">Each person gets their own link, so you can see who has joined and who hasn't.</span>
          <button className="btn big primary" disabled={!inviteName.trim()} onClick={sendInvite}>Send invite</button>
        </Sheet>
      )}

      {newGroup && (
        <Sheet onClose={() => setNewGroup(false)}>
          <h2 style={{ fontSize: 22 }}>New group</h2>
          <div className="row">
            {(['family', 'house', 'mates'] as GroupType[]).map((k) => (
              <button key={k} className={`pill grow ${gType === k ? 'on' : ''}`} onClick={() => setGType(k)}>{k === 'family' ? 'Family' : k === 'house' ? 'House' : 'Mates'}</button>
            ))}
          </div>
          <input className="input" placeholder={gType === 'house' ? 'e.g. 12 Smith St' : gType === 'mates' ? 'e.g. Saturday crew' : 'e.g. The Clouts'} value={gName} onChange={(e) => setGName(e.target.value)} />
          <button className="btn big primary" disabled={!gName.trim()} onClick={async () => {
            await createGroup(gName.trim(), gType);
            setNewGroup(false);
            setGName('');
            toast.show('Group created. Invite people from here.');
          }}>Create group</button>
        </Sheet>
      )}

      {joining && (
        <Sheet onClose={() => setJoining(false)}>
          <h2 style={{ fontSize: 22 }}>Join a group</h2>
          <input className="input" placeholder="Paste the invite link" value={joinLink} onChange={(e) => setJoinLink(e.target.value)} />
          <button className="btn big primary" disabled={!joinLink.trim()} onClick={async () => {
            const ref = joinLink.trim().split('#/join/').pop()?.replace(/[^A-Za-z0-9/]/g, '') ?? '';
            const r = await joinGroup(ref).catch(() => 'missing' as const);
            if (r === 'missing') toast.show('Couldn\u2019t find that group');
            else {
              setJoining(false);
              setJoinLink('');
              toast.show(r === 'already' ? 'You\u2019re already in that group' : 'Joined');
            }
          }}>Join</button>
        </Sheet>
      )}
      {toast.node}
    </>
  );
}
