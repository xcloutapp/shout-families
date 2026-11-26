import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BOTTLE_SHOP, SHOPS } from '../seed';
import { useStore } from '../store';
import { Icon, PeoplePicker, Sheet, TopBar } from '../ui';

export function NewSheet() {
  const nav = useNavigate();
  const s = useStore();
  const go = (path: string) => nav(path, { replace: true });
  const tile = (bg: string, fg: string, sub: string) => ({ background: bg, color: fg, sub });
  const tiles = [
    { name: 'Run', icon: 'bag', path: '/new/run', desc: "I'm going to…", ...tile('var(--accent)', 'var(--accent-ink)', 'var(--accent-ink)') },
    { name: 'Dinner', icon: 'bowl', path: '/new/dinner', desc: "Who's home? What to eat?", ...tile('#1f2a25', 'var(--text)', '#b9c9c1') },
    { name: 'Job', icon: 'job', path: '/new/job', desc: 'Washing, bins, kitchen', ...tile('#24213a', 'var(--text)', '#c3bde0') },
    { name: 'Shout', icon: 'shout', path: '/new/shout', desc: 'Log a favour or money', ...tile('var(--surface)', 'var(--text)', 'var(--text-2)') },
  ];
  return (
    <Sheet onClose={() => nav(-1)}>
      <div>
        <h2 style={{ fontSize: 24 }}>What do you need?</h2>
        <div className="muted">Posts to {s.group.name}</div>
      </div>
      <div className="tile-grid">
        {tiles.map((t) => (
          <button key={t.name} className="tile" style={{ background: t.background, color: t.color }} onClick={() => go(t.path)}>
            <Icon name={t.icon} size={28} />
            <span>
              <b>{t.name}</b>
              <small style={{ color: t.sub }}>{t.desc}</small>
            </span>
          </button>
        ))}
        {['Lift', 'Reminder'].map((n) => (
          <div key={n} className="tile" style={{ background: '#141418', border: '1px dashed var(--line-2)', color: '#8a8a95' }}>
            <span className="tag" style={{ color: '#ffb38a', alignSelf: 'flex-end' }}>Plus · soon</span>
            <span>
              <b style={{ color: 'var(--text-2)' }}>{n}</b>
              <small>{n === 'Lift' ? 'Pick-ups with live ETA' : 'Post office at 3pm'}</small>
            </span>
          </div>
        ))}
      </div>
      <button className="btn ghost" onClick={() => nav(-1)}>Cancel</button>
    </Sheet>
  );
}

function useOthers() {
  const s = useStore();
  const others = s.members.filter((p) => p.id !== s.me.id);
  const [sel, setSel] = useState(others.map((p) => p.id));
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return { others, sel, toggle };
}

