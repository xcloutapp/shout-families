import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FAST_FOOD } from '../seed';
import { clock, useStore } from '../store';
import type { DinnerCard, JobCard } from '../types';
import { Avatar, TopBar, useToast } from '../ui';
import { AddOrder, BuyerList } from './RunScreens';

export default function CardScreen() {
  const { id } = useParams();
  const s = useStore();
  const nav = useNavigate();
  const c = s.cards.find((x) => x.id === id);
  if (!c) {
    return (
      <div className="screen">
        <TopBar />
        <b>That card's gone.</b>
        <button className="btn ghost" onClick={() => nav('/')}>Back to chats</button>
      </div>
    );
  }
  if (c.kind === 'run') return c.createdBy === s.me.id ? <BuyerList card={c} /> : <AddOrder card={c} />;
  if (c.kind === 'dinner') return <Dinner card={c} />;
  return <Job card={c} />;
}

function Dinner({ card: c }: { card: DinnerCard }) {
  const s = useStore();
  const nav = useNavigate();
  const [idea, setIdea] = useState('');
  const total = c.options.reduce((a, o) => a + o.votes.length, 0) || 1;
  const top = [...c.options].sort((a, b) => b.votes.length - a.votes.length)[0];
  const myVote = c.options.find((o) => o.votes.includes(s.me.id))?.label;
  const people = c.forIds.map(s.person);
  const takeaway = top && top.votes.length > 0 && FAST_FOOD.find((f) => top.label.toLowerCase().includes(f.toLowerCase()));

  return (
    <div className="screen">
      <TopBar tag={`Dinner · asked by ${c.createdBy === s.me.id ? 'you' : s.person(c.createdBy).name}`} tagColor="var(--green)" />
      <h1 style={{ fontSize: 30 }}>Who's home tonight?</h1>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {people.map((p) => {
          const a = c.home[p.id];
          const color = a === 'yes' ? 'var(--green)' : a === 'no' ? '#8a8a95' : 'var(--yellow)';
          return (
            <div key={p.id} className="col" style={{ alignItems: 'center', gap: 4, width: 62 }}>
              <Avatar person={p} ring={a === 'no' ? undefined : a === 'yes' ? 'var(--green)' : 'dashed'} dim={a === 'no'} />
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.id === s.me.id ? 'You' : p.name}</span>
              <span className="tag" style={{ fontSize: 11, color }}>{a === 'yes' ? 'Home' : a === 'no' ? 'Out' : 'Waiting'}</span>
            </div>
          );
        })}
      </div>
      <div className="row">
        <button className={`btn big grow ${c.home[s.me.id] === 'yes' ? 'green' : 'ghost'}`} onClick={() => s.answerHome(c.id, 'yes')}>I'm home</button>
        <button className={`btn big grow ${c.home[s.me.id] === 'no' ? 'light' : 'ghost'}`} onClick={() => s.answerHome(c.id, 'no')}>Not tonight</button>
      </div>

      <div style={{ height: 1, background: '#1f1f26' }} />
      <b style={{ fontSize: 17 }}>What should we have?</b>
      {c.options.map((o) => (
        <button key={o.label} className={`vote ${myVote === o.label ? 'on' : ''}`} onClick={() => s.vote(c.id, o.label)}>
          <span className="fill" style={{ width: `${(o.votes.length / total) * 100}%` }} />
          <b>{o.label}</b>
          <span className="muted">{o.votes.length} vote{o.votes.length === 1 ? '' : 's'}</span>
        </button>
      ))}
      <div className="row">
        <input className="input" placeholder="Suggest something" value={idea} onChange={(e) => setIdea(e.target.value)} />
        <button className="btn ghost" disabled={!idea.trim()} onClick={() => { s.addOption(c.id, idea.trim()); setIdea(''); }}>Add</button>
      </div>

      <div className="grow" />
      {takeaway && (
        <button className="btn big primary" onClick={() => {
          const home = c.forIds.filter((id) => c.home[id] !== 'no');
          s.startRun(takeaway, home.includes(s.me.id) ? home : [s.me.id, ...home], Date.now() + 20 * 60000, c.chatId);
          s.doneCard(c.id, false);
          nav(c.chatId ? `/chat/${c.chatId}` : '/', { replace: true });
        }}>{takeaway} is winning · make it a run</button>
      )}
      {c.createdBy === s.me.id && <button className="btn quiet" onClick={() => { s.doneCard(c.id, false); nav(-1); }}>Close this card</button>}
    </div>
  );
}

function Job({ card: c }: { card: JobCard }) {
  const s = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const by = s.person(c.createdBy);
  const claimer = c.claimedBy ? s.person(c.claimedBy) : null;
  const mineToDo = c.forIds.includes(s.me.id);

  return (
    <div className="screen">
      <TopBar tag="Job" tagColor="var(--purple)" />
      <h1 style={{ fontSize: 30 }}>{c.title}</h1>
      <div className="muted">
        Asked by {by.id === s.me.id ? 'you' : by.name}
        {c.due ? ` · by ${clock(c.due)}` : ''} · for {c.forIds.map((id) => (id === s.me.id ? 'you' : s.person(id).name)).join(', ')}
      </div>
      <div className="card">
        {claimer ? (
          <div className="row">
            <Avatar person={claimer} size={40} ring="var(--purple)" />
            <b>{claimer.id === s.me.id ? "You've got it" : `${claimer.name}'s on it`}</b>
          </div>
        ) : (
          <span className="muted">Nobody's claimed this yet.</span>
        )}
      </div>
      {c.claimedBy === s.me.id && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {['On it', '5 mins', 'After dinner'].map((r) => (
            <button key={r} className="pill" onClick={() => toast.show(`Sent "${r}" to ${by.name}`)}>{r}</button>
          ))}
        </div>
      )}
      <div className="grow" />
      {!c.claimedBy && mineToDo && <button className="btn big primary" onClick={() => s.claim(c.id)}>I've got it</button>}
      {c.claimedBy === s.me.id && (
        <>
          <button className="btn big green" onClick={() => { s.doneCard(c.id, true); toast.show('Done. Logged as a shout'); setTimeout(() => nav(-1), 700); }}>Done</button>
          <button className="btn quiet" onClick={() => s.unclaim(c.id)}>Actually, I can't</button>
        </>
      )}
      {c.createdBy === s.me.id && <button className="btn quiet" onClick={() => { s.deleteCard(c.id); nav(-1); }}>Delete job</button>}
      {toast.node}
    </div>
  );
}