export function StartRun() {
  const s = useStore();
  const nav = useNavigate();
  const { others, sel, toggle } = useOthers();
  const [shop, setShop] = useState('GYG');
  const [other, setOther] = useState('');
  const [mins, setMins] = useState(20);
  const shops = SHOPS.filter((x) => x !== BOTTLE_SHOP || s.me.adult);
  const isBottle = shop === BOTTLE_SHOP;
  // Under-18s never see a bottle shop run.
  const visible = others.filter((p) => !isBottle || p.adult);
  const to = sel.filter((id) => visible.some((p) => p.id === id));
  const shopName = shop === 'Other' ? other.trim() : shop;
  const closes = new Date(Date.now() + mins * 60000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

  const send = () => {
    const id = s.startRun(shopName, [s.me.id, ...to], Date.now() + mins * 60000);
    nav(`/card/${id}`, { replace: true });
  };

  return (
    <div className="screen">
      <TopBar tag="New run" />
      <h1 style={{ fontSize: 34 }}>I'm going to…</h1>
      <div className="shop-grid">
        {shops.map((x) => (
          <button key={x} className={`shop ${shop === x ? 'on' : ''}`} onClick={() => setShop(x)}>{x}</button>
        ))}
      </div>
      {shop === 'Other' && <input className="input" placeholder="Which shop?" value={other} onChange={(e) => setOther(e.target.value)} autoFocus />}

      <div className="col">
        <b>Who should know?</b>
        <PeoplePicker people={visible} selected={to} onToggle={toggle} />
        {isBottle && <span className="muted">Under-18s aren't shown bottle shop runs.</span>}
      </div>

      <div className="col">
        <b>Leaving in</b>
        <div className="row">
          {[10, 20, 30].map((m) => (
            <button key={m} className={`pill grow ${mins === m ? 'on' : ''}`} style={{ minHeight: 48, borderRadius: 14 }} onClick={() => setMins(m)}>{m} min</button>
          ))}
        </div>
        <span className="muted">Orders close at {closes}. Anyone who hasn't answered gets a nudge 10 minutes before.</span>
      </div>

      <div className="grow" />
      <button className="btn big primary" disabled={!shopName || to.length === 0} onClick={send}>
        Send to {to.length} {to.length === 1 ? 'person' : 'people'} <Icon name="arrow" size={20} stroke={2.5} />
      </button>
    </div>
  );
}

export function StartDinner() {
  const s = useStore();
  const nav = useNavigate();
  const { others, sel, toggle } = useOthers();
  const [opts, setOpts] = useState(['', '', '']);
  const send = () => {
    const id = s.startDinner([s.me.id, ...sel], opts.map((o) => o.trim()));
    nav(`/card/${id}`, { replace: true });
  };
  return (
    <div className="screen">
      <TopBar tag="Dinner" tagColor="var(--green)" />
      <h1 style={{ fontSize: 30 }}>Who's home tonight?</h1>
      <div className="col">
        <b>Ask</b>
        <PeoplePicker people={others} selected={sel} onToggle={toggle} />
      </div>
      <div className="col">
        <b>Ideas for dinner <span className="muted">(optional)</span></b>
        {opts.map((o, i) => (
          <input key={i} className="input" placeholder={['Pasta and sausages', 'GYG', 'Butter chicken'][i]} value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
        ))}
      </div>
      <div className="grow" />
      <button className="btn big green" disabled={sel.length === 0} onClick={send}>Ask {sel.length} {sel.length === 1 ? 'person' : 'people'}</button>
    </div>
  );
}

export function StartJob() {
  const s = useStore();
  const nav = useNavigate();
  const { others, sel, toggle } = useOthers();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<number | null>(null);
  const send = () => {
    s.startJob(title.trim(), sel, due ? Date.now() + due * 60000 : undefined);
    nav('/', { replace: true });
  };
  return (
    <div className="screen">
      <TopBar tag="New job" tagColor="var(--purple)" />
      <h1 style={{ fontSize: 30 }}>What needs doing?</h1>
      <input className="input" placeholder="Bring the washing in" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {['Bring the washing in', 'Hang the washing out', 'Bins out', 'Unload the dishwasher'].map((t) => (
          <button key={t} className="pill" onClick={() => setTitle(t)}>{t}</button>
        ))}
      </div>
      <div className="col">
        <b>Who can do it?</b>
        <PeoplePicker people={others} selected={sel} onToggle={toggle} />
        <span className="muted">Pick one person to assign it, or several and whoever's free claims it.</span>
      </div>
      <div className="col">
        <b>By when?</b>
        <div className="row">
          {[null, 30, 60, 180].map((m) => (
            <button key={String(m)} className={`pill grow ${due === m ? 'on' : ''}`} onClick={() => setDue(m)}>{m === null ? 'Any time' : m < 60 ? `${m} min` : `${m / 60} hr`}</button>
          ))}
        </div>
      </div>
      <div className="grow" />
      <button className="btn big primary" disabled={!title.trim() || sel.length === 0} onClick={send}>Post job</button>
    </div>
  );
}

export function LogShout() {
  const s = useStore();
  const nav = useNavigate();
  const others = s.members.filter((p) => p.id !== s.me.id);
  const [who, setWho] = useState(others[0]?.id ?? '');
  const [dir, setDir] = useState<'they' | 'i'>('i');
  const [what, setWhat] = useState('');
  const [amount, setAmount] = useState('');
  const amt = parseFloat(amount);
  const minorMoney = !Number.isNaN(amt) && amt > 0 && (!s.me.adult || !s.person(who)?.adult);
  const save = () => {
    const [ower, owed] = dir === 'i' ? [who, s.me.id] : [s.me.id, who];
    s.logShout(ower, owed, what.trim(), Number.isNaN(amt) || amt <= 0 ? undefined : amt);
    nav('/balances', { replace: true });
  };
  return (
    <div className="screen">
      <TopBar tag="Log a shout" tagColor="var(--yellow)" />
      <div className="row">
        <button className={`pill grow ${dir === 'i' ? 'on' : ''}`} onClick={() => setDir('i')}>I shouted…</button>
        <button className={`pill grow ${dir === 'they' ? 'on' : ''}`} onClick={() => setDir('they')}>…shouted me</button>
      </div>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        {others.map((p) => (
          <button key={p.id} className={`pill ${who === p.id ? 'on' : ''}`} onClick={() => setWho(p.id)}>{p.name}</button>
        ))}
      </div>
      <input className="input" placeholder="A lift to the station, a beer, helped me move…" value={what} onChange={(e) => setWhat(e.target.value)} />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {['A lift', 'A coffee', 'Lunch', 'Helped me move'].map((t) => (
          <button key={t} className="pill" onClick={() => setWhat(t)}>{t}</button>
        ))}
      </div>
      <input className="input" inputMode="decimal" placeholder="Amount (leave blank for a favour)" value={amount} onChange={(e) => setAmount(e.target.value)} />
      {minorMoney && <span className="muted">Under-18s only have balances. Settle up outside the app.</span>}
      <div className="grow" />
      <button className="btn big primary" disabled={!what.trim() || !who} onClick={save}>Log it</button>
    </div>
  );
}
